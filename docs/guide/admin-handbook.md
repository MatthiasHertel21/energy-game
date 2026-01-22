# Admin Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 2.1 (Sprint 24)  
**Date**: January 22, 2026  
**Audience**: System Administrators

---

## What's New (Sprint 24 - Updated)

- **Enhanced User Management**:
  - Cohort membership display in user table
  - Solo session activity tracking per user
  - Direct cohort assignment via modal dialog
  - Icon-based actions with tooltips (Reset Password, Delete, Assign Cohort)
- **Profile Enhancements**:
  - Editable name and bio fields for all users
  - Last login tracking across the system
- **Cohort Invite System**:
  - Token-based registration for automatic cohort assignment
  - Registration links with copy-to-clipboard functionality
- **Trainer Panel Redesign**:
  - Modal-based cohort details with tabs (Members, Campaigns, Activity)
  - Campaign display with names and scenario counts
  - Member list with last login status and solo session counts
  - Solo cohort filtering (Solo cohorts excluded from trainer panel)
- **Previous Updates (Sprint 23)**:
  - Hourly Market Clearing with accurate price discovery
  - Campaign Catalog System with published campaigns
  - Player Progress Tracking with scenario completion
  - Password Reset with auto-generation and email notifications
  - Database Recovery with auto-create tables on startup

---

## Quick Guide

- Tabs: Users | Activity Dashboard | Sessions.
- Manage users/roles, cohort assignments, and review activity and sessions.
- Ops: ensure backups, logs/monitoring, and security hygiene.

---

## Detailed Guide

### 1) Users
- **List users**: View all users with ID, email, role, cohorts, solo sessions, and creation date
- **Change role**: Select dropdown (player/trainer/designer/admin); changes apply immediately
- **Cohort Assignment** (NEW in Sprint 24):
  - Click "Assign to Cohort" icon (GroupAdd) next to any user
  - Select cohort from dropdown in modal dialog
  - View current cohort memberships for each user
  - Users can be members of multiple cohorts
- **Solo Session Tracking** (NEW in Sprint 24):
  - See count of solo sessions per user in dedicated column
  - Solo sessions are sessions in cohorts named "Solo {user_id}"
  - Helps identify active vs inactive users
- **Reset Password**:
  - Click "Reset Password" icon (LockReset) next to any user
  - System generates secure 16-character password (or provide custom password ≥12 chars)
  - New password displayed in alert dialog (copy before closing!)
  - If SMTP configured: Password automatically sent to user's email
  - If SMTP not configured: Admin must manually share password with user
  - Password requirements: Min 12 characters (letters, digits, punctuation)
- **Delete user**: Click "Delete" icon (Delete) with confirmation; properly cascades to:
  - All forecasts and results by this user
  - Session player type selections
  - Player progress records
  - Cohort memberships
  - Cohorts where user is trainer (including all sessions in those cohorts)
  - Campaigns created by user (if designer)
  - Activity logs related to user
- **Create User**: Click "Create User" button to directly create a new user
  - Enter email and select role
  - Optional: Set temporary password (min 12 chars)
  - If no password provided, user receives email to set password
  - If SMTP configured, credentials sent via email

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
- `GET /api/admin/users` - List all users with cohort and solo session info
- `POST /api/admin/users` - Create user with optional password
- `DELETE /api/admin/users/<id>` - Delete user (with cascade)
- `POST /api/admin/users/<id>/role` - Change user role
- `POST /api/admin/users/<id>/password` - Reset user password
  - Request body: `{ "password": "optional", "send_email": true }`
  - Response: `{ "status": "ok", "new_password": "...", "email_sent": true }`
- `POST /api/admin/users/<id>/cohort` - Assign user to cohort (NEW)
  - Request body: `{ "cohort_id": 123 }`
  - Response: `{ "status": "ok", "message": "User added to cohort" }`
- `DELETE /api/admin/users/<id>/cohort` - Remove user from cohort (NEW)
  - Request body: `{ "cohort_id": 123 }`
- `GET /api/admin/cohorts` - List all cohorts (excluding Solo cohorts) (NEW)

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
