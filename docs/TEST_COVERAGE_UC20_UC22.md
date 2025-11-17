# Test Coverage für UC-20/UC-22 (Trainer Presence & Force Navigate)

Date: 2025-11-17
Features: Trainer Presence Tracking, Force Navigate on Session Start

## Backend Unit Tests

### test_trainer.py
Location: `backend/tests/test_trainer.py`

Tests für GET `/api/trainer/presence` endpoint:

1. **test_presence_endpoint_basic**
   - Verifiziert grundlegende Presence-Aggregation
   - Erstellt Cohort, Student, CohortMember, ActivityLog
   - Prüft: Response enthält korrekten User mit Email, Cohort-Name

2. **test_presence_endpoint_filters_old_activity**
   - Verifiziert Zeitfenster-Filterung (default 5min)
   - Erstellt Activity 10 Minuten alt
   - Prüft: Leere Response (User nicht in aktiven Fenster)

3. **test_presence_endpoint_with_custom_window**
   - Verifiziert custom `window` Parameter
   - Erstellt Activity 8 Minuten alt
   - Prüft: Default (5min) → leer; Custom (10min) → User gefunden

4. **test_presence_endpoint_includes_session_info**
   - Verifiziert vollständige Session-Aggregation
   - Erstellt Cohort → Campaign → Scenario → Session → Activity
   - Prüft: Response enthält campaign_name, scenario_name, session_id, status

5. **test_presence_endpoint_filters_by_cohort**
   - Verifiziert `cohort_id` Parameter
   - Erstellt 2 Cohorts mit je 1 Student
   - Prüft: Filter auf Cohort 1 → nur Student 1 zurück

6. **test_presence_endpoint_unauthorized**
   - Verifiziert JWT Authentication
   - Prüft: 401 ohne Token

### test_force_navigate.py
Location: `backend/tests/test_force_navigate.py`

Tests für GET `/api/me/navigate` endpoint:

1. **test_navigate_endpoint_returns_null_when_no_navigation**
   - Verifiziert Standard-Verhalten ohne active Navigation
   - Mock Redis: `get()` returns `None`
   - Prüft: `{url: null}`

2. **test_navigate_endpoint_returns_url_when_force_navigate_active**
   - Verifiziert Navigation-URL Rückgabe
   - Mock Redis: `get()` returns `b'/briefing/42'`
   - Prüft: `{url: '/briefing/42'}`

3. **test_navigate_endpoint_checks_all_user_cohorts**
   - Verifiziert Multi-Cohort Lookup
   - User in 2 Cohorts, nur Cohort 2 hat Navigation
   - Prüft: URL von Cohort 2 wird zurückgegeben

4. **test_navigate_endpoint_requires_auth**
   - Verifiziert JWT Authentication
   - Prüft: 401 ohne Token

5. **test_navigate_endpoint_handles_no_cohort_membership**
   - Verifiziert Verhalten ohne Cohort-Zugehörigkeit
   - User nicht in Cohort
   - Prüft: `{url: null}`

6. **test_navigate_endpoint_handles_redis_unavailable**
   - Verifiziert graceful degradation
   - Mock Redis as `None`
   - Prüft: `{url: null}` (kein Fehler)

### Test-Ausführung

```bash
# Alle Backend-Tests
cd /home/ga/energy-game
docker compose exec backend python -m pytest tests/ -v

# Nur neue Tests
docker compose exec backend python -m pytest tests/test_trainer.py tests/test_force_navigate.py -v
```

**Note**: Test-Files müssen erst via Deployment/Rebuild in Container verfügbar sein.

---

## Frontend E2E Tests (Cypress)

### trainer-presence.cy.js
Location: `frontend/cypress/e2e/trainer-presence.cy.js`

Tests für Trainer Presence Panel:

1. **displays online players in presence panel**
   - Mock API: 2 Students (einer aktiv in Session, einer idle)
   - Verifiziert: "Online now" Panel sichtbar
   - Verifiziert: Beide Emails angezeigt
   - Verifiziert: Campaign/Scenario-Namen korrekt dargestellt

2. **filters presence by cohort**
   - Mock API: 2 Students in verschiedenen Cohorts
   - User filtert nach "Class A"
   - Verifiziert: Nur Student aus Class A sichtbar

3. **auto-refreshes presence data every 5 seconds**
   - Zählt API-Calls
   - Wartet 5.5 Sekunden
   - Verifiziert: Mindestens 2 Calls (initial + 1 Refresh)

