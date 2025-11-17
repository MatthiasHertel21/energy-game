# Trainer Handbuch
## Energy Market Simulation Game (EMSG)

**Version:** 1.0  
**Datum:** 17. November 2025  
**Zielgruppe:** Trainer/Lehrpersonal

---

## Quick Guide – Das Wichtigste auf einen Blick

### Ihre Rolle als Trainer
Als Trainer orchestrieren Sie Lernsessions für Ihre Studierenden. Sie erstellen Cohorts (Gruppen), weisen Szenarien zu, starten Sessions, überwachen den Fortschritt in Echtzeit und analysieren Ergebnisse.

### Hauptaufgaben in 5 Schritten

1. **Cohorts erstellen** → Legen Sie Gruppen an (z.B. "Workshop Q1 2025")
2. **Spieler zuweisen** → CSV-Import oder manuelles Hinzufügen
3. **Kampagnen/Szenarien aktivieren** → Wählen Sie Lernpfade für Ihre Cohort
4. **Session starten** → Wählen Sie Szenario + Modus (Solo/Multiplayer), starten Sie den Timer
5. **Überwachen & Auswerten** → Live-Status, Leaderboard, Vergleichscharts, PDF-Export

### Kernfunktionen

| Funktion | Beschreibung |
|----------|--------------|
| **Cohort Management** | Erstellen, umbenennen, archivieren, Mitglieder verwalten |
| **Session Control** | Start, Pause, Resume, End, Force Round End |
| **Live Monitoring** | Echtzeit-Status-Matrix (wer hat submitted, wer ist online) |
| **Broadcast Messages** | Senden Sie Nachrichten an alle Spieler einer Session |
| **Leaderboard** | Rangliste nach KPIs (Profit, Imbalance, etc.) |
| **Comparison Dashboard** | Vergleichscharts (Bar, Line) für alle Spieler |
| **Replay Mode** | Schritt-für-Schritt Analyse vergangener Sessions |
| **PDF Reports** | Exportieren Sie Ergebnisse für alle Spieler |

### Wichtige Konzepte

- **Cohort:** Gruppe von Spielern (max. 80 pro Cohort)
- **Session:** Eine laufende Spielinstanz eines Szenarios
- **Mode:** `isolated_per_player` (Solo, private Märkte) oder `shared_market` (Multiplayer, gemeinsamer Markt)
- **Force Navigate:** Automatisches Weiterleiten aller Spieler zur Player-Seite beim Session-Start
- **Player Types:** Im shared_market können Sie Player-Typen aktivieren und Kapazitätslimits setzen
- **Round Duration:** Standard 300s (5 Min), anpassbar im KSE
- **Status Matrix:** Zeigt für jeden Spieler: Online, Submitted, Forecasted, Ready

### Limits

- Max. 10 Cohorts gleichzeitig (pro Trainer)
- Max. 80 Spieler pro Cohort
- Max. 500 WebSocket-Verbindungen (systemweit)
- Session-Timeout: 24h (automatisches Ende bei Inaktivität)

---

## Ausführliche Dokumentation

### 1. Erste Schritte

#### 1.1 Login und Übersicht

**Login:**
- URL: `/login`
- Nach Login: Automatische Weiterleitung zu `/trainer` (Trainer Dashboard)

**Navigation:**
- **Cohorts:** Verwaltung Ihrer Gruppen
- **Trainer:** Session-Steuerung (Timer, Controls, Live-Status)
- **Comparison:** Vergleichscharts für abgeschlossene Sessions
- **Leaderboard:** Rangliste einer Session

---

#### 1.2 Trainer Dashboard

**URL:** `/trainer`

**Zweck:** Zentrale Steuerung für Sessions – Start, Überwachung, Kommunikation.

**Layout:**

```
┌────────────────────────────────────────────────────────────┐
│ Header: Trainer – Session Control                          │
├────────────────────────────────────────────────────────────┤
│ SESSION START FORM                                         │
│ [Cohort ID] [Scenario ID] [Mode] [Force Navigate]         │
│ [Player Types] (if shared_market)                          │
│ [Start Session] Button                                     │
├────────────────────────────────────────────────────────────┤
│ SESSION CONTROLS (wenn Session läuft)                      │
│ [Pause] [Resume] [End] [Force Round End]                  │
│ Timer: 04:23 | Round: 2/4 | Status: running              │
├────────────────────────────────────────────────────────────┤
│ BROADCAST MESSAGE                                          │
│ [Message Input] [Send to All Players]                     │
├────────────────────────────────────────────────────────────┤
│ LIVE STATUS MATRIX                                         │
│ Table: Player | Status | Type | Submitted | Online        │
├────────────────────────────────────────────────────────────┤
│ PARTICIPANTS & TYPE DISTRIBUTION                           │
│ Summary: 15 joined, 5 pending | Charts: Type Distribution │
├────────────────────────────────────────────────────────────┤
│ MARKET CHARTS (MCP, Volume over Rounds)                   │
├────────────────────────────────────────────────────────────┤
│ AGGREGATED KPIs                                            │
│ Table: Player | Profit | Revenue | Imbalance | Curtailment│
├────────────────────────────────────────────────────────────┤
│ EVENT LOG (WebSocket Events)                              │
└────────────────────────────────────────────────────────────┘
```

