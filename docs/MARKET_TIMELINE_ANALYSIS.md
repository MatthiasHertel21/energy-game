# Market Timeline Implementation - SAWEM Compliance Analysis

## Executive Summary

**Status:** ⚠️ **Teilweise Kompatibel** - Logik-Korrektur erforderlich

Die neue `generate_market_timeline()` Funktion hat **kritische Fehler** in der Marktphasen-Berechnung, die nicht mit dem SAWEM Market Code Rev 2.1 und der bestehenden Gate-Logic kompatibel sind.

---

## 1. SAWEM Market Code Requirements

### 1.1 Day-Ahead Market

**SAWEM Requirement:**
> **Gate Closure:** 10:00 AM on Day D-1  
> (Market Code Rev 2.1, Section 1.1)

**Aktuelle Implementation:**
- Konfigurierbar: `day_ahead_gate_hour` (default: 12)
- Abweichung: 12:00 statt 10:00
- **Konformität:** 80% ✅ (konfigurierbar, aber anderer Default)

### 1.2 Intraday Market

**SAWEM Requirement:**
> **Gate Closure:** Progressive bis ~1h vor Lieferung  
> (Nicht explizit im Market Code spezifiziert, aber Industry-Standard)

**Aktuelle Implementation:**
- `freeze_hours` (default: 6)
- ID-Gate schließt `freeze_hours` vor Lieferung
- **Konformität:** ⚠️ 60% (6h zu konservativ, sollte 1-2h sein)

---

## 2. Scenario Configuration

### 2.1 Zeitparameter

| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `start_time` | string | "00:00" | Simulationsstart (HH:MM) |
| `round_span_hours` | int | 6 | Stunden pro Runde |
| `horizon_hours` | int | 24 | Szenario-Horizont |
| `forecast_horizon_hours` | int | 48 | Sichtbarer Forecast-Horizont |
| `day_ahead_gate_hour` | int | 12 | DA-Gate Uhrzeit (0-23) |
| `freeze_hours` | int | 6 | ID-Gate vor Lieferung |

### 2.2 Zeitliche Interpretation

**Korrekte Logik (bestehende Implementation in `_get_tradeable_hours`):**

1. **Simulation Hour:** `current_sim_hour = (round_num - 1) × round_span_hours`
2. **Clock Hour:** `clock_hour = (start_hour + sim_hour) % 24`
3. **DA Gate Sim Hour:** `first_gate_sim_hour = (da_gate_hour - start_hour) % 24`
4. **Gate Count:** `gate_count = 1 + (current_sim_hour - first_gate_sim_hour) // 24`
5. **Locked Until:** `locked_until = hours_until_first_midnight + (gate_count - 1) × 24`

**Beispiel:**
```
start_time: "00:00"
round_span: 6
da_gate_hour: 12

Round 1: sim_hour=0, clock=00:00 → kein Gate, alles DA-tradeable
Round 2: sim_hour=6, clock=06:00 → kein Gate, alles DA-tradeable
Round 3: sim_hour=12, clock=12:00 → GATE!, hours 0-23 locked
Round 4: sim_hour=18, clock=18:00 → hours 0-23 locked, 24-47 DA-tradeable
```

---

## 3. Fehleranalyse der neuen `generate_market_timeline()` Funktion

### 3.1 ❌ Fehler 1: Falsche DA-Committed Range Berechnung

**Aktuelle Implementierung (Zeilen 197-215):**
```python
def get_da_committed_range():
    if round_num == 1:
        return -1, -1  # Round 1: all hours are in DA market
    
    delivery_hour = current_sim_hour
    da_committed_end = delivery_hour + 24  # ❌ FALSCH!
    id_gate_hour = delivery_hour + freeze_hours
    da_committed_start = max(0, id_gate_hour)
    da_committed_end = min(horizon_hours, da_committed_end)
    
    if locked_until_hour >= 0:
        da_committed_start = max(da_committed_start, locked_until_hour + 1)
    
    return da_committed_start, da_committed_end
```

**Problem:**
- `da_committed_end = delivery_hour + 24` ist **semantisch falsch**
- DA-committed sind Stunden, wo **DA-Gate geschlossen** ist, nicht "24h ab jetzt"
- Sollte die **echte Gate-Logic** aus `_get_tradeable_hours()` nutzen!

