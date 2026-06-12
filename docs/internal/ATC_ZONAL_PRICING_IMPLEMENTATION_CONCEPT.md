# Implementierungskonzept: Zonal Market Coupling mit ATC-bedingtem Pricing

> **QS-Status**: Version 4 (nach vollstaendiger Qualitaetssicherung gegen aktuellen Codestand und verbindlicher Produktentscheidung fuer eine vereinfachte V1)
>
> Gegenueber der Erstfassung wurden folgende wesentliche Korrekturen und Ergaenzungen vorgenommen:
> - Enum-Werte aller KSE-Parameter vollstaendig dokumentiert (inkl. der heute gesperrten Single-Value-Parameter)
> - Alias-Feldnamen `transmission_loss_pct`, `losses_pct` und `market.generator_mix.*.zone_distribution_pct` dokumentiert
> - Engpasserloes-Formel korrigiert: verlustbereinigte Berechnung mit `import_price * flow_received - export_price * flow_sent`
> - Separates Feld `losses_value_zar` eingefuehrt
> - Heutigen `congestion_revenue_zar`-Berechnungspfad (ueber `apply_grid()` -> `cong_signal`) praezise beschrieben
> - V1 auf ein einfaches zonales Merit-Order-Clearing mit ATC-Begrenzung festgelegt; kein LP-Solver in V1
> - V1 ohne Alt-Session-Kompatibilitaet festgelegt; Fokus liegt ausschliesslich auf neuen Sessions
> - V1-Zonenzuordnung festgelegt: jeder Player genau eine Zone, nur ueber `player_types[].zone`
> - Testmatrix auf Pflichtfaelle fuer das Lehrsystem verdichtet
> - Ergebnisfeld-Tabellen auf neue V1-Sessions vereinfacht
> - Detaillierter Umsetzungsplan in `docs/SPRINT_27_PLAN.md` ergaenzt

## Ziel

Dieses Dokument analysiert den bestehenden Codepfad fuer Marktpreisbildung, Netzrestriktionen und Ergebnisdarstellung und entwickelt ein Implementierungskonzept fuer **Zonal Market Coupling mit ATC**, bei dem

- weiterhin **ein einheitlicher Preis** gilt, solange keine Netzrestriktion bindet,
- aber **zonale Preise** entstehen, sobald mindestens eine relevante ATC-Nebenbedingung bindet,
- und **Engpasserloese separat** als Netz-/Marktergebnis ausgewiesen werden.

Wichtig: Dieses Dokument beschreibt **nur Analyse und Konzept**. Es enthaelt **keine Codeaenderungen**.

## Scope

Das Konzept beruecksichtigt:

- Backend-Clearing und Settlement
- KSE-Parameter und deren Kombinationen
- Szenarien mit 1 bis 5 Zonen
- ausreichende und beschraenkte Bandbreite
- Auswirkungen auf Playerscreen, Round Results, Scenario Results, Events und Overall Market View
- API- und Payload-Auswirkungen
- Migrations- und Teststrategie

Nicht im Scope dieser V1:

- DC/PTDF- oder AC-Power-Flow
- nodales Pricing
- Transmission Rights / FTR / explizite Grid-Operator-Spielrolle
- persistente DB-Schema-Aenderungen, sofern die vorhandenen JSON-Result-Container ausreichen
- stundenscharfe ATC-Werte (ATC gilt pro Runde einheitlich fuer alle Stunden)
- zonenspezifische Balancing-Preise (Balancing bleibt globaler Preis)
- neue Event-Typen fuer Leitungsausfaelle oder temporaere ATC-Reduktionen
- per-Link-Verlustmatrix (skalarer `losses_pct_per_link` gilt fuer alle Links)

## Bestehender Code: Ist-Zustand

### 1. Marktclearing ist heute global

Der zentrale Clearing-Mechanismus ist `clear_market(...)` in `backend/app/engine.py`. Er arbeitet mit **einer globalen Angebots- und Nachfragekurve** und liefert genau **einen Preis** (`smp`) und **ein Volumen** zurueck.

Relevanter Bestand:

- `backend/app/engine.py`: `clear_market(...)`
- `backend/app/engine.py`: `run_round(...)`
- `backend/app/player.py`: `MarketStructureAPI`, die fuer den Playerscreen ebenfalls global `clear_market(...)` verwendet

Konsequenz:

- Der Markt wird heute **nicht zonal** gecleart.
- Es gibt heute **keine zonalen Marktpreise**.

### 2. Netzrestriktionen werden heute nach dem Clearing angewendet

Die vorhandene Interzonenlogik liegt in `_compute_interzonal_round_outputs(...)` in `backend/app/engine.py`.

Sie verarbeitet nachgelagert:

- `grid.zones`
- `grid.atc`
- `grid.losses_pct_per_link`
- `grid.network_settlement.*`
- `grid.generator_curtailment_mode`
- `player_types[].zone` bzw. `general.player_zone`

Heutiges Verhalten:

- aus bereits geclearten Mengen werden Zonen-Surplus/Defizit abgeleitet,
- Fluesse werden ueber freie ATC-Kapazitaet geroutet,
- bei Defiziten entstehen `unserved_demand_mwh` und `extra_cost_total_zar`,
- bei Exportueberschuessen kann `grid_curtailed_mwh` entstehen,
- `link_results` enthalten `flow_mwh`, `atc_mwh`, `utilization_pct`, `losses_mwh`, `binding`.

Konsequenz:

- Das heutige Netzmodell ist **post-processing**, nicht Teil der Preisbildung.
- Es modelliert physische Machbarkeit und Extra-Kosten, aber **keine endogene zonale Preisbildung**.

### 3. Consumer-Shortfall-Settlement ist heute ein separater Nachbearbeitungspfad

`_apply_consumer_network_shortfalls(...)` in `backend/app/engine.py` reduziert oder stuetzt bereits konsumierte Mengen nach dem Clearing.

Heutige Logik:

- Defizite in einer Zone werden lot-basiert betrachtet.
- Wenn `price_bid >= balancing_up_price`, wird Nachfrage ueber Balancing gestuetzt.
- Sonst wird sie gekuerzt.
- Die resultierenden Kosten werden als `network_shortfall_cost_zar` bzw. `atc_dispatch_cost_zar` in KPIs gespiegelt.

Konsequenz:

- Die Netzknappheit wird heute **nicht ueber zonale Marktpreise** ausgedrueckt,
- sondern ueber **separate Redispatch-/Shortfall-Kosten**.

### 4. KSE unterstuetzt heute bereits wesentliche Netzparameter

Die KSE-Grid-Konfiguration in `frontend/src/pages/KSE.jsx` unterstuetzt heute bereits:

- `grid.zones` mit Range 1-5
- `grid.atc` als symmetrische Matrix
- `grid.losses_pct_per_link`
- `grid.network_settlement.extra_cost_mode`
- `grid.network_settlement.cost_allocation_target`
- `grid.network_settlement.shortfall_price_mode`
- `grid.network_settlement.shortfall_price_value`
- `grid.generator_curtailment_mode`
- `player_types[].zone`
- `general.player_zone` als Legacy-Fallback
- zonale Verteilungen in `environment.groups.*.zone_distribution_pct`
- zonale Verteilungen in `market.consumer_mix.*.zone_distribution_pct`

Konsequenz:

- Die Editor-Seite ist bereits deutlich weiter als das eigentliche Clearing.
- Ein Phase-2-Umbau kann auf einer vorhandenen Parametrisierung aufsetzen.

### 5. Die UI ist heute fuer Netzfolgen vorbereitet, aber nicht fuer echte zonale Preise

Bestehende Result-Surfaces:

- `frontend/src/pages/Player.jsx`
- `frontend/src/components/RoundResultsScreenSimple.jsx`
- `frontend/src/components/ScenarioResultsScreen.jsx`
- `frontend/src/components/MarketStructureChartPanel.jsx`
- `frontend/src/utils/marketOverview.js`

Heutige Datenlage:

- `RoundResultsScreenSimple` zeigt Zone-/Netzkontext und `link_results`.
- `ScenarioResultsScreen` und `marketOverview` aggregieren Zone-/Link-Daten in `market_summary.zone_breakdown`.
- `MarketStructureChartPanel` und `Player.jsx` beziehen sich aber auf eine globale `market-structure`-API mit genau einer Kurve und einem `smp`.

Konsequenz:

- Ergebnisansichten koennen zonale Informationen bereits teilweise aufnehmen.
- Der Playerscreen und der Merit-Order-/Overall-Market-View sind heute noch **global** gedacht.

## Zentrale fachliche Zielentscheidung

Die neue Preislogik soll wie folgt funktionieren:

1. **Einheitlicher Preis**, solange keine ATC-Nebenbedingung bindet.
2. **Zonale Preise nur dann**, wenn mindestens ein Link mit positiver Kapazitaet bindet und dadurch Marktsplitting entsteht.
3. Settlement erfolgt dann zum **lokalen Zonenpreis** der Einspeise- bzw. Entnahmezone.
4. Preisunterschiede zwischen Zonen werden als **Engpasserloese** (`congestion rent`) separat auf Link-Ebene ausgewiesen.

