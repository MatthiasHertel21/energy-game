# Whitebox Review - Calculation Engine

Stand: 2. Juni 2026

## Scope + Vorgehen

Diese Review ist eine read-only Whitebox-Analyse der Rechenlogik, ohne Codeaenderungen. Der Schwerpunkt lag auf den Runtime-Pfaden in `backend/app/engine.py`, insbesondere auf den Branches und Fallbacks, die das fachliche Ergebnis stark veraendern.

Im Scope waren vor allem diese Bausteine:

- `backend/app/engine.py`: Marktbildung, Round-Klassifikation, DAM-/ID-Logik, Settlement, zonale Kopplung, ATC-/Shortfall-Logik
- `backend/app/player.py`: Erkennung von Explicit-Bid- vs. Legacy-/Fallback-Modus
- `backend/app/sessions.py`: API-seitige Reparaturen fuer historische bzw. inkonsistente Result-Rows
- `backend/app/device_types.py`: implizite Device-Defaults, vor allem Kosten- und Tier-Defaults

Vorgehen:

- Einstieg ueber `run_round()` und Rueckverfolgung aller entscheidenden Branches und Fallbacks.
- Fuer jeden Pfad Bestimmung der ausloesenden Datenform: Session-Modus, Round-Nummer, Markets-Config, Bid-Config, Forecast-Shape, Legacy-Row-Shape.
- Whitebox-Abgleich zwischen intendiertem Pfad und tatsaechlich durchlaufenem Pfad.
- Gezielte Runtime-Probes im Backend-Container mit synthetischen Beispieldaten fuer riskante Fallbacks.
- Gezielter Pytest-Slice fuer die stabilsten und gleichzeitig fachlich wichtigsten Pfade.

Validierungsauszug:

- Frischer Container, fokussierter Regression-Slice: 11 relevante Tests gruen, 1 Test reproduzierbar rot.
- Zusatzausfuehrung eines Preset-Baseline-Probes mit synthetischer Config.
- Deterministische Replay-Probe fuer den klassischen Shared-Market-Fall mit `bid_count=0` und ausgeschaltetem Zufallsrauschen.

## Results

### Rot

- **Preset-Baseline-Pfad ist fachlich sicher falsch.**
  Trigger-Datenform: `round_num = 1`, `general.day_one_baseline_mode = preset`, DAM in Runde 1 aus, IDM aktiv. In diesem Pfad wird keine echte DAM-Baseline gerechnet; in `engine.py` steht ein offener TODO direkt vor `da_smp = 400.0  # Placeholder`. Die Probe im Container ergab deterministisch `smp = 0.0`, `volume = 0.0`, `planned = 50.0` statt der eingereichten 300 MWh und keinen `dam_bid_dispatch`. Damit ist der Preset-Pfad fachlich nicht belastbar.

- **Coal/Gas-Default-Tiers verdraengen explizite Flat-Kosten im Settlement.**
  Trigger-Datenform: Coal-/Gas-Devices mit explizit gesetztem `variable_cost_zar_per_mwh`, aber ohne explizit gesetzte `variable_cost_tiers`. `enrich_device_with_defaults` fuellt in diesem Fall an mehreren Stellen die Coal/Gas-Default-Tiers (380/440/520 bzw. 1100/1300/1600) auf. Settlement bevorzugt anschliessend `variable_cost_tiers`, sobald sie vorhanden sind (siehe `_get_tiered_device_market_price` und Settlement bei 6293, 5465, 5544, 5576), statt den explizit gesetzten Flat-Wert zu verwenden. Folge: ein deterministischer Replay des Shared-Market-Falls liefert fuer den billigen 400-ZAR-Coal-Anbieter `revenue = 400000`, `variable_cost = 412000` (= $0.6 \cdot 380 + 0.3 \cdot 440 + 0.1 \cdot 520$ MWh-gewichtet), `profit = -12000`. Der belegte Defekt ist damit nicht ein generelles Ueberschreiben aller Defaults, sondern die konkrete Tier-Precedence gegenueber einer expliziten Flat-Kostenangabe. Fachlich Rot.

