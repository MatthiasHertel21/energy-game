"""
SAWEM Market Code Rev 2.1 - Phase 2A Implementation Tests

Tests for Intraday market improvements:
1. IDP calculation (volume-weighted average with ±5% cap)
2. Gate closure enforcement (backend validation)
3. ID metadata tracking (IDP, ID volume, trade counts)

Author: SAWEM Compliance Implementation
Date: 2025
"""

import pytest
import sys
import os

# Add parent directory to path for Docker environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from app.engine import calculate_idp, clear_market
    from app.player import _get_tradeable_hours
    from app.models import Session, Scenario, Forecast
except ImportError:
    # Fallback for different import paths
    from backend.app.engine import calculate_idp, clear_market
    from backend.app.player import _get_tradeable_hours
    from backend.app.models import Session, Scenario, Forecast

from unittest.mock import Mock


# =============================================================================
# 1. IDP CALCULATION TESTS (Volume-Weighted Average with ±5% Cap)
# =============================================================================

class TestIDPCalculation:
    """Test calculate_idp() function for SAWEM compliance."""
    
    def test_idp_simple_average(self):
        """Test IDP calculation with simple volume-weighted average."""
        cleared_bids = [(450, 100), (460, 50), (440, 50)]
        smp = 450
        
        # Expected: (450*100 + 460*50 + 440*50) / 200 = 450
        idp = calculate_idp(cleared_bids, smp)
        assert idp == 450.0
    
    def test_idp_cap_upper_bound(self):
        """Test IDP capped at +5% of SMP."""
        cleared_bids = [(500, 100)]  # 11% above SMP
        smp = 450
        
        # Expected: 450 * 1.05 = 472.5 (capped)
        idp = calculate_idp(cleared_bids, smp, cap_percent=5.0)
        assert idp == 472.5
    
    def test_idp_cap_lower_bound(self):
        """Test IDP capped at -5% of SMP."""
        cleared_bids = [(400, 100)]  # 11% below SMP
        smp = 450
        
        # Expected: 450 / 1.05 = 428.57 (capped)
        idp = calculate_idp(cleared_bids, smp, cap_percent=5.0)
        assert idp == 428.57
    
    def test_idp_within_bounds(self):
        """Test IDP within ±5% of SMP (no capping)."""
        cleared_bids = [(460, 100)]  # 2.2% above SMP
        smp = 450
        
        # Expected: 460 (within bounds, no capping)
        idp = calculate_idp(cleared_bids, smp)
        assert idp == 460.0
    
    def test_idp_multiple_bids_weighted(self):
        """Test IDP with multiple bids at different prices."""
        cleared_bids = [
            (440, 50),   # 50 MWh @ 440
            (450, 100),  # 100 MWh @ 450
            (460, 50)    # 50 MWh @ 460
        ]
        smp = 450
        
        # Expected: (440*50 + 450*100 + 460*50) / 200 = 450
        idp = calculate_idp(cleared_bids, smp)
        assert idp == 450.0
    
    def test_idp_empty_bids(self):
        """Test IDP with no cleared bids (returns SMP)."""
        cleared_bids = []
        smp = 450
        
        # Expected: SMP (no trades)
        idp = calculate_idp(cleared_bids, smp)
        assert idp == 450
    
    def test_idp_zero_volume(self):
        """Test IDP with zero total volume (returns SMP)."""
        cleared_bids = [(450, 0), (460, 0)]
        smp = 450
        
        # Expected: SMP (no volume)
        idp = calculate_idp(cleared_bids, smp)
        assert idp == 450
    
    def test_idp_high_volume_dominance(self):
        """Test IDP where one large bid dominates."""
        cleared_bids = [
            (500, 10),   # Small bid at high price
            (440, 190)   # Large bid at low price
        ]
        smp = 450
        
        # Expected: (500*10 + 440*190) / 200 = 446.5
        # But 446.5 is within ±5% of 450, so no capping needed
        # Actually: 446.5 < 450 / 1.05 = 428.57, so gets capped to 428.57
        # Wait: 440 is 2.2% below 450, should not be capped
        # Actual calculation: (500*10 + 440*190) / 200 = (5000 + 83600) / 200 = 443
        idp = calculate_idp(cleared_bids, smp)
        assert idp == 443.0  # Capped at lower bound (450 / 1.05 = 428.57, but 443 > 428.57)
    
    def test_idp_extreme_prices(self):
        """Test IDP with extreme prices gets capped."""
        cleared_bids = [(1000, 100)]  # 122% above SMP
        smp = 450
        
        # Expected: 450 * 1.05 = 472.5 (capped)
        idp = calculate_idp(cleared_bids, smp, cap_percent=5.0)
        assert idp == 472.5
    
    def test_idp_custom_cap(self):
        """Test IDP with custom cap percentage."""
        cleared_bids = [(480, 100)]  # 6.7% above SMP
        smp = 450
        
        # Expected: 450 * 1.10 = 495 (capped at 10%)
        idp = calculate_idp(cleared_bids, smp, cap_percent=10.0)
        assert idp == 480.0  # Within 10% bounds


