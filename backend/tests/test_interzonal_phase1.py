import unittest

from app.engine import _build_player_zone_and_role_maps, _compute_interzonal_round_outputs, clear_market_coupled_atc
from app.kse import validate_config


def _base_config(zones=2):
    return {
        "general": {
            "horizon_hours": 24,
            "round_span_hours": 24,
            "rounds": 1,
            "forecast_horizon_hours": 24,
            "player_zone": 1,
        },
        "market": {
            "consumer_mix": {},
        },
        "grid": {
            "zones": zones,
            "atc": [[0 if i == j else 0 for j in range(zones)] for i in range(zones)],
            "losses_pct_per_link": 0,
            "network_settlement": {
                "extra_cost_mode": "zonal_only",
                "cost_allocation_target": "consumers_only",
                "shortfall_price_mode": "smp_multiplier",
                "shortfall_price_value": 2.0,
            },
            "generator_curtailment_mode": "pro_rata",
        },
        "environment": {
            "groups": {},
        },
        "devices": [],
        "player_types": [],
    }


class TestInterzonalPhase1(unittest.TestCase):
    def test_validate_config_accepts_explicit_zone_distributions_and_player_type_zones(self):
        cfg = _base_config(zones=3)
        cfg["devices"] = [
            {"id": "gen", "type": "SOLAR", "max_power_mw": 100},
            {"id": "load", "type": "industrial_load", "baseline_load_mw": 80, "peak_load_mw": 100},
        ]
        cfg["player_types"] = [
            {"id": "producer", "name": "Producer", "zone": 1, "devices": ["gen"]},
            {"id": "consumer", "name": "Consumer", "zone": 3, "devices": ["load"]},
        ]
        cfg["environment"]["groups"] = {
            "solar": {"blocks": 40, "zone_distribution_pct": [50, 30, 20]},
        }
        cfg["market"]["consumer_mix"] = {
            "residential": {"blocks": 60, "zone_distribution_pct": [20, 30, 50]},
        }

        errors = validate_config(cfg)

        self.assertEqual(errors, [])

    def test_validate_config_rejects_invalid_zone_distribution_and_player_zone(self):
        cfg = _base_config(zones=3)
        cfg["devices"] = [
            {"id": "gen", "type": "SOLAR", "max_power_mw": 100},
        ]
        cfg["player_types"] = [
            {"id": "producer", "name": "Producer", "zone": 4, "devices": ["gen"]},
        ]
        cfg["environment"]["groups"] = {
            "solar": {"blocks": 40, "zone_distribution_pct": [50, 30]},
        }
        cfg["market"]["consumer_mix"] = {
            "residential": {"blocks": 60, "zone_distribution_pct": [20, 30, 40]},
        }

        errors = validate_config(cfg)

        self.assertTrue(any("environment.groups.solar.zone_distribution_pct must have length = zones" in error for error in errors))
        self.assertTrue(any("market.consumer_mix.residential.zone_distribution_pct must sum to 100" in error for error in errors))
        self.assertTrue(any("player_types[producer].zone must be within [1, zones]" in error for error in errors))

    def test_validate_config_requires_player_type_zones_in_v1_and_rejects_legacy_player_zone(self):
        cfg = _base_config(zones=2)
        cfg["general"]["zonal_pricing_v1_enabled"] = True
        cfg["devices"] = [
            {"id": "gen", "type": "SOLAR", "max_power_mw": 100},
        ]
        cfg["player_types"] = [
            {"id": "producer", "name": "Producer", "devices": ["gen"]},
        ]

        errors = validate_config(cfg)

        self.assertTrue(any("V1 multi-zone scenarios require player_types[].zone" in error for error in errors))
        self.assertTrue(any("general.player_zone is not allowed" in error for error in errors))

    def test_build_player_zone_map_ignores_legacy_player_zone_when_v1_enabled(self):
        cfg = _base_config(zones=2)
        cfg["general"]["player_zone"] = 2
        cfg["general"]["zonal_pricing_v1_enabled"] = True
        cfg["devices"] = [
            {"id": "gen", "type": "SOLAR", "max_power_mw": 100},
        ]
        cfg["player_types"] = [
            {"id": "producer", "name": "Producer", "zone": 1, "devices": ["gen"]},
        ]

        zone_map, role_map = _build_player_zone_and_role_maps(cfg, [1], {1: "producer"})

        self.assertEqual(zone_map[1], 1)
        self.assertEqual(role_map[1], "producer")

    def test_validate_config_rejects_unimplemented_extra_cost_modes(self):
        cfg = _base_config(zones=2)
        cfg["grid"]["network_settlement"]["extra_cost_mode"] = "fully_socialized"

        errors = validate_config(cfg)

        self.assertTrue(any("grid.network_settlement.extra_cost_mode invalid" in error for error in errors))

    def test_interzonal_outputs_allocate_shortfall_costs_to_consumers_and_curtail_producers(self):
        config = _base_config(zones=2)
        config["devices"] = [
            {"id": "gen", "type": "GAS", "max_power_mw": 100, "cost_zar_per_mwh": 10},
            {"id": "load", "type": "industrial_load", "baseline_load_mw": 80, "peak_load_mw": 100},
        ]
        config["player_types"] = [
            {"id": "producer", "name": "Producer", "zone": 1, "devices": ["gen"]},
            {"id": "consumer", "name": "Consumer", "zone": 2, "devices": ["load"]},
        ]

        hourly_results = [{"volume": 100.0, "smp": 100.0}]
        per_player = {
            1: {
                "revenue_zar": 10000.0,
                "profit_zar": 9000.0,
                "variable_cost_zar": 1000.0,
                "fixed_cost_zar": 0.0,
                "imbalance_cost_zar": 0.0,
                "congestion_revenue_zar": 0.0,
                "dispatched_mwh": 100.0,
                "hourly_breakdown": [{"dispatched_mw": 100.0}],
            },
            2: {
                "revenue_zar": -10000.0,
                "profit_zar": -10000.0,
                "variable_cost_zar": 0.0,
                "fixed_cost_zar": 0.0,
                "imbalance_cost_zar": 0.0,
                "congestion_revenue_zar": 0.0,
                "dispatched_mwh": 100.0,
                "hourly_breakdown": [{"dispatched_mw": 100.0}],
            },
        }

        zone_results, link_results, player_zone_info, per_player_grid_cost, per_player_curtailed_mwh, per_player_lost_revenue, _, _ = _compute_interzonal_round_outputs(
            hourly_results,
            per_player,
            config,
            [1, 2],
            {1: "producer", 2: "consumer"},
        )

        zone_by_id = {entry["zone_id"]: entry for entry in zone_results}
        self.assertEqual(link_results, [])
        self.assertEqual(zone_by_id[1]["status"], "local_supply_sufficient")
        self.assertEqual(zone_by_id[2]["status"], "supply_shortfall")
        self.assertAlmostEqual(zone_by_id[2]["unserved_demand_mwh"], 100.0)
        self.assertAlmostEqual(zone_by_id[2]["extra_cost_total_zar"], 20000.0)
        self.assertAlmostEqual(per_player_grid_cost[1], 0.0)
        self.assertAlmostEqual(per_player_grid_cost[2], 20000.0)
        self.assertAlmostEqual(per_player_curtailed_mwh[1], 100.0)
        self.assertAlmostEqual(per_player_lost_revenue[1], 10000.0)
        self.assertEqual(player_zone_info[2]["zone_status"], "supply_shortfall")
        self.assertAlmostEqual(player_zone_info[2]["zone_unserved_demand_mwh"], 100.0)

    def test_interzonal_outputs_route_via_indirect_path_deterministically(self):
        config = _base_config(zones=3)
        config["grid"]["atc"] = [
            [0, 100, 0],
            [100, 0, 100],
            [0, 100, 0],
        ]
        config["devices"] = [
            {"id": "gen", "type": "GAS", "max_power_mw": 100, "cost_zar_per_mwh": 10},
            {"id": "load", "type": "industrial_load", "baseline_load_mw": 70, "peak_load_mw": 90},
        ]
        config["player_types"] = [
            {"id": "producer", "name": "Producer", "zone": 1, "devices": ["gen"]},
            {"id": "consumer", "name": "Consumer", "zone": 3, "devices": ["load"]},
        ]

        hourly_results = [{"volume": 90.0, "smp": 100.0}]
        per_player = {
            1: {
                "revenue_zar": 9000.0,
                "profit_zar": 8000.0,
                "variable_cost_zar": 1000.0,
                "fixed_cost_zar": 0.0,
                "imbalance_cost_zar": 0.0,
                "congestion_revenue_zar": 0.0,
                "dispatched_mwh": 100.0,
                "hourly_breakdown": [{"dispatched_mw": 100.0}],
            },
            2: {
                "revenue_zar": -9000.0,
                "profit_zar": -9000.0,
                "variable_cost_zar": 0.0,
                "fixed_cost_zar": 0.0,
                "imbalance_cost_zar": 0.0,
                "congestion_revenue_zar": 0.0,
                "dispatched_mwh": 90.0,
                "hourly_breakdown": [{"dispatched_mw": 90.0}],
            },
        }

        zone_results, link_results, player_zone_info, per_player_grid_cost, per_player_curtailed_mwh, per_player_lost_revenue, _, _ = _compute_interzonal_round_outputs(
            hourly_results,
            per_player,
            config,
            [1, 2],
            {1: "producer", 2: "consumer"},
        )

        zone_by_id = {entry["zone_id"]: entry for entry in zone_results}
        link_by_pair = {(entry["from_zone"], entry["to_zone"]): entry for entry in link_results}
        self.assertEqual(zone_by_id[3]["status"], "grid_supported_supply")
        self.assertAlmostEqual(zone_by_id[3]["unserved_demand_mwh"], 0.0)
        self.assertAlmostEqual(per_player_grid_cost[2], 0.0)
        self.assertIn((1, 2), link_by_pair)
        self.assertIn((2, 3), link_by_pair)
        self.assertNotIn((1, 3), link_by_pair)
        self.assertAlmostEqual(link_by_pair[(1, 2)]["flow_mwh"], 90.0)
        self.assertAlmostEqual(link_by_pair[(2, 3)]["flow_mwh"], 90.0)
        self.assertEqual(player_zone_info[2]["zone_status"], "grid_supported_supply")
        self.assertEqual(len(player_zone_info[2]["zone_links"]), 1)
        self.assertAlmostEqual(per_player_curtailed_mwh[1], 10.0)
        self.assertAlmostEqual(per_player_lost_revenue[1], 1000.0)

    def test_clear_market_coupled_atc_keeps_uniform_prices_without_binding_link(self):
        zone_supply = [
            [(100.0, 100.0)],
            [(200.0, 100.0)],
        ]
        zone_demand = [
            [(1000.0, 40.0)],
            [(1000.0, 60.0)],
        ]

        result = clear_market_coupled_atc(
            zone_supply,
            zone_demand,
            atc=[[0.0, 100.0], [100.0, 0.0]],
            losses_pct_per_link=0.0,
            price_floor=-500.0,
            price_cap=5000.0,
        )

        self.assertFalse(result["zonal_pricing_active"])
        self.assertEqual(result["zone_prices"], [100.0, 100.0])
        self.assertAlmostEqual(result["zone_supply_volume_mwh"][0], 100.0)
        self.assertAlmostEqual(result["zone_demand_volume_mwh"][1], 60.0)
        self.assertAlmostEqual(result["interzonal_flows"][(1, 2)]["flow_mwh"], 60.0)
        self.assertAlmostEqual(result["congestion_rents"][(1, 2)]["congestion_rent_zar"], 0.0)

    def test_clear_market_coupled_atc_splits_prices_when_atc_binds(self):
        zone_supply = [
            [(100.0, 100.0)],
            [(400.0, 100.0)],
        ]
        zone_demand = [
            [(1000.0, 20.0)],
            [(1000.0, 100.0)],
        ]

        result = clear_market_coupled_atc(
            zone_supply,
            zone_demand,
            atc=[[0.0, 40.0], [40.0, 0.0]],
            losses_pct_per_link=0.0,
            price_floor=-500.0,
            price_cap=5000.0,
        )

        self.assertTrue(result["zonal_pricing_active"])
        self.assertLess(result["zone_prices"][0], result["zone_prices"][1])
        self.assertAlmostEqual(result["interzonal_flows"][(1, 2)]["flow_mwh"], 40.0)
        self.assertIn((1, 2), result["binding_links"])
        self.assertGreater(result["congestion_rents"][(1, 2)]["congestion_rent_zar"], 0.0)

    def test_clear_market_coupled_atc_tracks_multi_hop_losses(self):
        zone_supply = [
            [(100.0, 120.0)],
            [],
            [(500.0, 20.0)],
        ]
        zone_demand = [
            [(1000.0, 20.0)],
            [(1000.0, 20.0)],
            [(1000.0, 80.0)],
        ]

        result = clear_market_coupled_atc(
            zone_supply,
            zone_demand,
            atc=[
                [0.0, 60.0, 0.0],
                [60.0, 0.0, 60.0],
                [0.0, 60.0, 0.0],
            ],
            losses_pct_per_link=10.0,
            price_floor=-500.0,
            price_cap=5000.0,
        )

        self.assertGreater(result["interzonal_flows"][(1, 2)]["losses_mwh"], 0.0)
        self.assertGreater(result["interzonal_flows"][(2, 3)]["losses_mwh"], 0.0)
        self.assertGreater(result["congestion_rents"][(1, 2)]["losses_value_zar"], 0.0)

    def test_shortfall_cost_allocation_uses_chargeable_player_consumption(self):
        config = _base_config(zones=2)
        config["devices"] = [
            {"id": "gen", "type": "GAS", "max_power_mw": 100, "cost_zar_per_mwh": 10},
            {"id": "load", "type": "industrial_load", "baseline_load_mw": 20, "peak_load_mw": 20},
        ]
        config["player_types"] = [
            {"id": "producer", "name": "Producer", "zone": 1, "devices": ["gen"]},
            {"id": "consumer", "name": "Consumer", "zone": 2, "devices": ["load"]},
        ]
        config["market"]["consumer_mix"] = {
            "synthetic": {"blocks": 1, "zone_distribution_pct": [0, 100]},
        }
        config["grid"]["network_settlement"]["shortfall_price_mode"] = "fixed_price"
        config["grid"]["network_settlement"]["shortfall_price_value"] = 100

        hourly_results = [{"volume": 100.0, "smp": 50.0}]
        per_player = {
            1: {
                "dispatched_mwh": 0.0,
                "variable_cost_zar": 0.0,
                "hourly_breakdown": [{"dispatched_mw": 0.0}],
            },
            2: {
                "dispatched_mwh": 20.0,
                "variable_cost_zar": 0.0,
                "hourly_breakdown": [{"dispatched_mw": 20.0}],
            },
        }

        zone_results, _, _, per_player_grid_cost, _, _, _, _ = _compute_interzonal_round_outputs(
            hourly_results,
            per_player,
            config,
            [1, 2],
            {1: "producer", 2: "consumer"},
        )

        self.assertAlmostEqual(zone_results[1]["extra_cost_total_zar"], 5000.0)
        self.assertAlmostEqual(sum(per_player_grid_cost.values()), 5000.0)
        self.assertAlmostEqual(per_player_grid_cost[2], 5000.0)

    def test_multi_hop_link_metrics_accumulate_flow_and_losses_correctly(self):
        config = _base_config(zones=3)
        config["grid"]["atc"] = [
            [0, 100, 0],
            [100, 0, 100],
            [0, 100, 0],
        ]
        config["grid"]["losses_pct_per_link"] = 10
        config["grid"]["network_settlement"]["shortfall_price_mode"] = "fixed_price"
        config["grid"]["network_settlement"]["shortfall_price_value"] = 100
        config["devices"] = [
            {"id": "gen1", "type": "GAS", "max_power_mw": 60, "cost_zar_per_mwh": 10},
            {"id": "gen2", "type": "GAS", "max_power_mw": 60, "cost_zar_per_mwh": 10},
            {"id": "load", "type": "industrial_load", "baseline_load_mw": 114, "peak_load_mw": 114},
        ]
        config["player_types"] = [
            {"id": "producer_1", "name": "Producer 1", "zone": 1, "devices": ["gen1"]},
            {"id": "producer_2", "name": "Producer 2", "zone": 2, "devices": ["gen2"]},
            {"id": "consumer", "name": "Consumer", "zone": 3, "devices": ["load"]},
        ]

        hourly_results = [{"volume": 114.0, "smp": 50.0}]
        per_player = {
            1: {
                "dispatched_mwh": 60.0,
                "variable_cost_zar": 0.0,
                "hourly_breakdown": [{"dispatched_mw": 60.0}],
            },
            2: {
                "dispatched_mwh": 60.0,
                "variable_cost_zar": 0.0,
                "hourly_breakdown": [{"dispatched_mw": 60.0}],
            },
            3: {
                "dispatched_mwh": 114.0,
                "variable_cost_zar": 0.0,
                "hourly_breakdown": [{"dispatched_mw": 114.0}],
            },
        }

        zone_results, link_results, _, _, _, _, _, _ = _compute_interzonal_round_outputs(
            hourly_results,
            per_player,
            config,
            [1, 2, 3],
            {1: "producer_1", 2: "producer_2", 3: "consumer"},
        )

        link_by_pair = {(entry["from_zone"], entry["to_zone"]): entry for entry in link_results}
        self.assertAlmostEqual(link_by_pair[(1, 2)]["flow_mwh"], 44.444, places=3)
        self.assertAlmostEqual(link_by_pair[(1, 2)]["losses_mwh"], 4.444, places=3)
        self.assertAlmostEqual(link_by_pair[(2, 3)]["flow_mwh"], 100.0, places=3)
        self.assertAlmostEqual(link_by_pair[(2, 3)]["losses_mwh"], 10.0, places=3)
        self.assertAlmostEqual(link_by_pair[(2, 3)]["utilization_pct"], 100.0, places=3)
        self.assertTrue(link_by_pair[(2, 3)]["binding"])
        self.assertAlmostEqual(zone_results[2]["imports_mwh"], 90.0, places=3)
        self.assertAlmostEqual(zone_results[2]["unserved_demand_mwh"], 24.0, places=3)


if __name__ == "__main__":
    unittest.main()