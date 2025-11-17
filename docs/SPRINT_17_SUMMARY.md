# Sprint 17 Summary – Admin Sessions, Scenario Usage, Cascade Deletes, Deployment Docs

Date: 2025-11-14
Branch: feature/catalog-campaigns

## Delivered

1) UC-17: Admin Session Cleanup
- Backend: GET /api/admin/sessions (Filter: status, scenario_id, date_from, date_to, limit/offset)
- Backend: DELETE /api/admin/sessions/:id
- Backend: POST /api/admin/sessions (Bulk cleanup older_than_days, optional status)
- Frontend: Admin → Tab "Sessions" (Filters, Table, Delete, Bulk Cleanup)

2) UC-18: Scenario → Sessions List (Designer)
- Backend: GET /api/kse/scenarios/:id/sessions (Designer only for own scenarios; Admin all)
- Frontend: KSE → Tab "Usage" (Session list, pagination)

3) UC-19: Cascade Deletes
- Migration: ON DELETE CASCADE/SET NULL FKs (sessions.scenario_id SET NULL, campaign/cohort mappings CASCADE)
- Backend: Campaign DELETE unlinks sessions, deletes scenarios + reference runs, removes mappings
- Frontend: Delete confirmation updated with cascade/unlink warning

4) Deployment Documentation
- DEPLOYMENT.md: Env, SSL, DB setup, backup, monitoring, troubleshooting, security checklist, smoke test

## Metrics
- APIs added: 4
- Frontend: 3 views enhanced (AdminUsers tab, KSE Usage tab, DesignerCampaigns delete dialog)
- Migrations: 1 new Alembic revision

## Acceptance
- Admin can list, filter, delete and bulk cleanup sessions
- Designers can see scenario usage sessions
- Deleting a campaign cleans up related data safely (sessions preserved, unlinked)
- Deployment guide enables production setup

## Notes
- No breaking changes; new endpoints follow RBAC patterns
- Sessions auto-refresh added in Trainer will be completed in Sprint 18 (polling every 5s)
