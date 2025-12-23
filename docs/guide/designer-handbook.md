# Designer Handbook (KSE)
## Energy Market Simulation Game (EMSG)

**Version**: 1.5 (Sprint 24)  
**Date**: 23 Dec 2025  
**Audience**: Designers/Scenario Editors

---

## What's New (Sprint 24)

- **DA/ID Price Differentiation**: Neuer Szenario-Parameter für realistische Marktpreise:
  - `id_price_spread_percent`: Preisaufschlag für Intraday-Handel
  - Beispiel: `8` = ID-Markt ist 8% teurer als DA-Markt
  - Anreiz für sorgfältige Day-Ahead Planung
  - Negative Werte möglich (ID günstiger)
- **Enhanced Round Results**: Spieler sehen jetzt detaillierte DA/ID Breakdown:
  - DA Volume, ID Delta, Final Position, ID Adjustment %
  - Tägliche Aufschlüsselung als klappbares Accordion
  - Separate Preisanzeige für DA und ID Märkte
- **Consumer Role Support**: Volle Unterstützung für Verbraucher-Szenarien:
  - Angepasste Labels und Farbcodierung
  - Korrekte Berechnung von Kosten statt Revenue

**Previous (Sprint 23)**:
- **Hourly Market Clearing**: Engine automatically performs market clearing for each hour within a round
  - Works with any `round_span_hours` setting (1, 3, 4, 6, 8, 12, 24, etc.)
  - Provides more realistic price discovery based on hourly conditions
  - Round MCP displayed as average across all hours
  - **Design Impact**: Consider shorter rounds (2-4 hours) for more granular market signals
- **Campaign Publishing**: Publish campaigns to make them visible in player catalog
- **Scenario Ordering**: Drag-and-drop scenario ordering within campaigns
- **Solo/Cohort Toggles**: Control whether scenarios can be played solo or in cohort sessions
- **Multi-Bid Pricing Configuration**: Optional feature for strategic pricing gameplay
  - Enable per-scenario with bid tranches (A/B/C)
  - Players submit price-quantity bids per device
  - Market clears in merit order (lowest price first)
- **Enhanced Scenario Editor**: Better UX with tabbed navigation and validation
- **Campaign Catalog Preview**: First 200 characters of scenario objectives shown as preview

**Previous (Sprint 22)**:
- Device Preset Library with quick-create templates
- Per-Device Charts in player interface
- Player Type ID Auto-Generation
- Enhanced device information display

---

## Quick Guide

- Use KSE to build campaigns and scenarios.
- Steps: Create campaign → Edit scenario (tabs) → Validate/Preview → Publish → Export/Import JSON.
- Tabs: General, Market Rules, Grid, Environment, Events, Devices, Player Types, Scoring.
- Every field has a short help and tooltip; backend validation blocks inconsistencies.

---

## Detailed Guide

### 1) Campaign Management
- Create campaign (name, description, cover image 640×640 PNG/JPG). Publish toggle controls catalog visibility.
- Assign scenarios (n:m), order via drag & drop, set `solo_enabled` and `cohort_enabled` per assignment.

### 2) Scenario Management
- List: Edit, Duplicate, Delete, Export JSON; Create from Template (Blank | Standard Day | High Renewables | Peak Winter).

### 3) KSE Tabs

General
- Scenario name, objectives (markdown), fake date and start time, rounds and round duration, simulated hours per round, forecast horizon (≥ horizon), scenario horizon (= rounds × span), freeze hours (≤ span).
- **Note**: The first 200 characters of the objectives field are displayed as a description preview in the Campaign Catalog to help players understand each scenario before starting.

