"""
KSE Scenario Templates
Predefined configurations for common use cases
"""

TEMPLATES = {
    "standard_day": {
        "name": "Standard Day",
        "description": "Balanced 24-hour scenario with typical demand and generation mix",
        "config": {
            "general": {
                "horizon_hours": 24,
                "forecast_horizon_hours": 48,
                "round_span_hours": 6,
                "rounds": 4,
                "round_duration_seconds": 300,
                "player_zone": 1,
                "fake_date": "2024-06-15",  # Mid-June, moderate weather
                "start_time": "00:00"
            },
            "market": {
                "base_price": 1000,
                "base_volume_mwh": 20000,
                "price_floor": -500,
                "price_cap": 5000,
                "clearing_type": "uniform"
            },
            "balancing": {
                "up_price_zar_per_mwh": 1200.0,
                "down_price_zar_per_mwh": 800.0
            },
            "grid": {
                "zones": 2,
                "atc": [
                    [0, 5000],
                    [5000, 0]
                ],
                "losses_pct_per_link": 2.0,
                "network_settlement": {
                    "extra_cost_mode": "zonal_only",
                    "cost_allocation_target": "consumers_only",
                    "shortfall_price_mode": "smp_multiplier",
                    "shortfall_price_value": 2.0
                },
                "generator_curtailment_mode": "pro_rata"
            },
            "environment": {
                "seed": "standard-2024",
                "groups": {
                    "solar": {"blocks": 20, "zone_distribution_pct": [50, 50]},
                    "wind": {"blocks": 15, "zone_distribution_pct": [50, 50]},
                    "gas": {"blocks": 30, "zone_distribution_pct": [50, 50]},
                    "coal": {"blocks": 20, "zone_distribution_pct": [50, 50]},
                    "hydro": {"blocks": 10, "zone_distribution_pct": [50, 50]},
                    "nuclear": {"blocks": 5, "zone_distribution_pct": [50, 50]}
                }
            },
            "events": [
                {
                    "id": "peak_demand",
                    "type": "demand_surge",
                    "name": "Evening Peak",
                    "description": "Typical evening demand surge",
                    "trigger": {"type": "round", "value": 3},
                    "multiplier": 1.15,
                    "additive": 0,
                    "duration_rounds": 1,
                    "target": "demand"
                }
            ],
            "storage": {
                "efficiency_pct": 85,
                "capacity_mwh": 1000,
                "power_mw": 500,
                "initial_soc_pct": 50,
                "max_dod_pct": 80,
                "degradation_pct_per_cycle": 0.1
            },
            "scoring": {
                "weights": {
                    "profit": 0.6,
                    "imbalance": 0.3,
                    "curtailment": 0.1
                }
            }
        }
    },
    
    "high_renewables": {
        "name": "High Renewables",
        "description": "80% renewable energy with storage challenges and variability",
        "config": {
            "general": {
                "horizon_hours": 24,
                "forecast_horizon_hours": 48,
                "round_span_hours": 6,
                "rounds": 4,
                "round_duration_seconds": 300,
                "player_zone": 1,
                "fake_date": "2024-03-21",  # Spring equinox, good solar
                "start_time": "06:00"
            },
            "market": {
                "base_price": 800,
                "base_volume_mwh": 18000,
                "price_floor": -1000,  # Allow negative prices for RE curtailment
                "price_cap": 6000,
                "clearing_type": "uniform",
                "consumer_mix": {
                    "industrial": {"blocks": 400, "zone_distribution_pct": [35, 35, 30]},
                    "household": {"blocks": 500, "zone_distribution_pct": [45, 30, 25]},
                    "agriculture": {"blocks": 100, "zone_distribution_pct": [30, 40, 30]}
                }
            },
            "balancing": {
                "up_price_zar_per_mwh": 1200.0,
                "down_price_zar_per_mwh": 800.0
            },
            "grid": {
                "zones": 3,
                "atc": [
                    [0, 3000, 2000],
                    [3000, 0, 3000],
                    [2000, 3000, 0]
                ],
                "losses_pct_per_link": 2.0,
                "network_settlement": {
                    "extra_cost_mode": "zonal_only",
                    "cost_allocation_target": "consumers_only",
                    "shortfall_price_mode": "smp_multiplier",
                    "shortfall_price_value": 2.0
                },
                "generator_curtailment_mode": "pro_rata"
            },
            "environment": {
                "seed": "renewables-2024",
                "groups": {
                    "solar": {"blocks": 40, "zone_distribution_pct": [60, 25, 15]},
                    "wind": {"blocks": 40, "zone_distribution_pct": [20, 35, 45]},
                    "gas": {"blocks": 10, "zone_distribution_pct": [20, 50, 30]},
                    "coal": {"blocks": 5, "zone_distribution_pct": [25, 50, 25]},
                    "hydro": {"blocks": 3, "zone_distribution_pct": [30, 40, 30]},
                    "nuclear": {"blocks": 2, "zone_distribution_pct": [40, 40, 20]}
                }
            },
            "events": [
                {
                    "id": "cloud_cover",
                    "type": "renewable_drought",
                    "name": "Cloud Cover",
                    "description": "Sudden cloud cover reduces solar output",
                    "trigger": {"type": "round", "value": 2},
                    "multiplier": 0.3,
                    "additive": 0,
                    "duration_rounds": 1,
                    "target": "solar"
                },
                {
                    "id": "wind_lull",
                    "type": "renewable_drought",
                    "name": "Wind Lull",
                    "description": "Low wind speeds reduce generation",
                    "trigger": {"type": "round", "value": 3},
                    "multiplier": 0.4,
                    "additive": 0,
                    "duration_rounds": 1,
                    "target": "wind"
                },
                {
                    "id": "battery_stress",
                    "type": "battery_degradation",
                    "name": "Battery Stress",
                    "description": "High cycling accelerates degradation",
                    "trigger": {"type": "round", "value": 4},
                    "multiplier": 1.5,
                    "additive": 0,
                    "duration_rounds": 1,
                    "target": "storage"
                }
            ],
            "storage": {
                "efficiency_pct": 88,
                "capacity_mwh": 2000,
                "power_mw": 800,
                "initial_soc_pct": 40,
                "max_dod_pct": 85,
                "degradation_pct_per_cycle": 0.15
            },
            "scoring": {
                "weights": {
                    "profit": 0.5,
                    "imbalance": 0.25,
                    "curtailment": 0.25  # Penalize RE curtailment heavily
                }
            }
        }
    },
    
    "peak_winter": {
        "name": "Peak Winter",
        "description": "High demand winter scenario with supply constraints and coal/gas heavy",
        "config": {
            "general": {
                "horizon_hours": 24,
                "forecast_horizon_hours": 48,
                "round_span_hours": 6,
                "rounds": 4,
                "round_duration_seconds": 300,
                "player_zone": 1,
                "fake_date": "2024-07-15",  # Mid-winter (Southern Hemisphere)
                "start_time": "05:00"
            },
            "market": {
                "base_price": 1500,
                "base_volume_mwh": 28000,  # High winter demand
                "price_floor": 0,
                "price_cap": 8000,
                "clearing_type": "uniform",
                "consumer_mix": {
                    "industrial": {"blocks": 400, "zone_distribution_pct": [35, 65]},
                    "household": {"blocks": 500, "zone_distribution_pct": [55, 45]},
                    "agriculture": {"blocks": 100, "zone_distribution_pct": [50, 50]}
                }
            },
            "balancing": {
                "up_price_zar_per_mwh": 1200.0,
                "down_price_zar_per_mwh": 800.0
            },
            "grid": {
                "zones": 2,
                "atc": [
                    [0, 4000],
                    [4000, 0]
                ],
                "losses_pct_per_link": 2.5,
                "network_settlement": {
                    "extra_cost_mode": "zonal_only",
                    "cost_allocation_target": "consumers_only",
                    "shortfall_price_mode": "smp_multiplier",
                    "shortfall_price_value": 2.0
                },
                "generator_curtailment_mode": "pro_rata"
            },
            "environment": {
                "seed": "winter-2024",
                "groups": {
                    "solar": {"blocks": 8, "zone_distribution_pct": [35, 65]},
                    "wind": {"blocks": 12, "zone_distribution_pct": [40, 60]},
                    "gas": {"blocks": 35, "zone_distribution_pct": [50, 50]},
                    "coal": {"blocks": 30, "zone_distribution_pct": [45, 55]},
                    "hydro": {"blocks": 10, "zone_distribution_pct": [60, 40]},
                    "nuclear": {"blocks": 5, "zone_distribution_pct": [50, 50]}
                }
            },
            "events": [
                {
                    "id": "coal_outage",
                    "type": "plant_outage",
                    "name": "Coal Plant Outage",
                    "description": "Major coal unit trips offline",
                    "trigger": {"type": "round", "value": 2},
                    "multiplier": 0.6,
                    "additive": 0,
                    "duration_rounds": 2,
                    "target": "coal"
                },
                {
                    "id": "fuel_spike",
                    "type": "fuel_spike",
                    "name": "Gas Price Spike",
                    "description": "Winter demand drives gas prices up",
                    "trigger": {"type": "round", "value": 1},
                    "multiplier": 1.8,
                    "additive": 0,
                    "duration_rounds": 4,
                    "target": "gas"
                },
                {
                    "id": "evening_peak",
                    "type": "demand_surge",
                    "name": "Winter Evening Peak",
                    "description": "Heating demand spikes in evening",
                    "trigger": {"type": "round", "value": 3},
                    "multiplier": 1.25,
                    "additive": 0,
                    "duration_rounds": 1,
                    "target": "demand"
                },
                {
                    "id": "grid_stress",
                    "type": "grid_congestion",
                    "name": "Grid Congestion",
                    "description": "Transmission constraints under high load",
                    "trigger": {"type": "round", "value": 3},
                    "multiplier": 0.7,
                    "additive": 0,
                    "duration_rounds": 1,
                    "target": "atc"
                }
            ],
            "storage": {
                "efficiency_pct": 82,
                "capacity_mwh": 800,
                "power_mw": 400,
                "initial_soc_pct": 70,  # Pre-charged for peak
                "max_dod_pct": 75,
                "degradation_pct_per_cycle": 0.12
            },
            "scoring": {
                "weights": {
                    "profit": 0.7,      # Profit critical in tight market
                    "imbalance": 0.25,
                    "curtailment": 0.05
                }
            }
        }
    }
}


def get_template(template_id: str) -> dict:
    """Get a template by ID"""
    return TEMPLATES.get(template_id)


def list_templates() -> list:
    """List all available templates"""
    return [
        {
            "id": tid,
            "name": t["name"],
            "description": t["description"]
        }
        for tid, t in TEMPLATES.items()
    ]