Damit bleibt das Spielverhalten in Standardfaellen stabil und erweitert sich nur dann, wenn Netzrestriktionen wirtschaftlich relevant werden.

## Zielbild: V1 Zonal Market Coupling mit ATC

### Architekturprinzip

Der Umbau soll nicht `global clearen -> danach zonale Korrektur` bleiben, sondern:

1. Bids je Zone bilden
2. Gekoppeltes zonales Clearing unter ATC-Nebenbedingungen loesen
3. Zonenpreise, Fluesse und Volumina aus dem Clearing ableiten
4. Settlement mit lokalen Zonenpreisen rechnen
5. Netz-/Marktergebnisse konsistent in `hourly_results`, `zone_results`, `link_results`, `market_summary` und UI spiegeln

### Nicht-Regressionsvertrag fuer 1-Zone und No-Split-Faelle

Fuer V1 gilt eine harte Nicht-Regressionsregel:

1. **`zones = 1`**
  - Der bestehende globale Pfad bleibt der **kanonische Ausfuehrungspfad**.
  - Es darf in diesem Fall **keine** Veraenderung an `smp`, `volume`, Revenue, Profit, KPI-Aufbau, Round Results, Scenario Results oder Player-Ansichten geben.
  - Umsetzungskonsequenz: Bei `grid.zones <= 1` wird **nicht** der neue zonale Clearing-Pfad verwendet, sondern weiterhin der bestehende `clear_market(...)`- und Settlement-Pfad.

2. **`zones > 1`, aber keine bindende Netzrestriktion / kein Preis-Split**
  - Die publizierten Marktwerte muessen sich fuer Spieler- und Ergebnislogik **so verhalten wie heute**.
  - Ein no-split-Mehrzonenfall ist fachlich ein Ein-Preis-Markt und darf keine veraenderten Spielerwerte erzeugen.
  - Umsetzungskonsequenz: Sobald `zonal_pricing_active = false`, werden die **veroeffentlichten** Werte aus einem globalen Referenz-Clearing kanonisiert.
  - Das bedeutet: `smp`, `volume`, Revenue, Profit, Summary-Werte und UI-Kennzahlen stammen im No-Split-Fall aus dem globalen Legacy-Clearing; zonale Zusatzdaten bleiben rein informativ.

3. **Was sich im No-Split-Fall dennoch aendern darf**
  - rein additive, optionale Datenfelder wie `zone_prices = [smp, smp, ...]`, `binding_link_count`, `congestion_rent_zar = 0` und informative Link-/Zonendaten zu `losses_mwh` bzw. `losses_value_zar`
  - positive `losses_mwh` bzw. `losses_value_zar` sind im No-Split-Fall zulaessig, solange sie rein informativ bleiben und keine bestehenden Markt-, KPI- oder Settlement-Werte ueberschreiben
  - rein informative Zonen-/Link-Abschnitte in API-Payloads, solange sie keine bestehenden Werte ueberschreiben

4. **Was sich im No-Split-Fall nicht aendern darf**
  - `smp`
  - `volume`
  - Producer-Revenue
  - Consumer-Procurement-Kosten
  - Player-Profit / Ranking
  - bestehende KPI-Felder
  - bestehende Texte/Ansichten, solange kein Split aktiv ist

Diese Regel ist bewusst strenger als "gleicher Preis". Nicht nur der Preis, sondern die **gesamte sichtbare Wirkung** muss fuer 1-Zone und No-Split-Faelle unveraendert bleiben.

### Fachliche Kerneffekte

#### Fall A: Keine bindende Restriktion

- alle Zonen koennen sich ueber das Netz frei ausgleichen
- `zone_price[z]` ist in allen Zonen gleich
- `system_price == zone_price[z]` fuer alle `z`
- kein Marktsplitting
- `congestion_rent_zar = 0`

#### Fall B: Mindestens eine bindende Restriktion

- die gekoppelte Loesung ergibt unterschiedliche Zonenpreise
- Exportzonen sind typischerweise guenstiger, Importzonen teurer
- Interzonenfluss bleibt auf ATC limitiert
- die Preisdifferenz erzeugt Engpasserloese

#### Fall C: Inselbildung / ATC = 0

- Zonen oder Zonen-Cluster koennen sich komplett voneinander entkoppeln
- jede zusammenhaengende Komponente wird preislich separat bestimmt
- falls innerhalb einer Zone/Komponente selbst kein Ausgleich moeglich ist, greift weiterhin Knappheitslogik

## Parameteranalyse: Bestehende KSE-Parameter und Zielverhalten

### Grid-Parameter

| Parameter | Heute gueltige Werte | Zielverhalten in zonalem ATC-Clearing |
|---|---|---|
| `grid.zones` | Integer 1–5 | Anzahl Marktzonen fuer das Clearing |
| `grid.atc[i][j]` | Float-Matrix, symmetrisch (i≠j), Diagonal = 0 | harte Nebenbedingung im Clearing zwischen Zonen |
| `grid.losses_pct_per_link` | Float, Skalar fuer **alle** Links gleich (Legacy-Aliases: `transmission_loss_pct`, `losses_pct`); Default 2 | in V1 als globaler Verlust-Faktor auf alle Link-Fluesse anwenden; **QS-Risiko**: skalarer Wert gilt fuer alle Links gleichermassen; bei stark unterschiedlichen Linklängen oder topologischen Asymmetrien in ≥3-Zonen-Topologien erzeugt das inkonsistente Preise |  
| `grid.generator_curtailment_mode` | `pro_rata` (Default), `reverse_merit_order`, `renewables_first`, `renewables_last` | alle 4 Varianten bleiben fuer Restcurtailment nach zonalem Clearing aktiv; Semantik aendert sich: nicht mehr primaeres Preisinstrument, sondern physische Restkuerzung bei Ueberschuss-/Inselszenarien |
| `grid.network_settlement.extra_cost_mode` | **Heute nur `zonal_only` valide** (KSE-Validierung akzeptiert nur diesen Wert) | fuer V1 ATC-Clearing weitgehend entwertet; bleibt als Legacy-Feld erhalten, sollte aber in Phase 2 als deprecated markiert werden |
| `grid.network_settlement.cost_allocation_target` | **Heute nur `consumers_only` valide** (KSE-Validierung locked) | fuer zonale Preisbildung nicht primaerer Pfad; bei echter zonalem Settlement tragen Verbraucher ihren Zonenpreis und Erzeuger ihren Zonenpreis automatisch; Feld bleibt Legacy |
| `grid.network_settlement.shortfall_price_mode` | `smp_multiplier` (Default), `fixed_price`, `value_of_lost_load` | relevant, wenn selbst nach zonalem Clearing Restknappheit in einer Zone verbleibt; alle 3 Varianten muessen weiterhin unterstuetzt werden |
| `grid.network_settlement.shortfall_price_value` | Float; fuer `fixed_price`/`value_of_lost_load`: ZAR/MWh; fuer `smp_multiplier`: Faktor | bleibt fuer Restknappheits-/VoLL-Faelle relevant |

### Rollen- und Lokationsparameter

| Parameter | Heutige Bedeutung | Zielverhalten |
|---|---|---|
| `player_types[].zone` | physische Zone des Spielertyps | verpflichtende Zuordnung fuer zonale Bids und Settlement-Zone in V1 |
| `general.player_zone` | bestehender Alt-Parameter ausserhalb des neuen Zielmodells | nicht Teil von V1; Mehrzonen-Szenarien werden ausschliesslich ueber `player_types[].zone` konfiguriert |
| `environment.groups.*.zone_distribution_pct` | prozentuale Verteilung der synthetischen Grundlasterzeuger pro Zone (Array, Laenge = zones) | bleibt relevant fuer synthetische Angebotskurven-Anteile pro Zone im gekoppelten Clearing |
| `market.generator_mix.*.zone_distribution_pct` | zonale Verteilung des marktbasierten Generator-Mix | wie `environment.groups.*`: muss in zonale Angebotsbuecher einfliessen |
| `market.consumer_mix.*.zone_distribution_pct` | prozentuale Verteilung synthetischer Nachfrage pro Zone | bleibt relevant fuer synthetische Nachfrage-Anteile pro Zone im Clearing |

### Markt- und Clearingparameter

