# Debug Panel v2 - Reproduzierbare Testdatengenerierung

## Überblick

Debug Panel v2 ist ein Admin-only Tool im Player Screen für effizientes QA-Testing des Energy Game. Es ermöglicht die Generierung von reproduzierbaren, capacity-safe Testdaten mit wenigen Klicks.

## Features

### ✅ Implementiert

1. **Reproduzierbare Testdatengenerierung**
   - Deterministischer Random-Generator mit Seed
   - Gleicher Seed + gleiche Config = identische Daten
   - Seed im UI sichtbar und editierbar

2. **Capacity-Safe Generator**
   - Keine ungewollten Overbids im Standardfall
   - Producer: Lot-Summen <= effektive Kapazität (inkl. Verfügbarkeit/Profile)
   - Consumer: Plausible WTP-/Mengenstruktur ohne Extremwerte
   - Presets: conservative, balanced, aggressive

3. **Runden-spezifische Generierung**
   - Standard: Nur aktuell handelbare Stunden der aktiven Runde
   - Optional: Full Horizon als expliziter Opt-in

4. **Quick Actions**
   - Generate Test Data (Current Round)
   - Validate Capacity
   - Submit Current Round
   - Run Round Now (nur in Solo-Modus)
   - Show/Open Latest Debug Report

5. **Debug-Mode Toggle**
   - Persistent pro Session
   - Aktiviert Debug-Logging für Submissions

6. **UX & Fehlerführung**
   - Klare Status-/Fehlermeldungen je Aktion
   - Bei Fehlern: Device, Stunde, Wert, Limit anzeigen
   - Keine stillen Fehlschläge

## Bedienung

### Zugriff

Das Debug Panel ist **nur für Admins** sichtbar und erscheint automatisch im Player Screen unterhalb des Breadcrumbs.

### Testdaten generieren

1. **Preset wählen:**
   - **Conservative:** Sichere Auslastung (40-70%), geringe Preisvarianz
   - **Balanced:** Moderate Auslastung (50-90%), mittlere Varianz
   - **Aggressive:** Hohe Auslastung (70-100%), hohe Varianz

2. **Seed eingeben (optional):**
   - Leer lassen für automatische Generierung
   - Gleicher Seed = gleiche Daten (reproduzierbar)
   - Nach Generierung wird verwendeter Seed angezeigt

3. **Full Horizon aktivieren (optional):**
   - Standard: Nur handelbare Stunden der aktuellen Runde
   - Full Horizon: Alle Stunden im Forecast-Horizont

4. **"Generate Test Data" klicken:**
   - Daten werden generiert und automatisch in Forecasts geladen
   - Success-Message zeigt Seed und Anzahl generierter Stunden

### Kapazität validieren

- **"Validate Capacity" klicken:**
  - Generiert Testdaten (wie oben)
  - Validiert, dass alle Werte innerhalb Kapazitätsgrenzen liegen
  - Zeigt Fehler und Warnungen mit Device/Stunde/Wert-Details

### Quick Actions

- **Submit Current Round:** Sofortiges Abschicken des aktuellen Forecasts
- **Run Round Now:** Runde sofort ausführen (nur Solo-Modus)
- **Debug Report:** Öffnet neuesten Debug Report in neuem Tab

### Debug-Mode

- **Checkbox aktivieren:** Submissions erhalten Debug-Flag
- Backend erzeugt detaillierte Debug Reports
- Persistent pro Session (bleibt nach Reload erhalten)

## Entwickler-Dokumentation

### Backend Architektur

#### Test Data Generator (`backend/app/test_data_generator.py`)

```python
generate_test_data(
    devices: List[Dict],
    scenario_config: Dict,
    session_id: int,
    round_num: int,
    tradeable_hours: List[int],
    preset: str = 'balanced',
    seed: Optional[int] = None,
    full_horizon: bool = False
) -> Dict
```

