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
from .models import PhaseResult
from .extensions import db
from .utils import log_activity
from .engine import run_round, compute_zone_flows, _load_shared_market_capacity_scales
from .models import PlayerProgress, Campaign
from .phases import is_two_phase_round, normalize_round_phase


_running: Set[int] = set()

# Debug logging gate. The [SCHEDULER]/[DEBUG] print(...) calls below are diagnostic
# only and run per-player inside the round-processing loop. They are silenced by
# default and re-enabled at runtime via EMSG_DEBUG_LOG=1, without changing any
# scheduling or calculation behaviour.
_DEBUG_LOG = os.getenv("EMSG_DEBUG_LOG", "").strip().lower() in ("1", "true", "yes", "on")
_builtin_print = print


def print(*args, **kwargs):  # noqa: A001 - intentional module-scoped debug gate
    if _DEBUG_LOG:
        _builtin_print(*args, **kwargs)


def _force_nav(cohort_id: int, url: str):
    if not _redis_client or not cohort_id or not url:
        return
    try:
        key = f"cohort:{cohort_id}:force_nav"
        _redis_client.setex(key, 300, url)
    except Exception:
        pass


def _auto_submit_missing(session_id: int, round_num: int, hours_per_round: int, market_phase: str | None = None):
    players = db.session.query(CohortMember.user_id).filter_by(cohort_id=db.session.query(Session.cohort_id).filter_by(id=session_id).scalar()).all()
    player_ids = [uid for (uid,) in players]
    # Batch check which players have already submitted (avoids N individual queries)
    _exists_q = Forecast.query.filter(
        Forecast.session_id == session_id,
        Forecast.player_id.in_(player_ids),
        Forecast.round_num == round_num,
    )
    if market_phase is not None:
        _exists_q = _exists_q.filter(Forecast.market_phase == market_phase)
    already_submitted = {f.player_id for f in _exists_q.with_entities(Forecast.player_id).all()}
    missing_ids = [pid for pid in player_ids if pid not in already_submitted]

    # Batch load previous forecasts for auto_bid settings
    prev_by_player = {}
    if missing_ids:
        _all_prev = (
            Forecast.query.filter(
                Forecast.session_id == session_id,
                Forecast.player_id.in_(missing_ids),
                Forecast.round_num > 0,
            )
            .order_by(Forecast.round_num.desc())
            .all()
        )
        for _pf in _all_prev:
            if _pf.player_id not in prev_by_player:
                prev_by_player[_pf.player_id] = _pf

    for pid in missing_ids:
        prev = prev_by_player.get(pid)
        prev_devices = (prev.data or {}).get('devices', []) if prev else []
        devices_with_auto_bid = [
            {'device_id': d['device_id'], 'hours': [0.0] * hours_per_round, 'auto_bid': d['auto_bid']}
            for d in prev_devices
            if isinstance(d, dict) and isinstance(d.get('auto_bid'), dict) and d['auto_bid'].get('enabled')
        ]
        forecast_data = {"hours": [0.0] * hours_per_round, "_auto": True}
        if devices_with_auto_bid:
            forecast_data["devices"] = devices_with_auto_bid
        f = Forecast(
            session_id=session_id,
            player_id=pid,
            round_num=round_num,
            data=forecast_data,
            bids=None,
            market_phase=(market_phase or "single"),
        )
        db.session.add(f)
        socketio.emit("player_submit", {"session_id": session_id, "player_id": pid}, namespace="/trainer")
    db.session.commit()