---

### 2. Cohort Management

#### 2.1 Cohorts – Übersicht

**URL:** `/cohorts`

**Zweck:** Erstellen, bearbeiten, löschen Sie Cohorts und verwalten Sie Mitglieder.

**Bereiche:**

1. **Cohort List**
   - Tabellenansicht: Name | Mitglieder (Anzahl) | Erstellt am | Aktionen
   - Sortierung: Nach Name (A-Z) oder Erstelldatum
   - Suche: Textfeld "Search cohorts..."
   - Button: **Create New Cohort**

2. **Create Cohort Dialog**
   - Feld: **Cohort Name** (max. 100 Zeichen, erforderlich)
   - Button: **Create**
   - Erfolg: Cohort erscheint in Liste, Snackbar "Cohort created"

3. **Cohort Detail (Klick auf Zeile)**
   - Tabs: Members | Campaigns | Sessions | Settings

---

#### 2.2 Members Tab – Spieler verwalten

**Bereiche:**

1. **Members Table**
   - Spalten: Name | Email | Role | Joined | Aktionen (Remove)
   - Sortierung: Alphabetisch nach Name
   - Button: **Add Members** (CSV Import) | **Invite Player** (Einzeln)

2. **CSV Import**
   - Button: **Add Members** öffnet Dialog
   - Feld: **Upload CSV**
     - Format: `email,name` (Header optional)
     - Beispiel:
       ```
       email,name
       student1@example.com,Alice
       student2@example.com,Bob
       ```
   - Validierung:
     - Alle Emails müssen registrierte Player sein
     - Duplikate werden ignoriert
   - Button: **Import**
   - Erfolg: Snackbar "X members added"
   - Fehler: Liste mit fehlgeschlagenen Einträgen + Grund (z.B. "User not found")

3. **Invite Player (Einzeln)**
   - Button: **Invite Player** öffnet Dialog
   - Feld: **Email** (des Players)
   - Button: **Add**
   - API: POST `/api/cohorts/:id/players` `{ user_id }`
   - Erfolg: Spieler erscheint in Tabelle

4. **Remove Member**
   - Button: "Remove" (Zeile)
   - Confirm: "Remove [Name] from this cohort?"
   - API: DELETE `/api/cohorts/:id/players/:user_id`
   - Erfolg: Zeile verschwindet

---

#### 2.3 Campaigns Tab – Sichtbarkeit/Aktivierung

**Zweck:** Wählen Sie, welche Kampagnen für Ihre Cohort sichtbar und spielbar sind.

**Bereiche:**

1. **Campaign List**
   - Alle veröffentlichten Kampagnen (published=true)
   - Pro Kampagne:
     - Name, Cover (Thumbnail), Description
     - **Visible:** Checkbox (Sichtbarkeit im Catalog für diese Cohort)
     - **Active:** Checkbox (Erlaubt Session-Start aus dieser Kampagne)
   - Hinweis: "Active" erfordert "Visible" (Auto-Abhängigkeit)

2. **Speichern**
   - Änderungen werden sofort gespeichert (on-change)
   - API: PATCH `/api/cohorts/:id/campaigns/:campaign_id` `{ visible?, active? }`
   - Snackbar: "Campaign settings updated"

3. **Drill-Down zu Szenarien**
   - Klick auf Kampagne → Szenario-Liste (in Designer-Reihenfolge)
   - Pro Szenario:
     - Name, Order Index
     - Button: **Open Session** → öffnet Start-Dialog (siehe 3.1)

**Use Case:** Wenn Sie eine strukturierte Kampagne haben (z.B. "SAWEM Basics → Advanced"), können Sie Szenarien in Reihenfolge freischalten.

---

#### 2.4 Sessions Tab – Session-Historie

**Zweck:** Überblick über alle Sessions dieser Cohort.

**Bereiche:**

1. **Sessions Table**
   - Spalten: Szenario | Gestartet | Status | Runden | Spieler | Aktionen
   - Sortierung: Neueste zuerst
   - Filter: Status (All | Running | Ended | Paused)

2. **Aktionen pro Session**
   - **View Details:** Öffnet Evaluation/Comparison (`/comparison?sessionId=...`)
   - **Replay:** Öffnet Replay Mode (`/replay?sessionId=...`)
   - **Export PDF:** Generiert Report für alle Spieler

3. **Statistiken**
   - Gesamt-Sessions: Anzahl
   - Durchschnittliche Spieleranzahl: X
   - Meistgespielte Szenarien: Top 3

---

#### 2.5 Settings Tab – Cohort-Einstellungen

**Bereiche:**

