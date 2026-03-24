"""
Unit tests for multi-bid pricing feature
"""
import pytest
from app.engine import build_supply_from_bids, build_demand_from_bids, track_bid_dispatch, clear_market


class TestBuildSupplyFromBids:
    """Test build_supply_from_bids function"""
    
    def test_no_bids_returns_synthetic_only(self):
        """When bidding disabled, return only synthetic supply"""
        config = {"market": {"enable_player_bidding": False}}
        synthetic = [(600, 1000), (700, 1000), (800, 1000)]
        forecasts = {1: {'hours': [100]*24, 'bids': None}}
        
        combined, bids_meta = build_supply_from_bids(forecasts, 0, synthetic, config)
        
        assert combined == synthetic
        assert bids_meta == []
    
    def test_single_bid_merged_with_synthetic(self):
        """Single player bid merged with synthetic supply"""
        config = {"market": {"enable_player_bidding": True}}
        synthetic = [(600, 1000), (800, 1000)]
        forecasts = {
            1: {
                'hours': [100]*24,
                'bids': {
                    'device_1': {
                        'A': {'price': 700, 'hours': [200]*24}
                    }
                }
            }
        }
        
        combined, bids_meta = build_supply_from_bids(forecasts, 0, synthetic, config)
        
        # Should have 3 elements: 2 synthetic + 1 bid
        assert len(combined) == 3
        # Should be sorted by price
        assert combined[0][0] == 600  # Synthetic
        assert combined[1][0] == 700  # Player bid
        assert combined[2][0] == 800  # Synthetic
        # Bid metadata
        assert len(bids_meta) == 1
        assert bids_meta[0]['price'] == 700
        assert bids_meta[0]['quantity'] == 200
        assert bids_meta[0]['player_id'] == 1
    
    def test_multiple_bids_per_device(self):
        """Multiple bids (A/B/C) from same device"""
        config = {"market": {"enable_player_bidding": True}}
        synthetic = [(1000, 500)]
        forecasts = {
            1: {
                'bids': {
                    'device_1': {
                        'A': {'price': 350, 'hours': [200]*24},
                        'B': {'price': 400, 'hours': [150]*24},
                        'C': {'price': 480, 'hours': [100]*24}
                    }
                }
            }
        }
        
        combined, bids_meta = build_supply_from_bids(forecasts, 0, synthetic, config)
        
        # 1 synthetic + 3 bids = 4 total
        assert len(combined) == 4
        # Should be sorted: 350, 400, 480, 1000
        prices = [p for p, q in combined]
        assert prices == [350, 400, 480, 1000]
        # Bid metadata should have 3 entries
        assert len(bids_meta) == 3
    
    def test_multiple_players(self):
        """Multiple players with bids"""
        config = {"market": {"enable_player_bidding": True}}
        synthetic = []
        forecasts = {
            1: {
                'bids': {
                    'device_1': {
                        'A': {'price': 500, 'hours': [100]*24}
                    }
                }
            },
            2: {
                'bids': {
                    'device_2': {
                        'A': {'price': 300, 'hours': [200]*24}
                    }
                }
            }
        }
        
        combined, bids_meta = build_supply_from_bids(forecasts, 0, synthetic, config)
        
        assert len(combined) == 2
        # Sorted by price: player 2 first (300), then player 1 (500)
        assert combined[0][0] == 300
        assert combined[1][0] == 500
        assert bids_meta[0]['player_id'] == 2
        assert bids_meta[1]['player_id'] == 1
    
    def test_hour_index_selection(self):
        """Correct hour is selected from bids"""
        config = {"market": {"enable_player_bidding": True}}
        synthetic = []
        forecasts = {
            1: {
                'bids': {
                    'device_1': {
                        'A': {'price': 400, 'hours': [10, 20, 30, 40]}  # Different values per hour
                    }
                }
            }
        }
        
        # Hour 0
        combined, _ = build_supply_from_bids(forecasts, 0, synthetic, config)
        assert combined[0][1] == 10
        
        # Hour 2
        combined, _ = build_supply_from_bids(forecasts, 2, synthetic, config)
        assert combined[0][1] == 30

    def test_bid_count_five_supports_extended_labels(self):
        """Devices with bid_count 5 may submit A-E bids without relying on global switch."""
        config = {
            "market": {"enable_player_bidding": False},
            "devices": [{"id": "device_1", "type": "coal", "bid_count": 5}]
        }
        synthetic = []
        forecasts = {
            1: {
                "bids": {
                    "device_1": {
                        "A": {"price": 300, "hours": [10] * 24},
                        "B": {"price": 350, "hours": [20] * 24},
                        "C": {"price": 400, "hours": [30] * 24},
                        "D": {"price": 450, "hours": [40] * 24},
                        "E": {"price": 500, "hours": [50] * 24},
                    }
                }
            }
        }

        combined, bids_meta = build_supply_from_bids(forecasts, 0, synthetic, config)

        assert [price for price, _ in combined] == [300, 350, 400, 450, 500]
        assert [bid["bid_label"] for bid in bids_meta] == ["A", "B", "C", "D", "E"]

    def test_bid_count_one_uses_single_explicit_bid(self):
        """Devices with bid_count 1 expose only a single explicit bid."""
        config = {
            "market": {"enable_player_bidding": False},
            "devices": [{"id": "device_1", "type": "gas", "bid_count": 1}]
        }
        synthetic = [(900, 100)]
        forecasts = {
            1: {
                "bids": {
                    "device_1": {
                        "A": {"price": 450, "hours": [25] * 24}
                    }
                }
            }
        }

        combined, bids_meta = build_supply_from_bids(forecasts, 0, synthetic, config)

        assert combined == [(450.0, 25.0), (900, 100)]
        assert len(bids_meta) == 1
        assert bids_meta[0]["bid_label"] == "A"

    def test_bid_count_one_empty_bids_falls_back_to_forecast_and_configured_price(self):
        """Single-bid devices recover from empty bid payloads using forecast quantity and configured price."""
        config = {
            "market": {"enable_player_bidding": False},
            "devices": [{
                "id": "device_1",
                "type": "gas",
                "bid_count": 1,
                "cost_per_mwh_zar": 300,
                "default_bids": {"A": {"price": 450}},
            }],
        }
        synthetic = []
        forecasts = {
            1: {
                "devices": [{"device_id": "device_1", "hours": [25] * 24}],
                "bids": {
                    "device_1": {}
                }
            }
        }

        combined, bids_meta = build_supply_from_bids(forecasts, 0, synthetic, config)

        assert combined == [(450.0, 25.0)]
        assert len(bids_meta) == 1
        assert bids_meta[0]["bid_label"] == "A"
        assert bids_meta[0]["price"] == 450.0
        assert bids_meta[0]["quantity"] == 25.0


