# Admin Guide

Last updated: 2026-02-25  
Audience: Platform Administrators

## 1) Admin objective

Keep the platform secure, reliable, and recoverable while enabling smooth trainer/player operations.

## 2) Responsibility areas

- identity and role governance,
- release/deploy operations,
- backup/restore integrity,
- incident response and communication,
- documentation quality control.

## 3) Operational baseline

Daily checks:
- service health,
- error spikes,
- recent deploy status,
- active session anomalies,
- backup status.

## 4) Release process (recommended)

1. Build and local verify.
2. Deploy to staging.
3. Run smoke tests (login, submit/waiting, trainer advance, round results, docs).
4. Deploy production.
5. Confirm post-deploy health.

## 5) Security baseline

- enforce least privilege,
- protect admin credentials/keys,
- restrict log and backup access,
- avoid exposing sensitive tokens in diagnostics.

## 6) Incident handling

1. Triage scope and severity.
2. Stabilize (pause/rollback/contain).
3. Diagnose with logs + session context.
4. Apply targeted fix and verify key flows.
5. Document and communicate outcome.

## 7) Documentation governance

Guides under `/handbooks/*.md` and `docs/guide/*` should match current behavior.  
Update docs alongside feature/UX changes to avoid operational confusion.

## 8) Weekly admin review

- top incidents,
- open risks,
- role/access changes,
- deployment outcomes,
- required documentation updates.