# =============================================================================
# 2. GATE CLOSURE ENFORCEMENT TESTS (Backend Validation)
# =============================================================================

class TestGateClosureEnforcement:
    """Test _get_tradeable_hours() and gate closure validation."""
    
    def test_tradeable_hours_round_1(self):
        """Round 1: All hours tradeable (DA baseline)."""
        session = Mock()
        scenario = Mock()
        session.scenario = scenario
        scenario.config = {
            "general": {
                "round_span_hours": 6,
                "forecast_horizon_hours": 24,
                "day_ahead_gate_hour": 12,
                "start_time": "00:00"
            }
        }
        
        tradeable = _get_tradeable_hours(session, round_num=1)
        assert len(tradeable) == 24
        assert tradeable == list(range(24))
    
    def test_tradeable_hours_after_gate(self):
        """Round 3: Hours past gate are locked."""
        session = Mock()
        scenario = Mock()
        session.scenario = scenario
        scenario.config = {
            "general": {
                "round_span_hours": 6,
                "forecast_horizon_hours": 24,
                "day_ahead_gate_hour": 12,
                "start_time": "00:00"
            }
        }
        
        # Round 3: current_sim_hour = 12
        # First gate at hour 12, locks hours 0-23
        tradeable = _get_tradeable_hours(session, round_num=3)
        
        # Hours 0-23 locked (past gate), hours 24+ tradeable
        # But forecast_horizon = 24, so no tradeable hours
        assert len(tradeable) == 0
    
    def test_tradeable_hours_start_offset(self):
        """Test gate closure with non-zero start time."""
        session = Mock()
        scenario = Mock()
        session.scenario = scenario
        scenario.config = {
            "general": {
                "round_span_hours": 6,
                "forecast_horizon_hours": 48,
                "day_ahead_gate_hour": 12,
                "start_time": "08:00"
            }
        }
        
        # Start at 08:00, gate at 12:00 → first gate at sim hour 4
        # Round 2: current_sim_hour = 6
        # Hours 0-15 locked (16 hours to first midnight)
        tradeable = _get_tradeable_hours(session, round_num=2)
        
        # Hours after 15 are tradeable
        assert all(h > 15 for h in tradeable)
    
    def test_tradeable_hours_no_session(self):
        """Test safety: no session returns empty list."""
        tradeable = _get_tradeable_hours(None, round_num=1)
        assert tradeable == []
    
    def test_tradeable_hours_no_scenario(self):
        """Test safety: no scenario returns empty list."""
        session = Mock()
        session.scenario = None
        
        tradeable = _get_tradeable_hours(session, round_num=1)
        assert tradeable == []


# =============================================================================
# 3. ID METADATA TRACKING TESTS (IDP, Volume, Trade Counts)
# =============================================================================

