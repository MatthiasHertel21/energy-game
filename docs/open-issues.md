# Open Issues

Date: 2025-11-13

---

## Issue #1 – Player Forecast Submit Failed

**Status:** ✅ RESOLVED (2025-11-13)  
**Severity:** High (blocks core player functionality)  
**Reported:** 2025-11-13  

**Description:**  
Player cannot submit forecasts for the current round. When clicking "Submit Current Round" button in Player interface, the action fails with error message "Submit Failed".

**Steps to Reproduce:**
1. Login as player
2. Join or start a session
3. Navigate to Player page
4. Enter forecast values for current round
5. Click "Submit Current Round"
6. Error: "Submit Failed"

**Expected Behavior:**  
Forecast should be submitted successfully, player should receive confirmation message.

**Root Cause:**  
`Session` model in `backend/app/models.py` was missing the `scenario` relationship definition. The code in `player.py` tried to access `session.scenario` but the relationship was not defined, causing `AttributeError: 'Session' object has no attribute 'scenario'`.

**Solution:**  
Added `scenario` relationship to `Session` model:
```python
scenario = db.relationship("Scenario", backref="sessions", lazy="joined")
```

**Fixed in:**
- `backend/app/models.py` – Added scenario relationship to Session model
- Backend restarted to apply changes

**Verification:**
- Backend logs show no more AttributeError
- Forecast submission endpoint `/api/player/forecast` now accessible

---

## Issue #2 – Session Timeout / Token Expiration

**Status:** ✅ RESOLVED (2025-11-14)  
**Severity:** Medium (degrades user experience)  
**Reported:** 2025-11-14  

**Description:**  
Users lose their authentication session after some time of using the application. The application continues to function, but API requests start failing with authentication errors. These errors disappear after logging out and logging back in.

**Symptoms:**
- User remains logged in (UI shows user as authenticated)
- API requests fail with 401 Unauthorized errors
- Error messages appear in the UI
- No automatic logout or token refresh
- After manual logout/login, everything works again

**Steps to Reproduce:**
1. Login to application
2. Use application normally
3. Wait approximately 15-30 minutes
4. Continue using application
5. API requests start failing with authentication errors

**Expected Behavior:**  
Users should remain authenticated during active sessions. Token refresh should happen automatically in the background without user intervention or visible errors.

**Root Cause:**  
1. **Backend:** No JWT token expiration times configured → Flask-JWT-Extended used default (15 minutes for access tokens)
2. **Frontend:** No token refresh mechanism implemented despite storing refresh tokens
3. When access token expired, all API requests failed with 401 errors
4. Application had no interceptor logic to automatically refresh tokens

**Solution:**  

**Backend Changes** (`backend/app/config.py`):
- Added `JWT_ACCESS_TOKEN_EXPIRES`: 1 hour (configurable via env var)
- Added `JWT_REFRESH_TOKEN_EXPIRES`: 30 days (configurable via env var)
- Used `timedelta` objects as required by Flask-JWT-Extended

**Frontend Changes** (`frontend/src/services/api.js`):
- Implemented Axios response interceptor for automatic token refresh
- On 401 error: automatically call `/api/auth/refresh` endpoint with refresh token
- Retry original failed request with new access token
- Request queuing to prevent multiple simultaneous refresh attempts
- Automatic logout and redirect to login if refresh fails

**How It Works Now:**
1. User logs in → receives access token (1h validity) + refresh token (30 days validity)
2. After 1 hour, access token expires
3. Next API request → returns 401 Unauthorized
4. Frontend interceptor detects 401 → automatically uses refresh token to get new access token
5. Original request is retried with new token
6. User experiences no interruption ✅

**Fixed in:**
- `backend/app/config.py` – Added JWT token expiration configuration
- `frontend/src/services/api.js` – Implemented automatic token refresh interceptor
- Existing endpoint `/api/auth/refresh` already present in `backend/app/auth.py`

