# Designer Handbook (KSE)
## Energy Market Simulation Game (EMSG)

Version: 1.0  
Date: 17 Nov 2025  
Audience: Designers/Scenario Editors

---

## Quick Guide

- Your tool: the Campaign & Scenario Editor (KSE).
- Five steps: Create campaign → Create/edit scenario in KSE → Validate/Preview → Publish → Export/Import JSON.
- KSE tabs (overview):
  1) General, 2) Market Rules, 3) Grid, 4) Environment, 5) Events, 6) Devices, 7) Player Types, 8) Scoring.
- Standards: every field has a short description and an info tooltip; backend validation blocks inconsistent configs.

Limits (recommended)
- Scenarios: ≤100; Devices per scenario: ≤50; Player types: ≤10; Events: ≤20; Zones: 1–5; Rounds: 1–10; Forecast horizon: 24–72h.

---

## Detailed Guide

### 1) Campaign Management

1.1 List and Create (Designer Campaigns)
- Create campaign: name + description; upload square cover (PNG/JPG ≤5 MB). Image is cropped/resized to 640×640.
- Publish toggle controls visibility in the Player Catalog.

1.2 Assign Scenarios (n:m)
- Add existing scenarios, set order index, and flags (`solo_enabled`, `cohort_enabled`).
- Reorder via drag & drop or up/down; remove assignment without deleting the scenario.

---

### 2) Scenario Management

2.1 Scenarios List
- Edit, Duplicate, Delete, Export JSON; create new (blank or template).

2.2 Create from Template
- Options: Blank, Standard Day, High Renewables, Peak Winter; templates prefill environment/devices/events/types.

---

### 3) KSE Tabs

Usability baseline
- Each field: concise label + one-line help + info tooltip with ranges/impact.
- Validation runs on save; errors open the respective tab/field.

3.1 General
- Scenario Name (required).
- Objectives (markdown; shown in briefing).
- Fake Date (YYYY-MM-DD) and Start Time (HH:MM).
- Rounds (1–10) and Round Duration (seconds, default 300).
- Simulated Hours per Round (default 6).
- Forecast Horizon (≥ horizon) and Scenario Horizon (= rounds × span, default 24).
- Freeze Hours (≤ span, default 6).

3.2 Market Rules
- Active Markets: DA, IDM, Balancing (DA required).
- Price Floor/Cap (e.g., -500 / +5,000 ZAR/MWh); allow negative pricing.
- Clearing: Uniform price (fixed); tie handling: pro‑rata.
- Imbalance Pricing: up/down costs (e.g., +1200 / +800 ZAR/MWh).
- Transmission Losses (%), e.g., 2%.

3.3 Grid
- Number of Zones (1–5, default 2).
- ATC Matrix (symmetric MW between zones); validate symmetry.
- Congestion handling/revenue: fixed options.

3.4 Environment (Generator)
- Producer/Consumer totals (MW) and number of agents.
- Group shares (PV/Wind/Gas/Coal … sum to 100%).
- Zonal splits per group (each row sums to 100%).
- RNG seed (integer); templates override fields.
- Preview: supply/demand curves with intersection (MCP) and export PNG/SVG.

3.5 Events
- Library of defaults (Fuel Spike, Drought, Outage, Demand Surge, Grid Congestion, Weather Boost, Transmission Outage).
- Custom events: name, type (systemic/player), trigger (round/probability), duration (rounds/hours), impact (× or ±), target (all/zone/type/device), optional pre-warning.
- Validation checks overlaps and target existence; preview timeline.

3.6 Devices
- Define devices (generators, storage, loads) with required parameters per class.
- Common: id, type, zone, display name/description.
- Type-specific examples:
  - PV/Wind: max power, efficiency, must‑run, marginal cost.
  - Coal/Gas/Nuclear: max power, min load, ramp rate, marginal and start-up costs/times.
  - Battery/Pumped Storage: capacity (MWh), power (MW), efficiency, initial SoC, DoD, degradation, marginal cost.
- Validation: unique IDs, ranges, required fields present.

3.7 Player Types
- Define `{ id, name, devices[], zone? }` per scenario; required for `shared_market`.
- Players of a type can only edit the assigned devices.
- Validation: unique IDs, at least one existing device per type.

3.8 Scoring
- KPIs: Profit, Revenue, Imbalance Cost, Curtailment Cost (+ optional ones like Emissions).
- Weights must sum to 1.0 (default 0.6/0.3/0.1).
- Normalization: Z-score or Min-Max.
- Leaderboard mode: role-specific or global.
- Optional: upload reference runs (JSON) for benchmarking.

---

### 4) Footer Actions (KSE)

- Save: persist config.
- Save & Validate: persist + run backend validation; errors are listed by tab/field.
- Preview: generate charts without saving.
- Export JSON: full scenario as JSON.
- Import JSON: overwrite or create new; structure validation required.

---

### 5) Validation System

- Frontend checks: ranges, formats, uniqueness, sums.
- Backend checks: consistency (horizon = rounds × span), references (devices used by types exist), feasibility (ATC bounds), event overlaps.
- Errors: block save/validate; warnings: non-blocking.

---

### 6) Best Practices

- Objectives first: write clear learning goals; design events/devices around them.
- Layer complexity across a campaign (intro → advanced).
- Keep events focused (≤3 per scenario) to avoid cognitive overload.
- Use realistic mixes for the SA context (coal/gas dominant; renewables growing; must-run for PV/wind).
- Shared market: 2–4 player types with distinct device sets.
- Validate and dry-run before publishing; iterate with pilot groups.

---

### 7) Troubleshooting & FAQ

Common issues
- Horizon mismatch: adjust rounds/span or horizon to match.
- Missing device in type: update type device list after renaming/deleting.
- Weights don’t sum to 1.0: normalize in Scoring.
- No MCP intersection in preview: balance producer/consumer totals and group shares.
- Event trigger overlaps: shift rounds or accept warning intentionally.

FAQ
- Editing after publish: affects new sessions; existing sessions keep their snapshot.
- Deleting devices used by types: first remove them from all types, then delete.
- Templates: load, edit, and save as a new scenario.

---

Support
- Technical: support@emsg.example.com
- Documentation: docs/guide/designer-handbook.md# Designer Handbuch (Editor/KSE)
## Energy Market Simulation Game (EMSG)

**Version:** 1.0  
**Datum:** 17. November 2025  
**Zielgruppe:** Designer/Content-Ersteller

---

## Quick Guide – Das Wichtigste auf einen Blick

### Ihre Rolle als Designer
Als Designer erstellen Sie Kampagnen (Lernpfade) und Szenarien mit dem **Kampagnien/Szenarieneditor (KSE)**. Sie definieren alle Parameter (Märkte, Geräte, Events, Player Types) und gestalten so realistische, lehrreiche Simulationen.

### Hauptaufgaben in 5 Schritten

1. **Kampagne erstellen** → Lernpfad mit 3–5 Szenarien anlegen
2. **Szenario konfigurieren (KSE)** → 7 Tabs: General, Market, Grid, Environment, Events, Devices, Player Types, Scoring
3. **Validieren & Vorschau** → Prüfen Sie Konsistenz und generieren Sie Preview-Charts
4. **Veröffentlichen** → Toggle "Published" für Sichtbarkeit im Catalog
5. **Export/Import** → JSON-Export für Backup/Sharing