1. **Rename Cohort**
   - Feld: **Cohort Name**
   - Button: **Save**
   - API: PATCH `/api/cohorts/:id` `{ name }`
   - Erfolg: Snackbar "Cohort renamed"

2. **Archive/Delete Cohort**
   - Button: **Archive Cohort** (sofern implementiert) → Verbirgt Cohort aus aktiver Liste
   - Button: **Delete Cohort** (rot)
   - Confirm: "Delete cohort '[Name]'? This will remove all memberships but preserve session history."
   - API: DELETE `/api/cohorts/:id`
   - Erfolg: Weiterleitung zu `/cohorts`, Snackbar "Cohort deleted"
   - Hinweis: Sessions bleiben erhalten (für History/Reporting)

---

### 3. Session Management

#### 3.1 Session starten

**Ort:** `/trainer` (Trainer Dashboard)

**Ablauf:**

1. **Session Start Form (Oben auf Trainer-Seite)**

   **Felder:**

   - **Cohort ID**
     - Label: "Cohort to run the session for"
     - Tooltip: "Numeric cohort identifier. Players assigned to this cohort will participate in the session."
     - Type: Number
     - Erforderlich: Ja
     - Hinweis: Dropdown mit Ihren Cohorts (falls implementiert) oder manuelle Eingabe

   - **Scenario ID**
     - Label: "Scenario to play"
     - Tooltip: "Select a scenario from the catalog. Ensure the scenario is activated for this cohort."
     - Type: Number
     - Erforderlich: Ja
     - Hinweis: Dropdown aus aktivierten Szenarien (für gewählte Cohort) ODER manuelle Eingabe

   - **Mode**
     - Label: "Session mode"
     - Tooltip: "isolated_per_player = each player has a private market; shared_market = all players share one market (competitive)."
     - Options:
       - `isolated_per_player` (Default)
       - `shared_market`
     - Type: Select/Dropdown

   - **Force Navigate**
     - Label: "Force Navigate"
     - Tooltip: "Auto-redirect all players to /player when session starts (via WebSocket event)."
     - Type: Checkbox
     - Default: false

2. **Player Types (nur wenn Mode = shared_market)**

   **Anzeige:**
   - Liste aller `player_types` aus dem gewählten Szenario
   - Pro Typ:
     - **Name/ID:** z.B. "Producer A (producer_a)"
     - **Enabled:** Checkbox (Typ zulassen?)
     - **Max Players:** Number-Feld (optional, leer = unbegrenzt)
   - Validierung:
     - `max_players` muss ≥0 oder leer sein
     - Mindestens ein Typ muss enabled sein (sonst Fehler)

3. **Start Button**
   - Button: **Start Session**
   - API: POST `/api/sessions` `{ cohort_id, scenario_id, mode, force_navigate }`
   - Erfolg:
     - Session-ID wird zurückgegeben
     - Falls shared_market + Player Types enabled:
       - Automatischer API-Call: PATCH `/api/sessions/:id/allowed-types` `{ allowed: [{type_id, max_players}] }`
     - WebSocket-Event: `session_started` an alle Spieler der Cohort
     - Falls `force_navigate=true`: Spieler werden automatisch zu `/player?sessionId=...` geleitet
     - UI: Session Controls werden sichtbar, Status-Matrix lädt
     - Snackbar: "Session started (ID: X)"
   - Fehler: Snackbar mit Fehlertext (z.B. "Scenario not found", "Cohort has no members")

---

#### 3.2 Session-Controls (während laufender Session)

**Ort:** `/trainer` (unterhalb Start-Form)

**Sichtbar:** Nur wenn `sessionId !== null`

**Buttons:**

1. **Pause**
   - API: PATCH `/api/sessions/:id/pause`
   - Effekt: Timer stoppt, `status → paused`, WebSocket-Event `session_paused`
   - Spieler: Submit blockiert, Hinweis "Session paused by trainer"
   - Button wird zu "Resume"

2. **Resume**
   - API: PATCH `/api/sessions/:id/resume`
   - Effekt: Timer läuft weiter, `status → running`, WebSocket-Event `session_resumed`
   - Spieler: Submit wieder möglich

3. **End Session**
   - API: PATCH `/api/sessions/:id/end`
   - Confirm: "End session? This action cannot be undone."
   - Effekt:
     - Status → `ended`
     - Timer stoppt permanent
     - WebSocket-Event: `session_ended`
     - Progress für alle Spieler: `status → completed`
     - Spieler: "Session has ended" Banner, alle Inputs disabled
   - UI: Controls werden ausgeblendet, Link zu Evaluation

4. **Force Round End**
   - API: POST `/api/sessions/:id/force-round-end`
   - Confirm: "Force end current round? Players who haven't submitted will receive 0 points."
   - Effekt:
     - Aktueller Runden-Timer → 0
     - Market Clearing wird ausgelöst
     - Nächste Runde startet (falls vorhanden)
     - WebSocket-Event: `round_end`, dann `round_start`
   - Hinweis: Verwenden Sie dies nur bei technischen Problemen oder zeitlichen Engpässen

