# Feedback analysis: Solo Mode - Pilot 1

Datum: 11. Februar 2026

## 1) Offene Fragen (mit vorgeschlagener Antwort)

1. Definition of round and relationship with market stage
   - Frage: Was ist eine "Runde" im Spiel und wie ist sie mit Marktstufen verknuepft?
   - Antwort: 
     - Aktuell: Runde 1 = DAM (Day-Ahead Market), Runden 2+ = IDM (Intraday Market)
     - Balancing Market (BAL) läuft parallel in allen Runden (Settlement nach jeder Runde)
     - Die Märkte sind bereits entsprechend Market Code implementiert (Gate Hours, DA gate closure, ID gates etc.)
   - Verbesserung: Neuer Tab "Markets" im KSE mit konfigurierbarer Matrix
     - Zeilen: DAM, IDM, BAL
     - Spalten: Runde 1, Runde 2, ... Runde N (dynamisch je nach general.rounds)
     - Jede Zelle mit 3 Optionen:
       * "On" = Markt immer aktiv (ignoriert Gate Hours)
       * "Market Code" = Entsprechend SAWEM-Regeln (Gate Hours, DA-Cutoff etc.) [DEFAULT]
       * "Off" = Markt deaktiviert
   - Status: beantwortet, Verbesserung vorgemerkt

2. Is it possible to limit the scenario to a single round (only DAM)?
   - Frage: Kann man das Szenario auf eine einzelne Runde (nur DAM) begrenzen?
   - Antwort: Ja, auf zwei Wegen:
     - Im KSE: `general.rounds = 1` setzen
     - Im neuen Markets-Tab: Nur DAM für Runde 1 aktivieren, IDM/BAL optional deaktivieren
   - Status: beantwortet

3. Is it possible to limit the number of hours forecasted to a single hour in Day+1?
   - Frage: Kann man den Forecast-Horizont auf eine einzelne Stunde begrenzen?
   - Antwort: 
     - Für IDM: Ja, durch `general.round_span_hours = 1` können IDM-Runden einzelne Stunden abbilden
     - Für DAM: Nein, DA-Markt bleibt immer für vollständige Tagesblöcke (typisch 24h)
     - Dies wird nicht geändert, da DAM per Design tagesbasiert ist
   - Status: beantwortet

4. Once the scenario starts, can the trainer extend the time limit of the round without restarting?
   - Frage: Kann der Trainer die Rundenzeit während der Session verlängern?
   - Antwort: 
     - Aktuell: Nein, Timer läuft fest
     - Verbesserung: Session Control Panel ("CD-Player") um Icon "+1 Min" erweitern
     - Backend: Endpoint der `round_end_time` in laufender Session anpasst
   - Status: beantwortet, Verbesserung vorgemerkt

5. Could we adapt the objectives depending on the campaign/scenario?
   - Frage: Können Objectives je nach Campaign/Szenario angepasst werden?
   - Antwort: Ja, über den **Challenges-Mechanismus** im KSE (Tab "Challenges"):
   
   **Challenge-Struktur:**
   - Name, Description
   - Metric (siehe unten)
   - Operator (≥, ≤, =)
   - Target Value
   - Points (Belohnung bei Erfüllung)
   - Required (Pflicht für Szenario-Abschluss: Ja/Nein)
   - Per-Round (muss jede Runde erfüllt werden: Ja/Nein)
   - Applicable To: Producer, Consumer, oder beide
   
   **Verfügbare Metriken:**
   
   *Universal (Producer + Consumer):*
   - Total Imbalance (MWh) - kumulativ
   - Round Imbalance (MWh) - pro Runde
   - Average Profit per Round (ZAR) - kumulativ
   
   *Nur Producer:*
   - Total Profit (ZAR) - kumulativ
   - Total Revenue (ZAR) - kumulativ
   - Total Production Cost (ZAR) - kumulativ
   - Total Energy Delivered (MWh) - kumulativ
   - Total Curtailment (MWh) - kumulativ
   - Round Profit (ZAR) - pro Runde
   - Round Revenue (ZAR) - pro Runde
   - Round Production Cost (ZAR) - pro Runde
   - Round Energy Delivered (MWh) - pro Runde
   - Curtailment Rate (%) - pro Runde
   
   *Nur Consumer:*
   - Total Procurement Cost (ZAR) - kumulativ
   - Total Cost (ZAR) - kumulativ
   - Round Cost (ZAR) - pro Runde
   - Demand Coverage (%) - pro Runde
   
   - Status: beantwortet (Mechanismus bereits implementiert)

6. Is 4,000,000 ZAR break-even revenue? Would it be the same for all players and roles?
   - Frage: Ist 4,000,000 ZAR ein Break-Even-Wert? Gilt er für alle Spieler/Rollen?
   - Antwort: 
     - Der 4,000,000 ZAR Wert ist ein Beispiel-Challenge-Target aus dem Pilot
     - Über den Challenges-Mechanismus (siehe 1.5) können beliebige Target-Werte gesetzt werden
     - Targets können unterschiedlich pro Rolle (Producer/Consumer) definiert werden
     - Alternative Targets wie "relative increase vs. baseline" oder "% of imbalance" sind über die verfügbaren Metriken ebenfalls abbildbar
     - Es gibt keine universelle Break-Even-Formel - das Target sollte je nach Szenario, Marktbedingungen und Lernanforderungen angepasst werden
   - Status: beantwortet

7. Price cap of 5000 ZAR/MWh should align with SAWEM (around 1100 ZAR/MWh)
   - Frage: Sollte der Price Cap mit SAWEM (~1100 ZAR/MWh) übereinstimmen?
   - Antwort:
     - `market.price_cap` ist im KSE frei konfigurierbar (aktueller Default: 5000)
     - Für SAWEM-konforme Szenarien: Trainer setzt den Wert auf 1100 ZAR/MWh
     - Dies ermöglicht sowohl realistische SAWEM-Szenarien als auch Training mit erweiterten Preisbereichen
   - Status: beantwortet

8. Why is the forecast horizon set for 48 hours, beyond the horizon of the market?
   - Frage: Warum ist der Forecast-Horizont (48h) größer als der Markt-Horizont?
   - Antwort:
     - `forecast_horizon_hours` ist getrennt von `horizon_hours` (aktive Markt-Stunden)
     - Forecast Horizon zeigt Daten für Planung/Vorschau über den Markt-Horizont hinaus
     - Für realistische DAM-Szenarien: Beide Werte gleich setzen (z.B. beide auf 24h)
     - Der größere Forecast-Horizont erlaubt aber Vorausplanung für mehrere Tage (nützlich für Training)
   - Status: beantwortet

