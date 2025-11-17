# Player Handbuch
## Energy Market Simulation Game (EMSG)

**Version:** 1.0  
**Datum:** 17. November 2025  
**Zielgruppe:** Spieler/Studierende

---

## Quick Guide – Das Wichtigste auf einen Blick

### Was ist EMSG?
EMSG ist eine webbasierte Energiemarkt-Simulation für den südafrikanischen Strommarkt (SAWEM). Sie spielen die Rolle eines Marktakteurs (Produzent, Verbraucher oder Hybrid) und treffen Entscheidungen über 24 simulierte Stunden in 4 Runden.

### Ihre erste Session – in 5 Schritten

1. **Login** → Geben Sie Ihre E-Mail und Ihr Passwort ein
2. **Home** → Wählen Sie ein Szenario aus dem Katalog oder einer zugewiesenen Kampagne
3. **Briefing** → Lesen Sie die Szenario-Ziele und Parameter
4. **Spielen** → Geben Sie Ihre stündlichen Prognosen (MWh) ein und reichen Sie sie pro Runde ein
5. **Auswertung** → Sehen Sie Ihre Ergebnisse (Profit, Imbalance, Curtailment) und vergleichen Sie sich mit anderen

### Kernkonzepte

- **Runde:** Eine Spielphase (Standard: 5 Minuten Echtzeit = 6 simulierte Stunden)
- **Forecast (Prognose):** Ihre geplante Einspeisung/Entnahme pro Stunde (in MWh oder MW)
- **Freeze-Horizon:** Die ersten 6 Stunden sind "Day-Ahead" und nach der ersten Runde gesperrt
- **Market Clearing Price (MCP):** Der vom Markt ermittelte einheitliche Preis (ZAR/MWh)
- **Imbalance:** Abweichung zwischen Prognose und tatsächlicher Erzeugung/Verbrauch → Strafkosten
- **Curtailment:** Abregelung Ihrer Erzeugung durch das System → Opportunitätsverluste

### Wichtigste Bedienelemente

| Element | Funktion |
|---------|----------|
| **Home** | Übersicht Ihrer Szenarien und Sessions |
| **Catalog** | Öffentliche Kampagnen durchsuchen |
| **Player** | Hauptspiel-Interface: Prognosen eingeben |
| **Countdown Timer** | Zeigt verbleibende Zeit der aktuellen Runde |
| **Save Full Forecast** | Speichert alle 24/48 Stunden (ohne Absenden) |
| **Submit Current Round** | Reicht die aktuelle Runde offiziell ein |
| **Charts (MCP/Volume)** | Zeigen Marktergebnisse über alle Runden |

### Spielmodi

- **Solo (isolated_per_player):** Privater Markt, nur Ihre Entscheidungen beeinflussen Ihr Ergebnis
- **Cohort (shared_market):** Gemeinsamer Markt mit anderen Spielern, kompetitiv

### Wichtige Regeln

1. **Zeit ist begrenzt:** Jede Runde hat einen festen Timer (z.B. 300s). Nach Ablauf keine Änderungen mehr möglich.
2. **Freeze respektieren:** Gesperrte Stunden (h1–h6 nach Runde 1) können nicht geändert werden.
3. **Validierung:** Ihre Eingaben werden auf Min/Max/Step-Grenzen geprüft.
4. **Speichern vs. Submit:** "Save" sichert Ihre Arbeit, "Submit" macht sie offiziell für die Runde.

### KPIs (Key Performance Indicators)

- **Profit (ZAR):** Gesamtgewinn = Revenue - Costs - Imbalance - Curtailment
- **Revenue (ZAR):** Einnahmen aus Marktverkäufen (MCP × Menge)
- **Imbalance Cost (ZAR):** Strafkosten für Prognosefehler
- **Curtailment Cost (ZAR):** Verluste durch Abregelung

---

## Ausführliche Dokumentation

### 1. Erste Schritte

#### 1.1 Registrierung und Login

**Registrierung**
- URL: `/register`
- Felder:
  - **Email:** Ihre E-Mail-Adresse (eindeutig, wird als Login verwendet)
  - **Password:** Mindestens 6 Zeichen
  - **Confirm Password:** Muss mit Passwort übereinstimmen
