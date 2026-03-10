# Pilot 1 Feedback → Ticket Backlog

Quelle: [docs/feedback_analysis.md](docs/feedback_analysis.md)
Stand: 06.03.2026

## Ziel dieses Dokuments
- Feedback aus Pilot 1 in umsetzbare Tickets überführen.
- Pro Ticket klar zuordnen:
  - **Scenario-Design** = ohne Coding lösbar (Konfiguration, Content, Didaktik)
  - **Applikation** = Coding erforderlich (Frontend/Backend)

## Priorisierungslogik
- **P1** = hoher Lerneffekt / hohe Verwirrung / direkter Session-Impact
- **P2** = klarer UX-/Transparenzgewinn
- **P3** = Nice-to-have / Erweiterung

---

## A) Scenario-Design Tickets (ohne Coding)

### SD-01 — Rollenbeschreibung im Briefing korrigieren und vereinheitlichen
- **Typ:** Scenario-Design
- **Priorität:** P1
- **Problem:** Teilweise Rollenkonflikt (Load vs. Coal Generator) in Briefing-/Pilottexten.
- **Umsetzung:** Für jedes Szenario im KSE-Description-Feld beide Rollen explizit und konsistent beschreiben.
- **Akzeptanzkriterien:**
  - Briefing enthält korrekte Rollen-/Asset-Beschreibung.
  - Keine widersprüchlichen Begriffe zwischen Seite 1/2.

### SD-02 — Objectives und Challenges synchronisieren
- **Typ:** Scenario-Design
- **Priorität:** P1
- **Problem:** Session-Objectives und Challenge-Logik wirken inkonsistent.
- **Umsetzung:** Objectives direkt aus Challenge-Set ableiten (oder manuell 1:1 spiegeln).
- **Akzeptanzkriterien:**
  - Jede Objective hat eine nachweisbare Challenge-Entsprechung.
  - Keine Default-Objectives, wenn szenariospezifische Ziele definiert sind.

### SD-03 — SAWEM-Konfigurationsprofil als Szenario-Template
- **Typ:** Scenario-Design
- **Priorität:** P1
- **Problem:** Price Cap / Gate-Zeiten wirken „falsch“, obwohl konfigurierbar.
- **Umsetzung:** Ein SAWEM-Template mit empfohlenen Defaults (z. B. Cap, Gate, Horizonte) bereitstellen.
- **Akzeptanzkriterien:**
  - Template ist in KSE nutzbar.
  - Pilot-/Training-Szenarien können klar als „SAWEM-konform“ markiert werden.

### SD-04 — Round-1-Baseline-Modus pro Szenario bewusst festlegen
- **Typ:** Scenario-Design
- **Priorität:** P1
- **Problem:** Verwirrung durch DAM/IDM-Sonderfall in Runde 1.
- **Umsetzung:** Pro Szenario den Modus explizit wählen und im Briefing erklären (`device_default`, `zero`, `setup_round`).
- **Akzeptanzkriterien:**
  - Gewählter Modus ist dokumentiert.
  - Trainer kann Modus vor Session-Start klar kommunizieren.

### SD-05 — Briefing-Inhalte standardisieren (Produkte, Tageskontext, Assets)
- **Typ:** Scenario-Design
- **Priorität:** P2
- **Problem:** Uneinheitliche Tiefe der Szenarioeinführung.
- **Umsetzung:** Briefing-Template mit Pflichtabschnitten (aktive Märkte, Day Context, Portfolioblick, Ziele).
- **Akzeptanzkriterien:**
  - Alle neuen Szenarien folgen dem Template.
  - Briefing deckt dieselben Kernfragen ab.

### SD-06 — Komplexitätsstufen im Szenariodesign definieren
- **Typ:** Scenario-Design
- **Priorität:** P2
- **Problem:** Advanced-Features (z. B. Verluste/Zonen) überfordern teils Beginner.
- **Umsetzung:** Drei Level-Profile definieren (Beginner/Intermediate/Advanced) mit klaren Parametern.
- **Akzeptanzkriterien:**
  - Dokumentierte Parameter-Sets pro Level.
  - Trainer kann Szenarien klar einem Level zuordnen.

### SD-07 — Terminologie-Leitfaden für Trainer/Designer
- **Typ:** Scenario-Design
- **Priorität:** P2
- **Problem:** Uneinheitliche Begriffe in Einweisung und Debrief.
- **Umsetzung:** Glossar mit „empfohlener Begriff je Kontext“ (Didaktik vs. Marktstandard).
- **Akzeptanzkriterien:**
  - Leitfaden liegt im Docs-Bereich vor.
  - Briefing-/Handbook-Texte referenzieren denselben Wortschatz.

