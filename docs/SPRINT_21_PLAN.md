# Sprint 21 Plan – KSE Hardening, Performance & Launch Prep

Date: 2025-11-18
Duration: 14 Tage (18.11. – 01.12.2025)
Branch: feature/catalog-campaigns
Status: Active

---

## Context & Goals

### Background
Sprint 20 delivered Cypress tests but left Performance Testing and DevOps stability incomplete. Analysis revealed **14 critical KSE UI/UX issues** blocking productive designer workflows.

### Primary Goals
1. **Complete Sprint 20 deliverables** (Performance + DevOps)
2. **Resolve all 14 KSE open issues** (#3-#16 from open-issues.md)
3. **Harden Multiplayer** (shared_market mode testing)
4. **Complete documentation** for MVP launch readiness

### MVP Launch Target
19. Dezember 2025 (28 Tage verbleibend)

---

## Scope

### 1) Sprint 20 Completion (High Priority)

#### Performance Testing
- **Action**: Execute Locust load test with 100 concurrent users
- **Endpoints**: 
  - Auth (login/refresh)
  - KSE Preview (DA + Hourly)
  - Catalog browse
  - Player forecast submit
  - WebSocket events (market_cleared)
- **Target**: 
  - p95 < 2s, p99 < 5s
  - Error rate < 1%
  - Document actual results in PERFORMANCE_RESULTS.md
- **Files**: 
  - `backend/tests/perf/locustfile.py` (extend)
  - `docs/PERFORMANCE_RESULTS.md` (update with real data)
- **Estimate**: 1 day

#### DevOps – Compose Stability (Issue #28)
- **Problem**: `docker-compose up -d backend` fails with `KeyError: 'ContainerConfig'`
- **Action**: 
  - Implement `deploy.sh` workaround: `down && up -d` (preserve volumes)
  - Document in DEPLOYMENT.md
  - Optional: Upgrade docker-compose/buildx
- **Files**: 
  - `deploy.sh` (enhance)
  - `docs/DEPLOYMENT.md` (document workaround)
- **Acceptance**: Redeploy reproducible without errors; DB persists
- **Estimate**: 0.5 days

#### A11y – Axe Tests for KSE
- **Action**: Add Cypress Axe tests for KSE Market & Preview tabs
- **Files**: 
  - `frontend/cypress/e2e/a11y.cy.js` (extend)
- **Acceptance**: No critical violations in Axe audit
- **Estimate**: 0.5 days

**Total Sprint 20 Completion: 2 days**

---

### 2) KSE Issues Resolution (Critical Priority)

14 open issues blocking designer productivity. Grouped by severity and dependency.

#### Week 1: High Severity (Sprint Days 3-7)

##### Issue #15 – KSE/Usage Tab: Weiße Seite (Render-Fehler)
- **Severity**: High (complete tab failure)
- **Action**: 
  - Debug console errors
  - Add ErrorBoundary
  - Implement empty state with guidance
- **Files**: `frontend/src/pages/KSE.jsx` (Usage tab)
- **Estimate**: 0.5 days

##### Issue #3 – Market&Preview: Supply/Demand Kurven nicht monoton
- **Severity**: High (misleading preview)
- **Action**: 
  - Backend: Enforce monotonicity in engine preview (sort + cumsum)
  - Frontend: Use step chart, clamp domains
  - Add unit test for monotonicity
- **Files**: 
  - `backend/app/engine.py` (preview functions)
  - `frontend/src/pages/KSE.jsx` (Market&Preview tab)
- **Acceptance**: Curves strictly monotonic (visual + data validation)
- **Estimate**: 1 day

##### Issue #4 – KSE: Doppelte Tab-Reiter entfernen
- **Severity**: High (UX confusion)
- **Action**: Remove duplicate tab bar (keep top one)
- **Files**: `frontend/src/pages/KSE.jsx`
- **Estimate**: 0.5 days

##### Issue #16 – KSE/Toolbar: Rechtsbündig + Tab "Description"
- **Severity**: Medium (but high impact)
- **Action**: 
  - Move toolbar to right-align at "KSE Editor" level
  - "Save" button rightmost
  - Remove "Edit Matrix", "Edit Description", "Validate + Preview"
  - Create new "Description" tab with Name + Markdown field (preview toggle)
- **Files**: 
  - `frontend/src/pages/KSE.jsx` (toolbar + new tab)
- **Acceptance**: Toolbar clean, Description tab functional
- **Estimate**: 1 day

##### Issue #13 – KSE/Grid: ATC Matrix inline editieren
- **Severity**: Medium (workflow friction)
- **Action**: 
  - Remove modal/CSV import/export
  - Inline table with symmetry lock, validation, sticky headers
- **Files**: 
  - `frontend/src/pages/KSE.jsx` (Grid tab)
  - `frontend/src/components/grid/AtcEditor.jsx` (refactor to inline)
- **Estimate**: 1 day

##### Issue #14 – KSE/Player Types: Zweispaltiges Layout
- **Severity**: Medium (usability)
- **Action**: 
  - Left: Player Types list
  - Right: Devices of selected type (DeviceCards, max 1 expanded)
- **Files**: `frontend/src/pages/KSE.jsx` (Player Types tab)
- **Estimate**: 1 day

**Week 1 Total: 5.5 days**

---

#### Week 2: Medium/Low Severity (Sprint Days 8-12)

##### Issue #5 – KSE/General: Spacing, Feldbreite, Gruppierung
- **Action**: 
  - Increase helper text spacing
  - Uniform XS/SM field widths
  - Group fields by logical sections
  - Move Player Zones to Grid tab
- **Files**: `frontend/src/pages/KSE.jsx` (General + Grid tabs)
- **Estimate**: 0.5 days

##### Issue #9 – Market Basics nach General verschieben
- **Action**: Move base_price, base_volume_mwh, price_floor, price_cap to General tab
- **Files**: `frontend/src/pages/KSE.jsx` (General + Market tabs)
- **Estimate**: 0.25 days

##### Issue #7 – Market&Preview: Linien laufen aus der Box
- **Action**: Set clipPath, derive/clamp domains from data, check padding
- **Files**: `frontend/src/pages/KSE.jsx` (Market&Preview charts)
- **Estimate**: 0.5 days

##### Issue #8 – Market&Preview: Teilnehmer-Aufteilung wiederherstellen
- **Action**: 
  - Compact table: rows = types (Supply/Demand groups), column = share %
  - Slider + number field (coupled), validate sum
  - Preview reacts
- **Files**: `frontend/src/pages/KSE.jsx` (Market&Preview tab)
- **Estimate**: 0.75 days

##### Issue #10 – Zahlenfelder schmaler; Erklärtext entfernen
- **Action**: XS/SM width for number inputs; helper text below field only
- **Files**: `frontend/src/pages/KSE.jsx` (Market&Preview tab)
- **Estimate**: 0.25 days

##### Issue #11 – Preview-Buttons ausrichten & Icons
- **Action**: Right-align "Preview MCP" and "Hourly Preview"; IconButtons with tooltips
- **Files**: `frontend/src/pages/KSE.jsx` (Market&Preview tab)
- **Estimate**: 0.25 days

##### Issue #12 – Chart-Zoom als Modal
- **Action**: Click chart → modal with large chart + tabular data (MCP/Volume/Steps)
- **Files**: `frontend/src/pages/KSE.jsx` (Market&Preview tab)
- **Acceptance**: Modal opens/closes, A11y (ESC, focus trap)
- **Estimate**: 0.5 days

##### Issue #6 – Apply Profiles Info-Popup
- **Action**: Info icon next to "Apply Profiles" → dialog with JSON structure example
- **Files**: `frontend/src/pages/KSE.jsx` (Market&Preview tab)
- **Estimate**: 0.25 days

**Week 2 Issues Total: 3.25 days**

---

### 3) Multiplayer & Testing (Sprint Days 13-14)

#### Multiplayer Smoke Tests
- **Action**: 
  - Verify shared_market mode with 2+ players
  - Test aggregations, scaling, zone interactions
  - Document current state
- **Files**: 
  - `backend/tests/test_usecases.py` (extend)
  - Create `docs/MULTIPLAYER_STATUS.md`
- **Estimate**: 1 day

#### E2E Coverage Review
- **Action**: 
  - Run all Cypress specs
  - Fix flaky tests
  - Document coverage gaps
- **Files**: `frontend/cypress/e2e/*.cy.js`
- **Estimate**: 0.5 days

**Multiplayer & Testing Total: 1.5 days**

---

### 4) Documentation Completion (Sprint Day 14)

#### README Update
- **Action**: 
  - Current feature set
  - Quick start guide
  - Architecture overview
- **Files**: `README.md`
- **Estimate**: 0.25 days

#### DEPLOYMENT.md Complete
- **Action**: 
  - Docker Compose setup
  - Environment variables
  - Traefik configuration
  - Backup/restore procedures
  - Compose stability workaround
- **Files**: `docs/DEPLOYMENT.md`
- **Estimate**: 0.25 days

#### QA_CHECKS.md Review
- **Action**: 
  - Update with current test coverage
  - Add manual QA checklist
  - Pre-launch verification steps
- **Files**: `docs/QA_CHECKS.md`
- **Estimate**: 0.25 days

**Documentation Total: 0.75 days**

---

## Sprint Timeline (14 days)

### Week 1 (Days 1-7): Sprint 20 + High Severity KSE

| Day | Focus | Tasks | Estimate |
|-----|-------|-------|----------|
| 1 | Sprint 20 Perf | Locust run, document results | 1.0d |
| 2 | Sprint 20 DevOps+A11y | Compose fix, Axe tests | 1.0d |
| 3 | KSE High-1 | Issue #15 (Usage), Issue #4 (Tabs) | 1.0d |
| 4 | KSE High-2 | Issue #3 (Monotonic curves) | 1.0d |
| 5 | KSE High-3 | Issue #16 (Toolbar + Description tab) | 1.0d |
| 6 | KSE High-4 | Issue #13 (ATC inline) | 1.0d |
| 7 | KSE High-5 | Issue #14 (Player Types layout) | 1.0d |

**Week 1 Total: 7 days**

### Week 2 (Days 8-14): Medium/Low KSE + Testing + Docs

| Day | Focus | Tasks | Estimate |
|-----|-------|-------|----------|
| 8 | KSE Medium-1 | Issues #5, #9 (General/Grid layout) | 0.75d |
| 9 | KSE Medium-2 | Issues #7, #8 (Charts + Participant split) | 1.25d |
| 10 | KSE Low | Issues #10, #11, #12, #6 (Polish) | 1.25d |
| 11 | Multiplayer | shared_market tests, documentation | 1.0d |
| 12 | Testing | E2E review, flaky test fixes | 0.5d |
| 13 | Documentation | README, DEPLOYMENT, QA_CHECKS | 0.75d |
| 14 | Buffer + Release Prep | Final QA, Sprint Summary | 1.5d |

**Week 2 Total: 7 days**

---

## Definition of Done

### Sprint 20 Completion
- ✅ Performance test executed with 100 concurrent users
- ✅ PERFORMANCE_RESULTS.md contains actual measured values
- ✅ Compose stability documented and workaround implemented
- ✅ A11y Axe tests pass for KSE Market & Preview tabs

### KSE Issues
- ✅ All 14 issues (#3-#16) resolved and closed in open-issues.md
- ✅ KSE tabs render correctly without duplicates
- ✅ Usage tab functional with error handling
- ✅ Supply/Demand curves strictly monotonic
- ✅ Toolbar clean and Description tab implemented
- ✅ ATC matrix inline editable
- ✅ Player Types two-column layout
- ✅ All layout/spacing issues resolved
- ✅ Charts properly bounded and zoomable

### Multiplayer
- ✅ shared_market mode tested with 2+ players
- ✅ Aggregations and scaling verified
- ✅ Status documented in MULTIPLAYER_STATUS.md

### Testing
- ✅ All Cypress specs pass (20 specs green)
- ✅ No flaky tests
- ✅ Coverage documented

### Documentation
- ✅ README.md up-to-date with current features
- ✅ DEPLOYMENT.md complete with workarounds
- ✅ QA_CHECKS.md current
- ✅ SPRINT_21_SUMMARY.md created

---

## Risks & Mitigations

### Risk 1: KSE Issues unterestimated
- **Impact**: High (delays launch)
- **Probability**: Medium
- **Mitigation**: 
  - 1.5 day buffer in Week 2
  - Parallel work on independent issues
  - Daily progress tracking

### Risk 2: Performance bottlenecks discovered
- **Impact**: High (requires optimization)
- **Probability**: Low (system already tested informally)
- **Mitigation**: 
  - Focus on worst offenders (p99 > 5s)
  - SQL query optimization
  - Caching strategies documented

### Risk 3: Multiplayer gaps found
- **Impact**: Medium (core feature)
- **Probability**: Medium
- **Mitigation**: 
  - Early testing (Day 11)
  - Document known limitations
  - Prioritize blocking bugs only

---

## Success Metrics

### Quantitative
- 14/14 KSE issues closed
- 20/20 Cypress specs green
- Performance: p95 < 2s, p99 < 5s, errors < 1%
- 0 critical A11y violations

### Qualitative
- Designer can create scenario end-to-end without friction
- Trainer can run multiplayer session smoothly
- Documentation enables onboarding without help

---

## Post-Sprint 21 Outlook

### Sprint 22 Scope (02.12. – 15.12.)
- Final polish (W1-W6 from backlog)
- Security audit
- Performance tuning (if needed)
- User acceptance testing
- Deployment to production

### Sprint 23 (16.12. – 19.12.)
- Final QA
- Launch preparation
- Documentation finalization
- **MVP LAUNCH: 19.12.2025**

---

## Dependencies & Prerequisites

### Technical
- Docker Compose functional
- Staging environment stable
- Locust installed (`pip install locust`)
- Cypress up-to-date

### Team
- Daily progress updates
- Feedback loop for KSE UX decisions
- QA availability in Week 2

---

## Notes

### Design Decisions Needed
- Issue #8: Participant split - exact UI design (table vs. form)
- Issue #12: Chart zoom modal - layout with tabular data
- Issue #13: ATC inline - max rows before scroll

### Optional Enhancements (out of scope)
- W10: Wizard "Create Scenario"
- W11: Autosave & Undo/Redo
- Advanced data visualization (WB2)

### Deferred to Post-MVP
- Mobile optimization
- Advanced gamification
- Storybook documentation
- PWA capabilities

---

**Created**: 2025-11-18  
**Owner**: Solo Implementation (GitHub Copilot)  
**Next Review**: 2025-11-25 (Mid-sprint checkpoint)  
**Sprint End**: 2025-12-01
