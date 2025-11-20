# QA Checks & Testing Guide

**Sprint 20 Status**: 20 Cypress E2E specs passing | Performance baseline established | A11y gaps identified

---

## 1. Setup

```bash
cd frontend
npm install
npm run build
```

---

## 2. Automated Testing

### Cypress E2E Tests (20 specs)

**Current Coverage**: **20 specs** all passing as of Sprint 20

```bash
cd frontend
npm run cy:open  # Interactive mode
npm run cy:run   # Headless CI mode
```

**Test Suites**:
1. `smoke.cy.js` - Login, KSE preview, trainer start, player forecast
2. `trainer.cy.js` - Session management, shared market
3. `player.cy.js` - Full forecast submission flow
4. `comparison.cy.js` - Leaderboard, comparison dashboard
5. `kse-import.cy.js` - KSE JSON import/export
6. `cohorts-import.cy.js` - Cohort CSV import
7. `kse-devices.cy.js` - Device models (Coal, Nuclear, Solar, Battery, Loads)
8. `campaign-timeline.cy.js` - Campaign timeline navigation
9. `catalog.cy.js` - Campaign catalog browsing
10. `admin-activity.cy.js` - Activity dashboard
11. `admin-sessions.cy.js` - Session cleanup
12. `designer-campaigns.cy.js` - Campaign CRUD
13. `player-chart-editor.cy.js` - Chart editor interactions
14. `a11y.cy.js` - Accessibility audits (Login, KSE, Trainer, Catalog)
15-20. Additional specs (see `frontend/cypress/e2e/`)

**Run locally**:
```bash
# In one terminal
npx vite preview --port 5173

# In another terminal
npm run cy:run -- --spec cypress/e2e/a11y.cy.js
```

**CI Mode** (targeted specs, no backend):
```bash
# Smoke tests
npm run cy:run -- --spec cypress/e2e/smoke.cy.js

# Accessibility
npm run cy:run -- --spec cypress/e2e/a11y.cy.js
```

---

## 3. Performance Testing

### Locust Load Testing

**Setup**:
```bash
# Install Locust in backend
docker-compose exec backend pip install locust

# Run from host
cd backend/tests/perf
locust -f locustfile.py --host=http://localhost:5001 --users=100 --spawn-rate=10 --run-time=10m

# View UI at http://localhost:8089
```

**Sprint 20 Baseline** (100 users, 3min test, 8,770 requests):
- **Response Time**: p50=4ms, p95=8ms, p99=15ms ✅ (excellent)
- **Throughput**: ~50 req/s
- **Error Rate**: 93.16% ❌ (86.3% rate limiting 429, 6.8% auth 401)

**Sprint 21 Actions**:
- Fix JWT authentication in `locustfile.py`
- Disable/adjust rate limiting for testing environment
- Run 10min+ tests for realistic throughput measurement

See `docs/PERFORMANCE_RESULTS.md` for detailed metrics and recommendations.

---

## 4. Accessibility (a11y)

### Cypress axe Checks

**Coverage** (`a11y.cy.js`):
- `/login` - Login page
- `/kse` - KSE editor with mocked preview
- `/trainer` - Trainer session control (static check)
- `/catalog` and `/catalog/1` - Campaign catalog with timeline

**Checks**: axe-core serious/critical violations only

**Known Gaps** (Sprint 21):
- KSE Market tab: Accessibility validation missing
- KSE Preview tab: Accessibility validation missing
- Player forecast editor: Chart interactions need keyboard support

**Action**: Sprint 21 will add axe checks for KSE tabs and player chart editor.

---

## 5. Lighthouse (optional)
For Lighthouse, we suggest running it in CI against a deployed preview (PR environments) using `lhci`:

- Add `@lhci/cli` as a devDependency.
- Configure a CI job that runs against the PR preview URL.
- Store reports as artifacts and enforce thresholds (e.g. performance ≥ 80, accessibility ≥ 90).