### KSE-Tabs (Übersicht)

| Tab | Zweck |
|-----|-------|
| **1. General** | Szenario-Name, Ziele, Zeitparameter (Runden, Horizon, Freeze) |
| **2. Market Rules** | DA/IDM/Balancing aktivieren, Preislimits, Imbalance-Pricing |
| **3. Grid** | Zonen, ATC-Matrix, Transmission Losses |
| **4. Environment** | Markt-Baseline generieren (Kapazitäten, Gruppen, Seed) |
| **5. Events** | Systemische/geräte-spezifische Events (Fuel Spike, Outage, etc.) |
| **6. Devices** | Geräte definieren (Solar, Wind, Gas, Battery, etc.) mit Parametern |
| **7. Player Types** | Spieler-Archetypen erstellen, Geräte zuordnen, Zonen setzen |
| **8. Scoring** | KPI-Gewichtungen, Normalisierung, Leaderboard-Regeln |

### Wichtige Konzepte

- **Kampagne:** Lernpfad mit mehreren Szenarien (n:m-Zuordnung)
- **Szenario:** Ein spielbares Setting (1 Tag = 24h, 4 Runden à 6h)
- **Device:** Gerät (z.B. solar_1, battery_2) mit technischen Parametern
- **Player Type:** Archetyp (z.B. "Producer A") mit zugeordneten Geräten (für shared_market)
- **Environment Generator:** Automatische Baseline-Markt-Generierung (100 Agenten, konfigurierbare Gruppen)
- **Event:** Externes Ereignis (z.B. Fuel Spike, Outage) mit Trigger, Dauer, Impact
- **Validation:** Auto-Prüfung aller Eingaben (Syntax, Plausibilität, Konsistenz)

### Limits & Standards

- **Kampagnen:** Unbegrenzt (MVP: ~100)
- **Szenarien:** Unbegrenzt (MVP: ~100)
- **Devices pro Szenario:** Max. 50 (empfohlen: 10–20)
- **Player Types:** Max. 10 pro Szenario
- **Events:** Max. 20 pro Szenario
- **Zonen:** 1–5 (Standard: 2)
- **Runden:** 1–10 (Standard: 4)
- **Forecast Horizon:** 24–72h (Standard: 48h)
- **Cover Image:** 640×640px (PNG/JPG, auto-crop)

---

## Ausführliche Dokumentation

### 1. Erste Schritte

#### 1.1 Login und Übersicht

**Login:**
- URL: `/login`
- Nach Login: Automatische Weiterleitung zu `/designer/campaigns` (Campaign Management)

**Navigation:**
- **Campaigns:** Kampagnen-Verwaltung (Liste, Erstellen, Bearbeiten)
- **Scenarios:** Szenario-Liste (Übersicht, Edit, Delete, Export)
- **KSE:** Kampagnien/Szenarieneditor (7 Tabs)
- **Device Types:** Geräte-Katalog (Vorlagen ansehen)

---

#### 1.2 Designer Dashboard

**URL:** `/designer/campaigns`

**Zweck:** Zentrale Verwaltung aller Kampagnen.

**Bereiche:**

1. **Campaign List**
   - Tabellenansicht: Name | Description | Published | Scenarios (Anzahl) | Aktionen
   - Sortierung: Alphabetisch (A-Z) oder nach Erstelldatum
   - Suche: Textfeld "Search campaigns..."
   - Button: **Create New Campaign**

2. **Create Campaign Dialog**
   - Felder:
     - **Name:** max. 100 Zeichen, erforderlich
     - **Description:** max. 500 Zeichen, optional
   - Button: **Create**
   - API: POST `/api/kse/campaigns` `{ name, description }`
   - Erfolg: Kampagne erscheint in Liste, Snackbar "Campaign created"

3. **Campaign Detail (Klick auf Zeile)**
   - Tabs: Info | Scenarios | Settings

---

### 2. Campaign Management

#### 2.1 Info Tab – Basisinformationen

**Bereiche:**

1. **Campaign Info**
   - **Name:** Textfeld (editierbar)
   - **Description:** Textarea (editierbar)
   - **Published:** Toggle (Sichtbarkeit im Catalog)
   - **Cover Image:** Upload (PNG/JPG, max. 5 MB)
   - Button: **Save Changes**

2. **Cover Image Upload**
   - Feld: **Upload Image** (Drag&Drop oder Browse)
   - Validierung:
     - Format: PNG oder JPG
     - Max. Größe: 5 MB
   - Server-Verarbeitung:
     - Auto-Crop auf quadratisch (Centered)
     - Resize auf 640×640px
     - Speicherort: `/uploads/campaigns/{id}.png`
   - API: POST `/api/kse/campaigns/:id/image` (multipart)
   - Erfolg: Vorschau aktualisiert, Snackbar "Image uploaded"

3. **Publish Toggle**
   - Checkbox: "Published" (Kampagne im Catalog sichtbar)
   - API: PATCH `/api/kse/campaigns/:id` `{ published: true/false }`
   - Hinweis: Unpublished Kampagnen sind nur für Designer/Trainer sichtbar

---

#### 2.2 Scenarios Tab – Szenarien zuordnen

**Zweck:** n:m-Zuordnung von Szenarien zu Kampagne, Reihenfolge festlegen, Solo/Cohort-Flags setzen.

**Bereiche:**

1. **Assigned Scenarios List**
   - Sortierbar (Drag&Drop oder Up/Down-Buttons)
   - Pro Szenario:
     - **Order Index:** Anzeige der Reihenfolge (1, 2, 3, ...)
     - **Name:** Szenario-Name
     - **Solo Enabled:** Checkbox (Erlaubt Solo-Sessions)
     - **Cohort Enabled:** Checkbox (Erlaubt Cohort-Sessions)
     - **Aktionen:**
       - **Move Up / Down:** Reihenfolge ändern
       - **Edit:** Öffnet Szenario im KSE
       - **Remove:** Zuordnung entfernen (Szenario bleibt global erhalten)

2. **Add Scenario**
   - Button: **Assign Scenario** öffnet Dialog
   - Dialog:
     - **Scenario:** Dropdown (alle verfügbaren Szenarien)
     - **Order Index:** Auto (am Ende) oder manuell
     - **Solo Enabled:** Checkbox (Default: true)
     - **Cohort Enabled:** Checkbox (Default: true)
     - Button: **Add**
   - API: POST `/api/kse/campaigns/:id/scenarios` `{ scenario_id, order_index?, solo_enabled, cohort_enabled }`
   - Erfolg: Szenario erscheint in Liste

3. **Reorder Scenarios**
   - Drag&Drop (falls implementiert) ODER Up/Down-Buttons
   - API: PUT `/api/kse/campaigns/:id/scenarios/reorder` `{ scenarios: [{scenario_id, order_index}] }`
   - Erfolg: Reihenfolge aktualisiert

