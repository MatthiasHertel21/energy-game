# Deployment Guide

Production deployment guide for Energy Market Simulation Game (EMSG).

---

## Prerequisites

- **Host**: Linux server (Ubuntu 22.04+ recommended)
- **Docker**: v24+ with Docker Compose v2+
- **Domain**: Configured DNS (e.g., `emsg.example.com`)
- **Email**: For Let's Encrypt SSL certificates
- **Ports**: 80, 443 (HTTP/HTTPS)

---

## Environment Configuration

### .env.production

Create `.env.production` in project root:

```bash
# Flask
FLASK_ENV=production
SECRET_KEY=<generate-random-64-chars>
JWT_SECRET_KEY=<generate-random-64-chars>
ALLOWED_ORIGINS=https://emsg.example.com

# Database
POSTGRES_HOST=postgres
POSTGRES_DB=emsg_db
POSTGRES_USER=emsg
POSTGRES_PASSWORD=<strong-password>

# Redis
REDIS_URL=redis://redis:6379/0

# Mail (Optional - for invites)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=no-reply@example.com
SMTP_PASSWORD=<app-password>
SMTP_FROM=EMSG <no-reply@example.com>

# System Limits
MAX_USERS=1000
MAX_COHORTS=100
MAX_PLAYERS_PER_COHORT=80
MAX_SCENARIOS=500

# Logging
LOG_LEVEL=INFO
```

**Generate secrets**:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Docker Compose Setup

### 1. Traefik Configuration

The stack includes Traefik for automatic HTTPS via Let's Encrypt.

**docker-compose.yml** (relevant sections):

```yaml
services:
  traefik:
    image: traefik:v2.11
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./letsencrypt:/letsencrypt

  frontend:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.emsg.rule=Host(`emsg.example.com`)"
      - "traefik.http.routers.emsg.entrypoints=websecure"
      - "traefik.http.routers.emsg.tls.certresolver=letsencrypt"
```

### 2. Launch Stack

```bash
# Build and start
docker-compose --env-file .env.production up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f backend
```

---

## Database Initialization

### First Deploy

```bash
# Run migrations
docker-compose exec backend flask db upgrade

# Verify DB connection
docker-compose exec backend flask shell
>>> from app.extensions import db
>>> db.session.execute('SELECT 1').scalar()
1
```

### Migration Workflow

```bash
# After model changes
docker-compose exec backend flask db migrate -m "Add campaign cover images"
docker-compose exec backend flask db upgrade
```

**Helper script**: `backend/scripts/migrate.sh` (auto-detects and runs init/migrate/upgrade)

---

## Backup & Restore

### Automated Backups

```bash
# Manual backup (creates /backup/emsg_YYYYMMDD_HHMMSS.dump)
docker-compose exec backend bash /app/scripts/backup.sh

# Systemd timer or cron
0 2 * * * cd /opt/energy-game && docker-compose exec -T backend bash /app/scripts/backup.sh
```

### Restore

```bash
# Copy dump to postgres container
docker cp backup/emsg_20251117_020000.dump $(docker-compose ps -q postgres):/tmp/

# Restore
docker-compose exec postgres pg_restore -U emsg -d emsg_db -c /tmp/emsg_20251117_020000.dump
```

### Uploads Directory

Backup `uploads/` directory separately (campaign images, exports):
```bash
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz uploads/
```

---

## Updates & Deployment

### deploy.sh Script

**Quick frontend-only update**:
```bash
./deploy.sh --frontend-only
```

**Full stack rebuild**:
```bash
./deploy.sh
```

**Manual steps**:
```bash
git pull origin main
docker-compose build
docker-compose up -d
docker-compose exec backend flask db upgrade
```

---

## Docker Compose Stability Workaround

**Issue**: On some systems, `docker-compose up -d` fails with `KeyError: 'ContainerConfig'`

**Root Cause**: Docker Compose/BuildKit internal state inconsistency

**Solution** (implemented in `deploy.sh`):
```bash
# Retry logic after failure
docker-compose down
docker-compose pull
docker-compose up -d --build
```

**deploy.sh** includes automatic retry on failure.

**Manual workaround**:
```bash
docker-compose down && \
docker-compose pull && \
docker-compose build && \
docker-compose up -d
```

**Long-term fix**: Upgrade Docker Compose to v2.23+ or enable BuildKit explicitly:
```bash
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
```

---

## Performance Tuning

### Rate Limiting

**Production** (default in `backend/app/config.py`):
```python
RATELIMIT_DEFAULT = "200 per minute"
RATELIMIT_STORAGE_URL = "redis://redis:6379/1"
```

**Testing Environment**:
- Disable rate limiting for load tests: Set `RATELIMIT_ENABLED = False` in config
- Or adjust limits: `RATELIMIT_DEFAULT = "10000 per minute"`

### Performance Testing with Locust

```bash
# Install Locust in backend container
docker-compose exec backend pip install locust

# Run load test (from host)
cd backend/tests/perf
locust -f locustfile.py --host=http://localhost:5001 --users=100 --spawn-rate=10 --run-time=10m

# View results at http://localhost:8089
```

**Sprint 20 Baseline** (100 concurrent users):
- p50: 4ms, p95: 8ms, p99: 15ms
- Throughput: ~50 req/s
- Known issue: 93% error rate (rate limiting + missing auth in locustfile)

See `docs/PERFORMANCE_RESULTS.md` for detailed metrics.

---

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