- Button: **Register**
- Nach Registrierung: Status "pending" – warten Sie auf Freigabe durch einen Admin oder Trainer
- Optional: Registrierung per Einladungslink (dann sofortige Freigabe und automatische Cohort-Zuordnung)

**Login**
- URL: `/login`
- Felder:
  - **Email:** Ihre registrierte E-Mail
  - **Password:** Ihr Passwort
- Button: **Login**
- Nach Login: Automatische Weiterleitung zu `/home` (Player Dashboard)
- Fehler: "Invalid credentials" → Passwort/Email prüfen; "User not approved" → Admin kontaktieren

**Logout**
- Klick auf Ihr Profil-Icon (oben rechts) → **Logout**
- Sie werden zu `/login` weitergeleitet

---

#### 1.2 Home Screen – Ihre Übersicht

**URL:** `/home`

**Zweck:** Zentrale Anlaufstelle für alle Ihre Szenarien und Sessions.

**Bereiche:**

1. **Header**
   - Zeigt: "My Scenarios" oder "Welcome, [Ihr Name]"
   - Navigation: Home | Catalog | Player (Tabs)

2. **Scenario Cards (Zugewiesene Szenarien)**
   - Anzeige: Alle Szenarien, die Ihnen über Cohorts zugewiesen wurden
   - Pro Card:
     - **Szenario-Name:** z.B. "Intro to SAWEM"
     - **Status-Chip:** "Not Started" | "In Progress" | "Completed"
     - **Session Info:** Trainer-Name, Cohort, Session-ID (falls aktiv)
     - **Buttons:**
       - **Briefing:** Öffnet Szenario-Details (Ziele, Parameter, Regeln)
       - **Play:** Startet/fortsetzt das Spiel (öffnet `/player?sessionId=...`)
       - **Replay:** (nur nach Abschluss) Zeigt vergangene Runden-Details
   - Leer-Zustand: "No Scenarios Assigned" → Kontaktieren Sie Ihren Trainer

3. **Active Sessions (Laufende Sessions)**
   - Liste aktiver Sessions Ihrer Cohorts
   - Sortiert nach: Start-Zeit (neueste zuerst)
   - Pro Eintrag:
     - Szenario-Name
     - Status: "running" | "paused"
     - Current Round: z.B. "Round 2/4"
     - Button: **Join** → Öffnet `/player?sessionId=...`

4. **Recent Results (Letzte Ergebnisse)**
   - Ihre letzten 5 abgeschlossenen Sessions
   - Pro Eintrag:
     - Szenario-Name, Datum, Profit (ZAR)
     - Button: **View Details** → Öffnet Evaluation-Seite

**Interaktionen:**
- Klick auf Card → Briefing öffnen
- Klick auf "Play" → Player-Screen mit automatischem Session-Load
- Klick auf "Catalog" (Navigation) → Öffentliche Kampagnen durchsuchen

---

#### 1.3 Catalog – Öffentliche Kampagnen durchsuchen

**URL:** `/catalog`

**Zweck:** Entdecken Sie veröffentlichte Kampagnen (Lernpfade mit mehreren Szenarien) und starten Sie Solo-Sessions.

**Bereiche:**

1. **Campaign Cards**
   - Grid-Layout (2–3 Spalten)
   - Pro Card:
     - **Cover Image:** Quadratisches Bild (640×640px)
     - **Name:** Kampagnen-Titel
     - **Description:** Kurzbeschreibung (z.B. "Learn market basics")
     - **Progress Badge:** "3/5 Completed" (abgeschlossene Szenarien)
     - **Published Badge:** Grüner Chip "Published"
   - Klick auf Card → `/catalog/:id` (Campaign Detail)

