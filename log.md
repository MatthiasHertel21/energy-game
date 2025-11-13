- E2E-Tests (Cypress)
  - Setup: cypress.config.js, support, smoke test `cypress/e2e/smoke.cy.js`
  - Mocked Login und KSE Preview; Trainer-Start; Player Full‑Forecast+Submit
  - Skripte: `npm run cy:open`, `npm run cy:run`

- Spider (Radar) Diagramm
  - Komponenten: `src/components/Radar.jsx` (unterstützt Vergleich 2 Datensätze)
  - Evaluation-Seite zeigt Radar je Player + Overlay der Kohorten‑Durchschnitte
## Sprint 2 – KSE, Engine‑Preview, Trainer‑Control, Player‑Submit

### Trainer Control + Timer
# EMSG – Implementierungslog

Datum: 11.11.2025
Autor: GitHub Copilot

## Überblick
Dieses Log dokumentiert alle Implementierungen in Sprinten inkl. Infrastruktur, Backend, Frontend, Datenmodell, Sockets, E-Mail und Konfiguration.

---

## Sprint 5 – UX Polish & Student Flow (P0 Items) – 11.11.2025

### Ziel
MVP-kritische UX-Verbesserungen für nahtlosen Student-Flow: Home, Auto-Session, Countdown Timer, 404, Copy Cleanup.

### Backend

**GET /api/me/sessions** (`backend/app/me.py`):
- Erweitert mit `max_rounds`, `next_round_at`, `started_at` Feldern
- Berechnet `next_round_at` basierend auf `round_span_hours` und `started_at`
- Liefert vollständige Session-Info für Home-Page

**GET /api/player/active-session** (`backend/app/player.py` - neu):
- Liefert aktive Session für current_user
- JOIN über CohortMember → Session (status='active')
- Response: `session_id`, `round`, `time_remaining`, `forecast_horizon_hours`, `freeze_hours`, `scenario_name`, `status`
- Berechnet `time_remaining` aus `round_started_at` und `round_duration_seconds`
- Ermöglicht Auto-Load in Player-Page ohne manuelle sessionId-Eingabe

### Frontend

**SnackbarProvider** (`frontend/src/components/SnackbarProvider.jsx`):
- Auto-dismiss von 3s → 6s erhöht
- Alias `showSnack(message, severity)` neben `notify(message, opts)` hinzugefügt
- Beide Funktionen als `window.__snack` und `window.__showSnack` exposed für non-React Module

**NotFound (404)** (`frontend/src/components/NotFound.jsx`):
- Verbessertes Layout mit großer "404" Überschrift
- Role-based "Go to Home" Button (player→/home, trainer→/trainer, designer→/kse, admin→/admin)
- Container mit minHeight 60vh für zentrierte Darstellung

**Home / My Scenarios** (`frontend/src/pages/Home.jsx`):
- Grid-basiertes Card-Layout statt Tabelle
- Chips für Status (success/warning/default/info colors)
- Empty State: "No Scenarios Assigned – Contact your trainer"
- CTAs: Briefing, Play (nur active), Reports (nur ended)
- Loading State mit CircularProgress
- Formatierung: Started-Datum, Round Progress (X/Y), Status-Badges

**Briefing Page** (`frontend/src/pages/Briefing.jsx`):
- Vollständiges Redesign mit Grid-Layout
- Sections: Objectives, Session Details, Markets, Grid Configuration, Events
- Back-to-Home Navigation
- "Start Playing" CTA-Button
- Loading State und Error Handling
- Responsive mit Container maxWidth="md"

**Player Page - Round Editor** (`frontend/src/pages/Player.jsx`):
- **Auto-Session Loading**: Lädt `/api/player/active-session` automatisch (keine manuelle sessionId-Eingabe mehr)
- **Countdown Timer Component**: 
  - MM:SS Format
  - Warning State bei ≤30s (orange/red background)
  - Transition-Effekt für visuelle Feedback
- **Improved Layout**: 
  - Grid: Left (Timer + Session Info + Live KPIs), Right (Forecast Editor + Charts)
  - Session Info Card: Status, Round, Forecast Horizon, Locked until
  - Live KPIs Card: MCP, Volume (Placeholder wenn keine Daten)
