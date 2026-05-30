"""
Legt eine Kampagne mit drei Szenarien wachsender Komplexität an.
Ausführen im Backend-Container:
  python /app/scripts/seed_campaign.py
"""
import sys
import os

sys.path.insert(0, '/app')
os.chdir('/app')

from app import create_app
from app.extensions import db
from app.models import User, Campaign, Scenario, CampaignScenario

# ─────────────────────────────────────────────────────────────────────────────
# Szenario 1 – EINSTEIGER
# Eine Zone, 2 Runden, nur DAM, zwei Spielertypen, keine Events
# ─────────────────────────────────────────────────────────────────────────────
SCENARIO_1 = {
    "version": "1.0.0",
    "general": {
        "id": "scenario_einstieg_v1",
        "description": (
            "Einstieg in den Energiemarkt: Zwei Runden, ein Netzgebiet, "
            "Day-Ahead-Markt. Kein Intraday-Handel, keine Netzbeschränkungen, "
            "keine Störungsereignisse. Ideal für den ersten Kontakt mit "
            "Marktgebot und Preisbildung."
        ),
        "fake_date": "2025-06-02",
        "rounds": 2,
        "hours_per_round": 6,
        "round_span_hours": 6,
        "forecast_horizon_hours": 12,
        "horizon_hours": 12,
        "round_duration_seconds": 900,
        "freeze_hours": 1,
        "day_ahead_gate_hour": 6,
        "id_gate_base_hour": 0,
        "day_one_baseline_mode": "edit_round_one",
        "start_hour": 6,
    },
    "structure": {"rounds": 2, "hours_per_round": 6},
    "devices": [
        {
            "id": "dev_s1_coal",
            "name": "Kohlekraftwerk",
            "type": "coal",
            "capacity_mw": 300,
            "max_power_mw": 300,
            "min_load_pct": 20,
            "variable_cost_zar_per_mwh": 380,
            "cost_per_mwh_zar": 380,
            "fixed_cost_zar_per_hour": 1500,
            "ramp_rate_mw_per_h": 80,
            "enable_multi_bid": False,
            "zone": 1,
        },
        {
            "id": "dev_s1_load",
            "name": "Stadtversorgung",
            "type": "industrial_load",
            "baseline_load_mw": 200,
            "peak_load_mw": 260,
            "fixed_cost_zar_per_hour": 0,
            "drm_capable": False,
            "enable_multi_bid": False,
            "zone": 1,
        },
    ],
    "player_types": [
        {
            "id": "ptype_s1_producer",
            "name": "Producer",
            "zone": 1,
            "description": (
                "Operator of a coal-fired power plant. Submit offers in the day-ahead market. "
                "Your goal is to maximize profit by choosing the right price and volume."
            ),
            "devices": ["dev_s1_coal"],
        },
        {
            "id": "ptype_s1_consumer",
            "name": "Consumer",
            "zone": 1,
            "description": (
                "Municipal utility acting as a large buyer. Secure your supply in the day-ahead market. "
                "Your goal is to guarantee supply at the lowest possible cost."
            ),
            "devices": ["dev_s1_load"],
        },
    ],
    "markets": {
        "dam": {"trading": ["on", "on"]},
        "idm": {"trading": ["off", "off"]},
    },
    "market": {
        "base_price": 900,
        "base_volume_mwh": 1200,
        "price_cap": 3000,
        "price_floor": 0,
        "random_price_pct": 4,
        "random_capacity_pct": 4,
        "enable_player_bidding": True,
        "generator_mix": {"coal": 3, "gas": 1, "hydro": 1},
        "consumer_mix": {"industrial": 2, "household": 2},
        "balancing_up_price": 1800,
        "balancing_down_price": 150,
    },
    "grid": {"zones": 1},
    "environment": {
        "profile_preset": "Summer Weekday",
        "seed": "einstieg_v1",
        "actual_noise_pct": 3,
        "diurnal_profile": [
            0.60, 0.55, 0.53, 0.52, 0.55, 0.65, 0.80, 0.95, 1.00, 1.00, 0.98, 0.95,
            0.92, 0.90, 0.92, 0.95, 1.00, 1.05, 1.05, 1.00, 0.92, 0.82, 0.72, 0.65,
        ],
    },
    "events": [
        {
            "type": "task",
            "name": "R1 – Erstes Day-Ahead-Gebot",
            "description": (
                "Stelle dein Day-Ahead-Gebot für die 6 Stunden von Runde 1 ein. "
                "Erzeuger: Preis muss mindestens variable Kosten (380 ZAR/MWh) decken. "
                "Verbraucher: Biete hoch genug, um sicher versorgt zu werden."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R2 – Ergebnis analysieren und anpassen",
            "description": (
                "Schau dir die Clearing-Ergebnisse aus Runde 1 an: "
                "Welcher Preis hat sich gebildet? Warst du dispatched? "
                "Passe deine Strategie für Runde 2 entsprechend an."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# Szenario 2 – FORTGESCHRITTEN
# Eine Zone, 3 Runden, DAM + IDM, drei Spielertypen inkl. PV, ein Event
# ─────────────────────────────────────────────────────────────────────────────
SCENARIO_2 = {
    "version": "1.0.0",
    "general": {
        "id": "scenario_fortgeschritten_v1",
        "description": (
            "Fortgeschrittenes Szenario: Drei Runden, Day-Ahead- und Intraday-Markt. "
            "Drei Spielertypen: Erzeuger, Verbraucher und ein Solarpark. "
            "In Runde 2 tritt ein Nachfrageanstieg auf. Balancing und Imbalance-Kosten "
            "spielen erstmals eine Rolle."
        ),
        "fake_date": "2025-09-15",
        "rounds": 3,
        "hours_per_round": 6,
        "round_span_hours": 6,
        "forecast_horizon_hours": 18,
        "horizon_hours": 18,
        "round_duration_seconds": 1200,
        "freeze_hours": 1,
        "day_ahead_gate_hour": 8,
        "id_gate_base_hour": 0,
        "day_one_baseline_mode": "edit_round_one",
        "start_hour": 4,
    },
    "structure": {"rounds": 3, "hours_per_round": 6},
    "devices": [
        {
            "id": "dev_s2_coal",
            "name": "Kohlekraftwerk Süd",
            "type": "coal",
            "capacity_mw": 350,
            "max_power_mw": 350,
            "min_load_pct": 15,
            "variable_cost_zar_per_mwh": 380,
            "cost_per_mwh_zar": 380,
            "fixed_cost_zar_per_hour": 1800,
            "ramp_rate_mw_per_h": 90,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s2_gas",
            "name": "Gaskraftwerk Spitzenlast",
            "type": "gas",
            "capacity_mw": 150,
            "max_power_mw": 150,
            "min_load_pct": 0,
            "variable_cost_zar_per_mwh": 1100,
            "cost_per_mwh_zar": 1100,
            "fixed_cost_zar_per_hour": 800,
            "ramp_rate_mw_per_h": 150,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s2_pv",
            "name": "Solarpark Ost",
            "type": "pv",
            "capacity_mw": 120,
            "max_power_mw": 120,
            "variable_cost_zar_per_mwh": 0,
            "cost_per_mwh_zar": 0,
            "fixed_cost_zar_per_hour": 300,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s2_load",
            "name": "Industriepark",
            "type": "industrial_load",
            "baseline_load_mw": 280,
            "peak_load_mw": 380,
            "fixed_cost_zar_per_hour": 0,
            "drm_capable": True,
            "enable_multi_bid": True,
            "zone": 1,
        },
    ],
    "player_types": [
        {
            "id": "ptype_s2_producer",
            "name": "Conventional Producer",
            "zone": 1,
            "description": (
                "Operator of coal and gas generation assets. Use coal as baseload and gas for peak demand. "
                "Use the intraday market to correct deviations. "
                "Demand increases in round 2, so adjust your offers in time."
            ),
            "devices": ["dev_s2_coal", "dev_s2_gas"],
        },
        {
            "id": "ptype_s2_solar",
            "name": "Solar Park Operator",
            "zone": 1,
            "description": (
                "Variable renewable producer: your generation fluctuates with solar irradiance. "
                "Offer in the day-ahead market based on your forecast, and use the intraday market to balance "
                "over- or under-delivery and minimize imbalance costs."
            ),
            "devices": ["dev_s2_pv"],
        },
        {
            "id": "ptype_s2_consumer",
            "name": "Industrial Consumer",
            "zone": 1,
            "description": (
                "Large industrial buyer with demand response capability. Your demand rises unexpectedly in round 2. "
                "Use the intraday market for additional procurement. Activate demand response in expensive hours "
                "to reduce peak costs."
            ),
            "devices": ["dev_s2_load"],
        },
    ],
    "markets": {
        "dam": {"trading": ["on", "on", "on"]},
        "idm": {"trading": ["on", "on", "on"]},
    },
    "market": {
        "base_price": 1000,
        "base_volume_mwh": 1500,
        "price_cap": 4000,
        "price_floor": -200,
        "random_price_pct": 6,
        "random_capacity_pct": 6,
        "enable_player_bidding": True,
        "generator_mix": {"coal": 3, "gas": 2, "hydro": 1, "pv": 1},
        "consumer_mix": {"industrial": 3, "household": 1},
        "balancing_up_price": 2000,
        "balancing_down_price": 180,
    },
    "grid": {"zones": 1},
    "environment": {
        "profile_preset": "Autumn Weekday",
        "seed": "fortgeschritten_v1",
        "actual_noise_pct": 6,
        "diurnal_profile": [
            0.65, 0.61, 0.58, 0.57, 0.60, 0.72, 0.88, 1.02, 1.10, 1.08, 1.02, 0.98,
            0.93, 0.91, 0.94, 0.98, 1.06, 1.18, 1.22, 1.18, 1.08, 0.96, 0.84, 0.72,
        ],
    },
    "events": [
        {
            "type": "task",
            "name": "R1 – DAM und IDM-Strategie",
            "description": (
                "Stelle deine Day-Ahead-Gebote. Denke schon jetzt an den IDM: "
                "Solarprognosen sind unsicher – plane einen Puffer ein. "
                "Konventionelle Erzeuger: Kohle als Grundlast, Gas nur für Spitzen."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "shock",
            "name": "Nachfrageanstieg – Hitzewelle",
            "description": (
                "ACHTUNG: Eine unerwartete Hitzewelle erhöht die Kühlungslast. "
                "Industrieverbraucher: Dein Bedarf steigt um ca. 25% gegenüber Prognose. "
                "Erzeuger: Nutze das Gasspitzenkraftwerk – die Preise steigen."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
            "demand_shock_pct": 25,
        },
        {
            "type": "task",
            "name": "R2 – IDM-Nachkauf nach Schock",
            "description": (
                "Der Nachfrageschock ist eingetreten. Nutze den Intraday-Markt sofort: "
                "Verbraucher: kaufe die fehlende Energie nach. "
                "Erzeuger: erhöhe dein Angebot und passe den Preis an die gestiegene Nachfrage an."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R3 – Abschluss und Optimierung",
            "description": (
                "Letzte Runde: Werte deine Imbalance-Kosten der Vorrunden aus. "
                "Solarpark: Wie gut hat deine IDM-Strategie funktioniert? "
                "Erzeuger: Lohnt sich der Gaseinsatz noch bei den aktuellen Preisen?"
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# Szenario 3 – EXPERTE
# Zwei Zonen, 4 Runden, DAM + IDM, Batterie, Netzbeschränkung, mehrere Events
# ─────────────────────────────────────────────────────────────────────────────
SCENARIO_3 = {
    "version": "1.0.0",
    "general": {
        "id": "scenario_experte_v1",
        "description": (
            "Expertenszenario: Vier Runden, zwei Netzzonen mit begrenzter Kuppelkapazität, "
            "Day-Ahead- und Intraday-Markt, Batterie-Einsatz. "
            "In Runde 3 fällt das Kohlekraftwerk teilweise aus (technische Störung). "
            "In Runde 4 führt eine Kältewelle zu Nachfragespitzen und reduzierter Solarleistung. "
            "Netzengpässe, strategisches Batterie-Arbitrage und aktives Risikomanagement "
            "sind der Schlüssel zum Erfolg."
        ),
        "fake_date": "2025-01-06",
        "rounds": 4,
        "hours_per_round": 6,
        "round_span_hours": 6,
        "forecast_horizon_hours": 24,
        "horizon_hours": 24,
        "round_duration_seconds": 1800,
        "freeze_hours": 1,
        "day_ahead_gate_hour": 10,
        "id_gate_base_hour": 0,
        "day_one_baseline_mode": "edit_round_one",
        "start_hour": 0,
    },
    "structure": {"rounds": 4, "hours_per_round": 6},
    "devices": [
        {
            "id": "dev_s3_coal",
            "name": "Kohlekraftwerk Nord",
            "type": "coal",
            "capacity_mw": 400,
            "max_power_mw": 400,
            "min_load_pct": 10,
            "variable_cost_zar_per_mwh": 380,
            "cost_per_mwh_zar": 380,
            "fixed_cost_zar_per_hour": 2000,
            "ramp_rate_mw_per_h": 100,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s3_gas",
            "name": "Gaskraftwerk Flexibel",
            "type": "gas",
            "capacity_mw": 200,
            "max_power_mw": 200,
            "min_load_pct": 0,
            "variable_cost_zar_per_mwh": 1100,
            "cost_per_mwh_zar": 1100,
            "fixed_cost_zar_per_hour": 1000,
            "ramp_rate_mw_per_h": 200,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s3_pv",
            "name": "Solarpark Süd",
            "type": "pv",
            "capacity_mw": 180,
            "max_power_mw": 180,
            "variable_cost_zar_per_mwh": 0,
            "cost_per_mwh_zar": 0,
            "fixed_cost_zar_per_hour": 500,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s3_bat",
            "name": "Netzbatterie",
            "type": "battery",
            "power_mw": 80,
            "power_rating_mw": 80,
            "capacity_mwh": 240,
            "efficiency_pct": 90,
            "soc_min_pct": 10,
            "soc_max_pct": 95,
            "soc_initial_pct": 50,
            "variable_cost_zar_per_mwh": 10,
            "cost_per_mwh_zar": 10,
            "fixed_cost_zar_per_hour": 200,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s3_load",
            "name": "Industrieregion Süd",
            "type": "industrial_load",
            "baseline_load_mw": 260,
            "peak_load_mw": 380,
            "fixed_cost_zar_per_hour": 0,
            "drm_capable": True,
            "enable_multi_bid": True,
            "zone": 2,
        },
    ],
    "player_types": [
        {
            "id": "ptype_s3_producer",
            "name": "Conventional Producer",
            "zone": 1,
            "description": (
                "Zone 1: operator of coal and gas generation assets. Use coal as baseload "
                "and gas as peaking capacity. In round 3 a technical failure affects the coal plant, "
                "so react quickly with the gas unit. Use the day-ahead and intraday markets strategically."
            ),
            "devices": ["dev_s3_coal", "dev_s3_gas"],
        },
        {
            "id": "ptype_s3_pvbat",
            "name": "Renewables + Storage",
            "zone": 1,
            "description": (
                "Zone 1: solar park and grid battery. Charge the battery during low-load hours "
                "and discharge during price spikes. In round 3 maximize solar output after the coal outage. "
                "In round 4 cloud cover heavily limits solar generation, making battery management critical."
            ),
            "devices": ["dev_s3_pv", "dev_s3_bat"],
        },
        {
            "id": "ptype_s3_consumer",
            "name": "Large Consumer Zone 2",
            "zone": 2,
            "description": (
                "Zone 2: interconnection capacity to Zone 1 is limited to 160 MW. "
                "Your demand exceeds that limit, so supply shortfalls are a real risk. "
                "Activate demand response in expensive hours. In round 4 cold weather raises your demand by 40%, "
                "so plan ahead early."
            ),
            "devices": ["dev_s3_load"],
        },
    ],
    "markets": {
        "dam": {"trading": ["on", "on", "on", "on"]},
        "idm": {"trading": ["on", "on", "on", "on"]},
    },
    "market": {
        "base_price": 1100,
        "base_volume_mwh": 1800,
        "price_cap": 5000,
        "price_floor": -500,
        "random_price_pct": 8,
        "random_capacity_pct": 8,
        "enable_player_bidding": True,
        "generator_mix": {"coal": 4, "gas": 2, "hydro": 1, "pv": 1, "wind": 1},
        "consumer_mix": {"industrial": 2, "agriculture": 1, "household": 2},
        "balancing_up_price": 2500,
        "balancing_down_price": 200,
    },
    "grid": {
        "zones": 2,
        "atc": [
            [0,   160],
            [160, 0  ],
        ],
    },
    "environment": {
        "profile_preset": "Winter Weekday",
        "seed": "experte_v1",
        "actual_noise_pct": 8,
        "diurnal_profile": [
            0.72, 0.68, 0.65, 0.64, 0.66, 0.75, 0.90, 1.05, 1.15, 1.10, 1.05, 1.00,
            0.95, 0.93, 0.95, 1.00, 1.10, 1.20, 1.30, 1.28, 1.20, 1.10, 1.00, 0.85,
        ],
        "seasonal_factors": [
            1.00, 1.00, 1.00, 1.05, 1.10, 1.15, 1.15, 1.10, 1.05, 1.00, 1.00, 1.00,
        ],
    },
    "events": [
        {
            "type": "task",
            "name": "R1 – DAM-Eröffnungsgebote",
            "description": (
                "Stelle deine Day-Ahead-Gebote für alle 6 Stunden von Runde 1. "
                "Erzeuger: Kohle deckt Grundlast, Gas bleibt Reserve. "
                "Verbraucher (Zone 2): Beachte, dass du maximal 160 MW aus Zone 1 "
                "importieren kannst – stelle frühzeitig sicher, dass du versorgt bist."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R1 – Batterie-Ladeplan",
            "description": (
                "Nachtstunden (0–5 Uhr) haben niedrige Preise. Lade die Batterie jetzt. "
                "Ziel: Ladezustand ≥60% bis Stunde 6. Du brauchst die Energie "
                "für den Morgenanstieg und als Reserve für spätere Engpässe."
            ),
            "target": "player",
            "target_id": "ptype_s3_pvbat",
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R2 – IDM-Anpassung und Netzcheck",
            "description": (
                "Prüfe nach dem DAM-Clearing die Zonenbilanzen. Ist Zone 2 vollständig versorgt? "
                "Wenn nicht, decke den Rest über den IDM. "
                "Erneuerbare: Stimmt deine PV-Prognose? Nutze den IDM zur Korrektur."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "shock",
            "name": "R3 – Technische Störung: Kohlekraftwerk ausgefallen",
            "description": (
                "STÖRUNG: Das Kohlekraftwerk ist auf 20% Kapazität gefallen (max. 80 MW). "
                "Erzeuger: Revidiere deine Gebote sofort – fahre das Gaskraftwerk hoch. "
                "Verbraucher: SMP wird stark steigen – erwäge DRM-Aktivierung. "
                "Solar + Batterie: Maximale Einspeisung – jetzt ist jede MWh wertvoll."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
            "capacity_shock": {"device_id": "dev_s3_coal", "max_pct": 20},
        },
        {
            "type": "task",
            "name": "R3 – Maximale Solar-Einspeisung",
            "description": (
                "Mittagsstunden 12–17 Uhr: Peak Solar. Biete die volle Kapazität "
                "im DAM zu niedrigem Preis an – du wirst mit Sicherheit dispatched. "
                "Batterie: Halte Reserve für den Abendspitzen in Runde 4."
            ),
            "target": "player",
            "target_id": "ptype_s3_pvbat",
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
        {
            "type": "shock",
            "name": "R4 – Kältewelle: Nachfrageanstieg + wenig Solar",
            "description": (
                "KÄLTEWELLE: Solarertrag auf ~25% reduziert. Nachfrage +40% durch Heizung. "
                "Erzeuger: Fahre alles hoch – Kohle (falls repariert) und Gas. "
                "Verbraucher: Aktiviere DRM in den teuersten Stunden. "
                "Batterie: Jetzt entladen – Preise werden Rekordniveaus erreichen."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
            "demand_shock_pct": 40,
            "solar_shock_pct": -75,
        },
        {
            "type": "task",
            "name": "R4 – Finales Risikomanagement",
            "description": (
                "Letzte Runde. Zone 2 ist besonders gefährdet – die Kuppelkapazität "
                "reicht bei +40% Nachfrage definitiv nicht. Prüfe alle Handelsoptionen. "
                "Wer am Ende das beste Kosten-/Erlösverhältnis hat, gewinnt."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },
    ],
}


def main():
    app = create_app()
    with app.app_context():
        # Admin-User finden
        admin = User.query.filter_by(email="admin@fastbreak.one").first()
        if not admin:
            print("FEHLER: admin@fastbreak.one nicht gefunden.")
            sys.exit(1)

        # Kampagne anlegen
        campaign = Campaign(
            name="Energiemarkt Grundkurs",
            description=(
                "Dreistufige Kampagne mit wachsender Komplexität: "
                "vom ersten Day-Ahead-Gebot bis zum vollständigen Zwei-Zonen-Markt "
                "mit Störungsereignissen und Batterie-Arbitrage."
            ),
            designer_id=admin.id,
            published=True,
        )
        db.session.add(campaign)
        db.session.flush()  # campaign.id verfügbar machen

        configs = [
            ("Einstieg – Ein Markt, Zwei Spieler", SCENARIO_1),
            ("Fortgeschritten – DAM + IDM, Solar & Schock", SCENARIO_2),
            ("Experte – Zwei Zonen, Batterie, Störungen", SCENARIO_3),
        ]

        for order, (name, config) in enumerate(configs, start=1):
            config["name"] = name
            scenario = Scenario(
                name=name,
                campaign_id=campaign.id,
                config=config,
            )
            db.session.add(scenario)
            db.session.flush()

            link = CampaignScenario(
                campaign_id=campaign.id,
                scenario_id=scenario.id,
                order_index=order,
                solo_enabled=True,
                cohort_enabled=True,
            )
            db.session.add(link)
            print(f"  [{order}] Szenario angelegt: {name} (id={scenario.id})")

        db.session.commit()
        print(f"\nKampagne '{campaign.name}' erfolgreich erstellt (id={campaign.id})")


if __name__ == "__main__":
    main()