def _collect_forecasts_base(session_id: int, players, rounds: int, hours_span: int, current: int, market_phase: str | None = None):
    """Build {pid: {'hours','bids','devices'}} of ABSOLUTE forecasts for a round.

    Mirrors the legacy inline collection exactly when ``market_phase`` is None, so
    single-phase behaviour is byte-for-byte unchanged. When ``market_phase`` is set
    (two-phase rounds), the current-round submission is filtered to that phase.
    """
    # Batch load full-horizon (round_num=0) and current-round forecasts for all players
    _full_forecasts = Forecast.query.filter(
        Forecast.session_id == session_id,
        Forecast.player_id.in_(players),
        Forecast.round_num == 0,
    ).all()
    full_by_player = {f.player_id: f for f in _full_forecasts}

    _cur_q = Forecast.query.filter(
        Forecast.session_id == session_id,
        Forecast.player_id.in_(players),
        Forecast.round_num == current,
    )
    if market_phase is not None:
        _cur_q = _cur_q.filter(Forecast.market_phase == market_phase)
    _cur_forecasts_list = _cur_q.order_by(Forecast.id.desc()).all()
    current_by_player = {}
    for _cf in _cur_forecasts_list:
        current_by_player.setdefault(_cf.player_id, []).append(_cf)

    forecasts = {}
    for pid in players:
        full = full_by_player.get(pid)
        _all_round_forecasts = current_by_player.get(pid, [])
        current_round_forecast = next(
            (f for f in _all_round_forecasts if f.bids is not None),
            _all_round_forecasts[0] if _all_round_forecasts else None
        )
        current_bids = current_round_forecast.bids if current_round_forecast and current_round_forecast.bids else None
        current_devices = (current_round_forecast.data or {}).get("devices", []) if current_round_forecast else []

        if full and isinstance(full.data, dict):
            forecasts[pid] = {
                'hours': list(full.data.get("hours", [])),
                'bids': current_bids,
                'devices': current_devices,
            }
        else:
            total_hours = rounds * hours_span
            full_horizon = [0.0] * total_hours
            _hz_q = Forecast.query.filter_by(session_id=session_id, player_id=pid).filter(Forecast.round_num > 0)
            if market_phase is not None:
                _hz_q = _hz_q.filter(Forecast.market_phase == market_phase)
            all_forecasts = _hz_q.order_by(Forecast.round_num).all()
            for fc in all_forecasts:
                fc_hours = (fc.data or {}).get("hours", [])
                start_idx = (fc.round_num - 1) * hours_span
                for i, val in enumerate(fc_hours):
                    if start_idx + i < total_hours:
                        full_horizon[start_idx + i] = val
            forecasts[pid] = {'hours': full_horizon, 'bids': current_bids, 'devices': current_devices}
    return forecasts


def _build_intra_round_baseline_from_dam(dam_res: dict, players) -> dict:
    """Build the intra_round_baseline payload the engine expects for the IDM phase.

    Derives per-player forecasts/bids/dispatch from the DAM phase engine result so
    the IDM phase clears as a delta against the SAME round's DAM dispatch.
    """
    dam_dispatch = dam_res.get("dam_bid_dispatch", dam_res.get("bid_dispatch", {})) or {}
    dam_hourly_results = dam_res.get("dam_hourly_results", dam_res.get("hourly_results", [])) or []
    synthetic_demand_carryover_by_hour = {}
    for hour_row in dam_hourly_results:
        if not isinstance(hour_row, dict):
            continue
        curve = hour_row.get("unserved_synthetic_demand_curve") or []
        curve_by_zone = hour_row.get("unserved_synthetic_demand_curve_by_zone") or []
        if curve or any(zone_curve for zone_curve in curve_by_zone):
            scenario_hour_idx = int(hour_row.get("scenario_hour_idx", hour_row.get("hour_idx", 0)) or 0)
            synthetic_demand_carryover_by_hour[scenario_hour_idx] = {
                "curve": curve,
                "curve_by_zone": curve_by_zone,
            }
    synthetic_supply_carryover_by_hour = {}
    for hour_row in dam_hourly_results:
        if not isinstance(hour_row, dict):
            continue
        curve = hour_row.get("unserved_synthetic_supply_curve") or []
        curve_by_zone = hour_row.get("unserved_synthetic_supply_curve_by_zone") or []
        if curve or any(zone_curve for zone_curve in curve_by_zone):
            scenario_hour_idx = int(hour_row.get("scenario_hour_idx", hour_row.get("hour_idx", 0)) or 0)
            synthetic_supply_carryover_by_hour[scenario_hour_idx] = {
                "curve": curve,
                "curve_by_zone": curve_by_zone,
            }
    baseline = {
        'forecasts': {},
        'bids': {},
        'dispatch': {},
        'smp': dam_res.get("smp", dam_res.get("mcp")),
        'synthetic_demand_carryover_by_hour': synthetic_demand_carryover_by_hour,
        'synthetic_supply_carryover_by_hour': synthetic_supply_carryover_by_hour,
        'result_data': {
            'dam_bid_dispatch': dam_dispatch,
            'dam_hourly_results': dam_hourly_results,
            'dam_device_hourly_details': dam_res.get("dam_device_hourly_details", dam_res.get("device_hourly_details", {})),
            'smp': dam_res.get("smp", dam_res.get("mcp")),
        },
        'hourly_results': dam_hourly_results,
    }
    for pid in players:
        player_dispatch = dam_dispatch.get(pid)
        if player_dispatch is None:
            player_dispatch = dam_dispatch.get(str(pid))
        if isinstance(player_dispatch, dict):
            baseline['dispatch'][int(pid)] = player_dispatch
    return baseline


