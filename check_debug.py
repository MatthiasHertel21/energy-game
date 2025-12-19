from app import create_app
from app.models import Result, Session
from sqlalchemy import desc

app = create_app()
with app.app_context():
    s = Session.query.get(30)
    if s:
        r = Result.query.filter_by(session_id=30).order_by(desc(Result.created_at)).first()
        if r:
            kpis = r.data.get('kpis', {})
            hb = kpis.get('hourly_breakdown', [])
            debug = kpis.get('debug_info', {})
            
            print(f"Session {s.id}, Round {r.round_num}, Result ID {r.id}")
            print(f"Created at: {r.created_at}")
            print(f"\n=== Main KPIs ===")
            print(f"planned_mwh: {kpis.get('planned_mwh')}")
            print(f"dispatched_mwh: {kpis.get('dispatched_mwh')}")
            
            print(f"\n=== Hourly Breakdown ===")
            print(f"breakdown hours: {len(hb)}")
            if hb:
                print(f"Hour 0: planned={hb[0].get('planned_mw')}, dispatched={hb[0].get('dispatched_mw')}")
                total_planned = sum(h.get('planned_mw', 0) for h in hb)
                total_dispatched = sum(h.get('dispatched_mw', 0) for h in hb)
                print(f"Total planned in breakdown: {total_planned}")
                print(f"Total dispatched in breakdown: {total_dispatched}")
            
            print(f"\n=== Debug Info ===")
            print(f"enable_bidding: {debug.get('enable_bidding')}")
            print(f"per_device_keys: {debug.get('per_device_keys')}")
            print(f"breakdown_hours: {debug.get('breakdown_hours')}")
            print(f"breakdown_total_planned: {debug.get('breakdown_total_planned')}")
            print(f"breakdown_total_dispatched: {debug.get('breakdown_total_dispatched')}")
        else:
            print("No results found")
    else:
        print("Session 30 not found")