**Funktionsweise:**
- Seed: `(session_id * 1000 + round_num) % (2^31 - 1)` wenn nicht angegeben
- Utilization-Range je nach Preset und Device-Typ (Producer/Consumer)
- Pattern-Modifier für realistische Profile (Solar, Wind, Load, etc.)
- Capacity-safe: Werte <= `max_capacity * pattern_value * utilization`
- Bid-Split je nach Preset (A/B/C-Proportionen)
- Preise monoton steigend (A ≤ B ≤ C)

**Presets:**

| Preset       | Producer Util | Consumer Util | Price Variance | Bid Split (A/B/C) |
|--------------|---------------|---------------|----------------|-------------------|
| Conservative | 40-70%        | 50-80%        | ±15%           | 50/30/20          |
| Balanced     | 50-90%        | 60-95%        | ±25%           | 40/35/25          |
| Aggressive   | 70-100%       | 80-100%       | ±40%           | 35/35/30          |

#### API Endpoints

**POST `/api/player/generate-test-data/<session_id>`**
- Generiert reproduzierbare Testdaten
- Body: `{ preset, seed?, full_horizon? }`
- Returns: `{ device_hours, device_bids, aggregate_hours, seed_used, warnings }`

**POST `/api/player/validate-capacity/<session_id>`**
- Validiert Kapazitätsgrenzen
- Body: `{ device_hours, device_bids? }`
- Returns: `{ valid, errors, warnings }`

**GET `/api/player/debug-report-url/<session_id>`**
- Gibt URL zum neuesten Debug Report
- Returns: `{ url, filename, round }`

**Admin-Check:** Alle Endpoints prüfen `user.role == Role.admin`

### Frontend Architektur

#### DebugPanel Component (`frontend/src/components/DebugPanel.jsx`)

**Props:**
- `sessionId`: Session ID
- `onTestDataGenerated`: Callback mit generierten Daten
- `onSubmitClick`: Submit-Handler
- `onRunRoundClick`: Run-Round-Handler
- `canRunRound`: Boolean (Admin + Solo-Modus)
- `debugMode`: Boolean State
- `onDebugModeChange`: Debug-Mode Toggle Handler

**State:**
- `expanded`: Panel aufgeklappt/zugeklappt
- `preset`: Aktueller Preset (conservative/balanced/aggressive)
- `seed`: Seed-Input
- `fullHorizon`: Full-Horizon-Flag
- `loading`: Loading-State
- `status`: Success/Error-Messages
- `error`: Error-Messages

**Integration in Player.jsx:**
```jsx
// Admin-Check
const isAdmin = user?.role === 'admin'

// Callbacks
const handleTestDataGenerated = (testData) => {
  setDeviceHours(testData.device_hours)
  setHours(testData.aggregate_hours)
  setDeviceBids(testData.device_bids)
}

const handleRunRoundNow = async () => {
  await api.post(`/api/sessions/${sessionId}/run-round`)
  // Refresh session
}

// Render
{isAdmin && (
  <DebugPanel
    sessionId={sessionId}
    onTestDataGenerated={handleTestDataGenerated}
    onSubmitClick={() => submitCurrent(false)}
    onRunRoundClick={handleRunRoundNow}
    canRunRound={isAdmin && mode === 'isolated_per_player'}
    debugMode={debugMode}
    onDebugModeChange={setDebugMode}
  />
)}
```

## Device Pattern-Logik

Der Generator verwendet realistische Stundenmuster:

- **Solar:** Bell-Curve 06:00-18:00, Peak 12:00, 0 außerhalb
- **Wind:** Variable 50-80%, pseudo-random basierend auf Stunde
- **Load:** Hoch tagsüber (70-100%), niedrig nachts (40-60%)
- **Battery:** Konstant 100%
- **Default:** Leicht variabel (80-100%)

## Seed-Verhalten

**Auto-Generierung:**
```python
seed = (session_id * 1000 + round_num) % (2^31 - 1)
```

**Beispiele:**
- Session 388, Round 1: Seed = 388000
- Session 388, Round 2: Seed = 388001
- Session 1, Round 1: Seed = 1000