4. **handles empty presence gracefully**
   - Mock API: Leeres Array `[]`
   - Verifiziert: Panel sichtbar, keine Table-Rows

### force-navigate.cy.js
Location: `frontend/cypress/e2e/force-navigate.cy.js`

Tests für Force Navigate Feature:

1. **trainer can start session with force navigate enabled**
   - Trainer wählt Mode, aktiviert Checkbox "Navigate cohort on start"
   - Klickt Start
   - Verifiziert: POST `/api/sessions` enthält `force_navigate: true`

2. **player gets navigated when force navigate is triggered**
   - Player User, Mock API: 1. Poll → `null`, 2. Poll → `/briefing/99`
   - Verifiziert: URL ändert sich zu `/briefing/99`

3. **player polling works continuously every 5 seconds**
   - Player User, zählt API-Calls
   - Wartet 5.5 Sekunden
   - Verifiziert: Mindestens 2 Calls (initial + 1 Refresh)

4. **non-player roles do not poll for navigation**
   - Trainer User
   - Wartet 6 Sekunden
   - Verifiziert: Keine Calls zu `/api/me/navigate`

5. **force navigate checkbox defaults to unchecked**
   - Verifiziert: Checkbox existiert aber ist nicht gecheckt

### Test-Ausführung

```bash
# Alle Cypress E2E Tests (benötigt laufenden Dev-Server)
cd /home/ga/energy-game/frontend
npm run dev &  # Dev-Server starten (Port 5173)
npx cypress run

# Nur neue Tests
npx cypress run --spec "cypress/e2e/trainer-presence.cy.js,cypress/e2e/force-navigate.cy.js"

# Interaktiv (UI)
npx cypress open
```

**Note**: Cypress-Tests benötigen `baseUrl: http://localhost:5173` (Vite Dev-Server). Für Produktion-Tests Anpassung nötig.

---

## Test-Abdeckung Zusammenfassung

| Feature | Backend Unit | Frontend E2E | Status |
|---------|-------------|--------------|--------|
| Trainer Presence API | ✅ 6 Tests | ✅ 4 Tests | Implementiert |
| Force Navigate API | ✅ 6 Tests | ✅ 5 Tests | Implementiert |
| **Total** | **12 Tests** | **9 Tests** | **21 Tests** |

### Abgedeckte Szenarien

**Trainer Presence:**
- ✅ Grundlegende Aggregation (User, Cohort, Session)
- ✅ Zeitfenster-Filterung (default 5min, custom window)
- ✅ Cohort-Filterung
- ✅ Session-Info-Aggregation (Campaign, Scenario)
- ✅ UI Auto-Refresh (5s Interval)
- ✅ Client-side Filter (Cohort/Campaign/Scenario)
- ✅ Empty State Handling
- ✅ Authentication

**Force Navigate:**
- ✅ Redis-basierte Navigation URL Storage
- ✅ Multi-Cohort Lookup
- ✅ Player Polling (5s Interval)
- ✅ React Router Navigation
- ✅ Role-based Polling (nur Player)
- ✅ Checkbox UI State
- ✅ Trainer Start Flow
- ✅ Redis Unavailable Handling
- ✅ Authentication

### Offene Punkte

- ⏳ Integration Tests: Backend + Redis + DB (benötigt Test-Container)
- ⏳ E2E mit echtem Backend (aktuell nur Mocks)
- ⏳ Performance Tests: Presence Aggregation mit 1000+ Usern
- ⏳ Socket.IO Event Tests (trainer `navigate` event)

### Nächste Schritte

1. **Container Rebuild** für Backend-Tests:
   ```bash
   cd /home/ga/energy-game
   bash deploy.sh  # Rebuilt Backend mit neuen Test-Files
   docker compose exec backend python -m pytest tests/test_trainer.py -v
   ```

2. **Cypress Run** mit Dev-Server:
   ```bash
   cd frontend
   npm run dev &  # Terminal 1
   npx cypress run --spec "cypress/e2e/trainer-presence.cy.js"  # Terminal 2
   ```

3. **CI/CD Integration**: GitHub Actions Workflow erweitern
   - `.github/workflows/ci.yml` um neue Tests ergänzen
   - Backend: `pytest tests/test_trainer.py tests/test_force_navigate.py`
   - Frontend: `cypress run` mit headless mode