class TestBuildDemandFromBids:
    def test_bid_count_one_empty_bids_falls_back_to_forecast_and_configured_price(self):
        """Single-bid consumer devices recover from empty bid payloads using forecast quantity and configured price."""
        config = {
            "market": {"enable_player_bidding": False},
            "devices": [{
                "id": "device_1",
                "type": "industrial_load",
                "bid_count": 1,
                "willingness_to_pay": 1500,
                "default_bids": {"A": {"price": 1200}},
            }],
        }
        synthetic = []
        forecasts = {
            1: {
                "devices": [{"device_id": "device_1", "hours": [40] * 24}],
                "bids": {
                    "device_1": {}
                }
            }
        }

        combined, bids_meta = build_demand_from_bids(forecasts, 0, synthetic, config)

        assert combined == [(1200.0, 40.0)]
        assert len(bids_meta) == 1
        assert bids_meta[0]["bid_label"] == "A"
        assert bids_meta[0]["price"] == 1200.0
        assert bids_meta[0]["quantity"] == 40.0


class TestTrackBidDispatch:
    """Test track_bid_dispatch function"""
    
    def test_full_dispatch(self):
        """All bids fully dispatched"""
        supply_bids = [
            {'price': 300, 'quantity': 100, 'player_id': 1, 'device_id': 'dev1', 'bid_label': 'A'},
            {'price': 400, 'quantity': 200, 'player_id': 1, 'device_id': 'dev1', 'bid_label': 'B'}
        ]
        synthetic = []
        smp = 500
        volume = 300  # Exactly covers both bids
        
        tracking = track_bid_dispatch(supply_bids, smp, volume, synthetic)
        
        assert 1 in tracking
        assert 'dev1' in tracking[1]
        assert tracking[1]['dev1']['A']['mw_dispatched'] == 100
        assert tracking[1]['dev1']['B']['mw_dispatched'] == 200
        assert tracking[1]['dev1']['A']['smp'] == 500
    
    def test_partial_dispatch(self):
        """Only part of second bid dispatched"""
        supply_bids = [
            {'price': 300, 'quantity': 100, 'player_id': 1, 'device_id': 'dev1', 'bid_label': 'A'},
            {'price': 400, 'quantity': 200, 'player_id': 1, 'device_id': 'dev1', 'bid_label': 'B'}
        ]
        synthetic = []
        smp = 400
        volume = 150  # Only 100 from A + 50 from B
        
        tracking = track_bid_dispatch(supply_bids, smp, volume, synthetic)
        
        assert tracking[1]['dev1']['A']['mw_dispatched'] == 100  # Full
        assert tracking[1]['dev1']['B']['mw_dispatched'] == 50   # Partial
    
    def test_no_dispatch_price_too_high(self):
        """Bid price above SMP = not dispatched"""
        supply_bids = [
            {'price': 600, 'quantity': 100, 'player_id': 1, 'device_id': 'dev1', 'bid_label': 'A'}
        ]
        synthetic = []
        smp = 500
        volume = 1000
        
        tracking = track_bid_dispatch(supply_bids, smp, volume, synthetic)
        
        # Should be empty - bid too expensive
        assert tracking == {}
    
    def test_mixed_synthetic_and_player_bids(self):
        """Synthetic supply dispatched before expensive player bids"""
        supply_bids = [
            {'price': 800, 'quantity': 100, 'player_id': 1, 'device_id': 'dev1', 'bid_label': 'A'}
        ]
        synthetic = [(600, 500), (700, 50)]  # Only 550 MW total synthetic
        smp = 800
        volume = 600  # 500 from first synthetic + 50 from second + 50 from player
        
        tracking = track_bid_dispatch(supply_bids, smp, volume, synthetic)
        
        # Player bid should be partially dispatched (50 out of 100)
        assert tracking[1]['dev1']['A']['mw_dispatched'] == 50
        assert tracking[1]['dev1']['A']['mw_offered'] == 100


class TestMarketClearingIntegration:
    """Integration tests for full market clearing with bids"""
    
    def test_merit_order_dispatch(self):
        """Cheapest bids dispatched first"""
        # Build supply from multiple bids
        supply = [
            (300, 100),  # Player 1, cheap
            (500, 200),  # Player 2, mid
            (800, 100),  # Player 3, expensive
        ]
        demand = [(1000, 400)]  # High willingness to pay
        
        smp, volume = clear_market(supply, demand)
        
        # SMP should be where supply meets demand
        # All 3 bids should clear (total 400 MW)
        assert volume == 400
        assert smp == 800  # Price of most expensive dispatched bid
    
    def test_uniform_pricing(self):
        """All dispatched bids receive same SMP"""
        # This is a behavioral test - would need Result objects to verify
        # But the principle is: even if you bid at 300, you get SMP (e.g., 800)
        supply = [(300, 100), (500, 100), (800, 100)]
        demand = [(1000, 250)]
    
        smp, volume = clear_market(supply, demand)
    
        # 250 MW demand satisfied by first 2.5 bids (100 @ 300, 100 @ 500, 50 @ 800)
        assert volume == 250
        # SMP = marginal bid price (last dispatched = 800)
        assert smp == 800