# Admin Guide

Last updated: 2026-04-30  
Audience: Platform Administrators

## 1) Admin mission

Admins ensure the platform is:
- secure,
- available,
- recoverable,
- auditable,
- and supportable for trainers/designers/players.

## 2) Scope of administration

Primary domains:
- identity and role governance,
- operational deployment and rollback,
- data safety (backup/restore),
- incident response and communication,
- documentation quality and consistency.

## 3) Role governance model

Core roles:
- `player`
- `trainer`
- `designer`
- `admin`

Policy recommendations:
- apply least privilege,
- avoid shared admin accounts,
- review admin assignments regularly,
- remove elevated access when no longer needed.

## 4) Daily operational checklist

- check service health (frontend/backend/db/cache),
- verify recent deployments and errors,
- monitor active sessions for abnormal states,
- confirm backup jobs succeeded,
- scan for unresolved critical incidents.

## 5) Release and deployment process

### Recommended flow

1. Build and verify locally.
2. Deploy to staging/dev.
3. Run smoke tests for critical user journeys.
4. Deploy to production.
5. Verify post-deploy health and key screens.

### Mandatory smoke-test set

- login and role landing pages,
- player submit + waiting behavior,
- trainer advance/round controls,
- round results and detail rendering,
- docs pages (`/handbooks/*.md`) load correctly.

## 6) Backup and recovery discipline

Minimum baseline:
- regular DB backups,
- restore test at scheduled intervals,
- clear retention and rotation policy,
- documented restore runbook with ownership.

If restore has not been tested recently, backup confidence is incomplete.

## 7) Security baseline

- protect admin credentials and SSH keys,
- rotate secrets on compromise suspicion,
- avoid exposing internal tokens in logs,
- restrict access to backups and operational logs,
- review external exposure (ports, domains, TLS).

## 8) Observability and diagnostics

Track at least:
- API error rates,
- websocket/session anomalies,
- container health status,
- deploy success/failure events,
- round processing and state transition errors.

Operational note: collect enough context (session ID, role, round number, timestamp) before escalating.

## 9) Incident response playbook

### Step 1: Triage

- identify impact scope (single user, cohort, global),
- classify severity,
- assign incident owner.

### Step 2: Stabilize

- prevent further damage (pause actions, rollback, feature containment),
- communicate short status update.

### Step 3: Diagnose

- correlate logs, deploy history, and user path,
- reproduce on non-prod where possible,
- isolate root cause.

### Step 4: Recover

- apply minimal, targeted fix,
- validate critical flows,
- monitor for recurrence.

### Step 5: Close

- publish concise post-incident summary,
- record follow-up actions.

## 10) User and session support patterns

Common admin support requests:
- role assignment correction,
- stuck session state checks,
- access or visibility issues,
- confusion around submit/advance control model.

Standardize support answers to reduce inconsistency.

## 11) Documentation governance

Guides are loaded from `/handbooks/*.md`.  
Admin ownership includes:
- ensuring docs match current behavior,
- updating docs after UX/logic changes,
- removing stale instructions quickly.

## 12) Compliance and audit readiness (lightweight)

Maintain a minimal audit trail for:
- production deployments,
- admin-level access changes,
- major incidents and resolutions,
- backup/restore verification events.

## 13) Practical weekly review template

- top incidents this week,
- unresolved risks,
- role/access changes made,
- deployment outcomes,
- documentation deltas needed.

This keeps operations proactive instead of reactive.
