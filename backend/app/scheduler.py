import time
from typing import Set
from flask import current_app
import os
try:
    import redis as _redis
    _redis_client = _redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
except Exception:
    _redis_client = None
from .extensions import socketio
from .models import Session, SessionStatus, Scenario, CohortMember, Forecast, Result, PlayerProgress, PlayerProgressStatus
from .extensions import db
from .utils import log_activity
from .engine import run_round, compute_zone_flows
from .models import PlayerProgress, Campaign


_running: Set[int] = set()


def _force_nav(cohort_id: int, url: str):
    if not _redis_client or not cohort_id or not url:
        return
    try:
        key = f"cohort:{cohort_id}:force_nav"
        _redis_client.setex(key, 300, url)
    except Exception:
        pass


def _auto_submit_missing(session_id: int, round_num: int, hours_per_round: int):
    players = db.session.query(CohortMember.user_id).filter_by(cohort_id=db.session.query(Session.cohort_id).filter_by(id=session_id).scalar()).all()
    player_ids = [uid for (uid,) in players]
    for pid in player_ids:
        exists = Forecast.query.filter_by(session_id=session_id, player_id=pid, round_num=round_num).first()
        if not exists:
            # Copy auto_bid settings from most recent previous forecast for this player
            prev = Forecast.query.filter_by(session_id=session_id, player_id=pid).order_by(Forecast.round_num.desc()).first()
            prev_devices = (prev.data or {}).get('devices', []) if prev else []
            devices_with_auto_bid = [
                {'device_id': d['device_id'], 'hours': [0.0] * hours_per_round, 'auto_bid': d['auto_bid']}
                for d in prev_devices
                if isinstance(d, dict) and isinstance(d.get('auto_bid'), dict) and d['auto_bid'].get('enabled')
            ]
            forecast_data = {"hours": [0.0] * hours_per_round}
            if devices_with_auto_bid:
                forecast_data["devices"] = devices_with_auto_bid
            f = Forecast(
                session_id=session_id,
                player_id=pid,
                round_num=round_num,
                data=forecast_data,
                bids=None,
            )
            db.session.add(f)
            socketio.emit("player_submit", {"session_id": session_id, "player_id": pid}, namespace="/trainer")
    db.session.commit()


