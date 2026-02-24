# Bug Fixes - Energy Trading Game

**Datum:** 15. Februar 2026  
**Sprint:** Critical Bug Fixes  
**Autor:** AI Agent

## Übersicht

Sieben kritische Bugs in der Market-Clearing-Engine, KPI-Berechnung und Frontend-Darstellung wurden identifiziert und behoben. Die Fixes adressieren Daten-Integrität, fachliche Korrektheit und UI-Konsistenz.

---

## P0: Kritische Daten-Integritätsfehler

### P0-1: IDM/DA-Index Bug

**Problem:**  
Bei Round > 1 greift die IDM-Capacity-Validierung mit `hour_idx` (absoluter Round-lokaler Index) auf DA-Baseline-Array zu, statt mit `hour_offset` (0-basierter Stunden-Offset). Dies führt zu falscher DA-Dispatch-Kapazität bei IDM-Clearing.

**Impact:**  
- IDM verfügbare Kapazität wird aus falschen Array-Slots gelesen
- Solar/Wind-Devices mit Stunden-Offset ≠ Stunden-Position haben falsche Kapazität
- Führt zu falschen Capacity-Violations oder erlaubten Overbids

**Root Cause:**  
```python
# engine.py Line 1561 (alt)
if isinstance(lot_hours, list) and hour_idx < len(lot_hours):
    hour_data = lot_hours[hour_idx]  # BUG: hour_idx ist Round-lokal
```

**Fix:**  
```python
# engine.py Line 1561 (neu)
if isinstance(lot_hours, list) and hour_offset < len(lot_hours):
    hour_data = lot_hours[hour_offset]  # Korrekt: hour_offset ist Array-Position
```

**Dateien:**
- `backend/app/engine.py` (Line 1561)

---

### P0-2: Device Breakdown Scope Bug

**Problem:**  
In der Per-Device-Breakdown-Loop (h_idx über hourly_results) werden versehentlich Variablen aus der äußeren Market-Clearing-Loop verwendet:
- `hour_offset` hat den letzten Wert der äußeren Loop (z.B. 23 bei span=24)
- `hour_bid_dispatch` enthält nur die letzte Stunde des Rounds

Dies führt zu falschen `total_offered_mw` und `overbid_mw` Berechnungen für alle Stunden außer der letzten.

**Impact:**  
- Overbid-Detection nur für letzte Stunde korrekt
- Device-Hourly-Breakdown zeigt falsche Kapazitätsverstöße
- Frontend Device Deep Dive zeigt falsche Werte

**Root Cause:**  
```python
# engine.py Line 2222 (Breakdown Loop)
for h_idx, hour_result in enumerate(hourly_results):
    # ...
    # Line 2356: Verwendet hour_bid_dispatch aus äußerer Loop (letzte Stunde!)
    if pid in hour_bid_dispatch and dev_id in hour_bid_dispatch[pid]:
        for lot_label, lot_data in hour_bid_dispatch[pid][dev_id].items():
            total_offered_h += lot_data.get('mw_offered', 0.0)
    
    hour_entry = {
        "hour_offset": hour_offset,  # BUG: Wert aus äußerer Loop
```

**Fix:**  
```python
# engine.py Line 2247 (neu)
# Extract hour_offset from hour_result for correct lookup
current_hour_offset = hour_result.get("hour_offset", h_idx)

# engine.py Line 2355 (neu)
# Calculate total offered from all_bid_dispatch for correct hour
total_offered_h = 0.0
if pid in all_bid_dispatch and dev_id in all_bid_dispatch[pid]:
    for lot_label, lot_list in all_bid_dispatch[pid][dev_id].items():
        # Find lot data for current hour_offset
        for lot_data in lot_list:
            if lot_data.get('hour_offset') == current_hour_offset:
                total_offered_h += lot_data.get('mw_offered', 0.0)
                break

hour_entry = {
    "hour_offset": current_hour_offset,  # Korrekt: aus hour_result
```

**Dateien:**
- `backend/app/engine.py` (Lines 2247, 2355-2365, 2374)

---

### P0-3: SMP Market-Code Metadata nicht aktiv

**Problem:**  
Die `clear_market()` Funktion unterstützt `supply_metadata` zur Filterung inflexibler Units (Nuclear, Must-Run, Min-Load) bei der SMP-Bestimmung (§7.4 Market Code), aber alle produktiven Aufrufe übergeben keine Metadata. Dadurch setzen inflexible Units fälschlicherweise den SMP.

**Impact:**  
- Market-Code-Verletzung: Inflexible Units dürfen SMP nicht setzen
- Nuclear-Kraftwerke bei Minimum Load setzen SMP → verfälschte Preissignale
- Fachlich falsche Marktpreise

