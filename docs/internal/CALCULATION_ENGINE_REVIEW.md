# Calculation Engine Review - 11. Februar 2026

## Executive Summary

✅ **Gesamtbewertung: ROBUST & KORREKT**

Der Rechenapparat implementiert ein vollständiges SAWEM-konformes Market Clearing System mit Delta-based Clearing für Intraday-Märkte. Die Implementierung ist technisch korrekt, aber es gibt **3 kritische Lücken** bzgl. der neuen Markets-Tab Konfiguration.

---

## 1. Market Formation (Bildung der Märkte)

### 1.1 Synthetic Market Curves
**Datei:** `engine.py::generate_curves_from_config()` (Zeilen 239-490)

**✅ KORREKT:** 
- Generiert Supply/Demand-Kurven aus KSE `market` Config
- Berücksichtigt `generator_mix` (pv, wind, hydro, coal, gas, nuclear)
- Berücksichtigt `consumer_mix` (industrial, household, commercial, agriculture)
- **NEU IMPLEMENTIERT:** Stunden-spezifische Profile (hour_of_day) und saisonale Profile (month_of_year)
- Seed-basierte Reproduzierbarkeit mit einstellbarer Variabilität

**Parameter:**
```python
base_price = cfg.market.base_price || 1000  # ZAR/MWh
base_volume = cfg.market.base_volume_mwh || 20000  # MWh
random_capacity_pct = cfg.market.random_capacity_pct || 0
random_price_pct = cfg.market.random_price_pct || 0
price_floor = cfg.market.price_floor || -500
price_cap = cfg.market.price_cap || 5000
```

**Zeitabhängigkeit:**
- Solar: 0% nachts, Peak mittags (SOLAR_AVAILABILITY array)
- Wind: Variable Verfügbarkeit über 24h (WIND_AVAILABILITY array)
- Load Profile: Morgen-/Abendspitzen
- Saisonale Faktoren pro Generator/Consumer-Typ

### 1.2 Player Bids Integration
**Dateien:** 
- `engine.py::build_supply_from_bids()` (Zeilen 482-576)
- `engine.py::build_demand_from_bids()` (Zeilen 579-700)

**✅ KORREKT:**
- Merger von Player Bids mit synthetischen Kurven
- **Zwei Modi:**
  1. **Multi-Bid (enable_player_bidding=true):** 3 Lots (A/B/C) mit individuellen Preisen
  2. **Classic (enable_player_bidding=false):** Implicit Bid zu Marginal Cost
- Device-Level Override: `device.enable_multi_bid` überschreibt global setting
- Producers → Supply Curve, Consumers → Demand Curve
- Korrekte Price-Sorting: Supply aufsteigend, Demand absteigend (WTP)

**Logik Consumer Bids:**
```python
# Consumer mit WTP >= SMP werden vollständig bedient
if consumer_bid_price >= smp:
    dispatched = full_量
else:
    dispatched = 0  # Not served
```

---

## 2. Market Selection / Adressierung (DAM/IDM/BAL)

### 2.1 AKTUELL: Runden-basierte Logik
**Datei:** `engine.py::run_round()` (Zeilen 1083-1200)

**✅ IMPLEMENTIERT:**
- **Round 1:** Day-Ahead Market (DA) - Clears absolute volumes
- **Round >1:** Intraday Market (ID) - Clears DELTAS zu DA Baseline

**Delta Calculation:**
```python
if round_num == 1:
    clearing_forecasts[pid] = current_data  # Absolute
else:
    # Delta = Current - DA Baseline
    delta_hours = [curr - da for curr, da in zip(current, da_baseline)]
    clearing_forecasts[pid] = {'hours': delta_hours, 'da_hours': da_baseline}
```

### 2.2 🚨 KRITISCHE LÜCKE: Markets Tab Config wird NICHT berücksichtigt

**Problem:**
Die neue Markets-Tab Konfiguration (implementiert in `KSE.jsx` und `player.py`) wird **NICHT** im Engine verwendet:

