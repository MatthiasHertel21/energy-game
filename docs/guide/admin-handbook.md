# Admin Guide

Last updated: 2026-02-25  
Audience: Platform Administrators

## 1) Admin responsibilities

- User and role administration
- Session/platform oversight
- Operational reliability (deployments, backups, monitoring)
- Security and access governance

## 2) Documentation governance

Admin users can access all guides from sidebar documentation:
- Player Guide
- Trainer Guide
- Designer Guide
- Admin Guide
- Engine Guide

Guides are loaded from `/handbooks/*.md`; keep content synchronized with code behavior.

## 3) Operational workflow

Recommended release sequence:
1. Build frontend/backend.
2. Deploy to dev/staging.
3. Smoke-test key flows (submit/waiting, trainer advance, round results, docs pages).

## 4) Security and reliability baseline

- Enforce strong password policies and least-privilege role assignment.
- Keep backups and logs access-restricted.
- Monitor API availability and websocket behavior.
- Maintain rollback readiness for production incidents.

## 5) Incident response (minimal)

- Scope impact (role/page/session).
- Check latest deploy and logs.
- Reproduce on dev with known session/scenario.
- Apply focused fix, re-validate build, communicate outcome.