### SD-08 — Relative Zielwerte im Szenario verpflichtend definieren
- **Typ:** Scenario-Design
- **Priorität:** P2
- **Problem:** Ziele wirken statisch statt performance-orientiert.
- **Umsetzung:** Bei Challenges systematisch relative Targets verwenden, wo sinnvoll (z. B. Rate/ Coverage/Avg per Round).
- **Akzeptanzkriterien:**
  - Mindestens ein relatives Ziel pro Rolle im Szenario.
  - Zielbegründung in Szenario-Doku vorhanden.

### SD-09 — Quick-Start Guides je Rolle ergänzen
- **Typ:** Scenario-Design
- **Priorität:** P2
- **Problem:** Handbücher existieren, aber Onboarding kann weiter verdichtet werden.
- **Umsetzung:** 1-seitige Quick Starts für Player/Trainer/Designer/Admin.
- **Akzeptanzkriterien:**
  - Quick Start je Rolle abrufbar.
  - Trainer kann vor Session in <5 Minuten einweisen.

---

## B) Applikations-Tickets (Coding erforderlich)

### APP-01 — KSE „Markets“-Matrix je Runde (DAM/IDM/BAL: On/Market Code/Off)
- **Typ:** Applikation
- **Priorität:** P1
- **Problem:** Marktaktivität je Runde ist nicht ausreichend transparent/steuerbar in einer Matrix.
- **Umsetzung:** Neuer KSE-Tab mit Rundenspalten und Marktzeilen inkl. 3-State-Option.
- **Akzeptanzkriterien:**
  - Matrix persistiert im Szenario.
  - Engine respektiert Zustände je Runde.

### APP-02 — Trainer-Button „+1 Minute“ (live Timer-Extension)
- **Typ:** Applikation
- **Priorität:** P1
- **Problem:** Laufzeitverlängerung während aktiver Runde wird explizit benötigt.
- **Umsetzung:** Session-Control Aktion + Backend-Endpunkt für sichere Zeitverlängerung.
- **Akzeptanzkriterien:**
  - Verlängerung ohne Neustart möglich.
  - Alle Teilnehmer sehen konsistenten Timer.

### APP-03 — Merit-Order/Market-Structure Hour Selector im Player UI
- **Typ:** Applikation
- **Priorität:** P1
- **Problem:** 6h Bidding vs. Snapshot einer einzelnen Stunde wirkt widersprüchlich.
- **Umsetzung:** Stundenselektor für Marktstruktur-Ansicht innerhalb der Runde.
- **Akzeptanzkriterien:**
  - Nutzer kann Stunden innerhalb des Round-Windows durchschalten.
  - Angezeigte Kurve/SMP passt zur gewählten Stunde.

### APP-04 — Terminologie-Refactor im Player UI
- **Typ:** Applikation
- **Priorität:** P1
- **Problem:** Mehrere Begriffe sind missverständlich („planned/dispatched/curtailment“ etc.).
- **Umsetzung:** Systematische Textüberarbeitung + einheitliche Label-Matrix.
- **Akzeptanzkriterien:**
  - Konsistente Begriffe über Bid, Results, Timeline.
  - Keine widersprüchlichen Formulierungen zwischen Views.

### APP-05 — KPI-Erklärungen mit formelbasierter Transparenz
- **Typ:** Applikation
- **Priorität:** P1
- **Problem:** Nutzer verstehen Kosten-/Profitbeziehungen nicht vollständig.
- **Umsetzung:** „Show Calculation“-Darstellung (Revenue, Variable, Fixed, Imbalance, Net).
- **Akzeptanzkriterien:**
  - KPI-Formel je Wert einblendbar.
  - Summen stimmen mit Detailansichten überein.

### APP-06 — Tooltips/Help-Layer gezielt erweitern
- **Typ:** Applikation
- **Priorität:** P2
- **Problem:** Teilweise vorhandene Hilfen, aber Lücken an kritischen UI-Stellen.
- **Umsetzung:** Kontext-Tooltips für identifizierte Begriffe/Elemente (Bid-Editor, Results, Timeline).
- **Akzeptanzkriterien:**
  - Definierte Hotspots haben Hilfetexte.
  - Tooltips sind rollen- und kontextgerecht.