4. **Remove Scenario**
   - Button: "Remove" (Zeile)
   - Confirm: "Remove [Name] from this campaign? (Scenario stays in global library)"
   - API: DELETE `/api/kse/campaigns/:id/scenarios/:scenario_id`
   - Erfolg: Zeile verschwindet

---

#### 2.3 Settings Tab – Kampagnen-Einstellungen

**Bereiche:**

1. **Rename Campaign**
   - Feld: **Campaign Name**
   - Button: **Save**
   - API: PATCH `/api/kse/campaigns/:id` `{ name }`

2. **Delete Campaign**
   - Button: **Delete Campaign** (rot)
   - Confirm: "Delete campaign '[Name]'? This will remove all scenario assignments but preserve scenarios."
   - API: DELETE `/api/kse/campaigns/:id`
   - Erfolg: Weiterleitung zu `/designer/campaigns`, Snackbar "Campaign deleted"

---

### 3. Scenario Management

#### 3.1 Scenarios – Übersicht

**URL:** `/designer/scenarios`

**Zweck:** Liste aller Szenarien (global), unabhängig von Kampagnen.

**Bereiche:**

1. **Scenario List**
   - Tabellenansicht: Name | Campaigns (Anzahl) | Created | Last Edited | Aktionen
   - Sortierung: Alphabetisch oder nach Datum
   - Suche: Textfeld "Search scenarios..."
   - Filter: "All | In Campaigns | Standalone"

2. **Aktionen pro Szenario**
   - **Edit:** Öffnet KSE (`/designer/kse?id=...`)
   - **Duplicate:** Erstellt Kopie (neue ID, Name += " (Copy)")
   - **Delete:** Löscht Szenario (global)
   - **Export:** Download als JSON

3. **Create New Scenario**
   - Button: **Create Scenario** öffnet Dialog
   - Felder:
     - **Name:** erforderlich
     - **Template:** Dropdown (Blank | Standard Day | High Renewables | Peak Winter)
   - API: POST `/api/kse/scenarios` `{ name, template? }`
   - Erfolg: Weiterleitung zu KSE

4. **Delete Scenario**
   - Button: "Delete" (Zeile)
   - Confirm: "Delete scenario '[Name]'? This will remove it from all campaigns. This action cannot be undone."
   - API: DELETE `/api/kse/scenarios/:id`
   - Erfolg: Zeile verschwindet

---

### 4. KSE (Kampagnien/Szenarieneditor)

**URL:** `/designer/kse?id=...` (oder `/designer/kse` für neu)

**Zweck:** Detaillierte Konfiguration eines Szenarios über 8 Tabs.

**Usability-Standard:**
- Jedes Feld hat eine **kurze Beschreibung** (Label + 1-Zeiler) und ein **Info-Tooltip** (detaillierte Erklärung, Ranges, Validierung, System-Impact).
- Alle Texte in Englisch.
- Validierung: Echtzeit (on-change) + finale Validierung (on-save).
- Fehler: Rote Umrandung + Fehlermeldung unter Feld.

**Navigation:**
- Tabs: General | Market Rules | Grid | Environment | Events | Devices | Player Types | Scoring
- Buttons (Footer): **Save** | **Save & Validate** | **Preview** | **Export JSON** | **Cancel**

---

#### 4.1 Tab 1: General – Grundeinstellungen

**Felder:**

1. **Scenario Name**
   - Label: "Scenario Name"
   - Tooltip: "Unique name for this scenario. Displayed to players in catalog and briefing."
   - Type: Text (max. 100 Zeichen)
   - Erforderlich: Ja

2. **Objectives**
   - Label: "Learning Objectives"
   - Tooltip: "Text description of goals for players. Shown in briefing. Use markdown for formatting."
   - Type: Textarea (max. 1000 Zeichen)
   - Erforderlich: Nein

3. **Fake Date**
   - Label: "Simulated Date"
   - Tooltip: "Fictional calendar date (e.g., 2025-01-15). Displayed in briefing for context."
   - Type: Date (YYYY-MM-DD)
   - Default: Aktuelles Datum
   - Validierung: Datum-Format

4. **Start Time**
   - Label: "Simulated Start Time"
   - Tooltip: "Fictional start time (e.g., 08:00). Used for labeling hours in charts."
   - Type: Time (HH:MM)
   - Default: "00:00"
   - Validierung: 00:00–23:59

5. **Number of Rounds**
   - Label: "Rounds"
   - Tooltip: "Total rounds in this scenario (1–10). Each round covers a time span (e.g., 6h)."
   - Type: Number
   - Default: 4
   - Range: 1–10
   - Validierung: Integer, ≥1, ≤10

6. **Round Duration (Real Time)**
   - Label: "Round Duration (seconds)"
   - Tooltip: "Real-time duration per round (e.g., 300s = 5 minutes). Timer counts down."
   - Type: Number
   - Default: 300
   - Range: 60–1800 (1 Min – 30 Min)
   - Validierung: Integer, ≥60

7. **Round Span (Simulated Hours)**
   - Label: "Simulated Hours per Round"
   - Tooltip: "Number of simulated hours covered per round (e.g., 6). Must divide scenario horizon evenly."
   - Type: Number
   - Default: 6
   - Range: 1–24
   - Validierung: `horizon_hours % round_span === 0`

8. **Forecast Horizon**
   - Label: "Forecast Horizon (hours)"
   - Tooltip: "Total hours players can forecast ahead (e.g., 48h = 2 days). Must be ≥ scenario horizon."
   - Type: Number
   - Default: 48
   - Range: 24–72
   - Validierung: `forecast_horizon ≥ horizon_hours`

9. **Scenario Horizon**
   - Label: "Scenario Horizon (hours)"
   - Tooltip: "Total simulated hours in scenario (e.g., 24h = 1 day). Must equal rounds × round_span."
   - Type: Number
   - Default: 24
   - Range: 6–48
   - Validierung: `horizon_hours === rounds × round_span`

10. **Freeze Hours (Day-Ahead)**
    - Label: "Freeze Hours"
    - Tooltip: "Hours locked after first round (e.g., 6). Represents Day-Ahead commitment. Must be ≤ round_span."
    - Type: Number
    - Default: 6
    - Range: 0–24
    - Validierung: `freeze_hours ≤ round_span`

**Auto-Berechnung:**
- Wenn `rounds` oder `round_span` geändert wird → `horizon_hours` auto-berechnet (falls leer)
- Konsistenz-Check: Warnung, wenn `horizon_hours ≠ rounds × round_span`

---

#### 4.2 Tab 2: Market Rules – Markt-Konfiguration

**Felder:**

1. **Enabled Markets**
   - Label: "Active Markets"
   - Tooltip: "Select which markets are enabled. DA = Day-Ahead, IDM = Intraday, Balancing = Real-time adjustment."
   - Type: Checkboxes (DA, IDM, Balancing)
   - Default: Alle aktiviert
   - Validierung: Mindestens DA muss aktiviert sein

2. **Price Floor**
   - Label: "Minimum Price (ZAR/MWh)"
   - Tooltip: "Minimum allowed market clearing price. Negative values permitted (e.g., -500)."
   - Type: Number
   - Default: -500
   - Range: -1000 – 0
   - Validierung: `price_floor < price_cap`