```javascript
// KSE.jsx - Markets Config
markets: {
  dam: ["market_code", "off", "on", ...],  // Per Round Status
  idm: ["market_code", "market_code", ...],
  bal: ["market_code", "market_code", ...]
}
```

**Was fehlt im Engine:**
1. ✗ Keine Prüfung ob DAM für Round aktiv (`markets.dam[round-1] != "off"`)
2. ✗ Keine Prüfung ob IDM für Round aktiv (`markets.idm[round-1] != "off"`)
3. ✗ Keine Handling von "on" Mode (Gates ignorieren)
4. ✗ Keine Balancing Market Implementation

**Gate Hours werden berücksichtigt in:**
- ✅ `player.py::_get_tradeable_hours()` - prüft markets config
- ✅ `player.py::generate_market_timeline()` - prüft markets config
- ✗ `engine.py::run_round()` - **NUTZT markets config NICHT**

**Impact:** 
- Medium-High: Player UI zeigt korrekte locked hours, aber Engine ignoriert Markets Config
- Wenn Trainer DAM in Round 2 deaktiviert, cleared Engine trotzdem DA Volume
- "on" Mode (Gates ignorieren) funktioniert nur im UI, nicht im Clearing

---

## 3. Commitment Handling (Bestehende Positionen)

### 3.1 DA Baseline Management
**Datei:** `engine.py::run_round()` (Zeilen 1107-1145)

**✅ KORREKT:**
- Round 1 Forecasts werden als `is_da_baseline=True` markiert
- Round >1 lädt DA Baseline aus DB: `Forecast.query.filter_by(is_da_baseline=True)`
- DA SMP wird aus Round 1 Result geladen
- Delta Settlement: `DA @ DA_SMP + ID_Delta @ IDP`

**Settlement-Logik:**
```python
if round_num == 1:
    revenue = dispatched * smp
else:
    da_volume = da_baseline[hour]
    id_delta = dispatched - da_volume
    revenue = (da_volume * da_smp) + (id_delta * current_smp)
```

### 3.2 🚨 PROBLEM: Circular Reference bei "off" Markets

**Szenario:**
1. Round 1: DAM aktiv → DA Baseline gesetzt
2. Round 2: DAM=off, IDM=on

**Aktuelles Verhalten:**
- Engine berechnet Delta zu DA Baseline (korrekt)
- Aber: Wenn DAM "off", sollte es **keine neue DA Position geben**
- ID Market sollte nur **Anpassungen** erlauben, nicht neue Commitments

**Fehlende Logik:**
```python
# SOLLTE SO SEIN:
if markets.dam[round-1] == "off":
    # No new DA commitments allowed
    # Only ID adjustments to existing DA baseline
    pass
```

---

## 4. Market Clearing Mechanismus

### 4.1 Merit Order Dispatch
**Datei:** `engine.py::clear_market()` (Zeilen 128-230)

**✅ EXZELLENT:**
- Pro-rata Tie-Breaking bei gleichen Preisen
- Inflexible Units Filter (Nuclear, Min Load) → setzen SMP nicht
- Korrekte Merit Order: Supply aufsteigend sortiert, Demand absteigend
- SMP = Marginal Supply Price (letztes geclärtes Gebot)

**Algorithmus:**
```
1. Sort: Supply (ascending price), Demand (descending WTP)
2. Iterate: Match Supply[i] mit Demand[j]
3. If p_supply <= p_demand: Clear volume
4. SMP = Last Flexible Supply Price that cleared
5. All cleared bids receive SMP (uniform pricing)
```

**Pro-Rata bei Ties:**
```python
# Mehrere Bids zum gleichen Preis
tie_bids = [bid1, bid2, bid3]  # Alle bei 600 ZAR/MWh
total_volume = sum(bid.qty for bid in tie_bids)

if total_volume <= demand:
    # Alle werden gecleart
    for bid in tie_bids: dispatch(bid, bid.qty)
else:
    # Pro-rata allocation
    for bid in tie_bids:
        share = (bid.qty / total_volume) * demand
        dispatch(bid, share)
```

