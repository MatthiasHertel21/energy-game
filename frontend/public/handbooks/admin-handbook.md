# Admin Guide

Last updated: 2026-02-25  
Audience: Platform Administrators

## 1) Admin responsibilities

- User and role administration
- Session/platform oversight
- Operational reliability (deployments, backups, monitoring)
- Security and access governance

## 2) Primary admin areas

- User management (create/update/delete, role changes)
- Invite/account lifecycle
- Session-level oversight and cleanup tasks
- Static content and handbook maintenance

## 3) Role model

Core roles:
- `player`
- `trainer`
- `designer`
- `admin`

Use least privilege: only grant `admin` where operationally necessary.

## 4) Documentation governance

Admin users can access all guides from sidebar documentation:
- Player Guide
- Trainer Guide
- Designer Guide
- Admin Guide
- Engine Guide

Guides are loaded from `/handbooks/*.md`; keep content synchronized with code behavior.

## 5) Operational workflow

Recommended sequence for releases:
1. Build frontend/backend.
2. Deploy to dev/staging.
3. Smoke-test key flows:
   - player submit/waiting,
   - trainer advance controls,
   - round results rendering,
   - docs page loading.

## 6) Security baseline

- Enforce strong password policies.
- Protect admin credentials and access tokens.
- Keep backups and logs access-restricted.
- Avoid exposing sensitive data in client logs or screenshots.

## 7) Reliability baseline

- Maintain regular DB backups and restore checks.
- Monitor API availability and websocket behavior.
- Track build/deploy success and rollback readiness.

## 8) Incident playbook (minimal)

- Scope impact (which role/page/session).
- Check latest deploy and logs.
- Reproduce on dev with known session/scenario.
- Apply focused fix and re-validate build.
- Communicate user-visible impact and resolution.