9. Is the market structure figure static or does it change depending on the bid?
   - Frage: Ist die Market Structure Grafik statisch oder ändert sie sich mit den Bids?
   - Antwort:
     **Marktmodellierung:**
     1. Der Markt wird im KSE modelliert (Generator Mix, Consumer Mix, Base Price/Volume)
     2. Marktteilnehmer verhalten sich nach vorgegebenen zeitabhängigen Schemata (z.B. Solar-Profil, Wind-Profil)
     3. Jeder Marktteilnehmer hat eine Zufallskomponente (Größe im KSE einstellbar: `random_capacity_pct`, `random_price_pct`)
     4. Player kommen **additiv** in diesen Markt mit ihren Geräten hinzu (Gerätegröße im KSE einstellbar)
     5. Im Multiplayer-Mode teilen sich die Spieler die modellierte Kapazität → realistische Modellierung der Playergröße im Verhältnis zum Gesamtmarkt
     6. Die dem Player angezeigte **Market Structure ist immer die historische** zum Zeitpunkt des Rundenbeginns **ohne Berücksichtigung der Player-Angebote**
     
     **Warum historisch ohne Player?**
     - Verhindert Zirkel-Referenzen und strategische Rückkopplungseffekte
     - Ermöglicht realistisches "Price Taking" Verhalten
     - Player sehen den Markt "wie er war" und können darauf reagieren
   - Status: beantwortet

10. The player is bidding for 6 hours in this round, but the merit order shows a single hour - correct?
    - Frage: Player biddet für 6 Stunden, aber Merit Order zeigt nur eine Stunde - korrekt?
    - Antwort: Ja, korrekt.
      **Market Clearing Mechanismus:**
      - Das Market Clearing erfolgt **stündlich** (hourly clearing)
      - Jede Stunde wird separat gecleared mit eigener Merit Order
      - Jeder Stunden-Bid wird individuell berücksichtigt
      - Da sich Supply/Demand über den Tag ändern (Solar-Profil, Last-Profil, Wind-Profil), hat jede Stunde unterschiedliche Kurven und einen eigenen SMP
      
      **Darstellung:**
      - Die Merit Order / Market Structure zeigt immer eine Momentaufnahme für eine einzelne Stunde
      - Im KSE Preview kann zwischen den Stunden navigiert werden
      - Verbesserung: Im Player UI könnte ein Hour-Selector hinzugefügt werden, um verschiedene Stunden-Snapshots zu sehen
    - Status: beantwortet, Verbesserung (Hour-Selector) optional

11. Should this be linked to the load level (base, mid, peak)?
    - Frage: Sollten die Bid-Blöcke mit Load Levels (Base/Mid/Peak) verknüpft/beschriftet werden?
    - Antwort:
      - Der Spieler hat bereits die Freiheit, alle Bid-Blöcke (A, B, C) zu jeder Stunde individuell zu nutzen
      - Es ist eine strategische Entscheidung des Spielers, zu welcher Stunde er welchen Bid-Block in welchem Umfang einsetzt
      - Die Bezeichnung "Base/Mid/Peak" für die Blocks ist optional und kann verwirrend sein, da sie nicht an Tageszeiten gebunden sind
      - Empfehlung: Neutrale Beschriftung (A/B/C oder "Lot 1/2/3") beibehalten, um Flexibilität zu betonen
    - Status: beantwortet

12. What does the cost 600 ZAR/MWh refer to?
    - Frage: Was bedeutet "Cost 600 ZAR/MWh"?
    - Antwort:
      - Dies sind die **Marginal Costs** (variable Kosten) des Geräts
      - Im KSE für jedes Device konfigurierbar
      - Wird für die Cost-Berechnung des Spielers verwendet: Dispatched MWh × Marginal Cost
      - Angezeigt in der Device-Card im Player UI
    - Status: beantwortet

13. By “enter power per hour,” is this hourly demand or bid volume?
    - Frage: Bezieht sich "enter power per hour" auf Nachfrage oder Bid Volume?
    - Antwort:
      - Dies ist die **Bid Volume** (Angebotsvolumen) des Generators pro Stunde
      - Für Consumer: Die nachgefragte Menge (Demand Volume) pro Stunde
      - Die Eingabe erfolgt in MW, gilt aber für jede volle Stunde im betrachteten Zeitraum
      - Beispiel: "600 MW für 6 Stunden" = 600 MW in Stunde 1, 600 MW in Stunde 2, ... etc.
    - Status: beantwortet

14. What is the added value of the player adapting system demand for base/mid/peak hours?
    - Frage: Was ist der Mehrwert, dass der Spieler die System-Demand für base/mid/peak Stunden anpasst?
    - Antwort:
      - **Klarstellung:** Der Spieler adaptiert **nicht** die System-Demand
      - Der Spieler adaptiert seine **eigenen Bids** (Supply oder Demand je nach Rolle)
      - Die System-Demand ist exogen (vom Marktmodell vorgegeben, nicht vom Spieler beeinflussbar)
      - **Verbesserung erforderlich:** UI-Labels und Beschreibungen sind offenbar missverständlich
    - **Rückfrage an Feedback-Geber:** 
      - Welche konkreten UI-Elemente/Labels haben die Verwirrung verursacht?
      - Vorschlag: "Your Bid Volume" statt "Demand", "Your Offer" statt "System Supply"?
      - Soll die exogene System-Demand separat visualisiert werden (als Referenz-Linie)?
    - Status: beantwortet, UI-Verbesserung vorgemerkt

15. Why are bids in DAM shown for Day-1 hours? (H1-H24 already cleared)
    - Frage: Warum werden DAM-Bids für Day-1 Stunden angezeigt? (bereits geliefert)
    - Antwort:
      **Problem:** In Runde 1 (DAM) liegen noch keine vorherigen Bids des Spielers vor, die als DA-Baseline dienen könnten.
      
      **Drei Lösungsmöglichkeiten:**
      1. **"Zero Bid"**: Spieler startet mit 0 MWh DA-Position, baut diese in Runde 1 auf
         - Vorteil: Klar definiert, Spieler hat volle Kontrolle
         - Nachteil: Unrealistisch (kein Generator startet bei 0)
      
      2. **"Default Bid"**: Device hat Default-Werte (z.B. aus `device.capacity` und `device.marginal_cost`)
         - Vorteil: Realistischer Startpunkt
         - Nachteil: Spieler muss verstehen woher die Default-Werte kommen
      
      3. **"Ausnahmeregel Runde 1"**: Runde 1 ist Setup-Phase (nicht echtes DAM), echtes Trading ab Runde 2
         - Vorteil: Pädagogisch klarer
         - Nachteil: Abweichung vom realen Markt-Ablauf
      
      **Aktuell implementiert:** Option 2 mit `first_round_baseline_mode` im KSE
      
    - **Rückfrage an Feedback-Geber:** 
      - Welche dieser drei Optionen würden Sie bevorzugen?
      - Oder eine vierte Variante: Runde 0 als "Bidding Setup" vor dem eigentlichen Szenariostart?
    - Status: beantwortet, Präferenz für Modell erbeten

