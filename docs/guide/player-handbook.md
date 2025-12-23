# Player Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 1.6 (Sprint 24)  
**Date**: 23 Dec 2025  
**Audience**: Players/Students

---

## What's New (Sprint 24)

- **DA/ID Market Breakdown**: Nach jeder Runde siehst du jetzt eine detaillierte Aufschlüsselung:
  - **Day-Ahead Volume**: Deine Position bei Gate-Closure (12:00)
  - **Intraday Delta**: Änderungen nach Gate-Closure
  - **Final Position**: Endgültige Handelsposition
  - **ID Adjustment %**: Prozentuale Änderung gegenüber DA
  - **Tägliche Aufschlüsselung**: Klappbares Accordion mit Tag-für-Tag Details
- **Consumer-Support**: Volle Unterstützung für Verbraucher-Rollen:
  - Angepasste Labels ("Einkauf", "Kosten" statt "Verkauf", "Revenue")
  - Rosa Farbcodierung für Consumer-Karten
  - Info-Alert erklärt die Bedeutung negativer Werte
- **ID Price Spread**: Optionaler Preisaufschlag für Intraday-Handel
  - Konfigurierbar per Szenario (`id_price_spread_percent`)
  - Anreiz für sorgfältige Day-Ahead Planung

**Previous (Sprint 23)**:
- **Hourly Market Clearing**: Market now clears every hour within a round (not just once per round)
  - More realistic price discovery reflecting time-varying supply and demand
  - Each hour gets its own Market Clearing Price (MCP) based on actual hourly conditions
  - Round results show average MCP across all hours
  - Better rewards for accurate hourly forecasting (especially important for renewables)
  - Works with any round duration: 1h, 3h, 4h, 6h, 8h, or custom
- **Multi-Bid Pricing (Optional)**: When enabled by scenario designer, submit up to 3 price-quantity bids per device
  - Strategic pricing: choose tranches (A/B/C) with different prices to maximize revenue
  - Market competition: lowest-priced bids dispatched first (merit order)
  - Uniform clearing: all dispatched MWh receive same Market Clearing Price (MCP)
  - Historical MCP data and demand hints help inform pricing decisions
- **Campaign/Scenario Context**: Player UI shows campaign and scenario names during gameplay
- **ZAR Currency Formatting**: All financial displays use South African Rand with proper thousands separators

**Previous (Sprint 22)**:
- Per-Device Forecast Charts with drag-and-drop editing
- Enhanced Chart Editor with auto-scaling Y-axis
- Chart/Field Toggle per device
- Timer Persistence across page reloads
- Campaign Catalog with progress tracking

---

## Quick Guide

- Play a 24h day in 4 rounds (default 300s per round).
- Flow: Login → Home/Catalog → Briefing → Player → Evaluation.
- Play Modes:
  - **Solo** (via Catalog): Your own private market, all decisions affect only your results
  - **Shared Market** (via Trainer): Trade with other players, select a player type, control assigned devices
- Key actions:
  - Save Full Forecast: persist all hours (no submission).
  - Submit Current Round: submit only the current round’s slice.
- Watch the freeze: early hours become locked after the first round.
- Live charts (MCP/Volume) and KPIs update after each clearing.

---

## Detailed Guide

### 1) Getting Started

- Register `/register` (may require approval). Login `/login` → `/home`.
- **Home** (`/home`) shows your active sessions and assigned scenarios.
- **Campaign Catalog** (`/catalog`) displays published campaigns with:
  - Campaign cards showing cover image, description, and completion progress
  - Scenario timeline with visual progress indicators
  - **Scenario descriptions**: Brief preview (first 200 characters) of each scenario's objectives to help you understand what to expect
  - Solo play button (if enabled by designer)
  - Join active cohort sessions (if available)
  - Reset scenario progress

### 2) Briefing

URL: `/briefing?sessionId=...`
- Objectives, general parameters (rounds, duration, forecast horizon, freeze), market rules (DA/IDM/Balancing, floor/cap, imbalance pricing), grid (zones/ATC), your role & devices (if shared market), events, and scoring weights.
- Start Playing → opens Player. Back to Home returns to dashboard.

### 3) Player Interface

URL: `/player?sessionId=...`