def _run_active_window(s, current: int, timer_sec: int, hours_span: int, market_phase: str | None = None):
    """Run the active -> closing -> calculating cycle for one (phase of a) round.

    Used for legacy single-phase rounds (market_phase=None) and for each phase of a
    two-phase round (market_phase 'dam'/'idm'). Returns the refreshed Session row;
    on return the session status is ``calculating`` and submissions are collected.
    """
    phase_extra = {"phase": market_phase} if market_phase else {}

    # Round active phase
    s.status = SessionStatus.round_active
    db.session.add(s)
    db.session.commit()
    if s.mode == "shared_market":
        _force_nav(s.cohort_id, f"/player?sessionId={s.id}")

    socketio.emit("round_start", {"session_id": s.id, "round": current, **phase_extra}, namespace="/trainer")
    socketio.emit("round_start", {"session_id": s.id, "round": current, **phase_extra}, namespace="/game", to=f"session-{s.id}")

    # Clear stale timer extensions from prior rounds, but preserve force_end_round
    # if it was set BEFORE this window started (e.g. trainer ended round while scheduler was dead).
    _force_already_set = False
    if _redis_client is not None:
        try:
            _force_already_set = bool(_redis_client.get(f"session:{s.id}:force_end_round"))
            _redis_client.delete(f"session:{s.id}:timer_extend_sec")
            if not _force_already_set:
                _redis_client.delete(f"session:{s.id}:force_end_round")
        except Exception:
            pass

    # countdown
    remaining = 0 if _force_already_set else timer_sec
    while remaining > 0:
        time.sleep(1)
        # Release DB connection before each reload so the sleep period does not
        # leave a connection idle-in-transaction (would hit idle_in_transaction_session_timeout).
        try:
            db.session.remove()
        except Exception:
            pass
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
            db.session.remove()
            continue
        if s and s.frozen:
            db.session.remove()
            continue

        if _redis_client is not None:
            try:
                force_key = f"session:{s.id}:force_end_round"
                if _redis_client.get(force_key):
                    _redis_client.delete(force_key)
                    remaining = 0
            except Exception:
                pass

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

        # In solo mode, skip remaining time once the player has submitted THIS phase.
        if s and s.mode == 'isolated_per_player':
            players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=s.cohort_id).all()]
            if players:
                player_id = players[0]  # Solo mode has only 1 player
                _fq = Forecast.query.filter_by(session_id=s.id, player_id=player_id, round_num=current)
                if market_phase is not None:
                    _fq = _fq.filter(Forecast.market_phase == market_phase)
                if _fq.first():
                    remaining = 0

        socketio.emit("tick", {"session_id": s.id, "remaining": remaining}, namespace="/trainer")
        socketio.emit("tick", {"session_id": s.id, "remaining": remaining}, namespace="/game", to=f"session-{s.id}")

    # Round closing phase - wait for all submits
    s.status = SessionStatus.round_closing
    db.session.add(s)
    db.session.commit()
    if s.mode == "shared_market":
        _force_nav(s.cohort_id, f"/player?sessionId={s.id}")
    socketio.emit("round_closing", {"session_id": s.id, "round": current, **phase_extra}, namespace="/trainer")
    socketio.emit("round_closing", {"session_id": s.id, "round": current, **phase_extra}, namespace="/game", to=f"session-{s.id}")

    # auto-submit for missing players (phase-aware)
    _auto_submit_missing(s.id, current, hours_span, market_phase=market_phase)

    # Wait briefly for any last-second submits (grace period).
    # Release the DB connection back to the pool during the sleep so we neither
    # hold a connection idle nor risk an idle-in-transaction termination while
    # waiting. The session is re-attached on the next add()/commit below.
    try:
        db.session.remove()
    except Exception:
        pass
    time.sleep(2)

    # Calculating phase
    s.status = SessionStatus.calculating
    db.session.add(s)
    db.session.commit()
    if s.mode == "shared_market":
        _force_nav(s.cohort_id, f"/player?sessionId={s.id}")
    socketio.emit("calculating", {"session_id": s.id, "round": current, **phase_extra}, namespace="/trainer")
    socketio.emit("calculating", {"session_id": s.id, "round": current, **phase_extra}, namespace="/game", to=f"session-{s.id}")
    return s