16. Three prices per 6-hour block vs multi-bid combinations per hour
    - Frage: Warum nur drei Preisblöcke statt unbegrenzt viele Price-Quantity-Pairs pro Stunde?
    - Antwort:
      - **Aktuell:** 3 Bid-Blöcke (A/B/C) pro Device, Volumen kann stündlich individuell angepasst werden
      - **Design-Entscheidung:** Vereinfachte Block-Struktur für Lernzwecke und Gameplay-Balance
      - **Realistische Märkte:** Unbegrenzte Anzahl von Price-Quantity-Pairs pro Stunde möglich
      - **Trade-off:** Komplexität vs. Lernkurve
        - Mehr Blöcke = realistischer, aber höhere kognitive Last für Spieler
        - 3 Blöcke = ausreichend für Merit-Order-Verständnis und strategische Entscheidungen
      - Die drei Blöcke ermöglichen bereits mehrstufige Gebotskurven und differenzierte Strategien
    - Status: beantwortet (gewollte Vereinfachung)

17. Gate closure set to 12h, align with SAWEM timeline
    - Frage: Sollte die Gate Closure mit SAWEM-Timeline abgestimmt werden?
    - Antwort:
      - `day_ahead_gate_hour` ist im KSE konfigurierbar (aktueller Default: 12)
      - Für SAWEM-Konformität: Trainer kann den Wert entsprechend anpassen
      - **Rückfrage:** Was ist der exakte SAWEM Gate Closure Zeitpunkt für DAM? (typischerweise 12:00 am Vortag)
    - Status: beantwortet, SAWEM-Zeitpunkt zur Bestätigung erbeten

18. What does “curtailment” mean for a coal plant?
    - Frage: Was bedeutet "Curtailment" für ein Kohlekraftwerk?
    - Antwort:
      - **Definition im Spiel:** Differenz zwischen angebotener und tatsächlich vom Markt dispatchter Energie
      - Formel: Curtailment = Offered MWh − Dispatched MWh
      - **Kontext:** Kann vorkommen bei niedrigem SMP (Bid-Preis zu hoch) oder Netzrestriktionen
      - **Terminologie-Problem:** "Curtailment" wird typischerweise für Renewables verwendet (erzwungene Abregelung)
      - Für konventionelle Kraftwerke sind bessere Begriffe:
        * "Undispatched Volume"
        * "Not Cleared"
        * "Unaccepted Bids"
        * "Non-Scheduled Volume"
    - **Rückfrage an Feedback-Geber:**
      - Welche Bezeichnung halten Sie für am geeignetsten und klarsten?
      - Sollten wir unterschiedliche Begriffe für Renewables (Curtailment) vs. konventionelle Kraftwerke (Not Cleared) verwenden?
    - Status: beantwortet, Terminologie-Präferenz erbeten

19. How is variable cost calculated? Why is there a difference with what is displayed?
    - Frage: Wie werden variable Kosten berechnet? Warum gibt es Abweichungen zur Anzeige?
    - Antwort:
      **Kostenberechnung (pro Device, pro Runde):**
      
      1. **Variable Kosten:** 
         - Formel: Σ(Dispatched MWh × Marginal Cost ZAR/MWh) über alle Stunden
         - Beispiel: 100 MWh × 600 ZAR/MWh = 60,000 ZAR
      
      2. **Fixkosten:**
         - Formel: Σ(Fixed Cost ZAR/h) über alle aktiven Stunden
         - Im KSE pro Device konfigurierbar
         - Fallen unabhängig vom Dispatch-Level an
      
      3. **Imbalance Kosten:**
         - Entstehen durch Abweichung zwischen Dispatch und tatsächlicher Lieferung
         - Actual Delivery = Dispatched × (1 + random noise)
         - Noise ist konfigurierbar im KSE (`environment.actual_noise_pct`, default: ±5%)
         - Imbalance = Actual − Dispatched
         - Kosten: Dual Pricing (Up: 1200 ZAR/MWh, Down: 800 ZAR/MWh)
      
      **Gesamtkosten = Variable Kosten + Fixkosten + Imbalance Kosten**
      
      **Mögliche Ursachen für Diskrepanzen:**
      - Rundungsfehler (Variable Kosten auf 0 Dezimalstellen gerundet)
      - Aggregation über mehrere Devices
      - Fixkosten und Imbalance Kosten werden separat ausgewiesen
      - Zeitpunkt der Anzeige (vor/nach Imbalance-Settlement)
      
      **Hinweis:** Die Berechnung selbst ist korrekt (siehe 3.7), aber die Darstellung könnte transparenter sein
    - Status: beantwortet, Transparenz-Verbesserung vorgemerkt (siehe 3.7)

20. Single MCP for 24 hours looks strange
    - Frage: Warum wird ein einzelner MCP/SMP für 24 Stunden angezeigt?
    - Antwort:
      - **Lot Breakdown:** Zeigt den **Mittelwert** der SMPs über alle Stunden der Runde, pro Device
      - Formel: Avg. SMP = Σ(SMP_h) / Anzahl Stunden
      - Dies dient als kompakte Übersicht für die Device-Performance
      - **Hourly Breakdown:** Zeigt die individuellen SMPs für jede Stunde (korrekt und detailliert)
      - **Verbesserung:** Label von "MCP" zu "Avg. SMP" oder "Ø SMP" ändern, um den Mittelwert-Charakter klarzustellen
    - Status: beantwortet (gewolltes Design, aber Label-Verbesserung vorgemerkt)

21. Planned vs dispatched volumes
    - Frage: Was bedeuten "Planned" und "Dispatched" genau in den Results?
    - Antwort:
      **Aktuelle Bedeutung im Spiel:**
      - **Planned:** Die vom Spieler eingereichte Forecast/Bid-Volume (das Angebotsvolumen)
      - **Dispatched:** Die vom Markt akzeptierte/gecleared Volume nach Market Clearing
      
      **Energiemarkt-Kontext:**
      Im realen Energiemarkt gibt es folgende Phasen:
      1. **Bid/Offer:** Marktteilnehmer reicht Preis-Mengen-Kombinationen ein
      2. **Cleared/Accepted:** Markt ermittelt SMP und akzeptiert/rejected Bids
      3. **Dispatched/Scheduled:** Die für Lieferung vorgesehene Menge
      4. **Actual Delivery:** Die physisch gelieferte Menge (kann durch Noise abweichen)
      
      **Mögliche alternative Begriffe:**
      - "Bid Volume" vs "Cleared Volume"
      - "Offered" vs "Accepted"
      - "Submitted" vs "Dispatched"
      - "Forecast" vs "Scheduled"
      
    - **Rückfrage an Feedback-Geber:**
      - Sind die aktuellen Begriffe "Planned" und "Dispatched" verständlich und passend?
      - Welche der alternativen Begriffskombinationen würden Sie bevorzugen?
      - Gibt es SAWEM-spezifische Terminologie, die wir verwenden sollten?
    - Status: beantwortet, Terminologie-Präferenz erbeten

