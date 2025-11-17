# Designer Handbook (KSE)
## Energy Market Simulation Game (EMSG)

Version: 1.0  
Date: 17 Nov 2025  
Audience: Designers/Scenario Editors

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

Market Rules
- Enable DA/IDM/Balancing; price floor/cap (allow negative pricing), uniform-price clearing, pro‑rata ties, imbalance prices (up/down), transmission losses.

Grid
- Zones (1–5), symmetric ATC matrix (MW), congestion handling and revenue (fixed options).

Environment
- Producer/consumer totals (MW), number of agents, group shares (sum 100%), zonal splits per group (sum 100%), RNG seed; Preview curves, export PNG/SVG.

Events
- Library defaults + custom events: name, type (systemic/player), trigger (round/probability), duration (rounds/hours), impact (×/±), target (all/zone/type/device), optional pre‑warning; timeline preview; validation.

Devices
- Define generators/storage/loads with required parameters per class; unique IDs; validate ranges and required fields.

Player Types
- `{ id, name, devices[], zone? }`; required for `shared_market`. Players can edit only assigned devices. Validate unique IDs and device existence.

Scoring
- KPIs (Profit, Revenue, Imbalance Cost, Curtailment Cost, optional others). Weights sum to 1.0. Normalization (Z‑score or Min‑Max). Role‑specific or global leaderboard. Optional reference run upload.

### 4) Footer Actions
- Save, Save & Validate, Preview, Export JSON, Import JSON (overwrite or create new).

### 5) Validation & Best Practices
- Frontend checks: ranges, formats, uniqueness, sums. Backend checks: horizon=rounds×span, references, ATC bounds, event overlaps.
- Design tips: clear objectives, layered complexity across a campaign, ≤3 events per scenario, realistic SA mixes, 2–4 player types for shared market, dry‑run before publish.

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