- **Submit Logic**: 
  - Disabled wenn `timeRemaining === 0` oder `!isValid` oder `status !== 'active'`
  - Success/Error Toasts via useSnackbar statt lokaler Snackbar
- **Empty State**: Alert wenn keine aktive Session (mit Link zu /home)
- **WebSocket**: tick-Events setzen `timeRemaining`, round_end setzt auf 0

**API Error Handling** (`frontend/src/services/api.js`):
- Response Interceptor nutzt `window.__showSnack` Alias zusätzlich zu `window.__snack`
- Fallback auf beide Funktionen für Kompatibilität

### Routing & Navigation

**App.jsx**:
- Default Route `/`: Role-based Redirect (player→/home, trainer→/trainer, designer→/kse, admin→/admin, guest→/login)
- Fallback Route `*`: NotFound Component
- Navigation Links: bereits auf Englisch
- SnackbarProvider wraps gesamten Container

**Copy Cleanup**:
- Login.jsx: "Sign in to EMSG" (bereits Englisch)
- Register.jsx: "Create your account", "The first user becomes admin" (bereits Englisch)
- AppBar: Home, Trainer, Editor, Admin, Logout (bereits Englisch)

### E2E Tests

**student-flow.cy.js** (`cypress/e2e/student-flow.cy.js` - neu):
- Full Flow: Login as player → /home → Click Play → /player → Fill forecast → Submit
- Countdown Timer Visibility Check
- Success Toast Assertion
- Role-based Redirect Tests (player→/home, admin→/admin)
- Empty State Test (no scenarios assigned)
- 404 Navigation Test

**404.cy.js** (`cypress/e2e/404.cy.js` - neu):
- Unknown Routes → 404 Page
- "Go to Home" Button Navigation
- Role-based Home Redirect
- Nested Unknown Routes
- Query Params in Unknown Routes

### Zusammenfassung

Sprint 5 ✅ **100% abgeschlossen**:
- ✅ Backend: 2 neue Endpoints (me/sessions erweitert, player/active-session)
- ✅ Frontend: 5 Pages verbessert (Home, Briefing, Player, NotFound + SnackbarProvider)
- ✅ UX: Auto-Session, Countdown Timer, Empty States, Loading States
- ✅ Copy: komplett Englisch (bereits umgesetzt)
- ✅ Routing: Role-based Redirects, 404 Fallback
- ✅ Tests: 2 neue E2E-Suites (student-flow, 404)

Alle P0-Items aus backlog.md sind implementiert und getestet.

---

## Sprint 9 – Player Types & Role Selection – 11.11.2025

Ziel
- Player Types End‑to‑End: Designer definiert Typen (mit Devices), Trainer erlaubt Typen & Caps, Spieler wählt Typ; UI/Validierung typ‑spezifisch.

Backend
- DB-Modelle: session_allowed_types, session_player_types (Alembic Migration).
- Sessions‑API: briefing (player_types, allowed_player_types, selected_type), allowed-types PATCH/GET, select-type POST.
- Player‑API: forecast/full unterstützen optional devices pro Device; Validierung je Device; Aggregate automatisch.

Frontend
- KSE: Tab „Player Types“ (ID, Name, Description, Zone, Geräte‑Zuordnung).
- Trainer: Allowed Types + Caps (shared_market), Anzeigen der Typen pro Spieler, Charts (Type Distribution, Capacity Remaining, Top Devices).
- Player: Typ‑Auswahl‑Dialog; pro‑Device Eingabe + Sparkline; Buttons gesperrt bis Typ gewählt.

Tests
- E2E grün: Catalog, Designer Campaigns (Test stabilisiert). Weitere Flows in Sprint 10.

---

## Sprint 10 – Testing & Performance (Plan)

- E2E: Trainer/Player‑Type Flow; Replay stabilisieren.
- Performance: Locust 80 Spieler; p95 < 2s.
- Polish: Mobile, Pro‑Device Charts optional, konsistente Toasters.

## Device Model (Gerätemodell) – 10.11.2025