### Gelb

- **Toter Delivery-only-Zweig im ID-Delta-Pfad (Code-Hygiene).**
  Trigger-Datenform: Konfigurationen, in denen Clearing- und Lieferzeitfenster auseinanderlaufen sollen. In `run_round()` ist `is_clearing_hour = True` hart gesetzt (Kommentar: *"Product rule: in active rounds, display hours are always cleared. Gate window only determines which updated offers are accepted at gate close"*); damit wird `is_delivery_hour = (id_delta_round and not is_clearing_hour)` strukturell nie wahr. Bewusst deaktiviert, kein Rechenfehler, aber tote Wartungslast und versteckter Pfad fuer kuenftige Gate-Window-Erweiterungen.

- **`no_clearing`-/`reason`-Signalisierung als Observability-Luecke.**
  Scheduler und API whitelisten die Felder (siehe `scheduler.py:508-509`), die Engine setzt sie aber selbst nicht. Null- oder Leerrunden erscheinen als normale Ergebnisse mit `volume = 0`, nicht als sauber klassifizierte Nicht-Clearing-Situation. Kein falsches Outcome, aber Forensik und fachliche Trennung leiden.

- **Empty-supply-Fallback auf synthetische Supply ist robust, aber fachlich nur eine Heuristik.**
  Trigger-Datenform: In einer Stunde existiert keine positive Player-Supply, waehrend `market.id_fallback_to_synthetic_supply` oder `market.dam_fallback_to_synthetic_supply` aktiv bleibt. Dann ersetzt die Engine die leere Player-Supply durch synthetische Supply-Kurven. Das verhindert Laufabbrueche, kann aber fehlende oder strukturell falsche Gebote verdecken. Als Stabilitaetsmechanismus brauchbar, als fachlicher Wahrheitsmodus fragwuerdig.

- **DA-Baseline-Lookup fuer Legacy-Resultate ist nur heuristisch belastbar.**
  Trigger-Datenform: Runde groesser 1 mit alten Forecast-/Result-Rows ohne saubere `hour_idx`- oder Dispatch-Metadaten. Die Engine faellt dann von dispatch-basierter Referenz auf bid-basierte oder positionsbasierte Zuordnung zurueck. Fuer moderne Resultate ist der Pfad plausibel, fuer Legacy-Daten aber nur eine best effort-Heuristik.

- **Die API-Reparaturschicht in `sessions.py` ist sinnvoll, aber kein fachlich primaerer Berechnungspfad.**
  Trigger-Datenform: historisch inkonsistente Rows mit abweichenden KPI-, Revenue- oder Device-Settlement-Werten. Die Reparaturen auf der Read-Seite halten die UI oft stabil und lesbar, beheben aber das Speicherproblem nur im Response-Payload. Das ist fuer Kompatibilitaet gut, als eigentliche Wahrheitsquelle aber nur gelb.

- **Consumer-Network-Shortfall-Settlement ist intern konsistent, aber stark policy-getrieben.**
  Trigger-Datenform: mehrzonige Szenarien mit ATC/Shortfall und Consumer-Bids im betroffenen Zielgebiet. Die Logik ist rechnerisch stimmig und testgestuetzt, entscheidet aber bewusst zwischen Curtailment und Balancing-Unterstuetzung anhand der Bid-Preise. Das ist nicht offensichtlich allgemeingueltige Marktlogik, sondern eine konkrete Produktpolitik. Deshalb gelb statt gruen.

### Gruen

- **Die Bid-Modus-Erkennung ist im aktuellen Code konsistent.**
  Trigger-Datenform: echte Explicit-Bid-Szenarien, Markt-Single-Bid-Szenarien sowie Legacy-Devices mit Markt-`bid_count = 1`. Engine und Player-Normalisierung entscheiden konsistent zwischen explizitem Bid-Modus und klassischem Fallback. Die Session-312-/313-Klasse liegt damit heute auf dem richtigen Hauptpfad.