def _persist_dam_phase_results(s, current: int, players, dam_res: dict):
    """Persist provisional DAM phase results into PhaseResult (not the final Result).

    Replaces any existing DAM PhaseResult rows for this round (idempotent on re-run).
    """
    dam_dispatch = dam_res.get("dam_bid_dispatch", dam_res.get("bid_dispatch", {})) or {}
    round_kpis = dam_res.get("round_kpis") or {}
    PhaseResult.query.filter_by(session_id=s.id, round_num=current, market_phase="dam").delete()
    for pid in players:
        kp = round_kpis.get(pid) or round_kpis.get(str(pid)) or {}
        player_dispatch = dam_dispatch.get(pid)
        if player_dispatch is None:
            player_dispatch = dam_dispatch.get(str(pid))
        data = {
            "kpis": kp,
            "smp": dam_res.get("smp", dam_res.get("mcp", 0)),
            "volume": dam_res.get("volume", 0),
            "dam_hourly_results": dam_res.get("dam_hourly_results", dam_res.get("hourly_results", [])),
            "dam_bid_dispatch": player_dispatch,
            "battery_soc_end_state": dam_res.get("battery_soc_end_state"),
        }
        pr = PhaseResult(
            session_id=s.id,
            player_id=pid,
            round_num=current,
            market_phase="dam",
            data=data,
            bid_dispatch=player_dispatch,
        )
        db.session.add(pr)
    db.session.commit()


def _emit_dam_phase_feedback(s, current: int, dam_res: dict, players):
    """Emit intermediate DAM clearing feedback (own award + SMP) after the DAM phase.

    This is NOT a final round result: no round_results_ready / status change to
    round_results. Players use this to inform their IDM phase submission.
    """
    dam_dispatch = dam_res.get("dam_bid_dispatch", dam_res.get("bid_dispatch", {})) or {}
    round_kpis = dam_res.get("round_kpis") or {}
    smp = dam_res.get("smp", dam_res.get("mcp", 0))
    # Trainer gets the aggregate; players get their own slice.
    socketio.emit(
        "dam_phase_cleared",
        {
            "session_id": s.id,
            "round": current,
            "smp": smp,
            "dam_hourly_results": dam_res.get("dam_hourly_results", dam_res.get("hourly_results", [])),
        },
        namespace="/trainer",
    )
    for pid in players:
        player_dispatch = dam_dispatch.get(pid)
        if player_dispatch is None:
            player_dispatch = dam_dispatch.get(str(pid))
        kp = round_kpis.get(pid) or round_kpis.get(str(pid)) or {}
        socketio.emit(
            "dam_phase_cleared",
            {
                "session_id": s.id,
                "round": current,
                "player_id": pid,
                "smp": smp,
                "dam_bid_dispatch": player_dispatch,
                "kpis": kp,
            },
            namespace="/game",
            to=f"session-{s.id}",
        )