### APP-07 — Beginner Mode (Guided Flow)
- **Typ:** Applikation
- **Priorität:** P2
- **Problem:** Einstiegshürde für neue Spieler.
- **Umsetzung:** Optionaler Tutorial-/Guided-Overlay-Flow mit Schrittführung.
- **Akzeptanzkriterien:**
  - Modus pro Szenario aktivierbar.
  - Nutzer kann Guide abschließen/überspringen.

### APP-08 — Dynamische Bid-Figur vereinfachen (UX Iteration)
- **Typ:** Applikation
- **Priorität:** P2
- **Problem:** Editor wirkt komplex/überladen.
- **Umsetzung:** Vereinfachte Ansicht + optionale Advanced-Controls.
- **Akzeptanzkriterien:**
  - Beginner-Ansicht reduziert visuelle Komplexität.
  - Volumenbearbeitung bleibt vollständig möglich.

### APP-09 — Player-Zone im Live-UI sichtbar machen
- **Typ:** Applikation
- **Priorität:** P2
- **Problem:** Zonenbezug ist während der Session nicht prominent.
- **Umsetzung:** Zone-Badge in Header/Device-Kontext anzeigen.
- **Akzeptanzkriterien:**
  - Aktive Zone ist jederzeit ersichtlich.
  - Keine Verwechslung bei Multi-Zonen-Szenarien.

### APP-10 — Grid-Topologie/Transferlimits im Briefing visualisieren
- **Typ:** Applikation
- **Priorität:** P2
- **Problem:** Grid-Funktionen vorhanden, aber Darstellung schwach.
- **Umsetzung:** Briefing-Komponente für Zonen/ATC/Losses.
- **Akzeptanzkriterien:**
  - Spieler sieht Transfergrenzen verständlich.
  - Visual ist mit Szenariokonfig konsistent.

### APP-11 — Carbon Intensity als Device-Attribut + KPI/Challenge-Anbindung
- **Typ:** Applikation
- **Priorität:** P3
- **Problem:** CO₂-Aspekte nur eingeschränkt als Lernziel nutzbar.
- **Umsetzung:** Device-Parameter, Ergebnisanzeige, optionale CO₂-Challenges.
- **Akzeptanzkriterien:**
  - CO₂-Intensität konfigurierbar und sichtbar.
  - Emissionskennzahl erscheint in Results.

### APP-12 — Begriff „MCP“ als Durchschnitt labeln + stündliche Ansicht leichter erreichbar
- **Typ:** Applikation
- **Priorität:** P2
- **Problem:** Einzelwert wird als stündlicher MCP missverstanden.
- **Umsetzung:** Label auf `Avg. SMP/Ø SMP` ändern + Link zur Stundenansicht.
- **Akzeptanzkriterien:**
  - Kein Missverständnis über Aggregationsniveau.
  - Nutzer findet stündliche Werte ohne Umweg.

### APP-13 — Rollen-/PlayerType-spezifisches Briefing
- **Typ:** Applikation
- **Priorität:** P3
- **Problem:** Ein gemeinsamer Briefing-Text kann rollenübergreifend widersprüchlich werden.
- **Umsetzung:** Optionaler briefing_text je PlayerType.
- **Akzeptanzkriterien:**
  - Spieler sieht rollenspezifische Einweisung nach Typauswahl.
  - Fallback auf globalen Text bleibt erhalten.

### APP-14 — Zusätzliche relative KPI-Metriken (Baseline-Verbesserung, Effizienz)
- **Typ:** Applikation
- **Priorität:** P3
- **Problem:** Gewünschte relative Zielmetriken sind nur teilweise vorhanden.
- **Umsetzung:** Neue Metriken (z. B. vs. baseline, profit_per_mwh).
- **Akzeptanzkriterien:**
  - Metriken in Challenge-Editor auswählbar.
  - Berechnung in Results nachvollziehbar.

---

## C) Bereits heute lösbar (kein Coding nötig)

Diese Punkte sind laut Analyse primär **Konfiguration/Prozess**, kein neues Feature:
- DAM-only über `general.rounds = 1` bzw. Marktaktivierung.
- Rundendauer/IDM-Fokus bis auf 1h über `general.round_span_hours = 1`.
- Forecast-Horizont vs. Markt-Horizont bewusst einstellen.
- Price Cap / DA Gate nach SAWEM-Profil setzen.
- ID-Gate-Logik über `id_gate_interval_hours` und `id_gate_base_hour` steuern.
- Szenario-Briefing mit Produkt-/Tages-/Asset-Kontext pflegen.
- Challenges über bestehende Metriken rollenbezogen setzen.
- Revenue-/Challenge-Targets sind im KSE frei je Szenario/Rolle definierbar.

---

