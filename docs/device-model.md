# EMSG Device Model (Simplified MVP+)
**Date:** 10. November 2025  
**Status:** Production-Ready, Engine-Supported

---

## Overview

Das vereinfachte Device-Modell unterstützt **5 Haupt-Typen** mit realistischen Parametern für das südafrikanische Stromsystem. Devices werden Spielern über Rollen zugewiesen und beeinflussen Kosten, Curtailment-Priorität und technische Constraints.

---

## Supported Device Types

### 1. Conventional Dispatchable Generators

#### 1.1 Coal (Kohle)
**Characteristics:** Grundlast, langsame Rampe, niedrige variable Kosten, hohe Emissionen

**Parameters:**
```json
{
  "type": "coal",
  "max_power_mw": 500,
  "min_load_pct": 40,
  "ramp_rate_mw_per_min": 5,
  "variable_cost_zar_per_mwh": 400,
  "efficiency_pct": 35,
  "curtailment_priority": "high"
}
```

**Typical Values (SA Context):**
- Max Power: 500-800 MW (Medupi/Kusile Units)
- Min Load: 40% (technische Untergrenze)
- Ramp Rate: 5 MW/min (langsam)
- Variable Cost: 300-500 ZAR/MWh (Brennstoff)
- Efficiency: 33-38%

---

#### 1.2 Gas (Gas-Turbine/OCGT)
**Characteristics:** Mittellast/Spitzenlast, schnelle Rampe, mittlere Kosten

**Parameters:**
```json
{
  "type": "gas",
  "max_power_mw": 200,
  "min_load_pct": 20,
  "ramp_rate_mw_per_min": 15,
  "variable_cost_zar_per_mwh": 1200,
  "efficiency_pct": 30,
  "curtailment_priority": "medium"
}
```

**Typical Values (SA Context):**
- Max Power: 150-200 MW (Ankerlig/Gourikwa Units)
- Min Load: 20% (flexibler als Coal)
- Ramp Rate: 10-20 MW/min (schnell)
- Variable Cost: 1000-1500 ZAR/MWh (teures Diesel/Gas)
- Efficiency: 25-35% (OCGT), 50-60% (CCGT, nicht implementiert)

---

#### 1.3 Hydro (Wasserkraft)
**Characteristics:** Sehr flexibel, schnelle Rampe, begrenzt durch Reservoir

**Parameters:**
```json
{
  "type": "hydro",
  "max_power_mw": 300,
  "min_load_pct": 10,
  "ramp_rate_mw_per_min": 30,
  "variable_cost_zar_per_mwh": 50,
  "efficiency_pct": 85,
  "reservoir_capacity_mwh": 1500,
  "curtailment_priority": "medium"
}
```

**Typical Values (SA Context):**
- Max Power: 50-400 MW (pro Unit, Gariep/Vanderkloof)
- Min Load: 10% (sehr flexibel)
- Ramp Rate: 20-40 MW/min (sehr schnell)
- Variable Cost: 0-100 ZAR/MWh (minimal, nur O&M)
- Efficiency: 80-90%
- Reservoir: begrenzt durch Niederschlag/Zufluss

---

#### 1.4 Nuclear (Kernkraft) **[NEU]**
**Characteristics:** Grundlast, sehr langsame Rampe, sehr niedrige variable Kosten, hohe min_load (90%), muss-laufen

**Parameters:**
```json
{
  "type": "nuclear",
  "max_power_mw": 900,
  "min_load_pct": 90,
  "ramp_rate_mw_per_min": 1,
  "variable_cost_zar_per_mwh": 100,
  "efficiency_pct": 33,
  "curtailment_priority": "very_high"
}
```

**Typical Values (SA Context):**
- Max Power: 900-970 MW (Koeberg Units 1/2)
- Min Load: 90% (technische/safety Untergrenze, praktisch nicht rampenbar)
- Ramp Rate: 0.5-2 MW/min (extrem langsam, meist konstant)
- Variable Cost: 80-150 ZAR/MWh (Brennstoff niedrig, O&M hoch)
- Efficiency: 30-35%
- **Besonderheit:** Wird praktisch als "must-run" betrieben (base load), Curtailment nur in extremen Notfällen

**Engine-Behavior:**
- `curtailment_priority: "very_high"` → wird als letztes vor Wind/Solar abgeregelt
- Hohe `min_load_pct` → Player muss mind. 90% der max_power planen
- Langsame Rampe → kann nicht flexibel auf IDM/Balancing reagieren

