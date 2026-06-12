import sys
sys.path.insert(0, '/home/ga/energy-game/backend')
from app import create_app
from app.models import Session, Result, SessionPlayerType
import json

SESSION_ID = 378
ROUND = 1

app = create_app()
with app.app_context():
    s = Session.query.filter_by(id=SESSION_ID).first()
    if not s:
        print('Session not found')
        sys.exit(1)
    cfg = s.scenario.config or {}
    market = cfg.get('market', {}) or {}
    print('market.generator_mix keys:', list((market.get('generator_mix') or {}).keys()))
    print('market.consumer_mix keys:', list((market.get('consumer_mix') or {}).keys()))

    spt = SessionPlayerType.query.filter_by(session_id=SESSION_ID).first()
    if not spt:
        print('No SessionPlayerType')
        sys.exit(1)

    result = Result.query.filter_by(session_id=SESSION_ID, player_id=spt.user_id, round_num=ROUND).first()
    if not result:
        print('No Result')
        sys.exit(1)

    kpis = result.data.get('kpis', {})
    device_breakdown = kpis.get('device_hourly_breakdown', {})
    print('device_hourly_breakdown devices:', list(device_breakdown.keys()))

    # Find solar device in scenario
    solar_devices = [d for d in (cfg.get('devices') or []) if (d.get('type') or '').lower() in ('solar','pv')]
    print('solar devices:', [d.get('id') for d in solar_devices])

    for dev in solar_devices:
        dev_id = dev.get('id')
        entries = device_breakdown.get(dev_id, [])
        if not entries:
            print(f'No breakdown for {dev_id}')
            continue
        print(f'\nSolar {dev_id} hour 0-5:')
        for e in entries[:6]:
            print('hour', e.get('hour'), 'base', e.get('base_capacity_mw'), 'eff', e.get('effective_capacity_mw'))

    # Dump generator_mix entry for pv/solar
    gen_mix = market.get('generator_mix') or {}
    for key in ['pv','solar']:
        if key in gen_mix:
            print(f'generator_mix.{key}:', json.dumps(gen_mix[key], indent=2)[:500])
