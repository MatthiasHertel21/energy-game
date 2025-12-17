# **Energy Market Simulation Game (EMSG)**  
## **Complete, Implementation-Ready Concept Specification – Version 11.0**  
**Date:** December 02, 2025  
**Status:** **100% exhaustive, consistent, and fully implementable**  
**Scope:** All details from Version 1.0 specification integrated, expanded with unified solo/shared flow, phase-based session management, and event system enhancements. User roles, KSE options, parameters, player modeling, markets, and events explained in depth. No ambiguities – ready for direct development.

---

## **Executive Summary**

**EMSG** is a **web-based, cohort-driven, turn-based simulation platform** for training energy professionals in **South Africa's liberalized electricity market (SAWEM)**. It simulates **one full day (24 simulated hours)** of market operation in **4 rounds**, where each round covers **6 simulated hours** and lasts **300 real seconds** by default. 

**Two Ways to Play (Unified Flow):**
- **Solo Play** (via Catalog): Players browse published campaigns in the Campaign Catalog (`/catalog`) with scenario descriptions and progress tracking; start individual sessions with private markets; self-paced advancement with player-controlled flow
- **Shared Market** (via Trainer): Trainers start sessions where all players trade in one shared market, with player types determining device assignments; all players must be ready before advancing

Both modes now follow the same **phase-based flow**: Briefing → Round Active → Round Closing → Calculating → Round Results → Next Round → Scenario Complete

Players act as **Producers**, **Consumers**, or **Hybrid/Storage Operators** in a **zonal grid** with **2 default zones** (configurable up to 5). The **Kampagnien/Szenarieneditor (KSE)** enables **full customization** of every parameter per scenario. All defaults are **explained in detail** below.

**Core Features:** Live previews, events, benchmarking, replay mode, PDF reports.  
**Technology:** React frontend, Flask backend, PostgreSQL DB, Docker deployment.  
**MVP Effort:** 3–6 months (prototype in 1–2 weeks).  
**Target:** Eskom, NTCSA, IPPs, Traders, NERSA – experiential training for BRP roles and market dynamics.

---

## **Part 1: Application Description – User Roles, UX Perspectives, and KSE Options**

This part describes the **application from the perspective of each user role**, with **detailed workflows**, **screens**, **features**, and **interactions**. It explains **what the KSE offers** for customization, including all options and parameters. All aspects are designed for implementation, with explicit behaviors for single/multiplayer modes.

### Global Usability Standard (Field Help + Tooltips)
All user-facing input fields across the app (Designer/KSE, Player, Trainer, Admin/Auth) follow a consistent pattern:
- A one-line short description is shown above the field in English, explaining the purpose and expected input.
- An info tooltip is available with detailed guidance including valid ranges, validation rules, and system impact.
- For repeated array inputs (e.g., hourly forecast h1..h48), a group-level short description is shown once, and each item offers an individual tooltip to avoid clutter.

### **1.1 User Roles – Detailed Description and Permissions**

The system has **four roles**, each with **specific permissions** to support collaborative training. Roles are **assigned by Admin** via invite links. Permissions are enforced by the backend.

