# EMSG – Solo-Implementierungsplan (GitHub Copilot)
Datum: 09.11.2025
Ziel: MVP-Launch bis 19.12.2025
Modus: Einzelentwickler, Sprint-basiert mit Feedback-Gates nach jedem Sprint

Prämissen
- Ich implementiere allein (Backend, Frontend, DevOps, Tests, Doku).
- Arbeit in 3 Sprints à 2 Wochen. Nach jedem Sprint:
  1) Liefere ich eine testbare Featureliste (Hands-on-Testfälle)
  2) Du testest und gibst Feedback
  3) Ich bearbeite Anpassungen
  4) Nächster Sprint startet erst nach deiner Freigabe
- Self-Hosted: netcup VPS (Debian 12) + Docker Compose
- Stack: React + MUI + D3, Flask + Flask-RESTX + Flask-SocketIO, PostgreSQL, Redis

Timeline (fix)
- Sprint 1: 11.11.–24.11.2025
- Sprint 2: 25.11.–08.12.2025
- Sprint 3: 09.12.–19.12.2025

Sprint 1 – Foundation & Auth & Admin (Ziel: lauffähige Plattformbasis)
Deliverables
- Produktionsfähige Infrastruktur via Docker Compose
- Auth-Flow (Register, Login, JWT, Invites, Rollen)
- Admin-Panel (minimal): User-Liste, Rollen ändern, Invites erstellen, Benutzer direkt anlegen (Temp-Passwort)
- DB-Schema, Migrationen, Seed-Daten (5 Default-Szenarien-JSONs)
- API-Doku via Swagger UI

Aufgaben (sequenziell)
1) DevOps: Docker Compose (frontend, backend, postgres, redis, traefik, netdata, sentry)
2) DB: PostgreSQL-Schema (users, invites, cohorts, campaigns, scenarios, sessions, forecasts, results)
3) Backend: Flask-App Grundgerüst, Auth (bcrypt, JWT), Invite-Flow, RBAC, Error-Handling
4) Frontend: Vite + React + MUI, Routing, Auth-Seiten, Protected Routes, Admin-User-Tabelle
5) Doku: README Grundsetup, Swagger Basis
6) Smoke-Tests, Health-Check, Logging

Testbare Featureliste (am Sprintende für dich)
- Login/Register/Logout inkl. Fehlerszenarien
- Invite-Link-Registrierung mit vorab gesetzter Rolle
- Admin: User sehen, Rolle ändern, Invite erstellen, Benutzer direkt anlegen

Backlog
- Vollständige UI/UX Backlog-Items siehe `docs/backlog.md` (aus `docs/ui-requests.md` migriert)
- Swagger UI erreichbar, Health-Check 200

Akzeptanzkriterien
- Endpunkt-Sicherheit (JWT, 401/403 korrekt)
- Persistenz funktioniert (User/Invites/Role Change)
- Frontend-Auth-Flows stabil (Refresh, Token-Expiry)

Sprint 2 – KSE + Simulation Engine + Trainer-Control
Deliverables
- Voller KSE (7 Tabs) mit Validierung und JSON Export/Import
- KSE field help (one-line) and tooltips (English) for all inputs
- Simulation Engine (DA, IDM, Balancing, Grid/Congestion, Storage, Events)
 - Player & Trainer pages adopt global Field Help + Tooltips pattern (group-level for repeated inputs)
- Trainer: Sessions starten/pausieren/enden, Broadcasts, Live-Monitoring (Sockets)
- Live-Preview der Kurven im KSE (D3)

Aufgaben (sequenziell)
1) Backend KSE: Scenario CRUD, Validierungsregeln, Environment-Generator, Event-Library
2) Engine: Clearing (Uniform Price, Pro-Rata, Clamping), DA vs IDM, Balancing (dual pricing), Grid (ATC, 2% Loss, Curtailment), Storage (SoC, DoD, Effizienz), Events (systemic→player)
3) Trainer-Control: Sessions-API, Timer (300s), Auto-Submit bei Timeout, Socket-Events
4) Frontend KSE: Formular-Tabs, D3-Kurven, ATC-Editor, Event-Editor, JSON Import/Export
5) Frontend Player (Basis): Dashboard, Briefing, Round-Editor (Forecast 48h/6h), Submit
6) Tests: pytest (Engine), E2E (Designer-Workflow, Trainer-Start)

Testbare Featureliste (am Sprintende für dich)
- Designer: Campaign+Scenario erstellen, alle 7 Tabs ausfüllen, Validate+Save, Export/Import
- KSE-Live-Preview: Kurven-Update bei Parametern
- Trainer: Session starten/pausieren/beenden, Broadcast senden
- Player: Forecast erfassen und submitten
- Engine: Sichtbare MCP/Volume-Ergebnisse im Test-Szenario (isolated)

Akzeptanzkriterien
- KSE-Validierung blockt fehlerhafte Konfigurationen verlässlich
- Engine reproduzierbar (RNG-Seed), Precision (Preis 1 Dez., Volumen 3 Dez.)
- Socket-Events zuverlässig (Reconnect-Fallback)

Delta-Integration (10.11.2025) – UI-Scope Ergänzungen für Sprint 2
- Student App (Skeleton):
  - Home / My Scenarios (Liste zugewiesener Sessions; Spalten: Scenario, Cohort, Status, Next Round, Start)
  - Scenario Briefing (Meta: Ziele, Rollenbeschreibung, Märkte, Zonen, Timer, Event-Hinweise)
  - Round Screen: kompletter Forecast-Horizont editierbar (keine Begrenzung auf Rundenfenster), DA/IDM-Freeze gemäß Marktlogik; Live-Hinweise/KPIs (Basis)
- Trainer App:
  - Cohort Overview + Detail (Status-Tabelle: Spieler × Runde × Status, Filter & Sortierung verpflichtend)
  - Countdown-Sync UI (Anbindung an Timer)
- Editor App:
  - Event-Editor Felder erweitern (Trigger, Dauer, Target)
  - Campaign-Übersicht (CRUD, Scenario-Zuordnung)
  - Field help + tooltips on all KSE inputs (English)
- Vergleichs-Dashboard: Basisseite (KPI-Tabelle, Platzhalter-Chart)

Technische Ergänzungen (Sprint 2)
- Sessions API: `GET /api/sessions/:id` liefert `general` (round_span_hours, forecast_horizon_hours)
- Player-UI: Eingabe über gesamten Forecast-Horizont (Freeze-Handling DA/IDM); Validierung `forecast_horizon_hours ≥ horizon_hours`

Sprint 3 – Multiplayer, Evaluation/Reporting, Polish & Release
Deliverables
- Multiplayer shared_market (Aggregationen, Scaling, Zonen)
- Evaluation: KPIs, Leaderboards, Benchmark vs. Reference Run
- Replay-Mode
- PDF-Export (WeasyPrint)
- Tests (Unit/Integration/E2E) ≥ 80% Coverage, Performance p95 < 2s (80 Spieler simuliert)
- Produktionsdeployment auf netcup (HTTPS)