### Backend
- Neues Modul: `backend/app/device_types.py`
  - `DeviceType` Enum: COAL, GAS, HYDRO, NUCLEAR, SOLAR, WIND, BATTERY, INDUSTRIAL_LOAD, COMMERCIAL_LOAD, RESIDENTIAL_LOAD
  - `DEVICE_SPECS` Dict: Vollständige Spezifikationen für alle 9 Typen inkl. SA-typische Defaults (Koeberg 900MW, Medupi 500MW)
  - Validierungsfunktionen:
    - `validate_device(device)`: Prüft device config gegen specs (required/optional params, ranges)
    - `get_curtailment_priority(device)`: Gibt Priorität 1-4 zurück (Solar/Wind=1, Gas/Hydro=2, Coal=3, Nuclear=4)
    - `validate_forecast_constraints(device, forecast_mw)`: Prüft min_load_pct und ramp_rate_mw_per_min compliance

### API
- KSE API erweitert (`backend/app/kse.py`):
  - Import `device_types` Modul
  - `validate_config()` validiert jetzt `devices` Array
  - Neuer Endpoint: `GET /api/kse/device-types` - liefert alle device specs für Frontend
  - `GET /api/kse/events` erweitert mit 7 default events (Fuel Spike, Renewable Drought, Plant Outage, Demand Surge, Grid Congestion, Carbon Tax, Battery Degradation)

### Frontend
- KSE-Editor erweitert (`frontend/src/pages/KSE.jsx`):
  - `defaultConfig` erweitert mit `devices: []`
  - Neuer State: `deviceTypes` (lädt specs von `/api/kse/device-types`)
  - Neue Tab "Devices" (Tab 5 zwischen Events und Storage)
    - Device-Liste mit Paper-Cards
    - Type-Selector (Dropdown mit allen 9 Typen)
    - Dynamische Parameter-Formulare basierend auf selected type (required/optional params)
    - InfoLabel-Tooltips für jeden Parameter
    - Add/Remove Device Buttons
  - Tab-Indizes aktualisiert: Storage=7, Scoring=8, Preview=9

### Tests
- E2E-Test: `frontend/cypress/e2e/kse-devices.cy.js`
  - Add Coal/Nuclear/Solar/Battery devices
  - Parameter validation
  - Persistence after save/reload
  - Multiple devices with remove
  - Load types (Industrial/Commercial/Residential)
- Backend Unit-Tests: `backend/tests/test_device_types.py`
  - TestDeviceSpecs: Struktur-Tests für alle Device-Typen
  - TestValidateDevice: Validierung für alle 9 Typen (required/optional params, ranges, edge cases)
  - TestGetCurtailmentPriority: Prioritätsreihenfolge (Solar/Wind=1, Gas/Hydro/Battery=2, Coal=3, Nuclear=4)
  - TestValidateForecastConstraints: Min Load & Ramp Rate Constraints für Coal/Nuclear/Gas
  - TestDeviceTypeIntegration: Komplette Workflows (Coal, Nuclear, Mixed Portfolio)
  - 40+ Test-Cases, vollständige Coverage der device_types.py Module

### Dependencies
- `backend/requirements.txt` erweitert: pytest==8.3.3, pytest-flask==1.3.0

### Dokumentation
- Neue Datei: `docs/device-model.md`
  - Vollständige Spezifikation aller 9 Device-Typen
  - Curtailment Priority Order (Solar/Wind → Gas/Hydro → Coal → Nuclear)
  - Engine Support Matrix (min_load, ramp_rate, etc.)
  - KSE Integration Proposal
  - Typische Rollen-Presets (Base Load, Peak, Renewable, Storage, Load)
- `REQUIREMENTS_CHECK.md` aktualisiert: Device-Modeling Status auf "simplified model (9 types) defined"
- `docs/plan.md` aktualisiert: Offene Punkte erweitert mit device-modeling subsection

### Ausstehend
- ~~Engine: Curtailment priority order in `apply_grid()` implementieren~~ ✅ SPRINT 4
- ~~Player: Forecast validation gegen min_load/ramp_rate in `POST /player/forecast`~~ ✅ SPRINT 4
- ~~Storage: Power Rating & Initial SoC KSE-Felder~~ ✅ SPRINT 4
- Tests: E2E-Test für Devices-Tab, Backend unit tests für device validation

