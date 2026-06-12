"""Check Session 371 detailed data - fixed"""
from app import create_app
from app.models import Session, Forecast, Result
import json

app = create_app()
with app.app_context():
    session = Session.query.get(371)
    
    print("=" * 80)
    print(f"SESSION 371 - ROUND 1 ANALYSIS")
    print("=" * 80)
    
    # Get forecast
    forecast = Forecast.query.filter_by(
        session_id=371,
        player_id=1,
        round_num=1
    ).first()
    
    if forecast:
        print(f"\n📥 FORECAST (Player 1, Round 1):")
        print(f"   Debug enabled: {forecast.data.get('debug_enabled') if forecast.data else False}")
        
        if forecast.bids:
            print(f"\n   📊 BIDS:")
            for dev_id, dev_bids in forecast.bids.items():
                print(f"\n   Device: {dev_id}")
                for lot_label in ['A', 'B', 'C']:
                    if lot_label in dev_bids:
                        lot = dev_bids[lot_label]
                        price = lot.get('price', 'N/A')
                        hours = lot.get('hours', [])
                        total_mw = sum(hours) if hours else 0
                        print(f"      Lot {lot_label}: {price} ZAR/MWh, {len(hours)} hours, Total: {total_mw:.1f} MW")
                        if hours:
                            print(f"         Sample hours [0-2]: {[f'{h:.1f}' for h in hours[:3]]}")
    
    # Get result
    result = Result.query.filter_by(
        session_id=371,
        player_id=1,
        round_num=1
    ).first()
    
    if result:
        print(f"\n📤 RESULT (Player 1, Round 1):")
        
        data = result.data
        kpis = data.get('kpis', {})
        
        print(f"\n   💰 KPIs:")
        print(f"      Revenue: {kpis.get('revenue_zar', 0):,.0f} ZAR")
        print(f"      Variable Cost: {kpis.get('variable_cost_zar', 0):,.0f} ZAR")
        print(f"      Fixed Cost: {kpis.get('fixed_cost_zar', 0):,.0f} ZAR")
        print(f"      Imbalance Cost: {kpis.get('imbalance_cost_zar', 0):,.0f} ZAR")
        print(f"      Profit: {kpis.get('profit_zar', 0):,.0f} ZAR")
        
        print(f"\n   📦 Result Data Keys: {list(data.keys())}")
        
        # Check bid_dispatch
        if 'bid_dispatch' in data:
            bid_dispatch = data['bid_dispatch']
            print(f"\n   ✅ bid_dispatch exists: {type(bid_dispatch)}")
            if bid_dispatch:
                print(f"      Devices: {list(bid_dispatch.keys())}")
                for dev_id in list(bid_dispatch.keys())[:1]:
                    dev_data = bid_dispatch[dev_id]
                    print(f"\n      Device {dev_id}:")
                    for lot_label in ['A', 'B', 'C']:
                        if lot_label in dev_data:
                            lot_data = dev_data[lot_label]
                            print(f"         Lot {lot_label}: {type(lot_data)}, length={len(lot_data) if isinstance(lot_data, list) else 'N/A'}")
                            if isinstance(lot_data, list) and len(lot_data) > 0:
                                sample = lot_data[0]
                                print(f"            Sample hour 0: {sample}")
            else:
                print(f"      ⚠️  bid_dispatch is empty/None")
        else:
            print(f"   ❌ bid_dispatch NOT in result data")
        
        # Check hourly_results
        if 'hourly_results' in data:
            hourly = data['hourly_results']
            print(f"\n   📈 hourly_results: {len(hourly)} hours")
            if hourly:
                print(f"      Sample hour 0: SMP={hourly[0].get('smp')}, Volume={hourly[0].get('volume')}")
        
        # Check device_hourly_details
        if 'device_hourly_details' in data:
            details = data['device_hourly_details']
            print(f"\n   🔬 device_hourly_details:")
            if 'co2' in details:
                print(f"      CO2: {len(details['co2'])} devices")
            if 'balancing' in details:
                print(f"      Balancing: {len(details['balancing'])} devices")
                for dev_id in list(details['balancing'].keys())[:1]:
                    bal_data = details['balancing'][dev_id]
                    print(f"         {dev_id}: {len(bal_data)} hours")
                    if bal_data:
                        sample = bal_data[0]
                        print(f"            Sample: {sample}")

