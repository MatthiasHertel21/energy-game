# QA Checks (Accessibility + Smoke E2E)

This project includes basic accessibility (axe) checks via Cypress and a small smoke E2E.

## Setup

```
cd frontend
npm install
npm run build
```

## Run locally (recommended)
Start a local preview server and run a targeted Cypress spec:

```
# In one terminal
npx vite preview --port 5173

# In another terminal
npm run cy:run -- --spec cypress/e2e/a11y.cy.js
```

Alternatively, run both in one command on a temporary port:

```
# Uses port 18082 and overrides Cypress baseUrl via CLI
npx vite preview --port 18082 & sleep 3; npx cypress run --config baseUrl=http://localhost:18082 --spec cypress/e2e/a11y.cy.js
```

## What is covered
- a11y.cy.js: axe checks (serious/critical) on
  - /login
  - /kse (with mocked preview)
  - /trainer (static a11y)
  - /catalog and /catalog/1 (stubbed API data; renders CampaignTimeline)
- smoke.cy.js: KSE preview flow and modals (uses intercepts)

Note
- The full E2E suite contains additional specs that require a running backend. For CI smoke/a11y jobs, use targeted specs to avoid backend dependencies, e.g.:

```
# Smoke
npm run cy:run -- --spec cypress/e2e/smoke.cy.js

# Accessibility
npm run cy:run -- --spec cypress/e2e/a11y.cy.js
```

## Lighthouse (optional)
For Lighthouse, we suggest running it in CI against a deployed preview (PR environments) using `lhci`:

- Add `@lhci/cli` as a devDependency.
- Configure a CI job that runs against the PR preview URL.
- Store reports as artifacts and enforce thresholds (e.g. performance ≥ 80, accessibility ≥ 90).
