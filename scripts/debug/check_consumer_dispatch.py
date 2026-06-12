from app import create_app
from app.models import Result, Session
from sqlalchemy import desc
import json

app = create_app()
with app.app_context():
    # Check Session 31 latest result
    r = Result.query.filter_by(session_id=31).order_by(desc(Result.created_at)).first()
    if r:
        print(f"Session 31, Round {r.round_num}, Player {r.player_id}")
        print(f"\n=== KPIs ===")
        kpis = r.data.get('kpis', {})
        print(f"Revenue: {kpis.get('revenue_zar')}")
        print(f"Variable Cost: {kpis.get('variable_cost_zar')}")
        print(f"Profit: {kpis.get('profit_zar')}")
        
        print(f"\n=== Bid Dispatch ===")
        bid_dispatch = r.bid_dispatch
        if bid_dispatch:
            for device_id, lots in bid_dispatch.items():
                print(f"\nDevice: {device_id}")
                for lot, data in lots.items():
                    print(f"  {lot}: offered={data.get('mw_offered')}, dispatched={data.get('mw_dispatched')}, price_bid={data.get('price_bid')}, mcp={data.get('mcp')}")
        
        print(f"\n=== MCP ===")
        print(f"MCP: {r.data.get('mcp')}")
    else:
        print("No results for Session 31")