Market Rules
- Enable DA/IDM/Balancing; price floor/cap (allow negative pricing), uniform-price clearing, pro‑rata ties, imbalance prices (up/down), transmission losses.
- **`id_price_spread_percent`** (Sprint 24): Preisaufschlag für Intraday-Handel
  - `0` (Default): Gleicher Preis für DA und ID
  - `5` bis `15`: Typischer Aufschlag für volatile ID-Märkte
  - `-5`: ID günstiger (Verkäufermarkt)
  - Wird im Round Results Modal angezeigt

Grid
- Zones (1–5), symmetric ATC matrix (MW), congestion handling and revenue (fixed options).

Environment
- Producer/consumer totals (MW), number of agents, group shares (sum 100%), zonal splits per group (sum 100%), RNG seed; Preview curves, export PNG/SVG.

Events
- Library defaults + custom events: name, type (systemic/player), trigger (round/probability), duration (rounds/hours), impact (×/±), target (all/zone/type/device), optional pre‑warning; timeline preview; validation.

Devices
- **Preset Library** (Sprint 21): Click "Add from Preset" to quick-create devices:
  - Generators: Coal (600 MW, 35% eff), Gas (400 MW, 50% eff), Hydro (200 MW, 90% eff), Nuclear (1000 MW, 33% eff)
  - Renewables: Solar (100 MW, 25% CF), Wind (150 MW, 35% CF)
  - Storage: Battery (100 MWh capacity, 50 MW power, 85% eff)
  - Loads: Industrial (300 MW baseline, 450 MW peak, DRM-capable), Commercial (100/200 MW), Residential (150/300 MW)
- **Device Fields**:
  - `name` (optional, **recommended** Sprint 22): Friendly name prominently displayed in player UI (e.g., "Koeberg Unit 1")
    - Players see device name in forecast editor headers for easy identification
    - Helpful for distinguishing similar devices (e.g., "Wind Farm North" vs "Wind Farm South")
  - `id` (auto-generated): Unique ID with timestamp to prevent collisions
  - Type-specific parameters (capacity, cost, efficiency, ramp rate, etc.)
- **Actions**: Add from Preset, Duplicate, Delete
- **Validation**: Unique IDs, required fields per type, numeric ranges

Player Types
- **Structure**: `{ id, name, devices[], zone? }`
- **Required for**: Trainer-led sessions where players select roles and control specific devices
- **Auto-Generated IDs** (Sprint 21): Click "Add Player Type" to create with unique timestamp-based ID (`ptype_<timestamp>_<random>`)
- **Normalization on Save**: All player types validated and ensured unique IDs before save
- **Validation**: Unique IDs across types, all referenced devices must exist in scenario
- **Best Practice**: 2-4 types for shared market; assign complementary devices (e.g., Type A = generators, Type B = storage + loads)

Scoring
- KPIs (Profit, Revenue, Imbalance Cost, Curtailment Cost, optional others). Weights sum to 1.0. Normalization (Z‑score or Min‑Max). Role‑specific or global leaderboard. Optional reference run upload.

### 4) Footer Actions
- Save, Save & Validate, Preview, Export JSON, Import JSON (overwrite or create new).

### 5) Validation & Best Practices
- Frontend checks: ranges, formats, uniqueness, sums. Backend checks: horizon=rounds×span, references, ATC bounds, event overlaps.
- Design tips: clear objectives, layered complexity across a campaign, ≤3 events per scenario, realistic SA mixes, 2–4 player types for trainer sessions, dry‑run before publish.

---

## South Africa Context
- SAWEM orientation; Eskom SO/NTCSA constructs in examples.
- ZAR currency; MW/MWh units; price floor/cap often −500/+5,000 ZAR/MWh.
- SAST (UTC+2) timezone.
- Example two‑zone grid with symmetric ATC (≈5,000 MW) and curtailment by cost order.
- Suggested SA templates: Standard Day, High Renewables, Peak Winter; consider an educational “Load Shedding Advisory” event.
- POPIA: avoid PII in shared configs/exports.

---

Support
- Technical: support@emsg.example.com
- Documentation: docs/guide/designer-handbook.md
