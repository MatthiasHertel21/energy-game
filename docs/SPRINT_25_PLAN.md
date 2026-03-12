# Sprint 25 Plan – Variable Bid Count Per Device

Date: 2026-03-12
Owner: TBD

Goals
- Ersetze das starre 3-Lot-Multi-Bid-Modell durch eine variable Angebotsanzahl je Device.
- Entferne den globalen Scenario-Schalter für Multi-Bid.
- Halte alte Szenarien und Forecasts mit minimalem Migrationsrisiko lauffähig.

Scope
- [TKT-370](tickets/TKT-370.md) — KSE Per-Device Bid Count Configuration
- [TKT-371](tickets/TKT-371.md) — Scenario And Forecast Compatibility For Variable Bid Counts
- [TKT-372](tickets/TKT-372.md) — Engine Generalization For Variable Bid Counts
- [TKT-373](tickets/TKT-373.md) — Player UI For Variable Bid Counts
- [TKT-374](tickets/TKT-374.md) — Regression Coverage For Variable Bid Counts

Product Cut
- V1 unterstützt `bid_count=0..5` pro Device.
- `0` bedeutet implizites Angebot ohne Preisfeld und ohne Bid Overview.
- `1` bedeutet genau ein explizites Preisfeld ohne Bid Overview.
- `2..5` bedeuten entsprechende Preisfelder plus gestapelten Bid Overview.
- Alte Szenarien mit `enable_multi_bid` bleiben lesbar und werden kompatibel interpretiert.

Out of Scope
- Frei benannte Lots jenseits von `A..E`
- Vollständige Persistenzmigration historischer Forecast-Daten in ein neues Array-Format
- Erweiterungen des Marktmodells über variable Lot-Anzahl hinaus
- UI-Redesign der Result-Seiten außerhalb bid-count-relevanter Korrekturen

Execution Order
1. KSE-Konfiguration auf `bid_count` umstellen und globalen Schalter entfernen
2. Kompatibilitätsschicht für alte Szenarien und Forecasts einziehen
3. Engine, Validation, Delta- und Settlement-Pfade auf dynamische Lots generalisieren
4. Player-UI auf variable Lot-Anzahl umbauen
5. Regressionen und Smoke-Cases für Mischszenarien absichern

Definition of Done
- Szenarien definieren pro Device eine Angebotsanzahl `0..5`.
- Der globale Scenario-Multi-Bid-Schalter ist entfernt.
- Backend und Engine verarbeiten variable Lot-Anzahl korrekt für Generatoren und Verbraucher.
- Player-UI zeigt für `0`, `1` und `2..5` die jeweils richtige Eingabelogik.
- Alte A/B/C-Szenarien bleiben ohne manuelle Nacharbeit funktionsfähig.
- Regressionstests decken die kritischen Pfade des Umbaus ab.

Sprint Breakdown

## Phase 1 — Configuration And Compatibility
- TKT-370
- TKT-371
- Ziel: neues Konfigurationsmodell festziehen, ohne Bestandsdaten zu brechen

## Phase 2 — Engine And UI Refactor
- TKT-372
- TKT-373
- Ziel: variable Lot-Anzahl fachlich und visuell vollständig unterstützen

## Phase 3 — Hardening
- TKT-374
- Ziel: Umbau gegen bekannte Regressions absichern

Risks
- Hohe Zahl hart codierter A/B/C-Annahmen in Backend und Frontend
- Regressionen in DA/ID-Baselines, Consumer-Dispatch und Dispatch-Akkumulation
- Mischlogik zwischen implizitem Modus (`0`) und explizitem Ein-Lot-Modus (`1`)

Recommended Delivery Strategy
- Feature nicht als kleinen Patch umsetzen, sondern als gezielten Refactor des Bid-Modells.
- Intern zunächst weiter mit Lots `A..E` arbeiten, um Persistenzrisiko gering zu halten.
- Erst nach stabiler Backend-Generaliserung die Player-UI final umstellen.