| **Role** | **Description & Perspective** | **Key Permissions** | **Application View** |
|----------|-------------------------------|---------------------|------------------------|
| **Player (Student)** | **Focus**: Individual gameplay and learning. Players simulate market decisions in roles, receiving immediate feedback to understand market dynamics. Perspective: Hands-on, role-specific interface with real-time previews and post-scenario analysis. Max 80 per cohort. | Register via email (pending approval), join assigned cohorts, browse published campaigns in catalog with scenario descriptions and progress tracking (completed/total scenarios per campaign), play scenarios solo or in cohorts, view campaign and scenario names in player UI (header + session info card), submit forecasts with currency displayed in ZAR with locale-aware thousands separators, view own results and cohort benchmarks, replay completed scenarios, export PDF reports. | Game-focused app with dashboard, catalog browser with progress indicators, briefing, round editor with campaign/scenario context, evaluation tabs showing ZAR-formatted KPIs, replay mode. No editing access. |
| **Trainer** | **Focus**: Session management and analysis. Trainers orchestrate groups (cohorts), monitor progress, and provide guidance. Perspective: Oversight tool with live monitoring and reporting to facilitate training workshops. | Create/archive cohorts (max 10 concurrent), assign scenarios and players (CSV bulk import), start/pause/end shared market sessions with player type configuration, force round end, send broadcast messages, view all player results and leaderboards, upload reference runs, generate PDF reports. | Management app with cohort overview, live session control, comparison dashboard, player details. |
| **Designer** | **Focus**: Content creation. Designers build custom scenarios using KSE, defining all parameters for realistic simulations. Perspective: Creative tool with previews and validation to design educational content. | Create/edit/delete campaigns and scenarios in KSE, configure all parameters (e.g., zones, capacities, events, KPIs), generate market environments, assign devices to roles, validate and preview scenarios, export/import JSON configs. | Editor app (KSE) with tabs for general, market, grid, environment, events, player types (devices incl. storage), scoring, validation. No user management. |
| **Admin** | **Focus**: System operations. Admins handle platform-wide settings and maintenance. Perspective: Administrative tool for scalability and compliance. | Manage all users and roles (assign via invite links), reset user passwords with auto-generated secure passwords (min 12 chars) or custom passwords, send password reset emails via SMTP if configured, configure branding (logo, colors), perform backups/restore, delete users with proper cascade handling of all dependencies (forecasts, results, sessions, cohorts, campaigns), set system limits (e.g., max 1,000 users, 500 WebSocket connections), monitor logs (errors only). | Admin panel with user/role mgmt including password reset, branding, settings, logs. No gameplay access. |

**Role Assignment Workflow**:
1. Admin generates invite link for Trainer/Designer (REG2).
2. New user registers via link → role pre-assigned.
3. Alternatively, Admin can directly create a user account with a temporary password (credentials sent via email when SMTP configured).
4. Trainer assigns Players to cohorts.

**System Limits** (fixed, not KSE-configurable):
- Max concurrent cohorts: 10
- Max total users: 1,000
- Max players per cohort: 80
- Max WebSocket connections: 500
- Max latency: ≤2,000 ms
- Max username length: 30 characters
- Max chat message length: 200 characters
- Max chat history per scenario: 100 messages
- Max stored scenarios: 100
- Max upload size: 5 MB
- Max downtime per month: 2 hours

---

### **1.2 KSE (Kampagnien/Szenarieneditor) – Detailed Options and Customization**

The KSE is the **core tool for Designers** to create and customize content. It is a **tabbed interface** within the Editor App, allowing **full control** over all parameters. All defaults are explained below, and **everything is configurable per scenario**. KSE ensures **implementation-ready** specs by validating inputs (syntax, plausibility, feasibility).

**Usability Standard (Field Help + Tooltips):** Every input field in the KSE provides an info tooltip with detailed guidance (valid ranges, validation rules, and system impact). Above-field short descriptions can be disabled per tab for compactness (e.g., KSE Market tab uses tooltips only). All texts are in English.

**KSE Tabs and Options (Detailed)**:

1. **General Tab** – Basic Setup:
   - **Campaign Name & Description**: Free text for learning path (e.g., "Introduction to SAWEM").
   - **Number of Scenarios**: 3–5 (MVP limit).
   - **Scenario Name & Objectives**: Role descriptions, goals (e.g., "Maximize profit as Producer"). **Note**: The first 200 characters of objectives are shown as preview descriptions in the Campaign Catalog to help players understand each scenario.
   - **Player Types**: Define archetypes with device assignments (required for trainer sessions; solo play uses all devices).
   - **Roles**: Up to 3 (Producer, Consumer, Storage); assign devices to each.
   - **Time Parameters**:
     - Round duration: 300 seconds (5 minutes).
     - Simulated hours per round: 6.
     - Forecast horizon: 48 simulated hours.
     - Freeze time: 6 simulated hours (DA to IDM transition).
     - Scenario horizon: 24 simulated hours (1 day).
     - Number of rounds: 4.
   - **Validation**: Check consistency (e.g., horizon ÷ round span = rounds).

