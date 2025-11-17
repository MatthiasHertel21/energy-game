# Sprint 19 Plan – KSE UX Polish & Trainer Presence

**Date:** 2025-11-14 bis 2025-11-17  
**Duration:** 3 Tage  
**Branch:** feature/catalog-campaigns  
**Status:** ✅ **CLOSED** (2025-11-17)

Goal
- KSE‑Polish weiterführen (aus Sprint 18)
- Trainer‑Sichtbarkeit & Session‑Start UX erweitern (UC‑20, UC‑22)

Scope
1) UX Struktur & Orientierung (Backlog #5) ✅ ABGESCHLOSSEN
- ✅ Sticky Action Bar am Seitenende (Save, Validate, Import, Description, Template)
- ✅ Mini-TOC Sprunglinks für Sektionen und Breadcrumb (KSE > Scenario)
- ✅ Validation-Hinweise sichtbar (Collapse-basiertes Alert Panel)

2) Environment & Preview (Backlog #36/#37) ✅ ABGESCHLOSSEN
- ✅ Variabilitätsfelder (capacity_variability_pct, marginal_cost_variability_pct) im Environment (global)
- ✅ Step-Preview respektiert Variabilität (Volumen-Jitter, Preis-Spread)
- ✅ Diurnal/Seasonal Profile Presets & JSON-Import (bereits Tab „Market & Preview")

 3) Trainer Presence (UC‑20) ✅ IMPLEMENTED
 - Backend: GET `/api/trainer/presence?cohort_id?&window=300` – Aggregation aus `activity_log`/Sessions/Cohorts
   - Implementation: `backend/app/trainer.py` - aggregates ActivityLog (default 5min window), joins User/Cohort/Session/Scenario/Campaign
   - Returns: `{user_id, email, cohort_id/name, campaign_id/name, scenario_id/name, session_id, status, last_seen}`
 - Frontend: `Trainer.jsx` Panel „Online now" mit Filtern (Cohort/Kampagne/Szenario), Auto‑Refresh (5s polling)
   - Implementation: Added presence panel with client-side filters, auto-refresh every 5s via `setInterval`
 - Tests: Cypress E2E (`frontend/cypress/e2e/trainer-presence.cy.js`), Backend unit tests (`backend/tests/test_trainer.py`)
 - Acceptance: ✅ Live‑Liste, korrekte Zuordnung, Filter funktionsfähig

 4) Force Navigate on Start (UC‑22) ✅ IMPLEMENTED
 - Backend: `POST /api/sessions` mit `force_navigate` Flag; Redis‑basierte Navigation (300s TTL), GET `/api/me/navigate`
   - Implementation: `backend/app/sessions.py` - stores Redis key `cohort:{id}:force_nav` with URL, emits trainer event
   - Implementation: `backend/app/me.py` - checks all user's cohorts for force_nav Redis keys, returns first match
 - Frontend: Start‑Dialog Checkbox „Navigate cohort on start"; Player polling (5s) + `ForceNavigateWatcher` in `App.jsx`
   - Implementation: Checkbox controls `force_navigate` flag, player users poll `/api/me/navigate` and auto-navigate via React Router
 - Tests: Cypress E2E (`frontend/cypress/e2e/force-navigate.cy.js`), Backend unit tests (`backend/tests/test_force_navigate.py`)
 - Acceptance: ✅ Angemeldete Spieler wechseln automatisch zur Briefing/Player‑Seite; Polling-basiert (5s interval)

Out of Scope
- Per-Type Variabilität in Preview (bereits in Player Types erfasst, Preview nutzt globale Felder)
- Engine-Verwendung der Profile (nur Speicherung/Preview)
 - Vollständige Echtzeit‑Anwesenheitshistorie (Admin Dashboard – separat)

Definition of Done
- Breadcrumb + Mini-TOC sichtbar
- Sticky Action Bar funktionsfähig
- Environment: Variabilitätsfelder vorhanden, Step-Preview reagiert darauf
- Profile: Presets/Import nutzbar (UI vorhanden)
 - ✅ Trainer Presence: API/Panel funktionsfähig, Tests implementiert (`trainer-presence.cy.js`, `test_trainer.py`)
 - ✅ Force Navigate: Start‑Option vorhanden; Clients navigieren; Tests implementiert (`force-navigate.cy.js`, `test_force_navigate.py`)
 - Tests ausführbar: `docker compose exec backend python -m pytest tests/` (Backend), `npm run cypress:run` (Frontend E2E)