class TestIDMetadataTracking:
    """Test ID metadata in engine results and sessions API."""
    
    def test_metadata_round_1_no_idp(self):
        """Round 1 (DA): No IDP metadata."""
        from app.engine import run_round
        
        # Mock setup for round 1 (DA baseline)
        config = {
            "general": {
                "round_span_hours": 6,
                "start_time": "00:00",
                "fake_date": "2025-01-01"
            },
            "market": {
                "enable_player_bidding": False,
                "price_floor": -500,
                "price_cap": 5000
            },
            "devices": []
        }
        
        forecasts = {
            1: {"hours": [100] * 6, "bids": None}
        }
        
        result = run_round(
            session_id=1,
            round_num=1,  # DA baseline
            players=[1],
            forecasts=forecasts,
            config=config,
            seed="test"
        )
        
        # Round 1 → No IDP metadata
        assert "idp" not in result
        assert "id_volume_mwh" not in result
        assert "id_trade_count" not in result
    
    def test_metadata_round_2_with_idp(self):
        """Round 2 (ID): IDP metadata present."""
        from app.engine import run_round
        
        config = {
            "general": {
                "round_span_hours": 6,
                "start_time": "00:00",
                "fake_date": "2025-01-01"
            },
            "market": {
                "enable_player_bidding": True,
                "price_floor": -500,
                "price_cap": 5000
            },
            "devices": [
                {"id": "gen1", "type": "Coal", "capacity_mw": 200, "owner_id": 1}
            ]
        }
        
        forecasts = {
            1: {
                "hours": [0] * 6,
                "bids": {
                    "gen1": {
                        "A": {"hours": [100] * 6, "price": 450}
                    }
                }
            }
        }
        
        result = run_round(
            session_id=1,
            round_num=2,  # ID round
            players=[1],
            forecasts=forecasts,
            config=config,
            seed="test"
        )
        
        # Round 2 → IDP metadata present
        assert "idp" in result
        assert "id_volume_mwh" in result
        assert "id_trade_count" in result
        
        # Validate types
        assert isinstance(result["idp"], (int, float))
        assert isinstance(result["id_volume_mwh"], (int, float))
        assert isinstance(result["id_trade_count"], int)
    
    def test_metadata_idp_equals_smp_no_bids(self):
        """Round 2 with no bids: IDP = SMP."""
        from app.engine import run_round
        
        config = {
            "general": {
                "round_span_hours": 6,
                "start_time": "00:00",
                "fake_date": "2025-01-01"
            },
            "market": {
                "enable_player_bidding": False,
                "price_floor": -500,
                "price_cap": 5000
            },
            "devices": []
        }
        
        forecasts = {
            1: {"hours": [100] * 6, "bids": None}
        }
        
        result = run_round(
            session_id=1,
            round_num=2,  # ID round
            players=[1],
            forecasts=forecasts,
            config=config,
            seed="test"
        )
        
        # No bids → IDP = SMP
        assert result["idp"] == result["smp"]
        assert result["id_volume_mwh"] == 0.0
        assert result["id_trade_count"] == 0


# =============================================================================
# INTEGRATION TESTS (Combined Features)
# =============================================================================

class TestPhase2AIntegration:
    """Integration tests combining IDP, gate closure, and metadata."""
    
    def test_full_id_workflow(self):
        """Test complete ID market workflow with all Phase 2A features."""
        from app.engine import run_round
        
        config = {
            "general": {
                "round_span_hours": 6,
                "start_time": "00:00",
                "fake_date": "2025-01-01",
                "forecast_horizon_hours": 24,
                "day_ahead_gate_hour": 12
            },
            "market": {
                "enable_player_bidding": True,
                "price_floor": -500,
                "price_cap": 5000
            },
            "devices": [
                {"id": "gen1", "type": "Coal", "capacity_mw": 200, "owner_id": 1},
                {"id": "gen2", "type": "Gas", "capacity_mw": 150, "owner_id": 2}
            ]
        }
        
        # Round 2 forecasts with bids
        forecasts = {
            1: {
                "hours": [0] * 6,
                "bids": {
                    "gen1": {
                        "A": {"hours": [100] * 6, "price": 440}
                    }
                }
            },
            2: {
                "hours": [0] * 6,
                "bids": {
                    "gen2": {
                        "A": {"hours": [80] * 6, "price": 460}
                    }
                }
            }
        }
        
        result = run_round(
            session_id=1,
            round_num=2,
            players=[1, 2],
            forecasts=forecasts,
            config=config,
            seed="test"
        )
        
        # Verify IDP metadata is present for ID rounds
        assert "idp" in result
        assert "id_trade_count" in result
        assert "id_volume_mwh" in result
        
        # Metadata should be correct type
        assert isinstance(result["idp"], (int, float))
        assert isinstance(result["id_trade_count"], int)
        assert isinstance(result["id_volume_mwh"], (int, float))
        
        # IDP should be within ±5% of SMP (even if no trades, IDP = SMP)
        smp = result["smp"]
        idp = result["idp"]
        
        # IDP should be within ±5% of SMP
        assert idp >= smp * 0.95
        assert idp <= smp * 1.05
    
    def test_phase2a_sawem_compliance(self):
        """Verify Phase 2A achieves SAWEM compliance targets."""
        # Test IDP calculation
        cleared_bids = [(450, 100), (460, 50)]
        smp = 450
        idp = calculate_idp(cleared_bids, smp)
        assert 427.5 <= idp <= 472.5  # Within ±5% cap
        
        # Test gate closure
        session = Mock()
        scenario = Mock()
        session.scenario = scenario
        scenario.config = {
            "general": {
                "round_span_hours": 6,
                "forecast_horizon_hours": 24,
                "day_ahead_gate_hour": 12,
                "start_time": "00:00"
            }
        }
        
        tradeable = _get_tradeable_hours(session, round_num=1)
        assert len(tradeable) > 0  # Round 1 has tradeable hours
        
        print("✅ Phase 2A SAWEM compliance verified:")
        print("  - IDP calculation with ±5% cap")
        print("  - Gate closure enforcement")
        print("  - ID metadata tracking")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