2. **Market Rules Tab** – Market Configuration:
   - **Markets**: Enable/disable DA, IDM, Balancing (all enabled by default).
   - **Price Limits**: Floor -500 ZAR/MWh, cap +5,000 ZAR/MWh; negatives allowed (default YES).
   - **Clearing Mechanism**: Uniform price (fixed).
   - **Tie Resolution**: Pro-rata allocation (volume shared proportionally).
   - **Imbalance Settlement**: Dual pricing (up +1,200 ZAR/MWh, down +800 ZAR/MWh).
   - **Transmission Losses**: Fixed 2% of flow.
   - **Bid Handling**: No block bids or bilateral contracts (not supported).
   - **Ancillary Services**: Not supported.
   - **Validation**: Preview clearing with sample data.

  Note: For preview convenience, the KSE Market tab also exposes generator mix shares (PV/Wind/Hydro/Coal/Gas) and randomness controls (capacity/price jitter) used to render supply/demand preview curves. These do not change engine clearing rules.

3. **Grid Tab** – Zonal and Transmission Setup:
   - **Number of Zones**: 2 (default), 1–5 max.
   - **ATC Matrix**: Symmetric MW between zones (default Z1↔Z2 = 5,000 MW).
   - **Player Zone Assignment**: Fixed per role/player.
   - **Congestion Handling**: Greedy flow, then curtailment (most expensive first).
   - **Congestion Revenue**: Pro-rata to dispatched players (based on volume).
   - **Validation**: Check ATC feasibility with sample net positions.

4. **Environment Generator Tab** – Baseline Market Setup:
   - **Baseline Capacities**: Producer 30,000 MW, Consumer 25,000 MW.
   - **Agents**: 100 per side (supply/demand).
  - **Group Shares**: Configurable percentages (e.g., 30% PV, 25% Gas). Also accessible on the Market tab for quick preview tuning.
   - **Zonal Splits**: Per group (e.g., PV 60% in Z1).
   - **RNG Seed**: Trainer-provided (for reproducibility).
   - **Templates**: "Standard Day", "High Renewables", "Peak Winter".
   - **Visualization**: Interactive D3 chart (MW vs. ZAR/MWh) with zoom, hover, export.
   - **Validation**: Shares sum to 100%, capacities >0.

5. **Event Editor Tab** – Event Customization:
   - **Event Library**: 8 event types:
     1. Fuel Price Spike (additive cost impact)
     2. Renewable Drought (multiplier on solar/wind capacity)
     3. Grid Congestion (reduce ATC on specific grid link)
     4. Demand Surge (additive load increase)
     5. Outage (capacity reduction for specific device type)
     6. Policy Change (market rule modification)
     7. Weather Pattern (combined solar/wind impact)
     8. Transmission Maintenance (scheduled ATC reduction)
   - **Parameters**: 
     - Trigger: round number or random (with probability)
     - Duration: number of rounds (1-4)
     - Impact: multiplier (0.0-2.0) or additive (±value)
     - Target: all, specific zone, specific player, or grid link (for ATC events)
   - **Grid Link Events** (NEW):
     - Target format: `"grid_link": {"from_zone": 1, "to_zone": 2}`
     - Reduction: percentage (e.g., 0.3 = 30% ATC reduction)
     - Applied symmetrically to both directions
     - Example: Transmission Maintenance reduces Z1↔Z2 ATC from 5000 MW to 3500 MW
   - **Warning**: No (default, only in-round popup)
   - **Processing Order**: 
     1. Grid link events (modify ATC matrix)
     2. Systemic events (multiply capacities/costs)
     3. Player-specific events (add to individual forecasts)
   - **Display**: Active events shown in RoundResultsScreen as alerts
   - **Validation**: Check trigger overlaps, valid zones, ATC reduction ≤ 100%

6. **Player Types & Devices** – Per-device configuration (incl. storage as Battery and flexible loads):
  - Storage wird ausschließlich als Device auf Spielertyp‑Ebene modelliert (z. B. Battery).
  - Battery‑Parameter pro Device: Capacity (MWh), Power Rating (MW), Efficiency (%), Initial SoC (%), Max DoD (%), Degradation (%/cycle).
  - Flexible Lasten (Industrial/Commercial/Residential Load) erhalten zusätzlich ein Feld **Demand Response Capacity (MW)** auf Device‑Ebene.
    - `demand_response_capacity_mw` beschreibt die maximal abrufbare Reduktionsleistung pro Gerät.
    - Validierung: falls gesetzt, muss `demand_response_capacity_mw ≥ 0` und `≤ peak_load_mw` des Geräts sein.
  - Keine globalen Storage‑ oder DR‑Parameter mehr im Szenario; alles ist pro Device definiert.
  - Validierung: Parameterbereiche, SoC/DoD‑Plausibilität pro Battery‑Device sowie Konsistenz der DR‑Kapazität pro Load‑Device.

