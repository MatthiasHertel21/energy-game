# Hour Status Logic - Market Timeline Pseudocode (V2)

## Zweck
Bestimmt für jede Stunde im Horizont den Status ("locked", "da", "da_r1", "id", "forecast") basierend auf:
- Aktuelle Runde und Simulationsstunde
- Market-Konfiguration (DAM/IDM enabled/gated/disabled pro Runde)
- Gate Hours (DA Gate, ID Gate)
- Day 1 Baseline Mode (nur Round 1)

## Algorithmus-Prinzip
**Zweistufiger Ansatz:**
1. **Markierung**: Tage werden als "DAM enabled/disabled" und "IDM enabled/disabled" markiert
2. **Zuweisung**: Aus Markierung + Zeitpunkt wird finaler hour_status abgeleitet

---

## Input-Parameter

```
CONFIG (aus Scenario):
  start_hour              // Startzeit (z.B. 0 für 00:00, 12 für 12:00)
  round_span              // Stunden pro Runde (meist 24)
  day_ahead_gate_hour     // DA Gate Uhrzeit (meist 12)
  id_gate_interval        // ID Gate Intervall in Stunden (z.B. 4)
  id_gate_base            // ID Gate Basis-Uhrzeit (z.B. 0)
  day_one_baseline_mode   // "preset" | "zero" | "edit_round_one"
  
MARKETS (aus Scenario, Arrays pro Runde):
  dam_status[round]       // "enabled" | "disabled" | "gated"
  idm_status[round]       // "enabled" | "disabled" | "gated"
  
  # Mapping: "on" → "enabled", "off" → "disabled", "market_code" → "gated"
  
STATE (aktuelle Session):
  current_round           // 1, 2, 3, ...
  current_sim_hour        // Absolute Stunde seit Spielbeginn
  horizon_hours           // Anzahl Stunden im Forecast (z.B. 72, 96, 120)
```

---

## Pseudocode (V2 - Zweistufig)