**Status-Anzeige:**
- **Timer:** Große Anzeige "Time Remaining: 04:23" (MM:SS)
- **Round:** "Round 2 / 4"
- **Status:** Chip (grün: "running", gelb: "paused", grau: "ended")
- **Mode:** "isolated_per_player" oder "shared_market"

---

#### 3.3 Broadcast Messages

**Ort:** `/trainer` (unterhalb Session Controls)

**Zweck:** Senden Sie Nachrichten an alle Spieler der aktuellen Session.

**Felder:**
- **Message:** Textfeld (max. 200 Zeichen)
- Button: **Send to All Players**

**API:** POST `/api/sessions/:id/broadcast` `{ message }`

**Effekt:**
- WebSocket-Event: `message` an alle Spieler
- Spieler sehen Snackbar oder In-App-Notification mit Ihrer Nachricht
- Beispiel: "Bitte beachten Sie die Freeze-Stunden!" oder "Letzte Minute!"

**Use Cases:**
- Zeitliche Hinweise ("Nur noch 2 Minuten!")
- Technische Hinweise ("Server-Lag, bitte Geduld")
- Pädagogische Hinweise ("Achten Sie auf Imbalance-Kosten")

---

#### 3.4 Live Status Matrix

**Ort:** `/trainer` (Mitte der Seite)

**Zweck:** Echtzeit-Übersicht über alle Spieler einer Session.

**Tabelle:**

| Player ID | Name | Status | Type | Submitted | Online | Last Activity |
|-----------|------|--------|------|-----------|--------|---------------|
| 15        | Alice| ready  | producer_a | Yes | Yes | 12:34:56 |
| 16        | Bob  | forecasted | consumer_b | No | Yes | 12:34:45 |
| 17        | Carol| offline | -     | No  | No  | 12:30:12 |

**Spalten:**

- **Player ID:** User-ID
- **Name:** Anzeigename (oder Email, falls kein Name)
- **Status:** 
  - `offline` (nicht online)
  - `ready` (online, bereit)
  - `forecasted` (Forecast gespeichert, aber nicht submitted)
  - `submitted` (Forecast für aktuelle Runde eingereicht)
- **Type:** (nur shared_market) Player-Type ID (z.B. "producer_a") oder "-"
- **Submitted:** "Yes" (grün) / "No" (rot)
- **Online:** "Yes" (grün) / "No" (grau)
- **Last Activity:** Timestamp der letzten Aktion (HH:MM:SS)

**Farben:**
- Grün: Submitted + Online
- Gelb: Forecasted (gespeichert, aber nicht submitted)
- Rot: Nicht submitted + Zeit läuft ab
- Grau: Offline

**Auto-Refresh:**
- Alle 5s via `/api/sessions/:id/status`
- Oder Echtzeit via WebSocket-Event `player_submit` / `player_online`

**Sortierung:**
- Standard: Alphabetisch nach Name
- Klick auf Spalten-Header: Sortierung umschalten (A-Z, Z-A)

**Filter:**
- Dropdown "Show: All | Submitted | Not Submitted | Online | Offline"

---

#### 3.5 Participants & Type Distribution

**Ort:** `/trainer` (unterhalb Status Matrix)

**Zweck:** Übersicht über Teilnehmer und Typ-Verteilung (shared_market).

**Bereiche:**

1. **Participants Summary**
   - **Total Players:** Anzahl Spieler in Cohort
   - **Joined:** Anzahl Spieler mit gewähltem Player Type (shared_market) ODER online (isolated)
   - **Pending:** Spieler, die noch keinen Typ gewählt haben (nur shared_market)

2. **Type Distribution Chart (nur shared_market)**
   - **Bar Chart:** Anzahl Spieler pro Player Type
   - X-Axis: Type ID (z.B. "producer_a", "consumer_b")
   - Y-Axis: Anzahl Spieler
   - Farbe: Blau
   - Größe: 360×150px
   - Tooltip: Hover → "Type X: Y players"

3. **Capacity Remaining Chart (nur shared_market + Caps gesetzt)**
   - **Bar Chart:** Verbleibende Slots pro Type
   - X-Axis: Type ID
   - Y-Axis: Remaining Capacity (z.B. 5 von 10 Slots frei)
   - Farbe: Grün
   - Hinweis: Null-Cap (voll) → roter Balken

4. **Device Frequency Chart (nur shared_market)**
   - **Horizontal Bar Chart:** Häufigkeit der Geräte-Nutzung (aggregiert über Typen × Spieleranzahl)
   - Y-Axis: Device ID (Top 8)
   - X-Axis: Nutzungsfrequenz (Summe Spieler × Geräte pro Typ)
   - Farbe: Lila
   - Zweck: Zeigt, welche Geräte am meisten "im Einsatz" sind