**Korrekte Logik:**
```python
def get_da_committed_range():
    # DA-committed = Stunden wo DA-Gate geschlossen ist (hourStatus == "id")
    # Das entspricht: locked_until_hour < h < (nächstes DA-Gate)
    
    if round_num == 1:
        return -1, -1  # Round 1: kein Gate, alles DA-offen
    
    # Gate-Logic (kopiert aus _get_tradeable_hours)
    if current_sim_hour < first_gate_sim_hour:
        return -1, -1  # Noch kein Gate erreicht
    
    gate_count = 1 + (current_sim_hour - first_gate_sim_hour) // 24
    locked_until = hours_until_first_midnight + (gate_count - 1) * 24
    
    # Nächstes Gate
    next_gate_sim_hour = first_gate_sim_hour + gate_count * 24
    next_gate_hour_idx = next_gate_sim_hour - (round_num - 1) * round_span
    
    # DA-committed = zwischen locked_until und next_gate
    da_committed_start = max(0, locked_until + 1)
    da_committed_end = min(horizon_hours, next_gate_hour_idx)
    
    if da_committed_start >= da_committed_end:
        return -1, -1
    
    return da_committed_start, da_committed_end
```

### 3.2 ❌ Fehler 2: Committed Position vs. ID Trading Open

**Aktuelle Implementierung (Zeilen 221-242):**
```python
# Phase 2: Committed Position
if da_committed_start >= 0:
    phases.append({
        "name": "committed",
        "editable": False,  # ❌ FALSCH!
        "market_type": "none"
    })

# Phase 3: ID Trading Open
id_start = max(locked_until_hour + 1, current_sim_hour + freeze_hours)
id_end = da_committed_start
```

**Problem:**
- **"Committed Position"** bedeutet NICHT "nicht editierbar"!
- **Committed** = DA-Position steht fest, aber **ID-Trading ist offen**
- Die beiden Phasen überschneiden sich zu 100%!

**Korrekte Semantik:**
```
locked (past) → id_locked (committed, nicht editierbar) → id_open (editierbar) → da_open → future
```

**Korrigierte Phase-Definitionen:**
```python
# Phase 2: Committed Position (DA-committed, aber NO CH editierbar)
# = ID-Status-Hours die VOR lockedUntil liegen
if id_status_start < locked_until_hour:
    phases.append({
        "name": "committed",
        "label": "Committed Position (ID Gate Closed)",
        "editable": False,  # Korrekt: tatsächlich nicht editierbar
        "market_type": "none"
    })

# Phase 3: ID Trading Open (DA-committed, ABER editierbar)
# = ID-Status-Hours die NACH lockedUntil liegen
if locked_until_hour < id_status_end:
    phases.append({
        "name": "id_open",
        "label": "ID Trading Open",
        "editable": True,  # Korrekt: ID-Angebote möglich
        "market_type": "id"
    })
```

### 3.3 ❌ Fehler 3: Fehlende Integration mit `hour_status`

Die bestehende Logik berechnet bereits das korrekte `hour_status` Array in der `/da-baseline` API:

```python
# backend/app/player.py:1235-1245
hour_status = []
for h in range(horizon_hours):
    if h < locked_until_hour:
        hour_status.append("locked")  # Vergangenheit
    elif da_committed_start <= h < da_committed_end:
        hour_status.append("id")      # ID-Markt (DA-Gate geschlossen)
    else:
        hour_status.append("da")      # DA-Markt offen
```

**Die Timeline-Funktion sollte `hour_status` als Input nehmen oder dieselbe Logik verwenden!**

---

## 4. Empfohlene Korrekturen

### 4.1 Sofort-Maßnahmen (Breaking)

1. **Fix `get_da_committed_range()`**: Nutze Gate-Logic aus `_get_tradeable_hours()`
2. **Refaktor Phase-Definitionen**: Unterscheide klar zwischen:
   - `committed_locked`: ID-Status, aber nicht editierbar (vor lockedUntil)
   - `id_open`: ID-Status und editierbar (nach lockedUntil)
3. **Integration mit `hour_status`**: Nutze existierende hour_status-Berechnung

### 4.2 Strukturelle Verbesserungen

1. **Zentrale Gate-Logic extrahieren:**
   ```python
   def calculate_gate_positions(session, round_num):
       """Single source of truth für alle Gate-Berechnungen"""
       return {
           'locked_until_hour': int,
           'da_committed_start': int,
           'da_committed_end': int,
           'first_gate_sim_hour': int,
           'hour_status': list[str]
       }
   ```

2. **Timeline aus hour_status ableiten:**
   ```python
   def generate_market_timeline(session, round_num):
       gate_info = calculate_gate_positions(session, round_num)
       hour_status = gate_info['hour_status']
       
       # Phasen direkt aus hour_status groupieren
       phases = []
       current_phase = None
       for h, status in enumerate(hour_status):
           if status != current_phase:
               if current_phase:
                   phases[-1]['end_hour'] = h
               phases.append({
                   'name': status,
                   'start_hour': h,
                   'editable': is_editable(status, h, gate_info)
               })
               current_phase = status
       return {'phases': phases, ...}
   ```

