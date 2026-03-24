from app.engine import _summarize_battery_player_kpis


def test_battery_arbitrage_uses_actual_settlement_revenue_not_average_market_price():
    device_hourly_breakdown = {
        "bat_1": [
            {
                "battery_charged_mwh": 2.0,
                "battery_charge_cost_zar": 180.0,
                "total_dispatched_mwh": 1.0,
                "da_revenue_zar": 250.0,
                "id_revenue_zar": 0.0,
                "battery_soc_start_pct": 50.0,
                "battery_soc_end_pct": 60.0,
            },
            {
                "battery_charged_mwh": 0.0,
                "battery_charge_cost_zar": 0.0,
                "total_dispatched_mwh": 1.5,
                "da_revenue_zar": 0.0,
                "id_revenue_zar": 420.0,
                "battery_soc_start_pct": 60.0,
                "battery_soc_end_pct": 42.0,
            },
        ],
        "coal_1": [
            {
                "battery_charged_mwh": 99.0,
                "battery_charge_cost_zar": 9999.0,
                "total_dispatched_mwh": 999.0,
                "da_revenue_zar": 9999.0,
                "id_revenue_zar": 9999.0,
            }
        ],
    }
    config_devices = [
        {"id": "bat_1", "type": "battery"},
        {"id": "coal_1", "type": "coal"},
    ]

    summary = _summarize_battery_player_kpis(device_hourly_breakdown, config_devices)

    assert summary["charged_mwh"] == 2.0
    assert summary["discharged_mwh"] == 2.5
    assert summary["charge_cost_zar"] == 180.0
    assert summary["discharge_revenue_zar"] == 670.0
    assert summary["arbitrage_revenue_zar"] == 490.0
    assert summary["soc_start_pct"] == 50.0
    assert summary["soc_end_pct"] == 42.0