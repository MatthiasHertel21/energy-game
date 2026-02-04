# Designer Handbook (KSE)
## Energy Market Simulation Game (EMSG)

**Version**: 2.1 (Sprint 24)  
**Date**: January 22, 2026  
**Audience**: Designers/Scenario Editors

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Campaign Management](#2-campaign-management)
3. [Scenario Editor (KSE)](#3-scenario-editor-kse)
4. [Tab: General](#4-tab-general)
5. [Tab: Market Rules](#5-tab-market-rules)
6. [Tab: Grid](#6-tab-grid)
7. [Tab: Environment](#7-tab-environment)
8. [Tab: Events](#8-tab-events)
9. [Tab: Devices](#9-tab-devices)
10. [Tab: Player Types](#10-tab-player-types)
11. [Tab: Scoring](#11-tab-scoring)
12. [Validation & Export](#12-validation--export)
13. [Best Practices](#13-best-practices)
14. [Reference: Configuration Schema](#14-reference-configuration-schema)

---

## 1. Introduction

### What is the KSE?

The **Knowledge Scenario Editor (KSE)** is the tool for creating and editing campaigns and scenarios. As a designer, you define:

- Market structures and rules
- Network infrastructure (zones, transmission capacities)
- Power plants, renewables, storage, and loads
- Events (outages, weather extremes, demand spikes)
- Scoring rules for evaluation

### Workflow Overview

```
1. Create Campaign
   └── Name, description, cover image

2. Create/Edit Scenarios
   ├── General Tab (Basics)
   ├── Market Rules Tab
   ├── Grid Tab
   ├── Environment Tab
   ├── Events Tab
   ├── Devices Tab
   ├── Player Types Tab
   └── Scoring Tab

3. Validate & Test
   └── Preview, dry-run

4. Publish
   └── Publish campaign → visible in catalog
```

### Navigation

| Route | Function |
|-------|----------|
| `/designer/campaigns` | Campaign list and management |
| `/designer/scenarios` | Scenario list |
| `/kse?scenarioId=...` | Scenario editor |

---

## 2. Campaign Management

### 2.1 Create Campaign

**Route**: `/designer/campaigns` → "New Campaign"

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Unique campaign name | "Introduction to Electricity Markets" |
| **Description** | Markdown-enabled, appears in catalog | "Learn the basics..." |
| **Cover Image** | 640×640px, PNG or JPG | Upload or URL |
| **Published** | Visible in catalog? | Toggle On/Off |

### 2.2 Assign Scenarios

After creating a campaign:

1. Click "Assign Scenarios"
2. Select existing scenarios from the list
3. Set order via drag & drop
4. Configure per scenario:

| Option | Description |
|--------|-------------|
| **Solo Allowed** | Players can start this scenario alone |
| **Cohort Allowed** | Trainers can start sessions for cohorts |

### 2.3 Publish Campaign

- Toggle "Published" to On
- Campaign appears in `/catalog` for all players
- Changes to scenarios take effect immediately

### 2.4 Delete Campaign

⚠️ **Warning**: Deletes all assignments but not the scenarios themselves.

---

## 3. Scenario Editor (KSE)

### 3.1 Create New Scenario

**Route**: `/designer/scenarios` → "New Scenario"

**Templates available:**

| Template | Description |
|----------|-------------|
| **Blank** | Empty scenario, configure everything manually |
| **Standard Day** | 24h with typical SA mix |
| **High Renewables** | High solar/wind share |
| **Peak Winter** | High demand, bottlenecks |

### 3.2 Duplicate Scenario

- Click ⋮ → "Duplicate"
- Creates copy with "_copy" suffix
- All configuration is copied

### 3.3 Export/Import Scenario

**Export:**
- ⋮ → "Export JSON"
- Complete configuration as JSON file

**Import:**
- "Import JSON" button
- Choose: Overwrite or Create new

---

## 4. Tab: General

### 4.1 Basic Settings

| Field | Description | Default |
|-------|-------------|---------|
| **Name** | Scenario name | "New Scenario" |
| **Objectives** | Learning goals, Markdown-enabled | (empty) |
| **Fake Date** | Simulated date | Today |
| **Start Time** | Simulated start time | "00:00" |

### 4.2 Time Parameters

| Field | Description | Default | Constraints |
|-------|-------------|---------|-------------|
| **Rounds** | Number of game rounds | 4 | 1-20 |
| **Round Duration (s)** | Real-time per round | 300 | 60-3600 |
| **Round Span (h)** | Simulated hours per round | 6 | 1-24 |
| **Forecast Horizon (h)** | Visible horizon | 48 | ≥ scenario_horizon |
| **Freeze Hours** | Hours frozen before delivery | 6 | ≤ round_span |

### 4.3 Calculated Values

```
scenario_horizon = rounds × round_span
Example: 4 rounds × 6h = 24h scenario
```

### 4.4 Objectives (Markdown)

The objectives field supports Markdown:

```markdown
## Learning Goals

1. Understand the Day-Ahead market
2. Learn to create forecasts
3. React to events

**Note**: The first 200 characters appear as preview in the catalog.
```

---

## 5. Tab: Market Rules

### 5.1 Market Structure

| Field | Description | Default |
|-------|-------------|---------|
| **Enable DA** | Day-Ahead market active | ✓ |
| **Enable IDM** | Intraday market active | ✓ |
| **Enable Balancing** | Balancing energy active | ✓ |

### 5.2 Price Rules

| Field | Description | Default |
|-------|-------------|---------|
| **Base Price** | Base SMP (ZAR/MWh) | 1000 |
| **Base Volume** | Base volume (MWh) | 20000 |
| **Price Floor** | Minimum price (ZAR/MWh) | -500 |
| **Price Cap** | Maximum price (ZAR/MWh) | 5000 |
| **Allow Negative Pricing** | Prices < 0 allowed | ✓ |

### 5.3 Clearing Options

| Field | Description | Default |
|-------|-------------|---------|
| **Uniform Price** | All receive SMP | ✓ |
| **Pro-Rata Ties** | Proportional at price ties | ✓ |
| **Enable Player Bidding** | Players bid prices | ✗ |

### 5.4 Imbalance Prices

| Field | Description | Default |
|-------|-------------|---------|
| **Balancing Up Price** | Price for under-delivery | 1.5 × SMP |
| **Balancing Down Price** | Price for over-delivery | 0.5 × SMP |

### 5.5 DA/ID Price Differentiation (NEW Sprint 24)

| Field | Description | Default |
|-------|-------------|---------|
| **day_ahead_gate_hour** | Gate closure hour | 12 |
| **id_price_spread_percent** | ID price premium (%) | 0 |

**Example values:**

| Spread | Effect |
|--------|--------|
| 0 | DA and ID same price |
| 8 | ID 8% more expensive → incentive for good DA planning |
| -5 | ID 5% cheaper → flexibility rewarded |

### 5.6 Transmission

| Field | Description | Default |
|-------|-------------|---------|
| **Transmission Losses (%)** | Transmission losses | 2 |

---

## 6. Tab: Grid

### 6.1 Define Zones

| Field | Description | Default |
|-------|-------------|---------|
| **Number of Zones** | 1-5 zones | 1 |
| **Zone Names** | List of zone names | ["Zone A"] |

### 6.2 ATC Matrix (Available Transfer Capacity)

Symmetric matrix for transmission capacities between zones:

```
         Zone A    Zone B
Zone A   ∞         5000 MW
Zone B   5000 MW   ∞
```

**Input:**
- Only enter upper triangle
- Lower triangle is mirrored

### 6.3 Congestion Handling

| Option | Description |
|--------|-------------|
| **Curtail by Cost** | Cheapest generators curtailed first |
| **Curtail Pro-Rata** | Proportional to capacity |
| **Redispatch** | Activate more expensive generators in other zone |

### 6.4 Congestion Revenue

| Option | Description |
|--------|-------------|
| **To Grid** | Congestion revenue to grid operator |
| **To Generators** | Congestion revenue to affected generators |
| **Split** | 50/50 split |

---

## 7. Tab: Environment & Preview

Environment-related settings are edited in the **Market** tab in KSE but are grouped here conceptually.

### 7.1 Generator & Consumer Mix (Preview)

The **Generator Mix** and **Consumer Mix** control the *relative* composition of the synthetic supply and demand curves in the preview. They are no longer percentages but **absolute block counts** (0–1000 per group):

**Generator Mix (blocks):**

| Group | Field | Meaning | Typical Default |
|-------|-------|---------|-----------------|
| PV / Solar | `market.generator_mix.pv` | Number of solar supply blocks | 250 |
| Wind | `market.generator_mix.wind` | Number of wind supply blocks | 200 |
| Hydro | `market.generator_mix.hydro` | Number of hydro supply blocks | 100 |
| Coal | `market.generator_mix.coal` | Number of coal supply blocks | 300 |
| Gas | `market.generator_mix.gas` | Number of gas supply blocks | 150 |
| Nuclear | `market.generator_mix.nuclear` | Number of nuclear supply blocks | 0 |

**Consumer Mix (blocks):**

| Group | Field | Meaning | Typical Default |
|-------|-------|---------|-----------------|
| Industrial | `market.consumer_mix.industrial` | Industrial demand blocks | 400 |
| Household | `market.consumer_mix.household` | Household demand blocks | 500 |
| Agriculture | `market.consumer_mix.agriculture` | Agricultural demand blocks | 100 |

Notes:
- Blocks are **normalized** internally for the preview curves; only **relative** sizes matter.
- A value of `0` effectively removes a group from the preview.
- These mixes influence preview curves and synthetic environment, but **do not replace** the detailed device list defined in the **Devices** tab.

### 7.2 Randomness (Jitter & Noise)

Randomness settings live under **Randomness** in the Market tab and control how noisy the synthetic environment and previews are:

| Field | Location | Description | Default |
|-------|----------|-------------|---------|
| `market.random_capacity_pct` | Market → Randomness | Capacity jitter (%). Random variation of individual supply/demand block quantities. Range 0–50%. | 10 |
| `market.random_price_pct` | Market → Randomness | Price jitter (%). Random variation of marginal costs and demand price steps. Range 0–50%. | 10 |
| `environment.actual_noise_pct` | Market → Randomness | **Actual vs Forecast noise (%).** Std. deviation of actual dispatch around the dispatched plan in sessions; controls “Actual vs Forecast” differences in charts. | 5 |

### 7.3 Environment Seed & Load Profiles

The **Environment** subsection in the Market tab configures the synthetic load shape used for previews and, optionally, scenarios:

| Field | Description | Default |
|-------|-------------|---------|
| `environment.seed` | Preview seed. Used **only** for KSE previews. Actual sessions use the campaign `seed`. | `"preview"` |
| `environment.profile_preset` | Named preset for diurnal/seasonal load profiles. Options: `None`, `Winter Weekday`, `Summer Weekday`, `Weekend`. | `None` |
| `environment.diurnal_profile` | 24-element array of hourly multipliers shaping the daily demand profile. | From preset or custom |
| `environment.seasonal_factors` | 12-element array of monthly multipliers shaping seasonal effects. | From preset or custom |

**Presets:**

- **Winter Weekday** – Higher winter baseline, strong evening peak
- **Summer Weekday** – Higher summer baseline, moderate evening peak
- **Weekend** – Flatter weekday profile, lower industrial component

You can also import custom profiles via the **Import Profiles (JSON)** field:

```json
{
  "diurnal_profile": [24 numbers],
  "seasonal_factors": [12 numbers]
}
```

Click **Apply Profiles** to load these arrays into the configuration.

### 7.4 Preview

The preview charts combine:
- **Market basics** (base price, base volume, price floor/cap)
- **Generator & consumer mixes** (block counts)
- **Randomness** (capacity/price jitter, actual noise)
- **Environment profiles** (diurnal + seasonal)

They provide a fast visual check of your environment, but the **actual game simulation** runs on the detailed devices, market rules, grid, and events.

---

## 8. Tab: Events

### 8.1 Event Type System

**CRITICAL CONCEPT:** The `type` field determines which calculation method is used:

| Type | Calculation | Use Case | Example |
|------|-------------|----------|----------|
| **systemic** | Multiplier (×) | Market-wide price changes | Fuel spike (×1.2) |
| **weather** | Additive (+/-) OR Capacity (×) | Weather impacts on renewables | Windflaute (×0.3 capacity) |
| **player** | Additive (+/-) | Player-specific events | Plant outage (-1000 MW) |
| **market** | Additive (+/-) | Market rule changes | Carbon tax (+50 ZAR/MWh) |
| **grid** | Additive (+/-) | Grid disturbances | Line trip (-500 MW) |
| **device** | Additive (+/-) OR Capacity (×) | Device-specific impacts | Battery degradation |

**Only `systemic` uses multiplier for price/volume. All others use additive values.**

### 8.2 Event Configuration Fields

#### Basic Information

| Field | Required | Description | Example |
|-------|----------|-------------|----------|
| **Name** | Yes | Event display name | "Windflaute" |
| **Description** | No | Player briefing text | "Low wind conditions reduce generation..." |
| **Type** | Yes | Calculation method (see 8.1) | "weather" |
| **Key** | No | Unique identifier for prob events | "windflaute" |

#### Trigger Configuration

| Field | Required | Description | Example |
|-------|----------|-------------|----------|
| **Trigger Type** | Yes | When event activates | "round" or "prob" |
| **Trigger Value** | Yes | Round number (round) or probability 0-1 (prob) | 3 or 0.2 (20%) |
| **Duration Rounds** | Yes | How many rounds event is active | 1 |

**Trigger Type Details:**
- **round**: Activates at specific round for N rounds
  - `trigger_value=3, duration_rounds=2` → Active in rounds 3 and 4
- **prob**: Random activation each round based on probability
  - `trigger_value=0.3` → 30% chance per round (deterministic hash-based)

#### Target Configuration

| Field | Required | Description | Example |
|-------|----------|-------------|----------|
| **Target** | Yes | What is affected | "all", "zone", "player", "device" |
| **Target ID** | Conditional | Specific entity identifier | "wind", "solar", "123" |

**Target Behavior:**
- **all**: Affects entire market, no target_id needed
- **zone**: Affects one zone, target_id = zone number ("1", "2")
- **player**: Affects one player, target_id = player ID ("123")
- **device**: Affects device(s), target_id = device ID or device type ("wind", "coal")

#### Impact Configuration

| Field | Used By | Description | Example |
|-------|---------|-------------|----------|
| **Multiplier** | systemic (price), all types (capacity) | Multiplication factor | 1.5 (150%), 0.3 (30%) |
| **Additive** | weather, player, market, grid, device | Add/subtract value | -1000 (reduce 1000 MW) |

### 8.3 Event Application - Two Phases

#### Phase 1: Capacity Reduction (Before Market Clearing)

Events with `target="device"` and `multiplier` reduce device capacity **before bidding**:

```json
{
  "name": "Windflaute",
  "type": "weather",
  "target": "device",
  "target_id": "wind",
  "multiplier": 0.3,
  "trigger_type": "prob",
  "trigger_value": 0.2
}
```

**Effect:** All wind devices bid at 30% capacity
- Wind farm normally: 100 MW bid
- During event: 30 MW bid (70 MW unavailable)
- **Revenue reduced because less energy is sold**

#### Phase 2: Price/Volume Adjustment (After Market Clearing)

Events modify final market price and volume:

| Type | Effect |
|------|--------|
| **systemic** | Multiplies price by `multiplier` |
| **All others** | Adds `additive` to volume |

```json
{
  "name": "Heat Wave",
  "type": "systemic",
  "target": "all",
  "multiplier": 1.5,
  "trigger_type": "round",
  "trigger_value": 3
}
```

**Effect:** Market clearing price multiplied by 1.5×
- Cleared at 1000 ZAR/MWh → Final SMP = 1500 ZAR/MWh

### 8.4 Common Event Patterns

#### Pattern 1: Weather Event (Capacity Reduction)

**Goal:** Reduce renewable generation during bad weather

```json
{
  "name": "Cloudy Day",
  "description": "Heavy cloud cover reduces solar generation to 20% capacity",
  "type": "weather",
  "target": "device",
  "target_id": "solar",
  "multiplier": 0.2,
  "trigger_type": "prob",
  "trigger_value": 0.15,
  "duration_rounds": 1,
  "key": "schlechtwetter"
}
```

#### Pattern 2: Plant Outage (Capacity Reduction)

**Goal:** Specific device goes offline

```json
{
  "name": "Koeberg Unit 1 Outage",
  "description": "Unplanned maintenance takes Unit 1 offline",
  "type": "device",
  "target": "device",
  "target_id": "nuclear_1",
  "multiplier": 0.0,
  "trigger_type": "round",
  "trigger_value": 2,
  "duration_rounds": 2
}
```

#### Pattern 3: Fuel Spike (Price Multiplier)

**Goal:** Increase market price due to fuel costs

```json
{
  "name": "Diesel Price Spike",
  "description": "Global oil shortage increases fuel costs 50%",
  "type": "systemic",
  "target": "all",
  "multiplier": 1.5,
  "trigger_type": "round",
  "trigger_value": 3,
  "duration_rounds": 2
}
```

#### Pattern 4: Player-Specific Event

**Goal:** Affect one player's operations

```json
{
  "name": "Grid Connection Failure",
  "description": "Your grid connection is partially disrupted",
  "type": "player",
  "target": "player",
  "target_id": "123",
  "multiplier": 0.7,
  "trigger_type": "round",
  "trigger_value": 4,
  "duration_rounds": 1
}
```

### 8.5 Testing Events

**Capacity Events (target="device"):**
1. Create event with `multiplier < 1.0`
2. Target device type ("wind", "solar", "coal")
3. Run scenario and check:
   - Device dispatch reduced proportionally
   - Revenue reduced (less MWh sold)
   - Zero multiplier = zero revenue

**Price Events (type="systemic"):**
1. Create event with `multiplier > 1.0` or `< 1.0`
2. Target "all"
3. Run scenario and check:
   - Final SMP multiplied correctly
   - All player revenues affected proportionally

### 8.6 Common Mistakes

❌ **Wrong:** Setting `type="weather"` with only `multiplier`
- Weather events use additive unless targeting device capacity
- For capacity reduction, must have `target="device"` + `target_id`

❌ **Wrong:** Expecting `type="player"` to use multiplier
- Only `type="systemic"` uses multiplier for price/volume
- Use `multiplier` for capacity reduction instead

❌ **Wrong:** Not setting `target` and `target_id` for device events
- Events without proper target affect nothing
- Must specify `target="device"` and `target_id="wind"`

✅ **Correct:** Weather event reducing wind capacity
```json
{
  "type": "weather",
  "target": "device",
  "target_id": "wind",
  "multiplier": 0.3
}
```

### 8.6 Pre-Warning

| Field | Description |
|-------|-------------|
| **Enable Pre-Warning** | Players are warned in advance |
| **Warning Rounds** | How many rounds before |
| **Warning Text** | Displayed warning text |

### 8.7 Timeline Preview

- Visual representation of all events over rounds
- Overlaps visible
- Click on event → details

---

## 9. Tab: Devices

### 9.1 Preset Library

Quick creation with predefined templates:

**Generators:**

| Preset | Capacity | Efficiency | Variable Cost |
|--------|----------|------------|---------------|
| Coal | 600 MW | 35% | 400 ZAR/MWh |
| Gas (CCGT) | 400 MW | 50% | 600 ZAR/MWh |
| Gas (OCGT) | 200 MW | 35% | 900 ZAR/MWh |
| Hydro | 200 MW | 90% | 50 ZAR/MWh |
| Nuclear | 1000 MW | 33% | 150 ZAR/MWh |

**Renewables:**

| Preset | Capacity | Capacity Factor |
|--------|----------|-----------------|
| Solar | 100 MW | 25% |
| Wind | 150 MW | 35% |

**Storage:**

| Preset | Capacity | Power | Efficiency |
|--------|----------|-------|------------|
| Battery (Li-ion) | 100 MWh | 50 MW | 85% |
| Pumped Hydro | 500 MWh | 100 MW | 75% |

**Loads:**

| Preset | Baseline | Peak | DRM |
|--------|----------|------|-----|
| Industrial | 300 MW | 450 MW | ✓ |
| Commercial | 100 MW | 200 MW | ✓ |
| Residential | 150 MW | 300 MW | ✗ |

### 9.2 Device Fields

**All Devices:**

| Field | Description | Required |
|-------|-------------|----------|
| **id** | Unique ID (auto-generated) | ✓ |
| **name** | Display name | Recommended |
| **type** | Device type | ✓ |
| **zone** | Assigned zone | ✓ |

**Generator-specific:**

| Field | Description | Example |
|-------|-------------|---------|
| **capacity_mw** | Rated power | 600 |
| **efficiency** | Efficiency (0-1) | 0.35 |
| **variable_cost_zar_per_mwh** | Fuel costs | 400 |
| **ramp_up_mw_per_h** | Max. ramp up | 100 |
| **ramp_down_mw_per_h** | Max. ramp down | 100 |
| **min_stable_mw** | Minimum partial load | 200 |
| **start_cost_zar** | Start-up costs | 50000 |

**Renewable-specific:**

| Field | Description | Example |
|-------|-------------|---------|
| **capacity_mw** | Installed power | 100 |
| **capacity_factor** | Average utilization | 0.25 |
| **profile** | Hourly profile (optional) | [0, 0, ..., 0.8, 1, 0.7, ...] |

**Storage-specific:**

| Field | Description | Example |
|-------|-------------|---------|
| **capacity_mwh** | Storage capacity | 100 |
| **power_mw** | Charge/discharge power | 50 |
| **efficiency** | Round-trip efficiency | 0.85 |
| **initial_soc** | Initial SoC (0-1) | 0.5 |
| **min_soc** | Minimum SoC | 0.1 |
| **max_soc** | Maximum SoC | 0.9 |

**Load-specific:**

| Field | Description | Example |
|-------|-------------|---------|
| **baseline_mw** | Base load | 300 |
| **peak_mw** | Peak load | 450 |
| **drm_capable** | Demand Response possible | true |
| **flexibility_pct** | Max. flexibility | 20 |
| **profile** | Hourly profile (optional) | [0.6, 0.5, ..., 1, ...] |

### 9.3 Actions

| Action | Description |
|--------|-------------|
| **Add from Preset** | Add device from library |
| **Duplicate** | Copy device (new ID) |
| **Delete** | Remove device |

### 9.4 Validation

- IDs must be unique
- Required fields per type are checked
- Numeric ranges are validated
- Referenced zones must exist

### 9.5 Device Defaults (Engine Assumptions)

On save, the editor normalizes device data and fills in reasonable defaults if some fields are omitted. This section documents the most important defaults.

**Conventional generators (coal, gas, hydro, nuclear)**

| Field | Default / Mapping |
|-------|-------------------|
| `max_power_mw` | Taken from `capacity_mw` if set, otherwise `0`. |
| `variable_cost_zar_per_mwh` | Taken from `variable_cost_zar_per_mwh` or, if missing, from `cost_per_mwh_zar`, otherwise `0`. |
| `min_load_pct` | If missing, defaults to `0` (% of max). |
| `ramp_rate_mw_per_min` | If missing, defaults to `60` MW/min. |

**Renewables (solar, wind)**

| Field | Default / Mapping |
|-------|-------------------|
| `max_power_mw` | Taken from `capacity_mw` if set, otherwise `0`. |
| `variable_cost_zar_per_mwh` | Taken from `variable_cost_zar_per_mwh` or `cost_per_mwh_zar`, otherwise `0`. |
| `capacity_factor_pct` | If missing, defaults to `30` (%). Represents typical availability over the horizon. |

**Storage (battery)**

| Field | Default / Mapping |
|-------|-------------------|
| `capacity_mwh` | Taken from `capacity_mwh` or, if missing, from `capacity_mw`, otherwise `100`. |
| `power_mw` | Taken from `power_mw` or, if missing, from `power_rating_mw`, otherwise `50`. |
| `efficiency_pct` | If missing, defaults to `85` (% round-trip efficiency). |
| `initial_soc_pct` | If missing, defaults to `50` (% state of charge at start). |

**Loads (e.g., `*_load` types)**

- Use the baseline/peak load fields from the UI (e.g., `baseline_load_mw`, `peak_load_mw`).
- No additional defaults are applied beyond numeric validation.

In practice, this means you can omit some fine-grained technical parameters in the UI, but the engine will still receive a complete configuration. For advanced scenarios, explicitly set these fields to override the defaults.

---

## 10. Tab: Player Types

### 10.1 When Required?

Player Types are required for **trainer-led Shared Market Sessions**.

Each Player Type defines:
- Which devices a player controls
- In which zone the player operates (optional)

### 10.2 Create Player Type

| Field | Description | Example |
|-------|-------------|---------|
| **id** | Unique ID (auto-generated) | ptype_1703340000_abc |
| **name** | Display name | "Generator Operator" |
| **devices** | List of assigned device IDs | ["coal_001", "gas_001"] |
| **zone** | Optional zone | "Zone A" |

### 10.3 Best Practices

| Recommendation | Reasoning |
|----------------|-----------|
| 2-4 Player Types | Clear for trainers |
| Complementary roles | e.g., producers vs consumers |
| Balanced capacities | No dominance by one type |
| Descriptive names | "Wind Farm Operator" not "Type A" |

### 10.4 Example Configuration

```json
"player_types": [
  {
    "id": "ptype_gen",
    "name": "Conventional Generator",
    "devices": ["coal_001", "gas_001", "nuclear_001"],
    "zone": "Zone A"
  },
  {
    "id": "ptype_re",
    "name": "Renewable Operator",
    "devices": ["solar_001", "wind_001", "battery_001"],
    "zone": "Zone B"
  },
  {
    "id": "ptype_consumer",
    "name": "Industrial Consumer",
    "devices": ["load_001", "load_002"],
    "zone": "Zone A"
  }
]
```

---

## 11. Tab: Scoring

### 11.1 KPI Weighting

Define how the Total Score is calculated:

| KPI | Description | Typical Weight |
|-----|-------------|----------------|
| **Profit** | Profit | 0.6 (60%) |
| **Imbalance** | Forecast accuracy (penalty) | 0.3 (30%) |
| **Curtailment** | Curtailment costs (penalty) | 0.1 (10%) |

**Important**: Weights must sum to 1.0!

### 11.2 Normalization

| Method | Description |
|--------|-------------|
| **Z-Score** | Standardization to μ=0, σ=1 |
| **Min-Max** | Scaling to [0, 100] |

### 11.3 Leaderboard Options

| Option | Description |
|--------|-------------|
| **Global** | One leaderboard for all |
| **Per Role** | Separate rankings per Player Type |
| **Hidden** | No ranking during game |

### 11.4 Reference Run (Optional)

- Upload an "Expert Run"
- Players are compared against reference
- Useful for benchmarking

---

## 12. Validation & Export

### 12.1 Frontend Validation

Checks in real-time:
- Numeric ranges
- Required fields
- Unique IDs
- Preview mixes (non-negative generator/consumer block counts)

### 12.2 Backend Validation

Checks on save:
- `horizon = rounds × span`
- All device references exist
- ATC matrix symmetric
- Event targets exist
- Player Type devices exist

### 12.3 "Save & Validate" Button

- Saves and performs complete validation
- Shows list of all errors/warnings
- Blocks saving on critical errors

### 12.4 Export JSON

Complete configuration as JSON:

```json
{
  "id": 42,
  "name": "Standard Day",
  "config": {
    "general": { ... },
    "market": { ... },
    "grid": { ... },
    "environment": { ... },
    "events": [ ... ],
    "devices": [ ... ],
    "player_types": [ ... ],
    "scoring": { ... }
  }
}
```

### 12.5 Import JSON

- Select file
- Choose: "Overwrite" or "Create new"
- Validation is performed

---

## 13. Best Practices

### 13.1 Scenario Design

| Recommendation | Reasoning |
|----------------|-----------|
| Clear objectives | Players know what's expected |
| Graduated complexity | Simple scenarios first |
| ≤3 events per scenario | Don't overload |
| Realistic SA mixes | Authentic learning effect |
| 2-4 Player Types | Clear for trainers |

### 13.2 Campaign Structure

```
Campaign: "Introduction to Electricity Markets"
├── Scenario 1: "Basics" (Solo, easy)
├── Scenario 2: "Day-Ahead Market" (Solo/Cohort)
├── Scenario 3: "Events & Risk" (Cohort)
└── Scenario 4: "Full Simulation" (Cohort, complex)
```

### 13.3 Testing

| Step | Description |
|------|-------------|
| 1. Preview | Quick check of configuration |
| 2. Dry-Run | Play solo as designer |
| 3. Peer Review | Have colleagues check |
| 4. Pilot Session | With small test group |

### 13.4 Common Errors

| Error | Solution |
|-------|----------|
| Horizon ≠ rounds × span | Adjust values |
| Missing device references | Check device IDs |
| Invalid preview mix | Check generator/consumer block counts |
| Event without target | Define target device |
| Duplicate IDs | Regenerate automatically |

---

## 14. Reference: Configuration Schema

### 14.1 Complete Schema

```json
{
  "general": {
    "name": "string",
    "objectives": "string (markdown)",
    "fake_date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "rounds": "integer (1-20)",
    "round_duration_seconds": "integer (60-3600)",
    "round_span_hours": "integer (1-24)",
    "forecast_horizon_hours": "integer",
    "freeze_hours": "integer"
  },
  "market": {
    "enable_da": "boolean",
    "enable_idm": "boolean",
    "enable_balancing": "boolean",
    "base_price": "number",
    "base_volume_mwh": "number",
    "price_floor": "number",
    "price_cap": "number",
    "allow_negative_pricing": "boolean",
    "uniform_price": "boolean",
    "pro_rata_ties": "boolean",
    "enable_player_bidding": "boolean",
    "balancing_up_price_factor": "number",
    "balancing_down_price_factor": "number",
    "day_ahead_gate_hour": "integer (0-23)",
    "id_price_spread_percent": "number (-100 to 100)",
    "generator_mix": {
      "pv": "integer (0-1000)",
      "wind": "integer (0-1000)",
      "hydro": "integer (0-1000)",
      "coal": "integer (0-1000)",
      "gas": "integer (0-1000)",
      "nuclear": "integer (0-1000)"
    },
    "consumer_mix": {
      "industrial": "integer (0-1000)",
      "household": "integer (0-1000)",
      "agriculture": "integer (0-1000)"
    },
    "random_capacity_pct": "number (0-50)",
    "random_price_pct": "number (0-50)"
  },
  "grid": {
    "zones": ["string"],
    "atc": [[number]],
    "congestion_handling": "curtail_by_cost | curtail_pro_rata | redispatch",
    "congestion_revenue": "to_grid | to_generators | split",
    "transmission_losses_pct": "number (0-100)"
  },
  "environment": {
    "seed": "string | null (preview seed)",
    "actual_noise_pct": "number (0-100)",
    "profile_preset": "string | null (None | Winter Weekday | Summer Weekday | Weekend)",
    "diurnal_profile": "array[24] of numbers",
    "seasonal_factors": "array[12] of numbers"
  },
  "events": [
    {
      "name": "string",
      "description": "string",
      "type": "outage | demand_spike | price_shock | weather | grid",
      "scope": "systemic | player",
      "trigger": {
        "type": "round | probability | time",
        "value": "number"
      },
      "duration_rounds": "integer",
      "duration_hours": "integer",
      "impact": {
        "type": "multiply | add",
        "value": "number"
      },
      "target": {
        "type": "all | zone | device_type | device",
        "value": "string"
      },
      "pre_warning": {
        "enabled": "boolean",
        "rounds_before": "integer",
        "text": "string"
      }
    }
  ],
  "devices": [
    {
      "id": "string (unique)",
      "name": "string",
      "type": "generator | renewable | storage | load",
      "zone": "string",
      "...type-specific fields...": "..."
    }
  ],
  "player_types": [
    {
      "id": "string (unique)",
      "name": "string",
      "devices": ["string (device ids)"],
      "zone": "string | null"
    }
  ],
  "scoring": {
    "weights": {
      "profit": "number (0-1)",
      "imbalance": "number (0-1)",
      "curtailment": "number (0-1)"
    },
    "normalization": "z_score | min_max",
    "leaderboard": "global | per_role | hidden",
    "reference_run": "object | null"
  }
}
```

---

## Support

- **Technical Questions**: support@emsg.example.com
- **Documentation**: `/docs/designer` in game
- **API Reference**: `/docs/engine`

---

*Last updated: December 23, 2025*