Aufgaben (sequenziell)
1) Multiplayer Engine: Aggregation, Zonenfluss, WebSocket-Sync
2) Results & KPIs: Persistenzstruktur, Scoring (Gewichte, Z-Score), Leaderboard-API
3) Reporting: JSON/PDF-Export (MVP: Reportlab), WeasyPrint-Template (optional)
4) Replay: API + Frontend-Control (Time-Slider)
5) Hardening: Security (XSS/CSRF/SQLi), Logs/Rotation, Backups (Cron)
6) Performance-/Load-Tests (Locust), Bugfixes
7) Doku final: User-Manual, Videoskripte, README, Swagger vollständig
8) E2E-Tests (Cypress) für zentrale Flows (Login, KSE Preview/Save, Trainer Start)

Testbare Featureliste (am Sprintende für dich)
- Multiplayer-Session mit 3+ Testspielern (oder simulierten Clients)
- Leaderboard (role-specific) und KPI-Korrektheit
- Replay-Mode mit Zeitsteuerung
- PDF-Export (vollständiger Report)
- Performance-Ergebnisse (p95 < 2s), WebSocket-Last 500

Akzeptanzkriterien
- Korrekte Clearing-Ergebnisse im Multiplayer (gegen Referenzfälle)
- Reibungsloser Replay- und Export-Flow
- Stabilität unter Last (keine Fehler in Logs p95 Test)
- E2E-Suite (Cypress) grün für Kernpfade (Login, KSE-Preview/Save, Session-Start)

Delta-Integration (10.11.2025) – UI-Scope Ergänzungen für Sprint 3
- Student App: Evaluation Report (KPI-Tabelle + Spider‑Diagramm je Player‑Type + Charts), Replay Mode, Personal Dashboard
- Trainer App: Comparison Dashboard (Filter/Sortierung), Reference Runs Verwaltung
- Editor App: Market Environment Generator (agent-basiert, D3), Profile Editor (CSV Import/Export), Reference Runs Upload/Download pro Scenario
- Persistenz & Export: Scenario JSON Export/Import (UI), Reports JSON/PDF

Validierungsregeln (Ergänzt)
- `forecast_horizon_hours ≥ horizon_hours` (Szenario‑weit)

Feedback- und Freigabeprozess
- Am Ende jedes Sprints erstelle ich: Release Notes, Test-Guide, Featureliste
- Du testest innerhalb von 2–3 Tagen und kommentierst (Ticket/Kommentar)
- Ich fixe/adjustiere innerhalb des aktuellen/folgenden Sprints
- Nächster Sprint startet erst nach deinem Go

Offene Punkte (bitte beantworten)
1) Domain-Wunsch (z. B. emsg.training / subdomain)
2) Branding-Details (Logo, Farben) oder Eskom-Default übernehmen?
3) PDF-Report-Branding (Deckblatt, Kontaktangaben)
4) E-Mail-SMTP für Invite/Reset (Provider/Absender)
5) Mindest-Featureliste für UAT (was ist must-have für deine Tests?)

Risiken & Mitigation
- Umfang vs. Solo: strikter MVP, Feature-Freeze ab 01.12.
- Performance: frühe Engine-Tests, Redis-Caching, Profiling
- Echtzeit: Auto-Reconnect, Long-Polling-Fallback, begrenzte Message-Größe
- Security: bcrypt, JWT-Expiry, HTTPS-only, Header-Hardening

Kommunikation
- Daily Kurz-Update (async, Text): Fortschritt/Blocker
- Wöchentliches Review (30–45 min): Demo + Roadblocks
- Kanäle: GitHub Issues/Projects, optional Chat nach Wunsch

---

## Entwicklungsstand (10.11.2025)

### Sprint 1: ✅ 100% abgeschlossen
- DevOps: Docker Compose (traefik, backend, frontend, postgres, redis, netdata, sentry)
- DB-Schema: users, invites, cohorts, campaigns, scenarios, sessions, forecasts, results
- Auth: Register/Login/Refresh (JWT), Invite-Flow, Auto-Bootstrap (erster User → admin)
- Admin: User-Liste, Rollen ändern, Invite erstellen + E-Mail
- Swagger UI: `/api/docs`
- Health-Check: `/api/health`
- Frontend: Login, Register, Protected Routes, Admin-User-Tabelle
- Monitoring: Netdata (Port 19999), Sentry-Integration vorbereitet (SENTRY_DSN)
- CI/CD: GitHub Actions Workflow (.github/workflows/ci.yml) für Backend pytest + Frontend Build

### Sprint 2: ✅ 100% abgeschlossen
- KSE (Knowledge Scenario Editor)
  - 7 Tabs: General, Market, Grid (ATC-Matrix), Environment, Events, Storage, Scoring
  - Validierung: Zonen 1-5, ATC symmetrisch, Weights=1.0, forecast_horizon_hours ≥ horizon_hours
  - Field help + tooltips (English) für alle KSE-Felder
  - JSON Export/Import (UI + API)
  - Environment Generator (agent-basiert, Gruppen-Shares, Zonensplit)
  - Event-Editor erweitert (Trigger, duration_rounds, target/target_id)
  - Live-Preview (D3): MCP/Volume über Konfiguration
  - Hourly Preview: MCP/Volume je Stunde (POST /api/engine/preview/hourly)
  - Reference Runs: Upload/Download pro Scenario (API)
  
- Engine (Simulation)
  - Uniform-Price Clearing mit Clamping/Precision
  - DA/IDM: DA-Snapshot (Runde 1), ab Runde 2 IDM-Delta (Forecast − DA)
  - Grid/Congestion: ATC-basierte Kapazität, Verluste, Congestion-Signal, congestion_revenue_zar in KPIs
  - Storage: SoC stündlich mit DoD-Limit (80%), Degradation (0.1%/Cycle), Felder storage_soc, storage_cap_eff, storage_cycles
  - Balancing: Dual Pricing
  - Events: systemic multiplier + player additive
  - Seeded RNG (reproduzierbar)
  - Unit-Test: test_engine.py

- Trainer Control
  - Sessions: POST /api/sessions, PATCH /pause, /resume, /end
  - Rundentimer: 300s default, Auto-Submit fehlender Forecasts
  - Statusmatrix: GET /api/sessions/:id/status (Spieler × Runde → submitted)
  - Broadcast: POST /api/sessions/:id/broadcast
  - Force Round End: POST /api/sessions/:id/force-round-end
  - Socket.IO Events (/trainer): session_started|paused|resumed|ended, round_start, round_end, tick, message, player_submit
  - Live-Charts: MCP-Linie (grün), Volume-Linie (blau), Top-Profit-Balken (Top-8), Imbalance-Top-8 (orange), Curtailment-Top-8 (rot)
  - Export (SVG/PNG) für alle Charts + Reset Charts Button
  
