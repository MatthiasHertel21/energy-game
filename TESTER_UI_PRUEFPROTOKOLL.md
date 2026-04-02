# Tester UI Pruefprotokoll

## Ziel

Vollstaendige Live-Validierung des bestehenden Szenarios `Tester` ueber alle konfigurierten Player-Typen und alle Runden mit echter Nutzerdateneingabe im Player-Screen.

Geprueft werden pro Runde und im Scenario Result insbesondere:

- alle Top-Level-KPIs
- `hourly_breakdown`
- `device_hourly_breakdown` fuer jedes Geraet und jeden Detail-Eintrag
- `bid_dispatch`
- `da_id_breakdown`
- `round_history`
- kumulierte Final-Results
- Konsistenz zwischen Detail-, KPI- und Top-Level-Ebene

## Testumfang

- Szenario: `Tester`
- Scenario ID: `1`
- Runden: `4`
- Player-Typen: `3`
  - `Classic Provider`
  - `Municipal Consumer`
  - `PV Bat Player`

## Fachliche Pruefungen

Die Cypress-Spec validiert fachlich und rechnerisch unter anderem:

- Summenkonsistenz zwischen Device-, Hourly- und KPI-Ebene
- Profitformeln auf Device- und Hourly-Ebene
- DA/ID-Splitting fuer Mengen und Umsaetze
- Imbalance-Logik inklusive Network-Shortfall-Behandlung
- Grid-/ATC-Kosten und Alias-Konsistenz
- Batterie-KPIs inkl. SoC-, Charge- und Arbitrage-Werten
- Bid-Dispatch-Konsistenz inkl. Acceptance Ratio und SMP-Abgleich
- Final-Results gegen aufsummierte Round-Results
- numerische Gueltigkeit aller vorhandenen Detailfelder

## Zaehler gepruefter Werte

Anforderung des Tests: `>1000` fachlich und rechnerisch gepruefte Werte pro Voll-Lauf.

Ergebnis beider Live-Laeufe:

- Lauf `40a9fc58`: `10221` gepruefte Werte
- Lauf `d0637c27`: `10221` gepruefte Werte

Verteilung pro Lauf:

- Numeric checks: `2976`
- Equality checks: `897`
- Bounds checks: `1`
- Existence checks: `35`
- Finiteness checks: `6312`

Verteilung pro Player und Runde:

- `Classic Provider`: `3285` Checks gesamt, `805` pro Runde, `65` Final-Result-Checks
- `Municipal Consumer`: `3285` Checks gesamt, `805` pro Runde, `65` Final-Result-Checks
- `PV Bat Player`: `3649` Checks gesamt, `896` pro Runde, `65` Final-Result-Checks

## Live-Ergebnis

- Reproduktionslauf 1: erfolgreich
  - frischer Seed-Tag: `40a9fc58`
  - Laufzeit: `14m 31s`
- Reproduktionslauf 2: erfolgreich
  - frischer Seed-Tag: `d0637c27`
  - Laufzeit: `13m 02s`

Beide Voll-Laeufe waren gruen mit `1 passing`, `0 failing`.

## Artefakte

- JSON-Report Lauf 1: `frontend/cypress/results/tester-ui-validation-40a9fc58.json`
- JSON-Report Lauf 2: `frontend/cypress/results/tester-ui-validation-d0637c27.json`
- Seed-Fixture des letzten Laufs: `frontend/cypress/fixtures/tester_ui_seed.json`
- Test-Spec: `frontend/cypress/e2e/tester-player-all-rounds.cy.js`
- Seed-Helper: `backend/scripts/seed_tester_ui_validation.py`