# Admin Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 1.1 (Sprint 21)  
**Date**: 20 Nov 2025  
**Audience**: System Administrators

---

## What's New (Sprint 21)

- **Bulk Session Cleanup**: Delete ALL sessions with DELETE confirmation (ignores filters)
- **Performance Baseline**: 20 Cypress E2E specs passing, p95=8ms response time (100 users)
- **Known Issues**: 93% error rate in load tests (rate limiting + auth), Sprint 21 fixes in progress
- **Test Coverage**: 20 Cypress specs, Locust performance testing, axe accessibility checks
- **DevOps**: Docker Compose stability workaround documented in DEPLOYMENT.md

---

## Quick Guide

- Tabs: Users | Activity Dashboard | Sessions.
- Manage users/roles, invites, and review activity and sessions.
- Ops: ensure backups, logs/monitoring, and security hygiene.

---

## Detailed Guide

### 1) Users
- List users; change role (player/trainer/designer/admin); delete with confirmation.
- Invite: email + role → invite link (send via SMTP or copy link).
- Create: email + role (+ optional password). Backend enforces password policy.

### 2) Activity Dashboard
- Period filter (e.g., 30d) for summary tiles and time series (logins, registrations, sessions).
- Recent activity list (latest 50) for quick audits.

### 3) Sessions (System‑wide)
- **Filters**: status, scenario id, date range, rows per page.
- **Table**: ID, scenario, cohort, started, status, rounds, players.
- **Actions**: 
  - Open trainer views (comparison/replay)
  - Export CSV/PDF (if enabled)
  - **Bulk Cleanup** (Sprint 21): Delete ALL sessions button
    - **Warning**: Deletes ALL sessions and related data (forecasts, results, activity logs)
    - **Confirmation**: Type `DELETE` to confirm
    - **Use Case**: Reset system state, clear test data, or pre-production cleanup
    - **Note**: Ignores all filters; deletes everything unconditionally

### 4) Operations & Maintenance

**Backups**:
- Daily DB backups (retain ≥14d); test restores quarterly
- Script: `backend/scripts/backup.sh` (creates `/backup/emsg_YYYYMMDD_HHMMSS.dump`)
- Also backup `uploads/` directory (campaign images, exports)

**Monitoring** (Sprint 21 Baseline):
- **Response Time**: p95=8ms (target <2s) ✅
- **Throughput**: ~50 req/s @ 100 concurrent users
- **Known Issue**: 93% error rate in load tests (86% rate limiting 429, 7% auth 401)
- **Action**: Sprint 21 fixing Locust auth and rate limit config for testing
- Track: CPU/RAM, DB connections, WebSocket capacity/latency, error rates

**Performance Testing**:
- Locust installed in backend container
- Run: `cd backend/tests/perf && locust -f locustfile.py --host=http://localhost:5001`
- See `docs/PERFORMANCE_RESULTS.md` for detailed metrics

**DevOps**:
- **Docker Compose Stability**: Use `deploy.sh` with retry logic (see DEPLOYMENT.md)
- **Known Issue**: `docker-compose up -d` fails with KeyError on some systems; run `deploy.sh` or manual retry

**Security**:
- HTTPS enforced (Traefik auto-cert)
- Rate limiting: 200 req/min (adjust for testing: set `RATELIMIT_ENABLED=False`)
- CORS properly configured
- Validate uploads (type/size)
- Consider MFA for admin accounts

**RBAC**: Enforce least privilege; keep admin count minimal (current: manual user role changes only)

**Privacy**: Limit PII in logs; honour delete/anonymise requests; email only for platform needs (POPIA compliance)

---

## South Africa Context
- Context: SAWEM, Eskom SO/NTCSA references, NERSA as regulator (orientation only).
- Currency/numbering: ZAR (R), decimal “.”, thousand “1 000/1,000”; ensure exports are consistent.
- Timezone: SAST (UTC+2), no DST; logs should include timezone.
- POPIA: minimise PII, restrict access, secure backups, set retention; verify SMTP provider compliance (SPF/DKIM).
- Availability: follow documented p95/p99 targets; monitor WebSocket capacity (≤500) and DB connections.

---

Support
- Technical: support@emsg.example.com
- Security: security@emsg.example.com
- Admin team: admin@emsg.example.com