## D) Empfohlene Umsetzungsreihenfolge

1. **P1 zuerst**: APP-01, APP-02, APP-03, APP-04, APP-05, SD-01, SD-02, SD-03, SD-04
2. **P2 danach**: APP-06, APP-08, APP-09, APP-10, APP-12, SD-05, SD-06, SD-07, SD-08, SD-09
3. **P3 als Ausbau**: APP-07, APP-11, APP-13, APP-14

---

## E) Offene Klärungen aus dem Feedback
- Gewünschte Standard-Terminologie (SAWEM-nah vs. didaktisch vereinfacht).
- Priorisierte Tutorial-Inhalte für Beginner Mode (Top 3–5 Themen).
- Präferenzbegriffe für „Curtailment“ bei konventionellen Assets.
- Bedarf an zusätzlichen relativen KPI-Metriken.

---

## F) Implementation Check (Stand: 06.03.2026)

Status-Legende:
- **Implemented** = weitgehend wie Ticketziel vorhanden
- **Partial** = Teilaspekte vorhanden, Ticketziel noch nicht vollständig
- **Open** = aktuell nicht implementiert
- **Closed** = fachlich entschieden/abgeschlossen

| Ticket | Status | Einordnung | Kommentar |
|---|---|---|---|
| APP-01 | **Closed** | Abgeschlossen (fachliche Entscheidung) | DAM/IDM-Matrix ist umgesetzt. **BAL wird bewusst nicht abschaltbar gemacht** (Overbid-Fall); Imbalance aus Noise kann im KSE auf 0 gesetzt werden. |
| APP-02 | **Implemented** | Weitgehend umgesetzt | Trainer `+1 minute` inkl. Backend-Endpunkt vorhanden. |
| APP-03 | **Open** | Nicht umgesetzt | Kein expliziter Hour-Selector für die Market-Structure-Kurve im Player-Panel. |
| APP-04 | **Partial** | Teilweise umgesetzt | Terminologie-Harmonisierung existiert in Teilen, aber kein vollständiger End-to-End-Refactor über alle Screens. |
| APP-05 | **Implemented** | Weitgehend umgesetzt | KPI-Breakdowns/Formeln (u. a. Profit/Revenue) sind vorhanden. |
| APP-06 | **Partial** | Teilweise umgesetzt | Viele Tooltips/Info-Hinweise existieren, aber kein systematisch abgeschlossener Help-Layer über alle Hotspots. |
| APP-07 | **Open** | Nicht umgesetzt | Kein dedizierter Beginner-/Guided-Mode mit Schrittführung. |
| APP-08 | **Partial** | Teilweise umgesetzt | Editor hat bereits vereinfachte Bedienpfade (z. B. Chart/Fields-Toggle), aber kein vollständiger „Beginner-first“-Flow. |
| APP-09 | **Open** | Nicht umgesetzt | Keine prominente, persistente Player-Zonenanzeige im Live-Player-UI bestätigt. |
| APP-10 | **Partial** | Teilweise umgesetzt | Briefing zeigt Grid-Basisinfos (Zonen/Verluste), aber keine klare Topologie-/Transferlimit-Visualisierung. |
| APP-11 | **Partial** | Teilweise umgesetzt | CO₂ als Device-Attribut + KPI ist vorhanden; vollständige Challenge-Integration als eigenes Feature noch ausbaufähig. |
| APP-12 | **Partial** | Teilweise umgesetzt | Stündliche Werte sind teils verfügbar, aber gewünschte eindeutige Umbenennung/Guidance (`Avg. SMP/Ø SMP`) ist nicht konsistent abgeschlossen. |
| APP-13 | **Partial** | Teilweise umgesetzt | Rollen-/Typkontext im Briefing vorhanden; kein separates `briefing_text` je PlayerType mit klarer Fallback-Logik als eigenes Feld bestätigt. |
| APP-14 | **Partial** | Teilweise umgesetzt | Einige relative Metriken vorhanden (z. B. Durchschnittswerte), aber nicht der volle gewünschte Satz (z. B. baseline-improvement/profit_per_mwh) als klarer Ausbau. |
| APP-15 | **Partial** | Fehlender Punkt ergänzt | Gate-/Lock-Logik ist bereits konfigurierbar und technisch umgesetzt; gewünschte didaktische/marktnähere Default-Policy je Level/Szenario ist noch offen. |
| APP-16 | **Implemented** | Fehlender Punkt ergänzt | Shared/Cohort-Mehrspielerfluss ist im Frontend/Backend vorhanden (Session-Control, Cohorts, shared market mode). |
| APP-17 | **Partial** | Fehlender Punkt ergänzt | Handbücher/Guides wurden erweitert; trotzdem bleibt Bedarf an stärker vereinfachtem, einsteigerzentriertem Quick-Start laut Pilotfeedback. |
| APP-18 | **Open** | Fehlender Punkt ergänzt | Marktmodell-UX klären: deutlicher trennen zwischen eigener Gebotsmenge vs. Systemnachfrage sowie verständlichere Erklärung der Lot-/Block-Logik. |
| SD-10 | **Open** | Fehlender Punkt ergänzt | Governance-/Content-Abstimmung (NTCSA/PFL/GIZ) für finalen Imprint und finale Spielbeschreibung. |

