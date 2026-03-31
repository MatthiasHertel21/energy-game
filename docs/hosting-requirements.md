# Tech Stack & Hosting Requirements

## Tech Stack

### Frontend

| Component | Technology |
|---|---|
| Framework | **React 18** (SPA, no SSR) |
| Build Tool | **Vite 5** |
| UI Library | **MUI (Material UI) v6** |
| Charts | **D3.js v7** |
| Routing | **React Router v6** |
| State Management | **Zustand v4** |
| HTTP Client | **Axios** |
| Realtime | **Socket.IO Client v4** |
| Static Serving | **nginx (alpine)** — static file server + reverse proxy |

### Backend

| Component | Technology |
|---|---|
| Framework | **Flask 3** (Python 3.11) |
| API Layer | **Flask-RESTX** (OpenAPI / Swagger at `/api/docs`) |
| Authentication | **Flask-JWT-Extended** (JWT, access + refresh tokens) |
| ORM | **Flask-SQLAlchemy** + **Flask-Migrate** (Alembic) |
| Realtime | **Flask-SocketIO** with **eventlet** (WebSockets) |
| Message Broker | **Redis 7** (Socket.IO multi-worker sync, rate limiter, session state) |
| Password Hashing | **Flask-Bcrypt** |
| Rate Limiting | **Flask-Limiter** (200 req/min per IP, Redis-backed) |
| Security Headers | **Flask-Talisman** (configured; disabled at app level — nginx handles TLS) |
| PDF Export | **ReportLab** |
| Email | **SMTP (Google SMTP Relay)** via Flask Mailer |
| WSGI Server | **Gunicorn** with **eventlet** worker (1 worker, 90 s timeout) |
| Error Tracking | **Sentry SDK** (optional, enabled via `SENTRY_DSN` env var) |

### Database

| Component | Detail |
|---|---|
| Primary DB | **PostgreSQL 15 / 16** |
| Schema | 16 tables: User, Invite, Cohort, CohortMember, Scenario, Session, Forecast, Result, PlayerProgress, Campaign, and more |
| Migrations | Alembic via Flask-Migrate |

### Infrastructure

| Component | Detail |
|---|---|
| Reverse Proxy | **Traefik v2.11** (Host-based and path-based routing) |
| Containerisation | **Docker Compose** (all services) |
| Monitoring | **Netdata** (optional container, port 19999) |

---

## Hosting Requirements

### Minimum System Requirements (Single Server)

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB SSD | 50 GB SSD |
| OS | Linux (Ubuntu 22.04 / Debian 12) | Ubuntu 22.04 LTS |
| Docker | ≥ 24.x | latest stable |
| Docker Compose | ≥ 2.x | latest stable |

*Based on configured system limits: max. 1,000 users, 10 cohorts, 80 players per cohort.*

### Network

- **Port 80** must be publicly reachable (Traefik entrypoint `web`; TLS is terminated upstream)
- **HTTPS/TLS**: The application itself does **not** handle TLS — this must be provided by an upstream reverse proxy or load balancer (nginx, Cloudflare, AWS ALB, etc.)
- **WebSocket support** is mandatory: Socket.IO uses the WebSocket upgrade (`Upgrade: websocket`); the proxy layer must forward `Connection: upgrade` and `Upgrade: $http_upgrade` headers (nginx.conf already configured for this)
- **Sticky sessions** are not required as long as only **1 Gunicorn worker** is running; if the backend is scaled horizontally, Redis Pub/Sub for Socket.IO is already in place, but sticky sessions are still recommended

### Persistence

| Volume | Contents | Backup Priority |
|---|---|---|
| `pgdata` (Docker volume) | All PostgreSQL data (game sessions, scenarios, users) | **Critical** |
| `./uploads/` (bind mount) | Uploaded files (scenarios, images) | **High** |
| `./debug/` (bind mount) | Debug dumps (non-critical) | Low |

### Required Environment Variables (Production)

```env
JWT_SECRET_KEY=<strong-secret>            # min. 32 characters, random
DATABASE_URL=postgresql+psycopg2://...
REDIS_URL=redis://redis:6379/0
VITE_API_BASE=https://your-domain.com     # build-time variable
TRAEFIK_DOMAIN=your-domain.com
CORS_ALLOW_ORIGINS=https://your-domain.com
SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@your-domain.com
```

### Current Architecture Constraints

| Constraint | Reason |
|---|---|
| **No horizontal backend scaling (out of the box)** | Gunicorn runs with **1 worker** (eventlet requirement); multiple instances are technically possible via the existing Redis message queue but have not been tested |
| **No internal HTTPS** | Flask-Talisman is disabled; TLS must be fully terminated at the ingress layer |
| **Blocking market engine** | `run_round` (market clearing) executes synchronously in the request thread — long calculations (> 90 s) will hit the Gunicorn timeout |
| **No CDN for uploads** | `./uploads/` is served directly through Flask/nginx without a CDN layer |

### Recommended Production Architecture

```
Internet → TLS Proxy (nginx / Cloudflare / ALB)
               └── Port 80 → Traefik
                                ├── /api/*       → backend:5000  (Flask / Gunicorn)
                                ├── /socket.io/* → backend:5000  (WebSocket upgrade)
                                ├── /uploads/*   → backend:5000  (file serving)
                                └── /*           → frontend:80   (nginx static files)
                   backend ←→ postgres:5432
                   backend ←→ redis:6379
```