**Environment Variables (Optional):**
```bash
JWT_ACCESS_TOKEN_EXPIRES=3600      # Access token validity in seconds (default: 1 hour)
JWT_REFRESH_TOKEN_EXPIRES=2592000  # Refresh token validity in seconds (default: 30 days)
```

**Verification:**
- Users can work continuously without session interruptions
- Tokens refresh automatically in the background
- No 401 errors during normal usage
- Graceful logout when refresh token expires or is invalid

---

## Issue #3 – Cohort Members not shown after CSV import

**Status:** ✅ RESOLVED (2025-11-14)
**Severity:** Medium (confusing admin/trainer workflow)
**Reported:** 2025-11-14

**Description:**
Admin added player `player@fastbreak.one` to cohort "Test Cohort 1" via Members CSV import, but the Members table remained empty. It appeared as if the import failed.

**Root Cause:**
Frontend fetched members from `/api/cohorts/:id/members`, while the backend exposes `/api/cohorts/:id/players` (GET). The import endpoint was correct (`/players`), so members were added successfully but the UI displayed nothing due to 404/fallback.

**Fix:**
1) Frontend: `frontend/src/pages/Cohorts.jsx` – change fetch path to `GET /api/cohorts/:id/players`.
2) Backend: `backend/app/cohorts.py` – add compatibility alias `GET /api/cohorts/:id/members` mapping to the same data.

**Verification:**
- Import with CSV now shows members immediately after refresh; removing a member via DELETE works.
- Both routes (`/players` and `/members`) return identical data.

**Notes:**
- System limit checks (MAX_PLAYERS_PER_COHORT) remain enforced server‑side.
- Only users with role `player` are auto‑added; others receive no change.

---

## Issue #4 – KSE Save fails (400) when adding Load device to second player type

**Status:** ✅ RESOLVED (2025-11-14)
**Severity:** High (blocks scenario editing)
**Reported:** 2025-11-14

**URL:** https://iq.2b6.de/kse?id=1#kse-ptypes

**Description:**
Saving a scenario after adding a second player type with a “Load” device returned HTTP 400.

**Root Cause:**
Frontend created a generic device with `type: "load"`, but backend accepts specific load types only (`industrial_load`, `commercial_load`, `residential_load`) with required params `baseline_load_mw` and `peak_load_mw`. Validation rejected unknown device type.

**Fix:**
1) Frontend presets: replaced `load` with three presets `industrial_load`, `commercial_load`, `residential_load`, each using backend-required fields.
2) DeviceCard: treats any `*_load` type as load, shows `baseline_load_mw` + `peak_load_mw`, unified icon/color and summary.

**Files:**
- frontend/src/components/devices/devicePresets.js
- frontend/src/components/devices/DeviceCard.jsx

**Verification:**
- Add second player type → Add Device → choose one of the load presets → Save succeeds (200), scenario persists.


---

## Issue #3 – KSE Market&Preview: Supply/Demand Kurven nicht monoton

Status: OPEN  
Severity: High (falsche/irreführende Preview)

Beschreibung:
Im Tab „Market&Preview“ sind die Angebots‑ und Nachfragekurven nicht strikt monoton steigend (Supply) bzw. fallend (Demand). Jitter/Variabilität führt zu Zick‑Zack.

Erwartetes Verhalten:
- Supply ist monoton steigend über der Preisleiter, Demand monoton fallend. Darstellung als Stufen (Merit‑Order) mit sauberer Sortierung/Klammerung.

Reproduktion:
1) /KSE → Market&Preview
2) Preview laden, Kurven verlaufen zick‑zack

Scope/Fix:
- Engine Preview (`backend/app/engine.py`): Monotonie erzwingen (sort + cumulative steps; Jitter nur volumenseitig)  
- Frontend: Step‑Chart verwenden, y/x‑Domains clampen

Akzeptanzkriterien:
- Kurven sind strikt monoton (visuell + Datenprüfung)
- Step‑Darstellung, keine Linien außerhalb des Plots
- Unit‑Test für Monotonie green

---

## Issue #4 – KSE: Doppelte Tab‑Reiter; die untere Reihe entfernen

