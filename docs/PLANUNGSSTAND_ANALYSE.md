# Planungsstand-Analyse EMSG

Datum: 2025-11-17
Aktueller Sprint: Sprint 20
Branch: feature/catalog-campaigns

---

## Executive Summary

### Status Übersicht
- ✅ **Sprint 1-19**: Weitgehend implementiert, mit wenigen offenen UI-Issues
- ⚠️ **Sprint 20**: In Planung, teilweise umgesetzt (Tests vorhanden)
- ❌ **Sprint 21+**: Keine Planung vorhanden
- 🔴 **Kritische Lücke**: 14 offene Issues in KSE (hauptsächlich UX/UI)

### Kritische Erkenntnisse
1. **Code vs. Dokumentation**: Große Diskrepanz zwischen dokumentiertem Stand und tatsächlichen Open Issues
2. **Sprint 20**: Inkomplett - Tests existieren, aber Performance-Ergebnisse fehlen
3. **Planungsvorlauf**: Kein Sprint 21 Plan vorhanden (Zieltermin: 19.12.2025)
4. **KSE-Blocker**: 14 offene Issues im KSE-Editor könnten MVP-Launch gefährden

---

## 1. Abgeschlossene Sprints - Code-Umsetzung

### ✅ Sprint 1-10: Foundation bis Catalog & Campaigns