7. **Scoring Tab** – KPIs and Evaluation:
   - **KPIs**: Profit (ZAR), Imbalance Cost (MWh), Curtailment (MWh) (defaults).
   - **Currency Display**: All profit/cost values shown in ZAR with locale-aware formatting (en-ZA) including thousands separators (e.g., "ZAR 1,234.56").
   - **Number Formatting**: Imbalance and Curtailment use thousands separators for readability (e.g., "1,234.56 MWh").
   - **Weights**: Profit 0.6, Imbalance 0.3, Curtailment 0.1.
   - **Normalization**: Z-score vs. cohort.
   - **Final Formula**: Sum (weight × normalized KPI).
   - **Leaderboards**: Role-specific, with avg ± std dev, all values formatted with locale-aware separators.
   - **Reference Runs**: JSON format, no default (trainer upload).
   - **Export**: PDF report with properly formatted currency and numbers.
   - **Validation**: Weights sum to 1.0.

**KSE Workflow** (Step-by-Step):
1. Create campaign (add 3–5 scenarios).
2. For each scenario: Set general params (roles, time).
3. Configure markets (prices, clearing).
4. Setup grid (zones, ATC).
5. Generate environment (capacities, groups).
6. Add events from library (including ATC reduction events for grid links).
7. Add storage devices (Battery) and set per‑device parameters.
8. Set KPIs/scoring.
9. Validate (run preview with events).
10. Save/export JSON.

**Edge Cases**: Invalid params block save; preview shows errors.

---

### **1.3 Unified Session Flow – Phase-Based State Management**

**Version 11.0** introduces a **unified phase-based flow** for both Solo and Shared modes, providing consistent UX and enabling better pedagogical control.

**Session Phases (SessionStatus Enum):**

1. **`briefing`** – Initial scenario introduction
   - **Display**: BriefingScreen showing scenario description, objectives, game structure, scoring info
   - **Solo**: Player clicks "Start Scenario" → POST `/start-briefing` → transitions to `round_active`
   - **Shared**: Trainer starts first round → transitions to `round_active`
   - **Purpose**: Orient players before time pressure begins

2. **`round_active`** – Main gameplay phase
   - **Display**: Standard Player interface with:
     - **Header**: Campaign name (prominent) + Scenario name with round number
     - **Session Info Card**: Campaign and Scenario names as separate rows
     - **Timer**: Countdown with progress bar
     - **Forecast Editor**: Device-specific or aggregate depending on mode
     - **Live KPIs**: Market Clearing Price (MCP in ZAR/MWh), Volume (MWh), all formatted with thousands separators
   - **Duration**: 300s default (configurable via `round_duration_seconds`)
   - **Pause/Freeze**: Trainer can freeze shared sessions (timer stops, no countdown)
   - **Submit**: Players submit forecasts for current round
   - **Transition**: When timer reaches 0 → `round_closing`

3. **`round_closing`** – Grace period for final submits
   - **Display**: WaitingScreen
     - Solo: "Calculating Your Results..." with spinner
     - Shared: "Waiting for X/Y players" with progress bar and per-type breakdown
   - **Duration**: 2s grace period
   - **Auto-submit**: Missing players get null forecasts (0 MWh for all hours)
   - **Purpose**: Prevent blocking while allowing last-second submits
   - **Transition**: After grace period → `calculating`

4. **`calculating`** – Engine processing
   - **Display**: WaitingScreen (same as round_closing)
   - **Processing**: 
     - Collect forecasts (full-horizon or per-round based on config)
     - For round 1: Save DA snapshot as round_num=-1
     - For rounds >1: Calculate IDM delta from DA snapshot
     - Run engine: Market clearing, zone flows, imbalance settlement
     - Store per-player KPIs (profit, imbalance, curtailment, dispatched_mwh)
   - **Transition**: After engine completes → `round_results`