- **Der Single-Bid-Forecast-Fallback ist fachlich sauber.**
  Trigger-Datenform: Device mit `bid_count = 1`, aber ohne explizite Stundenwerte im aktuellen Slot, inklusive round-lokaler IDM-Arrays. Die Engine zieht in diesem Fall korrekt Forecast-Menge plus die passende Preisquelle heran, statt still auf Null oder falsche Indizes zu fallen. Dieser Pfad ist code- und testseitig gut abgesichert.

- **Das Kern-Clearing inklusive Scarcity Pricing ist auf dem Hauptpfad fachlich und rechnerisch korrekt.**
  Trigger-Datenform: normale Supply-/Demand-Ueberschneidung oder Unterdeckung bei weiterhin vorhandener Nachfrage. Der Clearing-Algorithmus verwendet im Unterdeckungsfall die obere Nachfrageschranke und liefert damit das erwartete Scarcity Pricing statt des letzten Supply-Preises. Dieser Pfad ist nach Code und Regressionen gruen.

- **Absolute DAM-Pfade ohne Preset-Modus sind tragfaehig.**
  Trigger-Datenform: Runde 1 mit `edit_round_1` oder spaetere DAM-only-Runden. Die Branch-Trennung zwischen absolutem Clearing und ID-Delta-Clearing ist klar, und die zugehoerigen Regressionen liefen im fokussierten Slice gruen.

- **Der ID-Delta-Pfad gegen tatsaechlich dispatchte DA-Mengen ist fuer moderne Daten korrekt.**
  Trigger-Datenform: Runde groesser 1, ID-Delta aktiv, Round-1-DAM-Resultate und Dispatch-Metadaten vorhanden. Die Engine bildet Delta gegen die wirklich dispatchte DA-Position und nicht nur gegen die gebotene Menge. Das ist fachlich der richtige Referenzpunkt und wird sauber in den Ergebnis-Metadaten gespiegelt.

- **Overbid-, physischer Cap- und Imbalance-Logik sind auf dem produktiven Hauptpfad gruener Bereich.**
  Trigger-Datenform: kommerzieller Dispatch oberhalb der physischen Verfuegbarkeit oder `allow_dispatch_above_capacity = true`. Die Engine trennt inzwischen sauber zwischen kommerziellem Award, physisch moeglicher Actual-Menge und daraus entstehender Imbalance. Fuer die ueberprueften Session-Klassen ist dieser Pfad fachlich korrekt.

- **Balancing-Preismodi greifen im getesteten Downside-Imbalance-Pfad korrekt.**
  Trigger-Datenform: Ein-Stunden-Overbid mit `allow_dispatch_above_capacity = true`, `planned = 2200`, `dispatched = 1500`, `actual = 1000`, SMP = 400. Deterministische Probe mit identischer Config und identischem Markt-Outcome zeigte: `absolute` ergibt `imbalance_cost_zar = 400000` (= 500 MWh * 800 ZAR/MWh), `smp_multiplier` ergibt `imbalance_cost_zar = 160000` (= 500 MWh * 400 * 80 %). Player-KPI und Device-Breakdown waren deckungsgleich. Damit ist der Moduswechsel fuer den geprueften Generator-Downside-Pfad bestaetigt.

- **Balancing-Preismodi greifen auch im geprueften Consumer-Upside-Pfad korrekt.**
  Trigger-Datenform: Ein-Stunden-Consumer-Szenario mit `planned = dispatched = 1000`, Event-getriebenem `actual = 1500` und SMP = 100. Deterministische Probe zeigte fuer den Verbraucherpfad: `absolute` ergibt `imbalance_cost_zar = 600000` (= 500 MWh * 1200 ZAR/MWh), `smp_multiplier` ergibt `imbalance_cost_zar = 60000` (= 500 MWh * 100 * 120 %). Auch hier waren Player-KPI und Device-Breakdown deckungsgleich. Der Moduswechsel ist damit nicht nur fuer Generator-Underdelivery, sondern auch fuer Consumer-Overconsumption auf dem getesteten Hauptpfad bestaetigt.