Layout
- Left: Countdown Timer, Session Info, Live KPIs.
- Right: Forecast Editor (hour inputs), device sparks (if per‑device), Save/Submit.
- Bottom: MCP and Volume charts over rounds.

3.1 Countdown & Session Info
- Timer color: green >60s, amber 31–60s, red ≤30s. At 0s you cannot submit.
- Session Info: status chip (active/paused/ended), round N/M, forecast horizon, locked until hX (freeze hours).

3.2 Live KPIs
- MCP (ZAR/MWh) and Volume (MWh) for the last cleared round. Shows “Waiting for market data…” until first clearing.

3.3 Forecast Editor
- **Shared Market (Trainer Sessions)**: Each assigned device gets its own forecast editor section
  - Device header shows: name, type, zone, capacity, efficiency (generators), power/capacity (storage)
  - Toggle between Chart and Fields view independently per device
  - Aggregate forecast auto-calculated from sum of all device forecasts
  - Player Type selection required before editing
- **Solo Mode (Catalog Play)**: Single aggregate editor (chart or fields) for all devices combined
  - No player type selection needed
  - Edit combined forecast for entire scenario
- **Chart Editor** (Sprint 22 improvements):
  - Drag anywhere on the chart to edit values (full chart area is interactive)
  - Y-axis auto-scales to 110% of device capacity for realistic constraints
  - Chart dimensions: 700×320px for precise editing
  - Visual feedback: hover highlights, drag cursor, smooth transitions
  - 3-hour smooth radius: editing one hour adjusts neighboring hours with triangular falloff
- **Field Editor**: Numeric inputs with min/max/step rules; hours ≤ freeze or when timeRemaining = 0 are disabled.
- **Actions**:
  - Save Full Forecast → POST `/api/player/forecast/full` `{ session_id, hours, devices? }` (persists without submission)
  - Submit Current Round → POST `/api/player/forecast` `{ session_id, round_num, hours: slice, devices? }` (submits round slice)
- Errors show as red fields with tooltips; validation runs on submit (device constraints checked).

3.4 Player Type (shared market with trainer)
- In trainer-led sessions, you select a player type before playing
- Each type controls specific devices (e.g., "Generator Operator" manages coal and nuclear plants)
- If allowed types exist and none is selected, a dialog lists types with remaining capacity. Select to load device inputs.

3.5 Multi-Bid Pricing (Optional Feature)

**When enabled** (`config.market.enable_player_bidding = true`):

Instead of submitting only quantities, you submit **price-quantity bids** per device.

**How It Works:**
- Each device can have up to **3 bids (A/B/C)**
- Each bid = **1 fixed price + 24 hourly quantities**
- Example (Coal 500MW device):
  ```
  Bid A: 200 MW @ 350 ZAR/MWh  (baseload, always offered)
  Bid B: 150 MW @ 400 ZAR/MWh  (mid-merit)
  Bid C: 150 MW @ 480 ZAR/MWh  (peak, expensive)
  ```

**UI Components:**
- **Three price input fields** per device (Bid A, B, C prices)
  - Default suggestions based on device variable costs:
    - Bid A: `variable_cost × 1.0` (at-cost)
    - Bid B: `variable_cost × 1.25` (moderate markup)
    - Bid C: `variable_cost × 1.5` (premium)
- **Stacked area chart** showing cumulative capacity across all 3 bids
- **Drag-and-drop editing**: System detects which bid curve you're editing based on nearest point

**Market Clearing (Merit Order):**
1. All player bids merged with synthetic supply curve
2. Sorted by price (lowest first)
3. Market clears where supply meets demand
4. **MCP** = price of most expensive dispatched bid
5. **All dispatched MWh receive the same MCP** (uniform pricing)

**Strategic Considerations:**
- **Bid too high**: Your capacity won't be dispatched → zero revenue
- **Bid too low**: Dispatched but miss potential revenue (MCP might be higher)
- **Optimal strategy**: Estimate market MCP and bid just below
- **Devices with low costs** (Solar/Wind at 0 ZAR/MWh) have competitive advantage

**Information Available:**
- **Historical MCP**: Chart showing MCP from previous rounds
- **Demand Range**: Expected min-max demand (not exact curve)
- **Your Past Dispatch**: % of offered capacity that was accepted in previous rounds

