# Implementierungskonzept: Zonal Market Coupling mit ATC-bedingtem Pricing

> **QS-Status**: Version 3 (nach vollstaendiger Qualitaetssicherung gegen aktuellen Codestand und Nutzerentscheidung: Empfehlungen werden uebernommen)
>
> Gegenueber der Erstfassung wurden folgende wesentliche Korrekturen und Ergaenzungen vorgenommen:
> - Enum-Werte aller KSE-Parameter vollstaendig dokumentiert (inkl. der heute gesperrten Single-Value-Parameter)
> - Legacy-Feldnamen `transmission_loss_pct`, `losses_pct` und `market.generator_mix.*.zone_distribution_pct` hinzugefuegt
> - Engpasserloes-Formel korrigiert: verlustbereinigte Berechnung mit `import_price * flow_received - export_price * flow_sent`
> - Separates Feld `losses_value_zar` eingefuehrt
> - Heutigen `congestion_revenue_zar`-Berechnungspfad (ueber `apply_grid()` -> `cong_signal`) praezise beschrieben
> - Risiken ergaenzt: skalare Verluste, `shared_market`-Zonenkonflikte, Balancing-Grenzfall, Event-Luecke, Backward-Compatibility fuer `replay`
> - Szenariomatrix um Verluste, Storage und `shared_market`-Faelle erweitert
> - Testmatrix auf 14 Backend-Tests ausgebaut
> - Payload-Tabellen mit Fallback-Werten fuer alte Sessions ausgestattet
> - Scope explizit um nicht-implementierte V1-Grenzen erweitert
> - Offene Produktfragen in verbindliche V1-Entscheidungen ueberfuehrt
> - LP-Solver-Entscheidung fuer V1 festgelegt: `scipy.optimize.linprog` als neue Backend-Abhaengigkeit bei Implementierung

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
| `player_types[].zone` | physische Zone des Spielertyps | primaere Zuordnung fuer zonale Bids und Settlement-Zone |
| `general.player_zone` | Legacy-Fallback wenn `player_types[].zone` fehlt | nur Legacy-Fallback, keine neue Semantik |
| `environment.groups.*.zone_distribution_pct` | prozentuale Verteilung der synthetischen Grundlasterzeuger pro Zone (Array, Laenge = zones) | bleibt relevant fuer synthetische Angebotskurven-Anteile pro Zone im gekoppelten Clearing |
| `market.generator_mix.*.zone_distribution_pct` | zonale Verteilung des marktbasierten Generator-Mix | wie `environment.groups.*`: muss in zonale Angebotsbuecher einfliessen |
| `market.consumer_mix.*.zone_distribution_pct` | prozentuale Verteilung synthetischer Nachfrage pro Zone | bleibt relevant fuer synthetische Nachfrage-Anteile pro Zone im Clearing |

### Markt- und Clearingparameter

| Parameter | Zielwirkung im Konzept | QS-Hinweis |
|---|---|---|
| `market.price_floor`, `market.price_cap` | weiterhin globale Preisgrenzen fuer alle zonalen Preise | zonale Preise duerfen price_floor und price_cap nicht ueberschreiten |
| `market.enable_player_bidding` | explizite oder implizite Bid-Erzeugung je Zone | bei `false` erzeugen Classic-Bids zonale Angebote; `zone_id` muss aus `player_types[].zone` abgeleitet werden |
| `mode` (`shared_market`, `isolated_per_player`) | **QS-Risiko**: in `shared_market` werden alle Spieler eines Player-Types zu einem gemeinsamen Typ zusammengefasst und mit geteiler Kapazitaetsskalierung versehen; wenn Spieler desselben Types in unterschiedlichen Zonen sitzen, ist die Zuordnung der gemeinsamen Kapazitaet zu Zonen unklar und muss explizit konzipiert werden |
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

## Zielarchitektur Backend

### A. Neue Clearing-Schicht

Es wird eine neue Funktion empfohlen, z. B.:

- `clear_market_coupled_atc(...)`