- **Battery-SoC-Carryover und Auto-Bid funktionieren im verifizierten Hauptpfad.**
  Trigger-Datenform: Zwei-Runden-Shared-Market-Szenario mit einer Battery, Round 1 `AUTO_BUY_CHG`, Round 2 `AUTO_SELL`, Persistenz eines Round-1-Results fuer dieselbe Session. Deterministische Probe zeigte: Round 1 laedt 20 MWh bei SMP 100 (`battery_soc_start_pct = 50`, `battery_soc_end_pct = 70`, `battery_charge_cost_zar = 2000`); Round 2 laedt exakt diesen Endzustand wieder (`[BATTERY_SOC] Round 2: ... loaded SoC from round 1: 70.0 MWh`), verkauft 20 MWh bei SMP 1000 und endet wieder bei 50 %. Damit sind Auto-Bid-Einstieg, SoC-Fortschreibung und Round-2-Carryover fuer den geprueften Ein-Battery-Hauptpfad gruener Bereich.

- **Zonal Pricing v1 und ATC-coupled Clearing sind fuer die getesteten Datenformen stabil.**
  Trigger-Datenform: mehrere Zonen, `general.zonal_pricing_v1_enabled = true`, mit und ohne bindende Leitung. Die zonale Preisaufspaltung bei bindender ATC und die uniforme Preisbildung bei nicht bindender Leitung laufen wie erwartet. Die zugehoerigen zonalen Regressionen waren gruener Bereich.

## Offene Pruefflaechen

Die folgenden Themen sind fachlich relevant und koennen Outcomes deutlich veraendern, wurden im verifizierten Slice aber nicht eigenstaendig bestaetigt oder widerlegt. Sie sind deshalb Vollstaendigkeitsluecken der Review, nicht bestaetigte Findings:

- **Mehrere Batterien bzw. mehrere Result-Rows im Round-2-Carryover.**
  Restoffene Pfade: Sessions mit mehreren Battery-Devices oder mehreren gespeicherten Result-Rows, in denen `round_num - 1` nicht nur einen offensichtlichen Vorzustand hat. Der Ein-Battery-Hauptpfad ist bestaetigt; die Robustheit des `Result.query.filter_by(...).first()`-Lookups fuer komplexere Persistenzformen wurde in dieser Review nicht separat geprueft.

- **Balancing-Spezialfaelle ausserhalb der verifizierten Hauptpfade.**
  Restoffene Pfade: weitere Randfaelle ausserhalb der jetzt verifizierten Generator-Downside- und Consumer-Upside-Szenarien, insbesondere seltene Legacy- oder Multi-Device-Konstellationen. Die Grundfunktion des Moduswechsels ist fuer beide Hauptrichtungen bestaetigt.

- **DAM-/IDM-Synthetic-Capacity-Split und seine Wechselwirkung mit Empty-Supply-Fallbacks.**
  Betroffene Pfade: `market.dam_synthetic_capacity_pct = 90` / `idm_synthetic_capacity_pct = 10`. In IDM-only-Runden steht damit nur ein kleiner Teil der synthetischen Supply zur Verfuegung; die Wechselwirkung mit Fallback-Pfaden ist im Slice nicht separat getestet.

- **`allow_dispatch_above_capacity` als globaler Schalter.**
  Betroffene Pfade: kommerzieller Dispatch oberhalb physischer Caps bei gleichzeitig separater Actual-/Imbalance-Logik. Auf dem Hauptpfad plausibel, aber als globaler Modusschalter nicht eigenstaendig durch den Slice abgesichert.