**Revenue Calculation:**
```
Revenue = Total_Dispatched_MW × MCP
```
Even if you bid at 350 ZAR/MWh and MCP clears at 450 ZAR/MWh, you receive 450 ZAR/MWh for all dispatched energy.

**Costs:**
```
Fuel_Cost = Total_Dispatched_MW × device.variable_cost_zar_per_mwh
Imbalance_Cost = |Actual - Dispatched| × balancing_price
```

**Profit:**
```
Profit = Revenue - Fuel_Cost - Imbalance_Cost - Curtailment_Cost + Congestion_Revenue
```

**Tips:**
- Start conservatively: Bid A near variable cost, Bid B/C with moderate markups
- Watch historical MCP trends: If MCP consistently above 500 ZAR/MWh, increase bids
- Balance risk vs reward: More aggressive pricing = higher profit if dispatched, but higher rejection risk
- Consider your portfolio: Low-cost devices (Solar/Wind) can afford aggressive low pricing

3.6 Charts
- MCP (green) and Volume (blue) lines across rounds with tooltips; update after each clearing via WebSocket.
- **With Multi-Bid enabled**: Additional MCP history chart in Player UI to inform bidding decisions

3.7 DA/ID Market Breakdown (Round Results)

Nach jeder Runde zeigt das Round Results Modal eine **Market Breakdown** Sektion:

**Vier Karten-Übersicht:**
| Karte | Beschreibung | Farbcodierung |
|-------|-------------|---------------|
| DA Volume | Day-Ahead Position bei Gate-Closure | Grau |
| ID Delta | Intraday-Änderung | Grün (+) / Rot (-) |
| Final Position | Endgültige Handelsposition | Blau |
| ID Adjustment | Prozentuale Änderung | Info-Chip |

**Preisanzeige:**
- DA Price: Preis im Day-Ahead Markt (= MCP)
- ID Price: Preis im Intraday Markt (MCP × (1 + Spread%))
- ID Spread Badge: Zeigt den konfigurierten Preisaufschlag

**Tägliche Aufschlüsselung (Accordion):**
- Klicke auf "📅 Daily Breakdown" um Details zu sehen
- Tabelle mit Tag, DA MWh, ID MWh, Delta, ID Adjustment %
- Farbige Chips für signifikante Änderungen (>20%)

**Für Consumer (Verbraucher):**
- Rosa "Consumer" Badge in der Überschrift
- Info-Alert: "Als Consumer kaufst du Strom. Negative Revenues = Kosten..."
- Angepasste Labels:
  - "DA Einkauf" statt "Day-Ahead Volume"
  - "Kosten" statt "Revenue"
  - "Finaler Bedarf" statt "Final Position"
  - "Gesamtkosten" statt "Total Revenue"

### 4) After Playing

4.1 Evaluation
- Summary KPIs (Profit, Revenue, Imbalance Cost, Curtailment Cost), round table, trend charts, benchmarking vs cohort average; export PDF.

4.2 Leaderboard
- Rank players by scoring rules; choose metric (Profit/Revenue/Imbalance/Curtailment); export PNG/CSV.

4.3 Replay
- Step rounds, autoplay/pause; view submitted slices and market outcomes; optional cohort average/reference overlay.

### 5) Tips, Troubleshooting, FAQ

Tips
- Save often; saving is not submission. Submit before the timer hits 0.
- Mind the freeze boundary; locked hours cannot be changed later.

Troubleshooting
- Cannot submit: timer ended, session paused/ended, or player type not selected.
- No charts: first clearing not yet received; refresh if socket dropped.
- No scenarios on Home: ask trainer to assign or activate a session.

FAQ
- Rounds: default 4; varies per scenario. Late submissions are not accepted.
- Negative prices: possible; floor/cap are scenario‑defined.
- Edits after submit: not for the submitted slice.

---

## South Africa Context

- SAWEM focus: educational simulation aligned to Eskom SO and NTCSA concepts.
- Currency & units: ZAR, MW/MWh; typical price floor −500, cap +5,000 ZAR/MWh (scenario‑specific).
- Timezone: SAST (UTC+2), no DST; fake date/time labels use local time.
- Grid: example 2‑zone model with ATC (e.g., 5,000 MW) and curtailment by cost order.
- Negative pricing: enabled; expect MCP < 0 during oversupply.

---

Support
- Technical: support@emsg.example.com
- Trainer/Admin: via your cohort contact