| Parameter | Zielwirkung im Konzept | QS-Hinweis |
|---|---|---|
| `market.price_floor`, `market.price_cap` | weiterhin globale Preisgrenzen fuer alle zonalen Preise | zonale Preise duerfen price_floor und price_cap nicht ueberschreiten |
| `market.enable_player_bidding` | explizite oder implizite Bid-Erzeugung je Zone | bei `false` erzeugen Classic-Bids zonale Angebote; `zone_id` muss aus `player_types[].zone` abgeleitet werden |
| `mode` (`shared_market`, `isolated_per_player`) | gemeinsame Kapazitaetsskalierung eines Player-Types bleibt moeglich | in V1 nur zulaessig, wenn alle Spieler eines Player-Types derselben Zone zugeordnet sind; gemischte Zonen-Zuweisungen sind ein Validierungsfehler |
| `markets.dam.trading`, `markets.idm.trading` | zonale Preisbildung in aktivem Marktsegment; DAM und IDM koennen in derselben Runde unterschiedliche zonale Preise erzeugen | IDM-Deltas und DA-Kapazitaets-Carryover muessen pro Zone korrekt aufgebaut werden |
| `balancing.price_mode`, `balancing.up_price_zar_per_mwh`, `balancing.down_price_zar_per_mwh`, `balancing.up_price_smp_pct`, `balancing.down_price_smp_pct` | heute globale Balancing-Preise; Modus `absolute` oder `smp_multiplier` | **QS-Risiko**: wenn Balancing global bleibt, koennen in einer Inselzone mit hohem Zonenpreis Balancing-Kosten < Zonenpreis entstehen; bei `smp_multiplier` ist offen, ob der Multiplikator auf `system_price` oder lokalen `zone_price` angewendet wird. Empfehlung fuer V1: Balancing bleibt global und nutzt `system_price`; diese Entscheidung muss bewusst dokumentiert werden |
| `round_span_hours` | ATC-Matrix gilt heute fuer alle Stunden einer Runde gleichermassen | **QS-Risiko**: ATC ist ein Config-Wert, kein stundenscharfer Wert; in zukuenftigen Versionen koennte ATC stundenscharf variieren (z. B. Leitungswartung); fuer V1 gilt: eine ATC-Matrix gilt fuer alle Stunden einer Runde |

## Parameterkombinationen: Bewertung und Sollverhalten

### 1. `zones = 1`

Sollverhalten:

- zonales Clearing degeneriert zu heutigem Ein-Zonen-Markt
- `zone_results` enthalten genau eine Zone
- `link_results` leer
- `zone_price[1] == smp`
- keine Engpasserloese

Folge fuer Implementierung:

- schneller Bypass moeglich
- bestehendes Verhalten darf nicht regressieren

### 2. `zones > 1`, aber alle relevanten ATCs gross genug

Sollverhalten:

- gekoppelte zonale Loesung ergibt weiterhin einen gemeinsamen Preis
- `binding = false` fuer alle Links
- `congestion_rent_zar = 0`
- UI darf trotzdem Zonen und Fluesse anzeigen, aber Preis bleibt systemweit identisch

### 3. `zones = 2`, direkte Verbindung, begrenztes ATC

Sollverhalten:

- klassischer Marktsplitting-Fall
- bei nicht bindender Leitung ein Preis
- bei bindender Leitung zwei Preise
- `price_spread = zone_price_import - zone_price_export`
- verlustfrei: `congestion_rent_zar = price_spread * flow_mwh`; mit Verlusten: `congestion_rent_zar = import_price * flow_received_mwh - export_price * flow_sent_mwh`

### 4. `zones = 3..5`, mehrere direkte Verbindungen

Sollverhalten:

- Preise ergeben sich je Zone aus der gekoppelten Loesung
- mehrere bindende Leitungen gleichzeitig moeglich
- Teilbereiche koennen preislich gekoppelt bleiben, andere abweichen
- Engpasserloese je Link separat ausweisen

### 5. `zones = 3..5`, mehrstufige Pfade / Multi-Hop

Sollverhalten:

- Fluesse duerfen auch ueber mehrere Links laufen, soweit die vereinfachte ATC-Topologie das erlaubt
- Verluste je Link akkumulieren weiter
- Preise duerfen sich entlang eines Engpasskorridors staffeln

### 6. `ATC = 0` zwischen Teilnetzen

Sollverhalten:

- vollstaendige Inselbildung
- jede Insel ist ein eigener Markt fuer diese Stunde
- Restknappheit innerhalb einer Insel ueber Shortfall-/VoLL-Logik abwickeln

### 7. `market.enable_player_bidding = false` / `bid_count = 0`

Sollverhalten:

- implizite Classic-Bids bleiben erhalten
- sie werden jedoch zonal zugeordnet und in das zonale Coupling eingespeist
- keine Sonderbehandlung im Marktmodell, nur anderer Bid-Ursprung

### 8. DAM-only / IDM-only / DAM+IDM

Sollverhalten:

- zonale ATC-Preisbildung muss in allen aktiv gehandelten Marktphasen funktionieren
- DAM-only: zonale Preise in DA-Stunden
- IDM on: Preisbildung fuer ID-Deltas ebenfalls zonal
- bei deaktiviertem Marktsegment keine zonale Preisbildung fuer dieses Segment

### 9. Network Settlement Parameter in Kombination mit zonalem Pricing

Bewertung:

- `extra_cost_mode` und `cost_allocation_target` sind fuer Phase 1 gebaut und werden bei echter zonaler Preisbildung weitgehend entwertet
- `shortfall_price_mode/value` bleiben wichtig fuer den Fall, dass selbst nach zonalem Marktclearing Nachfrage in einer Zone unserved bleibt
- `generator_curtailment_mode` kann als Fallback fuer nicht-marktliche Restkuerzungen oder synthetische Ueberhaenge bestehen bleiben

Empfehlung:

- Phase 2 klar kennzeichnen: zonale Marktpreise ersetzen den Hauptteil der bisherigen `ATC/Redispatch Cost`-Logik
- Phase-1-Parameter nicht sofort entfernen, aber ihre Reichweite im UI textlich einschraenken

## Zielmodell fuer die Preisbildung

### Kernregel

Zonales Pricing wird **immer mitgerechnet**, aber **nur dann sichtbar/preiswirksam differenziert**, wenn mindestens eine Restriktion bindet.

Formal:

- falls keine ATC-Nebenbedingung bindet: `P_1 = P_2 = ... = P_n = SMP`
- falls mindestens eine ATC-Nebenbedingung bindet: zonale Preise duerfen auseinanderlaufen

### Settlement-Regel

- Produzenten werden zum Preis ihrer Einspeisezone verguetet
- Verbraucher zahlen den Preis ihrer Entnahmezone
- Preisunterschiede zwischen Zonen werden nicht Spielern direkt zugeschlagen, sondern als **Engpasserloes des Netzes** ausgewiesen

### Engpasserloes

Pro Link und Stunde muss der Engpasserloes Verluste beruecksichtigen:

```
flow_sent_mwh    = physischer Fluss aus der Exportzone
flow_received_mwh = flow_sent_mwh * (1 - losses_pct_per_link / 100)
congestion_rent_zar = import_zone_price * flow_received_mwh - export_zone_price * flow_sent_mwh
```

Der Term ergibt sich aus dem Wertunterschied zwischen der bezahlten Entnahme in der Importzone und der vergueteten Einspeisung in der Exportzone. Bei verlustfreiem Netz vereinfacht sich das zu:

```
congestion_rent_zar = (import_zone_price - export_zone_price) * flow_mwh
```

**QS-Hinweis**: Die Formel `max(0, to_zone_price - from_zone_price) * flow_mwh` in der urspruenglichen Version war fehlerhaft: sie unterdrueckt negative Rents durch `max(0,...)`, was bei Rueckfluss oder Verlusttermen zu Fehlern fuehrt. Die korrekte Formel ist richtungsabhaengig und muss mit dem tatsaechlichen Flusssinn verrechnet werden.

**QS-Hinweis**: Die Verlustkomponente erzeugt einen Residualterm (`losses_value = import_zone_price * (flow_sent - flow_received) = import_zone_price * flow_sent * losses_pct/100`), der dem Netz als Verlustkosten zugerechnet wird. Dieser Verlustterm ist kein Engpasserloes, sondern eine physische Leitungsbelastung und sollte separat in `link_results` als `losses_value_zar` ausgewiesen werden. Bei 500 MWh Export, 2 % Verlusten, Exportpreis 500 und Importpreis 700 ergibt sich z. B.: Brutto-Spread-Effekt = `(700 - 500) * 500 = 100000`, Verlustwert = `700 * 10 = 7000`, Netto-Engpasserloes = `700 * 490 - 500 * 500 = 93000`.

**QS-Hinweis: No-Split-Berichtskanon**: Wenn kein Preis-Split vorliegt, wird `congestion_rent_zar` in der Ergebnisdarstellung kanonisch als `0` gefuehrt. Eventuelle Leitungsverluste duerfen in diesem Fall weiterhin separat als `losses_value_zar` ausgewiesen werden, bleiben aber rein informativ und wirken nicht auf kanonische Legacy-Werte.

## Zielarchitektur Backend

### A. Neue Clearing-Schicht

Es wird eine neue Funktion empfohlen, z. B.:

- `clear_market_coupled_atc(...)`

Die V1 soll **bewusst nicht** als LP-basiertes Optimierungsproblem umgesetzt werden. Fuer ein Lehrsystem ist ein einfaches, deterministisches zonales Merit-Order-Clearing mit ATC-Begrenzung die praktikablere und besser erklaerbare Variante.

Vorgeschlagenes Verfahren fuer V1:

1. je Zone lokale Angebots- und Nachfragebuecher aufbauen
2. je Zone ein lokales Ausgangsgleichgewicht bestimmen
3. Handel zwischen guenstigen Exportzonen und teureren Importzonen iterativ zulassen, solange Preisdifferenz > 0 und freie ATC besteht
4. nach jedem Handel Mengen und Grenzpreise der betroffenen Zonen aktualisieren
5. finale `zone_prices`, Nettofluesse und Restknappheit aus dem deterministischen Ergebnis ableiten

Ziel ist nicht die moeglichst exakte Abbildung eines realen Marktcouplings, sondern eine robuste, nachvollziehbare Preislogik fuer 1 bis 5 Zonen.

Eingaben:

- Supply-Bids je Zone (mit `zone_id`, `player_id`, `device_id`, `price`, `quantity`, `bid_label`, `source` = `player` / `synthetic`)
- Demand-Bids je Zone (analog)
- `atc` (2D-Matrix)
- `losses_pct_per_link` (heute Skalar, fuer alle Links gleich)
- Preisgrenzen `price_floor`, `price_cap`
- Marktmodus-Flag (DAM / IDM / beide)

Ausgaben pro Stunde:

- `system_price` (gemeinsamer Preis wenn kein Split)
- `zone_prices` (Array, Laenge = zones)
- `zonal_pricing_active` (Boolean)
- `zone_supply_volume_mwh` (Array)
- `zone_demand_volume_mwh` (Array)
- `zone_net_position_mwh` (Array; positiv = Nettoexport)
- `interzonal_flows` (Dict von Link-Tuples zu `flow_mwh`, `flow_received_mwh`, `losses_mwh`)
- `binding_links` (Liste von (from_zone, to_zone)-Tuples)
- `congestion_rents` (Dict von Link-Tuples zu `congestion_rent_zar`, `losses_value_zar`)
- `residual_unserved_demand_by_zone` (Array; 0 wenn zonal vollstaendig gecleart)

**QS-Hinweis: Tie-Breaking in der zonalen Loesung**: Das heutige `clear_market()` loest Tie-Bids pro-rata innerhalb des globalen Gleichgewichts. Im zonalen Modell wird fuer V1 dasselbe Prinzip je Zone beibehalten: Tie-Bids werden innerhalb der betroffenen Zone pro-rata behandelt.

### B. Integration in `run_round(...)`

Heute:

- Hourly-Bids werden global gebaut via `build_supply_from_bids(...)` und `build_demand_from_bids(...)` ohne `zone_id`
- `clear_market(...)` liefert globalen Preis
- `_compute_interzonal_round_outputs(...)` analysiert danach nur physisch
- `apply_grid(volume, atc, ...)` liefert `cong_signal` als einfaches Verhaeltnis `curtailment_needed / volume` – dieser Wert ist **nicht** ein echter zonaler Preissignal, sondern ein vereinfachtes Curtailment-Ratio
- `track_bid_dispatch(...)` und `track_demand_dispatch(...)` kennen heute keine `zone_id`

Ziel:

1. `build_supply_from_bids(...)` und `build_demand_from_bids(...)` um `zone_id`-Feld in jedem Bid erweitern (abgeleitet ausschliesslich aus `player_types[player_id].zone`)
2. pro Stunde und Zone zonale Angebots-/Nachfragebuecher erzeugen
3. `clear_market_coupled_atc(...)` statt `clear_market(...)` aufrufen
4. `track_bid_dispatch(...)` muss den lokalen `zone_price` statt globalem `smp` verwenden, um Dispatch-Revenue korrekt zu berechnen
5. Dispatch-Tracking, KPI-Aufbau und Revenue-Berechnung auf zonale Preise umstellen
6. `_compute_interzonal_round_outputs(...)` stark verschlanken: Zonen-Surplus/Defizit-Rechnung entfaellt, da aus Clearing direkt `zone_net_position_mwh` kommt
7. `apply_grid(...)` nur noch fuer bestehende Phase-1-Netzsignale ausserhalb der zonalen Preisbildung oder fuer Restcurtailment verwenden

Praezisierung fuer V1-Nicht-Regressionsfaelle:

8. bei `grid.zones <= 1` den bestehenden globalen Pfad unveraendert weiterverwenden
9. bei `grid.zones > 1` den zonalen Pfad rechnen, aber bei `zonal_pricing_active = false` die veroeffentlichten Ergebniswerte gegen ein globales Referenz-Clearing kanonisieren
10. nur wenn `zonal_pricing_active = true` oder Restknappheit vorliegt, duerfen zonale Werte Settlement und sichtbare Ergebnisse veraendern

**QS-Hinweis: `congestion_revenue_zar` heutiger Berechnungspfad**: Heute wird `cong_signal` in `apply_grid()` als `min(1.0, curtailment_needed / max(1.0, volume))` berechnet und dann in `run_round()` als `dispatched * price * cong_signal` verwendet, um `congestion_revenue_zar` je Player zu ermitteln. Das ist ein heuristisches Surrogate, kein echter Engpasserloes. In Phase 2 muss dieser Berechnungspfad ersetzt werden durch den linkbasierten `congestion_rent_zar`.

**QS-Hinweis: Storage/Batteriegeraete**: `build_supply_from_bids(...)` behandelt Batterie-Entladung als Supply, `build_demand_from_bids(...)` behandelt Batterie-Ladung als Demand. Zone-ID fuer Speicher muss ebenfalls aus `player_types[].zone` kommen; Lade- und Entladeseite eines Speichers liegen zwingend in derselben Zone.

**QS-Hinweis: IDM-Deltaposition und DA-Kapazitaets-Carryover**: Heute werden `da_dispatched_mwh` je Device als Kapazitaetsreservierung in die ID-Clearing-Phase uebertragen. In einem zonalen Modell muss `da_dispatched_mwh` ebenfalls zonal zugeordnet bleiben, damit ID-Kapazitaetspruefungen korrekt je Zone erfolgen.

### C. Umgang mit bestehender Phase-1-Netzlogik

Empfehlung:

- `compute_zone_flows(...)`, `apply_grid(...)` und `_compute_interzonal_round_outputs(...)` nicht sofort loeschen
- neue zonale Clearing-Ergebnisse als primaere Quelle verwenden
- bestehende Phase-1-Netzlogik nur noch fuer informative Netzsicht und Restknappheit nach zonalem Clearing einsetzen
- keine zweite konkurrierende Preislogik parallel zum zonalen Clearing beibehalten

## Ziel-Payloads

### 1. `hourly_results`

Heute global:

- `smp`
- `volume`

Zielerweiterung:

```json
{
  "hour_idx": 12,
  "smp": 650.0,
  "volume": 1800.0,
  "zonal_pricing_active": true,
  "zone_prices": [500.0, 700.0, 700.0],
  "zone_cleared_supply_mwh": [900.0, 400.0, 500.0],
  "zone_cleared_demand_mwh": [300.0, 700.0, 800.0],
  "binding_link_count": 1,
  "total_congestion_rent_zar": 120000.0
}
```

### 2. `zone_results`

Heutige Struktur enthaelt bereits viele passende Felder. Zielerweiterungen:

- `zone_price_zar_per_mwh`
- `market_split_active`
- `net_position_mwh`
- `price_source` (`uniform`, `zonal_split`, `islanded`, `shortfall_separate`)

### 3. `link_results`

Heutige Felder:

- `from_zone`, `to_zone`, `atc_mwh`, `flow_mwh`, `utilization_pct`, `losses_mwh`, `binding`

Zielerweiterung:

```json
{
  "from_zone": 1,
  "to_zone": 2,
  "atc_mwh": 500.0,
  "flow_mwh": 500.0,
  "flow_received_mwh": 490.0,
  "utilization_pct": 100.0,
  "losses_mwh": 10.0,
  "binding": true,
  "from_zone_price_zar_per_mwh": 500.0,
  "to_zone_price_zar_per_mwh": 700.0,
  "price_spread_zar_per_mwh": 200.0,
  "congestion_rent_zar": 93000.0,
  "losses_value_zar": 7000.0
}
```

**QS-Hinweis: Feldberechnung**:
- `congestion_rent_zar = to_zone_price * flow_received_mwh - from_zone_price * flow_mwh` fuer Split-Faelle; bei `zonal_pricing_active = false` wird der Feldwert kanonisch als `0` berichtet
- `losses_value_zar = to_zone_price * losses_mwh`
- `gross_spread_value_zar = price_spread_zar_per_mwh * flow_mwh`
- bei positivem Fluss von Export- zu Importzone und aktivem Preis-Split gilt: `gross_spread_value_zar = congestion_rent_zar + losses_value_zar`

### 4. `player_zone_info_by_player`

Empfohlene Erweiterungen:

- `zone_price_zar_per_mwh`
- `player_zone_split_active`
- `connected_binding_links`
- `zone_market_split_reason`

### 5. `market_summary`

`backend/app/sessions.py` baut bereits `price_stats` und `zone_breakdown`.

Zielerweiterungen fuer Replay/Final/Overview:

- `uniform_price_share_pct`
- `zonal_split_rounds_count`
- `total_congestion_rent_zar`
- `avg_zone_prices`
- `max_price_spread_zar_per_mwh`

