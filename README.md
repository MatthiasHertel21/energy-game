# EMSG – Sprint 1 (Foundation & Auth & Admin)

Dieser Stand liefert die Sprint‑1‑Deliverables:
- Docker Compose Infrastruktur (backend, frontend, postgres, redis, traefik)
- Backend API (Flask + Flask‑RESTX): Auth (Register, Login, JWT, Invites, RBAC)
- Admin‑Endpoints: User‑Liste, Rollen ändern
- DB‑Schema (users, invites) + Auto‑Migration via SQLAlchemy create_all (vorläufig)
- Swagger UI unter /api/docs
- Frontend (Vite + React + MUI): Login, Register, Protected Routes, Admin User‑Tabelle
- Health‑Check: GET /api/health → 200

Hinweis: Netdata/Sentry sind für Prod vorgesehen, aktuell auskommentiert in docker‑compose.yml.

## Schnellstart (Lokale Entwicklung mit Docker)

1) .env anlegen
```
cp .env.example .env
```

2) Container bauen und starten
```
docker compose up -d --build
```

3) URLs
- Frontend: http://localhost/
- Swagger UI: http://localhost/api/docs
- Health: http://localhost/api/health

4) Login/Registration
- Erstnutzer-Registrierung ohne Invite erzeugt Rolle "player".
- Invites können als Admin im Swagger unter POST /api/admin/invites erstellt werden.

## Manuelles Setup (ohne Docker)
- Backend: Python 3.11, `pip install -r backend/requirements.txt`, `FLASK_APP=backend/app:create_app flask run` (oder `python backend/run.py`)
## Testing

Backend unit tests
- Create venv and install deps:
	- python3 -m venv .venv
	- .venv/bin/python -m pip install -r backend/requirements.txt
- Run tests:
	- PYTHONPATH=backend .venv/bin/pytest -q backend/tests

What’s covered
- Device models and validation (compat for legacy keys)
- Engine core calculations (MCP/curtailment)
- Use case validation (player types, storage)
	- flask db migrate -m "init"
	- flask db upgrade
- Weitere Änderungen:
	- flask db migrate -m "change"
	- flask db upgrade

Hinweis: `create_all()` wurde entfernt. Bitte Migrationen nutzen.

Docker/CI Tipp:
- Inside backend container: `docker compose exec backend flask db upgrade`
- Helper Script: `backend/scripts/migrate.sh` führt init (falls nötig), migrate und upgrade aus.

## Backups
- Script: `backend/scripts/backup.sh` (schreibt `/backup/emsg_YYYYmmdd_HHMMSS.dump`)
- Beispiel‑Cron (Host):
	- `0 2 * * * docker compose exec -T backend bash -lc "/app/scripts/backup.sh"`
- Log‑Rotation: Backend läuft unter Gunicorn; ergänze systemweite logrotate oder Docker‑Logging‑Driver nach Bedarf.

## Tests

### Backend Unit Tests
```bash
# In Docker
docker compose exec backend python -m pytest tests/ -v

# Spezifische Tests
docker compose exec backend python -m pytest tests/test_engine.py -v
docker compose exec backend python -m pytest tests/test_device_types.py -v
```

### Frontend E2E Tests (Cypress)
```bash
cd frontend

# Interaktive UI
npm run cy:open

# Headless
npm run cy:run

# Spezifische Tests
npm run cy:run -- --spec "cypress/e2e/kse-devices.cy.js"
```

Tests verfügbar:
- `smoke.cy.js` - Login, KSE Preview, Trainer Start, Player Forecast
- `trainer.cy.js` - Session Management, Shared Market
- `player.cy.js` - Full Forecast, Submit
- `comparison.cy.js` - Leaderboard, Comparison Dashboard
- `kse-import.cy.js` - KSE JSON Import/Export
- `cohorts-import.cy.js` - Cohort CSV Import
- `kse-devices.cy.js` - Device Model (Coal, Nuclear, Solar, Battery, Loads)
- `replay.cy.js` - Replay Mode (derzeit instabil/geskippt)

### Performance Tests (Locust)
```bash
cd backend/tests/perf
locust -f locustfile.py --host=http://localhost
```