2. **Campaign Detail**
   - **Header:** Name, Description, Cover
   - **Scenarios List:** Alle Szenarien in Designer-Reihenfolge
   - Pro Szenario:
     - **Name & Order:** z.B. "1. Basics" → "2. Advanced"
     - **Your Status:** "Not Started" | "In Progress" | "Completed"
     - **Buttons:**
       - **Play Solo:** (nur wenn `solo_enabled=true`) Startet eine private Session (isolated_per_player)
       - **Join Cohort:** (nur wenn `cohort_enabled=true` UND aktive Trainer-Session existiert) Liste aktiver Sessions → Auswahl → Join
     - Disabled-States:
       - "Solo not enabled" → Tooltip erklärt, dass Designer Solo deaktiviert hat
       - "No active session" → Keine Trainer-Session verfügbar
   - **Multiple Active Sessions:**
     - Dropdown: Wählen Sie Session nach Cohort/Trainer
     - Klick auf "Join" → Briefing oder direkt zu Player

**Workflow: Solo-Start**
1. Klick auf "Play Solo"
2. System erstellt automatisch Session (mode=isolated_per_player)
3. Weiterleitung zu `/player?sessionId=...`
4. Progress wird auf "in_progress" gesetzt
5. Nach Session-Ende: Progress → "completed"

**Workflow: Cohort-Join**
1. Klick auf "Join Cohort"
2. Auswahl aktiver Session (falls mehrere)
3. Weiterleitung zu `/briefing?sessionId=...`
4. Klick auf "Start Playing" → `/player?sessionId=...`

---

### 2. Das Spiel spielen

#### 2.1 Briefing Screen – Szenario-Vorbereitung

**URL:** `/briefing?sessionId=...`

**Zweck:** Lesen Sie Szenario-Ziele, Parameter und Regeln, bevor Sie starten.

**Bereiche:**

1. **Header**
   - Szenario-Name
   - Button: **Back to Home**

2. **Objectives (Ziele)**
   - Textblock mit Lernzielen (z.B. "Maximize profit as a Producer")
   - Optional: Rollenspezifische Hinweise

3. **General Parameters**
   - **Simulated Day:** Fiktives Datum (z.B. "2025-01-15")
   - **Start Time:** Fiktive Uhrzeit (z.B. "08:00")
   - **Rounds:** Anzahl Runden (z.B. "4")
   - **Round Duration:** Echtzeit pro Runde (z.B. "300s = 5 min")
   - **Forecast Horizon:** Anzahl Stunden (z.B. "48h")
   - **Freeze Hours:** Gesperrte Stunden (z.B. "6h Day-Ahead")

4. **Market Rules**
   - **Enabled Markets:** DA (Day-Ahead), IDM (Intraday), Balancing
   - **Price Floor/Cap:** z.B. "-500 / +5,000 ZAR/MWh"
   - **Imbalance Pricing:** Up-regulation +1,200 ZAR/MWh, Down-regulation +800 ZAR/MWh
   - **Transmission Losses:** z.B. "2%"

5. **Grid Configuration**
   - **Zones:** Anzahl Zonen (z.B. "2: Z1, Z2")
   - **ATC (Available Transfer Capacity):** z.B. "Z1↔Z2: 5,000 MW"

6. **Your Role & Devices**
   - **Player Type:** (nur shared_market) z.B. "Producer Type A"
   - **Assigned Devices:** Liste Ihrer Geräte (z.B. "solar_1, wind_2")
   - Pro Device:
     - ID, Type (solar/wind/gas/battery), Capacity (MW), Min Load, Ramp Rate
     - Costs: Marginal Cost (ZAR/MWh), Start-up Cost (ZAR)

7. **Events (Falls vorhanden)**
   - Systemische/gerätespezifische Events
   - Pro Event: Typ (systemic/device), Runde, Multiplier/Additive

8. **Scoring Weights**
   - KPI-Gewichtungen für Rangliste (z.B. "Profit: 50%, Imbalance: 30%, Curtailment: 20%")

**Buttons:**
- **Start Playing:** Öffnet `/player?sessionId=...`
- **Back to Home:** Zurück zu `/home`

---

#### 2.2 Player Screen – Hauptspiel-Interface

**URL:** `/player?sessionId=...`