Status: OPEN  
Severity: Medium (UX‑Irritation)

Beschreibung:
Auf /KSE werden zwei Tab‑Leisten angezeigt. Die untere soll entfernt werden. Die obere bleibt und ist funktional.

Akzeptanzkriterien:
- Nur eine Tab‑Leiste sichtbar (die obere)
- Aktive Tabs korrekt hervorgehoben; Navigation bleibt stabil

---

## Issue #5 – KSE/General: Spacing, Feldbreite, Gruppierung; Player Zones → Grid

Status: OPEN  
Severity: Medium

Beschreibung/Änderungen:
- Helper‑Text ist zu nah am Feldnamen → mehr Abstand (oben/unten)
- Zahlenfelder sind zu breit → einheitlich XS/SM‑Breite
- Felder nach Sinneinheit gruppieren (Sektionen)
- Player‑Zones aus „General“ nach „Grid“ verschieben

Akzeptanzkriterien:
- General wirkt luftiger, einheitliche Input‑Breite
- Player‑Zones unter Grid sichtbar

---

## Issue #6 – KSE/Market&Preview: "Apply Profiles" Info‑Popup

Status: OPEN  
Severity: Low

Beschreibung:
Kein Warnhinweis nötig. Stattdessen Info‑Popup: „JSON must include diurnal_profile[24] and seasonal_factors[12]“ mit kurzer Erklärung, wozu die Profile dienen.

Umsetzung:
- Info‑Icon neben „Apply Profiles“. Klick öffnet Dialog mit Beschreibung, JSON‑Beispiel und kurzem Hinweis, dass Profile die zeitliche Form von Supply/Demand im Preview beeinflussen (falls vorhanden).

Akzeptanzkriterien:
- Info‑Dialog vorhanden, nicht blockierend, schließbar (ESC)
- Inhalt klar und knapp (inkl. Beispielstruktur)

---

## Issue #7 – KSE/Market&Preview: Linien laufen aus der Box

Status: OPEN  
Severity: Medium

Beschreibung:
Kurven schneiden die Chart‑Grenzen. Achsen‑Domains/Clipping fehlen.

Fix:
- clipPath setzen, Domains aus Daten ableiten und clampen; Padding prüfen

Akzeptanzkriterien:
- Keine Überläufe; responsiv korrekt

---

## Issue #8 – KSE/Market&Preview: Teilnehmer‑Aufteilung (Supply/Demand‑Typen) wiederherstellen, UI verbessern

Status: OPEN  
Severity: Medium

Beschreibung:
Die Felder zur Typen‑Verteilung fehlen. Sie sollen zurück, aber in verbesserter UI.

Umsetzung:
- Kompakte Tabelle: Zeilen = Typen (Supply/Demand Gruppen), Spalte = Anteil (%), Steuerung via Slider + Zahlfeld (gekoppelt). Summe validieren.

Akzeptanzkriterien:
- Felder vorhanden, validiert; Preview reagiert

---

## Issue #9 – KSE: Market Basics nach General verschieben

Status: OPEN  
Severity: Medium

Beschreibung:
Die Gruppe „Market Basics“ (base_price, base_volume_mwh, price_floor, price_cap) gehört in den General‑Tab.

Akzeptanzkriterien:
- Felder im General‑Tab; keine Duplikate im Market&Preview‑Tab

---

## Issue #10 – KSE/Market&Preview: Zahlenfelder schmaler; Erklärtext über Feld entfernen

Status: OPEN  
Severity: Low

Beschreibung:
Zahlen‑Inputs XS/SM‑Breite. Erklärtext nicht über dem Feld; nur HelperText darunter.

Akzeptanzkriterien:
- Einheitliche XS/SM‑Inputs; aufgeräumtes Layout

---

## Issue #11 – KSE/Market&Preview: Preview‑Buttons ausrichten & Icons

Status: OPEN  
Severity: Low

Beschreibung:
„Preview MCP“ und „Hourly Preview“ rechtsbündig ausrichten; als IconButtons (Reload/Calculate) mit Tooltips.