3. **Price Cap**
   - Label: "Maximum Price (ZAR/MWh)"
   - Tooltip: "Maximum allowed market clearing price (e.g., 5000)."
   - Type: Number
   - Default: 5000
   - Range: 0 – 10000
   - Validierung: `price_cap > price_floor`

4. **Allow Negative Prices**
   - Label: "Negative Pricing"
   - Tooltip: "Allow MCP to go below zero (e.g., oversupply scenarios). Recommended: Yes."
   - Type: Checkbox
   - Default: true

5. **Clearing Mechanism**
   - Label: "Clearing Method"
   - Tooltip: "Uniform price (fixed): All trades at single MCP. Other methods not supported."
   - Type: Dropdown
   - Options: "Uniform Price" (nur diese Option)
   - Default: "Uniform Price"
   - Disabled: true (keine Änderung erlaubt)

6. **Tie Resolution**
   - Label: "Tie Handling"
   - Tooltip: "How to allocate volume when multiple bids at MCP. Pro-rata = proportional sharing."
   - Type: Dropdown
   - Options: "Pro-rata Allocation" (nur diese Option)
   - Default: "Pro-rata"
   - Disabled: true

7. **Imbalance Pricing (Up-Regulation)**
   - Label: "Imbalance Cost – Short (ZAR/MWh)"
   - Tooltip: "Penalty for under-delivery (player short). Typical: +1200 ZAR/MWh."
   - Type: Number
   - Default: 1200
   - Range: 0 – 5000
   - Validierung: Positiv

8. **Imbalance Pricing (Down-Regulation)**
   - Label: "Imbalance Cost – Long (ZAR/MWh)"
   - Tooltip: "Penalty for over-delivery (player long). Typical: +800 ZAR/MWh."
   - Type: Number
   - Default: 800
   - Range: 0 – 5000
   - Validierung: Positiv

9. **Transmission Losses**
   - Label: "Transmission Loss Factor (%)"
   - Tooltip: "Percentage of energy lost in transmission between zones (e.g., 2%)."
   - Type: Number
   - Default: 2
   - Range: 0 – 10
   - Validierung: `0 ≤ losses ≤ 10`

**Hinweis:**
- "Block Bids", "Bilateral Contracts", "Ancillary Services" nicht unterstützt (ausgeblendet oder grau).

---

#### 4.3 Tab 3: Grid – Zonen & Transmission

**Felder:**

1. **Number of Zones**
   - Label: "Grid Zones"
   - Tooltip: "Number of geographical zones (1–5). Default: 2 (Z1, Z2)."
   - Type: Number
   - Default: 2
   - Range: 1–5
   - Validierung: Integer, ≥1, ≤5

2. **ATC Matrix (Available Transfer Capacity)**
   - Label: "ATC Matrix (MW)"
   - Tooltip: "Symmetric matrix of transmission capacity between zones. E.g., Z1↔Z2 = 5000 MW."
   - Type: Grid/Matrix (dynamisch basierend auf `num_zones`)
   - Beispiel (2 Zonen):
     ```
           Z1    Z2
     Z1    -     5000
     Z2    5000  -
     ```
   - Eingabe: Number-Felder pro Zonen-Paar
   - Default: 5000 MW zwischen allen Paaren
   - Range: 0 – 50000 MW
   - Validierung:
     - Symmetrisch: `ATC[i][j] === ATC[j][i]`
     - Diagonal: `-` (keine Selbst-Transfers)

3. **Congestion Handling**
   - Label: "Congestion Method"
   - Tooltip: "How to handle grid congestion. Greedy flow = fill up to ATC, then curtail most expensive generators."
   - Type: Dropdown
   - Options: "Greedy Flow + Curtailment" (nur diese Option)
   - Default: "Greedy Flow"
   - Disabled: true

4. **Congestion Revenue Distribution**
   - Label: "Congestion Revenue"
   - Tooltip: "How congestion surplus is distributed. Pro-rata = based on dispatched volume."
   - Type: Dropdown
   - Options: "Pro-rata to Dispatched Players" (nur diese Option)
   - Default: "Pro-rata"
   - Disabled: true

**Preview:**
- Button: **Preview Grid** öffnet Visualisierung (Zonen-Diagramm mit ATC-Werten)

---

#### 4.4 Tab 4: Environment Generator – Markt-Baseline

**Zweck:** Automatische Generierung der Baseline-Markt-Agenten (Supply/Demand-Curves).

**Felder:**

1. **Baseline Producer Capacity**
   - Label: "Total Producer Capacity (MW)"
   - Tooltip: "Total installed generation capacity for baseline market (e.g., 30000 MW)."
   - Type: Number
   - Default: 30000
   - Range: 1000 – 100000
   - Validierung: Positiv

2. **Baseline Consumer Capacity**
   - Label: "Total Consumer Load (MW)"
   - Tooltip: "Total demand capacity for baseline market (e.g., 25000 MW)."
   - Type: Number
   - Default: 25000
   - Range: 1000 – 100000
   - Validierung: Positiv

3. **Number of Agents (Supply)**
   - Label: "Supply Agents"
   - Tooltip: "Number of synthetic generators in baseline (e.g., 100). More = smoother curve."
   - Type: Number
   - Default: 100
   - Range: 10 – 500
   - Validierung: Integer

4. **Number of Agents (Demand)**
   - Label: "Demand Agents"
   - Tooltip: "Number of synthetic consumers in baseline (e.g., 100)."
   - Type: Number
   - Default: 100
   - Range: 10 – 500
   - Validierung: Integer

5. **Group Shares (Supply Mix)**
   - Label: "Generation Mix (%)"
   - Tooltip: "Percentage share of each technology in supply. Must sum to 100%."
   - Type: Mehrere Number-Felder
   - Gruppen:
     - **Solar (PV):** Default 40%
     - **Wind:** Default 30%
     - **Gas:** Default 20%
     - **Coal:** Default 10%
     - (Optional: Hydro, Nuclear, Biomass, Battery)
   - Validierung: `Σ shares === 100%`
   - Auto-Normalisierung: Bei Änderung andere Shares proportional anpassen (optional)

6. **Zonal Splits per Group**
   - Label: "Zonal Distribution (%)"
   - Tooltip: "Percentage of each group located in each zone. Must sum to 100% per group."
   - Type: Grid (Gruppe × Zone)
   - Beispiel (2 Zonen):
     ```
           Z1    Z2
     Solar 60%   40%
     Wind  50%   50%
     Gas   40%   60%
     Coal  30%   70%
     ```
   - Validierung: Jede Zeile (Gruppe) summt zu 100%

7. **RNG Seed**
   - Label: "Random Seed"
   - Tooltip: "Trainer-provided seed for reproducibility. Same seed = same baseline curves."
   - Type: Number (Integer)
   - Default: 42
   - Range: 0 – 999999
   - Hinweis: "Leave default for random generation."

