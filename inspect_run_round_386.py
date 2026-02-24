import sys
sys.path.insert(0, '/home/ga/energy-game/backend')
from app import create_app, db
from app.models import Session, Forecast, CohortMember
from app.engine import run_round

SESSION_ID = 386
ROUND_NUM = 1

app = create_app()
with app.app_context():
    s = Session.query.get(SESSION_ID)
    cfg = s.scenario.config or {}
    hours_span = int((cfg.get('general', {}) or {}).get('round_span_hours', 6))
    rounds = int((cfg.get('general', {}) or {}).get('rounds', 1))

    players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=s.cohort_id).all()]
    forecasts = {}
    for pid in players:
        full = Forecast.query.filter_by(session_id=s.id, player_id=pid, round_num=0).first()
        current_round_forecast = Forecast.query.filter_by(session_id=s.id, player_id=pid, round_num=ROUND_NUM).first()
        current_bids = current_round_forecast.bids if current_round_forecast and current_round_forecast.bids else None
        current_devices = (current_round_forecast.data or {}).get('devices', []) if current_round_forecast else []
        if full and isinstance(full.data, dict):
            forecasts[pid] = {'hours': list(full.data.get('hours', [])), 'bids': current_bids, 'devices': current_devices}
        else:
            total_hours = rounds * hours_span
            full_horizon = [0.0] * total_hours
            all_forecasts = (
                Forecast.query.filter_by(session_id=s.id, player_id=pid)
                .filter(Forecast.round_num > 0)
                .order_by(Forecast.round_num)
                .all()
            )
            for fc in all_forecasts:
                fc_hours = (fc.data or {}).get('hours', [])
                start_idx = (fc.round_num - 1) * hours_span
                for i, val in enumerate(fc_hours):
                    if start_idx + i < total_hours:
                        full_horizon[start_idx + i] = val
            forecasts[pid] = {'hours': full_horizon, 'bids': current_bids, 'devices': current_devices}

    res = run_round(s.id, ROUND_NUM, players, forecasts, cfg, mode=s.mode or 'isolated_per_player', seed=None)

    round_kpis = res.get('round_kpis', {})
    for pid, kpis in round_kpis.items():
        dhb = kpis.get('device_hourly_breakdown', {})
        print('pid', pid, 'device_hourly_breakdown keys:', list(dhb.keys()))
        if dhb:
            first = list(dhb.keys())[0]
            print('first device sample:', dhb[first][0])