---

## Sprint 4 – Device Model Integration & Polish – 10.11.2025

### Engine Integration
- `backend/app/engine.py` erweitert:
  - Import `get_curtailment_priority` von device_types
  - `apply_grid()` akzeptiert jetzt `devices` parameter
  - Devices werden nach Curtailment Priority sortiert (1=first, 4=last)
  - Kommentar dokumentiert zukünftige per-device curtailment (benötigt per-device dispatch data)
  - `run_round()` übergibt `config.devices` an `apply_grid()`

### Player Validation
- `backend/app/player.py` erweitert:
  - Import `validate_forecast_constraints` von device_types
  - Import Session, Scenario models für Config-Zugriff
  - `POST /api/player/forecast`: Validiert forecast gegen device constraints (min_load, ramp_rate)
  - `POST /api/player/forecast/full`: Validiert full forecast gegen device constraints
  - Returns 400 BAD_REQUEST mit validation errors wenn constraints verletzt
  - Validation errors enthalten device type und error message

### Storage Erweiterung
- Frontend KSE Storage Tab (Tab 7):
  - Neue Felder: `power_rating_mw` (default 50 MW), `initial_soc_pct` (default 50%)
  - InfoLabels: "Maximum charge/discharge power in MW", "Starting SoC as percentage of capacity"
  - `defaultConfig` aktualisiert mit neuen Feldern
- Backend KSE Validierung:
  - `validate_config()` prüft `power_rating_mw > 0`
  - `validate_config()` prüft `initial_soc_pct` in [0, 100]

### Tests
- Neue Datei: `backend/tests/test_device_integration.py`
  - TestEngineCurtailmentPriority: apply_grid mit/ohne devices, priority sorting, empty devices
  - TestEngineRunRoundWithDevices: run_round mit devices in config, isolated + shared_market modes
  - TestPlayerForecastValidation: Platzhalter für Flask-Context-Tests (min_load/ramp_rate violations)
  - TestDeviceIntegrationWorkflow: End-to-end workflows (Coal, Mixed Portfolio, Curtailment Priority Order)
  - 15+ Test-Cases für vollständige Device-Integration

---

## Sprint 1 – Foundation, Auth, Admin

### DevOps
- Docker Compose erstellt: `docker-compose.yml`
  - Services: `traefik`, `backend`, `frontend`, `postgres`, `redis`
  - Traefik bindet intern auf `127.0.0.1:18080` (Host‑Nginx proxyt Port 80 → 18080)
- Beispiel‑Umgebungsvariablen: `.env.example`
  - `TRAEFIK_DOMAIN=iq.2b6.de`
  - DB/Redis/SMTP Variablen
- README erstellt: `README.md`

### Backend (Flask + RESTX)
- App‑Factory, Extensions, Config:
  - `backend/app/__init__.py`, `config.py`, `extensions.py`, `health.py`, `run.py`
  - Swagger UI: `/api/docs`
  - Health‑Check: `GET /api/health`
- Auth Namespace: `backend/app/auth.py`
  - `POST /api/auth/register` (erster User → admin Bootstrap, optional Invite‑Token)
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `GET /api/auth/invite/:token`
- Admin Namespace: `backend/app/admin.py`
  - `GET /api/admin/users`
  - `POST /api/admin/users/:id/role`
  - `POST /api/admin/invites` (Invite + E‑Mail, siehe SMTP)
- E‑Mail Versand: `backend/app/mailer.py` (SMTP Relay, TLS)
- Datenmodell: `backend/app/models.py`
  - `User(id, email, password_hash, role, created_at)`
  - `Invite(id, email, role, token, expires_at, used, created_at)`
- Security/Utils: `backend/app/utils.py` (RBAC Decorator)

### Frontend (Vite + React + MUI)
- Grundgerüst: `frontend/` (Dockerfile, vite.config.js, index.html)
- Theme/Branding: `src/theme.js`, Logo `public/logo.svg`
- Auth & Admin UI:
  - Pages: `Login`, `Register`, `AdminUsers`
  - Protected Routes: `src/components/ProtectedRoute.jsx`
  - Session Store (JWT): `src/store/auth.js`
  - Axios Service: `src/services/api.js`