8. **Template**
   - Label: "Quick Template"
   - Tooltip: "Load pre-configured settings for common scenarios."
   - Type: Dropdown
   - Options:
     - "Custom" (Default, keine Änderung)
     - "Standard Day" → Standard-Werte (siehe oben)
     - "High Renewables" → Solar 60%, Wind 30%, Gas 10%
     - "Peak Winter" → Coal 40%, Gas 40%, Wind 20%
   - Aktion: Beim Wechsel werden alle Environment-Felder überschrieben (mit Confirm)

**Preview:**
- Button: **Generate & Preview** → Server generiert Curves, zeigt D3-Chart
- Chart:
  - X-Axis: Price (ZAR/MWh)
  - Y-Axis: Quantity (MW)
  - Zwei Linien: Supply (grün, aufsteigend), Demand (rot, absteigend)
  - Intersection (MCP) markiert
  - Zoom, Hover-Tooltip, Export PNG/SVG

**Export:**
- Button: **Export Environment JSON** → Download `environment_{seed}.json`

---

#### 4.5 Tab 5: Events – Event-Editor

**Zweck:** Definieren Sie externe Ereignisse (z.B. Fuel Spike, Outage) mit Trigger, Dauer, Impact.

**Bereiche:**

1. **Event Library (Vorlagen)**
   - Liste der 7 Default-Events:
     1. **Fuel Price Spike:** +20% fuel cost (round 2, all thermal)
     2. **Renewable Drought:** -30% output (random, all zones)
     3. **Plant Outage:** -1000 MW (random, one Producer)
     4. **Demand Surge:** +15% load (round 3, all Consumers)
     5. **Grid Congestion:** -50% ATC (rounds 2–3, Z1↔Z2)
     6. **Weather Boost:** +50% Wind/Solar (random, all zones)
     7. **Transmission Outage:** -100% ATC (round 2, specific zone-pair)
   - Button: **Add from Library** → Öffnet Auswahl-Dialog

2. **Custom Events List**
   - Tabelle: Name | Type | Trigger | Duration | Impact | Target | Aktionen
   - Button: **Add Custom Event**

3. **Add/Edit Event Dialog**

   **Felder:**

   - **Event Name**
     - Label: "Event Name"
     - Tooltip: "Descriptive name shown to players (e.g., 'Fuel Price Spike')."
     - Type: Text (max. 50 Zeichen)
     - Erforderlich: Ja

   - **Event Type**
     - Label: "Type"
     - Tooltip: "Systemic = affects all; Player-Specific = affects one player/device."
     - Type: Dropdown
     - Options: "Systemic" | "Player-Specific"
     - Default: "Systemic"

   - **Trigger**
     - Label: "Trigger"
     - Tooltip: "When does event occur? Round = specific round; Random = probability per round."
     - Type: Dropdown + Conditional
     - Options:
       - "Specific Round" → Zusatzfeld: **Round Number** (1–10)
       - "Random (Probability)" → Zusatzfeld: **Probability (%)** (0–100)
     - Default: "Specific Round", Round 2

   - **Duration**
     - Label: "Duration"
     - Tooltip: "How long does event last? Rounds or Hours."
     - Type: Dropdown + Number
     - Options:
       - "X Rounds" → Eingabe: Anzahl Runden (1–10)
       - "X Hours" → Eingabe: Anzahl Stunden (1–48)
     - Default: "1 Round"

   - **Impact**
     - Label: "Impact Modifier"
     - Tooltip: "Multiplier (e.g., ×1.2 = +20%) or Additive (e.g., +500 MW)."
     - Type: Dropdown + Number
     - Options:
       - "Multiplier (×)" → Eingabe: Faktor (0.1–10.0)
       - "Additive (±)" → Eingabe: Wert (MW oder ZAR/MWh)
     - Default: "Multiplier", 1.2

   - **Target**
     - Label: "Target"
     - Tooltip: "What/who is affected? All, specific zone, player, or device."
     - Type: Dropdown + Conditional
     - Options:
       - "All (System-wide)"
       - "Zone X" → Zusatzfeld: **Zone ID** (Dropdown basierend auf Grid-Zonen)
       - "Player Type" → Zusatzfeld: **Player Type ID** (falls definiert)
       - "Device" → Zusatzfeld: **Device ID** (Dropdown aus Devices-Tab)
     - Default: "All"

   - **Warning to Players**
     - Label: "Pre-Warning"
     - Tooltip: "Notify players before event? Default: No (surprise). If yes, show in briefing."
     - Type: Checkbox
     - Default: false

   **Buttons:**
   - **Save Event**
   - **Cancel**

4. **Event Processing Order**
   - Info-Box: "Events are processed in order: Systemic multipliers first, then player-specific additives."

**Validation:**
- Trigger Overlaps: Warnung, wenn mehrere Events in gleicher Runde
- Konsistenz: Targets (Zone/Player/Device) müssen existieren

**Preview:**
- Button: **Preview Events** → Timeline-Chart (X=Runden, Y=Events als Marker)

---

#### 4.6 Tab 6: Devices – Geräte-Definition

**Zweck:** Definieren Sie alle Geräte (Generatoren, Speicher, Lasten) für dieses Szenario.

**Bereiche:**

1. **Device Types Reference**
   - Button: **View Device Type Catalog** → Öffnet Modal mit allen 12 Device-Klassen
   - Pro Klasse: Name, Icon, Required Parameters, Defaults
   - Klassen:
     1. **Solar (PV)**
     2. **Wind Turbine**
     3. **Hydroelectric**
     4. **Coal Plant**
     5. **Gas Plant**
     6. **Nuclear Plant**
     7. **Battery Storage**
     8. **Pumped Storage**
     9. **Biomass**
     10. **Diesel Generator**
     11. **Industrial Load**
     12. **Residential Load**

2. **Devices List**
   - Tabelle: ID | Type | Zone | Capacity (MW) | Min Load (%) | Marginal Cost (ZAR/MWh) | Aktionen
   - Sortierung: Nach ID
   - Button: **Add Device**