Die V1 soll als **LP-basiertes Welfare-Maximization-Problem** umgesetzt werden, nicht als heuristische Multi-Zone-Merit-Order-Simulation. Dadurch lassen sich Dispatch, Fluesse, bindende Nebenbedingungen und zonale Preise konsistent aus derselben Loesung ableiten.

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

**QS-Hinweis: Tie-Breaking in der zonalen Loesung**: Das heutige `clear_market()` loest Tie-Bids pro-rata innerhalb des globalen Gleichgewichts. Im zonalen Modell koennen Tie-Situationen an den Grenzpreisen zweier Zonen entstehen. Die neue Clearing-Funktion muss ein konsistentes Tie-Verhalten definieren (empfohlen: pro-rata innerhalb jeder Zone unabhaengig).

### B. Integration in `run_round(...)`

Heute:

- Hourly-Bids werden global gebaut via `build_supply_from_bids(...)` und `build_demand_from_bids(...)` ohne `zone_id`
- `clear_market(...)` liefert globalen Preis
- `_compute_interzonal_round_outputs(...)` analysiert danach nur physisch
- `apply_grid(volume, atc, ...)` liefert `cong_signal` als einfaches Verhaeltnis `curtailment_needed / volume` – dieser Wert ist **nicht** ein echter zonaler Preissignal, sondern ein vereinfachtes Curtailment-Ratio
- `track_bid_dispatch(...)` und `track_demand_dispatch(...)` kennen heute keine `zone_id`

Ziel:

1. `build_supply_from_bids(...)` und `build_demand_from_bids(...)` um `zone_id`-Feld in jedem Bid erweitern (abgeleitet aus `player_types[player_id].zone` / `general.player_zone`-Fallback)
2. pro Stunde und Zone zonale Angebots-/Nachfragebuecher erzeugen
3. `clear_market_coupled_atc(...)` statt `clear_market(...)` aufrufen
4. `track_bid_dispatch(...)` muss den lokalen `zone_price` statt globalem `smp` verwenden, um Dispatch-Revenue korrekt zu berechnen
5. Dispatch-Tracking, KPI-Aufbau und Revenue-Berechnung auf zonale Preise umstellen
6. `_compute_interzonal_round_outputs(...)` stark verschlanken: Zonen-Surplus/Defizit-Rechnung entfaellt, da aus Clearing direkt `zone_net_position_mwh` kommt
7. `apply_grid(...)` nur noch fuer Legacy-Kompatibilitaet oder Restcurtailment ausserhalb des zonalen Modells verwenden

**QS-Hinweis: `congestion_revenue_zar` heutiger Berechnungspfad**: Heute wird `cong_signal` in `apply_grid()` als `min(1.0, curtailment_needed / max(1.0, volume))` berechnet und dann in `run_round()` als `dispatched * price * cong_signal` verwendet, um `congestion_revenue_zar` je Player zu ermitteln. Das ist ein heuristisches Surrogate, kein echter Engpasserloes. In Phase 2 muss dieser Berechnungspfad ersetzt werden durch den linkbasierten `congestion_rent_zar`.

**QS-Hinweis: Storage/Batteriegeraete**: `build_supply_from_bids(...)` behandelt Batterie-Entladung als Supply, `build_demand_from_bids(...)` behandelt Batterie-Ladung als Demand. Zone-ID fuer Speicher muss ebenfalls aus `player_types[].zone` kommen; Lade- und Entladeseite eines Speichers liegen zwingend in derselben Zone.

**QS-Hinweis: IDM-Deltaposition und DA-Kapazitaets-Carryover**: Heute werden `da_dispatched_mwh` je Device als Kapazitaetsreservierung in die ID-Clearing-Phase uebertragen. In einem zonalen Modell muss `da_dispatched_mwh` ebenfalls zonal zugeordnet bleiben, damit ID-Kapazitaetspruefungen korrekt je Zone erfolgen.

### C. Umgang mit bestehender Phase-1-Netzlogik

Empfehlung:

- `compute_zone_flows(...)`, `apply_grid(...)` und `_compute_interzonal_round_outputs(...)` nicht sofort loeschen
- sie als Legacy/Fallback kennzeichnen
- neue zonale Clearing-Ergebnisse als primaere Quelle verwenden
- bestehende Shortfall-Logik nur fuer Restknappheit nach zonalem Clearing einsetzen

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
- `price_source` (`uniform`, `zonal_split`, `islanded`, `shortfall_fallback`)

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
- `congestion_rent_zar = to_zone_price * flow_received_mwh - from_zone_price * flow_mwh`
- `losses_value_zar = to_zone_price * losses_mwh`
- `gross_spread_value_zar = price_spread_zar_per_mwh * flow_mwh`
- bei positivem Fluss von Export- zu Importzone gilt: `gross_spread_value_zar = congestion_rent_zar + losses_value_zar`

### 4. `player_zone_info_by_player`

Empfohlene Erweiterungen:

- `zone_price_zar_per_mwh`
- `zonal_pricing_active`
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

- `congestion_revenue_zar` im Spieler-KPI als Legacy-Feld explizit kennzeichnen und in Phase 2 durch das neue zonale Settlement-Delta ersetzen (Differenz `zone_price - global_smp` * eigener Dispatch)
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
- daraus folgt echte Knappheitskostenbehandlung zusaetzlich zum zonalen Preis
- der Shortfall-Preis gilt dann als lokaler Zonenpreis fuer die Residualknappheit in der betroffenen Zone, nicht als systemweiter Preis
- `_apply_consumer_network_shortfalls(...)` muss in Phase 2 den lokalen `zone_price` statt globalem `smp` als Basispreis verwenden, um Balancing-Aufschlaege korrekt zu berechnen
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
- Risiko: wie wird geteilte Kapazitaet auf Zonen aufgeteilt?
- Empfehlung: fuer V1 gilt, dass `shared_market`-Kapazitaet anteilig nach `zone_distribution_pct` der jeweiligen Player-Type-Zone aufgeteilt wird

### Szenario 9: Storage-/Batteriegeraete in Exportzone

- Batterie-Entladung (Supply) in der guenstigen Exportzone kann Engpassfluss erhoehen
- Batterie-Ladung (Demand) in der teuren Importzone entlastet den Import
- korrekte zonale Zuordnung von Lade- und Entladeseite ist Voraussetzung

### Szenario 10: Restknappheit nach zonalem Clearing

- eine Zone hat nicht genug Erzeugung und ATC ist ausgeschoepft
- `shortfall_price_mode = value_of_lost_load` mit hohem VoLL
- Zonenpreis springt auf VoLL-Niveau
- UI muss diesen Extremfall klar als Knappheitssignal anzeigen

## Implementierungsphasen

### Phase A: Analyse- und Datenmodell-Vorbereitung

- bestehende globale Preisverwendung inventarisieren
- neue Payload-Felder definieren
- UI-Feature-Toggles/kompatible Fallbacks festlegen

### Phase B: Backend-Clearing

- neue zonale Clearing-Funktion einfuehren
- Bids um `zone_id` erweitern
- zonale Preise und Fluesse je Stunde erzeugen
- `link_results` und `zone_results` aus dem Clearing befuellen

### Phase C: Settlement

- Producer/Consumer auf zonale Preise umstellen
- `congestion_rent_zar` separat berechnen und speichern
- Phase-1-ATC/Shortfall-Logik auf Restfaelle zurueckbauen

### Phase D: APIs

- `round-results`
- `final-results`
- `replay`
- `market-structure`

muessen die neuen zonalen Preis-/Spread-/Rent-Daten tragen.

### Phase E: UI

- Playerscreen und Market Structure View zonal erweiterbar machen
- Round Results um zonale Preis- und Link-Informationen erweitern
- Scenario Results / Overall Market View um zonale Preisaggregate und Engpasserloese erweitern

## Rueckwaertskompatibilitaet

### Harte Anforderungen

1. Alte Ein-Zonen-Szenarien duerfen unveraendert funktionieren.
2. Mehrzonen-Szenarien ohne bindende Restriktion sollen wie einheitlich bepreiste Szenarien erscheinen.
3. Bestehende Result-Views duerfen bei alten Sessions nicht brechen, wenn neue Felder fehlen.