- Player
  - Full-Forecast: POST/GET /api/player/forecast/full (gesamter forecast_horizon_hours editierbar, keine Rundenbegrenzung)
  - DA/IDM-Freeze: Eingabefelder bis freeze_hours gesperrt
  - Round-Submit: POST /api/player/forecast
  - Live-MCP/Vol Anzeige aus Socket /game/{sessionId}
  - Live-Charts: MCP/Volume (D3)
  
- Student-Flow
  - Home: My Scenarios (Scenario, Cohort, Status, Next Round, Start)
  - Briefing: Szenario-Metadaten (Ziele, Rollenbeschreibung, Märkte, Zonen, Timer, Events)
  - Player-UI: Voller Forecast-Horizont editierbar, Freeze-Lock, Save Full Forecast + Submit Current Round
  
- Cohorts
  - CRUD: GET/POST /api/cohorts
  - CSV-Import: POST /api/cohorts/:id/players (E-Mail je Zeile, bestehende User zuordnen, fehlende einladen)
  - Frontend: Cohorts-Seite mit Create + CSV-Import (data-testid="cohorts-import-block")

- Routing/Deployment
  - Traefik routed: /api → Backend, /socket.io → Backend (WebSockets), / → Frontend
  - Traefik lauscht auf 127.0.0.1:18080 (Host-Nginx proxyt)
  - Domain: iq.2b6.de (Host-Nginx vHost erforderlich)
  - SMTP: noreply@fastbreak.one via Google SMTP Relay (IP-Whitelist, SPF/DKIM/DMARC)

### Sprint 3: ✅ ~95% abgeschlossen
- Multiplayer
  - shared_market Mode: Session-Start mit mode (isolated_per_player | shared_market)
  - Engine: Pro-rata Dispatch im shared_market, KPIs angepasst
  - Socket: market_cleared auf /game/{sessionId} (per Session Namespace)
  - Player-Zone: general.player_zone im KSE (alle Spieler in eine Zone), Validierung 1..zones
  - Zonen-Flows: Scheduler aggregiert Dispatch in player_zone, compute_zone_flows berechnet curtailed/signal pro Zone
  
- Leaderboard & Evaluation
  - API: GET /api/leaderboard/sessions/:id?role=player|... (role-aware)
  - Frontend: Evaluation-Seite (Role-Filter, Tabelle, Δ-KPIs vs Reference: Profit, Imbalance, Curtailment)
  - Radar (Spider): Spieler vs. Kohorten-Durchschnitt (Profit↑, Imbalance/Curtailment↓ normalisiert), Export (SVG)
  - Reference-Run-Select: Overlay im Radar, Δ in Tabelle
  
- Replay-Mode
  - API: GET /api/sessions/:id/replay (Rundenliste + MCP/Volume + pro-Player KPIs)
  - Frontend: Replay-Seite mit Slider je Runde, KPI-Tabelle, MCP-Line-Chart (D3), Volume-Line-Chart (D3)
  - Export: SVG/PNG für Charts, custom Filename
  
- Comparison Dashboard
  - API: GET /api/leaderboard/sessions/:id (aggregierte KPIs je Player)
  - Frontend: Comparison-Seite mit Filter/Sort, Metric-Selector (Profit/Revenue/Imbalance/Curtailment)
  - Bar-Chart (D3, wählbares Metric), Export (SVG/PNG), custom Filename, Metric-Persistenz (localStorage)
  
- Export/Reporting
  - JSON: GET /api/export/sessions/:id/json
  - PDF: GET /api/export/sessions/:id/pdf (Reportlab, Leaderboard-Zusammenfassung + Runden-Details)
  
- Alembic/Migrationen
  - create_all entfernt, Flask-Migrate/Alembic aktiv
  - Script: backend/scripts/migrate.sh (init/migrate/upgrade)
  - README: Migrations-Anleitung (lokal + Docker/CI)
  - Initiale Migration ausgeführt (DB auf Stand)
  
- Security/Hardening
  - CSP (Talisman): "alles erlaubt" wie gewünscht (self, data/blob für Export)
  - Rate Limiting: Flask-Limiter mit Redis-Storage (REDIS_URL), 200 req/min Default
  - CORS: konfigurierbar per CORS_ALLOW_ORIGINS (Default *)
  
- Ops
  - Backup-Script: backend/scripts/backup.sh (pg_dump → /backup/emsg_*.dump)
  - README: Cron-Beispiel dokumentiert
  
- Tests
  - E2E (Cypress): Smoke, Trainer (shared_market), Player (Full-Forecast + Submit), Comparison, KSE-Import, Cohorts-Import, KSE-Devices
  - Replay-E2E: aktuell instabil/geskippt (UI gehärtet, Test wartet nicht zuverlässig)
  - Unit: test_engine.py, test_device_types.py (vollständig)
  - Performance: Locustfile (Health + Preview) vorbereitet

### Offene Punkte (Feinschliff/Optional)
- Engine
  - Zonen-Flows/Revenue präziser (pro Zone/Player entlang Kanten, statt Ein-Zonen-Annahme)
  - Storage SoC exakter (per-hour Clearing statt Round-Näherung)
  
- Device Modeling
  - ✅ **Vereinfachtes Modell (9 Typen) vollständig implementiert** in `docs/device-model.md` (Coal, Gas, Hydro, Nuclear, Solar, Wind, Battery, 3× Load)
  - ✅ Backend: `device_types.py` mit vollständiger Validierung (validate_device, get_curtailment_priority, validate_forecast_constraints)
  - ✅ API: GET /api/kse/device-types, Validierung in KSE-Config
  - ✅ KSE "Devices"-Tab UI implementiert (Tab 5: Type-Selector, Parameter-Forms, Add/Remove)
  - ✅ Tests: E2E-Test `kse-devices.cy.js`, Backend Unit-Tests `test_device_types.py` + `test_device_integration.py`
  - ✅ **Engine Integration (Sprint 4)**: Curtailment Priority Order in `apply_grid()` (sortiert devices 1-4)
  - ✅ **Player Integration (Sprint 4)**: Min Load/Ramp Rate Validation in `POST /player/forecast` (validate_forecast_constraints)
  - ✅ **Storage Erweiterung (Sprint 4)**: Power Rating & Initial SoC als KSE-Felder (Tab 7)
  
- Tests/Qualität
  - ⚠️ Curtailment Priority Order im Engine (apply_grid erweitern: Solar/Wind → Gas/Hydro → Coal → Nuclear)
  
- Tests/Qualität
  - Replay-E2E stabilisieren (Loading-State + expliziter Wait) und reaktivieren
  - E2E-Coverage erweitern (weitere Flows)
  - Backend Unit/Integration Tests für neue Engine-Teile (IDM Delta, SoC/Degradation, Congestion-KPIs)
  