---

### 2. Renewable Generators (Must-Run, Variable)

#### 2.1 Solar PV
**Characteristics:** Tagesgang, wetterabhängig, curtailment last (niedrigste Priorität)

**Parameters:**
```json
{
  "type": "solar",
  "max_power_mw": 200,
  "capacity_factor_pct": 25,
  "variable_cost_zar_per_mwh": 0,
  "curtailment_priority": "low"
}
```

**Typical Values (SA Context):**
- Max Power: 50-100 MW (pro Farm)
- Capacity Factor: 20-28% (Nordkap höher)
- Variable Cost: ~0 (keine Brennstoffkosten)
- Curtailment: niedrigste Priorität (wird zuerst abgeregelt bei Überangebot)

---

#### 2.2 Wind
**Characteristics:** Volatil, wetterabhängig, curtailment last

**Parameters:**
```json
{
  "type": "wind",
  "max_power_mw": 150,
  "capacity_factor_pct": 35,
  "variable_cost_zar_per_mwh": 0,
  "curtailment_priority": "low"
}
```

**Typical Values (SA Context):**
- Max Power: 80-140 MW (pro Farm, Noupoort/Jeffreys Bay)
- Capacity Factor: 30-40% (Ostkap höher)
- Variable Cost: ~0
- Curtailment: niedrigste Priorität (nach Solar)

---

### 3. Storage (Battery/Hybrid)

#### 3.1 Battery Storage
**Characteristics:** Laden/Entladen, SoC-Tracking, Degradation

**Parameters:**
```json
{
  "type": "battery",
  "capacity_mwh": 100,
  "power_mw": 50,
  "efficiency_pct": 85,
  "initial_soc_pct": 50,
  "max_dod_pct": 80,
  "degradation_pct_per_cycle": 0.1
}
```

**Typical Values (SA Context):**
- Capacity: 50-200 MWh (Li-Ion Systeme)
- Power: 25-100 MW (C-Rate 0.5-1.0)
- Efficiency: 80-90% (round-trip)
- Initial SoC: 50% (default)
- Max DoD: 80-90% (battery health)
- Degradation: 0.05-0.2% pro Vollzyklus

---

### 4. Demand (Consumer Devices)

#### 4.1 Industrial Load
**Characteristics:** Konstante Grundlast, DRM-fähig

**Parameters:**
```json
{
  "type": "industrial_load",
  "baseline_load_mw": 300,
  "peak_load_mw": 450,
  "drm_capable": true,
  "load_profile": [0.9, 0.9, 0.9, ..., 0.95]
}
```

**Typical Values (SA Context):**
- Baseline: 200-500 MW (Mining, Smelters)
- Peak: 1.2-1.5× Baseline
- DRM: Ja (große Verbraucher haben Verträge)

---

#### 4.2 Commercial Load
**Characteristics:** Tagesgang (Büros), Wochentag-Pattern

**Parameters:**
```json
{
  "type": "commercial_load",
  "baseline_load_mw": 100,
  "peak_load_mw": 200,
  "drm_capable": false,
  "load_profile": [0.4, 0.4, 0.5, 0.6, 0.8, 1.0, 1.0, 0.9, 0.8, 0.6, 0.5, 0.4]
}
```

**Typical Values (SA Context):**
- Baseline: 50-150 MW (pro Gebiet)
- Peak: 08:00-17:00 (Bürozeiten)
- DRM: Selten

---

#### 4.3 Residential Load
**Characteristics:** Abend-Peak (18:00-21:00), Wochenend-Muster

**Parameters:**
```json
{
  "type": "residential_load",
  "baseline_load_mw": 150,
  "peak_load_mw": 300,
  "drm_capable": false,
  "load_profile": [0.5, 0.5, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0, 0.95, 0.9, 0.7]
}
```

**Typical Values (SA Context):**
- Baseline: 100-250 MW (pro Gebiet)
- Peak: 18:00-21:00 (Kochen, Heizen)
- DRM: Kaum (nur via Load Shedding)

---

## Curtailment Priority Order (Engine Logic)

Bei Grid-Congestion oder Überangebot wird in folgender Reihenfolge abgeregelt:

1. **Solar** (`curtailment_priority: "low"`) – zuerst
2. **Wind** (`curtailment_priority: "low"`) – direkt danach
3. **Hydro** (`curtailment_priority: "medium"`)
4. **Gas** (`curtailment_priority: "medium"`)
5. **Coal** (`curtailment_priority: "high"`)
6. **Nuclear** (`curtailment_priority: "very_high"`) – praktisch nie (nur Notfall)

