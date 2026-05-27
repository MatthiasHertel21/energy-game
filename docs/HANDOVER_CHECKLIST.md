# Repository Handover Checklist

Use this checklist before handing the repository to a new maintainer, team, or external partner.

Last updated: 2026-05-27

## Governance

- [ ] Deployment source is explicit (`main` or named release tag)
- [ ] Primary technical owner is named
- [ ] Secondary owner or fallback contact is named
- [ ] `LICENSE` decision is made and committed
- [ ] `CODEOWNERS` or equivalent owner map is committed

## Repository Documentation

- [ ] `README.md` matches the current product and setup reality
- [ ] `.env.example` matches the active environment-variable contract
- [ ] `docs/DEPLOYMENT.md` is current enough for a fresh operator
- [ ] `docs/RUNBOOK.md` is current enough for day-2 support
- [ ] `docs/QA_CHECKS.md` reflects the current validation baseline
- [ ] `docs/HANDOVER_READINESS.md` reflects the current remaining gaps

## Product Handbooks

- [ ] Role handbook sources under `docs/guide/*.md` are up to date
- [ ] Public handbook mirrors under `frontend/public/handbooks/*.md` are synced
- [ ] `bash ./sync-handbooks.sh --check` passes

## Validation Baseline

- [ ] Backend validation command is agreed and documented
- [ ] Frontend build passes: `cd frontend && npm ci && npm run build`
- [ ] Cypress smoke or targeted UI validation was run for the changed surfaces
- [ ] Health endpoint verified: `/api/health`
- [ ] API docs route verified: `/api/docs`

## Deployment And Recovery

- [ ] Current deploy command is documented
- [ ] Rollback command is documented and understood
- [ ] Database backup command is documented
- [ ] Database restore command is documented
- [ ] Migration procedure is documented
- [ ] Logs and monitoring entry points are documented

## External Access Package

- [ ] GitHub access transferred
- [ ] Server or hosting access transferred
- [ ] DNS and TLS ownership transferred
- [ ] SMTP access and sender domain ownership transferred
- [ ] AI provider access transferred if `KSECHAT_*` is used
- [ ] Password manager or secret manager entries transferred

## Final Sign-Off

- [ ] Open bugs and known risks are listed
- [ ] Latest deployment status is recorded
- [ ] Latest backup location is recorded
- [ ] Handover date is recorded
- [ ] Receiving owner confirms they can deploy, validate, and recover the system