# Energy Market Simulation Game (EMSG)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Build](https://github.com/MatthiasHertel21/energy-game/actions/workflows/e2e-tests.yml/badge.svg)](https://github.com/MatthiasHertel21/energy-game/actions)

EMSG is an open-source, web-based electricity market simulation platform for training and teaching. Players bid in configurable day-ahead and intraday markets, trainers run shared multi-player sessions, scenario designers build market configurations in the KSE editor, and admins manage users and operational data.

## Current Product Areas

### Players

The current player flow includes:
- `/home` for resumable sessions, live shared-session join, and dashboard context
- `/catalog` and `/catalog/:id` for campaign and scenario entry
- briefing, active round workspace, round results, and final scenario results
- `/profile` for career stats and recent sessions
- `/replay` for round-by-round SMP and volume review

Core player-facing features include:
- solo and trainer-led shared sessions
- explicit bid layers `A-E`
- battery auto-bid thresholds
- DAM and IDM market views
- device deep-dive results and market-overview dialogs
- context-aware AI helpers on home, briefing, and round-result screens

### Trainers

The trainer surface currently includes:
- `/trainer` for cohort setup and session launch
- `/session-control` for live shared-session operations
- `/comparison` and `/leaderboard` for KPI comparison views

Core trainer tools include:
- start, pause, continue, rewind, extend, next, and stop controls
- presence and cohort-member monitoring
- broadcast messaging to players
- player-type comparison
- overall market overview after completed rounds

### Designers

The design surface currently includes:
- `/designer` for scenario overview
- `/kse` for scenario configuration
- `/ksechat` for AI-assisted scenario drafting and editing

The KSE editor currently covers:
- description
- general timing and balancing settings
- supply and demand configuration
- market availability per round
- grid and ATC setup
- events
- player types and explicit bid configuration
- challenges
- validation, preview, import, and export

### Admins

The admin surface currently includes `/admin` with three tabs:
- `Users`
- `Activity Dashboard`
- `Sessions`

Current admin capabilities include:
- role changes and cohort assignment
- direct user creation and password reset
- activity KPIs and recent-activity review
- filtered session inspection and cleanup
- editing of public static pages such as `Did You Know` and `Course Materials`

## Architecture

```text
React (Vite) SPA -> Flask API + Socket.IO -> PostgreSQL
																	 -> Redis
```

### Stack

- Frontend: React 18, Material UI, D3, Socket.IO client
- Backend: Flask, SQLAlchemy, Flask-SocketIO, Gunicorn
- Data: PostgreSQL 15, Redis 7
- Testing: Pytest, Cypress

### Important implementation areas

- `backend/app/engine.py` - market clearing, dispatch, KPI logic
- `backend/app/sessions.py` - session orchestration and result APIs
- `backend/app/player.py` - player-facing data assembly and submission logic
- `frontend/src/pages/Player.jsx` - active player workspace
- `frontend/src/pages/Trainer.jsx` - live trainer control panel
- `frontend/src/pages/KSE.jsx` - scenario editor

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Git

### Clone and configure

```bash
git clone https://github.com/MatthiasHertel21/energy-game.git
cd energy-game
cp .env.example .env
```

### Launch

```bash
docker-compose up -d --build
```

### Access

- Frontend: `http://localhost:18080`
- API docs: `http://localhost:18080/api/docs`
- Health endpoint: `http://localhost:18080/api/health`
- Public handbook routes:
	- `http://localhost/docs/player`
	- `http://localhost/docs/trainer`
	- `http://localhost/docs/designer`
	- `http://localhost/docs/admin`
	- `http://localhost/docs/engine`

### Authentication

For local or staging-style setups, use the existing auth flow in the app:
- sign in at `/login`
- register at `/register` where applicable
- manage user roles in the admin UI

## Handbook And Documentation Structure

### Role handbooks

Role-handbook source files live here:
- `docs/guide/player-handbook.md`
- `docs/guide/trainer-handbook.md`
- `docs/guide/designer-handbook.md`
- `docs/guide/admin-handbook.md`

The app serves mirrored copies from:
- `frontend/public/handbooks/player-handbook.md`
- `frontend/public/handbooks/trainer-handbook.md`
- `frontend/public/handbooks/designer-handbook.md`
- `frontend/public/handbooks/admin-handbook.md`

The public calculation-engine guide currently lives at:
- `frontend/public/handbooks/calculation-engine.md`

### Other product-near docs

- `docs/CALCULATION_ENGINE.md` - long-form engine reference
- `docs/concept.md` - architecture and scope background
- `docs/usecases.md` - functional requirements
- `docs/HANDOVER_READINESS.md` - current handover status and open gaps
- `docs/HANDOVER_CHECKLIST.md` - repository transfer checklist
- `docs/RUNBOOK.md` - day-2 operations baseline
- `docs/DEPLOYMENT.md` - deployment guidance
- `docs/QA_CHECKS.md` - release and QA checklist

### Static pages versus handbooks

Public static pages such as `Did You Know` and `Course Materials` are not loaded from the handbook markdown files. They are stored separately through `/api/static-pages/*` and edited through the admin static-page editor.

## Handbook Sync Workflow

After editing any role handbook source, run:

```bash
bash ./sync-handbooks.sh
```

To verify that source and public copies are still aligned without modifying files, run:

```bash
bash ./sync-handbooks.sh --check
```

The repository also includes a small GitHub Actions check at `.github/workflows/handbook-sync-check.yml` that fails when the mirrored handbook files drift out of sync.

## Testing

### Backend

```bash
docker-compose exec backend python -m pytest tests/ -v
docker-compose exec backend python -m pytest tests/test_engine.py -v
docker-compose exec backend python -m pytest tests/test_device_types.py -v
```

### Frontend build

```bash
cd frontend
npm ci
npm run build
```

### Cypress E2E

```bash
cd frontend
npm run cy:open
npm run cy:run
```

Representative current specs include:
- `cypress/e2e/smoke.cy.js`
- `cypress/e2e/404.cy.js`
- `cypress/e2e/a11y.cy.js`
- `cypress/e2e/campaign-timeline.cy.js`
- `cypress/e2e/admin-sessions.cy.js`
- `cypress/e2e/player-chart-editor.cy.js`
- `cypress/e2e/kse-tabs-hash.cy.js`
- `cypress/e2e/kse-grid-atc-inline.cy.js`

## Deployment And Operations

See these docs for operational details:
- `docs/DEPLOYMENT.md` - primary deployment guide
- `docs/RUNBOOK.md` - operations, health checks, and first response
- `docs/HANDOVER_CHECKLIST.md` - transition checklist
- `docs/HANDOVER_READINESS.md` - remaining handover gaps

Backups and migration helpers include:
- `backend/scripts/backup.sh`
- `backend/scripts/migrate.sh`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

This project is licensed under the [MIT License](LICENSE).