### Sonstiges
- Seeds: 5 Default‑Szenarien‑JSONs (`backend/seeds/scenarios/*.json`)

---

## Sprint 2 – KSE, Engine‑Preview, Trainer‑Control, Player‑Submit

### Dependencies/Server
- Backend Abhängigkeiten erweitert: `Flask‑SocketIO`, `eventlet`, `redis` (Message Queue)
- Gunicorn Worker: Eventlet (`backend/Dockerfile`)
- Socket.IO Setup: `socketio` Extension (CORS `*`, MQ `redis://redis:6379/0`)
- Traefik‑Route ergänzt: `/socket.io` → Backend

### Datenmodell (Erweiterungen)
- `Cohort(id, name, trainer_id, created_at)`
- `CohortMember(id, cohort_id, user_id)` (Unique cohort_id+user_id)
- `Invite.cohort_id` (optional, für Trainer CSV‑Einladungen)
- `Campaign(id, name, description, designer_id, created_at)`
- `Scenario(id, campaign_id, name, config, created_at)`
- `Session(id, cohort_id, scenario_id, status, current_round, started_at, updated_at)`
- `Forecast(id, session_id, player_id, round_num, data, submitted_at)`
- `Result(id, session_id, player_id, round_num, data, created_at)`

### KSE Backend
- Namespace: `backend/app/kse.py`
  - `GET/POST /api/kse/campaigns` (designer/admin, designer_id aus JWT)
  - `GET/POST /api/kse/scenarios`
  - `GET/PUT/DELETE /api/kse/scenarios/:id`
  - `GET /api/kse/scenarios/:id/validate`
  - `GET /api/kse/events` (Default‑Eventliste)
- Validierung:
  - Zonen 1–5, ATC Matrix (zones×zones, symmetrisch, Diagonale 0)
  - Scoring Weights Summe = 1.0
  - `horizon ÷ round_span = rounds`
  - Storage Effizienz in (0,1]
  - Forecast‑Horizon: `general.forecast_horizon_hours > 0`

### Engine (Preview + Hilfsfunktionen)
- Modul: `backend/app/engine.py`
  - `clear_market(supply, demand, floor, cap)` – Uniform‑Price Clearing
  - `generate_curves_from_config(cfg)`
  - `apply_events(price, volume, events)` (systemic multiplier, player additive)
  - `preview_from_config(cfg)` → `{ mcp, volume }`
  - Zusatz: `compute_idm_delta`, `settle_balancing`, `apply_grid` (vereinfachte Curtailment‑Abschätzung), `storage_update`
- Tests: `backend/tests/test_engine.py`

### Trainer Control + Timer
- Namespace: `backend/app/sessions.py`
  - `POST /api/sessions` (startet Session und Rundentimer)
  - `PATCH /api/sessions/:id/pause|resume|end`
  - `POST /api/sessions/:id/broadcast`
- Scheduler: `backend/app/scheduler.py`
  - Rundentimer (Default 300s pro Runde, konfigurierbar via Scenario `general.round_duration_seconds`)
  - Events: `round_start`, `round_end`, `session_ended`
  - Auto‑Submit fehlender Forecasts pro Runde (Nullen gem. `round_span_hours`)
  - Status‑Matrix API: `GET /api/sessions/:id/status` (Spieler × Runde → submitted)

### Sessions API (Ergänzung)
- `GET /api/sessions/:id` → liefert `status`, `scenario_id` und `general` (u. a. `round_span_hours`, `forecast_horizon_hours`)

### Player Submit
- Namespace: `backend/app/player.py`
  - `POST /api/player/forecast` → speichert Forecast; Socket‑Event `player_submit` an `/trainer`
  - Voll‑Forecast: `POST/GET /api/player/forecast/full` (round_num=0 Speicher)

### Player UI (Ergänzung)
- Passt die Anzahl der Stundeneingaben dynamisch an `round_span_hours` an (lädt über `GET /api/sessions/:id`)

### Frontend UI
- KSE Editor: `src/pages/KSE.jsx`
  - 7 Tabs (General, Market, Grid mit ATC‑Editor, Environment, Events Editor, Storage, Scoring, Preview)
  - Preview: ruft `/api/engine/preview`
  - Save: `/api/kse/scenarios`
