import time
from typing import Set
from flask import current_app
from .extensions import socketio
from .models import Session, SessionStatus, Scenario, CohortMember, Forecast, Result, PlayerProgress, PlayerProgressStatus
from .extensions import db
from .utils import log_activity
from .engine import run_round, compute_zone_flows
from .models import PlayerProgress, Campaign


_running: Set[int] = set()


def _auto_submit_missing(session_id: int, round_num: int, hours_per_round: int):
    players = db.session.query(CohortMember.user_id).filter_by(cohort_id=db.session.query(Session.cohort_id).filter_by(id=session_id).scalar()).all()
    player_ids = [uid for (uid,) in players]
    for pid in player_ids:
        exists = Forecast.query.filter_by(session_id=session_id, player_id=pid, round_num=round_num).first()
        if not exists:
            f = Forecast(session_id=session_id, player_id=pid, round_num=round_num,
                         data={"hours": [0.0] * hours_per_round})
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
                
                socketio.emit("round_start", {"session_id": s.id, "round": current}, namespace="/trainer")
                socketio.emit("round_start", {"session_id": s.id, "round": current}, namespace="/game", to=f"session-{s.id}")
                
                # countdown
                remaining = timer_sec
                while remaining > 0:
                    time.sleep(1)
                    remaining -= 1
                    # pause handling
                    s = Session.query.get(s.id)
                    if s and s.status == SessionStatus.paused:
                        time.sleep(1)
                        continue
                    # Check for frozen state (trainer freeze)
                    if s and s.frozen:
                        # Don't count down timer while frozen
                        remaining += 1
                        time.sleep(0.1)
                        continue
                    
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
                socketio.emit("calculating", {"session_id": s.id, "round": current}, namespace="/trainer")
                socketio.emit("calculating", {"session_id": s.id, "round": current}, namespace="/game", to=f"session-{s.id}")
                
                # collect forecasts per player (full horizon if exists + this round slice fallback)
                players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=s.cohort_id).all()]
                forecasts = {}
                for pid in players:
                    full = Forecast.query.filter_by(session_id=s.id, player_id=pid, round_num=0).first()
                    if full:
                        forecasts[pid] = list(full.data.get("hours", []))
                    else:
                        # Build full horizon from all round-specific forecasts
                        total_hours = rounds * hours_span
                        full_horizon = [0.0] * total_hours
                        # Get all forecasts for this player in this session
                        all_forecasts = Forecast.query.filter_by(session_id=s.id, player_id=pid).filter(Forecast.round_num > 0).order_by(Forecast.round_num).all()
                        for fc in all_forecasts:
                            fc_hours = fc.data.get("hours", [])
                            start_idx = (fc.round_num - 1) * hours_span
                            for i, val in enumerate(fc_hours):
                                if start_idx + i < total_hours:
                                    full_horizon[start_idx + i] = val
                        forecasts[pid] = full_horizon
                # DA snapshot (round_num = -1): set on first round if not present, else use for IDM delta
                if current == 1:
                    for pid in players:
                        snap = Forecast.query.filter_by(session_id=s.id, player_id=pid, round_num=-1).first()
                        if not snap:
                            snap = Forecast(session_id=s.id, player_id=pid, round_num=-1, data={"hours": forecasts.get(pid, [])})
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
                            # replace current window with delta = current - DA
                            cur = forecasts.get(pid, [])
                            window = [(cur[i] if i < len(cur) else 0.0) - (da_hours[i] if i < len(da_hours) else 0.0) for i in range(start, end)]
                            # keep rest as is
                            merged = list(cur)
                            for off, i in enumerate(range(start, end)):
                                if i < len(merged):
                                    merged[i] = window[off]
                            forecasts[pid] = merged
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
                    for evt in events:
                        trigger = evt.get("trigger", {})
                        ttype = trigger.get("type", "round")
                        tval = trigger.get("value")
                        
                        # Check if event is active in this round
                        if ttype == "round" and tval == current:
                            active_events.append({
                                "event_id": evt.get("id", f"evt-{len(active_events)}"),
                                "type": evt.get("type", "unknown"),
                                "name": evt.get("name", "Event"),
                                "description": evt.get("description", ""),
                                "multiplier": evt.get("multiplier", 1.0),
                                "additive": evt.get("additive", 0),
                                "duration_rounds": evt.get("duration_rounds", 1),
                                "target": evt.get("target", ""),
                                "round": current
                            })
                    
                    # Broadcast active events to players
                    for event in active_events:
                        event["session_id"] = s.id
                        socketio.emit("event_triggered", event, namespace="/game", to=f"session-{s.id}")
                except Exception as e:
                    current_app.logger.warning(f"Failed to emit events: {e}")
                
                # persist per-player results
                for pid, kp in (res.get("round_kpis") or {}).items():
                    data = {
                        "kpis": kp,
                        "mcp": res["mcp"],
                        "volume": res["volume"],
                    }
                    r = Result(session_id=s.id, player_id=pid, round_num=current, data=data)
                    db.session.add(r)
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
                payload = {"session_id": s.id, "round": current, "mcp": res["mcp"], "volume": res["volume"], "kpis": res.get("round_kpis")}
                payload['zone'] = zone_payload
                socketio.emit("round_results", payload, namespace="/trainer")
                socketio.emit("market_cleared", payload, namespace="/game", to=f"session-{s.id}")
                
                # Set status to round_results - players can now view results
                s.status = SessionStatus.round_results
                db.session.add(s)
                db.session.commit()
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
            socketio.emit("scenario_complete", {"session_id": s.id}, namespace="/trainer")
            socketio.emit("scenario_complete", {"session_id": s.id}, namespace="/game", to=f"session-{s.id}")
            
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