- Performance/Load
  - Locust-Szenarien für Sessions/WebSockets (80 Spieler), p95 < 2s validieren, ggf. Caching/Optimierung
  
- Ops/Security
  - Prod-Feintuning: Limits per Route/Role, CSP/CORS enger wenn gewünscht
  - Backup-Cron/Rotation produktiv, Restore-Probe dokumentieren
  - Log-Rotation finalisieren (Docker-Logging/Logrotate)
  
- Reporting
  - PDF-Layout (Branding/Deckblatt/Diagramme) erweitern
  - WeasyPrint (optional) als Alternative zu Reportlab

### Zusammenfassung
- Sprint 1 & 2: ✅ vollständig umgesetzt
- Sprint 3: ✅ ca. 95% (Kernfeatures fertig, Feinschliff optional)
- **Sprint 4: ✅ 100% abgeschlossen (Device Model vollständig integriert)**
- Device-Modeling: ✅ Spezifikation, Backend, API, Frontend, Engine, Player, Tests komplett
- Stack läuft: Docker (postgres, redis, backend, frontend, traefik, netdata)
- DB migriert (Alembic)
- Frontend gebaut (Vite)
- E2E-Suite weitgehend grün (Replay-Test geskippt/instabil)
- Produktiv einsetzbar als MVP

---

## Sprint 9 – Player Types & Role Selection (Completed 11.11.2025)

Ziel
- Spieler‑Typen je Szenario definieren, im shared_market Typen/Caps pro Session erlauben und vor Spielstart vom Spieler wählen lassen. UI und Engine/Validierung werden typ‑spezifisch eingeschränkt.

Deliverables
- KSE: `config.player_types[]` (id, name, description?, devices[], zone?) mit Validierung.
- Trainer Start (shared_market): `allowed_player_types[]` mit optional `max_players` je Typ; Persistenz pro Session.
- Player Join: Auswahl eines erlaubten Typs vor Start; Sperre bei Kapazitätsüberschreitung; Anzeige der zugehörigen Geräte.
- Briefing/Status APIs: erlaubte Typen + Restkapazitäten.

Backend
- Models/Migrationen:
  - Session: Feld `allowed_player_types` (JSON) oder eigene Tabelle `session_allowed_types(session_id, type_id, max_players, used_players)`.
  - Player‑Type Auswahl: Tabelle `session_player_types(session_id, user_id, type_id, selected_at)`.
- APIs:
  - GET `/api/sessions/:id/briefing` → ergänzt `player_types` + Caps/remaining.
  - PATCH `/api/sessions/:id/allowed-types` (trainer) → setzen/ändern der Allowlist/Caps.
  - POST `/api/player/sessions/:id/type` (player) → Typ wählen (validiert Caps/Allowlist).
- Validation:
  - `kse.validate_config` prüft `player_types` (Ids, Geräte existieren, non-empty name).

Frontend
- KSE: Tab/Section „Player Types“ (Liste, Add/Edit/Delete, Gerätezuordnung, Inline‑Validation).
- Trainer: Startformular erweitert um Allowlist + Caps je Typ (nur bei shared_market sichtbar).
- Player: Vor Start Typauswahl (Dialog) mit Restkapazitätsanzeige; Fehler/Blockierung bei vollen/unerlaubten Typen.

Akzeptanzkriterien (erfüllt)
- Designer kann Typen definieren und mit Geräten verknüpfen; Konfiguration speichert und validiert.
- Trainer kann erlaubte Typen und Caps setzen; API lehnt ungültige Eingaben ab; Briefing zeigt erlaubte Typen.
- Player muss Typ wählen; Auswahl respektiert Caps; UI/Validierung sind typ‑spezifisch (per‑Device Eingabe + Validierung).
- Trainer-Übersicht zeigt Typ je Spieler und Verteilungen (Type Distribution, Capacity Remaining, Top Devices).

Aufwand & Risiken
- Aufwand: 3–5 Tage (inkl. Migrationen, UI, Tests).
- Risiken: Konsistenz von Caps bei gleichzeitigen Beitritten (lösen via DB‑Transaktion/Row‑Lock), Kompatibilität mit existierenden Sessions.

Tests
- Backend Unit/Integration: Validierung `player_types`, Allowlist/Caps, Auswahl mit Rennbedingungen.
- E2E (Cypress): Catalog, Designer Campaigns – grün. Weitere Flows in Sprint 10.

---

## Sprint 10 – Testabdeckung, Performance & Polish (Planned)

Ziel
- Test‑ und Qualitätsfokus: E2E‑Stabilisierung (Trainer/Player‑Type Flow), Lasttests (80 Spieler), kleinere UI‑Polishes.

Deliverables
- E2E: Trainer‑Flow (Allowed Types + Caps), Player‑Type‑Auswahl, Device‑Eingabe, Submit; Replay‑E2E stabilisieren.
- Performance: Locust‑Szenarien (Websocket + Forecast), Ziel p95 < 2s bei 80 Spielern.
- Polish: Pro‑Device‑Charts im Player (optional), Mobile‑Optimierungen (xs/SM), Fehler‑Toasts konsistent.

Backend
- Load‑Test Endpoints/Profiling Hooks (optional), Logging Review.

Frontend
- Cypress Tests erweitern (trainer/player types), testids wo sinnvoll, geringere Flakiness.
- Lazy‑Charts optional (code‑splitting), weitere A11y‑Kleinteile.

Akzeptanzkriterien
- E2E‑Suite grün für Kernpfade inkl. Trainer/Player‑Type‑Flow.
- p95 < 2s im Locust‑Szenario dokumentiert.
- Keine kritischen UI‑Blocker (mobile usable).

## Sprint 4 – Device Model Integration & Polish (10.11.2025)

### Ziel
Device Model vollständig in Engine und Player integrieren, Storage-Felder ergänzen.

### Deliverables
- ✅ Engine: Curtailment Priority Order in `apply_grid()` (devices sortiert nach get_curtailment_priority)
- ✅ Player: Forecast Validation gegen min_load/ramp_rate in `POST /player/forecast` und `/forecast/full`
- ✅ Storage: Power Rating (MW) und Initial SoC (%) als KSE-Felder (Tab 7)
- ✅ Tests: Backend Integration-Tests (`test_device_integration.py`, 15+ Test-Cases)
- ✅ Dokumentation: plan.md, log.md, REQUIREMENTS_CHECK.md aktualisiert

### Implementierung
**Engine** (`backend/app/engine.py`):
- Import `get_curtailment_priority` von device_types
- `apply_grid(volume, atc, losses, devices)`: Sortiert devices nach priority (1=first, 4=last)
- `run_round()`: Übergibt `config.devices` an apply_grid
- Kommentar dokumentiert zukünftige per-device curtailment (benötigt per-device dispatch)