22. In IDM, volume for first 12 hours is locked - not aligned with IDM
    - Frage: Warum sind im IDM die ersten 12 Stunden gesperrt? Das entspricht nicht dem echten IDM.
    - Antwort:
      **Aktuelle Implementierung:**
      - Das Locking erfolgt **gate-basiert**, nicht pauschal "erste X Stunden"
      - **Round 1:** Sonderbehandlung für DA-Setup (alle Stunden bis Day 1 Ende sind tradeable)
      - **Round 2+:** IDM Gate Logic greift:
        * `next_id_gate = _calculate_next_id_gate(current_sim_hour, id_gate_interval, id_gate_base)`
        * Tradeable Hours: `h >= next_id_gate` (konfigurierbar via `id_gate_interval_hours` und `id_gate_base_hour`)
        * Stunden < current_sim_hour sind "delivered" (locked)
        * Stunden < next_id_gate aber >= current_sim_hour sind "committed position" (bereits ID-gate-closed)
      
      **Problem:**
      - Die Sonderbehandlung von Runde 1 (kein vorheriges DA-Angebot) führt zu Irritationen
      - Der `first_round_baseline_mode` existiert bereits im Config, deckt aber noch nicht alle Aspekte ab
      
      **Lösung:**
      - Die Sonderbehandlung von Runde 1 wird vollständig konfigurierbar gemacht
      - Optionen:
        * `device_default`: Runde 1 nutzt Device-Default-Werte als DA-Baseline (aktuell)
        * `zero`: Runde 1 startet bei 0, Player baut Position auf
        * `setup_round`: Runde 1 ist explizite Setup-Phase (nicht als echtes DAM gewertet)
      - Dies vermeidet Inkonsistenzen zwischen Runde 1 und Folgerunden
      
      **Im echten IDM:**
      - Alle Day+1 Stunden können bis 1h vor Lieferung angepasst werden
      - Dies ist bereits durch die flexible `id_gate_interval_hours` Konfiguration abbildbar
    - Status: beantwortet, Verbesserung (Runde-1-Mode konfigurierbar) vorgemerkt

23. Not clear what the adjustable figure represents (volumes offered?)
    - Frage: Was stellt die anpassbare Grafik dar? Sind das angebotene Volumen?
    - Antwort:
      - Die adjustierbare Grafik (Forecast-Slider/Editor) zeigt die **Bid Volumes pro Stunde**
      - Dies sind die MWh, die der Spieler pro Stunde für jedes Device anbieten möchte
      - Für Generator: Offered Supply (MWh pro Stunde)
      - Für Consumer: Requested Demand (MWh pro Stunde)
      - **Verbesserung:** Klarere Labels und Tooltips hinzufügen:
        * "Your Hourly Bid Volume (MWh)"
        * "Offered Energy per Hour"
        * Tooltip mit Erklärung: "Adjust the volume you want to offer/request for each hour"
    - Status: beantwortet, UI-Labeling-Verbesserung vorgemerkt


## 2) Anregungen zur Verbesserung des Spiels (einzeln diskutieren und bewerten)

1. Add a beginner mode that guides new players through the game.
   - Anregung: Interaktiver Tutorial Mode mit Schritt-für-Schritt-Guidance
   - Umsetzung:
     * Im KSE aktivierbar: `general.tutorial_mode = true`
     * Interactive overlays mit "Next"-Button
     * Highlight der relevanten UI-Elemente (z.B. Device Card, Bid Editor, Market Structure)
     * Progressive Disclosure: Zeige nur relevante Features je nach Lernfortschritt
   - **Rückfrage an Feedback-Geber:**
     Welche Themen/Schritte sollen im Tutorial Mode erklärt werden?
     * Market Structure verstehen (Supply/Demand curves, SMP)?
     * Bidding Mechanismus (Preis-Mengen-Kombinationen, Lots A/B/C)?
     * Time Phases (DA vs IDM vs Locked)?
     * Results interpretieren (Revenue, Costs, Imbalance)?
     * Grid & Zones (ATC, Congestion)?
     * Challenges & Objectives?
     * Device Management (Capacity, Marginal Costs)?
     * Advanced: Multi-Device Strategien?
     Bitte priorisieren Sie die wichtigsten 3-5 Themen für Beginner.
   - Bewertung: High Impact, Medium-High Effort
   - Status: Anregung akzeptiert, Themen-Priorisierung erbeten

2. Add pop-ups/tooltips to explain functions and UI elements.
   - Anregung: Mehr Tooltips und Erklärungen für UI-Elemente
   - **Bereits vorhanden:**
     * **InfoLabel Komponente:** Icon mit Tooltip für Felder im KSE
       - Beispiele: "Capacity (MW)", "Marginal Cost", "Fixed Cost" etc.
     * **MarketPhaseLegend:** Glossar für Marktphasen-Begriffe im Player UI
       - Erklärt: Past, Committed DA, ID Closed/Open, DA Open, Forecast, NOW, DA Gate, ID Gate, etc.
       - 15+ Begriffe bereits dokumentiert
     * Standard Material-UI Tooltips für Buttons (Edit, Delete, Duplicate etc.)
   
   - **Erweiterungen möglich:**
     * Mehr InfoLabels in KSE-Konfigurationsfeldern
     * Context-sensitive Help im Player UI
     * Erweiterte Glossar-Einträge in MarketPhaseLegend
   
   - **Rückfrage an Feedback-Geber:**
     Welche spezifischen UI-Elemente oder Begriffe benötigen noch Tooltips/Erklärungen?
     * Bid-Editor (Lots A/B/C)?
     * Results-Tabellen (Revenue, Cost, Imbalance)?
     * Market Structure Chart (Supply/Demand curves)?
     * KSE-Felder (welche konkret)?
     * Performance Metrics (Curtailment, Dispatch, etc.)?
     * Andere?
   
   - Bewertung: High Impact, Low-Medium Effort
   - Status: Teilweise vorhanden, spezifische Erweiterungswünsche erbeten

3. Add multiplayer mode.
   - Anregung: Multiplayer-Modus hinzufügen
   - Antwort:
     * **Multiplayer-Modus ist bereits implementiert** und wird am **15. Februar 2026 zum Test bereitgestellt**
     * Features:
       - Mehrere Spieler können gleichzeitig in einer Session teilnehmen
       - Gemeinsamer Markt (shared market clearing)
       - Live Leaderboard
       - Synchronisierte Runden
     * Nach Testphase wird Feedback gesammelt für weitere Verbesserungen
   - Bewertung: High Impact, bereits implementiert
   - Status: Wird am 15.2.2026 zum Test freigegeben