3. **Add/Edit Device Dialog**

   **Common Fields (alle Device-Typen):**

   - **Device ID**
     - Label: "Device ID"
     - Tooltip: "Unique identifier (e.g., 'solar_1', 'battery_2'). Used in Player Types and UI."
     - Type: Text (max. 30 Zeichen, alphanumeric + underscore)
     - Erforderlich: Ja
     - Validierung: Eindeutig innerhalb Szenario

   - **Device Type**
     - Label: "Type"
     - Tooltip: "Select device class. Each type has specific parameters."
     - Type: Dropdown
     - Options: 12 Klassen (siehe oben)
     - Erforderlich: Ja

   - **Zone**
     - Label: "Zone Assignment"
     - Tooltip: "Which grid zone this device belongs to (1–5)."
     - Type: Dropdown
     - Options: Z1, Z2, ... (basierend auf Grid-Config)
     - Default: Z1

   - **Name (Optional)**
     - Label: "Display Name"
     - Tooltip: "Human-readable name shown to players (e.g., 'Solar Farm Johannesburg')."
     - Type: Text (max. 50 Zeichen)
     - Optional

   - **Description (Optional)**
     - Label: "Description"
     - Tooltip: "Additional info for players (shown in briefing)."
     - Type: Textarea (max. 200 Zeichen)
     - Optional

   **Type-Specific Fields (Conditional basierend auf Device Type):**

   **Solar (PV):**
   - **Max Power (MW):** Default 100, Range 1–10000
   - **Efficiency (%):** Default 18, Range 10–25
   - **Marginal Cost (ZAR/MWh):** Default 0, Range 0–100
   - **Must-Run:** Checkbox, Default true
   - **Curtailment Priority:** Dropdown (Low/Medium/High), Default Low

   **Wind:**
   - **Rated Power (MW):** Default 50, Range 1–5000
   - **Cut-in Speed (m/s):** Default 3, Range 2–5
   - **Cut-out Speed (m/s):** Default 25, Range 20–30
   - **Efficiency (%):** Default 35, Range 25–45
   - **Marginal Cost (ZAR/MWh):** Default 0
   - **Must-Run:** Default true

   **Coal:**
   - **Max Power (MW):** Default 500, Range 10–2000
   - **Min Load (%):** Default 40, Range 30–60
   - **Ramp Rate (MW/min):** Default 5, Range 1–20
   - **Marginal Cost (ZAR/MWh):** Default 200, Range 100–500
   - **Start-up Cost (ZAR):** Default 10000, Range 0–50000
   - **Start-up Time (hours):** Default 4, Range 1–12

   **Gas:**
   - **Max Power (MW):** Default 300, Range 10–1000
   - **Min Load (%):** Default 30, Range 20–50
   - **Ramp Rate (MW/min):** Default 20, Range 10–50
   - **Marginal Cost (ZAR/MWh):** Default 300, Range 200–600
   - **Start-up Cost (ZAR):** Default 5000
   - **Start-up Time (hours):** Default 0.5, Range 0.25–2

   **Nuclear:**
   - **Max Power (MW):** Default 1000, Range 500–3000
   - **Min Load (%):** Default 90, Range 80–95
   - **Ramp Rate (MW/min):** Default 1, Range 0.5–5
   - **Marginal Cost (ZAR/MWh):** Default 50, Range 30–100
   - **Must-Run:** Default true

   **Battery Storage:**
   - **Capacity (MWh):** Default 100, Range 10–1000
   - **Power Rating (MW):** Default 50, Range 5–500
   - **Efficiency (%):** Default 85, Range 70–95
   - **Initial SoC (%):** Default 50, Range 0–100
   - **Max DoD (Depth of Discharge, %):** Default 90, Range 50–100
   - **Degradation (%/cycle):** Default 0.1, Range 0–1
   - **Marginal Cost (ZAR/MWh):** Default 10, Range 0–50

   **Pumped Storage:**
   - **Capacity (MWh):** Default 500, Range 100–5000
   - **Power Rating (MW):** Default 200, Range 50–2000
   - **Round-trip Efficiency (%):** Default 75, Range 60–85
   - **Marginal Cost (ZAR/MWh):** Default 20

   **Industrial Load:**
   - **Max Load (MW):** Default 100, Range 10–5000
   - **Min Load (%):** Default 70, Range 50–100
   - **Flexibility (%):** Default 20, Range 0–50 (wie viel kann abgeschaltet werden)
   - **Value of Lost Load (ZAR/MWh):** Default 10000, Range 5000–20000

   **Residential Load:**
   - **Max Load (MW):** Default 50, Range 5–1000
   - **Min Load (%):** Default 90, Range 80–100
   - **Flexibility (%):** Default 5, Range 0–20
   - **Value of Lost Load (ZAR/MWh):** Default 15000

   **Buttons:**
   - **Save Device**
   - **Cancel**

4. **Validation**
   - Eindeutige Device IDs
   - Min Load ≤ Max Power
   - Ramp Rate realistisch (basierend auf Typ)
   - SoC ≤ Capacity
   - Alle Required Parameters ausgefüllt

**Preview:**
- Button: **Preview Devices** → Tabelle aller Devices mit aggregierten Stats (Total Capacity, Avg Cost, etc.)

---

#### 4.7 Tab 7: Player Types – Spieler-Archetypen

**Zweck:** Definieren Sie Player Types (für shared_market-Modus) und ordnen Sie Geräte zu.

**Bereiche:**

1. **Info-Box**
   - "Player Types define scenario-specific archetypes for shared_market mode. Each type references devices from the Devices tab and optionally a zone."

2. **Player Types List**
   - Tabelle: ID | Name | Devices (Anzahl) | Zone | Aktionen
   - Button: **Add Player Type**

3. **Add/Edit Player Type Dialog**

   **Felder:**

   - **Player Type ID**
     - Label: "Type ID"
     - Tooltip: "Unique identifier (e.g., 'producer_a', 'consumer_b'). Used in session config."
     - Type: Text (max. 30 Zeichen, alphanumeric + underscore)
     - Erforderlich: Ja
     - Validierung: Eindeutig

   - **Name**
     - Label: "Display Name"
     - Tooltip: "Human-readable name shown to players (e.g., 'Producer – Baseload')."
     - Type: Text (max. 50 Zeichen)
     - Erforderlich: Ja

   - **Description (Optional)**
     - Label: "Description"
     - Tooltip: "Additional info for players (shown in type selection dialog)."
     - Type: Textarea (max. 200 Zeichen)

   - **Devices**
     - Label: "Assigned Devices"
     - Tooltip: "Select one or more devices from this scenario. Players of this type can only edit these devices."
     - Type: Multi-Select (Dropdown mit Checkboxen)
     - Options: Alle Devices aus Devices-Tab (ID + Name)
     - Erforderlich: Mindestens 1 Device
     - Validierung: Alle Device-IDs existieren

   - **Zone (Optional)**
     - Label: "Default Zone"
     - Tooltip: "Optional: Assign this type to a specific zone. If empty, uses device zones."
     - Type: Dropdown
     - Options: Z1, Z2, ... (oder "Auto")
     - Default: "Auto"

   **Buttons:**
   - **Save Player Type**
   - **Cancel**

4. **Validation**
   - Eindeutige Type IDs
   - Mindestens 1 Device pro Type
   - Device-IDs existieren (aus Devices-Tab)
   - Name nicht leer

**Preview:**
- Button: **Preview Player Types** → Tabelle mit aggregierten Device-Stats pro Type (Total Capacity, Avg Cost, etc.)

---

#### 4.8 Tab 8: Scoring – KPIs & Leaderboard

**Zweck:** Definieren Sie KPI-Gewichtungen und Leaderboard-Regeln.

**Bereiche:**

1. **KPI Selection**
   - Label: "Active KPIs"
   - Tooltip: "Select which KPIs are tracked and displayed. Default: Profit, Imbalance, Curtailment."
   - Type: Checkboxes
   - Options:
     - **Profit (ZAR):** Default enabled
     - **Revenue (ZAR):** Default enabled
     - **Imbalance Cost (ZAR):** Default enabled
     - **Curtailment Cost (ZAR):** Default enabled
     - **Emissions (tCO2):** Optional
     - **Renewable Share (%):** Optional
   - Validierung: Mindestens 1 KPI aktiviert