## Auswirkungen auf KPIs und Settlement

### Producer KPIs

Heute:

- Revenue wird global ueber `smp` bzw. DA/ID-Basis berechnet
- `congestion_revenue_zar` wird heuristisch berechnet als `dispatched * price * cong_signal`, wobei `cong_signal = min(1.0, curtailment_needed / max(1.0, volume))` aus `apply_grid()` stammt – dies ist ein vereinfachtes Post-Clearing-Signal, kein echter Engpasserloes

Ziel:

- jede Einspeisung wird mit dem Preis der Einspeisezone bewertet
- `revenue_zar` und `profit_zar` muessen damit zonal konsistent werden
- `congestion_revenue_zar` muss abgeloest werden: der Begriff ist irrefuehrend, da er heute eine Curtailment-Kompensation beschreibt, nicht einen echten Erloes aus Preisdifferenzen

Empfehlung:

- `congestion_revenue_zar` im zonalen Pfad nicht als Preis- oder Rentenkomponente weiterverwenden
- echter Netz-Engpasserloes (`congestion_rent_zar`) nur auf Link-/Marktebene fuehren, **nicht** in Spieler-KPIs einfliessen lassen
- beim Umbau sicherstellen, dass die bestehende `_check('congestion_revenue_zar', ...)` Konsistenzpruefung im Engine-Code entsprechend angepasst oder entfernt wird

### Consumer KPIs

Ziel:

- Procurement zum Preis der Entnahmezone
- `atc_dispatch_cost_zar` nicht mehr als primaere Folge von Preisunterschieden
- `network_shortfall_cost_zar` nur noch fuer Restknappheit oder Balancing-Stuetzung jenseits des zonalen Marktpreises

### Shortfall-/VoLL-Faelle

Wenn selbst zonal kein vollstaendiger Ausgleich moeglich ist:

- `shortfall_price_mode` und `shortfall_price_value` bleiben aktiv; alle drei Varianten (`fixed_price`, `smp_multiplier`, `value_of_lost_load`) muessen unterstuetzt werden
- daraus folgt eine separate Knappheitskostenbehandlung zusaetzlich zum zonalen Marktpreis
- der Shortfall-Preis ersetzt in V1 **nicht** den normalen Marktpreis der Zone
- `_apply_consumer_network_shortfalls(...)` muss fuer `smp_multiplier` den `system_price` als Basispreis verwenden und den Aufschlag nur auf die Residualknappheit anwenden
- diese Faelle muessen im UI klar als `Restknappheit nach zonalem Clearing` markiert werden

**QS-Hinweis: Balancing-Grenzfall**: Wenn `balancing_up_price < zone_price` einer Importzone, wuerden Verbraucher in dieser Zone lieber Balancing-Support beziehen als den hohen Zonenmarktpreis zahlen. Das ist wirtschaftlich inkonsistent. Empfehlung fuer V1: Balancing-Preis bleibt systemweit global und wird nur auf Restknappheit angewendet, die nach zonalem Clearing noch besteht. Explizit dokumentieren, dass `balancing_up_price` heute nicht zonenspezifisch ist.

## Auswirkungen auf KSE

### Was bleibt bestehen

- Zonenanzahl 1-5
- ATC-Matrix
- Verluste pro Link
- Player-Type-Zones
- zonale Verteilung von Generator- und Consumer-Mix

### Was textlich/funktional angepasst werden muss

1. **Grid-Tab Erklaerungen**

Heute wird mehrfach auf "Phase 1" und globales SMP + nachgelagerte Engpasskosten verwiesen. Diese Texte muessen fuer Phase 2 angepasst werden.

2. **Network Settlement Controls**

Die Controls bleiben zunaechst sichtbar, aber mit klarer Semantik:

- zonale Preisbildung ist primaer
- `shortfall_price_*` gilt nur bei Restknappheit; Tooltip-Text in `KSE.jsx` muss entsprechend aktualisiert werden
- `extra_cost_mode` ist heute auf den einzelnen Wert `zonal_only` beschraenkt; in Phase 2 koennte `system_wide` als weiterer Enum-Wert hinzukommen, der Engpasserloese systemweit verteilt statt zonal isoliert
- `cost_allocation_target` ist heute auf `consumers_only` beschraenkt; in Phase 2 waere `producers_and_consumers` denkbar (symmetrisches Settlement)

3. **Preview-Hinweise im KSE**

Der bestehende Transfer-Preview in `KSE.jsx` sollte spaeter um Hinweise erweitert werden:

- "einheitlicher Preis erwartbar" (wenn alle ATCs hoch genug)
- "moegliches Marktsplitting bei dieser ATC-Konfiguration" (wenn ATCs eng gesetzt)
- "potenzielle Inselbildung" (wenn ATC = 0 zwischen einzelnen Zonen)

4. **`losses_pct_per_link` im KSE**

Der bestehende skalare Verlustwert gilt fuer alle Links gleichermassen. Im KSE koennte langfristig eine per-Link-Verlustmatrix einfuehrt werden (analog zur ATC-Matrix). Fuer V1 ist der skalare Wert ausreichend, aber die KSE-Beschriftung sollte darauf hinweisen, dass der Wert auf alle Links gleichermassen angewendet wird.

## Auswirkungen auf UI

### 1. Playerscreen

Betroffene Stellen:

- `frontend/src/pages/Player.jsx`
- `frontend/src/components/MarketStructureChartPanel.jsx`
- `backend/app/player.py` `MarketStructureAPI`

Heutiger Zustand:

- ein globaler Merit-Order-Chart mit `supply`, `demand`, `smp`, `volume`
- `MarketStructureAPI` (`/api/player/market-structure/<session_id>/<round_num>/<hour>`) liefert exakt diese vier Felder, kein zonales Ergebnis

Ziel:

- `MarketStructureAPI` muss erweitertes Payload liefern, z. B.:

```json
{
  "supply": [...],
  "demand": [...],
  "smp": 600.0,
  "volume": 1800.0,
  "zonal_pricing_active": true,
  "zones": [
    { "zone_id": 1, "supply": [...], "demand": [...], "zone_price": 500.0, "zone_volume": 900.0 },
    { "zone_id": 2, "supply": [...], "demand": [...], "zone_price": 700.0, "zone_volume": 900.0 }
  ],
  "market_source": "submitted_market"
}
```

- Umschaltbar oder standardmaessig zonal:
  - Systemweit
  - je Zone (Zonenauswahl sichtbar wenn `zonal_pricing_active = true`)
- Anzeige von:
  - lokalem Zonenpreis
  - Systempreis
  - Spread zur Referenzzone oder zum Systempreis
  - Interzonenfluesse und Binding-Status

Empfohlene UX:

- wenn `zonal_pricing_active = false`: heutige globale Darstellung beibehalten (keine UI-Regression)
- wenn `zonal_pricing_active = true`: Zonenwahl-Tab oder Overlay moeglich machen

**QS-Hinweis**: `MarketStructureAPI` wird auch im Vorzeigemodus (vor Abgabe von Bids) als Preview verwendet. In diesem Fall sind zonale Supply-/Demand-Kurven synthetisch aus `zone_distribution_pct` abzuleiten. Das ist bei `market_source = "synthetic_preview"` explizit zu kennzeichnen.

### 2. Round Results

Betroffene Stelle:

- `frontend/src/components/RoundResultsScreenSimple.jsx`

Ziel:

- KPI-Erlaeuterungen muessen zonalen Preis referenzieren, nicht nur globalen `smp`
- zusaetzliche Felder/Notizen:
  - `zonal_pricing_active`
  - `your_zone_price`
  - `system_price`
  - `price_spread`
  - `binding_links`
  - `total_congestion_rent_zar`

- Link-/Zone-Block ausbauen um:
  - Zonenpreis
  - Import-/Export-Status
  - Binding-Links mit Spread
  - separaten Engpasserloes

### 3. Scenario Results

Betroffene Stelle:

- `frontend/src/components/ScenarioResultsScreen.jsx`

Ziel:

- in `market_summary.zone_breakdown` zusaetzlich aggregierte Preisindikatoren anzeigen
- Szenarioabschluss soll beantworten koennen:
  - in wie vielen Runden gab es Marktsplitting?
  - welche Zone war im Schnitt teuer/guenstig?
  - wie hoch waren kumulierte Engpasserloese?

### 4. Scenario Results / Market Summary / Overall Market View

Betroffene Stellen:

- `frontend/src/utils/marketOverview.js`
- `RoundResultsScreenSimple` Market Overview Dialog
- `ScenarioResultsScreen` Market Overview Dialog

Ziel:

- `buildPriceCard(...)` nicht nur global min/max/avg, sondern optional auch:
  - max zonaler Spread
  - Zahl der Stunden mit Marktsplitting
- `buildZoneSection(...)` erweitern um:
  - avg zone price
  - max zone price
  - total congestion rent attributable to connected links

### 5. Events

Betroffene Stellen:

- `frontend/src/pages/KSE.jsx`
- Event-Auswertung in Engine
- Ergebnisdarstellungen in Round Results / Scenario Results