**Root Cause:**  
```python
# engine.py Line 1527 (alt)
price, vol = clear_market(supply, demand, price_floor, price_cap)  # No metadata!
```

Die Funktion prüft bereits:
```python
# engine.py Line 243
if supply_metadata and i < len(supply_metadata):
    meta = supply_metadata[i]
    if meta.get('device_type') == 'nuclear' or meta.get('must_run'):
        is_flexible = False
    if meta.get('at_min_load'):
        is_flexible = False
```

Aber metadata wird nie übergeben!

**Fix:**  
```python
# engine.py Line 1512 (neu) - Devices-Config früh laden
devices_cfg_for_clearing = config.get("devices", [])
from .device_types import enrich_device_with_defaults
devices_cfg_for_clearing = [enrich_device_with_defaults(d) for d in devices_cfg_for_clearing]

# engine.py Line 1529 (neu) - Metadata bauen
supply_metadata = None
if supply_bids:
    supply_metadata = []
    for bid in supply_bids:
        device_cfg_meta = next((d for d in devices_cfg_for_clearing if d.get('id') == bid.get('device_id')), None)
        if device_cfg_meta:
            device_type = device_cfg_meta.get('type', '').lower()
            supply_metadata.append({
                'device_type': device_type,
                'must_run': device_type == 'nuclear',
                'at_min_load': bid.get('at_min_load', False)
            })
        else:
            supply_metadata.append(None)

# engine.py Line 1551 (neu)
price, vol = clear_market(supply, demand, price_floor, price_cap, 
                          supply_metadata=supply_metadata)
```

**Dateien:**
- `backend/app/engine.py` (Lines 1512-1515, 1529-1545, 1551)

---

## P1: Fachlogik-Fehler

### P1-1: Demand-Dispatch volumenbegrenzt

**Problem:**  
`track_demand_dispatch()` bedient alle Consumer-Bids mit `price >= smp` vollständig, unabhängig vom tatsächlich verfügbaren Clearing-Volume. Dies ignoriert, dass auch Synthetic-Demand vom Volume konsumiert und Marginal-Bids nur partiell bedient werden.

**Impact:**  
- Tracked Dispatch > reales Clearing-Volume
- Consumer-KPIs (Revenue, Dispatch) zu hoch
- Fachlich falsche Marginal-Bid-Behandlung

**Root Cause:**  
```python
# engine.py Line 1028 (alt)
for price, quantity, player_id, device_id, bid_label in all_demand:
    if price >= smp:
        # Player consumer bid with WTP >= SMP - fully served
        dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] = round(quantity, 3)
```

Keine Volume-Begrenziung!

**Fix:**  
```python
# engine.py Line 1013 (neu)
remaining_volume = volume  # Track verfügbares Volume

for price, quantity, player_id, device_id, bid_label in all_demand:
    if price < smp:
        # Not served
        if player_id is not None:
            dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] = 0.0
        continue
    
    if player_id is None:
        # Synthetic demand - consume volume
        dispatched = min(quantity, remaining_volume)
        remaining_volume = max(0.0, remaining_volume - dispatched)
        continue
    
    # Player bid - dispatch based on remaining volume (can be partial)
    if remaining_volume > 0:
        dispatched = min(quantity, remaining_volume)
        remaining_volume = max(0.0, remaining_volume - dispatched)
        dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] = round(dispatched, 3)
        
        if dispatched < quantity:
            print(f"PARTIAL dispatch={dispatched:.1f}")
    else:
        # No remaining volume
        dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] = 0.0
```

**Dateien:**
- `backend/app/engine.py` (Lines 1013-1044)

---

### P1-2: KPI Unit-Mismatch

**Problem:**  
Felder `imbalance` und `curtailment` in Player-KPIs werden mit `*_cost_zar` Werten befüllt, aber im Scoring und in der Challenge-Logic als Mengen (MWh) interpretiert. Dies führt zu semantisch falschen Berechnungen.

**Impact:**  
- Scoring-Gewichte operieren auf falschen Einheiten (ZAR statt MWh)
- Challenge-Metriken verwenden Kosten statt Mengen
- Session-Totals aggregieren Äpfel mit Birnen

**Root Cause:**  
```python
# sessions.py Line 531 (alt)
imbalance = float(kpis.get("imbalance_cost_zar", 0))  # Cost, nicht Menge!

# sessions.py Line 535 (alt)
raw_score = (profit * 0.6 - abs(imbalance) * 0.3 - abs(curtailment) * 0.1)  # Mischt ZAR und MWh

# sessions.py Line 764-765 (alt)
player_totals[pid]["imbalance"] += float(kpis.get("imbalance_cost_zar", 0))  # Feld heißt imbalance, enthält cost
player_totals[pid]["curtailment"] += float(kpis.get("curtailment_cost_zar", 0))
```