**Player** (`backend/app/player.py`):
- Import `validate_forecast_constraints`, Session, Scenario
- `POST /api/player/forecast`: Lädt scenario.config, validiert forecast gegen alle devices
- `POST /api/player/forecast/full`: Identische Validierung für full forecast
- Returns 400 BAD_REQUEST mit `{"error": "...", "details": ["Device: error", ...]}` bei Violation

**Storage** (Frontend + Backend):
- Frontend: `power_rating_mw` und `initial_soc_pct` Felder in KSE Tab 7, InfoLabels
- Backend: `validate_config()` prüft `power_rating_mw > 0` und `initial_soc_pct in [0, 100]`
- `defaultConfig` aktualisiert: `{efficiency: 0.85, capacity_mwh: 100, power_rating_mw: 50, initial_soc_pct: 50}`

**Tests** (`backend/tests/test_device_integration.py`):
- TestEngineCurtailmentPriority: apply_grid mit devices, priority sorting, backward compatibility
- TestEngineRunRoundWithDevices: run_round mit devices in isolated_per_player + shared_market modes
- TestPlayerForecastValidation: Platzhalter für Flask-Context-Tests
- TestDeviceIntegrationWorkflow: End-to-end (Coal, Mixed Portfolio, Curtailment Priority)

### Status
Sprint 4 ✅ **100% abgeschlossen**.

---

## Sprint 5 – UX Polish & Student Flow (P0 Items) (11.11.–17.11.2025)

### Ziel
MVP-kritische UX-Verbesserungen: Student-Navigation, Error Handling, Copy Cleanup, Round Editor UX.

### Deliverables (P0 aus backlog.md)

#### 1) Student Entry & Navigation (Home)
**Problem:** Keine Home/My Scenarios; Spieler müssen manuell zu `/player` navigieren und IDs eingeben.

**Implementierung:**
- **Backend** (`backend/app/me.py`):
  - `GET /api/me/sessions` - liefert alle Sessions für current_user mit Status, Scenario-Name, Cohort, Next Round, Start-Zeit
  - Response: `[{id, scenario_name, cohort_name, status, current_round, max_rounds, next_round_at, started_at}]`
  
- **Frontend** (`frontend/src/pages/Home.jsx` - neu):
  - Grid mit Scenario-Cards (Paper/Card)
  - Spalten: Scenario, Cohort, Status (Badge), Next Round, Actions
  - CTAs pro Card: "View Briefing", "Play/Resume" (role=player), "Reports" (nach Session-Ende)
  - Role-based: player → Home als Default; admin/designer/trainer → eigene Entry-Pages
  
- **Routing** (`frontend/src/App.jsx`):
  - Default `/` Route: redirect basierend auf user.role (player→/home, trainer→/trainer, designer→/kse, admin→/admin)
  - Neue Route: `<Route path="/home" element={<Home />} />`
  - Neue Route: `<Route path="/briefing/:sessionId" element={<Briefing />} />` (Stub)
  
- **Navigation** (`frontend/src/App.jsx`):
  - AppBar: "Home" Link für role=player (vor Player/Trainer/Editor)

**Acceptance:**
- ✅ Player-Login → automatisch zu /home
- ✅ Home zeigt alle zugewiesenen Sessions (auch wenn keine: Empty State)
- ✅ "Play" Button navigiert zu `/player?sessionId=123` (automatisch)
- ✅ Keine manuellen IDs mehr nötig

---

#### 2) Round Editor UX (Player)
**Problem:** Manuelle sessionId/round Eingabe; kein Timer; kein visuelles Feedback.

**Implementierung:**
- **Backend** (`backend/app/player.py`):
  - `GET /api/player/active-session` - liefert aktive Session für current_user + current_round + time_remaining_seconds
  - Response: `{session_id, round, time_remaining, forecast_horizon_hours, freeze_hours, scenario_name}`
  
- **Frontend** (`frontend/src/pages/Player.jsx`):
  - Remove: `sessionId` und `round` TextField Inputs
  - Add: `useEffect` lädt `/api/player/active-session` on mount
  - Add: Countdown Timer Component (zeigt MM:SS, Warning bei < 30s mit orange/red color)
  - Add: Live KPI Cards (Placeholder: Profit, Imbalance, Curtailment - zeigt "—" wenn keine Daten)
  - Add: Simple Line Chart (hours vs forecast_mw) unter Forecast-Inputs
  - Disable Submit: wenn `!sessionId || forecast.some(f => !f.forecast_mw)` oder `timeRemaining === 0`
  - Success/Error: Snackbar mit "Forecast submitted" oder API error message
  
- **Timer Logic:**
  - WebSocket `/game/{sessionId}` liefert `tick` Event (time_remaining)
  - Fallback: Polling GET `/api/player/active-session` alle 10s
  - Auto-Submit Warning: Dialog bei T-30s: "30 seconds left – submit now?"

**Acceptance:**
- ✅ Player sieht automatisch aktive Session (keine Eingabe)
- ✅ Countdown läuft von 5:00 → 0:00
- ✅ Warning bei < 30s
- ✅ Submit disabled bei fehlenden Werten oder Time=0
- ✅ Success Toast nach Submit

---

#### 3) Error Handling + 404
**Problem:** Keine globalen Toasts; keine 404-Route.

**Implementierung:**
- **Frontend** (`frontend/src/components/SnackbarProvider.jsx` - neu):
  - Context-basierter Snackbar Provider (MUI Snackbar + Alert)
  - API: `const {showSnack} = useSnackbar(); showSnack('Message', 'success|error|info|warning')`
  - Auto-dismiss nach 6s; Position: bottom-center
  
- **Frontend** (`frontend/src/components/NotFound.jsx` - neu):
  - MUI Box mit 404-Illustration (oder Typography "404")
  - Heading: "Page not found"
  - Button: "Go to Home" (role-based: player→/home, other→/admin oder /kse)
  
- **Routing** (`frontend/src/App.jsx`):
  - Add: `<Route path="*" element={<NotFound />} />` (Fallback)
  
- **API Error Handling** (`frontend/src/services/api.js`):
  - Axios Interceptor für Responses: bei 4xx/5xx → `showSnack(error.response?.data?.message || 'Request failed', 'error')`
  - Network Errors: `showSnack('Network error – check connection', 'error')`

**Acceptance:**
- ✅ API Fehler zeigen Snackbar (nicht nur console.error)
- ✅ Unbekannte Routes → 404-Seite mit Home-Link
- ✅ Snackbar verschwindet nach 6s automatisch

---

#### 4) Auth Flow & Copy Consistency (English)
**Problem:** Gemischte DE/EN Labels; keine "first-user→admin" Hinweise; inkonsistente Redirects.