- **Event-Modifiers und Curtailment-Priority.**
  Betroffene Pfade: Szenarien mit aktiven Events oder Netzbeschraenkungen, die `get_device_event_modifiers` und `get_curtailment_priority` nutzen. Hooks vorhanden, aber im Slice nicht direkt validiert.

- **CO2-Tracking ausserhalb des belegten Tier-Kosten-Problems.**
  Betroffene Pfade: CO2-Aggregation pro Device und synthetische Supply-CO2-Raten. Der Codepfad ist vorhanden, aber es liegt bisher kein separater Repro fuer einen CO2-spezifischen Fehler vor.

- **`sessions.py`-Reparaturschicht jenseits des Read-Pfads.**
  Betroffene Pfade: `_repair_device_settlement_kpis` und `_repair_challenge_result` sind im Response-Aufbau klar sichtbar; ob daneben ein eigenstaendiges Persistenz- oder Write-Path-Risiko existiert, wurde in dieser Review nicht belegt.

## Gesamturteil

Das aktuelle Engine-Design hat einen tragfaehigen gruenden Kern fuer die produktiv wichtigsten Hauptpfade: Explicit Bids, Single-Bid-Fallback, Scarcity Pricing, ID-Delta gegen DA-Dispatch, Overbid/Imbalance und zonale Hauptlogik. Die groessten verbleibenden Risiken liegen in Fallback-, Tier-Precedence- und Legacy-Pfaden, nicht mehr im zentralen Merit-Order-Clearing.

Die wichtigsten Problemzonen:

- **rot:** Preset-Baseline in Runde 1 (Placeholder-SMP, kein echtes Clearing).
- **rot:** Coal/Gas-Default-Tiers verdraengen explizite Flat-Kosten im Settlement, sobald `variable_cost_tiers` per Default aufgefuellt wurden.
- **gelb (vormals rot):** toter Delivery-only-Zweig im ID-Delta-Pfad (bewusst per Produktregel deaktiviert, aber Wartungslast).
- **gelb (vormals rot):** `no_clearing`/`reason` ist nur Observability-Luecke, kein Rechenfehler.
- **offen:** DAM/IDM-Split, `allow_dispatch_above_capacity`, Events/Curtailment, CO2, Multi-Battery-Carryover und der genaue Scope der `sessions.py`-Reparaturschicht sind im aktuellen Slice nicht eigenstaendig validiert.

## Liste der zu korrigierenden Fehler

Diese Liste zieht nur die im Review belegten Korrekturpunkte heraus. Sie ist absichtlich enger als die Gesamtbewertung und enthaelt keine bloss offenen Pruefflaechen.

- **Preset-Baseline in Runde 1 korrigieren.**
  Statt Placeholder-SMP und implizitem Nicht-Clearing braucht der Preset-Pfad ein echtes DAM-Clearing bzw. eine fachlich aequivalente Baseline-Bildung fuer `day_one_baseline_mode = preset`.

- **Tier-Precedence fuer Coal/Gas korrigieren.**
  Ein explizit gesetztes `variable_cost_zar_per_mwh` darf nicht still durch per Default aufgefuellte `variable_cost_tiers` verdraengt werden. Entweder muessen Default-Tiers nur bei vollstaendig fehlender Kostenkonfiguration greifen oder der Settlement-Pfad muss explizite Flat-Kosten priorisieren.

- **Toten Delivery-only-Zweig bereinigen.**
  Entweder den Pfad mit der aktuellen Produktregel konsistent entfernen oder Clearing-/Lieferfenster wieder so modellieren, dass `is_delivery_hour` fachlich erreichbar ist. Der Status quo erzeugt tote Logik mit irrefuehrendem Intent.

- **Explizites `no_clearing`-/`reason`-Signal aus der Engine erzeugen.**
  Nicht-Clearing-Runden sollten im Ergebnis-Payload klar markiert werden, statt nur indirekt als `volume = 0` zu erscheinen. Das ist fuer Forensik, API-Klarheit und Folgeauswertungen korrigierenswert.