def _resolve_campaign_seed(scenario_id: int, players) -> str | None:
    """Derive the deterministic campaign seed for a round, if exactly one campaign applies."""
    try:
        camp_ids = set(
            cid for (cid,) in db.session.query(PlayerProgress.campaign_id)
            .filter(PlayerProgress.scenario_id == scenario_id, PlayerProgress.user_id.in_(players))
            .distinct().all()
        )
        if len(camp_ids) == 1:
            camp = Campaign.query.get(next(iter(camp_ids)))
            if camp and camp.seed:
                return str(camp.seed)
    except Exception:
        return None
    return None


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
                players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=s.cohort_id).all()]
                phase_seq = ["dam", "idm"] if is_two_phase_round(cfg, current) else ["single"]
                is_two_phase = len(phase_seq) > 1

                # Per-round injection state for the IDM phase of a two-phase round.
                intra_round_baseline = None
                seed_battery_soc_state = None
                camp_seed = _resolve_campaign_seed(s.scenario_id, players)

                if is_two_phase:
                    # ---- PHASE 1: DAM ----
                    s.market_phase = "dam"
                    s.phase_index = 0
                    db.session.add(s)
                    db.session.commit()
                    s = _run_active_window(s, current, timer_sec, hours_span, market_phase="dam")

                    dam_forecasts = _collect_forecasts_base(s.id, players, rounds, hours_span, current, market_phase="dam")
                    sc = Scenario.query.get(s.scenario_id)
                    dam_res = run_round(
                        s.id, current, players, dam_forecasts, sc.config or {},
                        mode=s.mode or "isolated_per_player", seed=camp_seed,
                        execution_phase="dam",
                    )
                    # Discard the engine's read connection (held open during the long
                    # CPU computation) before persisting, so we never commit onto a
                    # connection that Postgres may have terminated for being
                    # idle-in-transaction during the compute.
                    try:
                        db.session.remove()
                    except Exception:
                        pass
                    _persist_dam_phase_results(s, current, players, dam_res)
                    intra_round_baseline = _build_intra_round_baseline_from_dam(dam_res, players)
                    seed_battery_soc_state = dam_res.get("battery_soc_end_state")
                    _emit_dam_phase_feedback(s, current, dam_res, players)

                    # ---- transition to PHASE 2: IDM (same round, no advance wait) ----
                    s.market_phase = "idm"
                    s.phase_index = 1
                    db.session.add(s)
                    db.session.commit()
                    s = _run_active_window(s, current, timer_sec, hours_span, market_phase="idm")
                else:
                    s.market_phase = None
                    s.phase_index = 0
                    db.session.add(s)
                    db.session.commit()
                    s = _run_active_window(s, current, timer_sec, hours_span, market_phase=None)

                # Active window already advanced status to `calculating`.
                # collect forecasts per player (full horizon if exists + this round slice fallback)
                # Support both legacy (quantity-only) and new (multi-bid) formats
                players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=s.cohort_id).all()]
                print(f"[SCHEDULER] Session {s.id} Round {current}: {len(players)} players")
                # Two-phase IDM phase uses phase-specific (absolute) submissions; the engine
                # computes the delta against the same round's DAM phase via intra_round_baseline.
                forecasts = _collect_forecasts_base(
                    s.id, players, rounds, hours_span, current,
                    market_phase=("idm" if is_two_phase else None),
                )
                # DA snapshot (round_num = -1): set on first round if not present, else use for IDM delta
                if is_two_phase:
                    # Two-phase: no cross-round DA snapshot/delta; baseline is the intra-round DAM phase.
                    pass
                elif current == 1:
                    # Batch-check which players already have a DA snapshot (round_num=-1).
                    _existing_snaps = {
                        f.player_id
                        for f in Forecast.query.filter(
                            Forecast.session_id == s.id,
                            Forecast.player_id.in_(players),
                            Forecast.round_num == -1,
                        ).all()
                    }
                    for pid in players:
                        if pid not in _existing_snaps:
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
                    # Determine if IDM is active for this round.
                    # When IDM=off (DAM-only scenario), the player submitted their full-horizon
                    # forecast (incl. future days) during Round 1 as part of the DAM.  In that
                    # case we must NOT apply the IDM delta – the engine receives the absolute
                    # forecast values directly (hours 24-47 from the Round-1 submission).
                    markets_cfg = cfg.get("markets", {})
                    idm_data = markets_cfg.get("idm", [])
                    round_idx = current - 1
                    if isinstance(idm_data, list):
                        idm_status = idm_data[round_idx] if round_idx < len(idm_data) else "market_code"
                    elif isinstance(idm_data, dict):
                        trading_arr = idm_data.get("trading", [])
                        idm_status = trading_arr[round_idx] if round_idx < len(trading_arr) else "market_code"
                    else:
                        idm_status = "market_code"
                    use_idm_delta = (idm_status != "off")
                    print(f"[SCHEDULER] Round {current}: IDM status={idm_status}, use_idm_delta={use_idm_delta}")

                    if use_idm_delta:
                        # Batch-load all DA snapshots (round_num=-1) for this session in one query.
                        _da_snaps = {
                            f.player_id: f
                            for f in Forecast.query.filter(
                                Forecast.session_id == s.id,
                                Forecast.player_id.in_(players),
                                Forecast.round_num == -1,
                            ).all()
                        }
                        # apply IDM delta for current window vs DA snapshot
                        for pid in players:
                            snap = _da_snaps.get(pid)
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
                    # else: IDM=off → absolute forecast values are passed through unchanged.
                # camp_seed already resolved at loop top (shared by DAM + IDM phases).
                # run engine for this round
                sc = Scenario.query.get(s.scenario_id)
                res = run_round(
                    s.id, current, players, forecasts, sc.config or {},
                    mode=s.mode or "isolated_per_player", seed=camp_seed,
                    execution_phase=("idm" if is_two_phase else "single"),
                    intra_round_baseline=intra_round_baseline,
                    seed_battery_soc_state=seed_battery_soc_state,
                )

                # The engine performs all its DB reads up-front, then runs a long,
                # CPU-bound computation while a read transaction stays open. For large
                # sessions that computation can exceed idle_in_transaction_session_timeout
                # (15s), which makes Postgres terminate the connection. Discard the engine's
                # connection here so the result-persistence below checks out a fresh one
                # instead of failing on a dead, idle-in-transaction connection.
                try:
                    db.session.remove()
                except Exception:
                    pass
                
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
                                "market_phase": evt.get("market_phase"),
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

                shared_market_capacity_scales = _load_shared_market_capacity_scales(s.id, s.mode)

                # --- Batch pre-loads to avoid N+1 queries inside the per-player loop ---
                # (1) SessionPlayerType: one query for all players in this session.
                from .models import SessionPlayerType
                from .engine import detect_player_role
                _spt_rows = SessionPlayerType.query.filter_by(session_id=s.id).all()
                _spt_by_player = {row.user_id: row for row in _spt_rows}

                # (2) Previous-round Results: one query for the entire session up to this round.
                # Use column projection to avoid loading the large (non-deferred) bid_dispatch
                # JSON blob for every player × every previous round.
                _prev_kpis_by_player: dict = {}
                for _player_id, _data in (
                    db.session.query(Result.player_id, Result.data)
                    .filter(Result.session_id == s.id, Result.round_num < current)
                    .all()
                ):
                    _prev_kpis_by_player.setdefault(_player_id, []).append(
                        _data.get("kpis", {}) if _data else {}
                    )

                # (3) Forecasts with debug_enabled: one query for all players in this round.
                _debug_forecasts = (
                    Forecast.query
                    .filter_by(session_id=s.id, round_num=current)
                    .all()
                )
                _debug_forecast_by_player = {f.player_id: f for f in _debug_forecasts}

                # (4) Users for debug logging (only load when any forecast has debug_enabled).
                _debug_player_ids = {
                    f.player_id for f in _debug_forecasts
                    if f.data and f.data.get("debug_enabled")
                }
                if _debug_player_ids:
                    from .models import User
                    _user_rows = User.query.filter(User.id.in_(_debug_player_ids)).all()
                    _user_by_id = {u.id: u for u in _user_rows}
                else:
                    _user_by_id = {}
                # --- end batch pre-loads ---

                for pid, kp in (res.get("round_kpis") or {}).items():
                    # Determine player role based on their player type devices
                    player_role = 'unknown'
                    player_type_id = None
                    player_devices = []
                    pt_cfg = None
                    try:
                        spt = _spt_by_player.get(pid)
                        if spt and spt.type_id:
                            player_type_id = spt.type_id
                            # Find player type config
                            pt_cfg = next((pt for pt in player_types_cfg if pt.get("id") == spt.type_id), None)
                            if pt_cfg:
                                # Get devices for this player type
                                device_ids = pt_cfg.get("devices", [])
                                player_devices = [d for d in devices_cfg if d.get("id") in device_ids]
                                player_role = detect_player_role(player_devices)
                    except Exception as e:
                        print(f"[SCHEDULER] Failed to detect role for player {pid}: {e}")

                    # Build cumulative KPIs list from pre-loaded previous results.
                    all_round_kpis = list(_prev_kpis_by_player.get(pid, []))
                    all_round_kpis.append(kp)  # Include current round
                    
                    # Compute capacity scaling for shared_market
                    capacity_scale = 1.0
                    if s.mode == "shared_market" and player_role in ["producer", "consumer"]:
                        slot_scale = shared_market_capacity_scales.get(str(player_type_id or ""))
                        if slot_scale is not None and slot_scale > 0:
                            capacity_scale = float(slot_scale)
                        else:
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
                            capacity_scale=capacity_scale,
                            player_type_id=player_type_id,
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
                        "battery_soc_end_state",
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
                        forecast_for_player = _debug_forecast_by_player.get(pid)
                        if forecast_for_player and forecast_for_player.data and forecast_for_player.data.get("debug_enabled"):
                            from .debug_logger import get_debug_logger
                            player_user = _user_by_id.get(pid)
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
                # Reset two-phase tracking now the final (IDM/single) result is in.
                s.market_phase = None
                s.phase_index = 0
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