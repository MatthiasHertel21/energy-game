# Operations Runbook

Last updated: 2026-05-27

This runbook covers the minimum day-2 operating steps for EMSG. It complements `docs/DEPLOYMENT.md` and the staging deployment bundle.

## Core Services

The default compose stack includes:

- `frontend`
- `backend`
- `postgres`
- `redis`
- `traefik`
- `netdata`

## Common Commands

### Start Or Update The Stack

```bash
docker-compose up -d --build
docker-compose ps
```

### Health Checks

```bash
curl http://localhost:15000/api/health
curl http://localhost:18080/api/docs
```

If the app is behind a real domain, repeat the same checks against `https://<domain>/api/health` and `https://<domain>/api/docs`.

### Logs

```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Restart A Single Service

```bash
docker-compose restart backend
docker-compose restart frontend
```

## Database Operations

### Apply Migrations

```bash
docker-compose exec backend flask db upgrade
```

### Create A Backup

```bash
docker-compose exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore A Backup

```bash
docker-compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup.sql
```

Run restore operations only on an intended target environment and only after confirming the backup source.

## First-Response Troubleshooting

### Backend Unhealthy

1. Check `docker-compose ps`.
2. Inspect `docker-compose logs -f backend`.
3. Confirm database and Redis are reachable.
4. Re-run `docker-compose exec backend flask db upgrade` if the issue started after a deployment.
5. Restart backend once the dependency issue is resolved.

### Frontend Loads But API Calls Fail

1. Check `curl http://localhost:15000/api/health`.
2. Confirm the frontend build uses the correct `VITE_API_BASE`.
3. Check CORS settings in `.env` against `CORS_ALLOW_ORIGINS`.
4. Inspect backend logs for 4xx/5xx errors.

### WebSocket Or Live Session Issues

1. Check backend logs for `socket.io` errors.
2. Verify reverse-proxy rules for `/socket.io`.
3. Confirm Redis is running.
4. Retry with a clean browser session after backend restart.

### Database Or Migration Errors

1. Inspect `docker-compose logs -f postgres`.
2. Validate the current schema state with a manual DB connection if needed.
3. Take a backup before attempting repair.
4. If the deployment introduced the issue, use the rollback command path documented for that environment.

## Minimal Pre-Release Check

Before or immediately after a deployment, verify at least:

- `docker-compose ps`
- `/api/health`
- `/api/docs`
- frontend loads in browser
- login works for one known user
- one representative trainer or player flow for the changed surface

## Escalation Inputs To Keep Outside The Repo

The repo should not contain live secrets or personal contact data. Keep an external handover sheet for:

- primary and secondary operator contacts
- SSH or hosting access
- DNS and certificate ownership
- SMTP credentials
- AI provider credentials if KSE chat is enabled
- alert routing and monitoring dashboards