4. Provide a concise starting guide and separate player guide vs admin guide.
   - Anregung: Klare, getrennte Handbücher für verschiedene Rollen
   - **Bereits vorhanden** (`/frontend/public/handbooks/`):
     * **player-handbook.md:** Anleitung für Spieler (Bidding, Market Phases, Results)
     * **trainer-handbook.md:** Anleitung für Trainer (Session Management, Monitoring)
     * **designer-handbook.md:** Anleitung für Designer (KSE, Scenario Creation)
     * **admin-handbook.md:** Anleitung für Admins (System Setup, User Management)
     * **calculation-engine.md:** Technische Dokumentation (Market Clearing, Formeln)
   
   - **Verbesserung möglich:**
     * Kürzere "Quick Start Guides" (1-2 Seiten) ergänzen
     * Mehr Screenshots/Diagramme in bestehenden Handbüchern
     * Video-Tutorials verlinken (falls vorhanden)
   
   - **Rückfrage an Feedback-Geber:**
     Welche Themen fehlen in den bestehenden Handbüchern oder sollten ausführlicher erklärt werden?
     * Player: Strategie-Tipps? Fehlerbehandlung? Multiplayer-Aspekte?
     * Trainer: Troubleshooting? Pädagogische Best Practices? Session-Debriefing?
     * Designer: Template-Bibliothek? Advanced Features? Balancing-Tipps?
     * Admin: Backup/Restore? Performance Tuning? Security?
     * Andere fehlende Themen?
   
   - Bewertung: High Impact, Low-Medium Effort (Dokumentation erweitern)
   - Status: Handbücher vorhanden, Ergänzungswünsche erbeten

5. Allow scenario configuration for DAM-only and reduced forecast horizon (single hour).
   - Anregung: Konfigurierbarkeit für DAM-only und reduzierte Horizonte
   - Antwort:
     * **Bereits beantwortet in Kategorie 1 (Offene Fragen):**
       - 1.2: DAM-only durch `general.rounds = 1` oder Markets-Tab Konfiguration
       - 1.3: Reduzierter Horizont für IDM durch `round_span_hours = 1`; DAM bleibt tagesbasiert (24h)
     * Beide Features sind bereits im KSE konfigurierbar
   - Bewertung: Already implemented
   - Status: Siehe Antworten 1.2 und 1.3

6. Add scenario briefing info: products activated, day description, asset overview.
   - Anregung: Scenario Briefing mit mehr Kontext-Informationen
   - Antwort:
     * Der **KSE (Tab "Description")** ermöglicht bereits die Eingabe von Scenario-Beschreibungen
     * Diese werden im **Briefing-Screen** für Spieler angezeigt
     * **Je Scenario individuell pflegbar:**
       - Products activated (DAM, IDM, BAL)
       - Day description (Weather, Demand profile, Market situation)
       - Asset overview (Generator mix, Capacities, Zones)
       - Objectives & Challenges
       - Special events oder Constraints
     * Format: Markdown-unterstützt für strukturierte Darstellung
     * Empfehlung: Trainer sollten diese Felder konsequent für jedes Scenario ausfüllen
   - Bewertung: Already available, requires discipline in scenario creation
   - Status: Funktion vorhanden, Nutzung liegt bei Scenario-Designern

7. Add grid configuration details: transfer limits, zonal split of demand and capacity.
   - Anregung: Grid-Konfiguration mit Transfer Limits und zonalen Aufteilungen
   - Antwort:
     * **Bereits implementiert:**
       - **Vereinfachtes Zonenmodell:** Bis zu 5 Zonen konfigurierbar im KSE (Tab "Grid")
       - **ATC Matrix (Available Transfer Capacity):** Transfer Limits zwischen Zonen
       - **Übertragungsverluste:** 2% Loss bei zonenübergreifenden Transfers
       - **Player-Zonen-Zuordnung:** Jeder Player kann einer Zone zugewiesen werden (`general.player_zone`)
       - **Device-Zonen-Zuordnung:** Jedes Device hat eine Zonen-Zugehörigkeit
     * **Verbesserung möglich:**
       - Visualisierung der Grid-Topologie im Briefing-Screen
       - Grafiken (z.B. Netzplan) können als Bilder in der KSE-Beschreibung (Markdown) eingebunden werden
       - Automatische Anzeige der zonalen Demand/Capacity-Splits im Briefing
   - Bewertung: Core functionality implemented, visualization enhancement possible (Medium Effort)
   - Status: Funktion vorhanden, Visualisierung als Verbesserung vorgemerkt

8. Consider transmission losses as an advanced-level feature (not early levels).
   - Anregung: Übertragungsverluste als Advanced-Feature (nicht für Beginner)
   - Antwort:
     * **Bereits implementiert:**
       - **Übertragungsverluste:** 2% Loss bei zonenübergreifenden Transfers (konfigurierbar im Code)
       - **Bandbreitenbegrenzungen (ATC):** Transfer Limits zwischen Zonen vollständig implementiert
       - Beide Features greifen automatisch bei Multi-Zonen-Szenarien
     * **Graduated Complexity möglich:**
       - Beginner-Szenarien: `grid.zones = 1` (Single-Zone, keine Verluste/Congestion)
       - Intermediate: `grid.zones = 2` mit ATC aber ohne explizite Verluste-Erklärung
       - Advanced: Multi-Zonen mit vollem Congestion-Management
   
   - **Rückfrage an Feedback-Geber:**
     Sieht der Spieler aktuell im Player UI, in welcher Netzzone er spielt?
     * **Im Briefing:** Ja, wenn Zone im Player Type hinterlegt
     * **Im Player UI während des Spiels:** Aktuell nicht prominent angezeigt
     * **Verbesserung:** Zone-Badge im Player UI Header hinzufügen?
   
   - Bewertung: Already implemented, display enhancement possible
   - Status: Funktion vorhanden, Zone-Anzeige als Verbesserung diskutieren

