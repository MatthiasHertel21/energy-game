# Sprint 20 Plan – Tests, Performance & Ops

Date: 2025-11-14
Duration: 5–7 Tage
Branch: feature/catalog-campaigns

Goal
- Härtung und Nachweise: E2E/A11y erweitern, Performance-Run durchführen, Compose-Stabilität verbessern.

Scope
1) Tests
- Cypress: Admin Sessions Tab (neu) – already added
- Cypress: Player Chart Editor toggle (neu) – already added
- A11y: Axe-Läufe für KSE (Market & Preview) aktualisieren

2) Performance
- Locust ausführen (100 concurrent users) – dokumentieren in PERFORMANCE_RESULTS.md

3) DevOps
- Compose-Stabilität (#28): Dokumentierter Workaround in deploy.sh/DEPLOYMENT.md, optional Compose-Upgrade

Definition of Done
- Cypress-Spezifikationen laufen grün in CI
- PERFORMANCE_RESULTS.md mit gemessenen Werten
- DEPLOYMENT.md ergänzt mit Compose-Hinweisen