Anforderung:

- Events duerfen zonales Pricing beeinflussen, wenn sie
  - zonenspezifische Nachfrage aendern,
  - zonenspezifische Erzeugung reduzieren,
  - Verfuegbarkeit einzelner zonaler Player/Geraete veraendern,
  - oder kuenftig explizit Leitungen/ATC beeinflussen.

Empfehlung:

- im Konzept fuer V1 keine neuen Event-Typen erzwingen,
- aber Event-Impact in UI ergaenzen:
  - "Event caused market splitting"
  - "Event intensified price spread"

## Szenariomatrix

### Szenario 1: Ein-Zonen-Fall

- `zones = 1`
- keine Links
- keine Preisaufspaltung
- `zone_prices = [smp]`, `zonal_pricing_active = false`
- muss 100% kompatibel zum heutigen Verhalten bleiben
- Testmass: alle heutigen Regressionstests duerfen nicht brechen

### Szenario 2: Zwei Zonen, hohe ATC (kein Split)

- ATC > maximaler moeglicher Nettofluss zwischen Zonen
- Ergebnis: gleicher Preis `zone_prices = [p, p]`, `zonal_pricing_active = false`
- sichtbarer Flow moeglich, aber kein Preisunterschied
- `binding = false` auf allen Links
- `congestion_rent_zar = 0`

### Szenario 3: Zwei Zonen, bindender Link

- klassischer Import-/Export-Fall
- Ergebnis: `zone_prices = [p_export, p_import]` mit `p_export < p_import`
- `zonal_pricing_active = true`
- positive Engpasserloese
- zentraler Referenzfall fuer V1-Backend-Test

### Szenario 4: Zwei Zonen mit Verlusten und bindendem Link

- wie Szenario 3, aber `losses_pct_per_link > 0`
- `flow_received_mwh < flow_sent_mwh`
- `congestion_rent_zar` und `losses_value_zar` separat
- Energiebilanz muss aufgehen: `zone1_demand + losses + flow_to_z2 <= zone1_supply + flow_from_z2`

### Szenario 5: Drei bis fuenf Zonen, nur eine Problemzone

- eine Zone importabhaengig und unterversorgt
- andere Zonen bleiben preislich teilweise gekoppelt
- Ergebnis: nicht alle Preise gleich; betroffene Zone hat hoehere Preis
- UI muss partielle Marktsplitting-Faelle sichtbar machen

### Szenario 6: Drei bis fuenf Zonen, mehrere bindende Links

- mehrere Preisniveaus gleichzeitig moeglich
- mehrere Link-Rents parallel
- Dreieck-Topologie moeglich (Zone A - B - C - A): Preise muessen arbitragefrei sein
- hoechste fachliche Komplexitaet innerhalb von V1

### Szenario 7: Mehrere Zonen mit Inselbildung (ATC = 0)

- durch Null-ATC entstehen getrennte Teilmaerkte
- jede Insel erhaelt eigenen Preis
- `binding = true` implizit durch vollstaendigen Kapazitaetsmangel
- Restknappheit wird ueber Shortfall-/VoLL-Regeln behandelt

### Szenario 8: `shared_market` mit zwei Zonen

- Spieler desselben Types in unterschiedlichen Zonen
- Kapazitaetsskalierung via `_load_shared_market_capacity_scales()` ist typenbasiert, nicht zonenbasiert
- V1-Regel: diese Konfiguration ist unzulaessig
- Erwartung: die Validierung bricht Szenarien mit gemischten Zonen-Zuweisungen innerhalb desselben Player-Types frueh ab

### Szenario 9: Storage-/Batteriegeraete in Exportzone

- Batterie-Entladung (Supply) in der guenstigen Exportzone kann Engpassfluss erhoehen
- Batterie-Ladung (Demand) in der teuren Importzone entlastet den Import
- korrekte zonale Zuordnung von Lade- und Entladeseite ist Voraussetzung

### Szenario 10: Restknappheit nach zonalem Clearing

- eine Zone hat nicht genug Erzeugung und ATC ist ausgeschoepft
- `shortfall_price_mode = value_of_lost_load` mit hohem VoLL
- Marktpreis der Zone bleibt der normale zonale Clearing-Preis
- Shortfall-Kosten werden zusaetzlich ausgewiesen
- UI muss diesen Extremfall klar als Knappheitssignal anzeigen

## Implementierungsphasen

Die detaillierte Umsetzungsplanung fuer V1 steht in `docs/SPRINT_27_PLAN.md`. Im Konzept bleiben nur die fachlichen Hauptphasen festgehalten.

### Phase A: Konfiguration und Validierung

- `player_types[].zone` in Mehrzonen-Szenarien verpflichtend machen
- `general.player_zone` fuer V1 aus dem neuen Zonenpfad herausnehmen
- gemischte Zonen-Zuweisungen innerhalb desselben Player-Types als Validierungsfehler behandeln
- KSE-Texte und Defaults auf das neue V1-Modell anpassen

### Phase B: Backend-Clearing und Settlement

- deterministisches zonales Merit-Order-Clearing mit ATC-Begrenzung einfuehren
- Bids und Dispatch-Daten um `zone_id` und `zone_price` erweitern
- Settlement fuer Split-Faelle auf lokalen `zone_price` umstellen
- No-Split-Faelle ueber globales Referenz-Clearing kanonisieren (gehoert zur Engine, nicht zur API-Schicht)
- `_compute_interzonal_round_outputs(...)` verschlanken; Zonen-Surplus/Defizit-Rechnung entfaellt
- `apply_grid(...)` im zonalen Pfad nur noch fuer Restcurtailment ausserhalb der Preisbildung verwenden
- Restknappheit als separaten Shortfall-Pfad behandeln

### Phase C: APIs und Aggregation

- `round-results`, `final-results`, `replay` und `market-structure` fuer neue zonale Felder erweitern
- `market_summary`, `zone_results` und `link_results` um Preis-, Spread- und Verlustdaten ergaenzen

### Phase D: UI, Hardening und Rollout

- UI bei `zones = 1` und No-Split fachlich unveraendert lassen
- zonale Preis- und Link-Infos nur in echten Split-Faellen anzeigen
- Golden Cases fuer `zones = 1`, No-Split und Split-Faelle absichern
- Rollout ueber das Scenario-Flag `general.zonal_pricing_v1_enabled` vorbereiten (Default `false`; aktiv nur bei `grid.zones > 1`)

## Kompatibilitaet im Bestand

### Harte Anforderungen

1. Ein-Zonen-Szenarien muessen sich exakt wie heute verhalten.
2. Mehrzonen-Szenarien ohne Preis-Split muessen sich fuer Spieler, KPI und UI exakt wie ein Ein-Preis-Markt verhalten.
3. Nur neue V1-Sessions sind im Scope; Alt-Sessions werden nicht beruecksichtigt.
4. Sichtbare Aenderungen sind nur bei echtem Preis-Split oder bei echter Restknappheit zulaessig.

### Strategie

- der bestehende globale Clearing-Pfad bleibt fuer `zones <= 1` kanonisch
- im Mehrzonen-No-Split-Fall werden sichtbare Werte aus einem globalen Referenz-Clearing kanonisiert
- neue Zonen- und Linkdaten bleiben in No-Split-Faellen rein informativ
- die bestehende Phase-1-Netzlogik bleibt nur fuer Restknappheit und Netzsicht erhalten

## Testmatrix

### Backend-Pflichttests

1. `zones=1`
  - genau ein Preis, keine preiswirksamen Link-Effekte, `zonal_pricing_active = false`
  - `smp`, `volume`, Revenue, Procurement, Profit, Ranking und KPI-Felder sind exakt gleich zum heutigen Verhalten

2. `zones=2`, hohe ATC, kein Preis-Split
  - `zone_prices = [p, p]`, Fluesse sind erlaubt, `zonal_pricing_active = false`
  - alle sichtbaren Markt- und Spielerwerte bleiben exakt wie im heutigen globalen Pfad

3. `zones=2`, bindende ATC
  - Exportzone billiger, Importzone teurer, `zonal_pricing_active = true`
  - Settlement erfolgt mit lokalem `zone_price`

4. `zones=2`, bindende ATC plus Verluste
  - `losses_mwh > 0` und `losses_value_zar > 0`
  - Verluste allein erzeugen keinen eigenen Preis-Split

5. `zones=2`, Restknappheit in einer Zone
  - nach zonalem Handel bleibt `network_shortfall_mwh > 0`
  - Shortfall wird separat als Knappheitskosten ausgewiesen
  - der normale Marktpreis der Zone wird nicht durch VoLL ersetzt

6. Multi-Zone-Validierung
  - jeder Player ist genau einer Zone zugeordnet
  - fehlende oder gemischte Zonenzuordnungen sind Validierungsfehler
  - `general.player_zone` wird im V1-Pfad nicht verwendet

### API- und Ergebnis-Tests

7. No-Split-API
  - bei `zonal_pricing_active = false` bleiben bestehende Felder und Werte fachlich identisch zum heutigen Verhalten
  - neue Zonenfelder sind optional und rein informativ