**Auto-Refresh:**
- Alle 5s via `/api/sessions/:id/participants` und `/api/sessions/:id/briefing`

---

#### 3.6 Market Charts (MCP & Volume)

**Ort:** `/trainer` (unterhalb Participants)

**Zweck:** Visualisierung der Marktergebnisse über alle Runden.

**Charts:**

1. **MCP Chart (Market Clearing Price over Rounds)**
   - X-Axis: Round Number (1, 2, 3, 4)
   - Y-Axis: MCP (ZAR/MWh)
   - Line: Grün, 2px
   - Gridlines: Horizontal, gestrichelt
   - Tooltip: "Round X: MCP Y ZAR/MWh"
   - Größe: 360×120px

2. **Volume Chart (Total Market Volume over Rounds)**
   - X-Axis: Round Number
   - Y-Axis: Volume (MWh)
   - Line: Blau, 2px
   - Tooltip: "Round X: Volume Y MWh"
   - Größe: 360×120px

**Datenquelle:**
- WebSocket-Event: `round_results` liefert `{ round, mcp, volume }`
- Daten akkumulieren in State: `series = [{ r:1, mcp:120, volume:5000 }, ...]`

**Export:**
- Button: **Export PNG** (beide Charts)
- Button: **Export SVG** (beide Charts)

---

#### 3.7 Aggregated KPIs Table

**Ort:** `/trainer` (unterhalb Charts)

**Zweck:** Zusammenfassung der Spieler-KPIs über alle Runden.

**Tabelle:**

| Player ID | Profit (ZAR) | Revenue (ZAR) | Imbalance (ZAR) | Curtailment (ZAR) | Rounds |
|-----------|--------------|---------------|-----------------|-------------------|--------|
| 15        | 12,500       | 18,000        | 2,000           | 3,500             | 4      |
| 16        | 10,200       | 15,000        | 3,000           | 1,800             | 4      |
| 17        | 8,900        | 13,000        | 2,500           | 1,600             | 3      |

**Spalten:**
- **Player ID:** User-ID
- **Profit:** Summe Profit über alle Runden
- **Revenue:** Summe Revenue
- **Imbalance:** Summe Imbalance Cost
- **Curtailment:** Summe Curtailment Cost
- **Rounds:** Anzahl abgeschlossener Runden (für Durchschnitt)

**Sortierung:**
- Klick auf Header: Sortierung umschalten (Asc/Desc)
- Default: Absteigende Sortierung nach Profit

**Farben:**
- Top 3 Profit: Grüner Hintergrund
- Bottom 3 Profit: Roter Hintergrund (falls >5 Spieler)

**Datenquelle:**
- WebSocket-Event: `round_results` liefert `{ kpis: { player_id: { profit_zar, revenue_zar, ... } } }`
- State akkumuliert über Runden

**Export:**
- Button: **Export CSV** → Download als `session_{id}_kpis.csv`

---

#### 3.8 Event Log

**Ort:** `/trainer` (ganz unten)

**Zweck:** Debug-Log für WebSocket-Events (für Trainer-Transparenz).

**Anzeige:**
- Scrollbare Liste (max. 100 Einträge, neueste oben)
- Format: `[Timestamp] Event: Data`
- Beispiel:
  ```
  [12:35:10] socket connected
  [12:35:15] session_started {"session_id":42}
  [12:40:23] player_submit {"player_id":15,"round":1}
  [12:45:00] round_results {"round":1,"mcp":120,"volume":5000}
  ```

**Events:**
- `connect`, `disconnect`
- `session_started`, `session_paused`, `session_resumed`, `session_ended`
- `round_start`, `round_end`, `round_results`
- `player_submit`, `player_online`, `player_offline`
- `message` (Broadcast)

**Filter:**
- Dropdown: "Show: All | Session Events | Player Events | Market Events"

**Clear:**
- Button: **Clear Log**

---

### 4. Auswertung & Vergleich

#### 4.1 Comparison Dashboard

**URL:** `/comparison?sessionId=...`

**Zweck:** Detaillierter Vergleich aller Spieler einer Session.

**Bereiche:**

1. **Header & Filters**
   - **Session:** Name, ID, Szenario, Datum
   - **Metric:** Dropdown (Profit | Revenue | Imbalance | Curtailment)
   - **Sort:** Dropdown (Best First | Worst First)
   - **Export:** Buttons (PNG, CSV)

2. **Metric Bar Chart**
   - **Horizontal Bars:** Ein Balken pro Spieler
   - X-Axis: Metrik-Wert (z.B. Profit in ZAR)
   - Y-Axis: Player Name (oder ID)
   - Farben:
     - Grün: Positiv (Profit, Revenue)
     - Rot: Negativ (Imbalance, Curtailment)
   - Größe: 600×400px
   - Tooltip: "Player X: Y ZAR"