### Codeanalyse-Notizen (kompakt)
- **Trainer-Zeitverlängerung** ist implementiert (Shared/aktive Runde).
- **Multiplayer/Shared Mode** ist implementiert (Cohorts, Shared Sessions, Trainer-Steuerung).
- **IDM-/Gate-Konfiguration** ist implementiert, aber die gewünschte Marktnähe hängt stark von den gewählten Szenario-Defaults ab.

---

## G) Assignment Matrix (EN)

| Ticket | Category | Priority | Assignment (App/Scenario) | Implementation Status |
|---|---|---|---|---|
| SD-01 | Scenario-Design | P1 | Scenario | Planned |
| SD-02 | Scenario-Design | P1 | Scenario | Planned |
| SD-03 | Scenario-Design | P1 | Scenario | Planned |
| SD-04 | Scenario-Design | P1 | Scenario | Planned |
| SD-05 | Scenario-Design | P2 | Scenario | Planned |
| SD-06 | Scenario-Design | P2 | Scenario | Planned |
| SD-07 | Scenario-Design | P2 | Scenario | Planned |
| SD-08 | Scenario-Design | P2 | Scenario | Planned |
| SD-09 | Scenario-Design | P2 | Scenario | Planned |
| SD-10 | Scenario-Design | P3 | Scenario | Open |
| APP-01 | Application | P1 | App | Closed |
| APP-02 | Application | P1 | App | Implemented |
| APP-03 | Application | P1 | App | Open |
| APP-04 | Application | P1 | App | Partial |
| APP-05 | Application | P1 | App | Implemented |
| APP-06 | Application | P2 | App | Partial |
| APP-07 | Application | P2 | App | Open |
| APP-08 | Application | P2 | App | Partial |
| APP-09 | Application | P2 | App | Open |
| APP-10 | Application | P2 | App | Partial |
| APP-11 | Application | P3 | App | Partial |
| APP-12 | Application | P2 | App | Partial |
| APP-13 | Application | P3 | App | Partial |
| APP-14 | Application | P3 | App | Partial |
| APP-15 | Application | P2 | App+Scenario | Partial |
| APP-16 | Application | P2 | App | Implemented |
| APP-17 | Application | P2 | Scenario+App | Partial |
| APP-18 | Application | P2 | App | Open |

### G.1) Excel Export (EN, semicolon-separated)

```text
Ticket;Category;Priority;Assignment (App/Scenario);Implementation Status
SD-01;Scenario-Design;P1;Scenario;Planned
SD-02;Scenario-Design;P1;Scenario;Planned
SD-03;Scenario-Design;P1;Scenario;Planned
SD-04;Scenario-Design;P1;Scenario;Planned
SD-05;Scenario-Design;P2;Scenario;Planned
SD-06;Scenario-Design;P2;Scenario;Planned
SD-07;Scenario-Design;P2;Scenario;Planned
SD-08;Scenario-Design;P2;Scenario;Planned
SD-09;Scenario-Design;P2;Scenario;Planned
SD-10;Scenario-Design;P3;Scenario;Open
APP-01;Application;P1;App;Closed
APP-02;Application;P1;App;Implemented
APP-03;Application;P1;App;Open
APP-04;Application;P1;App;Partial
APP-05;Application;P1;App;Implemented
APP-06;Application;P2;App;Partial
APP-07;Application;P2;App;Open
APP-08;Application;P2;App;Partial
APP-09;Application;P2;App;Open
APP-10;Application;P2;App;Partial
APP-11;Application;P3;App;Partial
APP-12;Application;P2;App;Partial
APP-13;Application;P3;App;Partial
APP-14;Application;P3;App;Partial
APP-15;Application;P2;App+Scenario;Partial
APP-16;Application;P2;App;Implemented
APP-17;Application;P2;Scenario+App;Partial
APP-18;Application;P2;App;Open
```
