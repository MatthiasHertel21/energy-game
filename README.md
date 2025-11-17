# Energy Market Simulation Game (EMSG)

**MVP Version** | Sprint 21 (November 2025)

A web-based energy market simulation platform for educational and training purposes. Players manage virtual power plants, forecast market conditions, and compete in realistic energy markets with dynamic pricing.

---

## Features

### 🎮 Core Gameplay
- **Solo & Multiplayer Sessions**: Individual learning or competitive cohort-based play
- **Real-time Market Simulation**: Double-auction market clearing with supply/demand dynamics
- **Device Management**: Solar, Wind, Gas, Battery, Hydro with realistic constraints
- **Multi-round Scenarios**: Progress through time-based energy market challenges
- **Leaderboard & Comparisons**: Track performance and learn from strategies

### 🛠️ Scenario Designer (KSE)
- **Visual Editor**: Drag-and-drop device configuration
- **Market Parameters**: Price floors/caps, volumes, variability
- **Grid Simulation**: Multi-zone grids with transmission constraints (ATC matrices)
- **Events System**: Scheduled or probabilistic market shocks
- **Preview & Validation**: Real-time supply/demand curve visualization
- **Import/Export**: JSON-based scenario sharing

### 👥 Trainer Tools
- **Campaign Management**: Sequential scenario progressions
- **Cohort Administration**: Group management, CSV import
- **Live Monitoring**: Real-time participant tracking
- **Force Navigation**: Synchronized cohort progression
- **Session Controls**: Start/stop rounds, view aggregate results

### 📊 Analytics
- **Player Dashboard**: Balance tracking, device portfolios, forecast accuracy
- **Comparison View**: Side-by-side player strategy analysis
- **Activity Logs**: Comprehensive audit trail
- **Performance Metrics**: Profit, imbalance penalties, curtailment costs

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Git

### 1. Clone and Setup
```bash
git clone https://github.com/MatthiasHertel21/energy-game.git
cd energy-game
cp .env.example .env
```

### 2. Launch
```bash
docker-compose up -d --build
```

### 3. Access
- **Frontend**: http://localhost
- **API Docs**: http://localhost/api/docs
- **Health**: http://localhost/api/health

### 4. First Login
- Register at `/register` (first user gets `player` role)
- Admin can create invites via `/api/docs` → POST `/api/admin/invites`
- Assign roles: `player`, `trainer`, `designer`, `admin`

---

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   React     │─────▶│ Flask API    │─────▶│  PostgreSQL  │
│   (Vite)    │      │ (REST+WS)    │      │   (State)    │
└─────────────┘      └──────────────┘      └──────────────┘
                            │
                            ├─────▶ Redis (Sessions)
                            └─────▶ Traefik (Routing)
```

### Stack
- **Frontend**: React 18, Material-UI, D3.js, Socket.io-client
- **Backend**: Flask, SQLAlchemy, Flask-SocketIO, Gunicorn
- **Database**: PostgreSQL 15 (state), Redis 7 (sessions/cache)
- **Proxy**: Traefik v2 with Let's Encrypt
- **Testing**: Pytest (backend), Cypress (E2E)

### Key Components
- **Engine** (`backend/app/engine.py`): Market clearing algorithm (double-auction)
- **Device Types** (`backend/app/device_types.py`): Power plant models
- **Sessions** (`backend/app/sessions.py`): Game state management
- **KSE** (`frontend/src/pages/KSE.jsx`): Scenario editor
- **Player** (`frontend/src/pages/Player.jsx`): Forecast interface

---

## Testing

### Backend Unit Tests
```bash
# In Docker
docker-compose exec backend python -m pytest tests/ -v

# Specific tests
docker-compose exec backend python -m pytest tests/test_engine.py -v
```

**Coverage**:
- Market clearing algorithm
- Device models and validation
- Curtailment priority logic
- Use case scenarios

### Frontend E2E Tests (Cypress)
```bash
cd frontend
npm run cy:open  # Interactive
npm run cy:run   # Headless
```

**Test Suites**:
- `smoke.cy.js` - Core user flows
- `trainer.cy.js` - Session management
- `player.cy.js` - Forecast submission
- `kse-devices.cy.js` - Device editor
- `a11y.cy.js` - Accessibility audits

---

## Database & Deployment

See `docs/DEPLOYMENT.md` for details on:
- Database migrations (`flask db upgrade`)
- Backup procedures (`backend/scripts/backup.sh`)
- Production deployment
- Docker Compose stability

---

## Documentation

- `docs/concept.md` - Architecture & MVP scope
- `docs/usecases.md` - Functional requirements
- `docs/SPRINT_*_PLAN.md` - Development roadmap
- `docs/QA_CHECKS.md` - Pre-launch checklist

---

**Last Updated**: Sprint 21 (2025-11-17)
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