**Reproduzierbarkeit:**
- Gleicher Seed + gleiche Config → identische Daten
- Unterschiedliche Runden → unterschiedliche Defaults
- Manueller Seed überschreibt Auto-Generierung

## Bekannte Grenzen

### Nicht implementiert
- Delta-basiertes Clearing (ID-Market)
- Position-Accumulation über mehrere Runden
- Constraint Payments (Grid-Constraints)

### Limitierungen
- Validation prüft nur aktuelle Runde (nicht Full Horizon bei Round > 1)
- Run Round nur in Solo-Modus verfügbar
- Debug Reports erfordern Backend-Logging aktiviert

### Workarounds
- Für Multi-Round-Testing: Seed manuell setzen und pro Runde neu generieren
- Für vollständige Validierung: Full Horizon aktivieren und manuell prüfen

## Testing

### Manuelle Tests

1. **Admin-Login:** Einloggen als `admin@fastbreak.one`
2. **Solo-Session erstellen:** Neues Solo-Game starten
3. **Debug Panel öffnen:** Panel sollte sichtbar sein, aufgeklappt
4. **Test Data generieren:**
   - Preset: Balanced
   - Seed: 12345
   - Full Horizon: Aus
   - "Generate Test Data" klicken
   - Verify: Forecasts gefüllt, Seed 12345 angezeigt
5. **Reproduzierbarkeit testen:**
   - Erneut klicken mit Seed 12345
   - Verify: Identische Werte
6. **Capacity validieren:**
   - "Validate Capacity" klicken
   - Verify: "All capacity constraints satisfied ✓"
7. **Submit & Run:**
   - "Submit Current Round" klicken
   - "Run Round Now" klicken (falls Solo)
   - Verify: Runde läuft, Results angezeigt
8. **Debug Report:**
   - "Debug Report" klicken
   - Verify: Debug Report öffnet in neuem Tab

### Automated Tests (TODO)

```python
# test_debug_panel.py
def test_generate_test_data_deterministic():
    # Same seed = same data
    data1 = generate_test_data(..., seed=12345)
    data2 = generate_test_data(..., seed=12345)
    assert data1 == data2

def test_generate_test_data_capacity_safe():
    # All values within capacity
    data = generate_test_data(...)
    validation = validate_capacity(...)
    assert validation['valid'] == True

def test_presets():
    # Different presets = different characteristics
    conservative = generate_test_data(..., preset='conservative')
    aggressive = generate_test_data(..., preset='aggressive')
    assert conservative_utilization < aggressive_utilization
```

## Deployment

### Prerequisites
- Docker & Docker Compose
- Backend: Flask, SQLAlchemy, Flask-RESTX
- Frontend: React, Material-UI

### Build & Deploy

```bash
# Backend
cd /home/ga/energy-game
docker-compose build backend
docker-compose up -d backend

# Frontend (development)
cd frontend
npm install
npm start

# Frontend (production)
npm run build
# Serve build/ via nginx/apache
```

### Verify Deployment

```bash
# Check backend logs
docker-compose logs backend | tail -50

# Test API endpoint
curl -X POST http://localhost:5000/api/player/generate-test-data/1 \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"preset": "balanced", "seed": 12345}'

# Expected: 200 OK with test data
```

## Changelog

### v2.0.0 (2026-02-15)
- ✅ Reproducible test data generation with seed
- ✅ Capacity-safe generator with presets
- ✅ Round-aware generation (tradeable hours only)
- ✅ Quick actions (Generate, Validate, Submit, Run, Report)
- ✅ Debug mode toggle persistent per session
- ✅ Admin-only access control
- ✅ Clear error/status messages

### Known Issues
- None currently

## Support

Bei Fragen oder Problemen:
- GitHub Issues: [Link]
- Entwickler: GitHub Copilot
- Dokumentation: Dieses README

---

**Status:** ✅ Production Ready  
**Last Updated:** 2026-02-15  
**Version:** 2.0.0