### Empfehlenswerte Strategie

- neue Felder additiv einfuehren
- bestehende Felder wie `smp` und `volume` zunaechst beibehalten
- `smp` als `system_price` interpretierbar halten
- zonale Felder optional rendern

## Testmatrix

### Backend-Tests

1. `zones=1` -> ein Preis, keine Link-Results, kein `zonal_pricing_active`
2. `zones=2`, hohe ATC -> ein Preis, Flow >= 0, `binding=false`, `congestion_rent_zar=0`
3. `zones=2`, bindende ATC -> zwei Preise, `binding=true`, `congestion_rent_zar > 0`
4. `zones=2`, bindende ATC + `losses_pct_per_link > 0` -> `congestion_rent_zar` + `losses_value_zar` korrekt berechnet, Energiebilanz geschlossen
5. `zones=3`, partielle Kopplung -> zwei gekoppelte Zonen, eine abweichende; alle Preise arbitragefrei
6. Inselbildung (ATC=0) -> mehrere getrennte Preiscluster, kein Fluss, keine Rents
7. `enable_player_bidding=false` / `bid_count=0` -> Classic-Bids erhalten `zone_id` aus `player_types[].zone`
8. DAM-only / IDM-only / DAM+IDM -> zonale Preisbildung in aktivem Marktsegment; DA-Kapazitaet wird fuer ID-Phase korrekt zonal reserviert
9. `shortfall_price_mode=fixed_price` / `smp_multiplier` / `value_of_lost_load` -> lokaler Zonenpreis benutzt Shortfall-Preis als Deckung
10. `generator_curtailment_mode` alle 4 Varianten (`pro_rata`, `reverse_merit_order`, `renewables_first`, `renewables_last`) -> nur Restcurtailment nach zonalem Clearing veraendert sich
11. `shared_market` + 2 Zonen + bindende ATC -> Kapazitaetsskalierung und zonale Preise konsistent
12. Storage-Geraet in Exportzone -> `zone_id` korrekt; Batterie-Supply erhoeht Exportfluss
13. `balancing_up_price < zone_price` in Importzone -> Balancing-Logik in `_apply_consumer_network_shortfalls` benutzt globalen Balancing-Preis; kein inkonsistentes Ergebnis
14. Alte Sessions ohne neue Payload-Felder -> `zone_prices`, `zonal_pricing_active` etc. fehlen ohne Fehler; `smp` bleibt als Fallback

### Frontend-Tests

1. Playerscreen zeigt globalen Preis wenn kein Marktsplitting aktiv
2. Playerscreen zeigt Zonenauswahl / lokale Preise wenn Marktsplitting aktiv
3. Round Results zeigt Zone Price / System Price / Spread korrekt
4. Market Overview zeigt Link-Flow + Engpasserloes
5. Scenario Results aggregiert zonale Preis- und Rent-Daten korrekt
6. Alte Sessions ohne neue Felder bleiben darstellbar

## Risiken

### 1. Doppelte Semantik bei Engpasskosten

Risiko:

- `atc_dispatch_cost_zar`: heutiger Consumer-Netzaufschlag bei Defizit
- `network_shortfall_cost_zar`: heutiger Consumer-Shortfall-Aufschlag
- `congestion_revenue_zar`: heutiger spielerbezogener Curtailment-Kompensations-Term (kein echter Engpasserloes – berechnet via `apply_grid()` -> `cong_signal`)
- neuer `congestion_rent_zar`: echter link-basierter Netz-Engpasserloes aus Preisspreads
- neuer `losses_value_zar`: Verlustanteil je Link

Alle fuenf Felder koennen gleichzeitig im Payload existieren und fachlich verwechselt werden.

Empfehlung:

- im Konzept und spaeter im Code strikt trennen:
  - **zonal price effect** (in zonalen Preisen ausgedrueckt, kein separates Feld)
  - **restknappheitskosten** (`network_shortfall_cost_zar`, bleibt fuer VoLL/Curtailment)
  - **spielerbezogene Legacy-Signale** (`congestion_revenue_zar`, Phase 1 Heritage; in Phase 2 als deprecated markieren)
  - **netzseitiger Engpasserloes** (`congestion_rent_zar`, neues Link-Level-Feld)
  - **physische Leitungsverluste** (`losses_value_zar`, neues Link-Level-Feld)
  - **Consumer-Netzaufschlag** (`atc_dispatch_cost_zar`, Phase 1 Heritage; in Phase 2 als deprecated markieren oder umwidmen)

### 2. Globale Market-Structure-API ist aktuell inkompatibel

Die heutige `MarketStructureAPI` liefert nur globale `supply`, `demand`, `smp`, `volume`.

Empfehlung:

- neue zonale Antwortform additiv einfuehren (neues Feld `zones` mit pro-Zone-Arrays)
- globalen Modus fuer `zonal_pricing_active=false` beibehalten (keine UI-Regression)
- Preview-Modus (`market_source=synthetic_preview`) muss zonale Kurven aus `zone_distribution_pct` ableiten koennen

### 3. Sessions-/Replay-Aggregation muss erweitert werden

`backend/app/sessions.py` aggregiert heute `price_points`, `zone_breakdown` und `binding_links`, aber keine zonalen Preisverteilungen und keine Engpasserloese.

Empfehlung:

- `_build_zone_breakdown(...)` um `avg_zone_price`, `max_zone_price`, `congestion_rent_total_zar` erweitern
- `_build_price_stats(...)` um `max_price_spread`, `split_hours_count` erweitern
- bei der Aggregation alter Sessions (ohne neue Felder) muessen fehlende Felder mit `null` oder `0` befuellt werden, damit Frontend-Renders nicht brechen

### 4. `losses_pct_per_link` ist ein skalarer Wert fuer alle Links

Risiko:

- bei 3-5 Zonen mit topologisch sehr unterschiedlichen Linklängen (z. B. kurze Nahverbindung + lange Fernverbindung) erzeugt ein einheitlicher Verlustsatz falsche physische Ergebnisse
- das Konzept behauptet zonales Pricing sei praezise, aber ein skalarer Verlustsatz macht die Losung nur scheingrenau

Empfehlung:

- fuer V1 akzeptieren und explizit als vereinfachende Annahme dokumentieren
- in KSE-Tooltip darauf hinweisen
- langfristig: per-Link-Verlustmatrix analog zur ATC-Matrix einfuehren

### 5. `shared_market`-Kapazitaetsskalierung ist nicht zonal

Risiko:

- `_load_shared_market_capacity_scales()` skaliert je Player-Type, nicht je Zone
- wenn Spieler desselben Types in verschiedenen Zonen sitzen, ist unklar welcher Teil der gemeinsamen Kapazitaet welcher Zone gehoert

Empfehlung:

- fuer V1 gilt: jeder Spieler wird in der Zone seines Player-Types eingesetzt; `shared_market`-Skalierung veraendert nur die absolute Kapazitaet, nicht die Zonenlokalitaet
- dokumentieren, dass `shared_market` mit gemischten Zonen-Zuweisungen im selben Player-Type konzeptionell nicht unterstuetzt wird

### 6. Fehlende Event-Typen fuer ATC-Aenderungen

Risiko:

- heute koennen Events zonenspezifische Kapazitaets- und Nachfrage-Parameter aendern
- es gibt keinen Event-Typ fuer Leitungsausfall oder temporaere ATC-Reduktion
- ohne diesen Event-Typ ist Zonal-Pricing zwar vorhanden, aber das Netz selbst unveraenderlich

Empfehlung:

- fuer V1: keine neuen Event-Typen einfuehren
- als kuenftige Erweiterung vormerken: Event-Typ `atc_reduction` oder `line_outage` mit Ziel-Link und Zeitrahmen

### 7. Backward-Compatibility fuer `replay`-API mit alten Sessions

Risiko:

- alte Sessions haben kein `zone_prices`, kein `zonal_pricing_active`, kein `congestion_rent_zar` in ihren gespeicherten Results
- `replay`-API in `backend/app/sessions.py` iteriert ueber gespeicherte Round-Results und aggregiert diese

Empfehlung:

- alle neuen Felder mit `get(field, default)` lesen, nie direkt indizieren
- fehlende `zone_prices` auf `[smp]` fallbacken (1-Element-Array mit globalem SMP)
- fehlende `zonal_pricing_active` auf `false` fallbacken
- Frontend muss neue Felder als optional behandeln und graceful degraden

## Getroffene Produktentscheidungen

Die QS-Empfehlungen wurden als V1-Leitplanken uebernommen. Damit gelten fuer die Implementierung folgende Entscheidungen:

1. **Definition von `zonal_pricing_active`**
  - `zonal_pricing_active = true` nur wenn mindestens zwei Zonenpreise wirklich voneinander abweichen.
  - Physisch bindende Links werden separat ueber `binding_link_count` ausgewiesen.

2. **Clearing-Algorithmus**
  - V1 wird als LP / Welfare-Maximization mit ATC-Constraints konzipiert.
  - Kein heuristisches Multi-Zone-Merit-Order-Verfahren als primaerer Pfad.

3. **Empfaenger der Engpasserloese**
  - `congestion_rent_zar` wird in V1 nur separat berichtet.
  - Keine Einrechnung in Player-Profit oder Ranking.

4. **Verlustkosten / `losses_value_zar`**
  - Verluste werden separat als `losses_value_zar` ausgewiesen.
  - Keine Vermischung mit `congestion_rent_zar`.

5. **Balancing-Basis bei `smp_multiplier`**
  - Der Multiplikator wird in V1 auf `system_price` angewendet.
  - Begruendung: Balancing ist heute global konfiguriert.

6. **Shortfall-Preis vs. Market Price Cap**
  - `value_of_lost_load` darf ueber `market.price_cap` liegen.
  - Der Marktpreis selbst bleibt am Cap; Shortfall-/Scarcity-Komponente wird getrennt ausgewiesen.

7. **ATC-Richtung und Asymmetrie**
  - V1 bleibt bei symmetrischer ATC.
  - Asymmetrische ATCs sind nicht Teil der V1.

8. **`shared_market` mit Player-Types in mehreren Zonen**
  - Player desselben Typs sollen in V1 nicht automatisch ueber mehrere Zonen verteilt werden.
  - Empfehlung fuer Umsetzung: Validierung/Verbot fuer gemischte Zonen-Zuweisungen innerhalb desselben Player-Types oder eindeutige Zuordnung ueber `player_types[].zone`.

9. **Rundungs- und Einheitendefinition**
  - Stundenweise Clearing-Einheit ist MWh.
  - ATC-MW entspricht bei 1h-Zeitschritt MWh/h.
  - Bei anderen Zeitschritten waere eine explizite Umrechnung erforderlich; das ist nicht V1-Scope.

10. **Event-Scope**
   - Events wirken in V1 nur indirekt ueber Erzeugung/Nachfrage/Verfuegbarkeit.
   - ATC-Events (`line_outage`, `atc_reduction`) sind Phase-2-Erweiterung.

### Technische Solver-Entscheidung

Fachlich sind die Produktfragen fuer V1 damit entschieden. Auch die Solver-Richtung ist festgelegt:

- V1 verwendet `scipy.optimize.linprog` fuer das LP-basierte zonale Clearing.
- SciPy ist aktuell nicht in `backend/requirements.txt` enthalten und muss bei der spaeteren Implementierung als Backend-Abhaengigkeit ergaenzt werden.
- Begruendung: `linprog` ist robust genug fuer kleine 1-5-Zonen-LP-Probleme, vermeidet eine eigene Optimierungsheuristik und braucht keinen separaten externen Solver-Dienst.
- Um Docker-Build-Risiken klein zu halten, soll eine konkrete SciPy-Version gepinnt werden und der Backend-Container nach Dependency-Ergaenzung einmal voll gebaut werden.

## Konkrete Empfehlung fuer die Umsetzung