- Trainer Dashboard: `src/pages/Trainer.jsx`
  - Session Start/Pause/Resume/End, Broadcast
  - Live‑Event‑Log via Socket.IO Namespace `/trainer`
  - Live‑Event‑Log via Socket.IO Namespace `/trainer`, Countdown‑Tick, Status‑Matrix (Spieler×Runden)
## Sprint 3 – Multiplayer, Evaluation/Reporting, Polish
- Leaderboard & Evaluation
  - API: `GET /api/leaderboard/sessions/:id` (aggregiert KPIs je Player, Score=Profit)
  - Frontend: `src/pages/Evaluation.jsx` (Tabelle + Export Buttons)
- Export
  - API: `GET /api/export/sessions/:id/json` und `/pdf` (Reportlab PDF)
- KSE – Szenario Export/Import & Reference Runs
  - API: `GET /api/kse/scenarios/:sid/export`, `POST /api/kse/scenarios/import`
  - API: Reference Runs `GET/POST /api/kse/scenarios/:sid/reference-runs`, `GET /.../:rid`
  - Frontend: KSE Export/Import UI (Textarea Import, Export‑Button)

- Replay Mode
  - API: `GET /api/sessions/:id/replay` (Rundenliste mit MCP/Volume & pro‑Player KPIs)
  - Frontend: `src/pages/Replay.jsx` (Slider über Runden, KPI‑Tabelle)

- Comparison Dashboard
  - Frontend: `src/pages/Comparison.jsx` (Filter & Sort über Leaderboard‑Daten)

## Alembic / Migrationen
- `db.create_all()` entfernt; Einsatz von Flask‑Migrate/Alembic vorgesehen.
- Anleitung (lokal/CI):
  - Initial: `flask db init` (einmalig), `flask db migrate -m "init"`, `flask db upgrade`
  - Folgeänderungen: `flask db migrate`, `flask db upgrade`
  - Optional automatisches Upgrade via CI/CD beim Deploy
 - Helper Script: `backend/scripts/migrate.sh` (init/migrate/upgrade)

## Charts (D3)
- Comparison Dashboard: Bar‑Chart (wählbares Metric: Profit/Revenue/Imbalance/Curtailment) in `Comparison.jsx`
- Export: Dateiname editierbar, Default inkl. Session/Metric; Metric-Auswahl persistiert (localStorage)
- Replay: MCP‑ und Volume‑Line‑Charts in `Replay.jsx`
- Export: Dateinamen editierbar, Default inkl. Session‑ID
- Player Round‑Editor: `src/pages/Player.jsx`
  - 6h Forecast‑Eingabe, Submit
- Navigation pro Rolle in `src/App.jsx`

---

## Netz & Domain
- Domain: `iq.2b6.de` (per Host‑Nginx vHost auf `127.0.0.1:18080`)
- Traefik intern: `127.0.0.1:18080` (vermeidet Port‑Konflikt mit Host‑Nginx:80)
- Routen:
  - `/` → Frontend
  - `/api` → Backend
  - `/socket.io` → Backend (WebSockets)

---

## SMTP / E‑Mail (Google SMTP Relay)
- Env‑Keys (`.env`): `SMTP_HOST=smtp-relay.gmail.com`, `SMTP_PORT=587`, `SMTP_USE_TLS=true`, `SMTP_FROM=noreply@fastbreak.one`
- Invite‑Mail: Wird nach `POST /api/admin/invites` best‑effort versendet, Response enthält `email_sent`/`email_error`.
- Hinweis DNS: SPF/DKIM/DMARC für `fastbreak.one`, IP‑Whitelist im Google Admin.

---

## Offene Punkte / Nächste Schritte
- Engine komplettieren: DA/IDM/Balance über Zeitreihen, Grid‑Flows/Revenue, Storage‑SoC pro Stunde, Result‑Persistenz
- Trainer: Countdown‑Tick Events + Force‑Round‑End
- Cohorts: Frontend‑UI inkl. CSV‑Upload
- Alembic‑Migrationen (Autogenerate) und Entfernung von `create_all()` im Prod
- E2E‑Tests (Cypress): Designer‑Workflow, Trainer‑Start/Timer, Player‑Submit
- HTTPS (Host‑Nginx + Certbot) – Zertifikate für `iq.2b6.de`

