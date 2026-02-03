# Sprint 14 Summary – KSE UX Konsolidierung & Seed-Integration

Date: 2025-11-14
Branch: feature/catalog-campaigns

Delivered
- KSE: Toolbar + Import/Export Modal (ScenarioIODialog) – Save/Export und Import mit Schema-Version
- KSE: Description Modal (Markdown + Live-Preview via react-markdown)
- KSE: Edit Matrix als einheitlicher Toolbar-Trigger (Fullscreen AtcEditor)
- KSE: Zusammengeführte Market & Preview Ansicht (zweispaltig; links Parameter, rechts Sticky-Preview mit SMP/Volume Charts)
- Engine: Seed-Variabilität + Hourly Preview (Diurnal 24, Seasonal 12), Preview-Seed aus config.environment.seed
- Campaign-Seed: Backend-Integration
  - models.Campaign: neues optionales Feld `seed`
  - engine_api: Preview-Endpunkte akzeptieren optionalen `seed` und propagieren durch
  - engine: `generate_curves_from_config`, `preview_from_config`, `run_round` nehmen jetzt einen Seed-Override an
  - scheduler: leitet Kampagnen-Seed aus PlayerProgress ab (einheitliche campaign_id) und übergibt ihn an die Engine → deterministische Simulation pro Kampagne
- Trainer: Participants Panel (UC-14, minimal)
  - Backend: `GET /api/sessions/:id/participants` liefert joined/pending + by_type Summary
  - Frontend: Trainer.jsx zeigt Liste inkl. Refresh und Typverteilung (Summary)
- Cypress/E2E: KSE-Flows aktualisiert (zusammengelegte Ansicht, Hourly Preview, IO/Description-Modal)
- Build: Frontend-Dependencies installiert; Smoke-Build grün (Vite)

Notes
- 2 moderate npm Vulnerabilities verbleiben (npm audit fix optional, mögliche Breaking Changes)
- A11y-Audits (Axe/Lighthouse) geplant für nächsten Sprint

Metrics
- Frontend Bundle (dist): index ~408 kB gzip ~132 kB (unverändert im Rahmen)
- Vite build: ok, ~17s

Acceptance
- Designer erhält konsolidierte Editing-Experience in KSE, inkl. Previews und Modals
- Simulationen sind für Kampagnen deterministisch (gleicher campaign.seed ⇒ gleiche Ergebnisse)
- Trainer sieht Teilnehmerstand (joined/pending, Typen) während einer Session

Open Items moved to backlog
- QA: A11y-Audit + visuelle Regressionen
- UC-16: Kampagnen-Timeline (UI)
- UC-11: Cohort-UI (Edit/Delete) – Backend bereits vorhanden
- UC-17: Admin Session Cleanup (Backend + UI)
- UC-18: Scenario→Sessions Übersicht (Designer)
- UC-19: Kaskadierendes Löschen