2. **KPI Weights**
   - Label: "Leaderboard Weights"
   - Tooltip: "Relative weights for ranking. Must sum to 1.0 (100%)."
   - Type: Number-Felder pro aktiviertem KPI
   - Beispiel:
     - Profit: 0.6 (60%)
     - Imbalance: 0.3 (30%)
     - Curtailment: 0.1 (10%)
   - Default: Profit 0.6, Imbalance 0.3, Curtailment 0.1
   - Validierung: `Σ weights === 1.0`
   - Auto-Normalisierung: Bei Änderung andere Gewichte proportional anpassen (optional)

3. **Normalization Method**
   - Label: "KPI Normalization"
   - Tooltip: "How to normalize KPIs for ranking. Z-score = (value - mean) / std_dev; Min-Max = (value - min) / (max - min)."
   - Type: Dropdown
   - Options: "Z-score" | "Min-Max"
   - Default: "Z-score"

4. **Leaderboard Mode**
   - Label: "Leaderboard Scope"
   - Tooltip: "Role-specific = separate rankings per role (Producer, Consumer); Global = all players together."
   - Type: Dropdown
   - Options: "Role-Specific" | "Global"
   - Default: "Role-Specific"

5. **Reference Runs**
   - Label: "Reference Run (Benchmark)"
   - Tooltip: "Optional: Upload a 'perfect' solution for comparison. JSON format (session export)."
   - Type: File Upload (JSON)
   - Button: **Upload Reference**
   - Hinweis: "Trainers can also upload references later."

**Formula Display:**
- Info-Box: "Final Score = Σ (weight × normalized KPI)"
- Beispiel-Rechnung (mit fiktiven Werten)

**Validation:**
- Weights summen zu 1.0
- Reference JSON korrekt (falls hochgeladen)

---

#### 4.9 KSE Footer – Aktionen

**Buttons:**

1. **Save**
   - Speichert alle Tabs (ohne Validierung)
   - API: PUT `/api/kse/scenarios/:id` `{ config: {...} }`
   - Erfolg: Snackbar "Scenario saved"

2. **Save & Validate**
   - Speichert + führt Backend-Validierung aus
   - API: PUT `/api/kse/scenarios/:id` `{ config: {...} }` → POST `/api/kse/scenarios/:id/validate`
   - Erfolg: Snackbar "Validation passed", grüner Check
   - Fehler: Liste mit Fehlern (Tab + Feld), erste Fehlerstelle wird geöffnet

3. **Preview**
   - Generiert Charts/Statistiken ohne Speichern
   - API: POST `/api/kse/scenarios/preview` `{ config: {...} }`
   - Öffnet Modal mit:
     - Environment Curves (Supply/Demand)
     - Events Timeline
     - Device Capacity Distribution (Pie Chart)
     - Player Type Comparison (Bar Chart)
   - Export: PNG/SVG pro Chart

4. **Export JSON**
   - Download Szenario als JSON
   - Dateiname: `scenario_{name}_{date}.json`

5. **Import JSON**
   - Button: **Import from JSON** öffnet Upload-Dialog
   - Validierung: JSON-Struktur prüfen, Fehler anzeigen
   - Erfolg: Alle Felder werden überschrieben (mit Confirm)

6. **Cancel**
   - Verwerfen ungespeicherter Änderungen (mit Confirm)
   - Weiterleitung zu `/designer/scenarios`

---

### 5. Erweiterte Funktionen

#### 5.1 Validation System

**Zweck:** Automatische Prüfung aller Eingaben auf Syntax, Plausibilität, Konsistenz.

**Validierungs-Ebenen:**

1. **Frontend (Echtzeit):**
   - Range-Checks (z.B. 1 ≤ rounds ≤ 10)
   - Format-Checks (z.B. Datum, Email)
   - Summen-Checks (z.B. Gewichte = 1.0)
   - Eindeutigkeits-Checks (z.B. Device IDs)

2. **Backend (on-save):**
   - Konsistenz-Checks (z.B. horizon = rounds × span)
   - Referenz-Checks (z.B. Device IDs in Player Types existieren)
   - Plausibilitäts-Checks (z.B. ATC < unrealistische Werte)
   - Event-Overlaps

**Fehler-Anzeige:**
- Inline: Rotes Feld + Fehlermeldung
- Summary: Modal mit allen Fehlern (Tab + Feld + Fehlertext)
- Blockierung: "Save" disabled bei kritischen Fehlern

**Warnungen:**
- Gelbe Umrandung + Tooltip
- Nicht blockierend, aber empfohlen zu beheben

---

#### 5.2 Templates & Presets

**Zweck:** Schnelles Erstellen von Szenarien mit vorkonfigurierten Settings.

**Templates:**

1. **Blank**
   - Alle Defaults (siehe Tab-Beschreibungen)
   - Leere Devices/Events/Player Types

2. **Standard Day**
   - Environment: 40% Solar, 30% Wind, 20% Gas, 10% Coal
   - Devices: 5 Standard-Devices (solar_1, wind_1, gas_1, coal_1, battery_1)
   - Events: Keine
   - Player Types: 2 (Producer, Consumer)

3. **High Renewables**
   - Environment: 60% Solar, 30% Wind, 10% Gas
   - Devices: 8 Devices (6 Renewables, 1 Gas, 1 Battery)
   - Events: "Weather Boost" (Round 2)
   - Player Types: 3 (Renewable Producer, Gas Producer, Consumer)

4. **Peak Winter**
   - Environment: 40% Coal, 40% Gas, 20% Wind
   - Devices: 6 Devices (2 Coal, 2 Gas, 1 Wind, 1 Pumped Storage)
   - Events: "Demand Surge" (Round 3), "Renewable Drought" (Round 2)
   - Player Types: 2 (Baseload Producer, Peaker Producer)

**Workflow:**
- Bei Szenario-Erstellung: Template auswählen
- KSE öffnet sich mit vorgefüllten Feldern
- Anpassungen möglich

---

#### 5.3 Export & Import

**Export JSON:**
- Vollständige Szenario-Config als JSON
- Format: `{ name, config: { general, markets, grid, environment, events, devices, player_types, scoring } }`
- Verwendung: Backup, Sharing mit anderen Designern, Versionierung

**Import JSON:**
- Upload JSON-Datei
- Validierung: JSON-Struktur + Inhalt
- Optionen:
  - "Create New Scenario" (neue ID)
  - "Overwrite Current" (mit Confirm)

**CSV Export (Devices):**
- Button: **Export Devices as CSV** (auf Devices-Tab)
- Spalten: ID, Type, Zone, Capacity, Min Load, Marginal Cost, ...
- Verwendung: Dokumentation, Excel-Analyse

---

#### 5.4 Collaboration (optional, falls implementiert)

**Scenario Sharing:**
- Button: **Share Scenario** → Generiert Link oder Invite-Code
- Andere Designer können JSON importieren

**Version Control:**
- Automatisches Speichern von Versionen (Timestamps)
- Button: **View History** → Liste aller Saves mit Diff
- Restore: Zurücksetzen auf frühere Version

---