8. Split-API
  - bei `zonal_pricing_active = true` enthalten Results `zone_prices`, zonale Fluesse, Link-Infos und getrennte Verlust-/Engpasswerte
  - Player- und Hourly-Ergebnisse verwenden den Preis der eigenen Zone

9. Ergebnis-Konsistenz
  - Detaildaten, KPI-Felder, Summary und Player-Ansichten benutzen dieselbe Preislogik
  - keine Mischung aus globalem `smp` und lokalem `zone_price` fuer dieselbe fachliche Zeile

### UI-Pflichttests

10. UI bei `zones=1`
   - keine sichtbare Regression gegen heute

11. UI bei No-Split-Mehrzonenfall
   - Standardansichten bleiben fachlich gleich zu heute
   - Zoneninfos duerfen sichtbar sein, aber keine bestehenden Werte veraendern

12. UI bei aktivem Preis-Split
   - lokale Zonenpreise werden klar angezeigt
   - Shortfall erscheint als separate Knappheits-/Balancing-Komponente, nicht als normaler Marktpreis

## Risiken

### 1. Doppelte Semantik bei Engpasskosten

Risiko:

- `atc_dispatch_cost_zar`: heutiger Consumer-Netzaufschlag bei Defizit
- `network_shortfall_cost_zar`: heutiger Consumer-Shortfall-Aufschlag
- `congestion_revenue_zar`: heutiger spielerbezogener Curtailment-Kompensations-Term (kein echter Engpasserloes)
- neuer `congestion_rent_zar`: echter link-basierter Netz-Engpasserloes aus Preisspreads
- neuer `losses_value_zar`: Verlustanteil je Link

Empfehlung:

- im zonalen Pfad strikt trennen zwischen Marktpreis, Restknappheitskosten, Engpasserloes und Verlustwert
- `congestion_revenue_zar` nicht als neuen Preis- oder Rententerm weiterverwenden
- `atc_dispatch_cost_zar` und `network_shortfall_cost_zar` nur noch fuer Restknappheit nutzen

### 2. Globale Market-Structure-API ist aktuell inkompatibel

Die heutige `MarketStructureAPI` liefert nur globale `supply`, `demand`, `smp`, `volume`.

Empfehlung:

- neue zonale Antwortform additiv einfuehren
- globalen Modus fuer `zonal_pricing_active = false` beibehalten
- Preview-Modus (`market_source=synthetic_preview`) aus `zone_distribution_pct` je Zone ableiten

### 3. Sessions-Aggregation muss erweitert werden

`backend/app/sessions.py` aggregiert heute `price_points`, `zone_breakdown` und `binding_links`, aber keine zonalen Preisverteilungen und keine Engpasserloese.

Empfehlung:

- `_build_zone_breakdown(...)` um zonale Preis- und Spread-Sichten erweitern
- `_build_price_stats(...)` um Split-Haeufigkeit und Spread-Werte erweitern
- nur neue V1-Sessions als Eingabe annehmen; Alt-Session-Fallbacks sind nicht Teil von V1

### 4. `losses_pct_per_link` ist ein skalarer Wert fuer alle Links

Risiko:

- bei 3-5 Zonen mit topologisch sehr unterschiedlichen Linklängen erzeugt ein einheitlicher Verlustsatz nur eine grobe Naeherung

Empfehlung:

- fuer V1 akzeptieren und explizit als vereinfachende Annahme dokumentieren
- Verluste nur als Mengenabschlag und Infofeld behandeln
- per-Link-Verlustmatrix fuer eine spaetere Ausbaustufe vormerken

### 5. `shared_market`-Kapazitaetsskalierung ist nicht zonal

Risiko:

- `_load_shared_market_capacity_scales()` skaliert je Player-Type, nicht je Zone

Empfehlung:

- V1 erlaubt `shared_market` nur bei eindeutiger Zonenzuordnung pro Player-Type
- gemischte Zonen-Zuweisungen im selben Player-Type werden frueh validiert und abgelehnt

### 6. Fehlende Event-Typen fuer ATC-Aenderungen

Risiko:

- das Netz selbst bleibt waehrend einer Session statisch

Empfehlung:

- fuer V1 keine neuen Event-Typen einfuehren
- `atc_reduction` oder `line_outage` als Phase-2-Erweiterung vormerken

## Getroffene Produktentscheidungen

Die QS-Empfehlungen wurden als verbindliche V1-Leitplanken uebernommen. Damit gelten fuer die Implementierung folgende Entscheidungen:

1. **V1 ist ein Lehrsystem**
  - Ziel ist eine einfache, nachvollziehbare Abbildung von Zonen, ATC und Preis-Splits.
  - V1 soll didaktisch klar und stabil sein, nicht moeglichst realmarktgenau.

2. **Keine Legacy-Zonenzuordnung**
  - `general.player_zone` wird in V1 nicht mehr verwendet.
  - In Mehrzonen-Szenarien ist `player_types[].zone` verpflichtend.
  - Jeder Player spielt genau in einer Grid Zone.

3. **Einfaches zonales Clearing statt LP**
  - V1 verwendet kein LP / keine Welfare-Maximization als primaeren Clearing-Ansatz.
  - V1 verwendet ein einfaches, deterministisches zonales Merit-Order-Clearing mit ATC-Begrenzung.

4. **Definition von `zonal_pricing_active`**
  - `zonal_pricing_active = true` nur wenn mindestens zwei Zonenpreise wirklich voneinander abweichen.
  - Als Toleranzgrenze gilt: Preisunterschied < 0,01 ZAR/MWh gilt als identisch (Floating-Point-Schutz). Der exakte Schwellwert ist in der Implementierung als benannte Konstante zu fuehren.
  - Physisch bindende Links werden separat ueber `binding_link_count` ausgewiesen.

5. **Verluste sind nur Hilfsgruesse**
  - Verluste werden als Mengenabschlag und als `losses_value_zar` ausgewiesen.
  - Verluste allein loesen in V1 keinen Preis-Split aus.

6. **Restknappheit bleibt separat**
  - Shortfall-/Scarcity-Kosten werden getrennt vom normalen Marktpreis ausgewiesen.
  - Der Shortfall-Preis ersetzt nicht den Zonenmarktpreis.
  - Bei `smp_multiplier` wird in V1 der `system_price` als Basis verwendet.

7. **Empfaenger der Engpasserloese**
  - `congestion_rent_zar` wird in V1 nur separat berichtet.
  - Keine Einrechnung in Player-Profit oder Ranking.

8. **ATC-Richtung und Asymmetrie**
  - V1 bleibt bei symmetrischer ATC.
  - Asymmetrische ATCs sind nicht Teil der V1.

9. **Event-Scope**
  - Events wirken in V1 nur indirekt ueber Erzeugung, Nachfrage und Verfuegbarkeit.
  - ATC-Events sind nicht Teil von V1.

10. **Nicht-Regressionsregel fuer No-Split-Faelle**
  - `zones = 1` bleibt auf dem bestehenden globalen Clearing-Pfad.
  - `zones > 1` ohne Preis-Split verwendet fuer sichtbare Marktwerte das globale Referenz-Clearing als kanonische Quelle.
  - Ziel ist nicht nur gleiche Preislogik, sondern gleiche sichtbare Werte und gleiches Verhalten.

11. **Alt-Sessions sind nicht Teil von V1**
  - V1 trifft keine Kompatibilitaetszusagen fuer bereits gespeicherte alte Sessions.
  - Neue Payload-Felder und neue API-Sichten gelten nur fuer neu erzeugte Sessions unter dem neuen Modell.

### Konzeptioneller Algorithmus

V1 verwendet einen einfachen, deterministischen Ablauf:

1. lokale Angebots- und Nachfragekurven je Zone bilden
2. lokales Ausgangsgleichgewicht je Zone bestimmen
3. Handel zwischen guenstigen Exportzonen und teureren Importzonen iterativ zulassen, solange **Preisdifferenz > 0** und freie ATC besteht
4. Verluste nur als Mengenabschlag auf dem Link beruecksichtigen
5. `system_price`, `zone_price`, Fluesse und Restknappheit aus dem finalen Ergebnis ableiten

Fuer V1 ist dafuer keine neue Optimierungsabhaengigkeit wie SciPy erforderlich.

## Konkrete Empfehlung fuer die Umsetzung

1. **Zuerst Validierung und Datenmodell**, dann Clearing, dann UI.
2. **Den bestehenden globalen Pfad fuer `zones <= 1` unveraendert lassen**.
3. **Mehrzonen-No-Split-Faelle ueber globales Referenz-Clearing kanonisieren**.
4. **Settlement und Detaildaten im Split-Fall konsequent auf `zone_price` umstellen**.
5. **Shortfall nur als separaten Knappheitspfad behandeln**.
6. **Rollout erst nach Golden-Case-Abgleich fuer `zones = 1`, No-Split und Split-Faelle**.

## Abnahmekapitel: Nicht-Regressionsvertrag