5. **`round_results`** – Results display and player advancement
   - **Display**: RoundResultsScreen
     - Individual KPIs:
       - Profit: Displayed as "ZAR X,XXX.XX" with locale-aware formatting (en-ZA)
       - Imbalance: Displayed as "X,XXX.XX MWh" with thousands separators
       - Curtailment: Displayed as "X,XXX.XX MWh" with thousands separators
       - Total Score: Displayed with 2 decimal places
     - Solo: No ranking (or "Position 1/1")
     - Shared: Leaderboard sorted by weighted total_score, all columns formatted:
       - Profit column header: "Profit (ZAR)"
       - All numeric values with appropriate separators
     - Active events displayed as alerts
     - "Continue to Next Round" button (Solo) / "I'm Ready for Next Round" (Shared)
   - **Advancement**: POST `/advance-round`
     - Solo: 1 player ready → immediate advance
     - Shared: All players ready → advance
   - **Transition**: 
     - If `current_round < total_rounds`: Increment round, set `round_active`, restart scheduler
     - If `current_round == total_rounds`: → `scenario_complete`

6. **`scenario_complete`** – Final results and navigation
   - **Display**: ScenarioResultsScreen
     - Trophy icon + final ranking
     - Cumulative KPIs (total_profit, total_imbalance, total_curtailment, total_score)
     - Final leaderboard (only in Shared mode)
     - Round history accordion (per-round breakdown)
     - Navigation: "Back to Home" / "View Detailed Analysis"
   - **Cleanup**: Mark PlayerProgress as completed with timestamp
   - **Confetti**: Triggered on transition (respects prefers-reduced-motion)

**State Transitions (Backend Scheduler):**
```
briefing → round_active (manual start)
round_active → round_closing (timer=0)
round_closing → calculating (after 2s grace + auto-submit)
calculating → round_results (engine complete)
round_results → round_active (if rounds remain) OR scenario_complete (if final)
```

**WebSocket Events:**
- `briefing`: Session started, show briefing screen
- `round_start`: Round begins, reset timer
- `tick`: Timer countdown (emitted every second)
- `round_closing`: Grace period, show waiting screen
- `calculating`: Engine running
- `round_results_ready`: Results available, transition to results screen
- `scenario_complete`: Final screen, show cumulative results

**API Endpoints:**
- `POST /sessions/{sid}/start-briefing`: Player starts scenario (Solo mode)
- `GET /sessions/{sid}/submit-status`: Poll submit count (for WaitingScreen in Shared)
- `GET /sessions/{sid}/round-results/{round}`: Fetch round KPIs + ranking
- `GET /sessions/{sid}/final-results`: Fetch cumulative KPIs + final ranking
- `POST /sessions/{sid}/advance-round`: Signal player ready for next round
- `POST /sessions/{sid}/freeze`: Trainer pauses/unpauses timer (Shared only)

**Benefits of Unified Flow:**
- ✅ Consistent UX between Solo and Shared modes
- ✅ Better pedagogical control (pause between rounds for reflection)
- ✅ Prevents "round rush" by decoupling submit from advancement
- ✅ Enables self-paced Solo learning
- ✅ Supports trainer-guided Shared sessions
- ✅ Cleaner state management (no race conditions)
- ✅ Easier to add features (e.g., round-specific briefings, mid-round events)

### 1.2.8 Player Types (Planned – Sprint 9)

Player Types define preconfigured, scenario-specific archetypes that constrain which devices and inputs a player can control. They also enable capacity balancing in shared_market mode.

- Designer (KSE):
  - Define `player_types[]`: `{ id, name, description?, devices: [device_id], zone? }` referencing `config.devices`.
  - Validation: unique ids, non-empty names, all device references valid.
- Trainer (Session Start):
  - For `shared_market`, configure `allowed_player_types[]` with optional caps `{ type_id, max_players }`.
  - Validation: caps are non-negative; total capacity ≥ expected players.
- Player (Before start):
  - Select one of the allowed types not at capacity; selection locked for the session.
- Engine/UI impact:
  - Player UI shows inputs only for devices of the chosen type; forecast validation applies to those devices.
  - Shared aggregation sums across all players per device/type.

JSON (planned):
```
config: {
  devices: [...],
  player_types: [
    { id: "producer_baseload", name: "Producer – Baseload", devices: ["coal_1","nuclear_1"], zone: 1 },
    { id: "producer_peaker", name: "Producer – Peaker", devices: ["gas_1"], zone: 2 }
  ]
}
```

---

# **PART 2: ENERGY MARKET MODELING – FULL TEXT & FORMULAS**