### 6. Best Practices

#### 6.1 Szenario-Design

1. **Ziele klar definieren:**
   - Schreiben Sie konkrete Lernziele (Objectives-Feld)
   - Beispiel: "Verstehen Sie, wie negative Preise entstehen" → Event "Renewable Drought" weglassen

2. **Komplexität staffeln:**
   - Kampagne mit 3–5 Szenarien: Einfach → Mittel → Schwer
   - Szenario 1: Nur DA-Markt, keine Events, 2 Devices
   - Szenario 5: DA + IDM + Balancing, 3 Events, 10 Devices, Player Types

3. **Events dosiert einsetzen:**
   - Max. 2–3 Events pro Szenario (sonst Überforderung)
   - Erste Szenarien: Keine Events (Grundlagen lernen)
   - Spätere Szenarien: Kombination (z.B. Fuel Spike + Demand Surge)

4. **Device-Mix realistisch:**
   - Südafrika-Context: Coal dominant (40%), aber Renewables wachsend (30%)
   - Must-Run für Wind/Solar (Curtailment-Logik testen)
   - Battery Storage optional (fortgeschrittene Szenarien)

5. **Player Types sinnvoll:**
   - Shared Market: 2–4 Types (nicht mehr, sonst unübersichtlich)
   - Baseload vs. Peaker (unterschiedliche Ramp Rates)
   - Producer vs. Consumer (Asymmetrie)

---

#### 6.2 Validation & Testing

1. **Vor Veröffentlichung:**
   - "Save & Validate" ausführen
   - Preview-Charts prüfen (Supply/Demand realistisch?)
   - Test-Session im Solo-Modus spielen (selbst testen)

2. **Mit kleiner Gruppe testen:**
   - Pilot-Session mit 3–5 Spielern
   - Feedback einholen (zu schwer? zu leicht? verwirrend?)
   - Iterieren

3. **Dokumentation:**
   - Objectives-Feld vollständig ausfüllen
   - Descriptions für Devices/Player Types (Klarheit für Spieler)

---

#### 6.3 Kampagnen-Struktur

1. **Lernpfad:**
   - Reihenfolge logisch (Basics → Advanced)
   - Szenario-Namen beschreibend (z.B. "1. Intro to DA", "2. Handling Imbalance", "3. Multi-Market Strategy")

2. **Cover Image:**
   - Professionell gestalten (640×640px, klares Logo/Grafik)
   - Konsistent über Kampagnen-Serie

3. **Solo vs. Cohort:**
   - Solo für Selbststudium aktivieren (solo_enabled=true)
   - Cohort für Workshops/Kurse (cohort_enabled=true)
   - Beide aktivieren für Flexibilität

---

### 7. Troubleshooting & FAQ

#### 7.1 Häufige Probleme

**Problem:** "Validation failed: horizon_hours must equal rounds × round_span."
- **Lösung:** Passen Sie `horizon_hours` an oder ändern Sie `rounds`/`round_span`. Auto-Berechnung nutzen (Feld leer lassen).

**Problem:** "Device ID 'solar_1' not found in Player Type."
- **Lösung:** Device wurde gelöscht oder umbenannt. Aktualisieren Sie Player Type (Devices-Tab → Player Types-Tab).

**Problem:** "Weights do not sum to 1.0."
- **Lösung:** Scoring-Tab → Gewichte anpassen. Nutzen Sie Auto-Normalisierung (falls implementiert).

**Problem:** "Preview shows no intersection (MCP)."
- **Lösung:** Environment-Tab → Baseline Capacities prüfen. Supply > Demand? Oder umgekehrt? Gruppe-Shares anpassen.

**Problem:** "Event trigger overlaps with another event."
- **Lösung:** Events-Tab → Trigger-Runden prüfen. Warnung akzeptieren oder Events verschieben.

---

#### 7.2 FAQ

**F: Kann ich ein Szenario nach Veröffentlichung ändern?**  
A: Ja. Änderungen wirken auf neue Sessions. Laufende Sessions nutzen alte Config (gespeichert in `sessions.config_snapshot`).

**F: Wie viele Devices sollte ich pro Szenario haben?**  
A: Empfohlen: 5–10 für Einstiegs-Szenarien, 10–20 für fortgeschrittene. Max. 50 (technisches Limit).

**F: Kann ich Player Types nachträglich ändern?**  
A: Ja, aber nur vor Session-Start. Laufende Sessions behalten alte Types.

**F: Was passiert, wenn ich ein Device lösche, das in Player Types verwendet wird?**  
A: Validation schlägt fehl. Entfernen Sie Device erst aus allen Player Types, dann löschen.

**F: Kann ich Templates anpassen?**  
A: Ja. Laden Sie Template, ändern Sie Felder, speichern Sie als neues Szenario.

**F: Wie oft sollte ich Validierung ausführen?**  
A: Nach größeren Änderungen (z.B. neue Devices, Events) und definitiv vor Veröffentlichung.

---

### 8. Glossar

(Siehe Player/Trainer Handbücher – identisch)

Zusätzliche Designer-Begriffe:

| Begriff | Erklärung |
|---------|-----------|
| **KSE** | Kampagnien/Szenarieneditor – Hauptwerkzeug für Designer |
| **Device Class** | Geräte-Typ (z.B. Solar, Wind, Battery) mit spezifischen Parametern |
| **Player Type** | Archetyp für shared_market (z.B. "Producer A") mit zugeordneten Geräten |
| **Environment Generator** | Tool zur automatischen Markt-Baseline-Generierung |
| **Event Library** | Vordefinierte Event-Vorlagen (7 Defaults) |
| **ATC** | Available Transfer Capacity – Übertragungskapazität zwischen Zonen |
| **Must-Run** | Gerät, das nicht abgeregelt werden kann (typisch: Wind, Solar, Nuclear) |
| **Curtailment Priority** | Reihenfolge, in der Geräte bei Überschuss abgeregelt werden |
| **RNG Seed** | Random Number Generator Seed – für reproduzierbare Baseline-Generierung |
| **Template** | Vorkonfigurierte Szenario-Settings (z.B. "Standard Day") |

---

### 9. Kontakt & Support

**Technischer Support:**
- Email: support@emsg.example.com
- Reaktionszeit: 24–48h

**Admin-Kontakt:**
- Für erweiterte Berechtigungen oder System-Limits: admin@emsg.example.com

**Dokumentation:**
- Dieses Handbuch: `/docs/guide/designer-handbook.md`
- Player Handbuch: `/docs/guide/player-handbook.md`
- Trainer Handbuch: `/docs/guide/trainer-handbook.md`
- API-Dokumentation: `/docs/api.md` (für fortgeschrittene Nutzer)

**Community & Sharing:**
- Designer-Forum: (optional, Link)
- Szenario-Galerie: (optional, Link zur Sharing-Plattform)

**Video-Tutorials:**
- KSE Walkthrough (optional, Link)
- Campaign Setup (optional, Link)

---

**Ende des Designer Handbuchs**  
**Version:** 1.0 | **Datum:** 17.11.2025  
**Lizenz:** Intern | **Copyright:** EMSG Project Team
