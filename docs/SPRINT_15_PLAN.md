# Sprint 15 Plan – Participants, Timeline, Cohort-UI, QA

Date: 2025-11-14
Duration: 5–7 Tage
Branch: feature/catalog-campaigns

Goal
- Trainer-Transparenz und Navigierbarkeit erhöhen, ohne DB-Migrationen
- UI-Verbesserungen, die auf bestehenden APIs aufsetzen
- Basis-A11y-Qualitätssicherung

Scope (selected backlog items)
1) UC-16: Campaign Timeline UI (Frontend only)
   - File: `frontend/src/pages/CampaignDetail.jsx`
   - Component: `CampaignTimeline` (SVG/d3) – horizontale Timeline mit Bubbles (#, Name als Tooltip), Statusfarben (completed/in_progress/not_started), klickbar → Scroll zur Karte
   - Acceptance: Responsiv (≥768px), ARIA-Labels, Keyboard-Navigation

2) UC-11: Cohort edit/delete (Frontend)
   - Backend bereits vorhanden:
     - PATCH `/api/cohorts/:id` { name }
     - DELETE `/api/cohorts/:id`
     - DELETE `/api/cohorts/:id/players/:user_id`
   - UI: `frontend/src/pages/Cohorts.jsx`
     - Inline-Umbenennen, Entfernen einzelner Mitglieder, Löschen mit Confirm-Dialog
   - Acceptance: Änderungen sofort sichtbar, Guards/Bestätigung vorhanden

3) QA: Accessibility + Smoke E2E
   - Add cypress-axe (devDependency) und Basis-Axe-Läufe auf Kernseiten (Login, KSE, Trainer, CampaignDetail)
   - Headless E2E-Suite grün (aktualisierte KSE-Tests, einfache Flows)

Out of Scope (defer)
- UC-17 Admin Session Cleanup (erfordert Datenabgleich + UI-Tabelle)
- UC-18 Scenario Sessions List (größer, eigener Mini-Sprint)
- UC-19 Cascade Deletes (DB-Migration/Strategie nötig)

Risks & Mitigation
- d3 Timeline Interaktionen: fallback auf einfache Scroll-Links
- A11y: Nicht alle Regeln sofort erfüllbar → selektives Deaktivieren von Low-Impact-Regeln in Tests

Definition of Done
- Timeline sichtbar, keyboard-fähig, klickbar
- Cohort-UI: Rename/Delete/Remove Member funktional
- Cypress: Smoke grün, Axe: keine kritischen Violations (serious/critical)
