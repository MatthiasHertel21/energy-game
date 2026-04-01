# Monday UI Pruefprotokoll

Datum: 2026-04-01

## Ziel

Vollstaendige Live-Validierung des Scenarios `monday` ueber alle drei Playertypen und alle sechs Runden mit echten Eingaben im Player-Screen.

Geprueft wurden insbesondere:

- Mengen- und Preiseingaben im Player-UI
- Extremwerte wie `0` und Overbids
- Rundenergebnisse und Endergebnisse
- KPI-Konsistenz ueber Top-Level, Hourly Breakdown, Device Breakdown und DA/ID Breakdown

## Testaufbau

- Live-Stack via Docker Compose auf `http://localhost:18080`
- Seed-Helfer: `backend/scripts/seed_monday_ui_validation.py`
- Cypress-Spec: `frontend/cypress/e2e/monday-player-all-rounds.cy.js`
- Fixture fuer Seed-Daten: `frontend/cypress/fixtures/monday_ui_seed.json`

Ausgefuehrter Testlauf:

```bash
cd /home/ga/energy-game/frontend
CYPRESS_BASE_URL=http://localhost:18080 npx cypress run --spec cypress/e2e/monday-player-all-rounds.cy.js
```

Ergebnis des finalen Laufs:

- 1 Spec
- 1 Test
- 1 Passing
- 0 Failing
- Laufzeit: 11m25s

## Fachliche Findings

Vor den Fixes wurden folgende reale Inkonsistenzen gefunden:

1. Consumer-KPIs liefen nach ATC-/Shortfall-Anpassungen auseinander.
   Betroffen waren insbesondere `imbalance_mwh`, `imbalance_cost_zar`, `network_shortfall_mwh` und `acceptance_ratio`.

2. Die Endergebnis-Skalierung war nicht konsistent zur Rundenergebnis-Skalierung.
   `final-results` und `round_history.total_score` nutzten eine abweichende Normalisierung.

3. Spaetere Runden waren im Player-UI teils faelschlich nicht editierbar.
   Ursache war die Ableitung editierbarer Stunden aus einem veralteten `hour_status` statt aus dem effektiven Marktstatus.

## Umgesetzte Fixes

- Backend-Synchronisierung der Consumer-KPI-Aggregate nach Shortfall-/ATC-Logik
- Neuberechnung von `acceptance_ratio` nach Curtailement im Dispatch
- Vereinheitlichung der `total_score`-Normalisierung zwischen Rundenergebnis und Endergebnis
- Korrektur der Editierlogik im Player fuer spaetere Runden
- Stabile `data-cy`-Hooks fuer den echten UI-Flow
- Vollstaendiger Cypress-End-to-End-Test fuer alle Playertypen und Runden

## Validierter Umfang

Der finale grune Lauf validiert:

- Producer, Consumer und Prosumer/PV-Battery-Setup
- alle 6 Runden
- echte UI-Eingaben in editierbaren Runden
- API-Fallback nur fuer Runden, in denen das UI bewusst keinen Submit-Pfad anbietet
- KPI-Formeln und Summenbeziehungen fuer:
  - Hourly Breakdown
  - Device Breakdown
  - Bid Dispatch
  - DA/ID Breakdown
  - Round Results
  - Final Results

## Fazit

Die Monday-Validierung ist im aktuellen Stand erfolgreich abgeschlossen. Der End-to-End-Lauf ueber alle Playertypen und Runden ist gruen, und die waehrend des Live-Tests identifizierten fachlichen Inkonsistenzen sind im Code behoben.