**Zweck:** Geben Sie Ihre stündlichen Prognosen ein und reichen Sie sie pro Runde ein.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Scenario Name – Round X                             │
├───────────────┬─────────────────────────────────────────────┤
│               │                                             │
│  LEFT PANEL   │        RIGHT PANEL (Forecast Editor)       │
│               │                                             │
│ - Timer       │  - Hourly Input Fields (h1..h48)           │
│ - Session Info│  - Charts (Sparklines per device)          │
│ - Live KPIs   │  - Buttons: Save Full / Submit Current     │
│               │                                             │
└───────────────┴─────────────────────────────────────────────┘
│                BOTTOM: Market Charts (MCP, Volume)          │
└─────────────────────────────────────────────────────────────┘
```

---

**LEFT PANEL:**

1. **Countdown Timer**
   - Große Anzeige: "Time Remaining: 04:23" (MM:SS)
   - Farben:
     - Grün: >60s verbleibend
     - Orange: 31–60s
     - Rot: ≤30s
   - Bei 30s: Audio-Warnung (optional) + visueller Alert
   - Bei 0s: "Time is up! You can no longer submit this round." (Alert-Box)

2. **Session Info Card**
   - **Status:** Chip (grün: "active", grau: "paused", blau: "ended")
   - **Round:** z.B. "2 / 4"
   - **Forecast Horizon:** "48h"
   - **Locked until:** "h6" (Freeze-Grenze)

3. **Live KPIs Card**
   - **MCP (Round X):** Aktueller Market Clearing Price (ZAR/MWh)
   - **Volume:** Gesamtvolumen des Marktes (MWh)
   - Hinweis: "Waiting for market data..." (vor erstem Clearing)
   - Aktualisierung: Nach jeder Runde via WebSocket

---

**RIGHT PANEL (Forecast Editor):**

**Titel:** "Enter your hourly forecast (MWh)"  
**Tooltip:** "Provide the quantity per simulated hour. Hours ≤ freeze are locked to your Day-Ahead plan. Values are saved as a full horizon and submitted per round."

**Modi:**

**A) Isolated Per Player (Standard)**
- Ein einzelner Aggregat-Forecast (Summe über alle Ihre Geräte)
- Eingabefelder: h1, h2, ..., h48 (je nach Horizon)
- Pro Feld:
  - Label: "h1", "h2", etc.
  - Type: Number
  - Min/Max/Step: Vom Szenario definiert (z.B. 0–1000 MWh, Step 0.1)
  - Disabled: Ja, wenn `i < lockedUntil` (Freeze) ODER `timeRemaining === 0`
  - Tooltip: "Hour hX for your forecast"

**B) Shared Market (Player Types)**
- Mehrere Devices (pro Typ zugewiesen)
- Pro Device ein separater Abschnitt:
  - **Device ID:** z.B. "solar_1"
  - Eingabefelder: h1..h48 für dieses Device
  - Sparkline-Chart: Visualisierung der Eingaben (kleines SVG, 200×50px)
- Aggregat-Update: Summe über alle Type-Devices wird automatisch berechnet

**Interaktionen:**

1. **Eingabe per Textfeld**
   - Klick in Feld → Zahl eingeben
   - Tab/Enter → Nächstes Feld
   - Validation: Bei Blur (Fokus-Verlust) auf Min/Max/Step prüfen
   - Fehler: Rote Umrandung + Tooltip "Value must be between X and Y"

2. **Eingabe per Drag&Drop (optional, erweitert)**
   - Chart-basierter Editor (wenn implementiert)
   - Ziehen von Punkten/Segmenten
   - Snap-to-hour
   - Doppelklick: Punkt hinzufügen/entfernen
   - Tastatur: ↑/↓ um Step erhöhen/senken

**Buttons:**

- **Save Full Forecast**
  - Speichert alle 48h (oder Horizon) auf Server
  - POST `/api/player/forecast/full`
  - Payload: `{ session_id, hours: [0,0,...], devices?: [{device_id, hours}] }`
  - Erfolg: Snackbar "Full forecast saved"
  - Fehler: Snackbar "Save failed: [Fehlertext]"

- **Submit Current Round**
  - Reicht nur die Stunden der aktuellen Runde ein (z.B. h1–h6 für Runde 1)
  - POST `/api/player/forecast`
  - Payload: `{ session_id, round_num, hours: [slice], devices?: [...] }`
  - Erfolg:
    - Snackbar "Forecast submitted!"
    - Confetti-Effekt (animiert, nur wenn "prefers-reduced-motion" = false)
    - Stunden werden gesperrt (für nächste Runden)
  - Fehler: Snackbar "Submit failed: [Fehlertext]"
  - Disabled wenn: `timeRemaining === 0` ODER `status !== 'active'`

**Hinweise:**
- **Time is up!** Alert (rot) erscheint, wenn Timer auf 0
- **Please select your player type** Alert (blau), falls shared_market und Typ noch nicht gewählt

---

**BOTTOM: Market Charts**

**1. MCP Chart (Market Clearing Price over Rounds)**
- **X-Axis:** Round Number (1, 2, 3, 4)
- **Y-Axis:** MCP (ZAR/MWh)
- **Line:** Grün, 2px, durchgezogen
- **Gridlines:** Horizontale gestrichelte Linien
- **Tooltip:** Hover über Punkt → "Round X: MCP Y ZAR/MWh"
- **Axes Labels:**
  - X: "Round"
  - Y: "MCP (ZAR/MWh)"
- **Größe:** 360×120px
- **Update:** Nach jeder Runde via WebSocket-Event `market_cleared`

**2. Volume Chart (Market Volume over Rounds)**
- **X-Axis:** Round Number
- **Y-Axis:** Volume (MWh)
- **Line:** Blau, 2px
- **Tooltip:** "Round X: Volume Y MWh"
- **Axes Labels:**
  - X: "Round"
  - Y: "Volume (MWh)"
- **Größe:** 360×120px

**WebSocket-Events:**
- `round_start`: Countdown startet, neuer Timer
- `round_end`: Timer stoppt, "Time is up!" Meldung
- `market_cleared`: Live KPIs + Charts aktualisieren (MCP, Volume)
- `session_ended`: "Session has ended" Banner, alle Inputs disabled

---

#### 2.3 Player Type Selection Dialog (nur shared_market)

**Trigger:** Beim ersten Laden von `/player?sessionId=...` WENN:
- `mode === 'shared_market'`
- `allowed_player_types.length > 0`
- `selectedType === null` (noch nicht gewählt)

**Dialog:**
- **Title:** "Select your player type"
- **Content:**
  - Liste aller erlaubten Typen
  - Pro Typ:
    - **Name & ID:** z.B. "Producer A (ID: producer_a)"
    - **Remaining Capacity:** z.B. "5 / 10 slots" (grün: verfügbar, rot: voll)
    - **Button:** "Select"
  - Disabled wenn: `remaining === 0` (Typ voll)
- **Action:**
  - POST `/api/sessions/:id/join-type` `{ type_id }`
  - Erfolg: Dialog schließt, Devices laden, Forecast-Editor zeigt Device-Inputs
  - Fehler: Snackbar "Failed to join type: [Fehlertext]"

**Nachbedingung:**
- `selectedType` gesetzt
- `typeDevices` geladen (Device-IDs für diesen Typ)
- Device-basierte Forecast-Eingabe aktiviert

---

### 3. Nach dem Spiel

#### 3.1 Evaluation – Ihre Ergebnisse

**URL:** `/evaluation?sessionId=...` (oder `/player` mit Tab-Umschaltung)

**Zweck:** Detaillierte Analyse Ihrer Performance.

**Bereiche:**

1. **Summary KPIs (Karten-Layout)**
   - **Total Profit:** Summe über alle Runden (ZAR)
   - **Total Revenue:** Gesamteinnahmen (ZAR)
   - **Total Imbalance Cost:** Strafkosten (ZAR)
   - **Total Curtailment Cost:** Abregelungskosten (ZAR)
   - Farben: Grün (Profit), Blau (Revenue), Orange (Imbalance), Rot (Curtailment)

2. **Round-by-Round Table**
   - Spalten: Round | MCP | Your Forecast | Actual Gen/Load | Imbalance | Curtailment | Profit
   - Sortierung: Aufsteigend nach Runde
   - Highlights: Beste/schlechteste Runde (grün/rot Hintergrund)

3. **Charts**
   - **Profit Trend:** Line-Chart über Runden
   - **Imbalance per Round:** Bar-Chart
   - **Curtailment per Round:** Bar-Chart
   - **Forecast vs. Actual:** Overlay-Line-Chart (2 Linien: Prognose, tatsächlich)

4. **Benchmarking (Cohort-Vergleich)**
   - **Your Rank:** z.B. "Rank 3 / 15"
   - **Leaderboard Preview:** Top 5 Spieler (Name, Profit)
   - Button: **View Full Leaderboard** → `/leaderboard?sessionId=...`

5. **Feedback & Tipps**
   - Automatisch generierte Hinweise (falls implementiert):
     - "Your imbalance was high in Round 2. Consider more accurate forecasting."
     - "Great job! You achieved the highest profit."
   - Link zu Briefing/Replay für Wiederholung

**Export:**
- Button: **Download PDF Report**
  - Generiert PDF mit allen KPIs, Charts, Tabellen
  - Dateiname: `EMSG_Report_Session{ID}_{Datum}.pdf`

---

#### 3.2 Leaderboard – Rangliste

**URL:** `/leaderboard?sessionId=...`

**Zweck:** Vergleich aller Spieler einer Session.

**Bereiche:**

1. **Filters & Controls**
   - **Metric:** Dropdown (Profit | Revenue | Imbalance | Curtailment)
   - **Sort:** Dropdown (Best First | Worst First)

2. **Leaderboard Table**
   - Spalten: Rank | Player Name | Profit | Revenue | Imbalance | Curtailment | Rounds Completed
   - Highlight: Ihre Zeile (gelber Hintergrund)
   - Medaillen: 🥇🥈🥉 für Top 3

3. **Metric Bar Chart**
   - Horizontale Balken für ausgewählte Metrik (z.B. Profit)
   - X-Axis: Wert, Y-Axis: Player-Name
   - Farben: Grün (positiv), Rot (negativ)

**Export:**
- **PNG:** Button "Export PNG" → Download Chart als Bild
- **CSV:** Button "Export CSV" → Tabelle als CSV-Datei

---

#### 3.3 Replay Mode – Vergangene Runden ansehen

**URL:** `/replay?sessionId=...`

**Zweck:** Schritt-für-Schritt durch vergangene Runden navigieren und Entscheidungen analysieren.

**Bereiche:**

1. **Controls**
   - **Round Selector:** Dropdown (Runde 1, 2, 3, 4)
   - **Autoplay:** Button "Play" → automatisches Durchlaufen (1s pro Runde)
   - **Pause:** Button "Pause" → Autoplay stoppen

2. **Runden-Details**
   - **Ihre Prognose:** Tabelle h1..hX mit Ihren eingereichten Werten
   - **Market Clearing:** MCP, Volume
   - **Ihre KPIs:** Profit, Imbalance, Curtailment dieser Runde

3. **Historical Charts**
   - **Forecast Timeline:** Line-Chart Ihrer Prognose über alle Stunden dieser Runde
   - **Actual Generation/Load:** (falls verfügbar) Overlay mit tatsächlichen Werten

4. **Comparison to Others (optional)**
   - "Show Cohort Average" Toggle
   - Overlay: Durchschnittliche Prognose aller Spieler

**Navigation:**
- **← Previous Round / Next Round →** Buttons
- Tastatur: ← / → Pfeiltasten

---

### 4. Erweiterte Funktionen

#### 4.1 Profile & Settings

**URL:** `/profile` oder Dropdown → "My Profile"

**Bereiche:**

1. **Personal Info**
   - **Email:** (nicht änderbar)
   - **Display Name:** Änderbar (optional)
   - **Avatar:** Upload (optional, falls implementiert)

2. **Password Change**
   - **Current Password:** Eingabefeld
   - **New Password:** Mindestens 6 Zeichen
   - **Confirm New Password:** Muss übereinstimmen
   - Button: **Change Password**
   - Erfolg: Snackbar "Password updated"

3. **Preferences (optional)**
   - **Language:** Dropdown (EN | DE) – falls Mehrsprachigkeit implementiert
   - **Theme:** Toggle (Light | Dark)
   - **Audio Alerts:** Checkbox "Enable sound for timer warnings"
   - **Reduced Motion:** Checkbox "Disable animations (accessibility)"

4. **Session History**
   - Liste Ihrer letzten 20 Sessions
   - Pro Eintrag: Datum, Szenario, Profit, Status
   - Button: **View Details** → Evaluation

---

#### 4.2 Accessibility Features

**Tastatur-Navigation:**
- **Tab:** Nächstes Element
- **Shift+Tab:** Vorheriges Element
- **Enter:** Button aktivieren
- **Esc:** Dialog schließen
- **↑/↓:** Wert in Number-Feld um Step ändern

**Screen Reader Support:**
- Alle Buttons haben `aria-label` (z.B. "Submit forecast for current round")
- Charts haben `role="img"` und `aria-label` (z.B. "Market Clearing Price chart showing prices from Round 1 to 4")
- Fehlermeldungen haben `role="alert"` für sofortige Ankündigung

**Contrast & Farben:**
- WCAG 2.1 AA konform
- Text-zu-Hintergrund Kontrast ≥4.5:1
- Farben nicht als einzige Informationsquelle (zusätzlich Icons/Texte)

**Reduced Motion:**
- Confetti-Effekt wird deaktiviert, wenn `prefers-reduced-motion: reduce`
- Animationen (Charts, Transitions) respektieren System-Einstellung

---

### 5. Troubleshooting & FAQ

#### 5.1 Häufige Probleme

**Problem:** "Ich kann mich nicht einloggen."
- **Lösung:**
  1. Prüfen Sie Email/Passwort auf Tippfehler
  2. Caps Lock deaktiviert?
  3. Falls "User not approved": Admin/Trainer kontaktieren
  4. Passwort vergessen? → "Forgot Password" Link (falls implementiert) oder Admin kontaktieren

**Problem:** "Keine Szenarien sichtbar auf Home."
- **Lösung:**
  1. Sie sind noch keiner Cohort zugewiesen → Trainer kontaktieren
  2. Trainer hat noch keine Session gestartet → Geduld oder nachfragen
  3. Browser-Cache leeren und neu einloggen

**Problem:** "Submit-Button ist deaktiviert."
- **Lösung:**
  1. Timer abgelaufen? → "Time is up!" Alert prüfen
  2. Session Status "paused" oder "ended"? → Warten oder Trainer kontaktieren
  3. Shared Market: Player Type nicht gewählt? → Dialog öffnen und Typ wählen

**Problem:** "Meine Eingaben werden nicht gespeichert."
- **Lösung:**
  1. Klicken Sie auf "Save Full Forecast" BEVOR Sie submitten
  2. Netzwerkfehler? → Browser-Konsole prüfen (F12)
  3. Session abgelaufen? → Neu laden und erneut beitreten

**Problem:** "Charts zeigen keine Daten."
- **Lösung:**
  1. Noch keine Runde abgeschlossen? → Warten Sie auf erstes Market Clearing
  2. WebSocket-Verbindung unterbrochen? → Seite neu laden
  3. Browser-Kompatibilität: Verwenden Sie Chrome/Firefox/Edge (aktuellste Version)

**Problem:** "Countdown-Timer springt oder stoppt."
- **Lösung:**
  1. WebSocket-Verbindung prüfen (Konsole: "socket connected" Meldung)
  2. Netzwerkprobleme? → Stabile Verbindung sicherstellen
  3. Seite neu laden

---

#### 5.2 FAQ

**F: Wie viele Runden hat ein Szenario?**  
A: Standard: 4 Runden. Designer kann dies anpassen (1–10 Runden möglich).

**F: Was passiert, wenn ich zu spät submitte?**  
A: Nach Timer-Ablauf ist Submit blockiert. Ihre letzte gespeicherte Prognose wird NICHT automatisch eingereicht. Sie erhalten 0 Punkte für diese Runde.

**F: Kann ich meine Prognose nach Submit ändern?**  
A: Nein. Submit ist final. Nur "Save Full Forecast" ist reversibel (bis zum Submit).

**F: Was bedeutet "Freeze Hours"?**  
A: Die ersten X Stunden (z.B. h1–h6) sind nach der ersten Runde gesperrt. Sie repräsentieren Ihren Day-Ahead-Plan, der nicht mehr änderbar ist (analog zu realen Märkten).

**F: Warum sehe ich negative Preise?**  
A: Negatives Pricing ist im südafrikanischen Markt erlaubt (z.B. bei Überangebot erneuerbarer Energien). MCP kann zwischen -500 und +5,000 ZAR/MWh liegen.

**F: Was ist der Unterschied zwischen Solo und Cohort?**  
A: Solo = privater Markt (nur Ihre Entscheidungen); Cohort = gemeinsamer Markt (Ihre Entscheidungen beeinflussen andere Spieler und umgekehrt).

**F: Kann ich mehrere Sessions gleichzeitig spielen?**  
A: Ja, aber nicht empfohlen. Jede Session hat eigenen Timer → paralleles Spielen schwierig.

**F: Wie wird mein Rang berechnet?**  
A: Gewichtete Summe aus KPIs (z.B. 50% Profit, 30% Imbalance, 20% Curtailment). Gewichte sind im Szenario definiert.

**F: Was passiert bei technischen Problemen während einer Session?**  
A: Trainer kann Session pausieren. Timer stoppt. Nach Behebung: Resume. Ihre gespeicherten Daten bleiben erhalten.

---

### 6. Glossar

| Begriff | Erklärung |
|---------|-----------|
| **ATC** | Available Transfer Capacity – Übertragungskapazität zwischen Zonen (MW) |
| **Balancing Market** | Ausgleichsmarkt für kurzfristige Abweichungen |
| **Cohort** | Gruppe von Spielern (z.B. Schulklasse, Workshop-Teilnehmer) |
| **Curtailment** | Abregelung (Reduzierung) Ihrer Erzeugung durch das System |
| **DA (Day-Ahead)** | Vortagesmarkt (Prognosen 24h im Voraus) |
| **Forecast** | Ihre stündliche Prognose (MWh oder MW) |
| **Freeze Horizon** | Zeitraum, in dem Änderungen nicht mehr möglich sind (typisch 6h) |
| **IDM (Intraday Market)** | Untertagesmarkt (kurzfristige Anpassungen) |
| **Imbalance** | Abweichung zwischen Prognose und tatsächlicher Erzeugung/Verbrauch |
| **KPI** | Key Performance Indicator (z.B. Profit, Revenue) |
| **MCP** | Market Clearing Price – einheitlicher Marktpreis (ZAR/MWh) |
| **Player Type** | Archetype im shared_market (z.B. "Producer A", "Consumer B") |
| **SAWEM** | South African Wholesale Electricity Market |
| **Session** | Eine Spielinstanz eines Szenarios (mit Timer, Runden, Spielern) |
| **Shared Market** | Modus, in dem alle Spieler einen gemeinsamen Markt teilen |
| **Solo** | Modus, in dem jeder Spieler einen privaten Markt hat (isolated_per_player) |
| **WebSocket** | Echtzeitkommunikation zwischen Server und Client (für Timer, Updates) |
| **Zone** | Geographische Region im Stromnetz (z.B. Z1, Z2) |

---

### 7. Kontakt & Support

**Technischer Support:**
- Email: support@emsg.example.com (Beispiel)
- Reaktionszeit: 24–48h

**Trainer/Admin-Kontakt:**
- Ihre Cohort-Trainer sind über die Plattform erreichbar (falls Chat implementiert)
- Admin für Account-Probleme: admin@emsg.example.com (Beispiel)

**Dokumentation:**
- Diese Anleitung: `/docs/guide/player-handbook.md`
- Video-Tutorials: (optional, Link zur Playlist)

**Community:**
- Forum/Discord: (optional, falls vorhanden)

---

**Ende des Player Handbuchs**  
**Version:** 1.0 | **Datum:** 17.11.2025  
**Lizenz:** Intern | **Copyright:** EMSG Project Team
