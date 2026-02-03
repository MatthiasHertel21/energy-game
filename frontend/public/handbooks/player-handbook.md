# Player Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 2.0 (Sprint 24)  
**Date**: December 23, 2025  
**Audience**: Players/Participants

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Navigation & Pages](#3-navigation--pages)
4. [Gameplay Flow](#4-gameplay-flow)
5. [Player Interface Details](#5-player-interface-details)
6. [Understanding Markets](#6-understanding-markets)
7. [Results & Evaluation](#7-results--evaluation)
8. [Tips & Strategies](#8-tips--strategies)
9. [Troubleshooting](#9-troubleshooting)
10. [Glossary](#10-glossary)

---

## 1. Introduction

### What is the Energy Market Simulation Game?

The EMSG is an interactive simulation for learning electricity market principles. You take on the role of an energy market participant and must:

- Create forecasts for your generation and consumption
- React to market events
- Maximize profit while minimizing imbalances

### Learning Objectives

- Understand the interaction between Day-Ahead and Intraday markets
- Optimize energy forecasts
- React to unexpected events (outages, weather changes)
- Learn price formation mechanisms

---

## 2. Getting Started

### 2.1 Registration

1. Open the game in your browser
2. Click "Register"
3. Enter email and password
4. Confirm email (if required)

### 2.2 Login

- Use email and password
- "Remember me" keeps you logged in

### 2.3 Join Cohort

If you receive an invitation link from your trainer:
1. Click the link
2. Log in (or register first)
3. You will be automatically added to the cohort

---

## 3. Navigation & Pages

### 3.1 Main Navigation

| Route | Function |
|-------|----------|
| `/catalog` | Campaign and scenario overview |
| `/player` | Active game interface |
| `/evaluation` | Final results after session |
| `/leaderboard` | Ranking compared to other players |
| `/me` | Profile and settings |

### 3.2 Catalog

The catalog shows all available campaigns:

| Element | Description |
|---------|-------------|
| **Campaign Card** | Title, image, description |
| **Scenarios** | List of scenarios within the campaign |
| **Solo/Cohort** | What modes are available |

### 3.3 Player Page

The central game interface with:

| Section | Function |
|---------|----------|
| **Header** | Round, timer, status |
| **Forecast Chart** | Interactive editing |
| **Device Panel** | Overview of your devices |
| **Market Info** | Current prices and volumes |

---

## 4. Gameplay Flow

### 4.1 Session Types

| Type | Description |
|------|-------------|
| **Solo** | Play alone against AI agents |
| **Cohort** | With other players, trainer-led |

### 4.2 Typical Session Flow

```
1. Session starts
   └── Read briefing, understand objectives

2. Per Round:
   ├── View forecasts (consumption, generation)
   ├── Edit forecasts (Chart Editor)
   ├── Submit forecast
   ├── Wait for market clearing
   └── View round results

3. After last round:
   └── View scenario results and evaluation
```

### 4.3 Round Timeline

| Phase | Duration | Your Tasks |
|-------|----------|------------|
| **Active** | e.g. 5 min | Edit and submit forecast |
| **Clearing** | ~10 sec | Automatic calculation |
| **Results** | Variable | Analyze, click "Ready" |

### 4.4 Timer & Submit

- **Timer**: Shows remaining time in the round
- **Submit Button**: Confirms your forecast
- **Auto-Submit**: If timer expires without submit, current values are used

---

## 5. Player Interface Details

### 5.1 Chart Editor

The central element for forecast editing:

```
┌────────────────────────────────────────────────────────────┐
│  [Zone Dropdown]  [Device Dropdown]  [Reset] [Undo] [Redo] │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  MW                                                        │
│  ▲                                                         │
│  │     ████                                                │
│  │   ██    ██                                              │
│  │  █        █                                             │
│  │ █          ██████                                       │
│  └──────────────────────────────────────────────────► Time │
│     00:00  06:00  12:00  18:00  00:00                      │
│                                                            │
│  [Brush: Point | Range | Smooth]  [Lock DA Committed]      │
└────────────────────────────────────────────────────────────┘
```

### 5.2 Chart Zones

The chart shows different zones:

| Zone | Color | Meaning |
|------|-------|---------|
| **Frozen** | Gray | Already passed, cannot be edited |
| **DA Committed** | Blue | Committed in Day-Ahead |
| **Editable** | White | Can still be adjusted |
| **Forecast Horizon** | Light | Visible but not yet tradable |

### 5.3 Editing Tools

| Tool | Function |
|------|----------|
| **Point** | Click to set individual values |
| **Range** | Drag to set multiple hours |
| **Smooth** | Automatic smoothing between points |
| **Reset** | Back to original forecast |
| **Undo/Redo** | Undo last edits |

### 5.4 Multi-Bid Pricing (Optional)

If enabled in scenario:

| Field | Description |
|-------|-------------|
| **Bid Price** | Your price in ZAR/MWh |
| **Volume** | Amount at this price |
| **Tranches** | Up to 3 price levels |

### 5.5 Device Panel

Overview of your devices:

| Column | Description |
|--------|-------------|
| **Name** | Device name |
| **Type** | Generator, Renewable, Storage, Load |
| **Capacity** | Maximum power (MW) |
| **Status** | Online, Offline, Reduced |
| **SoC** | State of Charge (storage only) |

### 5.6 Device Types

| Type | Symbol | Description |
|------|--------|-------------|
| **Generator** | ⚡ | Controllable power plant (coal, gas, nuclear) |
| **Renewable** | 🌞🌬️ | Solar, wind (weather dependent) |
| **Storage** | 🔋 | Battery, pumped hydro |
| **Load** | 🏭 | Industrial, commercial, residential consumption |

---

## 6. Understanding Markets

### 6.1 Market Phases

| Market | Timing | Purpose |
|--------|--------|---------|
| **Day-Ahead (DA)** | Before Gate Closure | Main planning |
| **Intraday (ID)** | After Gate Closure | Fine-tuning |
| **Balancing** | In real-time | Imbalance settlement |

### 6.2 Gate Closure

The **Day-Ahead Gate Closure** (typically hour 12) separates:

- **Before**: All trades count as Day-Ahead
- **After**: All trades count as Intraday

### 6.3 MCP (System Marginal Price)

The **System Marginal Price** is determined by supply and demand intersection:

```
Price
  ▲
  │         Supply
  │        ╱
  │       ╱
  │──────●────── MCP
  │     ╱ ╲
  │    ╱   Demand
  │   ╱
  └─────────────────► Quantity
```

### 6.4 ID Price Spread

If configured in scenario:

| Spread | Effect |
|--------|--------|
| **+8%** | ID is 8% more expensive than DA |
| **0%** | DA and ID same price |
| **-5%** | ID is 5% cheaper than DA |

**Strategic Implication**: High spread → better DA planning pays off!

### 6.5 Imbalance

Difference between forecast and actual delivery:

| Situation | Consequence |
|-----------|-------------|
| **Under-delivery** | Pay balancing up price (expensive!) |
| **Over-delivery** | Receive balancing down price (low!) |

**Goal**: Minimize imbalances!

### 6.6 Curtailment

If your generation cannot be delivered (grid congestion):

- You receive **Curtailment Costs**
- Revenue is lost
- Often affects renewable generators

---

## 7. Results & Evaluation

### 7.1 Round Results

After each round you see:

| KPI | Description |
|-----|-------------|
| **Revenue** | Earnings from sales |
| **Costs** | Fuel, start-up, imbalance, curtailment |
| **Profit** | Revenue - Costs |
| **Imbalance** | Deviation from forecast |

### 7.2 DA/ID Market Breakdown

New feature (Sprint 24) - shows your trading activity:

| Metric | Description |
|--------|-------------|
| **DA Volume** | MWh committed in Day-Ahead |
| **ID Delta** | MWh adjusted in Intraday |
| **Final Position** | Actual delivery |
| **ID Adjustment %** | Percentage change from DA to ID |

**Example:**
```
DA Volume:    100 MWh (planned in DA)
ID Delta:     +15 MWh (increased in ID)
Final:        115 MWh (actual delivery)
ID Adj %:     15%
```

### 7.3 Consumer View

For **Load** players (consumers):

| Metric | Description |
|--------|-------------|
| **DA Procurement** | MWh bought in Day-Ahead |
| **ID Adjustment** | Additional purchases in ID |
| **Total Consumption** | Actual consumption |
| **Avg. Price Paid** | Weighted average purchase price |

### 7.4 Scenario Results

After all rounds:

| Section | Content |
|---------|---------|
| **Summary KPIs** | Total profit, imbalance, score |
| **Round Table** | Details per round |
| **Trend Charts** | Performance over time |
| **Ranking** | Your position vs other players |

### 7.5 Leaderboard

| Column | Description |
|--------|-------------|
| **Rank** | 1, 2, 3, ... |
| **Player** | Name or email |
| **Score** | Total score (0-100) |
| **Profit** | Total profit |

---

## 8. Tips & Strategies

### 8.1 For Generators

| Tip | Reasoning |
|-----|-----------|
| Plan conservatively | Imbalance costs are expensive |
| Watch events | Outages affect capacity |
| Ramp constraints | Don't ignore ramp limits |
| Start costs | Avoid frequent starts |

### 8.2 For Renewables

| Tip | Reasoning |
|-----|-----------|
| Weather forecast | Solar/wind depends on weather |
| Curtailment risk | Network congestion possible |
| Combine with storage | Balance fluctuations |

### 8.3 For Storage

| Tip | Reasoning |
|-----|-----------|
| Buy low, sell high | Price differences = profit |
| Keep reserve | Buffer for unforeseen events |
| Efficiency | Account for losses |

### 8.4 For Consumers (Loads)

| Tip | Reasoning |
|-----|-----------|
| Plan DA accurately | ID adjustments cost more |
| Flexibility | Use Demand Response if available |
| Peak avoidance | High demand = high prices |

### 8.5 General

| Tip | Reasoning |
|-----|-----------|
| Read objectives! | Know what's expected |
| Observe other players | Learn from strategies |
| Use all rounds | Improve continuously |
| Don't panic | One bad round isn't the end |

---

## 9. Troubleshooting

### 9.1 Common Problems

| Problem | Solution |
|---------|----------|
| Chart doesn't load | Refresh page |
| Submit doesn't work | Check timer, internet connection |
| Wrong values | Use Undo or Reset |
| Session disappeared | Contact trainer |
| Slow performance | Close other tabs |

### 9.2 Connection Problems

- **Red dot in header**: No connection to server
- **"Reconnecting..."**: Automatic reconnection attempt
- **Manual refresh**: F5 or browser reload button

### 9.3 Support

- **During session**: Contact trainer
- **Technical issues**: support@emsg.example.com

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **MCP** | System Marginal Price - uniform price for all |
| **DA** | Day-Ahead - main planning market |
| **ID** | Intraday - short-term adjustment market |
| **Imbalance** | Difference between forecast and actual |
| **Curtailment** | Forced generation reduction |
| **SoC** | State of Charge (battery fill level) |
| **Gate Closure** | Deadline for DA trading |
| **Balancing** | Real-time energy settlement |
| **ZAR** | South African Rand (currency) |
| **MWh** | Megawatt-hours (energy unit) |
| **MW** | Megawatt (power unit) |
| **Ramp Rate** | Speed of power change (MW/h) |
| **Capacity Factor** | Average utilization of a plant |
| **DRM** | Demand Response Management |

---

*Last updated: December 23, 2025*