**Implementierung:**
- **Frontend** (`frontend/src/pages/Login.jsx`):
  - Heading: "Sign in to EMSG" (statt "Login")
  - Button: "Sign In" (statt "Login")
  - Link: "Don't have an account? Register"
  
- **Frontend** (`frontend/src/pages/Register.jsx`):
  - Heading: "Create your account"
  - Helper Text unter Form: "Note: The first user becomes admin automatically."
  - Button: "Register"
  
- **Frontend** (`frontend/src/App.jsx`):
  - AppBar Links: "Home", "Player", "Trainer", "Editor", "Admin" (alle EN)
  - Role-based Redirect nach Login (in Login.jsx `onSuccess`):
    - `role === 'player' → navigate('/home')`
    - `role === 'trainer' → navigate('/trainer')`
    - `role === 'designer' → navigate('/kse')`
    - `role === 'admin' → navigate('/admin')`
  
- **Alle Pages:**
  - Globale Suche/Ersetze: "Benutzer" → "User", "Erstellen" → "Create", etc.
  - Labels für Inputs/Buttons: Englisch

**Acceptance:**
- ✅ Alle sichtbaren Texte in Englisch
- ✅ Register-Seite zeigt "first user → admin" Note
- ✅ Login → deterministischer Redirect pro Rolle

---

### Tests (Sprint 5)
- **E2E** (`cypress/e2e/student-flow.cy.js` - neu):
  - Login als Player → landet auf /home
  - Home zeigt Sessions
  - Click "Play" → Player-Seite mit aktiver Session
  - Countdown läuft
  - Submit disabled ohne Werte
  - Submit mit Werten → Success Toast
  
- **E2E** (`cypress/e2e/404.cy.js` - neu):
  - Navigate zu `/unknown-route` → 404-Seite
  - Click "Go to Home" → korrekter Redirect
  
- **Unit** (`frontend/src/components/SnackbarProvider.test.jsx`):
  - showSnack() zeigt Message
  - Auto-dismiss nach 6s

### Dokumentation
- `README.md`: Update Navigation-Sektion (Home für Players)
- `log.md`: Sprint 5 Eintrag

### Status
Sprint 5: ⏳ **In Progress**

---

## Sprint 6 – UX Polish & Tables (P1 Items) (18.11.–24.11.2025)

### Ziel
High-Priority UX-Verbesserungen: AppBar Navigation, Admin Table, Trainer Status Table, KSE Usability.

### Deliverables (P1 aus backlog.md)

#### 5) AppBar & Navigation Clarity
**Problem:** Kein User Menu; kein Logout-Platzierung; keine Active-State-Markierung.

**Implementierung:**
- **Frontend** (`frontend/src/components/UserMenu.jsx` - neu):
  - MUI IconButton mit Avatar (user initials)
  - Menu mit Items: Email (disabled), Role (disabled), Divider, Logout (onClick → `/api/auth/logout` + redirect /login)
  
- **Frontend** (`frontend/src/App.jsx`):
  - AppBar: rechts-aligned UserMenu Component
  - Active Route Highlighting: `<Button color={location.pathname === '/home' ? 'secondary' : 'inherit'}>`
  - Navigation Links: conditional rendering (player sieht "Home", admin sieht "Admin", etc.)

**Acceptance:**
- ✅ User kann Email/Role im Menu sehen
- ✅ Logout über Avatar-Menu
- ✅ Aktive Route ist farblich hervorgehoben

---

#### 6) Admin Users Table Ergonomics
**Problem:** Keine Search/Pagination; Role-Change refreshed ganze Tabelle.

**Implementierung:**
- **Frontend** (`frontend/src/pages/AdminUsers.jsx`):
  - Add: TextField "Search by email" (client-side filter: `users.filter(u => u.email.includes(search))`)
  - Add: MUI TablePagination (client-side: slice rows)
  - Optimistic Update: bei Role-Change → update local state sofort, bei Fehler → revert + error snackbar
  - Loading State: Skeleton rows während initial load
  
- **Backend** (optional, später):
  - `GET /api/admin/users?search=...&page=1&limit=50` (server-side)

**Acceptance:**
- ✅ Search funktioniert live (typ-basiert)
- ✅ Pagination mit 10/25/50 Rows per Page
- ✅ Role-Change ohne Flackern (optimistic)
- ✅ Table skaliert zu 1000+ Users (client-side ok für MVP)

---

#### 7) Trainer – Live Session Control
**Problem:** Nur Log-Feedback; keine Player×Round×Status Tabelle; keine Disabled-States.

**Implementierung:**
- **Backend** (`backend/app/sessions.py`):
  - Erweitere `GET /api/sessions/:id/status`: zusätzlich `player_names` Array
  - Response: `{matrix: [{player_id, player_name, round, status: 'submitted|pending'}], ...}`
  
- **Frontend** (`frontend/src/pages/Trainer.jsx`):
  - Add: Session Meta Card (Scenario, Cohort, Current Round, Status)
  - Add: Status Table (MUI DataGrid oder Table):
    - Columns: Player, Round 1, Round 2, ..., Round N (checkmark ✓ wenn submitted)
    - Farben: grün (submitted), grau (pending), rot (timeout)
  - Disable Buttons:
    - "Start" → nur wenn status='pending'
    - "Pause" → nur wenn status='active'
    - "Resume" → nur wenn status='paused'
    - "Force End Round" → nur wenn status='active'
  - Auto-scroll Logs: `useRef` mit `scrollIntoView` bei neuem Log-Entry

**Acceptance:**
- ✅ Trainer sieht Echtzeit Player-Submit-Status
- ✅ Buttons disabled bei ungültigen States
- ✅ Logs scrollen automatisch nach unten

---

#### 8) KSE – Editor Usability
**Problem:** Validierung nur als Summary; Matrix-Editing ohne Guides; Preview unklar.

**Implementierung:**
- **Frontend** (`frontend/src/pages/KSE.jsx`):
  - Field-Level Validation: FormHelperText unter jedem Input mit Error-Text (z.B. "Must be 1-5")
  - Disable "Save" Button: `disabled={!isValid}` (berechnet aus allen Feldern)
  - ATC Matrix:
    - Add: Row/Column Headers mit Zone-Namen (Z1, Z2, ...)
    - Add: Checkbox "Symmetric Lock" → wenn checked, auto-copy A→B bei Edit von B→A
    - Diagonal-Felder: disabled (ATC[i][i] immer 0)
  - Preview Tab:
    - Add: Units in Chart-Axis-Labels: "MCP (ZAR/MWh)", "Volume (MWh)"
    - Add: Tooltip bei Hover: "Assumptions: uniform price, pro-rata dispatch"
  
- **Validation Logic:**
  - `zones`: 1-5 (red border + helper text)
  - `atc`: symmetrisch, alle >= 0
  - `weights`: sum === 1.0
  - `forecast_horizon_hours >= horizon_hours`