```python
# ============================================================
# SCHRITT 1: INITIALISIERUNG
# ============================================================

function calculate_hour_status(config, markets, state):
    
    # 1.1 Aktuelle Stunde und Regelwerk bestimmen
    current_sim_hour = (current_round - 1) * round_span
    hour_of_day = (start_hour + current_sim_hour) % 24
    
    # Stunden bis Mitternacht (Ende von Day 1)
    hours_until_first_midnight = (24 - start_hour) % 24
    if hours_until_first_midnight == 0:
        hours_until_first_midnight = 24
    
    # Market Status für aktuelle Runde (0-indexed)
    round_idx = current_round - 1
    dam_mode = dam_status[round_idx]  # "enabled" | "disabled" | "gated"
    idm_mode = idm_status[round_idx]  # "enabled" | "disabled" | "gated"
    
    # 1.2 Alle Stunden initial als disabled + future markieren
    dam_enabled_hours = [False] * horizon_hours
    idm_enabled_hours = [False] * horizon_hours
    
    # Tages-Grenzen berechnen
    current_day_start = hours_until_first_midnight + (current_round - 1) * 24
    current_day_end = current_day_start + 24
    next_day_start = current_day_end
    next_day_end = next_day_start + 24


# ============================================================
# SCHRITT 2: TAGE MARKIEREN (DAM/IDM enabled/disabled)
# ============================================================

    # Spezial-Flag für Round 1 Day 1
    mark_as_r1_special = {}
    
    # -------------------- 2.1-2.4: DAM Markierung --------------------
    
    # 2.1: Round 1 + edit_round_one → Day 1 (aktueller Tag) = DAM enabled
    if current_round == 1 AND day_one_baseline_mode == "edit_round_one":
        for h in range(hours_until_first_midnight):
            if h < horizon_hours:
                dam_enabled_hours[h] = True
                mark_as_r1_special[h] = True  # Flag für "da_r1" Status
    
    # 2.2: DAM "enabled" → Folgetag = DAM enabled (immer offen)
    if dam_mode == "enabled":
        for h in range(next_day_start, min(next_day_end, horizon_hours)):
            dam_enabled_hours[h] = True
    
    # 2.3: DAM "gated" + vor Gate → Folgetag = DAM enabled
    elif dam_mode == "gated":
        if hour_of_day < day_ahead_gate_hour:
            for h in range(next_day_start, min(next_day_end, horizon_hours)):
                dam_enabled_hours[h] = True
        # Nach Gate: nichts markieren (bleibt disabled)
    
    # 2.4: DAM "disabled" → Folgetag = DAM disabled
    # (bereits durch Initialisierung erledigt, nichts zu tun)
    
    
    # -------------------- 2.5-2.7: IDM Markierung --------------------
    
    # 2.5: IDM "enabled" → aktueller Tag ab (now + freeze) = IDM enabled
    if idm_mode == "enabled":
        freeze_hours = id_gate_interval  # Freeze-Period = nächstes Gate
        id_start = current_sim_hour + freeze_hours
        for h in range(id_start, min(current_day_end, horizon_hours)):
            idm_enabled_hours[h] = True
    
    # 2.6: IDM "gated" → zwischen ID Gates = IDM enabled (mit freeze)
    elif idm_mode == "gated":
        next_gate = calculate_next_id_gate(current_sim_hour, id_gate_interval, id_gate_base)
        gate_after_next = next_gate + id_gate_interval
        
        # Stunden zwischen nächstem Gate und übernächstem Gate
        for h in range(next_gate, min(gate_after_next, current_day_end, horizon_hours)):
            idm_enabled_hours[h] = True
    
    # 2.7: IDM "disabled" → aktueller Tag = IDM disabled
    # (bereits durch Initialisierung erledigt, nichts zu tun)


# ============================================================
# SCHRITT 3: FINALE STATUS-ZUWEISUNG
# ============================================================

    hour_status = []
    
    for h in range(horizon_hours):
        
        # 3.1: Vergangenheit → "locked" (past)
        if h < current_sim_hour:
            hour_status.append("locked")
        
        # 3.2: DAM enabled → "da" (und IDM für diese Stunde deaktivieren)
        elif dam_enabled_hours[h]:
            if mark_as_r1_special.get(h, False):
                hour_status.append("da_r1")  # Cyan: Round 1 Day 1 Spezial
            else:
                hour_status.append("da")     # Gelb: Normal DA
            
            # DA überschreibt ID (gegenseitiger Ausschluss)
            idm_enabled_hours[h] = False
        
        # 3.3: IDM enabled → "id"
        elif idm_enabled_hours[h]:
            hour_status.append("id")         # Orange: ID-Handel
        
        # 3.4: Sonst → "forecast"
        else:
            hour_status.append("forecast")   # Hellblau: Nur Prognose


# ============================================================
# OUTPUT
# ============================================================

    return hour_status[]
```

---

## Status-Bedeutung