**Rationale:** Merit Order basiert auf variable costs + Flexibilität. Renewables haben niedrigste Kosten, aber höchste Flexibilität (können sofort runter). Nuclear ist base load und wird nur in extremen Fällen gedrosselt.

---

## Engine Support (backend/app/engine.py)

### Aktuell implementiert:
- ✅ **Storage**: SoC-Tracking mit DoD/Degradation (storage_update function)
- ✅ **Curtailment**: Basis-Logic in apply_grid (kann um priority erweitert werden)
- ✅ **Variable Costs**: In run_round() für Profit-Berechnung (fuel = sum(volume × cost))
- ✅ **Min Load / Ramp Rate**: Kann in Validierung/Constraints ergänzt werden

### Erweiterungsbedarf (optional):
- ⚠️ **Min Load Constraints**: Player-Forecast muss ≥ min_load_pct × max_power sein (Validierung fehlt)
- ⚠️ **Ramp Rate Limits**: Δ zwischen Stunden darf ramp_rate nicht überschreiten (Validierung fehlt)
- ⚠️ **Reservoir Limits** (Hydro): Energiebilanz über Tag (nicht implementiert)
- ⚠️ **DRM** (Demand Response): Automatische Load-Reduktion bei Knappheit (nicht implementiert)

---

## KSE Integration (Vorschlag)

### Neuer Tab: "Devices" (optional für MVP+)

**UI:**
- Liste der Devices pro Role (Producer/Consumer/Hybrid)
- Add Device: type select → parameter form
- Zuordnung: device → player_zone

**Backend:**
- Scenario.config.devices: Array von Device-Objekten
- Validierung: sum(max_power) pro Zone, min_load constraints

**Beispiel Config:**
```json
{
  "scenario": {
    "config": {
      "general": {...},
      "devices": [
        {
          "id": "coal_unit_1",
          "type": "coal",
          "zone": 1,
          "max_power_mw": 600,
          "min_load_pct": 40,
          "ramp_rate_mw_per_min": 5,
          "variable_cost_zar_per_mwh": 450
        },
        {
          "id": "nuclear_koeberg_1",
          "type": "nuclear",
          "zone": 2,
          "max_power_mw": 920,
          "min_load_pct": 90,
          "ramp_rate_mw_per_min": 1,
          "variable_cost_zar_per_mwh": 120
        }
      ]
    }
  }
}
```

---

## Typical Role Presets (für schnelles Setup)

### Producer Role (Coal + Solar)
```json
{
  "role": "producer",
  "devices": [
    {"type": "coal", "max_power_mw": 500, "variable_cost_zar_per_mwh": 400},
    {"type": "solar", "max_power_mw": 200}
  ]
}
```

### Flexible Producer (Gas + Hydro)
```json
{
  "role": "producer",
  "devices": [
    {"type": "gas", "max_power_mw": 200, "variable_cost_zar_per_mwh": 1200},
    {"type": "hydro", "max_power_mw": 300, "reservoir_capacity_mwh": 1500}
  ]
}
```

### Base Load Producer (Nuclear)
```json
{
  "role": "producer",
  "devices": [
    {"type": "nuclear", "max_power_mw": 900, "min_load_pct": 90}
  ]
}
```

### Hybrid (Storage + Solar)
```json
{
  "role": "hybrid",
  "devices": [
    {"type": "battery", "capacity_mwh": 100, "power_mw": 50},
    {"type": "solar", "max_power_mw": 100}
  ]
}
```

### Consumer (Industrial)
```json
{
  "role": "consumer",
  "devices": [
    {"type": "industrial_load", "baseline_load_mw": 400, "drm_capable": true}
  ]
}
```

---

## Summary

**Supported Types:** 9 (Coal, Gas, Hydro, Nuclear, Solar, Wind, Battery, Industrial/Commercial/Residential Load)

**MVP+ Ready:** Ja – alle Parameter sind engine-kompatibel, KSE-Integration optional

**Nuclear Added:** ✅ Vollständig spezifiziert mit SA-typischen Werten (Koeberg)

**Next Steps (optional):**
1. KSE "Devices"-Tab UI
2. Min Load / Ramp Rate Validierung in Player-Forecast
3. Curtailment Priority im Engine (apply_grid erweitern)
4. Device-Assignment pro Player (statt nur Role-Preset)