3. **Detailed Table**
   - Spalten: Player | Profit | Revenue | Imbalance | Curtailment | Rounds
   - Sortierung: Nach gewählter Metrik
   - Klick auf Zeile: Öffnet Player Detail (`/evaluation?sessionId=...&playerId=...`)

4. **Summary Statistics**
   - **Total Players:** Anzahl
   - **Average Profit:** Durchschnitt über alle Spieler
   - **Highest Profit:** Max-Wert + Player-Name
   - **Lowest Profit:** Min-Wert + Player-Name
   - **Total Market Volume:** Summe über alle Runden

**Export:**
- **PNG:** Download Chart als Bild (`comparison_{metric}.png`)
- **CSV:** Download Tabelle als CSV (`session_{id}_comparison.csv`)

---

#### 4.2 Leaderboard

**URL:** `/leaderboard?sessionId=...`

**Zweck:** Rangliste aller Spieler (analog zu Player-Sicht, aber für alle).

**Bereiche:**
- Identisch zu Player Leaderboard (siehe Player Handbuch 3.2)
- Zusätzlich: **Export PDF** → Rangliste als PDF für Aushang/Präsentation

**Use Case:** Präsentation nach Workshop; Top-Performer auszeichnen.

---

#### 4.3 Replay Mode

**URL:** `/replay?sessionId=...`

**Zweck:** Schritt-für-Schritt Durchlauf aller Runden (analog zu Player-Replay).

**Bereiche:**

1. **Round Selector**
   - Dropdown: Runde 1, 2, 3, 4
   - Autoplay: Button "Play" → automatisches Durchlaufen (1s pro Runde)
   - Pause: Button "Pause"

2. **Round Details**
   - **Market Clearing:** MCP, Volume
   - **All Players Forecasts:** Tabelle mit allen Prognosen dieser Runde
   - **Deviations:** Tabelle mit Abweichungen (Imbalance) pro Spieler

3. **Charts**
   - **Aggregate Forecast:** Summe aller Prognosen (Line-Chart)
   - **Individual Forecasts:** Overlay mehrerer Spieler (max. 5, auswählbar)

**Navigation:**
- **← Previous Round / Next Round →** Buttons

**Export:**
- **Export Replay Data (CSV):** Alle Runden + Prognosen + KPIs

---

#### 4.4 Player Detail View

**URL:** `/evaluation?sessionId=...&playerId=...`

**Zweck:** Detaillierte Analyse eines einzelnen Spielers.

**Bereiche:**
- Identisch zu Player Evaluation (siehe Player Handbuch 3.1)
- Zusätzlich: **Comparison to Cohort Average** (Overlay-Charts)

**Use Case:** Individuelle Rückmeldung; Fehleranalyse; 1:1-Coaching.

---

### 5. Erweiterte Funktionen

#### 5.1 PDF Reports

**Zweck:** Exportieren Sie umfassende Berichte für Dokumentation/Bewertung.

**Arten:**

1. **Session Summary Report**
   - Inhalt: Session-Infos, Szenario-Parameter, Leaderboard, Aggregierte KPIs, Charts (MCP, Volume)
   - Generierung: Button "Export PDF" auf Comparison-Seite
   - Dateiname: `Session_{ID}_Summary_{Datum}.pdf`

2. **Individual Player Report**
   - Inhalt: Spieler-Name, Szenario, Round-by-Round KPIs, Charts, Benchmarking
   - Generierung: Button "Download PDF Report" auf Player Detail
   - Dateiname: `Player_{ID}_Session_{ID}_{Datum}.pdf`

3. **Cohort Report (alle Sessions)**
   - Inhalt: Cohort-Übersicht, alle Sessions, Durchschnittswerte, Fortschrittstracking
   - Generierung: Button "Export Cohort Report" auf Cohorts-Seite (Settings Tab)
   - Dateiname: `Cohort_{ID}_Report_{Datum}.pdf`

**API:**
- POST `/api/export/pdf` `{ type, session_id?, player_id?, cohort_id? }`
- Response: PDF-Datei (Content-Type: application/pdf)

---

#### 5.2 Presence Monitoring

**URL:** `/trainer` (separates Panel, optional ausklappbar)

**Zweck:** Übersicht über alle online Spieler (cohort-übergreifend).

**Bereiche:**

1. **Presence Table**
   - Spalten: User ID | Name | Role | Cohort | Campaign | Scenario | Page | Last Seen
   - Sortierung: Nach "Last Seen" (neueste zuerst)
   - Filter:
     - **Cohort:** Dropdown (All | Cohort 1 | Cohort 2 | ...)
     - **Campaign:** Dropdown (falls sichtbar)
     - **Scenario:** Dropdown

2. **Live Count**
   - **Total Online:** Anzahl (z.B. "25 users online")
   - **Players:** Anzahl
   - **Trainers:** Anzahl
   - **Designers:** Anzahl

**Auto-Refresh:**
- Alle 5s via `/api/trainer/presence?cohort_id=...`

**Use Case:**
- Monitoring vor Session-Start ("Sind alle online?")
- Troubleshooting ("Warum sieht Spieler X den Screen nicht?")