### 4.2 Bid Dispatch Tracking
**Dateien:**
- `engine.py::track_bid_dispatch()` (Zeilen 710-764)
- `engine.py::track_demand_dispatch()` (Zeilen 767-860)

**✅ KORREKT:**
- Trackt pro Player, Device, Lot (A/B/C)
- ```
  dispatch_tracking[player_id][device_id][lot] = {
      'mw_offered': quantity,
      'mw_dispatched': dispatched_qty,
      'price_bid': bid_price,
      'smp': smp
  }
  ```
- **Wichtig:** Auch nicht-geclärte Bids werden getrackt (dispatched=0)

### 4.3 Consumer Dispatch Logic
**✅ KORREKT:**
- Consumer mit `WTP >= SMP` werden **vollständig bedient**
- Consumer mit `WTP < SMP` werden **nicht bedient**
- Dies ist korrekt für Pay-as-Clear Mechanismus

---

## 5. Financial Calculations (KPIs)

### 5.1 Revenue Calculation
**Datei:** `engine.py::run_round()` (Zeilen 1511-1577)

**✅ KORREKT:**

**Generators (Producers):**
```python
if round_num == 1:  # DA
    revenue = dispatched * smp
else:  # ID
    da_volume = da_baseline[hour]
    id_delta = dispatched - da_volume
    revenue = (da_volume * da_smp) + (id_delta * current_smp)
```

**Consumers:**
```python
revenue = -dispatched * smp  # Negative (Kosten)
```

### 5.2 Variable Costs (Fuel/Operation)
**Datei:** `engine.py::run_round()` (Zeilen 1579-1597)

**✅ KORREKT:**
```python
for device in player_devices:
    variable_cost += device_dispatched * device.variable_cost_zar_per_mwh
```

**KSE Parameter:**
- `device.variable_cost_zar_per_mwh` (früher `cost_per_mwh_zar`)
- Pro Device konfigurierbar
- Wird nur auf dispatched Volume berechnet (nicht auf offered)

### 5.3 Fixed Costs
**Datei:** `engine.py::run_round()` (Zeilen 1579-1597)

**✅ KORREKT:**
```python
for device in player_devices:
    fixed_cost += device.fixed_cost_zar_per_hour  # Pro Stunde
```

**Wichtig:** 
- Fixed Costs fallen **jede Stunde** an
- Unabhängig vom Dispatch Level
- Pro Device separat definierbar

### 5.4 Imbalance Costs
**Datei:** `engine.py::run_round()` (Zeilen 1661-1704)

**✅ KORREKT:**
- Dual Pricing System:
  ```python
  imbalance = actual - dispatched
  if imbalance > 0:  # Over-delivery
      cost = imbalance * imbalance_up_price  # Default: 1200 ZAR/MWh
  else:  # Under-delivery
      cost = abs(imbalance) * imbalance_down_price  # Default: 800 ZAR/MWh
  ```

**Actual Calculation berücksichtigt:**
1. **Availability Envelope:** Solar=0 nachts, Wind variabel
2. **Events:** Multiplier für Ausfälle (z.B. Wartung)
3. **Noise:** `±actual_noise_pct` (Default 5%)

**Formula:**
```python
# 1. Availability
max_available = dispatched * device_availability(hour_of_day)
actual_constrained = min(dispatched, max_available)

# 2. Events
actual_with_events = actual_constrained * event_multiplier

# 3. Noise
actual = actual_with_events + random.uniform(-noise, +noise)
```

### 5.5 Curtailment Costs (Now: "Not Cleared")
**Datei:** `engine.py::run_round()` (Zeilen 1706-1720)

**✅ KORREKT:**
```python
curtailment_mwh = max(0, planned - dispatched)
# Opportunity cost: Could have been sold at bid price
curtailment_cost = curtailment_mwh * (bid_price - smp) if bid_price > smp else 0
```

**Hinweis:** 
- Terminologie wurde im Frontend geändert: "Curtailment" → "Not Cleared"
- Backend nutzt weiterhin `curtailment_*` Feldnamen (OK, nur Display-Text geändert)

### 5.6 CO2 Emissions
**Datei:** `engine.py::run_round()` (Zeilen 1594-1596)

