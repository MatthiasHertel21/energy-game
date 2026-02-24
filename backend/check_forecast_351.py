#!/usr/bin/env python3
from app import create_app, db
from app.models import Forecast
import json

app = create_app()

with app.app_context():
    forecasts = Forecast.query.filter_by(session_id=351).order_by(Forecast.player_id, Forecast.round_num).all()
    
    print("=" * 80)
    print(f"FORECAST DATA FOR SESSION 351")
    print("=" * 80)
    print()
    
    for fc in forecasts:
        print(f"ID: {fc.id} | Player: {fc.player_id} | Round: {fc.round_num}")
        
        if fc.bids:
            print(f"  Bids present: Yes")
            # Show sample from device_mj97ycal_1vrd Lot A
            if 'device_mj97ycal_1vrd' in fc.bids:
                device_bids = fc.bids['device_mj97ycal_1vrd']
                if 'A' in device_bids:
                    lot_a = device_bids['A']
                    price = lot_a.get('price', 'N/A')
                    hours = lot_a.get('hours', [])
                    print(f"  Sample (Coal Plant Lot A):")
                    print(f"    Price: {price} ZAR/MWh")
                    if len(hours) >= 18:
                        print(f"    Hours 0-5: {hours[0]}, {hours[1]}, {hours[2]}, {hours[3]}, {hours[4]}, {hours[5]}")
                        print(f"    Hours 12-17: {hours[12]}, {hours[13]}, {hours[14]}, {hours[15]}, {hours[16]}, {hours[17]}")
        else:
            print(f"  Bids: None")
        print()
