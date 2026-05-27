# Contributing

This repository contains the Energy Market Simulation Game (EMSG) with a React/Vite frontend and a Flask backend. The goal of this guide is to give maintainers and handover recipients one current baseline for day-to-day changes.

## Working Model

- Branch from `main` unless a release branch or hotfix branch is explicitly agreed.
- Keep changes scoped. Avoid mixing gameplay logic, infrastructure, and broad documentation cleanup in one change unless they are tightly coupled.
- Never commit secrets, `.env` files, dumps, or generated credentials.
- Treat `docs/guide/*.md` as the source of truth for role handbooks, then sync the public copies with `bash ./sync-handbooks.sh`.

## Before Opening A PR

Run the smallest relevant validation set for the area you touched:

- Backend logic: `docker-compose exec backend python -m pytest tests/ -v`
- Frontend changes: `cd frontend && npm ci && npm run build`
- UI flows or regression-prone views: `cd frontend && npm run cy:run`
- Handbook updates: `bash ./sync-handbooks.sh --check`

If you cannot run one of these checks, document that gap in the PR description.

## Commit And Review Expectations

- Use an imperative commit subject.
- Explain affected surfaces, validation, and rollout risk in the PR description.
- Call out migrations, new environment variables, changed ports, uploads/storage impacts, and operator actions.
- Add screenshots for visible UI changes.

## Documentation Expectations

Update documentation in the same change when behavior or operating steps changed:

- `README.md` for product-level orientation
- `docs/DEPLOYMENT.md` for deployment guidance
- `docs/QA_CHECKS.md` for testing guidance
- `docs/RUNBOOK.md` for day-2 operations
- `docs/HANDOVER_CHECKLIST.md` and `docs/HANDOVER_READINESS.md` for transition readiness

## Handover-Specific Notes

For repository handoff, start here in order:

1. `README.md`
2. `docs/HANDOVER_READINESS.md`
3. `docs/HANDOVER_CHECKLIST.md`
4. `docs/RUNBOOK.md`
5. `docs/DEPLOYMENT.md`

Open items that still require explicit owner decisions, such as `LICENSE`, `CODEOWNERS`, production access owners, and external contacts, should be tracked in `docs/HANDOVER_READINESS.md` until they are closed.