**✅ IMPLEMENTIERT:**
```python
co2_emissions = 0.0
for device in player_devices:
    device_co2_rate = device.get('co2_emissions_kg_per_mwh', 0.0)
    co2_emissions += device_dispatched * device_co2_rate
```

**Status:**
- Backend berechnet CO2 korrekt
- KSE unterstützt `device.co2_emissions_kg_per_mwh` Parameter
- ⚠️ **ABER:** Nicht im Frontend sichtbar (weder Results noch KPIs)
- ⚠️ Keine CO2-basierten Challenges möglich

### 5.7 Profit Calculation
**Datei:** `scheduler.py` (Zeilen 300-400)

**✅ KORREKT:**
```python
profit = revenue - variable_cost - fixed_cost - imbalance_cost - curtailment_cost
```

### 5.8 Congestion Revenue/Grid
**Datei:** `engine.py::apply_grid()` (Zeilen 991-1035)

**Status:** ⚠️ **VEREINFACHT**
- ATC (Available Transfer Capacity) Matrix im KSE konfigurierbar
- Transmission Losses: 2% default
- **ABER:** Congestion Revenue wird nicht an Player verteilt
- Nur als aggregate Signal vorhanden

---

## 6. Kritische Probleme & Empfehlungen

### 🚨 Problem 1: Markets Config nicht im Engine integriert

**Impact:** HIGH
**Betroffene Funktion:** `engine.py::run_round()`

**Was fehlt:**
```python
def run_round(...):
    # NEU HINZUFÜGEN:
    markets_cfg = config.get("markets", {})
    dam_status = markets_cfg.get("dam", [])[round_num-1] if len(...) > round_num-1 else "market_code"
    idm_status = markets_cfg.get("idm", [])[round_num-1] if len(...) > round_num-1 else "market_code"
    bal_status = markets_cfg.get("bal", [])[round_num-1] if len(...) > round_num-1 else "market_code"
    
    # Skip Market Clearing wenn "off"
    if dam_status == "off" and idm_status == "off" and bal_status == "off":
        return {no_trading_results}
    
    # Bei "on": Ignoriere Gate Hours (alle Stunden tradeable)
    # Bei "market_code": Nutze Gate Logic (wie aktuell)
```

**Empfehlung:** Implementierung erforderlich für Konsistenz zwischen UI und Engine

---

### 🚨 Problem 2: Balancing Market fehlt komplett

**Impact:** MEDIUM
**Betroffene Funktion:** Gesamtes System

**Was fehlt:**
- Balancing Market (BAL) ist in Markets Tab konfigurierbar
- **ABER:** Keine Implementation im Engine
- Kein Balancing Settlement nach Actual Delivery
- Imbalance Costs sind **nicht dasselbe** wie Balancing Market

**SAWEM Balancing Market:**
1. Nach Real-Time Delivery: `imbalance = actual - dispatched`
2. Balancing Market cleart diese Imbalance
3. Separate Balancing Price (nicht SMP)

**Aktuell:** Nur Imbalance Penalty (nicht echter Balancing Market)

**Empfehlung:** 
- Option 1: "BAL" in Markets Tab entfernen (nicht implementiert)
- Option 2: Balancing Market als separates Clearing implementieren

---

### 🚨 Problem 3: CO2 unsichtbar im Frontend

**Impact:** LOW-MEDIUM
**Betroffene Dateien:** `RoundResultsScreen.jsx`, `ScenarioResultsScreen.jsx`

**Was fehlt:**
- Backend berechnet CO2 korrekt
- Frontend zeigt CO2 nirgendwo an
- Keine CO2-basierten Challenges

**Empfehlung:** 
- CO2 in Round Results Tabelle hinzufügen
- CO2-Challenge Metrics aktivieren: `total_co2_emissions`, `round_co2_emissions`
- Optional: CO2 Price als KSE Parameter

---

### ⚠️ Problem 4: Round 1 Baseline-Mode nur teilweise implementiert

**Impact:** LOW
**Betroffene Funktion:** `engine.py::generate_device_baseline()`

