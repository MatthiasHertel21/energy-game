"""
Tests for Phase 1 Market Code Implementation:
1. Pro-rata Tie-Breaking
2. Monotonicity Validation
3. Inflexible Units Filter for SMP
"""

import pytest
from app.engine import clear_market
from app.device_types import validate_bid_monotonicity


class TestProRataTieBreaking:
    """Test pro-rata allocation when multiple bids have identical price"""
    
    def test_no_tie_normal_clearing(self):
        """No tie, normal market clearing"""
        supply = [(100, 50), (200, 50), (300, 50)]
        demand = [(400, 150)]
        
        price, volume = clear_market(supply, demand)
        
        assert volume == 150  # All supply cleared
        assert price == 300  # SMP at marginal unit
    
    def test_simple_tie_full_allocation(self):
        """Two bids at same price, both fully allocated"""
        supply = [
            (100, 50),   # Unit 1
            (100, 50),   # Unit 2 (same price)
            (200, 100),
        ]
        demand = [(300, 200)]
        
        price, volume = clear_market(supply, demand)
        
        # Both units at 100 ZAR/MWh should be dispatched (100 MW total)
        # Plus 100 MW from 200 ZAR/MWh unit = 200 MW
        assert volume == 200
        assert price == 200  # SMP at last dispatched
    
    def test_pro_rata_partial_allocation(self):
        """Three bids at same price, pro-rata allocation needed"""
        supply = [
            (100, 50),   # Unit 1: 50/150 = 33.3%
            (100, 60),   # Unit 2: 60/150 = 40%
            (100, 40),   # Unit 3: 40/150 = 26.7%
            (200, 100),
        ]
        demand = [(300, 120)]  # Only 120 MW needed from 150 MW available at 100
        
        price, volume = clear_market(supply, demand)
        
        # Pro-rata: Each unit gets (their_volume / total_volume) * demand
        # Unit 1: 50/150 * 120 = 40 MW
        # Unit 2: 60/150 * 120 = 48 MW
        # Unit 3: 40/150 * 120 = 32 MW
        # Total: 120 MW
        assert volume == 120
        assert price == 100  # SMP at marginal (tied) price
    
    def test_tie_breaking_with_multiple_price_levels(self):
        """Ties at one level, normal clearing at others"""
        supply = [
            (50, 30),
            (100, 40),   # Tie starts
            (100, 40),
            (100, 40),   # Tie ends (120 MW total at 100)
            (200, 50),
        ]
        demand = [(300, 180)]
        
        price, volume = clear_market(supply, demand)
        
        # 30 MW at 50 + 120 MW at 100 + 30 MW at 200 = 180 MW
        assert volume == 180
        assert price == 200


class TestInflexibleUnitsFilter:
    """Test that inflexible units (must-run, at min_load) don't set SMP"""
    
    def test_nuclear_must_run_not_setting_smp(self):
        """Nuclear (must-run) should not set SMP, next flexible unit should"""
        supply = [
            (50, 100),    # Nuclear (must-run)
            (80, 50),     # Coal (flexible)
            (120, 50),
        ]
        demand = [(200, 150)]
        
        # With metadata marking first unit as must_run
        metadata = [
            {'device_type': 'nuclear', 'must_run': True},
            {'device_type': 'coal', 'must_run': False},
            {'device_type': 'coal', 'must_run': False},
        ]
        
        price, volume = clear_market(supply, demand, supply_metadata=metadata)
        
        # All 150 MW dispatched, but SMP should be 80 (first flexible unit)
        # not 50 (nuclear must-run)
        assert volume == 150
        assert price == 80  # Skip nuclear, use coal as marginal
    
    def test_all_flexible_units_normal_smp(self):
        """All flexible units, normal SMP determination"""
        supply = [
            (50, 100),
            (80, 50),
        ]
        demand = [(200, 150)]
        
        metadata = [
            {'device_type': 'coal', 'must_run': False},
            {'device_type': 'coal', 'must_run': False},
        ]
        
        price, volume = clear_market(supply, demand, supply_metadata=metadata)
        
        assert volume == 150
        assert price == 80  # Normal marginal price
    
    def test_unit_at_min_load_inflexible(self):
        """Unit running at minimum load is inflexible"""
        supply = [
            (50, 100),   # At min_load (inflexible)
            (80, 50),    # Flexible
            (120, 50),
        ]
        demand = [(200, 150)]
        
        metadata = [
            {'device_type': 'coal', 'at_min_load': True},
            {'device_type': 'coal', 'at_min_load': False},
            {'device_type': 'gas', 'at_min_load': False},
        ]
        
        price, volume = clear_market(supply, demand, supply_metadata=metadata)
        
        assert volume == 150
        assert price == 80  # Skip inflexible unit at min_load
    
    def test_no_metadata_uses_all_units(self):
        """Without metadata, all units can set SMP (backward compatible)"""
        supply = [
            (50, 100),
            (80, 50),
        ]
        demand = [(200, 150)]
        
        price, volume = clear_market(supply, demand)  # No metadata
        
        assert volume == 150
        assert price == 80