9. Add player portfolio details: cost curves, zone, optional carbon intensity.
   - Anregung: Mehr Portfolio-Details für Player-Devices
   - **Bereits vorhanden:**
     * **Cost Curves:** Marginal Cost (ZAR/MWh) pro Device konfigurierbar im KSE
       - Fixed Cost (ZAR/h) ebenfalls vorhanden
       - Multi-Lot-Bidding (A/B/C) ermöglicht stufenweise Kostenkurven
     * **Zone:** Jedes Device kann einer Zone zugeordnet werden
       - Wird im Briefing angezeigt (wenn konfiguriert)
     
   - **Erweiterung vorgeschlagen:**
     * **Carbon Intensity (CO₂-Intensität):**
       - Neuer Device-Parameter: `carbon_intensity` (Tonnen CO₂/MWh)
       - Anzeige im Briefing und Device-Card
       - Optional: CO₂-Tracking in Results (Total Emissions pro Runde/Session)
       - Optional: CO₂-basierte Challenges ("Reduce emissions below X tons")
       - Use Case: Für Carbon-Markt-Training oder Sustainability-Szenarien
   
   - Bewertung: Partially implemented, Carbon Intensity enhancement (Low-Medium Effort)
   - Status: Cost & Zone vorhanden, Carbon Intensity als Erweiterung vorgemerkt

10. Align challenges with objectives; use relative performance targets.
    - Anregung: Challenges mit relativen Performance-Targets ausstatten
    - **Bereits vorhanden:**
      * Challenges sind flexibel konfigurierbar (siehe Antwort 1.5)
      * **Relative Metriken bereits implementiert:**
        - `curtailment_rate` (%): (Planned - Dispatched) / Planned × 100
        - `demand_coverage` (%): Actual / Planned × 100
        - `avg_profit_per_round` (ZAR): Durchschnittlicher Profit über alle Runden
      * Diese ermöglichen bereits prozentuale Targets (z.B. "Curtailment < 5%", "Demand Coverage ≥ 95%")
    
    - **Mögliche Erweiterungen:**
      * Vergleich zu Baseline/Round 1: "profit_improvement_vs_baseline" (% Verbesserung)
      * Relative zu anderen Spielern: "rank" oder "percentile"
      * Effizienz-Metriken: "profit_per_mwh", "cost_efficiency_ratio"
    
    - **Rückfrage an Feedback-Geber:**
      Welche zusätzlichen relativen Metriken wären für Training-Szenarien hilfreich?
      * Prozentuale Verbesserung vs. erste Runde?
      * Ranking vs. andere Spieler (Multiplayer)?
      * Effizienz-Kennzahlen (Profit/MWh, Kosten/MWh)?
      * Andere?
    
    - Bewertung: Core relative metrics implemented, additional metrics possible (Low-Medium Effort)
    - Status: Grundfunktion vorhanden, Erweiterungswünsche erbeten

11. Improve the bidding UI terminology and clarity (use “bids,” “cleared,” etc.).
    - Anregung: Bidding UI mit klarerer und konsistenter Terminologie
    - **Bereits diskutiert in Kategorie 1:**
      * 1.14: "System Demand" vs "Your Bid Volume" (Klarstellung erforderlich)
      * 1.18: "Curtailment" vs "Not Cleared" / "Undispatched" (Terminologie-Präferenz)
      * 1.21: "Planned" vs "Dispatched" (Alternative Begriffe: Offered/Cleared, Bid/Accepted)
      * 1.23: "Adjustable figure" benötigt klare Labels ("Your Hourly Bid Volume")
    
    - **Freundliche Rückfrage an Feedback-Geber:**
      Wir möchten die UI-Terminologie verbessern und konsistent gestalten. Könnten Sie uns helfen, indem Sie angeben:
      
      **Welche aktuellen Begriffe sind verwirrend oder missverständlich?**
      - Im Bid-Editor (z.B. "Lot A/B/C", "Enter power per hour")?
      - In den Results (z.B. "Revenue", "Variable Cost", "Curtailment")?
      - In der Timeline (z.B. "DA Open", "ID Closed", "Committed")?
      - Im Market Structure Chart (z.B. "Supply", "Demand", "SMP")?
      
      **Welche Begriffe würden Sie präferieren?**
      - Standard-Energiemarkt-Terminologie (z.B. SAWEM-spezifisch)?
      - Pädagogische, vereinfachte Begriffe für Beginner?
      - Unterschiedliche Begriffe je nach Schwierigkeitsgrad?
      
      Ihre konkreten Vorschläge helfen uns, die UI intuitiver und lernfreundlicher zu gestalten!
    
    - Bewertung: High Impact, Low Effort (Text-Änderungen)
    - Status: Spezifisches Feedback zu Terminologie erbeten

12. Make the dynamic bid figure more intuitive and simpler.
    - Anregung: Dynamische Bid-Figur (Forecast-Editor Chart) intuitiver gestalten
    - **Aktueller Stand:**
      * Interaktiver Chart mit stündlichen Balken (editierbar per Drag/Click)
      * Visualisierung von DA/ID-Phasen durch Farbcodierung
      * Anzeige von Max Capacity, Min Load, Baseline CF
      * Legende zeigt DA Buy/Sell, ID+/ID− Adjustments
    
    - **Rückfrage an Feedback-Geber:**
      Um die Bid-Figur zu verbessern, würden uns konkrete Vorschläge sehr helfen:
      
      **Was ist aktuell unklar oder zu komplex?**
      - Zu viele Informationen gleichzeitig (Overload)?
      - Farbcodierung nicht intuitiv?
      - Interaktionsmechanik (Drag & Drop) nicht ersichtlich?
      - Legende zu technisch?
      - Scale/Achsenbeschriftung unklar?
      
      **Welche Vereinfachungen würden Sie vorschlagen?**
      - Reduzierte Ansicht für Beginner (weniger Elemente)?
      - Schritt-für-Schritt-Eingabe statt freiem Editor?
      - Voreingestellte Patterns ("Flat", "Peak-optimized", "Base-load")?
      - Separate Ansichten für DA und ID statt kombiniert?
      - Numerische Input-Felder zusätzlich zum Chart?
      - Tutorial-Overlay beim ersten Öffnen?
      
      **Gibt es Referenz-Tools oder Vorbilder?**
      - Andere Software/Spiele mit ähnlichen Eingaben?
      - Sketch/Mock-up Ihrer Wunsch-UI?
      
      Ihre konkreten Ideen helfen uns, die Benutzerfreundlichkeit gezielt zu verbessern!
    
    - Bewertung: High Impact, Medium Effort (UX-Iteration)
    - Status: Konkrete Verbesserungsideen erbeten

13. Show hourly MCP instead of single MCP for 24h.
    - Anregung: Stündliche MCPs statt einzelnem aggregiertem Wert anzeigen
    - **Bereits beantwortet in Kategorie 1:**
      * Siehe Antwort 1.20: Lot Breakdown zeigt Durchschnitts-SMP (gewolltes Design für Kompaktheit)
      * Hourly Breakdown zeigt bereits die individuellen SMPs pro Stunde
      * Verbesserung: Label von "MCP" zu "Avg. SMP" oder "Ø SMP" ändern für Klarheit
    - Bewertung: Already addressed, label improvement (Low Effort)
    - Status: Siehe Antwort 1.20