#### Vollständig umgesetzt:
- **Auth & Admin** (Sprint 1)
  - ✅ JWT mit Token Refresh (Issue #2 gelöst)
  - ✅ User Management, Invites, RBAC
  - ✅ Admin Activity Dashboard, Sessions Tab
  
- **KSE Core** (Sprint 2)
  - ✅ 7 Tabs implementiert (General, Market, Grid, Events, Player Types, Environment, Usage)
  - ✅ JSON Import/Export
  - ✅ Validation (teilweise)
  - ⚠️ **ABER**: 14 offene UI/UX Issues (siehe Issue #3-#16 in open-issues.md)

- **Catalog & Campaigns** (Sprint 9-10)
  - ✅ Campaign Management (`DesignerCampaigns.jsx`)
  - ✅ Catalog für Spieler (`Catalog.jsx`, `CampaignDetail.jsx`)
  - ✅ Solo Sessions
  - ✅ Player Progress Tracking
  - ✅ n:m Scenario-Campaign Zuordnung
  - ✅ Cover Images Upload
  - ✅ Publish/Visibility/Active Toggles

- **Cohorts** (Sprint 10)
  - ✅ Cohort Management
  - ✅ CSV Import (Issue #3 gelöst)
  - ✅ Campaign Visibility/Activation per Cohort

#### Code-Evidenz:
```
✅ frontend/src/pages/Catalog.jsx - existiert
✅ frontend/src/pages/CampaignDetail.jsx - existiert
✅ frontend/src/pages/DesignerCampaigns.jsx - existiert
✅ frontend/src/components/StickyActions.jsx - existiert (Sprint 19)
✅ frontend/src/components/ForecastChartEditor.jsx - existiert (Sprint 18)
✅ backend/app/catalog.py - Catalog API
✅ backend/app/cohorts.py - Cohorts API mit /players Alias
```

### ✅ Sprint 11-14: UX Enhancements & Events

#### Vollständig umgesetzt:
- **Events Editor Refactor** (Sprint 11)
  - ✅ `EventsList.jsx`, `EventEditor.jsx` mit 4-Tab Drawer
  - ✅ Table View mit Edit/Duplicate/Delete
  
- **Devices Editor** (Sprint 11)
  - ✅ `DeviceCard.jsx` mit expandable cards
  - ✅ Device Presets (inkl. Load-Types Fix - Issue #4)
  - ✅ Type-specific icons und validation

- **ATC Matrix Editor** (Sprint 11)
  - ✅ `AtcEditor.jsx` Fullscreen Dialog
  - ✅ Symmetry Lock, CSV Import/Export
  - ⚠️ **Issue #13**: Soll inline werden, CSV entfernen

- **NumberInput/RangeInput** (Sprint 11)
  - ✅ General, Market, Player Types Tabs
  - ⚠️ Environment Tab noch nicht vollständig

- **Campaign Delete** (Sprint 14)
  - ✅ Backend DELETE Endpoint
  - ✅ Frontend Confirmation Dialog

### ✅ Sprint 15-19: Advanced Features

#### Sprint 18: Player Chart Editor
- ✅ `ForecastChartEditor.jsx` implementiert
- ✅ Drag & Drop für Forecasts
- ✅ Freeze Window Respektierung
- ✅ Toggle zwischen Chart und Feldern
- ✅ Cypress Test vorhanden (`player-chart-editor.cy.js`)

#### Sprint 19: KSE UX Improvements
- ✅ Breadcrumbs & Mini-TOC mit Sprungankern
- ✅ Sticky Action Bar (`StickyActions.jsx`)
- ✅ Environment: Capacity/Marginal Cost Variability
- ✅ Step-Preview mit Variabilität
- ⚠️ ValidationPanel vorbereitet aber nicht aktiviert

---

## 2. Sprint 20 - Aktueller Stand

### Plan (SPRINT_20_PLAN.md)
```
Scope:
1) Tests - Cypress erweitern
2) Performance - Locust 100 concurrent users
3) DevOps - Compose Stabilität
```

### ✅ Tatsächlich umgesetzt:

#### Tests
- ✅ `cypress/e2e/admin-sessions.cy.js` - vorhanden
- ✅ `cypress/e2e/player-chart-editor.cy.js` - vorhanden
- ❌ A11y Axe-Läufe für KSE Market & Preview - **FEHLT**

#### Performance
- ⚠️ `PERFORMANCE_RESULTS.md` existiert, aber **Platzhalter-Werte**
- ❌ Locust Run nicht durchgeführt
- ❌ Keine echten Messwerte

#### DevOps
- ⚠️ Issue #28 (Compose Stabilität) in Backlog als "⏳ Open"
- ❌ Keine Dokumentation in DEPLOYMENT.md
- ❌ Kein Workaround implementiert

### 🔴 Sprint 20 Status: **UNVOLLSTÄNDIG**

---

## 3. Open Issues - Kritische Analyse

### Status: 17 Issues dokumentiert, 14 davon OPEN

#### ✅ Gelöste Issues (4):
1. ✅ Player Forecast Submit Failed (Session.scenario relationship)
2. ✅ Session Timeout / Token Expiration (JWT config + auto-refresh)
3. ✅ Cohort Members CSV Import (API path mismatch)
4. ✅ KSE Load Device Save Error (device type presets)
17. ✅ DesignerCampaigns Create 500 Error (DB schema migration)

#### 🔴 Offene Issues - KSE UX/UI (14):

**High Severity (3):**
- Issue #3: Supply/Demand Kurven nicht monoton (Engine Preview)
- Issue #4: Doppelte Tab-Reiter
- Issue #15: Usage Tab - Weiße Seite (Render-Fehler)

**Medium Severity (8):**
- Issue #5: General Tab - Spacing, Feldbreite, Player Zones → Grid
- Issue #7: Market&Preview - Linien laufen aus Chart-Box
- Issue #8: Market&Preview - Teilnehmer-Aufteilung fehlt
- Issue #9: Market Basics → General Tab verschieben
- Issue #13: Grid - ATC Matrix inline (kein Modal/CSV)
- Issue #14: Player Types - Zweispaltiges Layout
- Issue #16: Toolbar rechtsbündig, Tab "Description" neu

**Low Severity (3):**
- Issue #6: Market&Preview - "Apply Profiles" Info-Popup
- Issue #10: Zahlenfelder schmaler
- Issue #11: Preview-Buttons ausrichten
- Issue #12: Chart-Zoom als Modal

### 🚨 Bewertung:
Diese 14 offenen Issues sind **NICHT** im Sprint 20 Plan berücksichtigt!
Sie könnten den MVP-Launch (19.12.2025) gefährden.

---

## 4. Backlog - Berücksichtigung in Planung

### Analyse SPRINT_20_PLAN.md vs. backlog.md:

#### ✅ Im Sprint 20 Plan enthalten:
- Tests (Cypress Admin Sessions, Player Chart Editor)
- Performance Testing
- DevOps (Compose)

#### ❌ NICHT berücksichtigt:

**Aus Backlog P1 (High Priority):**
- Item #10: Accessibility & Keyboard Support (teilweise)
- Item #11: Microcopy & Guidance
- Item #12: Mini-TOC/Breadcrumb/A11y (nur teilweise in Sprint 19)

**Aus Backlog P2 (Medium Priority):**
- Item #9: Global Theming (teilweise)
- W1-W6: "Wow" Enhancements (komplett offen)

**Aus Backlog New Items:**
- Item #28: DevOps Deployment Stabilität (in Sprint 20 Plan, aber nicht umgesetzt)

### 🔴 Kritische Lücke:
**Keine** der 14 offenen KSE-Issues (#3-#16) sind im Backlog als separate Items erfasst!
Diese Issues existieren nur in `open-issues.md`, nicht in `backlog.md`.

---

## 5. Planungsvorlauf für nächsten Sprint

### Zieltermin: MVP Launch 19.12.2025

### Timeline-Berechnung:
- Heute: 2025-11-17
- Verbleibende Tage: 32 Tage
- Verbleibende Arbeitstage: ~22 Tage (ohne Wochenenden)

### Sprint-Struktur lt. plan.md:
- Sprint 1: 11.11.–24.11.2025 (14 Tage) ✅ 
- Sprint 2: 25.11.–08.12.2025 (14 Tage) ✅
- Sprint 3: 09.12.–19.12.2025 (11 Tage) ❓

### 🔴 **Sprint 21 Plan FEHLT komplett!**

Kein Dokument gefunden:
- ❌ `SPRINT_21_PLAN.md` existiert nicht
- ❌ Keine Planung für die finalen 2 Wochen

### Was noch fehlt (aus plan.md Sprint 3 Scope):

#### Sprint 3 Original Scope:
1. **Multiplayer shared_market**
   - Aggregationen, Scaling, Zonen
   - Status: ❓ Unklar ob implementiert

2. **Evaluation/Reporting**
   - Player Scorecard
   - Leaderboard
   - Comparison Dashboard
   - Status: ⚠️ Teilweise vorhanden (Leaderboard.jsx, Comparison.jsx existieren)

3. **Polish & Release**
   - Performance Tuning
   - Security Audit
   - Documentation Complete
   - Status: ❌ Nicht umgesetzt

---

## 6. Konkrete Risiken & Handlungsempfehlungen

### 🔴 BLOCKER - Immediate Action Required:

1. **14 KSE Open Issues**
   - Risiko: UX unbrauchbar, Designer können Szenarien nicht effizient erstellen
   - Empfehlung: Sprint 21 Focus = KSE Issues #3-#16
   - Aufwand: ~8-10 Arbeitstage

2. **Sprint 20 unvollständig**
   - Risiko: Performance unknown, DevOps instabil
   - Empfehlung: Sprint 20 abschließen (2-3 Tage)
   - Todo:
     - Locust Performance Run durchführen
     - PERFORMANCE_RESULTS.md mit echten Werten füllen
     - Compose Stabilität fixen (Issue #28)
     - A11y Axe-Tests für KSE

3. **Kein Sprint 21 Plan**
   - Risiko: Unkontrollierter Rush zum Deadline
   - Empfehlung: Sprint 21 Plan JETZT erstellen
   - Deadline: Bis 2025-11-18

### ⚠️ WARNINGS:

4. **Open Issues nicht im Backlog**
   - Risiko: Issues werden vergessen
   - Empfehlung: Alle offenen Issues in backlog.md übertragen mit Priorität

5. **Multiplayer Status unklar**
   - Risiko: Kern-Feature fehlt ggf.
   - Empfehlung: Code-Audit für shared_market Mode

6. **Dokumentation veraltet**
   - Risiko: Onboarding unmöglich
   - Empfehlung: README, DEPLOYMENT.md aktualisieren

---

## 7. Vorgeschlagener Sprint 21 Plan (ENTWURF)

### Datum: 2025-11-18 bis 2025-12-01 (14 Tage)

### Ziele:
1. Sprint 20 abschließen (Performance + DevOps)
2. KSE Issues #3-#16 beheben (14 Issues)
3. Multiplayer testen & härten
4. Dokumentation komplettieren

### Priorisierung:

#### Woche 1 (18.-24.11.):
**Tag 1-2: Sprint 20 Completion**
- Performance Run + Dokumentation
- Compose Stabilität
- A11y Tests

**Tag 3-7: KSE High Severity Issues**
- Issue #3: Monotone Kurven (Engine + Frontend)
- Issue #4: Doppelte Tabs entfernen
- Issue #15: Usage Tab Fix
- Issue #13: ATC inline
- Issue #16: Toolbar + Description Tab

#### Woche 2 (25.11.-01.12.):
**Tag 8-10: KSE Medium/Low Issues**
- Issue #5, #7, #8, #9: Layout & Fields
- Issue #6, #10, #11, #12: Polish

**Tag 11-12: Multiplayer & Testing**
- shared_market Mode Smoke Tests
- E2E Multiplayer Scenario

**Tag 13-14: Documentation & Release Prep**
- README aktualisieren
- DEPLOYMENT.md komplettieren
- QA_CHECKS.md Review

### Definition of Done (Sprint 21):
- ✅ Alle 14 KSE Issues closed
- ✅ Performance Results dokumentiert
- ✅ Multiplayer funktional getestet
- ✅ Dokumentation vollständig
- ✅ Deployment reproduzierbar

---

## 8. Gap-Analyse: Plan vs. Realität

### Größte Diskrepanzen:

| Kategorie | Plan | Realität | Gap |
|-----------|------|----------|-----|
| Sprint 20 Tests | Cypress + A11y + Perf | Nur Cypress | 66% |
| Sprint 20 DevOps | Compose Fix | Nicht umgesetzt | 100% |
| KSE Stabilität | "Fertig" in Sprint 2 | 14 offene Issues | Hoch |
| Sprint 21 Plan | Sollte existieren | Fehlt | 100% |
| Performance Daten | Sollten vorliegen | Platzhalter | 100% |
| Backlog Sync | Aktuell | 14 Issues fehlen | Mittel |

### Positive Aspekte:
- ✅ Catalog & Campaigns vollständig
- ✅ Auth & Token Refresh robust
- ✅ Cypress Test Coverage gut
- ✅ Core Features implementiert
- ✅ Component Library reichhaltig

---

## 9. Zusammenfassung & Handlungsplan

### ✅ FAZIT Frage 1: "Sind abgeschlossene Sprints umgesetzt?"

**Antwort: TEILWEISE**

- Sprint 1-19 Kern-Features: **90% umgesetzt**
- Sprint 20: **40% umgesetzt** (Tests ja, Performance/DevOps nein)
- KSE: **Funktional ja, UX-kritisch nein** (14 Issues)

### ❌ FAZIT Frage 2: "Ausreichender Planungsvorlauf?"

**Antwort: NEIN**

- Sprint 21 Plan fehlt komplett
- Sprint 20 unvollständig
- 32 Tage bis Launch, aber 14 KSE Issues + Performance + DevOps + Doku

### ⚠️ FAZIT Frage 3: "Open Issues & Backlog berücksichtigt?"

**Antwort: NEIN**

- 14 KSE Issues **nicht** in Sprint 20 Plan
- 14 KSE Issues **nicht** in backlog.md
- Issue #28 (DevOps) in Plan aber nicht umgesetzt
- Performance Testing in Plan aber nicht durchgeführt

---

## 10. SOFORT-MASSNAHMEN (Nächste 48h)

### Priorität 1 (Heute):
1. ✅ Diese Analyse erstellt
2. ⏭️ Sprint 21 Plan erstellen (SPRINT_21_PLAN.md)
3. ⏭️ Alle 14 KSE Issues in backlog.md übertragen
4. ⏭️ Performance Run durchführen

### Priorität 2 (Morgen):
5. ⏭️ Sprint 20 abschließen (DevOps Fix)
6. ⏭️ Top 3 KSE Issues (#3, #4, #15) beheben
7. ⏭️ Multiplayer Status dokumentieren

### Priorität 3 (Diese Woche):
8. ⏭️ Verbleibende KSE Issues Medium Severity
9. ⏭️ Dokumentation Update
10. ⏭️ QA Checks durchführen

---

## Anhang: Dateien für Deep-Dive

### Planung:
- `docs/plan.md` - Original 3-Sprint Plan
- `docs/SPRINT_20_PLAN.md` - Aktueller Sprint
- `docs/SPRINT_19_SUMMARY.md` - Letzter abgeschlossener Sprint

### Issues & Backlog:
- `docs/open-issues.md` - 17 Issues (4 solved, 14 open - **KSE-lastig!**)
- `docs/backlog.md` - 639 Zeilen, P0-P2 + W + WB Items

### Code-Evidenz:
- `frontend/src/pages/KSE.jsx` - Haupt-Editor (enthält Issues)
- `frontend/src/components/StickyActions.jsx` - Sprint 19
- `frontend/src/components/ForecastChartEditor.jsx` - Sprint 18
- `frontend/src/pages/Catalog.jsx` - Catalog Feature
- `cypress/e2e/*.cy.js` - 20 Test-Dateien

### Performance:
- `docs/PERFORMANCE_RESULTS.md` - **Placeholder-Werte**
- `docs/PERFORMANCE_TESTING.md` - Anleitung (vorhanden?)

---

**Erstellt**: 2025-11-17  
**Nächste Review**: Nach Sprint 20 Completion  
**Owner**: GitHub Copilot Solo Implementation