**Status:**
- `first_round_baseline_mode` existiert im KSE
- Optionen: "device_default", "zero", "setup_round"
- **ABER:** `generate_device_baseline()` wird nicht im Engine aufgerufen
- Round 1 nutzt immer submitted Forecast (kein Auto-Baseline)

**Empfehlung:** 
- Entweder Feature vollständig implementieren
- Oder aus KSE entfernen (aktuell non-functional)

---

## 7. Stärken des Systems

### ✅ Exzellente Aspekte:

1. **SAWEM Delta-based Clearing** korrekt implementiert
2. **Pro-rata Tie-Breaking** für faire Allokation
3. **Inflexible Units Filter** für realistischen SMP
4. **Device-specific Availability** (Solar/Wind) funktioniert
5. **Time-dependent Profiles** (hourly + seasonal) implementiert
6. **Multi-Bid System** flexibel (global + device-level override)
7. **Comprehensive Tracking** (per player, device, lot, hour)
8. **Dual Pricing Imbalance** gemäß SAWEM
9. **Event System** mit round-based und probabilistic triggers
10. **Seed-based Reproducibility** für Testing

---

## 8. Empfohlene Actions (Priorität)

### 🔴 CRITICAL (sofort):
1. **Markets Config Integration im Engine**
   - Files: `engine.py::run_round()`
   - Implementierung: ~100 Zeilen
   - Testing: Essentiell vor Production

### 🟡 HIGH (nächste Iteration):
2. **CO2 Frontend Integration**
   - Files: `RoundResultsScreen.jsx`, Challenge Metrics
   - Implementierung: ~50 Zeilen
   
3. **Balancing Market Entscheidung**
   - Entweder: Entfernen aus Markets Tab
   - Oder: Implementieren als Phase 3 Feature

### 🟢 LOW (später):
4. **First Round Baseline Mode** vervollständigen
5. **Congestion Revenue Distribution** implementieren
6. **Grid/Zone Visualization** im Player UI

---

## 9. Testing Empfehlungen

### Test-Szenarien:

1. **Markets Config Tests:**
   ```
   - Round 1: DAM=on, IDM=off, BAL=off
   - Round 2: DAM=off, IDM=on, BAL=off  (Delta Clearing)
   - Round 3: DAM=on, IDM=on, BAL=off   (Both active)
   - Round 4: All="on" (Gates ignorieren)
   ```

2. **Multi-Player Market Tests:**
   - 2 Producers + 2 Consumers
   - Overlapping Bids (Price Ties)
   - Consumer Over-bidding (WTP > Price Cap)

3. **Time-dependent Profile Tests:**
   - Solar Generator: Verify 0 dispatch nachts
   - Wind Generator: Verify availability pattern
   - Load Consumer: Verify load profile matching

4. **Financial Calculation Tests:**
   - Verify: Revenue = (DA_vol * DA_SMP) + (ID_delta * IDP)
   - Verify: Profit = Rev - VarCost - FixCost - Imb - Curt
   - Verify: CO2 = Σ(dispatched * co2_rate)

---

## 10. Fazit

**Der Rechenapparat ist technisch SOLIDE und KORREKT implementiert.**

✅ **Stärken:**
- SAWEM-konformes Market Clearing
- Robuste Financial Calculations
- Comprehensive KPI Tracking
- Flexible Bid System

⚠️ **Kritische Lücken:**
1. Markets Tab Config wird nicht im Engine genutzt
2. Balancing Market fehlt (trotz UI-Option)
3. CO2 unsichtbar im Frontend

**Empfehlung:** Implementierung von Problem 1 (Markets Config) ist **vor Production-Release erforderlich**. Probleme 2 und 3 sind "Nice-to-have" für spätere Iterationen.

**Code-Qualität:** 8/10 (Abzug nur wegen fehlender Markets Config Integration)

---

**Review durchgeführt von:** GitHub Copilot  
**Datum:** 11. Februar 2026  
**Engine Version:** engine.py (2094 Zeilen), scheduler.py (493 Zeilen)
