# Sprint 22 Plan – KSE Final Polish

Date: 2025-11-17
Owner: MatthiasHertel21

Goals
- Finalize KSE UX polish and deep-linking
- Ensure accessibility and navigation completeness
 - Complete carryover items from Sprint 21

Scope
- Tab hash deep-linking (URL hash ↔ tab sync)
- Focus management on tab change (first actionable control)
- Hourly chart toggles (points/grid) – implemented and verified
- ValidationPanel: click-to-scroll – verified
- Inline ATC editor – verified
- Player Types: two-column header fields + Advanced – verified
- Step chart: legend toggles + PNG/SVG export – verified
- Hourly charts: PNG/SVG export – verified

### Carryover from Sprint 21
- Performance Testing: authenticated Locust run on staging; update PERFORMANCE_RESULTS.md
- E2E/A11y: extend Cypress (ValidationPanel scroll, inline ATC, tab hash-sync, a11y across tabs); add to CI
- KSE Polish issues:
	- #7 Chart bounds/clipPath for Market & Preview
	- #8 Participant split (sliders + inputs; sum validation)
	- #10 Narrow number inputs; helper text tidy
	- #11 Align preview buttons; icons + tooltips
	- #12 Chart zoom modal (with tabular data; ESC/focus trap)
	- #6 Apply Profiles info dialog (JSON example)
- Multiplayer smoke tests (shared_market) + doc
- Documentation polish: README, DEPLOYMENT, QA_CHECKS

Out of scope (tracked separately)
- Full Cypress E2E for KSE flows
- Rate-limited performance runs on prod (requires staging)

Definition of Done
- All items above are implemented or verified as complete
- Build & deploy successful
- Docs updated with summary
 - All carryover items closed and linked in open-issues.md