---

#### 5.3 Reference Runs (Benchmark Upload)

**Zweck:** Laden Sie eine "perfekte" Lösung hoch (Designer- oder Experten-Run), um sie als Benchmark zu verwenden.

**Workflow:**

1. **Upload Reference Run**
   - Ort: `/trainer` (unterhalb Session Controls) ODER `/comparison` (separates Panel)
   - Button: **Upload Reference Run**
   - Dialog:
     - **File:** JSON-Upload (Format: Session-Export mit Forecast + KPIs)
     - **Label:** Name des Benchmarks (z.B. "Optimal Strategy", "Expert Run")
   - API: POST `/api/sessions/:id/reference` (multipart)
   - Erfolg: Snackbar "Reference run uploaded"

2. **Comparison to Reference**
   - Comparison-Seite: Toggle "Show Reference"
   - Charts: Zusätzliche Linie (gestrichelt) für Reference-KPIs
   - Tabelle: Zusätzliche Zeile "Reference" (hervorgehoben)

**Use Case:**
- Zeigen Sie Studierenden, wie die "perfekte" Lösung aussieht
- Vergleichen Sie Cohorten mit einer standardisierten Baseline

---

#### 5.4 Activity Dashboard (Zeitliche Übersicht)

**URL:** `/trainer/activity?cohortId=...` (optional separater Screen)

**Zweck:** Zeitliche Übersicht über Schüleraktivitäten (Login, Forecast-Submit, Round-Complete).

**Bereiche:**

1. **Filters**
   - **Cohort:** Dropdown (All | Cohort 1 | ...)
   - **Session:** Dropdown (All | Session X | ...)
   - **Date Range:** Von/Bis (Datepicker)
   - **Action Type:** Dropdown (All | Login | Forecast Submit | Round Complete)

2. **Activity Timeline**
   - Chronologische Liste (neueste zuerst)
   - Pro Eintrag:
     - **Timestamp:** HH:MM:SS
     - **Player:** Name (ID)
     - **Action:** z.B. "Forecast submitted for Round 2"
     - **Session:** Szenario-Name (ID)
   - Pagination: 50 Einträge pro Seite

3. **Summary Stats**
   - **Total Logins:** Anzahl (für gewählten Zeitraum)
   - **Total Forecasts:** Anzahl
   - **Avg. Time to Submit:** Durchschnitt (z.B. "4:23 min")

**Export:**
- Button: **Export CSV** → Download als `activity_{cohort}_{from}_{to}.csv`

**API:**
- GET `/api/cohorts/:id/activity?from=...&to=...&action_type=...`
- GET `/api/sessions/:id/activity` (Session-spezifisch)

**Use Case:**
- Identifizieren Sie inaktive Spieler (fehlendes Engagement)
- Analysieren Sie, wann Spieler strugglen (lange Bearbeitungszeit)

---

### 6. Troubleshooting & FAQ

#### 6.1 Häufige Probleme

**Problem:** "Session startet nicht."
- **Lösung:**
  1. Cohort hat keine Mitglieder? → Spieler zuweisen
  2. Szenario existiert nicht? → ID prüfen
  3. Netzwerkfehler? → Browser-Konsole prüfen (F12)

**Problem:** "Spieler sehen Session nicht."
- **Lösung:**
  1. Cohort korrekt zugewiesen? → Members Tab prüfen
  2. Kampagne aktiviert? → Campaigns Tab prüfen
  3. `force_navigate` aktiviert? → Spieler müssen manuell zu `/player` navigieren

**Problem:** "Timer läuft nicht."
- **Lösung:**
  1. WebSocket-Verbindung? → Event Log prüfen ("socket connected")
  2. Session paused? → Status prüfen, ggf. Resume
  3. Server-Problem? → Admin kontaktieren

**Problem:** "Status Matrix zeigt keine Daten."
- **Lösung:**
  1. API-Fehler? → Network-Tab prüfen (GET `/api/sessions/:id/status`)
  2. Session nicht gestartet? → Start-Button klicken
  3. Alle Spieler offline? → Warten oder Spieler benachrichtigen

**Problem:** "Broadcast-Nachricht kommt nicht an."
- **Lösung:**
  1. WebSocket-Verbindung der Spieler? → Spieler sollen Seite neu laden
  2. Nachricht zu lang? → Max. 200 Zeichen
  3. Session ended? → Nachrichten nur während laufender Session

---

#### 6.2 FAQ

**F: Wie viele Cohorts kann ich haben?**  
A: Max. 10 gleichzeitig aktive Cohorts (systemweites Limit).

**F: Kann ich eine Session nach Ende wieder öffnen?**  
A: Nein. Status "ended" ist final. Aber Sie können Replay und Evaluation nutzen.

**F: Kann ich Spieler während laufender Session hinzufügen?**  
A: Ja (via Members Tab). Neue Spieler können beitreten, aber haben verpasste Runden nicht.

