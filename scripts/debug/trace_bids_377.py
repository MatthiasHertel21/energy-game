"""Trace bid processing for session 377"""
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app
from app.models import Session, Forecast, SessionPlayerType
from app.engine import build_supply_from_bids
import json

app = create_app()
with app.app_context():
    session = Session.query.filter_by(id=377).first()
    spt = SessionPlayerType.query.filter_by(session_id=377).first()
    
    forecast = Forecast.query.filter_by(
        session_id=377,
        player_id=spt.user_id,
        round_num=1
    ).first()
    
    config = session.scenario.config
    
    # Build player_forecasts structure
    player_forecasts = {
        spt.user_id: {
            'bids': forecast.bids or {}
        }
    }
    
    print("=== PLAYER FORECASTS ===")
    print(f"Player {spt.user_id} bids keys: {list(player_forecasts[spt.user_id]['bids'].keys())}")
    
    # Get synthetic supply from config
    synthetic_supply = config.get('market', {}).get('synthetic_supply', {}).get('DAM', {}).get('steps', [])
    print(f"\nSynthetic supply steps: {len(synthetic_supply)}")
    
    # Call build_supply_from_bids for hour 0
    print("\n=== CALLING build_supply_from_bids FOR HOUR 0 ===")
    combined_supply, bid_metadata = build_supply_from_bids(
        player_forecasts=player_forecasts,
        hour_idx=0,
        synthetic_supply=synthetic_supply,
        config=config,
        round_events=[]
    )
    
    print(f"\nReturned bid_metadata: {len(bid_metadata)} bids")
    for i, bid in enumerate(bid_metadata):
        print(f"  Bid {i}: device={bid['device_id']}, label={bid['bid_label']}, price={bid['price']}, qty={bid['quantity']}")
    
    print(f"\nCombined supply curve: {len(combined_supply)} points")
    for i, (price, qty) in enumerate(combined_supply[:10]):
        print(f"  Point {i}: price={price}, qty={qty}")

