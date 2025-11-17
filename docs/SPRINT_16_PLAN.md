# Sprint 16 Plan – Campaign Timeline, Cohort Management & Accessibility

Date: 2025-11-14
Duration: 5–7 Tage
Branch: feature/catalog-campaigns

## Goal
UI-Verbesserungen für Trainer-Workflows (Campaign Timeline, Cohort Management) und Basis-Accessibility-Qualitätssicherung ohne Backend-Migrationen.

## Scope

### 1. UC-16: Campaign Timeline UI (Frontend only)
**File**: `frontend/src/components/CampaignTimeline.jsx` (NEW), `frontend/src/pages/CampaignDetail.jsx` (Integration)

**Requirements**:
- **d3 Timeline**: Horizontale SVG-Timeline mit Bubbles für Sessions
- **Session Bubbles**: Nummeriert (#1, #2, ...), Tooltip mit Session-Name, Statusfarben:
  - `completed`: grün (#4caf50)
  - `in_progress`: blau (#2196f3)
  - `not_started`: grau (#9e9e9e)
- **Interaktivität**: Klick auf Bubble scrollt zur entsprechenden Session-Karte in CampaignDetail
- **Accessibility**: ARIA-Labels, Keyboard-Navigation (Tab + Enter), role="navigation"
- **Responsive**: ≥768px Breite, collapsible auf mobile

**Acceptance**:
- ✅ Timeline zeigt alle Campaign-Sessions chronologisch
- ✅ Klickbare Bubbles navigieren zu Session-Karten
- ✅ ARIA-Labels vorhanden, keyboard-accessible
- ✅ Tooltips zeigen Session-Name + Status
- ✅ Visuelle Konsistenz mit Material-UI Theme

**Technical Approach**:
- D3.js für SVG-Rendering (Timeline-Achse, Bubbles)
- React Refs für Scroll-Target-Referenzen
- useState für selected/hovered Session
- CSS: Sticky Timeline-Bar oben auf CampaignDetail

### 2. UC-11: Cohort Edit/Delete UI (Frontend)
**File**: `frontend/src/pages/Cohorts.jsx` (Enhancements)

**Backend bereits vorhanden**:
- `PATCH /api/cohorts/:id` { name }
- `DELETE /api/cohorts/:id`
- `DELETE /api/cohorts/:id/players/:user_id`

**Requirements**:
- **Inline Rename**: Edit-Icon → TextField → Save/Cancel
- **Remove Member**: X-Icon auf Player-Chip → Bestätigung → DELETE /api/cohorts/:id/players/:user_id
- **Delete Cohort**: Trash-Icon → Confirm-Dialog ("Cohort 'X' wirklich löschen?") → DELETE /api/cohorts/:id
- **Guards**: Nur eigene Cohorts editierbar (creator === current_user), Admins können alle editieren
- **UI-Feedback**: Snackbar bei Erfolg/Fehler, optimistisches Update

**Acceptance**:
- ✅ Trainer kann Cohort-Namen inline umbenennen
- ✅ Einzelne Mitglieder entfernbar (mit Bestätigung)
- ✅ Cohort löschbar (mit Confirm-Dialog)
- ✅ Änderungen sofort sichtbar (State-Update nach API-Call)
- ✅ Guards: Creator/Admin-Check im Frontend

**Technical Approach**:
- EditCohortDialog (inline edit mode)
- ConfirmDialog Component (reusable)
- API Service: updateCohort(), deleteCohort(), removeCohortMember()
- State-Management: Cohorts-Array update nach erfolgreicher Operation

### 3. QA: Accessibility Testing (cypress-axe)
**Files**: `frontend/package.json`, `cypress/support/e2e.js`, `cypress/e2e/a11y.cy.js` (Enhanced)

**Requirements**:
- **cypress-axe Installation**: npm install --save-dev cypress-axe axe-core
- **Integration**: import 'cypress-axe' in cypress/support/e2e.js, cy.injectAxe() + cy.checkA11y()
- **Test Coverage**: Login, KSE, Trainer, CampaignDetail, Player
- **Selective Rules**: Deaktiviere Low-Impact-Regeln bei Bedarf (color-contrast auf Grafiken)
- **CI Integration**: a11y.cy.js läuft in GitHub Actions E2E Workflow

**Acceptance**:
- ✅ cypress-axe installiert und konfiguriert
- ✅ Axe-Läufe auf 5 Kernseiten (Login, KSE, Trainer, CampaignDetail, Player)
- ✅ Keine kritischen/serious Violations (oder dokumentiert als Known Issues)
- ✅ CI/CD: a11y.cy.js wird automatisch ausgeführt

**Technical Approach**:
```javascript
// cypress/e2e/a11y.cy.js
describe('Accessibility Tests', () => {
  beforeEach(() => {
    cy.login('designer@test.com', 'test123')
  })

  it('KSE has no accessibility violations', () => {
    cy.visit('/kse')
    cy.injectAxe()
    cy.checkA11y(null, {
      rules: {
        'color-contrast': { enabled: false } // Grafiken exempt
      }
    })
  })

  // repeat for Trainer, CampaignDetail, Player, Login
})
```

## Out of Scope (defer to Sprint 17+)
- **UC-17**: Admin Session Cleanup (erfordert Backend-Logik + UI-Tabelle)
- **UC-18**: Scenario→Sessions List (größer, eigener Mini-Sprint)
- **UC-19**: Cascade Deletes (DB-Migration nötig)
- **Performance Tests Execution**: Dokumentiert, aber Ausführung erst mit Production-Setup
- **Visual Regression Tests**: Percy/Chromatic Integration (separate Aufgabe)

## Risks & Mitigation
- **d3 Timeline Complexity**: Fallback auf einfache Scroll-Links falls d3 zu komplex
- **A11y Violations**: Nicht alle Regeln sofort erfüllbar → selektives Deaktivieren + Dokumentation
- **Cohort Guards**: Frontend-Check allein nicht sicher → Backend validiert bereits (role_required)

## Definition of Done
- ✅ CampaignTimeline sichtbar auf CampaignDetail, keyboard-navigierbar, klickbar
- ✅ Cohort-UI: Rename/Delete/Remove Member funktional mit Confirmations
- ✅ cypress-axe: Keine kritischen Violations auf 5 Kernseiten
- ✅ Cypress E2E grün (inkl. a11y.cy.js)
- ✅ Code Review + Merge in feature/catalog-campaigns

## Acceptance Summary
Nach Sprint 16:
- Trainer erhält verbesserte Campaign-Übersicht (Timeline) und Cohort-Management (Edit/Delete)
- Basis-A11y-Qualität gesichert (cypress-axe auf Kernseiten)
- System bleibt bei ~99% Feature Completeness
- Alle UI-Flows keyboard-accessible

## Metrics Target
- **Feature Completeness**: ~99% (unverändert, UI-Verbesserungen)
- **New Components**: CampaignTimeline, EditCohortDialog, ConfirmDialog
- **A11y Coverage**: 5 Kernseiten mit Axe-Checks
- **E2E Tests**: +5 specs (a11y.cy.js erweitert)

## Next Steps (Sprint 17+)
- UC-17: Admin Session Cleanup
- UC-18: Scenario→Sessions List (Designer-Übersicht)
- UC-19: Cascade Deletes (DB-Schema-Anpassung)
- Performance Testing Execution (mit Production-Like Setup)
- Visual Regression Tests (Percy/Chromatic)