Dieses Kapitel definiert, wann die spaetere Umsetzung fachlich und technisch als abnahmefaehig gilt. Entscheidend ist, dass sich in 1-Zonen- und No-Split-Faellen **keine sichtbare Wirkung** aendert.

### 1. Fachliche Akzeptanzkriterien

#### 1.1 Ein-Zonen-Fall (`zones = 1`)

- Das System verwendet weiterhin den bestehenden globalen Clearing- und Settlement-Pfad.
- `smp`, `volume`, `hourly_results`, Player-KPIs, Round Results, Scenario Results und Player-Screen-Werte bleiben identisch zum heutigen Verhalten.

#### 1.2 Mehrzonenfall ohne Preis-Split

- Wenn `zonal_pricing_active = false`, muss sich das Ergebnis fuer Spieler und UI genauso verhalten wie heute.
- `smp`, `volume`, Revenue, Procurement-Kosten, Profit, KPI-Summen und Rankings muessen dem globalen Referenz-Clearing entsprechen.
- Zonen- und Linkdaten duerfen sichtbar sein, aber nur informativ und ohne Auswirkung auf bestehende Werte.

#### 1.3 Mehrzonenfall mit Preis-Split

- Erst in diesem Fall duerfen sich sichtbare Werte gegenueber dem heutigen Verhalten aendern.
- Producer- und Consumer-Settlement darf dann auf lokalen Zonenpreisen basieren.
- `congestion_rent_zar` und `losses_value_zar` muessen separat ausgewiesen werden.

#### 1.4 Restknappheit / Shortfall-Faelle

- Shortfall-Kosten duerfen nur dann sichtbare Zusatzkosten erzeugen, wenn selbst das zonale Clearing keine vollstaendige Versorgung herstellen kann.
- Ein reiner No-Split-Fall darf nicht ueber den Shortfall-Pfad nachtraeglich veraendert werden.

#### 1.5 UI-Kompatibilitaet

- Wenn `zonal_pricing_active = false`, bleibt die Standarddarstellung auf Player Screen, Round Results, Scenario Results und Market Overview fachlich gleich zum heutigen Verhalten.
- Zusatzelemente wie Zonenauswahl, Spread-Anzeige oder Link-Engpasswerte erscheinen nur, wenn ein echter Preis-Split oder ein expliziter Zonenkontext vorliegt.

### 2. Technische Abnahmefaelle

- `zones = 1`: kompletter `run_round(...)`-Output wird gegen einen Golden Case verglichen.
- `zones > 1` mit hoher ATC und `zonal_pricing_active = false`: kompletter Ergebnisvergleich gegen globales Referenz-Clearing.
- `zones > 1` mit bindendem ATC: zonale Preise muessen auseinanderlaufen; `congestion_rent_zar > 0`.
- `zones > 1` mit Verlusten: `losses_value_zar > 0`, Energiebilanz geschlossen.
- Restknappheit wird separat als Shortfall-Kosten ausgewiesen und ersetzt nicht den Marktpreis.

### 3. Rollout- und Fallback-Checkliste

#### 3.1 Vor dem ersten Rollout

- Referenzszenarien fuer `zones = 1`, Mehrzonen-No-Split und Mehrzonen-Split definieren.
- Fuer diese Referenzszenarien Vorher-/Nachher-Vergleiche der Kernwerte archivieren.
- Sicherstellen, dass der Restore-Commit `7948f1c4a` als Ruecksprungpunkt dokumentiert und erreichbar bleibt.

#### 3.2 Staging-Gate

- Kein Rollout, wenn irgendein `zones = 1`-Golden-Case oder No-Split-Golden-Case abweicht.
- Kein Rollout, wenn `congestion_rent_zar` in No-Split-Faellen ungleich null wird.
- `losses_value_zar` darf in No-Split-Faellen nur als rein informatives Zusatzfeld auftreten und keine bestehenden kanonischen Markt-, KPI- oder Settlement-Werte veraendern.

#### 3.3 Produktiver Rollout

- Zunaechst mit temporaerem Rollout-Schutz `general.zonal_pricing_v1_enabled = true` aktivieren.
- Nach Aktivierung gezielt Referenzszenarien pruefen: `zones = 1`, Mehrzonen ohne Split, Mehrzonen mit Split.

#### 3.4 Fallback bei Fehlverhalten

- Wenn `zones = 1` oder No-Split-Faelle abweichen, gilt das als Blocker.
- Erster Fallback: `general.zonal_pricing_v1_enabled = false` setzen und den zonalen Pfad deaktivieren.
- Zweiter Fallback: Ruecksprung auf Commit `7948f1c4a`.

#### 3.5 Abnahmeentscheidung

- Die Implementierung gilt nur dann als abgenommen, wenn alle Nicht-Regressionsfaelle gruen sind.
- Ein korrekt funktionierender Split-Fall kompensiert **keine** Abweichung in `zones = 1` oder No-Split-Faellen.

## Empfohlene neue/erweiterte Ergebnisfelder

### Stunde (`hourly_results` je Stunde)

| Feld | Typ | Bedeutung |
|---|---|---|
| `zonal_pricing_active` | Boolean | true wenn mindestens zwei Zonenpreise voneinander abweichen |
| `system_price_zar_per_mwh` | Float | Systempreis (gleich SMP wenn kein Split) |
| `zone_prices` | Array[Float] | Preis je Zone (Laenge = zones) |
| `zone_cleared_supply_mwh` | Array[Float] | geclearte Einspeisemenge je Zone |
| `zone_cleared_demand_mwh` | Array[Float] | geclearte Abnahmemenge je Zone |
| `binding_link_count` | Integer | Anzahl physisch bindender Links, unabhaengig davon ob ein Preis-Split entsteht |
| `total_congestion_rent_zar` | Float | Summe aller Link-Engpasserloese |
| `total_losses_value_zar` | Float | Summe aller Leitungsverlust-Werte |

### Zone (`zone_results` je Zone)

| Feld | Typ | Bedeutung |
|---|---|---|
| `zone_price_zar_per_mwh` | Float | Clearing-Preis dieser Zone |
| `net_position_mwh` | Float | Nettoexport (+) / Nettoimport (-) |
| `market_split_active` | Boolean | true wenn Zonenpreis != Systempreis |
| `price_source` | Enum | `uniform`, `zonal_split`, `islanded`, `shortfall_separate` |

### Link (`link_results` je Link)

| Feld | Typ | Bedeutung |
|---|---|---|
| `from_zone_price_zar_per_mwh` | Float | Exportzonenpreis |
| `to_zone_price_zar_per_mwh` | Float | Importzonenpreis |
| `price_spread_zar_per_mwh` | Float | Preisdifferenz `import - export` |
| `flow_received_mwh` | Float | Empfangene Menge nach Verlusten |
| `congestion_rent_zar` | Float | Link-Engpasserloes |
| `losses_value_zar` | Float | Verlustanteil bewertet zum Importpreis |

### Player-Zone-Info (`player_zone_info_by_player` je Spieler)

| Feld | Typ | Bedeutung |
|---|---|---|
| `zone_price_zar_per_mwh` | Float | lokaler Zonenpreis des Spielers |
| `player_zone_split_active` | Boolean | true wenn der lokale Zonenpreis des Spielers vom `system_price` abweicht |
| `connected_binding_links` | Array | Liste der bindenden Links an der Zonengrenze |

### Markt-Summary (`market_summary`)

| Feld | Typ | Bedeutung |
|---|---|---|
| `total_congestion_rent_zar` | Float | Kumulierter Engpasserloes ueber alle Runden/Stunden |
| `avg_zone_prices` | Object | Durchschnittspreis je Zone-ID |
| `max_price_spread_zar_per_mwh` | Float | Maximaler Preis-Spread ueber alle Stunden/Runden |
| `split_hours_count` | Integer | Anzahl Stunden mit aktivem Marktsplitting |
| `split_rounds_count` | Integer | Anzahl Runden mit mindestens einer Split-Stunde |
| `uniform_price_share_pct` | Float | Anteil Stunden ohne Split in Prozent |

## Fazit

Der bestehende Code ist bereits gut genug vorbereitet, um von einer nachgelagerten Netzkorrektur auf ein echtes **Zonal Market Coupling mit ATC** umgebaut zu werden. Die wichtigsten Voraussetzungen sind bereits vorhanden:

- Zonenmodell
- ATC-Matrix
- Verluste
- zonale Zuordnung der Player Types
- zonale Mix-Verteilungen
- Ergebniscontainer fuer Zonen und Links

Der zentrale strukturelle Umbau besteht darin, dass **Netzrestriktionen nicht mehr erst nach dem Clearing wirken**, sondern **Teil des Clearings selbst** werden.

Fachlich ist die Leitregel klar und fuer das Produkt passend:

- **ein Preis ohne bindenden Engpass**
- **zonale Preise nur bei bindender Restriktion**
- **Engpasserloese separat ausweisen**

Das ist die kleinste sinnvolle Ausbaustufe, die echte zonale Preisbildung ermoeglicht, ohne in einen vollstaendigen Power-Flow-Ansatz abzugleiten.