| Status | Farbe | Bedeutung | Editierbar? |
|--------|-------|-----------|-------------|
| `locked` | Grau (#9E9E9E) | Bereits geliefert (Vergangenheit) | ❌ Nein |
| `da` | Gelb (#FDD835) | Day-Ahead Market offen | ✅ Ja |
| `da_r1` | Cyan (#00BCD4) | Round 1 Day 1 Spezial-Öffnung | ✅ Ja |
| `id` | Orange (#FB8C00) | Intraday Market offen | ✅ Ja |
| `forecast` | Hellblau (#E3F2FD) | Nur Prognose (zu weit oder disabled) | ✅ Ja (optional) |

---

## Wichtige Regeln

### 1. Round-Trading-Modell
- **Round 1:** Handelt für **Day 2** (Day 1 nur bei `edit_round_one`)
- **Round N (N≥2):** Handelt für **Day N+1** (Folgetag)

### 2. Gate Hours
- **DA Gate:** Täglich um `day_ahead_gate_hour` (meist 12:00)
  - VOR Gate: DA für Folgetag tradeable
  - NACH Gate: DA geschlossen bis nächster Tag
- **ID Gate:** Alle `id_gate_interval` Stunden (z.B. alle 4h)
  - Zwischen Gates: ID tradeable
  - Nach letztem Gate: nur noch forecast

### 3. Market Enable/Disable
- **DAM "off":** Keine gelben `da` Balken (→ `forecast`)
- **IDM "off":** Keine orangen `id` Balken (→ `forecast` oder `locked`)
- **Beide "off":** Nur `locked` (Vergangenheit) + `forecast` (Zukunft)

### 4. Sonderfall Round 1 Day 1
- `day_one_baseline_mode = "edit_round_one"`: **Cyan** `da_r1` (editierbar)
- `day_one_baseline_mode = "preset"/"zero"`: **Grau** `locked` (nicht editierbar)

---

## Beispiele

### Beispiel 1: Round 1, Start 00:00, DAM on, IDM on

```
Config:
  start_hour = 0
  round_span = 24
  day_ahead_gate_hour = 12
  day_one_baseline_mode = "edit_round_one"
  dam_status[0] = "on"
  
State:
  current_round = 1
  current_sim_hour = 0
  
Ergebnis (Stunden 0-71):
  0-23:   da_r1     (Cyan: Round 1 Day 1 Sonderöffnung)
  24-47:  da        (Gelb: DA für Day 2)
  48-71:  forecast  (Hellblau: Day 3 noch nicht handelbar)
```

### Beispiel 2: Round 3, Start 00:00, DAM off, IDM on

```
Config:
  start_hour = 0
  round_span = 24
  dam_status[2] = "off"
  idm_status[2] = "on"
  
State:
  current_round = 3
  current_sim_hour = 48
  
Ergebnis (Stunden 0-95):
  0-47:   locked    (Grau: R1+R2 bereits geliefert)
  48-71:  id        (Orange: Day 3 = aktueller Tag, ID-Handel)
  72-95:  forecast  (Hellblau: Day 4 = DAM disabled → kein DA)
  96+:    forecast  (Hellblau: Zu weit in Zukunft)
```

### Beispiel 3: Round 2, Start 00:00, DAM on, IDM on, current_hour = 26

```
Config:
  start_hour = 0
  round_span = 24
  day_ahead_gate_hour = 12
  id_gate_interval = 4
  dam_status[1] = "on"
  idm_status[1] = "on"
  
State:
  current_round = 2
  current_sim_hour = 24  (Day 2 Start)
  hour_of_day = 0
  da_market_open = true  (0 < 12)
  next_id_gate = 28
  
Ergebnis (Stunden 0-95):
  0-23:   locked    (Grau: Day 1 bereits geliefert)
  24-27:  id        (Orange: Day 2 aktuell, vor ID-Gate)
  28-47:  id        (Orange: Day 2 Rest, nach ID-Gate)
  48-71:  da        (Gelb: Day 3 = DA-Tag für Round 2)
  72-95:  forecast  (Hellblau: Day 4 noch nicht handelbar)
```

---

## Helper Functions

### calculate_next_id_gate
```python
function calculate_next_id_gate(current_sim_hour, interval, base):
    # Nächstes ID Gate nach current_sim_hour
    # Gates bei: base, base+interval, base+2*interval, ...
    
    gates_passed = floor((current_sim_hour - base) / interval)
    next_gate = base + (gates_passed + 1) * interval
    return next_gate

# Beispiel: interval=4, base=0, current=26
# → gates_passed = floor(26/4) = 6
# → next_gate = 0 + 7*4 = 28
```

---

## Testing

### Test-Cases
1. ✅ Round 1, Day 1 = `da_r1` wenn `edit_round_one`
2. ✅ Round 1, Day 2 = `da` wenn DAM on
3. ✅ Round 2, Day 3 = `da` wenn DAM on
4. ✅ Round 3, Day 4 = `da` wenn DAM on
5. ✅ Round 3, Day 3 = `id` (nicht `da`!)
6. ✅ DAM off → keine `da` Balken
7. ✅ IDM off → keine `id` Balken
8. ✅ Vergangenheit = `locked`
9. ✅ `da_r1` bleibt bei DAM-Filter unverändert

---

## Offene Fragen / TODOs

- [ ] Wie verhält sich `da_market_open` wenn DA Gate während Round geschlossen wird?
- [ ] Sollte `forecast` editierbar sein oder read-only?
- [ ] Multi-Day-Rounds (round_span != 24): Logik anpassen?