**Acceptance:**
- ✅ Fehlerhafte Felder rot markiert mit konkretem Text
- ✅ Save disabled bis alle Fehler behoben
- ✅ ATC-Matrix mit Headern und Symmetric-Lock
- ✅ Preview zeigt Units und Assumptions

---

### Tests (Sprint 6)
- **E2E** (`cypress/e2e/admin-table.cy.js`):
  - Search User by Email
  - Pagination funktioniert
  - Role Change ohne Reload
  
- **E2E** (`cypress/e2e/trainer-status.cy.js`):
  - Start Session → Status Table zeigt Players
  - Player submittet → Checkmark erscheint
  - Buttons disabled in falschen States

### Dokumentation
- `log.md`: Sprint 6 Eintrag

### Status
Sprint 6: 📋 **Planned**

---

## Sprint 7 – Theming, Accessibility & Polish (P2 + W Items) (25.11.–01.12.2025)

### Ziel
Medium-Priority Polish: Theming, Accessibility, Design Tokens, Dark Mode, Empty States.

### Deliverables (P2 + W1-W6 aus backlog.md)

#### 9) Global Theming & Readability (P2)
**Implementierung:**
- **Frontend** (`frontend/src/theme.js`):
  - Tokenized Palette: primary (blue 600), secondary (orange 500), neutral (grey), success/warning/error
  - Typography Scale: h1-h6, body1/body2, caption (consistent font sizes, line-heights)
  - Spacing: 8px base unit
  - Shape: borderRadius 4px (buttons), 8px (cards)
  - Shadows: elevation 1-24
  
- **Frontend** (`frontend/src/styles/tokens.css` - neu):
  - CSS Variables: `--color-primary`, `--spacing-unit`, `--border-radius-sm`
  
- **All Pages:**
  - Wrap in `<Container maxWidth="lg">` (consistent width)
  - Spacing: `<Box sx={{ mt: 4, mb: 2 }}>` (multiples of 8px)

**Acceptance:**
- ✅ Alle Pages haben konsistente Abstände
- ✅ Headings folgen Typography-Scale
- ✅ Container maxWidth einheitlich

---

#### 10) Accessibility & Keyboard Support (P2)
**Implementierung:**
- **All Forms:**
  - Labels: `<TextField label="Email" />` (nicht placeholder-only)
  - ARIA: `aria-label` für Icon-Buttons
  - Focus: MUI default focus indicators sichtbar (kein outline: none)
  
- **Dialogs:**
  - ESC schließt Dialog (MUI default)
  - Focus Trap: MUI Dialog übernimmt automatisch
  
- **Keyboard:**
  - Enter submittet Forms (onKeyDown oder form onSubmit)
  - Tab-Order logisch (DOM-Order)

**Acceptance:**
- ✅ Alle Inputs haben Labels
- ✅ Keyboard-Navigation funktioniert
- ✅ Focus sichtbar

---

#### 11) Microcopy & Guidance (P2)
**Implementierung:**
- **Empty States:**
  - Admin: "No users yet – invite your first user"
  - Trainer: "No active sessions – start a new session in the Sessions tab"
  - Home: "No scenarios assigned – contact your trainer"
  
- **Helper Texts:**
  - Player Forecast: "Enter your forecast for each hour – editable up to freeze time"
  - KSE Events: "Define system-wide or player-specific events"

**Acceptance:**
- ✅ Empty Tables zeigen hilfreiche Messages
- ✅ Key Inputs haben Helper Texts

---

#### W1) Design Tokens & Theme
**Implementierung:**
- Siehe P2 (9) oben – bereits enthalten

---

#### W2) Iconography & Navigation Affordances
**Implementierung:**
- **Frontend** (`frontend/src/App.jsx`):
  - AppBar Icons: HomeIcon, PersonIcon (Player), GroupsIcon (Trainer), EditIcon (Editor), AdminPanelSettingsIcon (Admin)
  - Size: 20px, Color: inherit
  
- **Tables:**
  - Edit: EditIcon
  - Delete: DeleteIcon
  - Role: AdminPanelSettingsIcon

**Acceptance:**
- ✅ Icons crisp bei 1x/2x
- ✅ Labels bleiben sichtbar

---

#### W3) Data Visualization Uplift
**Implementierung:**
- **KSE Preview** (`frontend/src/pages/KSE.jsx`):
  - D3 Chart: Axes mit Labels, Gridlines (stroke-dasharray), Legend (Supply, Demand)
  - Colors: Accessible (WCAG AA Contrast)
  - Tooltips: bei Hover (MCP, Volume)
  
- **Player Round** (`frontend/src/pages/Player.jsx`):
  - Sparkline: Area Chart (hours vs forecast_mw)
  - Hover: Tooltip mit Value
  - Min/Max Markers

**Acceptance:**
- ✅ Charts responsive
- ✅ Tooltips lesbar
- ✅ Colors accessible

---

#### W4) Motion & Micro-interactions
**Implementierung:**
- **Frontend** (global):
  - Button Hover: `transition: background-color 150ms`
  - Card Hover: `transition: box-shadow 200ms`
  - Page Transitions: MUI Fade (150ms)
  
- **Submit Success:**
  - Canvas Confetti (react-canvas-confetti) – 1s burst
  - Respects `prefers-reduced-motion: reduce`

**Acceptance:**
- ✅ Hover smooth
- ✅ Reduced Motion honored

---

#### W5) Dark Mode Toggle
**Implementierung:**
- **Frontend** (`frontend/src/App.jsx`):
  - State: `const [mode, setMode] = useState(localStorage.getItem('theme') || 'light')`
  - Toggle Button in AppBar (IconButton mit DarkModeIcon/LightModeIcon)
  - ThemeProvider: `createTheme({ palette: { mode } })`
  
- **All Pages:**
  - Colors inherit from theme.palette

**Acceptance:**
- ✅ Toggle funktioniert
- ✅ Preference persisted in localStorage
- ✅ Alle Pages lesbar in Dark Mode

---

#### W6) Skeletons & Empty States
**Implementierung:**
- **Loading:**
  - Admin Table: `<Skeleton variant="rectangular" height={400} />`
  - Home Cards: `<Skeleton variant="rounded" width={300} height={200} />`
  
- **Empty States:**
  - Siehe P2 (11) oben

**Acceptance:**
- ✅ Loading States obvious
- ✅ Empty States guided

---

### Tests (Sprint 7)
- **Accessibility Audit:**
  - axe-core in Cypress: `cy.injectAxe(); cy.checkA11y()`
  - Alle kritischen Issues gefixt
  
- **Visual Regression:**
  - Screenshots von Key-Pages (Light + Dark Mode)

### Dokumentation
- `log.md`: Sprint 7 Eintrag
- `README.md`: Dark Mode Feature

### Status
Sprint 7: 📋 **Planned**

---

## Sprint 8 – "Wow" Backlog (WB Items - Optional) (02.12.–08.12.2025)