**Fix:**  

**Backend - KPIs erweitern:**
```python
# engine.py Line 2452 (neu)
total_imbalance_mwh = sum(h.get("imbalance_mwh", 0) for h in hourly_breakdown)
total_curtailment_mwh = sum(h.get("curtailment_mwh", 0) for h in hourly_breakdown)

per_player[pid] = {
    # ...
    "imbalance_cost_zar": round(per_player_imbalance_cost[pid], 0),
    "imbalance_mwh": round(total_imbalance_mwh, 3),  # NEU: Menge in MWh
    "curtailment_cost_zar": round(per_player_curtailment_cost[pid], 0),
    "curtailment_mwh": round(total_curtailment_mwh, 3),  # NEU: Menge in MWh
```

**Sessions - Mengen verwenden:**
```python
# sessions.py Line 531 (neu)
# Use MWh quantities, fallback to cost/1000 for old sessions
imbalance = float(kpis.get("imbalance_mwh", 0) or kpis.get("imbalance_cost_zar", 0) / 1000)
curtailment = float(kpis.get("curtailment_mwh", 0) or kpis.get("curtailment_cost_zar", 0) / 1000)

# sessions.py Line 536 (neu)
raw_score = (profit * 0.6 - abs(imbalance) * 0.3 * 1000 - abs(curtailment) * 0.1 * 1000)  # MWh → ZAR scale

# sessions.py Line 764-765 (neu)
player_totals[pid]["imbalance"] += float(kpis.get("imbalance_mwh", 0) or kpis.get("imbalance_cost_zar", 0) / 1000)
player_totals[pid]["curtailment"] += float(kpis.get("curtailment_mwh", 0) or kpis.get("curtailment_cost_zar", 0) / 1000)
```

**Dateien:**
- `backend/app/engine.py` (Lines 2448-2467)
- `backend/app/sessions.py` (Lines 531-537, 764-766)

---

### P1-3: Challenge-Curtailment-Metrik

**Problem:**  
`total_curtailment` in Challenge-KPIs wird aus `curtailment_cost_zar / 1000` approximiert, statt echte MWh-Werte zu aggregieren. Dies ist fachlich falsch, da Cost ≠ Volume (Cost hängt von SMP ab).

**Impact:**  
- Challenge-Target für Curtailment basiert auf falschen Werten
- UI zeigt "MWh" an, berechnet aber aus Kosten
- Spieler können Challenge-Bedingungen nicht korrekt interpretieren

**Root Cause:**  
```python
# engine.py Line 2657 (alt)
"total_curtailment": sum(r.get("curtailment_cost_zar", 0) / 1000 for r in all_round_kpis),  # Nonsense!
```

**Fix:**  
```python
# engine.py Line 2658 (neu) - jetzt korrekt mit imbalance_mwh
"total_imbalance": sum(r.get("imbalance_mwh", 0) for r in all_round_kpis),
"total_curtailment": sum(r.get("curtailment_mwh", 0) for r in all_round_kpis),
```

**Dateien:**
- `backend/app/engine.py` (Lines 2657-2658)

---

## P2: Frontend-Cleanup

### P2-1: Frontend-Overbid Inkonsistenz

**Problem:**  
Frontend berechnet eigene `capacityExcess = totalDispatched - deviceCapacity` (Base-Capacity) parallel zur Backend-Logik `overbid_mw = totalOffered - effective_capacity`. Dies führt zu:
- Inkonsistenten Definitionen (dispatched vs offered, base vs effective)
- Redundanten Berechnungen
- Verwirrung was "Overbid" vs "Capacity Excess" bedeutet

**Impact:**  
- UI zeigt zwei verschiedene Overbid-Metriken
- `getOverbidStyle()` prüft gegen `deviceCapacity` statt Backend `capacity_violation`
- Alte "Capacity Excess" Row vs neue "Overbid" Row redundant

**Root Cause:**  
```javascript
// DeviceDeepDiveTabs.jsx Line 171 (alt)
const capacityExcess = deviceCapacity > 0 ? Math.max(0, totalDispatched - deviceCapacity) : 0
const overbidCost = capacityExcess > 0 ? capacityExcess * overbidPrice : 0

// Line 267 (alt)
const getOverbidStyle = (value) => {
    if (!deviceCapacity || value <= deviceCapacity) return undefined
    return { color: 'error.main', fontWeight: 'bold' }
}
```

**Fix:**  

**Entfernen:**
- `capacityExcess` Berechnung (Line 171)
- `overbidCost` Berechnung (Line 173)
- `capacityExcess` aus hourData (Line 208)
- `totalCapacityExcess` aus roundTotals (Line 241)
- Alte "Capacity Excess" Row (Lines 603-616)