**F: Was passiert, wenn ein Spieler die Verbindung verliert?**  
A: Der Timer läuft weiter. Spieler kann wieder beitreten und weiterspielen (sofern Zeit bleibt).

**F: Kann ich Runden-Dauer ändern?**  
A: Nein (Trainer). Nur Designer im KSE. Standard: 300s.

**F: Wie oft aktualisiert sich die Status Matrix?**  
A: Alle 5s (automatisch) + Echtzeit bei WebSocket-Events.

**F: Kann ich einzelne Spieler aus einer Session entfernen?**  
A: Nein (während laufender Session). Nur aus Cohort entfernen (dann bei nächster Session nicht dabei).

**F: Was ist der Unterschied zwischen Pause und End?**  
A: Pause = temporär (Resume möglich); End = permanent (keine Fortsetzung).

---

### 7. Best Practices

#### 7.1 Session-Vorbereitung

1. **Cohort aufsetzen:**
   - Erstellen Sie Cohort mindestens 1 Tag vor Workshop
   - Importieren Sie Spieler-Liste via CSV (vorbereiten!)
   - Prüfen Sie, dass alle Spieler Status "approved" haben

2. **Kampagne/Szenario wählen:**
   - Aktivieren Sie nur relevante Kampagnen (Campaigns Tab)
   - Testen Sie Szenario selbst im Solo-Modus (falls möglich)
   - Lesen Sie Briefing durch (kennen Sie Ziele und Regeln)

3. **Test-Session (optional):**
   - Starten Sie eine Test-Session mit 1–2 Spielern
   - Prüfen Sie Timer, WebSocket, Broadcast

4. **Kommunikation:**
   - Informieren Sie Spieler vorab (Email/Chat)
   - Geben Sie URL und Login-Daten
   - Empfehlung: 15 Min vor Session einloggen

---

#### 7.2 Während der Session

1. **Monitoring:**
   - Behalten Sie Status Matrix im Auge (wer hat submitted?)
   - Bei Problemen: Broadcast-Nachricht senden
   - Falls nötig: Pause nutzen (für technische Probleme)

2. **Kommunikation:**
   - Nutzen Sie Broadcast für Hinweise (z.B. "Noch 1 Minute!")
   - Seien Sie verfügbar (Chat/Email) für Fragen

3. **Force Round End:**
   - Nur im Notfall verwenden (z.B. Zeitplan überzogen)
   - Vorher ankündigen (Broadcast: "Round endet in 30s!")

4. **Pacing:**
   - Achten Sie auf Zeitplan (z.B. 5 Min pro Runde = 20 Min gesamt)
   - Pausen einplanen (zwischen Sessions)

---

#### 7.3 Nach der Session

1. **Auswertung:**
   - Zeigen Sie Leaderboard (Top 3 würdigen)
   - Comparison-Charts präsentieren (Gruppe vs. Einzelne)
   - Diskutieren Sie Strategien (z.B. "Warum hatte Spieler X weniger Imbalance?")

2. **Feedback:**
   - Nutzen Sie Replay Mode für gemeinsame Analyse
   - Individuelle Player Details für 1:1-Feedback

3. **Export:**
   - PDF-Reports für Teilnehmer generieren
   - CSV-Daten für eigene Analyse/Forschung

4. **Archivierung:**
   - Sessions bleiben erhalten (History)
   - Cohort kann archiviert werden (falls abgeschlossen)

---

### 8. Glossar

(Siehe Player Handbuch – identisch)

Zusätzliche Trainer-Begriffe:

| Begriff | Erklärung |
|---------|-----------|
| **Cohort** | Gruppe von Spielern (max. 80) |
| **Force Navigate** | Auto-Weiterleitung aller Spieler zu `/player` bei Session-Start |
| **Broadcast** | Nachricht an alle Spieler einer Session |
| **Reference Run** | Benchmark-Lösung (z.B. Experten-Run) zum Vergleich |
| **Presence** | Online-Status aller Nutzer (cohort-übergreifend) |
| **Activity Log** | Chronologische Liste aller Spieler-Aktionen |

---

### 9. Kontakt & Support

**Technischer Support:**
- Email: support@emsg.example.com
- Reaktionszeit: 24–48h

**Admin-Kontakt:**
- Für System-Probleme oder Cohort-Limits: admin@emsg.example.com

**Dokumentation:**
- Dieses Handbuch: `/docs/guide/trainer-handbook.md`
- Designer Handbuch: `/docs/guide/designer-handbook.md`
- Player Handbuch: `/docs/guide/player-handbook.md`

**Video-Tutorials:**
- Trainer-Dashboard Walkthrough (optional, Link)
- Session-Start Schritt-für-Schritt (optional, Link)

---

**Ende des Trainer Handbuchs**  
**Version:** 1.0 | **Datum:** 17.11.2025  
**Lizenz:** Intern | **Copyright:** EMSG Project Team