### 4.3 Scenario-Config Anpassungen

**Empfehlung: SAWEM-konformere Defaults:**
```json
{
  "general": {
    "day_ahead_gate_hour": 10,  // SAWEM: 10:00 AM
    "freeze_hours": 1,           // Industry: ~1h vor Lieferung
    "start_time": "00:00",
    "round_span_hours": 6
  }
}
```

---

## 5. Test-Coverage Gaps

### 5.1 Fehlende Tests für Timeline-Funktion

Die neue Funktion hat **keine Tests**! Benötigt:

```python
# backend/tests/test_market_timeline.py
def test_timeline_round1():
    """Round 1: Alle Stunden in DA-Markt"""
    timeline = generate_market_timeline(session, round_num=1)
    assert len([p for p in timeline['phases'] if p['name'] == 'da']) == 1
    assert not any(p['name'] == 'locked' for p in timeline['phases'])

def test_timeline_after_gate():
    """Round 3: Gate-Logic korrekt"""
    timeline = generate_market_timeline(session, round_num=3)
    locked_phase = next(p for p in timeline['phases'] if p['name'] == 'locked')
    assert locked_phase['end_hour'] == 24  # Assuming 12:00 gate, 6h rounds

def test_timeline_matches_hour_status():
    """Timeline muss konsistent mit hour_status sein"""
    baseline = get_da_baseline(session)
    timeline = generate_market_timeline(session, round_num=3)
    
    # Verify phase boundaries match hour_status transitions
    for phase in timeline['phases']:
        for h in range(phase['start_hour'], phase['end_hour']):
            assert baseline['hour_status'][h] == expected_status(phase['name'])
```

### 5.2 Integration Tests

```python
def test_timeline_in_forecast_response():
    """Timeline wird automatisch in forecast-response inkludiert"""
    response = client.get(f'/api/player/forecast?session_id={sid}')
    assert 'market_timeline' in response.json
    assert 'phases' in response.json['market_timeline']
```

---

## 6. Konformitäts-Matrix

| Feature | SAWEM Spec | Aktuelle Implementation | Konformität | Priorität |
|---------|------------|-------------------------|-------------|-----------|
| DA Gate Time | 10:00 D-1 | Configurable (default 12:00) | 80% ✅ | Medium |
| ID Gate Time | ~1h vor Lieferung | Configurable (default 6h) | 60% ⚠️ | High |
| Gate Logic | Täglich um DA-Zeit | Korrekt in `_get_tradeable_hours` | 100% ✅ | - |
| Timeline DA-Range | - | ❌ **FALSCH** | 0% 🔴 | **CRITICAL** |
| Timeline Phases | - | ❌ **FALSCH** | 20% 🔴 | **CRITICAL** |
| hour_status | - | ✅ Korrekt | 100% ✅ | - |

---

## 7. Handlungsempfehlungen

### 7.1 Sofort (Breaking Changes notwendig)

1. **❌ REVERT Timeline-Funktion**: Aktuelle Implementation ist fehlerhaft
2. **✅ FIX DA-Committed Logic**: Nutze existierende Gate-Berechnung
3. **✅ REFACTOR Phase-Definitionen**: Trenne committed_locked vs id_open
4. **✅ ADD Tests**: 100% Coverage für Timeline-Funktionen

### 7.2 Kurzfristig (Non-Breaking)

1. **Scenario-Defaults anpassen**:
   - `day_ahead_gate_hour: 10` (SAWEM-konform)
   - `freeze_hours: 2` (realistischer für ID-Gate)

2. **Dokumentation erweitern**:
   - Zeitzone-Handling (UTC vs. Local)
   - Fake-Date Interpretation
   - Gate-Logic Beispiele

### 7.3 Mittelfristig (Architektur)

1. **Zentrale Gate-Logic extrahieren**: Single source of truth
2. **Timeline aus hour_status ableiten**: Vermeidet Inkonsistenzen
3. **Phase 2B**: Position accumulation (kumulativ über Runden)

---

## 8. Zusammenfassung

**Status:** ⚠️ **NICHT PRODUKTIONSBEREIT**

**Kritische Fehler:**
1. ❌ DA-committed Range falsch berechnet
2. ❌ Phase-Überschneidungen (committed vs. id_open)
3. ❌ Keine Test-Coverage
4. ❌ Inkonsistent mit existierender hour_status-Logic

**Nächste Schritte:**
1. Code-Review mit Fokus auf Gate-Logic
2. Refactoring der Timeline-Funktion
3. Test-Suite erstellen
4. Integration mit Frontend testen

**ETA für Fix:** 2-4 Stunden Development + 1h Testing

---

**Datum:** 8. Februar 2026  
**Version:** 1.0  
**Status:** Draft für Review