class TestMonotonicityValidation:
    """Test bid price monotonicity validation (SAWEM requirement)"""
    
    def test_valid_monotonic_bids(self):
        """Valid ascending prices A <= B <= C"""
        bids = {
            'A': {'price': 100, 'hours': [50] * 24},
            'B': {'price': 150, 'hours': [30] * 24},
            'C': {'price': 200, 'hours': [20] * 24},
        }
        
        errors = validate_bid_monotonicity(bids)
        
        assert errors == []
    
    def test_equal_prices_allowed(self):
        """Equal prices are allowed (A == B == C)"""
        bids = {
            'A': {'price': 100, 'hours': [50] * 24},
            'B': {'price': 100, 'hours': [30] * 24},
            'C': {'price': 100, 'hours': [20] * 24},
        }
        
        errors = validate_bid_monotonicity(bids)
        
        assert errors == []
    
    def test_a_greater_than_b_violation(self):
        """A > B violates monotonicity"""
        bids = {
            'A': {'price': 150, 'hours': [50] * 24},
            'B': {'price': 100, 'hours': [30] * 24},  # Lower than A
            'C': {'price': 200, 'hours': [20] * 24},
        }
        
        errors = validate_bid_monotonicity(bids)
        
        assert len(errors) > 0
        assert 'Bid A' in errors[0]
        assert 'Bid B' in errors[0]
        assert 'monotonicity' in errors[0].lower()
    
    def test_b_greater_than_c_violation(self):
        """B > C violates monotonicity"""
        bids = {
            'A': {'price': 100, 'hours': [50] * 24},
            'B': {'price': 200, 'hours': [30] * 24},
            'C': {'price': 150, 'hours': [20] * 24},  # Lower than B
        }
        
        errors = validate_bid_monotonicity(bids)
        
        assert len(errors) > 0
        assert 'Bid B' in errors[0]
        assert 'Bid C' in errors[0]
    
    def test_a_greater_than_c_without_b(self):
        """A > C without B present"""
        bids = {
            'A': {'price': 200, 'hours': [50] * 24},
            'C': {'price': 100, 'hours': [20] * 24},  # Lower than A
        }
        
        errors = validate_bid_monotonicity(bids)
        
        assert len(errors) > 0
        assert 'Bid A' in errors[0]
        assert 'Bid C' in errors[0]
    
    def test_single_bid_no_violation(self):
        """Single bid has no monotonicity constraint"""
        bids = {
            'A': {'price': 150, 'hours': [50] * 24},
        }
        
        errors = validate_bid_monotonicity(bids)
        
        assert errors == []
    
    def test_empty_bids(self):
        """Empty bids dict is valid"""
        errors = validate_bid_monotonicity({})
        assert errors == []
    
    def test_missing_price_field(self):
        """Missing price field is gracefully handled"""
        bids = {
            'A': {'hours': [50] * 24},  # No price
            'B': {'price': 100, 'hours': [30] * 24},
        }
        
        # Should not crash, just skip validation
        errors = validate_bid_monotonicity(bids)
        assert isinstance(errors, list)


class TestIntegration:
    """Integration tests combining multiple features"""
    
    def test_tie_breaking_with_inflexible_units(self):
        """Pro-rata allocation with inflexible units filter"""
        supply = [
            (50, 100),   # Nuclear must-run
            (100, 50),   # Coal tie
            (100, 50),   # Coal tie
            (200, 50),
        ]
        demand = [(300, 180)]
        
        metadata = [
            {'device_type': 'nuclear', 'must_run': True},
            {'device_type': 'coal', 'must_run': False},
            {'device_type': 'coal', 'must_run': False},
            {'device_type': 'gas', 'must_run': False},
        ]
        
        price, volume = clear_market(supply, demand, supply_metadata=metadata)
        
        # 100 MW nuclear + 80 MW coal (pro-rata of 100 MW) = 180 MW
        assert volume == 180
        assert price == 100  # First flexible unit (coal tie)
    
    def test_full_market_code_compliance(self):
        """Test all three features together in realistic scenario"""
        # Realistic SA market: Nuclear base, Coal mid, Gas peak
        supply = [
            (80, 900),    # Nuclear (must-run, 900 MW @ 80 ZAR/MWh)
            (350, 200),   # Coal 1
            (350, 200),   # Coal 2 (tied)
            (400, 150),   # Coal 3
            (1200, 100),  # Gas (peaking)
        ]
        demand = [(2000, 1400)]
        
        metadata = [
            {'device_type': 'nuclear', 'must_run': True},
            {'device_type': 'coal'},
            {'device_type': 'coal'},
            {'device_type': 'coal'},
            {'device_type': 'gas'},
        ]
        
        price, volume = clear_market(supply, demand, supply_metadata=metadata)
        
        # 900 MW nuclear + 400 MW coal (pro-rata tie) + 100 MW coal 3 = 1400 MW
        assert volume == 1400
        assert price == 400  # SMP at Coal 3, skipping nuclear
