# Admin Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 1.4 (Sprint 23)  
**Date**: 17 Dec 2025  
**Audience**: System Administrators

---

## What's New (Sprint 23)

- **Campaign Catalog System**: Published campaigns visible to all players in catalog
- **Solo Session Management**: Players can start and track solo sessions independently
- **Player Progress Tracking**: Automatic scenario completion with reset functionality
- **Campaign/Scenario Display**: Player UI shows campaign and scenario names throughout
- **Currency Formatting**: All ZAR values with locale-aware formatting (en-ZA)
- **Password Reset**: Admins can reset passwords with auto-generation or custom passwords
- **Improved User Deletion**: Complete cascade deletion including solo cohorts
- **Email Notifications**: Password reset emails via SMTP when configured
- **Database Recovery**: Auto-create tables on startup if missing (prevents 500 errors)

---

## Quick Guide

- Tabs: Users | Activity Dashboard | Sessions.
- Manage users/roles, invites, and review activity and sessions.
- Ops: ensure backups, logs/monitoring, and security hygiene.

---

## Detailed Guide

### 1) Users
- **List users**: View all users with ID, email, role, and creation date
- **Change role**: Select dropdown (player/trainer/designer/admin); changes apply immediately
- **Reset Password** (NEW in Sprint 23):
  - Click "Reset Password" button next to any user
  - System generates secure 16-character password (or provide custom password ≥12 chars)
  - New password displayed in alert dialog (copy before closing!)
  - If SMTP configured: Password automatically sent to user's email
  - If SMTP not configured: Admin must manually share password with user
  - Password requirements: Min 12 characters (letters, digits, punctuation)
- **Delete user**: Delete with confirmation; properly cascades to:
  - All forecasts and results by this user
  - Session player type selections
  - Player progress records
  - Cohort memberships
  - Cohorts where user is trainer (including all sessions in those cohorts)
  - Campaigns created by user (if designer)
  - Activity logs related to user
- **Invite**: email + role → invite link (send via SMTP or copy link)
- **Create**: email + role (+ optional password); Backend enforces password policy (min 12 chars)

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

### 5) API Endpoints (Admin)

**User Management**:
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user with optional password
- `DELETE /api/admin/users/<id>` - Delete user (with cascade)
- `POST /api/admin/users/<id>/role` - Change user role
- `POST /api/admin/users/<id>/password` - Reset user password (NEW)
  - Request body: `{ "password": "optional", "send_email": true }`
  - Response: `{ "status": "ok", "new_password": "...", "email_sent": true }`

**Session Data Display**:
- `GET /api/sessions/<id>` - Now includes `campaign_name` and `scenario_name` fields
- `GET /api/catalog/scenarios/<id>` - Includes campaign metadata for briefing screens

**Formatting Standards**:
- All currency values returned in base units (e.g., cents) but displayed as ZAR with formatting
- Frontend applies locale-aware formatting (en-ZA) with thousands separators
- Profit: "ZAR 1,234.56" format
- Imbalance/Curtailment: "1,234.56 MWh" format

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