1. **Zuerst Backend-Clearing und Payloads**, nicht UI.
2. **Immer zonal coupled rechnen**, aber Preise nur bei bindender Restriktion differenzieren.
3. **Engpasserloese separat** in `link_results` und `market_summary` fuehren.
4. **Phase-1-Shortfall-/ATC-Cost-Logik nur als Restknappheits-/Fallback-Pfad behalten**.
5. **Ein-Zonen- und No-Split-Faelle strikt kompatibel halten**.

## Empfohlene neue/erweiterte Ergebnisfelder

### Stunde (`hourly_results` je Stunde)

| Feld | Typ | Bedeutung | Fallback fuer alte Sessions |
|---|---|---|---|
| `zonal_pricing_active` | Boolean | true wenn mindestens zwei Zonenpreise voneinander abweichen | `false` |
| `system_price_zar_per_mwh` | Float | Systempreis (gleich SMP wenn kein Split) | `smp` |
| `zone_prices` | Array[Float] | Preis je Zone (Laenge = zones) | `[smp]` |
| `zone_cleared_supply_mwh` | Array[Float] | gecleart Einspeisemenge je Zone | `null` |
| `zone_cleared_demand_mwh` | Array[Float] | gecleart Abnahmemenge je Zone | `null` |
| `binding_link_count` | Integer | Anzahl physisch bindender Links, unabhaengig davon ob ein Preis-Split entsteht | `0` |
| `total_congestion_rent_zar` | Float | Summe aller Link-Engpasserloese | `0` |
| `total_losses_value_zar` | Float | Summe aller Leitungsverlust-Werte | `0` |

### Zone (`zone_results` je Zone)

| Feld | Typ | Bedeutung | Fallback |
|---|---|---|---|
| `zone_price_zar_per_mwh` | Float | Clearing-Preis dieser Zone | `null` |
| `net_position_mwh` | Float | Nettoexport (+) / Nettoimport (-) | `null` |
| `market_split_active` | Boolean | true wenn Zonenpreis != Systempreis | `false` |
| `price_source` | Enum | `uniform`, `zonal_split`, `islanded`, `shortfall_fallback` | `uniform` |

### Link (`link_results` je Link)

| Feld | Typ | Bedeutung | Fallback |
|---|---|---|---|
| `from_zone_price_zar_per_mwh` | Float | Exportzonenpreis | `null` |
| `to_zone_price_zar_per_mwh` | Float | Importzonenpreis | `null` |
| `price_spread_zar_per_mwh` | Float | Preisdifferenz `import - export` | `0` |
| `flow_received_mwh` | Float | Empfangene Menge nach Verlusten | `null` |
| `congestion_rent_zar` | Float | Linker Engpasserloes | `0` |
| `losses_value_zar` | Float | Verlustanteil bewertet zum Importpreis | `0` |

### Player-Zone-Info (`player_zone_info_by_player` je Spieler)

| Feld | Typ | Bedeutung | Fallback |
|---|---|---|---|
| `zone_price_zar_per_mwh` | Float | lokaler Zonenpreis des Spielers | `null` |
| `zonal_pricing_active` | Boolean | true wenn Spielerzone vom Systempreis abweicht | `false` |
| `connected_binding_links` | Array | Liste der bindenden Links an der Zonengrenze | `[]` |

### Markt-Summary (`market_summary`)

| Feld | Typ | Bedeutung | Fallback |
|---|---|---|---|
| `total_congestion_rent_zar` | Float | Kumulierter Engpasserloes ueber alle Runden/Stunden | `0` |
| `avg_zone_prices` | Object | Durchschnittspreis je Zone-ID | `null` |
| `max_price_spread_zar_per_mwh` | Float | Maximaler Preis-Spread ueber alle Stunden/Runden | `0` |
| `split_hours_count` | Integer | Anzahl Stunden mit aktivem Marktsplitting | `0` |
| `split_rounds_count` | Integer | Anzahl Runden mit mindestens einer Split-Stunde | `0` |
| `uniform_price_share_pct` | Float | Anteil Stunden ohne Split in Prozent | `100` |

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