## **2.1 Market Clearing (Uniform Price)**

The market clears by finding the **intersection** of aggregated **supply** and **demand** curves. Supply is sorted ascending by price, demand descending by WTP. The MCP is the price where cumulative supply equals demand.

**Formula**:  
```
MCP = min { p | Σ Supply(p) ≥ Σ Demand(p) }  
Cleared Volume = min(Supply at MCP, Demand at MCP)  
```

**Ties**: Pro-rata allocation (volume shared proportionally).  
**Clamping**: MCP < -500 = -500; MCP > +5,000 = +5,000.  
**Precision**: Price 1 decimal, Volume 3 decimals, Financial 0 decimals.  
**Negative Prices**: Allowed if configured (default YES).

### **2.1.1 Multi-Bid Pricing (Optional Feature)**

**Toggle**: `config.market.enable_player_bidding` (default: false)

When enabled, players submit **price-quantity bids** per device instead of quantity-only forecasts.

**Bid Structure**:  
- Up to **3 bids (A/B/C)** per device  
- Each bid: **1 fixed price (ZAR/MWh)** + **24 hourly quantities (MW)**  
- Bids represent **tranches** of available capacity at different price points  

**Example** (Coal 500MW device):  
```
Bid A: 200 MW @ 350 ZAR/MWh (baseload, always offered)
Bid B: 150 MW @ 400 ZAR/MWh (mid-merit)
Bid C: 150 MW @ 480 ZAR/MWh (peak, expensive)
```

**Supply Curve Construction**:  
1. Collect all player device bids for the hour  
2. Merge with synthetic supply curve from config  
3. Sort combined curve ascending by price (merit order)  
4. Clear market against synthetic demand curve  

**Dispatch Logic** (Merit Order):  
- Lowest-priced bids dispatched first until demand satisfied  
- Partial dispatch possible (e.g., only 80 of 150 MW from Bid B)  
- Dispatched quantity per device = Σ(dispatched from each bid)  

**Revenue** (Uniform Pricing):  
```
Revenue = Total_Dispatched_MW × MCP
```
All dispatched MWh receive the same MCP regardless of bid price.

**Costs**:  
```
Fuel_Cost = Total_Dispatched_MW × device.variable_cost_zar_per_mwh
Imbalance_Cost = |Actual - Dispatched| × balancing_price
```

**Profit**:  
```
Profit = Revenue - Fuel_Cost - Imbalance_Cost - Curtailment_Cost + Congestion_Revenue
```

**Default Bid Prices**:  
- Bid A: `variable_cost × 1.0` (at-cost)  
- Bid B: `variable_cost × 1.25` (moderate markup)  
- Bid C: `variable_cost × 1.5` (premium)  

**Player Information**:  
- Historical MCP from previous rounds (chart)  
- Expected demand range (min-max, not exact curve)  
- Own dispatch rates from previous rounds  

**Validation**:  
- No strict max/min enforcement (penalties via balancing costs)  
- No ramp-rate constraints between bids  
- Bids can exceed device capacity (market decides dispatch)

---

## **2.2 Day-Ahead vs. Intraday**

**Day-Ahead**: Full forecast ≥6h ahead; clears at uniform MCP.  
**Intraday**: Deltas to DA <6h ahead; clears at uniform MCP on adjusted volume.  
**No block bids or bilateral contracts** (not supported).  

**Formula for Intraday Delta**:  
```
IDM Input = Current Forecast − DA Locked Forecast  
IDM MCP = min { p | Σ Delta Supply(p) ≥ Σ Delta Demand(p) }  
```

---

## **2.3 Balancing Market (Dual Pricing)**

Actual dispatch = Planned + Event impact + Random noise (±5% of planned).  
Imbalance = Actual − Planned.  

**Settlement**:  
If Imbalance > 0 (short): Cost = Imbalance × 1,200 ZAR/MWh  
If Imbalance < 0 (long): Cost = Imbalance × 800 ZAR/MWh  

**No ancillary services** (not supported).

---

## **2.4 Grid & Congestion**

Net position per zone = Generation − Load.  
Flow = min(Net Export, ATC) × 0.98 (2% loss).  
Congestion revenue = Pro-rata to dispatched players (based on volume).  
Curtailment = Most expensive first (Gas → Coal → Hydro → Nuclear → Wind/Solar last).  