Akzeptanzkriterien:
- Konsistente Ausrichtung und Icons; gleiche Höhe

---

## Issue #12 – KSE/Market&Preview: Chart‑Zoom als Modal (gleiches Screen)

Status: OPEN  
Severity: Low

Beschreibung:
Klick auf Diagramm öffnet Dialog (Modal) mit großem Chart; unterhalb tabellarische Daten (z. B. MCP/Volume/Steps).

Akzeptanzkriterien:
- Modal öffnet/schließt; A11y (ESC, Fokus‑Trap); Tabelle unterhalb

---

## Issue #13 – KSE/Grid: Matrix inline editieren; kein Modal, kein CSV Import/Export

Status: OPEN  
Severity: Medium

Beschreibung:
ATC‑Matrix direkt im Grid‑Tab bearbeitbar machen. CSV Import/Export entfällt.

Akzeptanzkriterien:
- Inline‑Tabelle mit Symmetry‑Lock, Validierung und Sticky‑Headers

---

## Issue #14 – KSE/Player Types: Zweispaltiges Layout

Status: OPEN  
Severity: Medium

Beschreibung:
Links Liste der Player Types, rechts die Devices des ausgewählten Types (DeviceCards). Max. ein Device expandiert.

Akzeptanzkriterien:
- Auswahl links aktualisiert rechts zuverlässig; keine Layoutsprünge

---

## Issue #15 – KSE/Usage: Weiße Seite (Render‑Fehler)

Status: OPEN  
Severity: High

Beschreibung:
Beim Öffnen des Tabs „Usage“ erscheint eine weiße Seite. Kein sichtbarer Fehlertext.

ToDo:
- Browser‑Console/Network untersuchen; Guarded Rendering + ErrorBoundary hinzufügen; leeren Zustand mit Hinweis anzeigen.

Akzeptanzkriterien:
- Tab rendert ohne Fehler; bei fehlenden Daten wird ein leerer, erklärender Zustand angezeigt

---

## Issue #16 – KSE/Toolbar: Rechtsbündig; Buttons bereinigen; Tab „Description“

Status: OPEN  
Severity: Medium

Beschreibung:
- Toolbar rechtsbündig auf Höhe „KSE Editor“, „Save“ ganz rechts  
- „Edit Matrix“ und „Edit Description“ entfernen  
- Neuer Tab „Description“ mit Feldern „Scenario Name“ und „Description“ (Markdown‑Feld mit Preview‑Toggle)  
- Button „Validate + Preview“ entfernen (derzeit ohne Funktion)

Akzeptanzkriterien:
- Toolbar gemäß Vorgabe; Tab „Description“ vorhanden; „Validate + Preview“ entfernt

---

## Issue #17 – DesignerCampaigns: Create liefert 500 Internal Server Error

Status: ✅ FIXED (2025-11-14)  
Severity: High (blockiert Kampagnen‑Erstellung)

Beschreibung:
Beim Klick auf „Create“ in `/designer/campaigns` schlägt der Request `POST /api/kse/campaigns` mit 500 fehl.

Root Cause:
Schema‑Drift in Tabelle `campaigns` (Spalten `seed`, `published`, `cover_image_url`) fehlten in einzelnen Umgebungen (Migration nicht ausgeführt). SQLAlchemy Insert inkludierte Spalten → DB‑Fehler.

Lösung:
- Backend Fallback in `backend/app/__init__.py`: beim App‑Start werden fehlende Spalten in `campaigns` per `ALTER TABLE` (seed VARCHAR(128), published BOOLEAN DEFAULT FALSE NOT NULL, cover_image_url VARCHAR(512)) ergänzt, wenn nicht vorhanden.

Verification:
- `POST /api/kse/campaigns` liefert 201 Created und erstellt Kampagne
- UI zeigt neue Kampagne in der Liste

Nacharbeiten (Empfehlung):
- Alembic‑Migration nachziehen und Fallback später entfernen