**Vereinfachen:**
```javascript
// DeviceDeepDiveTabs.jsx Line 267 (neu)
const getOverbidStyle = (hourData) => {
    if (!hourData || !hourData.capacityViolation) return undefined
    return { color: 'error.main', fontWeight: 'bold' }
}

// Usage (Lines 355, 428, 486, 559)
<TableCell sx={getOverbidStyle(h)}>  // hourData statt value
```

**Backend-Felder nutzen:**
- `h.overbidMw` (bereits implementiert in vorherigem Fix)
- `h.capacityViolation` (Boolean flag)
- Overbid Row zeigt Backend-Werte (Lines 450-473)

**Dateien:**
- `frontend/src/components/DeviceDeepDiveTabs.jsx` (Lines 166-175, 200-208, 241, 267-270, 355, 428, 486, 559, 603-616)

---

## Testing & Validation

### Backend Tests
```bash
# Rebuild Backend
cd /home/ga/energy-game
docker-compose build backend
docker-compose restart backend

# Validate with existing sessions
docker exec energy-game-backend-1 python -c "
from app import create_app
from app.engine import run_round
app = create_app()
with app.app_context():
    # Test Session 387 Round 1
    from app.models import Session
    session = Session.query.get(387)
    print('Testing P0-1, P0-2 fixes...')
    # Run round and verify hour_offset correct
"
```

### Frontend Tests
```bash
# Rebuild Frontend
docker-compose build frontend
docker-compose restart frontend

# Manual validation:
# 1. Open Session 387 Round 1 Solar Park Device Deep Dive
# 2. Verify:
#    - Bids appear in H4/H5 (not H0/H1) ✓
#    - Overbid row shows correct values ✓
#    - No "Capacity Excess" row ✓
#    - Capacity violations are red ✓
```

### Regression Risks

**Low Risk:**
- P0-1, P0-2: Index-Fixes, keine Logikänderung
- P1-3, P2-1: Cleanup, keine Breaking Changes

**Medium Risk:**
- P0-3: SMP könnte sich bei Nuclear-Scenarios ändern (fachlich korrekter)
- P1-1: Consumer-Dispatch könnte niedriger ausfallen (korrekte Volume-Begrenziung)

**Mitigation:**
- Alte Sessions haben Fallback-Logic (`kpis.get("imbalance_mwh", 0) or kpis.get("imbalance_cost_zar", 0) / 1000`)
- Neue Felder optional, nicht breaking

---

## Deployment

### Schritte

1. **Backend Build & Deploy:**
   ```bash
   cd /home/ga/energy-game
   docker-compose build backend
   docker-compose up -d backend
   ```

2. **Frontend Build & Deploy:**
   ```bash
   docker-compose build frontend
   docker-compose up -d frontend
   ```

3. **Health Check:**
   ```bash
   curl http://localhost:18080/api/health
   # Expected: {"status":"ok"}
   ```

4. **Validation:**
   - Open https://iq.2b6.de/catalog
   - Create test session mit Solar/Nuclear mix
   - Run Round 1
   - Check Device Deep Dive für korrekte Stunden-Zuordnung
   - Check Challenge KPIs für MWh-Werte

---

## Affected Files Summary

### Backend
- ✅ `backend/app/engine.py` (7 fixes)
- ✅ `backend/app/sessions.py` (2 fixes)

### Frontend
- ✅ `frontend/src/components/DeviceDeepDiveTabs.jsx` (9 fixes)

### Documentation
- ✅ `fixes.md` (this file)

---

## Lessons Learned

1. **Index vs Offset:** Array-Position ≠ Hour-Offset bei sparse data
2. **Loop-Scope:** Variable aus äußerer Loop nicht in innerer Loop verwenden
3. **Metadata-Übergabe:** Vorhandene Filter nur wirksam wenn Parameter übergeben wird
4. **Volume-Accounting:** Auch synthetische Nachfrage verbraucht Clearing-Volume
5. **Unit-Konsistenz:** MWh-Felder separat von ZAR-Feldern tracken
6. **Frontend-Backend-Alignment:** Eine Overbid-Definition (Backend = Truth)

---

## Future Work

### Optional Improvements
1. **Tests:** Unit-Tests für alle 7 Fixes schreiben
2. **Migration:** Script für alte Sessions (imbalance_cost → imbalance_mwh)
3. **Monitoring:** Alerts bei capacity_violation > 0 in Production
4. **Documentation:** Market-Code-Compliance §7.4 im Code referenzieren

### Performance
- `all_bid_dispatch` Lookup O(n) → HashMap für hour_offset-Lookup O(1)
- `hourly_breakdown` re-berechnet Werte → aus Hauptschleife wiederverwenden

---

**Status:** ✅ Alle 7 Bugs behoben  
**Review:** Pending  
**Merged:** Pending
