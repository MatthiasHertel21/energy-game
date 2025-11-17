# Admin Handbook
## Energy Market Simulation Game (EMSG)

Version: 1.0  
Date: 17 Nov 2025  
Audience: System Administrators

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
- Filters: status, scenario id, date range, rows per page.
- Table: ID, scenario, cohort, started, status, rounds, players.
- Actions (optional): open trainer views (comparison/replay); export CSV/PDF if enabled.

### 4) Operations & Maintenance
- Backups: daily DB backups (retain ≥14d); test restores; use provided scripts or infra tooling.
- Logs/Monitoring: centralise backend logs; track CPU/RAM, DB connections, WebSocket capacity/latency.
- RBAC: enforce least privilege; keep admin count minimal.
- Privacy: limit PII in logs; honour delete/anonymise requests; use email only for platform needs.
- Security: HTTPS, proper CORS, rate limit login/invite, validate uploads (type/size), consider MFA.

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