def run_rounds(session_id: int, app=None):
    """
    Run rounds for a session. 
    If app is None, tries to get current_app (only works in request context).
    For background tasks, caller must pass the app instance.
    """
    if session_id in _running:
        return
    _running.add(session_id)
    
    if app is None:
        from flask import current_app
        app = current_app._get_current_object()
    
    try:
        with app.app_context():
            s: Session = Session.query.get(session_id)
            if not s:
                return
            sc: Scenario = Scenario.query.get(s.scenario_id)
            cfg = sc.config or {}
            rounds = int(cfg.get("general", {}).get("rounds", 4))
            hours_span = int(cfg.get("general", {}).get("round_span_hours", 6))
            timer_sec = int(cfg.get("general", {}).get("round_duration_seconds", 300))

            current = s.current_round or 1
            
            # Briefing phase (only before first round and if not already started)
            if current == 1 and s.status == SessionStatus.briefing:
                # Session is in briefing, waiting for manual start
                # Don't change status, just emit event and wait
                socketio.emit("briefing", {"session_id": s.id}, namespace="/trainer")
                socketio.emit("briefing", {"session_id": s.id}, namespace="/game", to=f"session-{s.id}")
                if s.mode == "shared_market":
                    _force_nav(s.cohort_id, f"/briefing/{s.id}")
                # Wait for player/trainer to start Round 1 (manual trigger via /start or /start-briefing endpoint)
                # In solo mode: player clicks "Start Scenario"
                # In shared mode: trainer clicks "Start Round 1"
                # This function will be re-called when started
                return
            
            while current <= rounds:
                # Round active phase
                s.status = SessionStatus.round_active
                db.session.add(s)
                db.session.commit()
                if s.mode == "shared_market":
                    _force_nav(s.cohort_id, f"/player?sessionId={s.id}")
                
                socketio.emit("round_start", {"session_id": s.id, "round": current}, namespace="/trainer")
                socketio.emit("round_start", {"session_id": s.id, "round": current}, namespace="/game", to=f"session-{s.id}")

                # Clear stale timer extensions from prior rounds
                if _redis_client is not None:
                    try:
                        _redis_client.delete(f"session:{s.id}:timer_extend_sec")
                        _redis_client.delete(f"session:{s.id}:force_end_round")
                    except Exception:
                        pass
                
                # countdown
                remaining = timer_sec
                while remaining > 0:
                    time.sleep(1)
                    # pause handling
                    s = Session.query.get(s.id)
                    if s and s.status in [
                        SessionStatus.round_closing,
                        SessionStatus.calculating,
                        SessionStatus.round_results,
                        SessionStatus.scenario_complete,
                        SessionStatus.ended,
                    ]:
                        remaining = 0
                        break
                    if s and s.status == SessionStatus.paused:
                        continue
                    # Check for frozen state (trainer freeze)
                    if s and s.frozen:
                        # Don't count down timer while frozen
                        continue

                    # Trainer-triggered early round end
                    if _redis_client is not None:
                        try:
                            force_key = f"session:{s.id}:force_end_round"
                            if _redis_client.get(force_key):
                                _redis_client.delete(force_key)
                                remaining = 0
                        except Exception:
                            pass

                    # Apply trainer time extension (+seconds) if requested
                    if _redis_client is not None:
                        try:
                            ext_key = f"session:{s.id}:timer_extend_sec"
                            raw_ext = _redis_client.get(ext_key)
                            ext = int(raw_ext) if raw_ext is not None else 0
                            if ext > 0:
                                remaining += ext
                                _redis_client.delete(ext_key)
                                socketio.emit(
                                    "timer_extended",
                                    {"session_id": s.id, "seconds": ext, "remaining": remaining},
                                    namespace="/trainer"
                                )
                                socketio.emit(
                                    "timer_extended",
                                    {"session_id": s.id, "seconds": ext, "remaining": remaining},
                                    namespace="/game",
                                    to=f"session-{s.id}"
                                )
                        except Exception:
                            pass

                    remaining -= 1
                    
                    # In solo mode, check if player has submitted and skip remaining time
                    if s and s.mode == 'isolated_per_player':
                        players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=s.cohort_id).all()]
                        if players:
                            player_id = players[0]  # Solo mode has only 1 player
                            forecast = Forecast.query.filter_by(session_id=s.id, player_id=player_id, round_num=current).first()
                            if forecast:
                                # Player has submitted, skip to end of round
                                remaining = 0
                    
                    socketio.emit("tick", {"session_id": s.id, "remaining": remaining}, namespace="/trainer")
                    socketio.emit("tick", {"session_id": s.id, "remaining": remaining}, namespace="/game", to=f"session-{s.id}")
                
                # Round closing phase - wait for all submits
                s.status = SessionStatus.round_closing
                db.session.add(s)
                db.session.commit()
                if s.mode == "shared_market":
                    _force_nav(s.cohort_id, f"/player?sessionId={s.id}")
                socketio.emit("round_closing", {"session_id": s.id, "round": current}, namespace="/trainer")
                socketio.emit("round_closing", {"session_id": s.id, "round": current}, namespace="/game", to=f"session-{s.id}")
                
                # auto-submit for missing players
                _auto_submit_missing(s.id, current, hours_span)
                
                # Wait briefly for any last-second submits (grace period)
                time.sleep(2)
                
                # Calculating phase
                s.status = SessionStatus.calculating
                db.session.add(s)
                db.session.commit()
                if s.mode == "shared_market":
                    _force_nav(s.cohort_id, f"/player?sessionId={s.id}")
                socketio.emit("calculating", {"session_id": s.id, "round": current}, namespace="/trainer")
                socketio.emit("calculating", {"session_id": s.id, "round": current}, namespace="/game", to=f"session-{s.id}")
                
                # collect forecasts per player (full horizon if exists + this round slice fallback)
                # Support both legacy (quantity-only) and new (multi-bid) formats
                players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=s.cohort_id).all()]
                print(f"[SCHEDULER] Session {s.id} Round {current}: {len(players)} players")
                forecasts = {}
                for pid in players:
                    full = Forecast.query.filter_by(session_id=s.id, player_id=pid, round_num=0).first()
                    # Get bids from current round (not from full forecast)
                    current_round_forecast = Forecast.query.filter_by(session_id=s.id, player_id=pid, round_num=current).first()
                    current_bids = current_round_forecast.bids if current_round_forecast and current_round_forecast.bids else None
                    current_devices = (current_round_forecast.data or {}).get("devices", []) if current_round_forecast else []
                    print(f"[SCHEDULER] Player {pid}: has_full={full is not None}, has_current={current_round_forecast is not None}, has_bids={current_bids is not None}")
                    
                    if full and isinstance(full.data, dict):
                        forecast_data = {
                            'hours': list(full.data.get("hours", [])),
                            'bids': current_bids,  # Use bids from current round, not from full forecast
                            'devices': current_devices
                        }
                        forecasts[pid] = forecast_data
                        print(f"[SCHEDULER] Player {pid}: loaded forecast with bids={current_bids is not None}")
                    else:
                        # Build full horizon from all round-specific forecasts
                        total_hours = rounds * hours_span
                        full_horizon = [0.0] * total_hours
                        all_forecasts = (
                            Forecast.query.filter_by(session_id=s.id, player_id=pid)
                            .filter(Forecast.round_num > 0)
                            .order_by(Forecast.round_num)
                            .all()
                        )
                        for fc in all_forecasts:
                            fc_hours = (fc.data or {}).get("hours", [])
                            start_idx = (fc.round_num - 1) * hours_span
                            for i, val in enumerate(fc_hours):
                                if start_idx + i < total_hours:
                                    full_horizon[start_idx + i] = val
                        forecasts[pid] = {'hours': full_horizon, 'bids': current_bids, 'devices': current_devices}  # Use bids from current round
                        print(f"[SCHEDULER] Player {pid}: built horizon from round forecasts, bids={current_bids is not None}")
                # DA snapshot (round_num = -1): set on first round if not present, else use for IDM delta
                if current == 1:
                    for pid in players:
                        snap = Forecast.query.filter_by(session_id=s.id, player_id=pid, round_num=-1).first()
                        if not snap:
                            forecast_entry = forecasts.get(pid, {})
                            snap = Forecast(
                                session_id=s.id,
                                player_id=pid,
                                round_num=-1,
                                data={"hours": list(forecast_entry.get('hours', []))},
                                bids=forecast_entry.get('bids')
                            )
                            db.session.add(snap)
                    db.session.commit()
                else:
                    # apply IDM delta for current window vs DA snapshot
                    for pid in players:
                        snap = Forecast.query.filter_by(session_id=s.id, player_id=pid, round_num=-1).first()
                        if snap and snap.data and snap.data.get("hours"):
                            da_hours = snap.data.get("hours")
                            start = (current-1)*hours_span
                            end = start + hours_span
                            cur_entry = forecasts.get(pid)
                            if not cur_entry:
                                cur_entry = {'hours': [0.0] * len(da_hours), 'bids': None}
                            cur_hours = cur_entry.get('hours', [])
                            window = [
                                (cur_hours[i] if i < len(cur_hours) else 0.0)
                                - (da_hours[i] if i < len(da_hours) else 0.0)
                                for i in range(start, end)
                            ]
                            merged = list(cur_hours)
                            for off, i in enumerate(range(start, end)):
                                if i < len(merged):
                                    merged[i] = window[off]
                            cur_entry['hours'] = merged
                            forecasts[pid] = cur_entry
                # Determine campaign seed if available (derive from player progress entries for this scenario)
                camp_seed = None
                try:
                    # collect distinct campaign_ids across players for this scenario
                    camp_ids = set(
                        cid for (cid,) in db.session.query(PlayerProgress.campaign_id)
                        .filter(PlayerProgress.scenario_id == s.scenario_id, PlayerProgress.user_id.in_(players))
                        .distinct().all()
                    )
                    if len(camp_ids) == 1:
                        camp = Campaign.query.get(next(iter(camp_ids)))
                        if camp and camp.seed:
                            camp_seed = str(camp.seed)
                except Exception:
                    camp_seed = None
                # run engine for this round
                sc = Scenario.query.get(s.scenario_id)
                res = run_round(s.id, current, players, forecasts, sc.config or {}, mode=s.mode or "isolated_per_player", seed=camp_seed)
                
                # Emit active events for this round
                try:
                    events = (sc.config or {}).get("events", [])
                    active_events = []
                    for idx, evt in enumerate(events):
                        trigger_type = evt.get("trigger_type", "round")
                        trigger_value = evt.get("trigger_value", 1)
                        duration = evt.get("duration_rounds", 1)
                        
                        # Check if event is active in this round
                        is_active = False
                        if trigger_type == "round":
                            start = int(trigger_value)
                            end = start + int(duration) - 1
                            if start <= current <= end:
                                is_active = True
                        elif trigger_type == "prob":
                            # Use same deterministic logic as engine.py
                            import hashlib
                            key = evt.get("key") or evt.get("name") or f"event_{idx}"
                            h = int(hashlib.sha256(f"event_prob_{current}_{key}".encode()).hexdigest(), 16)
                            r = (h % 1000000) / 1000000.0
                            p = float(trigger_value)
                            if r < max(0.0, min(1.0, p)):
                                is_active = True
                        
                        if is_active:
                            active_events.append({
                                "id": evt.get("id") or evt.get("key") or evt.get("name") or f"evt-{idx}",
                                "type": evt.get("type", "systemic"),
                                "name": evt.get("name", "Event"),
                                "description": evt.get("description", ""),
                                "multiplier": evt.get("multiplier", 1.0),
                                "additive": evt.get("additive", 0),
                                "duration_rounds": duration,
                                "target": evt.get("target", "all"),
                                "target_id": evt.get("target_id", ""),
                                "round": current
                            })
                    
                    # Broadcast active events to players
                    for event in active_events:
                        socketio.emit("event_triggered", {**event, "session_id": s.id}, namespace="/game", to=f"session-{s.id}")
                        socketio.emit("event_triggered", event, namespace="/game", to=f"session-{s.id}")
                except Exception as e:
                    current_app.logger.warning(f"Failed to emit events: {e}")
                
                # persist per-player results (canonical DAM/IDM contract)
                engine_bid_dispatch = res.get("bid_dispatch", {}) or {}
                engine_dam_bid_dispatch = res.get("dam_bid_dispatch", {}) or {}
                hourly_results = res.get("hourly_results", []) or []
                device_hourly_details = res.get("device_hourly_details", {}) or {}
                dam_hourly_results = res.get("dam_hourly_results", []) or []
                dam_device_hourly_details = res.get("dam_device_hourly_details", {}) or {}
                print(f"[SCHEDULER] Got bid_dispatch from engine: {type(engine_bid_dispatch)}, empty={not engine_bid_dispatch}, keys={list(engine_bid_dispatch.keys()) if engine_bid_dispatch else 'N/A'}")
                print(f"[SCHEDULER] Got dam_bid_dispatch from engine: {type(engine_dam_bid_dispatch)}, empty={not engine_dam_bid_dispatch}, keys={list(engine_dam_bid_dispatch.keys()) if engine_dam_bid_dispatch else 'N/A'}")
                
                # Evaluate challenges per player
                challenges = (sc.config or {}).get("challenges", [])
                player_types_cfg = (sc.config or {}).get("player_types", [])
                devices_cfg = (sc.config or {}).get("devices", [])
                
                def _device_capacity_mw(dev: dict) -> float:
                    for key in ["max_power_mw", "capacity_mw", "power_mw", "peak_load_mw", "baseline_load_mw", "capacity"]:
                        val = dev.get(key)
                        if val is not None:
                            try:
                                return float(val)
                            except Exception:
                                return 0.0
                    return 0.0

                def _device_role(dev: dict) -> str:
                    dtype = (dev.get("type") or "").lower()
                    category = (dev.get("category") or "").lower()
                    if not category:
                        if dtype in ["coal", "gas", "hydro", "nuclear", "solar", "wind", "pv"]:
                            category = "generator"
                        elif "load" in dtype:
                            category = "load"
                    if category in ["generator", "renewable"]:
                        return "producer"
                    if category == "load":
                        return "consumer"
                    return "unknown"

                for pid, kp in (res.get("round_kpis") or {}).items():
                    # Determine player role based on their player type devices
                    player_role = 'unknown'
                    try:
                        # Find player's selected type
                        from .models import SessionPlayerType
                        spt = SessionPlayerType.query.filter_by(session_id=s.id, user_id=pid).first()
                        if spt and spt.type_id:
                            # Find player type config
                            pt_cfg = next((pt for pt in player_types_cfg if pt.get("id") == spt.type_id), None)
                            if pt_cfg:
                                # Get devices for this player type
                                device_ids = pt_cfg.get("devices", [])
                                player_devices = [d for d in devices_cfg if d.get("id") in device_ids]
                                from .engine import detect_player_role
                                player_role = detect_player_role(player_devices)
                    except Exception as e:
                        print(f"[SCHEDULER] Failed to detect role for player {pid}: {e}")
                    
                    # Get all previous round results for cumulative metrics
                    previous_results = Result.query.filter_by(
                        session_id=s.id, 
                        player_id=pid
                    ).filter(Result.round_num < current).all()
                    
                    all_round_kpis = [r.data.get("kpis", {}) for r in previous_results if r.data]
                    all_round_kpis.append(kp)  # Include current round
                    
                    # Compute capacity scaling for shared_market
                    capacity_scale = 1.0
                    if s.mode == "shared_market" and player_role in ["producer", "consumer"]:
                        try:
                            total_role_capacity = sum(
                                _device_capacity_mw(d) for d in devices_cfg if _device_role(d) == player_role
                            )
                            player_capacity = sum(_device_capacity_mw(d) for d in player_devices)
                            if total_role_capacity > 0:
                                capacity_scale = max(0.0, min(1.0, player_capacity / total_role_capacity))
                        except Exception as e:
                            print(f"[SCHEDULER] Capacity scale calc failed for player {pid}: {e}")

                    # Evaluate challenges
                    challenge_result = None
                    if challenges and player_role in ['producer', 'consumer']:
                        from .engine import evaluate_challenges
                        challenge_result = evaluate_challenges(
                            challenges=challenges,
                            player_kpis=kp,
                            role=player_role,
                            round_num=current,
                            all_round_kpis=all_round_kpis,
                            capacity_scale=capacity_scale
                        )
                    
                    data = {
                        "kpis": kp,
                        "smp": res.get("smp", 0),
                        "volume": res.get("volume", 0),
                        "hourly_results": hourly_results,
                        "device_hourly_details": device_hourly_details,
                        "challenge_result": challenge_result,
                        "player_role": player_role,
                        "zone_results": res.get("zone_results", []),
                        "link_results": res.get("link_results", []),
                        "player_zone_info_by_player": res.get("player_zone_info_by_player", {}),
                    }

                    # Pass through round-level metadata from engine
                    passthrough_keys = [
                        "idp",
                        "id_trade_count",
                        "id_volume_mwh",
                        "da_baseline_metadata",
                        "hour_reconciliation",
                        "baseline_lookup_trace",
                        "debug_audit_payload",
                        "no_clearing",
                        "reason",
                    ]
                    for key in passthrough_keys:
                        if key in res:
                            data[key] = res.get(key)

                    # Per-player DAM/IDM dispatch slices
                    player_idm_bid_dispatch = engine_bid_dispatch.get(pid) if isinstance(engine_bid_dispatch, dict) else None

                    player_dam_bid_dispatch = None
                    if isinstance(engine_dam_bid_dispatch, dict):
                        # Shape 1: {player_id: {device_id: {A-E: [...]}}}
                        player_dam_bid_dispatch = engine_dam_bid_dispatch.get(pid)
                        if player_dam_bid_dispatch is None:
                            player_dam_bid_dispatch = engine_dam_bid_dispatch.get(str(pid))

                        # Shape 2: already player-sliced device map
                        if player_dam_bid_dispatch is None and engine_dam_bid_dispatch:
                            sample_value = next(iter(engine_dam_bid_dispatch.values()))
                            if isinstance(sample_value, dict) and any(isinstance(v, list) for v in sample_value.values()):
                                player_dam_bid_dispatch = engine_dam_bid_dispatch

                    if player_idm_bid_dispatch is not None:
                        data["bid_dispatch"] = player_idm_bid_dispatch
                        data["idm_bid_dispatch"] = player_idm_bid_dispatch
                        data["idm_hourly_results"] = hourly_results
                        data["idm_device_hourly_details"] = device_hourly_details

                    if player_dam_bid_dispatch is not None:
                        data["dam_bid_dispatch"] = player_dam_bid_dispatch
                        data["dam_hourly_results"] = dam_hourly_results
                        data["dam_device_hourly_details"] = dam_device_hourly_details

                    # Backward-compatible DB column: prefer IDM bid_dispatch; fallback to DAM if IDM not present
                    player_bid_dispatch = player_idm_bid_dispatch if player_idm_bid_dispatch is not None else player_dam_bid_dispatch
                    print(f"[SCHEDULER] Player {pid}: idm_bid_dispatch={player_idm_bid_dispatch is not None}, dam_bid_dispatch={player_dam_bid_dispatch is not None}")
                    r = Result(
                        session_id=s.id, 
                        player_id=pid, 
                        round_num=current, 
                        data=data,
                        bid_dispatch=player_bid_dispatch
                    )
                    db.session.add(r)
                    
                    # Generate debug log if requested
                    try:
                        forecast_for_player = Forecast.query.filter_by(
                            session_id=s.id,
                            player_id=pid,
                            round_num=current
                        ).first()
                        if forecast_for_player and forecast_for_player.data and forecast_for_player.data.get("debug_enabled"):
                            from .debug_logger import get_debug_logger
                            from .models import User
                            player_user = User.query.get(pid)
                            player_email = player_user.email if player_user else "unknown"
                            player_type_name = pt_cfg.get("name", "unknown") if pt_cfg else "unknown"
                            
                            # Prepare inputs
                            inputs = {
                                "scenario_config": sc.config,
                                "devices": player_devices,
                                "forecast_data": forecast_for_player.bids or {}
                            }
                            
                            # Prepare calculations (engine intermediate results)
                            calculations = {
                                "hourly_results": hourly_results
                            }
                            
                            # Prepare results
                            results = {
                                "kpis": kp,
                                "bid_dispatch": player_idm_bid_dispatch or player_bid_dispatch or {},
                                "dam_bid_dispatch": player_dam_bid_dispatch or {},
                                "device_hourly_details": device_hourly_details,
                                "dam_device_hourly_details": dam_device_hourly_details,
                            }
                            
                            logger = get_debug_logger()
                            debug_file = logger.log_round_calculation(
                                session_id=s.id,
                                round_num=current,
                                scenario_name=sc.name or "unknown",
                                player_id=pid,
                                player_email=player_email,
                                player_type=player_type_name,
                                inputs=inputs,
                                calculations=calculations,
                                results=results
                            )
                            print(f"[DEBUG] Generated debug log: {debug_file}")
                    except Exception as e:
                        print(f"[DEBUG] Failed to generate debug log for player {pid}: {e}")
                db.session.commit()
                # zone flows: assign all players to one zone per config.general.player_zone (default 1)
                try:
                    zones = int((sc.config or {}).get('grid',{}).get('zones', 1))
                except Exception:
                    zones = 1
                try:
                    pzone = int((sc.config or {}).get('general',{}).get('player_zone', 1))
                except Exception:
                    pzone = 1
                net = [0.0]*max(1, zones)
                # aggregate dispatched per zone (players all in pzone)
                total_dispatch = sum(float(k.get('dispatched_mwh',0.0)) for k in (res.get('round_kpis') or {}).values())
                if 1 <= pzone <= len(net):
                    net[pzone-1] = total_dispatch
                curtailed_by_zone, signal_by_zone = compute_zone_flows((sc.config or {}).get('grid',{}).get('atc',[]), net)
                # attach zone congestion signal to payload
                zone_payload = { 'curtailed': curtailed_by_zone, 'signal': signal_by_zone }
                payload = {
                    "session_id": s.id,
                    "round": current,
                    "smp": res.get("smp", res.get("mcp", 0)),
                    "volume": res["volume"],
                    "kpis": res.get("round_kpis"),
                    "hourly_results": res.get("hourly_results", []),
                    "dam_hourly_results": res.get("dam_hourly_results", []),
                    "idm_hourly_results": res.get("idm_hourly_results", res.get("hourly_results", [])),
                    "zone_results": res.get("zone_results", []),
                    "link_results": res.get("link_results", []),
                }
                payload['zone'] = zone_payload
                socketio.emit("round_results", payload, namespace="/trainer")
                socketio.emit("market_cleared", payload, namespace="/game", to=f"session-{s.id}")
                
                # Set status to round_results - players can now view results
                s.status = SessionStatus.round_results
                db.session.add(s)
                db.session.commit()
                if s.mode == "shared_market":
                    _force_nav(s.cohort_id, f"/player?sessionId={s.id}")
                socketio.emit("round_results_ready", {"session_id": s.id, "round": current}, namespace="/trainer")
                socketio.emit("round_results_ready", {"session_id": s.id, "round": current}, namespace="/game", to=f"session-{s.id}")
                
                socketio.emit("round_end", {"session_id": s.id, "round": current}, namespace="/trainer")
                socketio.emit("round_end", {"session_id": s.id, "round": current}, namespace="/game", to=f"session-{s.id}")
                
                # Log round completion for each player in the session
                try:
                    players_list = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=s.cohort_id).all()]
                    for pid in players_list:
                        try:
                            log_activity(int(pid), "round_complete", session_id=s.id, cohort_id=s.cohort_id, details={"round": current})
                        except Exception:
                            pass
                except Exception:
                    pass
                
                # Both solo and shared modes: wait for player(s) to click "Next Round"
                # This is handled externally via /advance-round endpoint
                # In solo mode: 1 player ready = advance immediately
                # In shared mode: all players ready = advance
                # The actual advancement will be triggered by the all_ready_advance socket event
                # Wait for that signal before advancing to next round
                return
            
            # All rounds complete - set to scenario_complete
            s.status = SessionStatus.scenario_complete
            db.session.add(s)
            db.session.commit()
            if s.mode == "shared_market":
                _force_nav(s.cohort_id, f"/player?sessionId={s.id}")
            socketio.emit("scenario_complete", {"session_id": s.id}, namespace="/trainer")
            socketio.emit("scenario_complete", {"session_id": s.id}, namespace="/game", to=f"session-{s.id}")
            # End session immediately on scenario completion
            try:
                s.status = SessionStatus.ended
                db.session.add(s)
                db.session.commit()
                socketio.emit("session_ended", {"session_id": s.id}, namespace="/trainer")
                socketio.emit("session_ended", {"session_id": s.id}, namespace="/game", to=f"session-{s.id}")
            except Exception:
                pass
            
            # Mark player progress completed for any existing in_progress entries of this scenario
            try:
                from datetime import datetime
                players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=s.cohort_id).all()]
                q = db.session.query(PlayerProgress).filter(PlayerProgress.scenario_id == s.scenario_id, PlayerProgress.user_id.in_(players))
                for pp in q.all():
                    pp.status = PlayerProgressStatus.completed
                    pp.completed_at = datetime.utcnow()
                    db.session.add(pp)
                db.session.commit()
            except Exception:
                pass
    finally:
        _running.discard(session_id)