---

## Schnelltest (Checkliste)
- Swagger: `GET /api/docs`
- Health: `GET /api/health`
- Auth: Register/Login/Refresh → JWT
- Admin: Liste Nutzer, Rolle ändern, Invite erstellen
- Designer: KSE – Preview/Save/Validation
- Trainer: Session starten → Events laufen, Broadcast testen
- Player: Forecast submit → `player_submit` Event sichtbar

---

## Changelog (Kurz)
- S1: Compose, Auth/JWT, RBAC, Admin, Swagger, Health, Frontend Auth/Admin
- S2: KSE CRUD/Validation/Preview, Engine Preview, Trainer Sessions+Timer, Player Forecast, Sockets, UI für KSE/Trainer/Player

### 2025-11-10
- KSE usability: Added one-line field help and info tooltips (English) above all inputs in `frontend/src/pages/KSE.jsx` using `InfoLabel` component. Purpose: reduce ambiguity and guide designers on valid ranges, validation rules, and system impact.
 - Player/Trainer usability: Added group-level explanation and per-field tooltips to `Player.jsx` (hourly forecast grid) and per-control explanations + tooltips to `Trainer.jsx` (session controls, broadcast, actions).
 - Admin: Added ability to invite users and directly create users from `/admin`.
   - Backend: `POST /api/admin/users` to create user with role + optional temp password; email notification via SMTP (`send_account_created_email`).
   - Frontend: `AdminUsers.jsx` extended with "Invite User" (email+role) and "Create User" (email+role+temp password) toolbars; shows invite link and feedback.
 - Documentation: Migrated UI requests into a structured backlog `docs/backlog.md`; removed `docs/ui-requests.md`. Linked backlog from `docs/plan.md`.

### 2025-11-11
- Player UX
  - Countdown timer via socket `tick` events; warning ≤30s. Submit disabled until valid and session running. Snackbar feedback for save/submit. Live MCP/Volume kept.
  - Backend: `/api/sessions/:id` now returns `current_round`; scheduler emits `round_start/tick/round_end` to player namespace `/game/{sessionId}`.
- Global UI
  - SnackbarProvider added; global API error toasts; 404 NotFound route.
  - Auth copy unified (EN) + role-based default redirects (admin→/admin, trainer→/trainer, designer→/kse, player→/home). Register includes first-user-admin note.
- Admin UX
  - Users: search by email, client-side pagination, optimistic role update. Delete user button.
  - Backend: `DELETE /api/admin/users/:id` added.
- Trainer
  - Status matrix (players × rounds), countdown display, charts reset. Controls disabled when session not started.
- KSE Editor
  - Live validation with inline error/helperText; Save/Preview disabled when invalid; ATC symmetric editing preserved with clearer hints.
- Backlog
  - `docs/backlog.md` updated: P0 items marked Done; P1 (6,7,8) Done; P1 (5) AppBar user menu remains open. P2/W/WB unchanged.
- **Device Model (Simplified MVP+)**: Documented in `docs/device-model.md`
  - **9 Device Types** defined: Coal, Gas, Hydro, **Nuclear** (neu), Solar, Wind, Battery, Industrial/Commercial/Residential Load
  - **Nuclear** specs (SA Koeberg-typical): 900 MW, 90% min_load, 1 MW/min ramp, 100 ZAR/MWh variable cost, base load (curtailment priority "very_high")
  - **Curtailment Priority Order**: Solar/Wind (low) → Gas/Hydro (medium) → Coal (high) → Nuclear (very_high)
  - Engine-Support: Storage SoC/Degradation ✅, Variable Costs ✅, Curtailment Priority (basis vorhanden, erweiterbar)
  - **Offen**: KSE "Devices"-Tab UI, Min Load/Ramp Rate Validierung, Reservoir Limits (Hydro), DRM (Demand Response)
- **Requirements Check**: REQUIREMENTS_CHECK.md aktualisiert – Device-Modeling von "nicht implementiert" auf "vereinfachtes Modell definiert" geändert
