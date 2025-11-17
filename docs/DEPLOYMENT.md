# Deployment Guide (Production)

This guide describes how to deploy EMSG to a production-like environment using Docker Compose with SSL, PostgreSQL, and Redis.

## Prerequisites
- Linux host with Docker and docker-compose installed
- Domain name (e.g., emsg.example.com)
- Email for Let's Encrypt (for SSL certificates)
- SMTP credentials for email sending (optional)

## Environment Variables (.env.production)
Create a file `.env.production` in the project root:

```
# App
FLASK_ENV=production
SECRET_KEY=change-this
JWT_SECRET_KEY=change-this-too
ALLOWED_ORIGINS=https://emsg.example.com

# Database
POSTGRES_HOST=postgres
POSTGRES_DB=emsg
POSTGRES_USER=emsg
POSTGRES_PASSWORD=strong-password

# Redis
REDIS_URL=redis://redis:6379/0

# Mail (optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=no-reply@example.com
SMTP_PASSWORD=app-password
SMTP_FROM=no-reply@example.com

# PDF Branding (optional)
PDF_PRIMARY_COLOR=#1976d2
PDF_SECONDARY_COLOR=#e0e0e0
PDF_LOGO_PATH=/app/static/logo.png

# System Limits
MAX_USERS=1000
MAX_COHORTS=10
MAX_PLAYERS_PER_COHORT=80
MAX_SCENARIOS=100
```

## Docker Compose
Use the provided `docker-compose.yml`. Ensure services are exposed via reverse proxy (Traefik or Nginx) with SSL.

### Example Traefik labels (compose override)
```
services:
  frontend:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.emsg.rule=Host(`emsg.example.com`)"
      - "traefik.http.routers.emsg.entrypoints=websecure"
      - "traefik.http.routers.emsg.tls.certresolver=letsencrypt"
```

## Database Setup
1. Start services: `docker compose --env-file .env.production up -d`
2. Initialize DB (if needed):
   - Inside backend container: `flask db upgrade` (if migrations available)
   - Fallback: the app auto-creates tables if migrations are not present
3. Create admin user (first registered user becomes admin) or use admin create endpoint.

## Backup Strategy
- PostgreSQL: Nightly `pg_dump` of database
- Static uploads: Backup `uploads/` directory

## Monitoring and Error Tracking
- Netdata for system metrics
- Sentry (optional) for error tracking (configure DSN if used)

## Updates
- Pull latest code: `git pull`
- Rebuild containers: `docker compose build`
- Restart services: `docker compose up -d`
- Apply DB migrations: `flask db upgrade`

## Troubleshooting
- CORS issues: Verify ALLOWED_ORIGINS matches your domain
- WebSocket issues: Ensure reverse proxy supports WebSocket (Traefik or Nginx config)
- DB connection: Verify POSTGRES_* variables and container health

### docker-compose KeyError/ContainerConfig (Stability)
On some hosts, `docker-compose up -d` sporadically fails with internal python errors (e.g., `KeyError: 'ContainerConfig'`).

Workarounds implemented in `deploy.sh`:
- Retry logic: after a failure, script runs `docker-compose pull` and retries `up -d` once.
- Full rebuild path: `--frontend-only` and `--backend-only` also use the retry helper.

Manual fallback:
```
docker-compose down && docker-compose pull && docker-compose build && docker-compose up -d
```
If the error persists, update Docker/compose and enable BuildKit/buildx.

## Security Checklist
- Strong SECRET_KEY and JWT_SECRET_KEY
- HTTPS enforced
- Admin users managed and limited
- Rate limiting enabled (default 200 req/min)

## Smoke Test
- Open https://emsg.example.com
- Login/Register
- As designer: open KSE, create scenario
- As trainer: create cohort, start session
- As player: join session, submit forecast
- Validate PDFs export and Event notifications