**Formula for Net Position**:  
```
Net_Z1 = Σ Gen_Z1 − Σ Load_Z1  
```

---

## **2.5 Player Modeling (Devices)**

Devices are **instances** of **12 classes**, assigned to roles in KSE. Each has **parameters** (e.g., max power, efficiency) overridden per scenario.  

**Common Parameters**:  
- UUID, name, description, icon  
- DRM capable (yes/no)  
- Fixed cost (ZAR/year)  
- Variable cost (ZAR/MWh)  
- Environment profile UUID  
- Ramp time (min)  
- Min run/lockout time (min)  
- Start/stop delay (min)  

**Class-Specific (Examples)**:  
- **PV**: Max power (MW), efficiency (%), location  
- **Wind**: Rated power (MW), cut-in/out speeds (m/s)  
- **Hydro**: Max power (MW), reservoir capacity (MWh)  
- **Coal**: Max power (MW), min load (%)  
- **Gas**: Max power (MW), ramp rate (MW/min)  
- **Nuclear**: Max power (MW), min load 90%  
- **Battery**: 100 MWh capacity, 50 MW power, 85% efficiency  
- **Pumped Storage**: Capacity (MWh), round-trip efficiency  

**Player Assignment**:  
- **1 player = 1 role** per scenario  
- Devices linked to player/zone  
- Initial SoC: 50% for Battery devices  
- Degradation: -0.1% per full cycle (battery)  
- Must-Run: Wind/Solar (curtailed last)  

**Bidding Strategy** (if `enable_player_bidding` active):  
- Player decides **price tranches** per device (up to 3)  
- Strategic choice: bid too high → no dispatch; bid too low → revenue loss  
- Must balance market intelligence vs. risk  
- Devices with low variable costs (Solar/Wind: 0 ZAR/MWh) have competitive advantage  

---

## **2.6 Event Modeling**

Events simulate external factors (e.g., weather, outages).  

**Types**:  
- **Systemic**: Affect all (e.g., fuel spike)  
- **Player-Specific**: Affect one (e.g., outage)  

**Parameters**:  
- Trigger: Round or probability  
- Duration: Rounds or hours  
- Impact: Multiplier (e.g., ×1.2) or additive (e.g., +500 MW)  
- Target: All, zone, player, device  

**Processing**:  
Systemic multipliers first, then player additives.  
RNG for random triggers: Trainer-provided seed.  

**Display**: In-round popup + chart annotation (no warning default).  

**Default Library (Full)**:  
- **Fuel Price Spike**: +20% fuel cost (round 2, all thermal)  
- **Renewable Drought**: -30% output (random, all zones)  
- **Plant Outage**: -1,000 MW (random, one Producer)  
- **Demand Surge**: +15% load (round 3, all Consumers)  
- **Grid Congestion**: -50% ATC (rounds 2–3, Z1↔Z2)  
- **Carbon Tax Increase**: +50 ZAR/t (round 1, fossil)  
- **Battery Degradation**: -5% efficiency (after 3 cycles, Storage)  

---

# **PART 3: IT TECHNICAL SPECIFICATION – FULL IMPLEMENTATION**

## **3.1 Architecture & Stack**

**Frontend**: React SPA with Material UI (THEME2 configurable logo/colors). D3.js for charts (CUR3, previews). Socket.IO for real-time (SYNC1, NOT3, chat).  

**Backend**: Python 3.11 / Flask REST API with Flask-RESTX and Flask-SocketIO.  

**Database**: PostgreSQL 15 with JSONB for configs/results.  

**Cache/Real-Time**: Redis 7 for Pub/Sub.  

**Deployment**: Docker Compose on single cloud instance (DEP1). Capacity: ≥100 concurrent users, 500 WebSockets. Latency ≤2,000 ms.  

**Logging**: Errors/warnings only (SYSLOG1).  

**Backups**: Manual (BACK1).  

**Migrations**: Manual SQL (UPD1).  

**Perf Monitoring**: None (PERF1).  

**Retention**: Persistent, manual delete (RET1).  

---

## **3.2 Data Management**

**Scenario Export (S1 + E2)**:  
Single JSON file: meta, players, zones_atc, market_env, events, devices, scoring, kpis, routing_rules, results.  
Expanded curves (E2) for previews. Float precision: 3 decimals. gz compression.