14. Allow adjusting offer volumes (not only prices).
    - Anregung: Volumen-Anpassung zusätzlich zu Preisen ermöglichen
    - **Bereits vorhanden:**
      * **Forecast-Editor:** Volumen sind pro Stunde individuell adjustierbar (Drag & Drop, Input-Felder)
      * **Multi-Lot-Bidding:** Jeder Bid-Block (A/B/C) hat separate Volumen pro Stunde
      * Spieler können sowohl Preise (pro Block) als auch Volumen (pro Stunde, pro Block) frei anpassen
    
    - **Rückfrage an Feedback-Geber:**
      Welche Volumen-Anpassungen sind aktuell nicht möglich, die Sie benötigen würden?
      * Volumen-Split zwischen Bid-Blöcken A/B/C während des Spiels ändern?
      * Device Capacity (Max Power) während der Session anpassen?
      * Min Load / Ramp Limits zur Laufzeit ändern?
      * Automatische Volumen-Patterns/Templates?
      * Andere Volumen-bezogene Features?
      
      Bitte beschreiben Sie den konkreten Use Case, damit wir die richtige Funktionalität ergänzen können.
    
    - Bewertung: Partially implemented, clarification needed
    - Status: Grundfunktion vorhanden, spezifischer Bedarf erbeten

15. Make performance outputs more intuitive and explain relationships.
    - Anregung: Performance-Outputs intuitiver gestalten und Zusammenhänge erklären
    - **Bereits diskutiert in Kategorie 1:**
      * Siehe Antwort 1.19: Vollständige Kostenberechnung dokumentiert
        - Gesamtkosten = Variable Kosten + Fixkosten + Imbalance Kosten
        - Formeln für jede Komponente erklärt
    
    - **Mögliche Verbesserungen:**
      * **Tooltips/InfoLabels:** Neben jedem Wert in den Results
      * **Visual Breakdown:** Stacked Bar Chart (Revenue vs. Costs)
      * **Formel-Anzeige:** "Show Calculation" Button für jeden KPI
      * **Sankey Diagram:** Fluss von Revenue zu Profit (via Costs)
      * **Comparison View:** Runde vs. Runde, Baseline vs. Current
    
    - **Rückfrage an Feedback-Geber:**
      Welche konkreten Zusammenhänge sind aktuell unklar oder schwer nachvollziehbar?
      * Wie Profit aus Revenue und Costs berechnet wird?
      * Wie Imbalance Costs zustande kommen?
      * Wie Curtailment den Profit beeinflusst?
      * Wie DA- und ID-Revenue zusammenhängen?
      * Wie Fixkosten vs. Variable Kosten wirken?
      * Andere Zusammenhänge?
      
      Welche Darstellungsform würde helfen?
      * Graphische Visualisierung (Chart/Diagram)?
      * Step-by-Step Breakdown mit Zahlen?
      * Vergleichstabellen (Plan vs. Actual)?
      * "What-If"-Rechner für Szenarien?
      * Video-Tutorial oder animierte Erklärung?
    
    - Bewertung: High Impact, Medium Effort (UI-Design + Backend-Calculation-Endpoint)
    - Status: Grundformeln dokumentiert (1.19), Visualisierung/UX-Design erbeten


## 3) Fehler im Spiel (einzeln bewerten und fixen)

1. Pilot instructions say the player is a load, but the game uses a coal generator.
   - Fehler: Instructions/Briefing zeigen falsche Rolle (Load statt Generator)
   - **Analyse:**
     * Das **Briefing-System selbst ist neutral** und zeigt lediglich die konfigurierten Player Types an
     * Keine fest codierten rollenspezifischen Annahmen im automatisch generierten Teil
     * Der Fehler liegt in der **Scenario-Beschreibung im KSE** (Tab "Description")
   
   - **Einschränkung:**
     * Der KSE unterstützt aktuell **keine player-type-spezifischen Briefings**
     * Das Briefing ist **einheitlich für alle Player Types**, da die Auswahl erst beim Briefing erfolgt
     * Alle Player sehen dieselbe Scenario-Beschreibung
   
   - **Lösung:**
     * Im **KSE (Tab "Description")** müssen alle Player Types beschrieben werden:
       ```markdown
       ## Rollen in diesem Szenario:
       
       **Producer (Coal Generator):**
       - Sie betreiben ein Kohlekraftwerk mit 600 MW Kapazität
       - Marginal Cost: 600 ZAR/MWh
       - Ziel: Maximieren Sie Ihren Profit durch strategisches Bidding
       
       **Consumer (Industrial Load):**
       - Sie verwalten eine industrielle Last
       - Ziel: Minimieren Sie Ihre Beschaffungskosten
       
       Wählen Sie Ihre Rolle auf dem nächsten Screen.
       ```
     * **Handbücher:** Separate Abschnitte für Producer vs. Consumer
   
   - Severity: High (Rollenverwirrung)
   - Fix: Scenario-Beschreibungen im KSE korrigieren und vollständig dokumentieren
   - Status: Ursache identifiziert, Lösung dokumentiert

2. Session objectives on Page 2 do not align with objectives on Page 1.
   - Fehler: Objectives im Briefing stimmen nicht mit angezeigten Objectives überein
   - **Analyse des Briefing-Systems:**
   
   **Automatisch generierte Teile** (aus KSE-Parametern):
   - **Session Details:**
     * Total Rounds (`general.rounds`)
     * Round Duration (`general.round_span_hours`)
     * Forecast Horizon (`general.forecast_horizon_hours`)
     * Timer per Round (`general.round_duration_seconds`)
   - **Markets:**
     * Price Range (`market.price_floor`, `market.price_cap`)
     * Markets Active (DA, IDM, Balancing) - fest codiert
   - **Grid Configuration:**
     * Number of Zones (`grid.zones`)
     * Transmission Loss (2%) - fest codiert
   - **Player Types:**
     * Name, Description, Zone, Devices (`config.player_types[]`)
   - **Challenges:**
     * Liste aller Challenges mit Details (`config.challenges[]`)
   
   **Manuell konfigurierbare Teile** (im KSE gepflegt):
   - **Scenario Name** (`config.name`)
   - **Scenario Description** (`config.description`) - **DAS IST DER HAUPTTEIL!**
   - **Objectives** (`config.objectives`) - **HIER LIEGT DAS PROBLEM**
   
   **Ursache des Fehlers:**
   - Im Pilot-Scenario wurden unterschiedliche Objectives im KSE hinterlegt vs. in der Dokumentation beschrieben
   - Das Feld `config.objectives` wird im Briefing-Screen angezeigt
   - Wenn dieses Feld leer ist, wird ein Default-Text verwendet: "Maximize profit while maintaining grid stability and minimizing imbalances."
   
   **Lösung:**
   - Im **KSE Tab "Description"** müssen die Objectives konsistent gepflegt werden
   - Objectives sollten mit den Challenges abgestimmt sein
   - Empfehlung: Objectives als Bullet-Point-Liste formatieren:
     ```
     - Maximize profit through strategic bidding
     - Minimize imbalance costs (< 5% of revenue)
     - Achieve break-even revenue target (4,000,000 ZAR)
     ```
   
   - Severity: Medium (Inkonsistenz verwirrt Spieler)
   - Fix: Scenario-Designer müssen Objectives-Feld im KSE korrekt pflegen
   - Status: System funktioniert korrekt, Scenario-Daten müssen korrigiert werden