### Ziel
High-Impact Polish für MVP-Launch: Brand, Advanced Viz, Onboarding, Robustness.

### Deliverables (WB aus backlog.md - priorisiert)

#### WB1) Brand & Landing (3-5 days)
**Implementierung:**
- **Assets:**
  - Logo: `/public/logo.svg` (EMSG acronym)
  - Favicon: `/public/favicon.ico`
  - Brand Colors: primary (custom blue), secondary (custom orange) in theme.js
  
- **Landing Page** (`frontend/src/pages/Landing.jsx` - neu):
  - Hero: Heading "Energy Market Simulation Game", Subheading, CTA "Sign In" / "Register"
  - Features: 3 Cards (Learn, Compete, Analyze)
  - Footer: Links (About, Contact)
  
- **Routing:**
  - `/` → Landing (wenn nicht eingeloggt)
  - `/` → Home (wenn eingeloggt als player)

**Acceptance:**
- ✅ Distinct visual identity
- ✅ Lighthouse A11y ≥ 90

---

#### WB2) Advanced Data Visualization (6-12 days - Slice 1)
**Implementierung:**
- **Combined Chart** (`frontend/src/components/charts/MarketChart.jsx` - neu):
  - DA/IDM/Balancing in einem Chart (3 Lines)
  - Brush/Zoom: D3 brush für Time-Range-Selection
  - Cohort/Reference Overlays: Toggle in Legend
  - Export: SVG/PNG/CSV Buttons
  - Event Annotations: Vertical Line bei Event-Rounds mit Tooltip
  
- **Integration:**
  - Trainer Dashboard
  - Evaluation Page

**Acceptance:**
- ✅ 60fps Pan/Zoom
- ✅ Clear Legends
- ✅ Exports accurate

---

#### WB6) A11y & Mobile Polish (2-4 days)
**Implementierung:**
- **WCAG AA:**
  - Forms: alle Labels, Contrast ≥ 4.5:1
  - Navigation: Keyboard Shortcuts (Shift+S = Submit Forecast, Shift+P = Pause Session)
  
- **Mobile:**
  - Breakpoints: xs (0-600), sm (600-960), md (960-1280)
  - Touch Targets: ≥ 44px (MUI Button default ok)
  - AppBar: Drawer bei < sm

**Acceptance:**
- ✅ axe-core audit passes
- ✅ Shortcuts documented in Help

---

#### WB7) Robustness & Performance (2-4 days)
**Implementierung:**
- **ErrorBoundary** (`frontend/src/components/ErrorBoundary.jsx` - neu):
  - Catches React Errors
  - Shows 500-Seite mit "Something went wrong" + Reload Button
  
- **Code Splitting:**
  - React.lazy für große Pages: `const KSE = lazy(() => import('./pages/KSE'))`
  
- **Vite Config:**
  - Image Optimization: `assetsInlineLimit: 4096`
  - Chunk Size Warnings: `chunkSizeWarningLimit: 1000`

**Acceptance:**
- ✅ LCP < 2.5s (3G Fast)
- ✅ CLS < 0.1

---

### Tests (Sprint 8)
- **Performance:**
  - Lighthouse CI: LCP, CLS, FID
  - Load Testing: 80 concurrent players (Locust)

### Dokumentation
- `log.md`: Sprint 8 Eintrag
- Brand Guide (optional)

### Status
Sprint 8: 📋 **Planned (Optional)**

---

## Weitere WB Items (Backlog für Post-MVP)

### WB3) Onboarding & Guidance (3-4 days)
- Guided Walkthrough (Stepper Overlays)
- Contextual Tooltips
- Empty State Next-Actions

### WB4) Gamification & Feedback (1-2 days)
- Progress Bars (Campaign/Scenario)
- Celebration Animations (reduced motion)
- Optional Sounds (mute toggle)

### WB5) Motion System (1-2 days)
- Page Transitions (Framer Motion)
- List Sort/Filter Animations

### WB8) PWA & Analytics (2-3 days)
- Web Manifest
- Service Worker (Workbox)
- Privacy-conscious Analytics

### WB9) Design System Docs (1-2 days)
- Storybook Setup
- Component Documentation

---

## Gesamtzeitplan (11.11. – 19.12.2025)

| Sprint | Zeitraum | Fokus | Deliverables | Status |
|--------|----------|-------|--------------|--------|
| **Sprint 1** | 11.11.–24.11. | Foundation & Auth | DevOps, Auth, Admin, DB | ✅ 100% |
| **Sprint 2** | 25.11.–08.12. | KSE, Engine, Trainer | KSE, Engine, Sockets, Player | ✅ 100% |
| **Sprint 3** | 09.12.–19.12. | Multiplayer, Evaluation | Leaderboard, Replay, Export | ✅ 95% |
| **Sprint 4** | 10.11. | Device Model | Engine/Player Integration | ✅ 100% |
| **Sprint 5** | 11.11.–17.11. | **UX Polish (P0)** | **Home, Round UX, 404, Copy** | ⏳ **In Progress** |
| **Sprint 6** | 18.11.–24.11. | **UX Polish (P1)** | **AppBar, Tables, Trainer, KSE** | 📋 Planned |
| **Sprint 7** | 25.11.–01.12. | **Theming & A11y (P2+W)** | **Dark Mode, Tokens, Icons, Motion** | 📋 Planned |
| **Sprint 8** | 02.12.–08.12. | **Wow Backlog (WB)** | **Brand, Adv Viz, Perf, A11y** | 📋 Optional |
| **Launch** | 09.12.–19.12. | **Testing & Stabilization** | **E2E, Load Tests, Bugfixes** | 📋 Planned |

---

## Zusammenfassung der Erweiterungen

### Neu hinzugefügt:
- ✅ **Sprint 5 (P0)**: Student Flow, Round Editor UX, Error Handling, Copy Cleanup
- ✅ **Sprint 6 (P1)**: AppBar User Menu, Admin Table Search, Trainer Status Table, KSE Usability
- ✅ **Sprint 7 (P2 + W)**: Theming, Dark Mode, Accessibility, Icons, Motion, Empty States
- ✅ **Sprint 8 (WB - Optional)**: Brand/Landing, Advanced Viz, Performance, Mobile Polish

### Backlog (Post-MVP):
- WB3: Onboarding
- WB4: Gamification
- WB5: Motion System
- WB8: PWA
- WB9: Storybook

### Zeitbudget:
- **Sprint 5-7**: 3 Wochen (bis 01.12.) → MVP-kritische UX fertig
- **Sprint 8**: 1 Woche (bis 08.12.) → Optional "Wow" Features
- **Launch-Prep**: 1.5 Wochen (09.12.–19.12.) → Testing & Stabilization

**Ziel:** Vollständig poliertes MVP mit allen P0-P2 Items bis 19.12.2025 Launch-ready.