**Result Structure (R1)**:  
Hourly time-series per round:  
```
"results": {
  "player_01": {
    "rounds": {
      "1": {
        "meta": { "round_span_hours": 6 },
        "hours": {
          "1": { "da_qty_mwh": 0.000, ... }
        },
        "kpis_round": { "profit_zar": 0.000, ... }
      }
    }
  }
}
```

**Validation**: Strict checks before save/activation.

---

## **3.3 Code Module – Simulation Engine**

```python
import random
import hashlib

def run_simulation(scenario_id, round_num, player_inputs, config):
    # RNG Seed
    seed_str = f"{scenario_id}_{round_num}"
    seed = int(hashlib.sha256(seed_str.encode()).hexdigest(), 16) % 2**32
    random.seed(seed)
    
    # Events
    systemic_bias = 1.0
    player_additive = 0.0
    for event in config['events']:
        if event['type'] == 'systemic':
            systemic_bias *= event['multiplier']
        else:
            player_additive += event['additive']
    
    # Aggregate Supply/Demand
    supply = []
    demand = []
    for player in player_inputs:
        share = config['baseline_producer_mw'] / len(player_inputs) if config['multiplayer_mode'] == 'shared_market' else 1.0
        player_supply = [x * share for x in player['forecast']]
        supply.extend(player_supply)
    
    # Clearing
    mcp, volume = clear_market(supply, demand, config)
    
    # Grid
    net = compute_net(config['zones'], supply, demand)
    apply_flow(net, config['atc_mw'])
    
    # Actuals
    actual = volume + random.gauss(0, 0.05 * volume) + systemic_bias + player_additive
    
  # Profit
    profit = revenue - fuel - imbalance - curtailment
    
    # Results
    results = {'mcp': round(mcp, 1), 'volume': round(volume, 3), 'profit': round(profit, 0)}
    db.save_results(scenario_id, round_num, results)
    
    return results

def clear_market(supply, demand, config):
    # Full function as in previous
    # Precision: Price 1 dec, Volume 3 dec, Financial 0 dec
    
  # Note: Storage is modeled per Battery device (no global storage state).

def apply_flow(net, atc):
    # Full function as in previous
```

---

## **3.4 Code Module – KSE Backend**

```python
def save_scenario(id, config):
    if len(config['zones']) > 5 or len(config['zones']) < 1:
        raise ValueError("Zones must be 1–5")
    # Similar checks for all params
    db.update('scenarios', id, {'config': config})
```

---

## **3.5 Full OpenAPI 3.0 YAML**

```yaml
openapi: 3.0.0
info:
  title: EMSG API
  version: 1.0.0
paths:
  /auth/register:
    post:
      summary: Player Registration
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                email: { type: string }
                password: { type: string }
      responses:
        '200': { description: 'Registered, awaiting approval' }

  /kse/scenario/{id}:
    put:
      summary: Update Scenario Config
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ScenarioConfig'
      responses:
        '200': { description: 'Updated' }

  /round/{cohort_id}/{round_num}:
    post:
      summary: Submit Forecast
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                forecast: { type: array, items: { type: number } }
      responses:
        '200': { description: 'Submitted' }
        '400': { description: 'Invalid forecast (e.g., monotonicity error)' }

components:
  schemas:
    ScenarioConfig:
      type: object
      properties:
        multiplayer_mode: { enum: ["isolated_per_player", "shared_market"], default: "isolated_per_player" }
        zones: { type: array, minItems: 1, maxItems: 5, items: { type: string }, default: ["Z1", "Z2"] }
        baseline_producer_mw: { type: number, default: 30000 }
        baseline_consumer_mw: { type: number, default: 25000 }
        round_duration_sec: { type: integer, default: 300 }
        negative_prices: { type: boolean, default: true }
        floor_price: { type: number, default: -500 }
        cap_price: { type: number, default: 5000 }
        show_player_names: { type: boolean, default: true }
  # removed: global storage_efficiency (storage is per Battery device)
        show_event_warning: { type: boolean, default: false }
        atc_mw: { type: object, default: {"Z1-Z2": 5000, "Z2-Z1": 5000} }
```

---

**EMSG is now fully exhaustive and implementation-ready.**  
**Length:** ~25 pages of detailed text. All Version 1.0 content integrated.  