3. Forecast horizon shown as 48h, beyond market horizon.
   - Fehler: Forecast Horizon (48h) größer als Markt-Horizont
   - **Analyse:**
     * Dies ist **kein Fehler**, sondern eine Konfigurationsentscheidung
     * `forecast_horizon_hours` ist im KSE frei einstellbar
     * Siehe ausführliche Antwort in **1.8**
   - Severity: None (kein Fehler)
   - Fix: Keine Aktion erforderlich, Trainer kann Werte im KSE anpassen
   - Status: Siehe Antwort 1.8

4. Price cap shown as 0-5000 ZAR/MWh not aligned with SAWEM.
   - Fehler: Price Cap (5000) weicht von SAWEM (~1100) ab
   - **Analyse:**
     * Dies ist **kein Fehler**, sondern eine Konfigurationsentscheidung
     * `market.price_cap` ist im KSE frei einstellbar
     * Siehe ausführliche Antwort in **1.7**
   - Severity: None (kein Fehler)
   - Fix: Keine Aktion erforderlich, Trainer kann Wert auf 1100 setzen für SAWEM-Konformität
   - Status: Siehe Antwort 1.7

5. Gate closure time set to 12h, not aligned with SAWEM timeline.
   - Fehler: Gate Closure (12h) weicht von SAWEM ab
   - **Analyse:**
     * Dies ist **kein Fehler**, sondern eine Konfigurationsentscheidung
     * `day_ahead_gate_hour` ist im KSE frei einstellbar
     * Siehe ausführliche Antwort in **1.17**
   - Severity: None (kein Fehler)
   - Fix: Keine Aktion erforderlich, Trainer kann Wert entsprechend SAWEM anpassen
   - Status: Siehe Antwort 1.17

6. MCP displayed as a single value for 24h in DAM results.
   - Fehler: Einzelner MCP-Wert statt stündlicher Werte
   - **Analyse:**
     * Dies ist **kein Fehler**, sondern gewolltes Design-Feature
     * Lot Breakdown zeigt Durchschnitts-SMP für Übersichtlichkeit
     * Hourly Breakdown zeigt bereits individuelle SMPs pro Stunde
     * Siehe ausführliche Antwort in **1.20**
   - Severity: Low (Missverständnis durch Label)
   - Fix: Label von "MCP" zu "Avg. SMP" oder "Ø SMP" ändern
   - Status: Siehe Antwort 1.20, Label-Verbesserung vorgemerkt

7. Variable cost calculation not matching displayed numbers.
   - Fehler: Variable Kosten stimmen scheinbar nicht mit Berechnung überein
   - **Analyse:**
     * Berechnungsformel ist korrekt und vollständig dokumentiert in **1.19**
     * Variable Cost = Σ(Dispatched MWh × Marginal Cost) über alle Stunden
     * Mögliche Ursachen für wahrgenommene Diskrepanzen:
       - Rundung auf 0 Dezimalstellen in der Anzeige
       - Aggregation über mehrere Devices
       - Fixkosten und Imbalance Kosten werden separat ausgewiesen
       - Zeitpunkt der Anzeige (vor/nach Imbalance-Settlement)
   - Severity: Low (kein Berechnungsfehler, ggf. Darstellungsproblem)
   - Fix: Tooltips mit Berechnungsdetails hinzufügen (siehe 2.15)
   - Status: Siehe Antwort 1.19, Berechnung korrekt, Transparenz verbessern

8. “Curtailment” label unclear for coal generator results.
   - Fehler: Begriff "Curtailment" für konventionelles Kraftwerk verwirrend
   - **Analyse:**
     * "Curtailment" wird typischerweise für Renewables verwendet (erzwungene Abregelung)
     * Für konventionelle Kraftwerke sind andere Begriffe klarer
     * Siehe ausführliche Diskussion in **1.18** mit Alternativ-Vorschlägen
   - Severity: Low-Medium (Terminologie-Klarheit)
   - Fix: Begriff durch "Not Cleared", "Undispatched Volume" oder "Non-Scheduled" ersetzen
   - Status: Siehe Antwort 1.18, Terminologie-Präferenz erbeten

9. First 12 hours locked in IDM despite IDM flexibility.
   - Fehler: Erste Stunden im IDM sind gesperrt
   - **Analyse:**
     * Das Locking erfolgt **gate-basiert**, nicht pauschal "erste X Stunden"
     * IDM Gate Logic ist vollständig implementiert und konfigurierbar
     * Die wahrgenommene Sperrung resultiert aus der Runde-1-Sonderbehandlung (DA Setup)
     * Siehe ausführliche Erklärung in **1.22**
   - Severity: None (kein Fehler)
   - Fix: Runde-1-Baseline-Mode wird vollständig konfigurierbar gemacht (bereits geplant)
   - Status: Siehe Antwort 1.22, System funktioniert korrekt

10. UI labels and descriptions use non-standard terms (e.g., “lower prices dispatch first”).
    - Fehler: Nicht-Standard-Terminologie in UI-Texten
    - **Analyse:**
      * Mehrere UI-Elemente verwenden vereinfachte oder missverständliche Begriffe
      * Siehe detaillierte Diskussionen:
        - **1.14:** "System Demand" vs "Your Bid Volume"
        - **1.18:** "Curtailment" vs "Not Cleared"
        - **1.21:** "Planned" vs "Dispatched"
        - **1.23:** "Adjustable figure" unvollständig beschriftet
        - **2.11:** Umfassende Terminologie-Rückfrage
      * Beispiele für problematische Formulierungen:
        - "Lower prices dispatch first" → "Bids are cleared from lowest to highest price"
        - "Dispatched energy receives" → "All cleared bid volumes receive the SMP"
        - "Enter power per hour" → "Your hourly bid volume (MW)"
    
    - Severity: Low-Medium (Lernkurve, aber kein funktionaler Fehler)
    - Fix: 
      * UI-Texte durchgehen und an Standard-Markt-Terminologie anpassen
      * Konsistenz zwischen allen Screens sicherstellen
      * Feedback-Geber-Präferenzen aus Antworten 1.18, 1.21, 2.11 einarbeiten
    - Status: Mehrere Stellen identifiziert, systematische Text-Überarbeitung erforderlich
