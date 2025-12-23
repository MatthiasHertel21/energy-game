# EMSG - Energy Market Calculation Engine Documentation

## Overview

This document describes the exact calculations performed when a player submits forecast data for a round in the Energy Market Simulation Game (EMSG). The engine computes market clearing price, dispatch, revenues, costs, and profits based on energy market principles.

**Version:** 1.7  
**Last Updated:** December 23, 2025

---

## Table of Contents

1. [Input Data](#input-data)
2. [Market Clearing Process](#market-clearing-process)
   - 2.1 [Hourly Market Clearing Overview](#hourly-market-clearing-overview)
   - 2.2 [Synthetic Supply/Demand Generation](#synthetic-supply-demand-generation)
   - 2.3 [Multi-Bid Player Supply (Optional)](#multi-bid-player-supply)
   - 2.4 [Consumer Demand Bids (Optional)](#consumer-demand-bids)
   - 2.5 [Market Clearing Algorithm](#market-clearing-algorithm)
3. [Event Application](#event-application)
4. [Player Dispatch Calculation](#player-dispatch-calculation)
5. [Realistic Availability Constraints](#realistic-availability-constraints)
6. [Revenue Calculation](#revenue-calculation)
7. [Cost Components](#cost-components)
8. [Profit Calculation](#profit-calculation)
9. [Detailed Hourly Breakdown](#detailed-hourly-breakdown)
10. [Device Constraints Validation](#device-constraints-validation)
11. [Mathematical Formulas](#mathematical-formulas)
12. [Example Calculation](#example-calculation)
13. [DA/ID Market Breakdown](#daid-market-breakdown)

---

## Input Data

When a player submits their forecast for a round, the following data is used:

### Player Forecast
- **Forecast Hours** (`hours`): Array of hourly energy values in MWh for the round window
- **Session ID**: Identifies the game session
- **Round Number**: Current round being played
- **Player ID**: Unique identifier for the player

### Scenario Configuration
From the scenario's `config` object:

```json
{
  "general": {
    "round_span_hours": 6,          // Hours per round (default: 6)
    "rounds": 8                      // Total rounds (default: 8)
  },
  "market": {
    "base_price": 1000,              // ZAR/MWh (default: 1000)
    "base_volume_mwh": 20000,        // MWh (default: 20000)
    "price_floor": -500,             // Min price ZAR/MWh
    "price_cap": 5000                // Max price ZAR/MWh
  },
  "environment": {
    "seed": "round_seed_123",        // For reproducible randomness
    "actual_noise_pct": 5            // Actual vs forecast deviation %
  },
  "player_types": [
    {
      "id": "type_a",
      "capacity_variability_pct": 10,
      "marginal_cost_variability_pct": 15
    }
  ],
  "events": [],                      // Market events (see Event Application)
  "devices": [],                     // Device constraints (see Device Validation)
  "grid": {
    "atc": [],                       // Available Transfer Capacity matrix
    "transmission_losses_pct": 2     // Transmission losses %
  }
}
```

---

## Market Clearing Process

### Hourly Market Clearing Overview

**Important:** As of version 1.3, the engine performs **hourly market clearing** for each hour within a round.

#### Process Flow

1. **For each hour** in the round (determined by `round_span_hours`):
   - Generate or collect supply/demand curves for that specific hour
   - Execute market clearing algorithm → produces hourly MCP and volume
   - Track dispatch quantities per player per hour
   - Calculate hourly costs and revenues

2. **Aggregate results** across all hours:
   - Sum planned, dispatched, and actual MWh across hours
   - Sum revenues, costs, and profits across hours
   - Calculate average MCP across all hours
   - Store hourly results for detailed analysis

#### Example: Round with 4 Hours

```python
round_span_hours = 4  # Config setting
round_num = 2         # Second round
base_idx = (round_num - 1) * round_span_hours  # = 4 (hours 4-7)

# Hour-by-hour processing:
for hour_offset in range(4):
    hour_idx = base_idx + hour_offset  # 4, 5, 6, 7
    
    # Get supply/demand for this specific hour
    supply_hour = extract_hour_data(forecasts, hour_idx)
    demand_hour = extract_hour_data(forecasts, hour_idx)
    
    # Clear market for this hour
    mcp_hour, volume_hour = clear_market(supply_hour, demand_hour)
    
    # Store hourly result
    hourly_results.append({
        'hour_idx': hour_idx,
        'mcp': mcp_hour,
        'volume': volume_hour
    })

# Final round results
avg_mcp = mean([h['mcp'] for h in hourly_results])
total_volume = sum([h['volume'] for h in hourly_results])
```

**Key Benefits:**
- Realistic hourly price discovery
- Accurate tracking of time-varying supply/demand
- Better representation of renewable intermittency
- Works with any `round_span_hours` setting (1, 3, 4, 6, 8, 12, 24, etc.)

---

### Step 1: Generate Supply and Demand Curves

The engine generates synthetic step-wise supply and demand curves based on scenario configuration.

**Algorithm:**

```python
def generate_curves_from_config(cfg, seed):
    base_price = cfg.market.base_price      # e.g., 1000 ZAR/MWh
    base_volume = cfg.market.base_volume_mwh # e.g., 20000 MWh
    steps = 20                              # Number of price-volume steps
    
    # Calculate average variability from player types
    capacity_variability = avg(player_type.capacity_variability_pct) / 100
    marginal_cost_variability = avg(player_type.marginal_cost_variability_pct) / 100
    
    # Initialize random seed for reproducibility
    random.seed(hash(seed))
    
    supply_curve = []
    demand_curve = []
    
    for i in range(steps):
        # Supply curve: ascending price from (base - 400) to (base + 400)
        price_supply = base_price - 400 + i * (800 / (steps - 1))
        
        # Demand curve: descending price from (base + 400) to (base - 400)
        price_demand = base_price + 400 - i * (800 / (steps - 1))
        
        # Apply marginal cost variability as price jitter
        if marginal_cost_variability > 0:
            price_supply += random.uniform(-marginal_cost_variability, 
                                          marginal_cost_variability) * 50
            price_demand += random.uniform(-marginal_cost_variability, 
                                          marginal_cost_variability) * 50
        
        # Volume per step
        volume = base_volume / steps
        
        # Apply capacity variability as volume jitter
        if capacity_variability > 0:
            volume = volume * (1 + random.uniform(-capacity_variability, 
                                                  capacity_variability))
            volume = max(0, volume)
        
        supply_curve.append((price_supply, volume))
        demand_curve.append((price_demand, volume))
    
    # Ensure monotonicity
    supply_curve = sorted(supply_curve, key=lambda x: x[0])      # Ascending
    demand_curve = sorted(demand_curve, key=lambda x: x[0], reverse=True)  # Descending
    
    return supply_curve, demand_curve
```

**Example Output:**

```python
supply_curve = [
    (600, 950),   # (ZAR/MWh, MWh)
    (640, 1020),
    # ... 18 more steps ...
    (1380, 1050),
    (1400, 980)
]

demand_curve = [
    (1400, 1100),
    (1360, 950),
    # ... 18 more steps ...
    (640, 1020),
    (600, 1050)
]
```

---

### Step 2: Multi-Bid Player Supply (Optional)

**Enabled when:** `config.market.enable_player_bidding = true`

Instead of synthetic supply curves, players submit **price-quantity bids** per device.

#### Bid Structure

Each player can submit up to **3 bids (A/B/C)** per device:

```python
forecast.bids = {
    'device_id_1': {
        'A': {'price': 350.0, 'hours': [200, 200, 200, ...]},  # 24 values
        'B': {'price': 400.0, 'hours': [150, 150, 150, ...]},
        'C': {'price': 480.0, 'hours': [100, 100, 100, ...]}
    },
    'device_id_2': {
        'A': {'price': 0.0, 'hours': [100, 150, 180, ...]}  # Solar at 0 cost
    }
}
```

#### Building Supply Curve from Bids

For each hour in the round:

```python
def build_supply_from_bids(player_forecasts, hour_idx, synthetic_supply):
    """
    Merge player bids with synthetic supply curve for market clearing
    
    Args:
        player_forecasts: Dict of {player_id: forecast_with_bids}
        hour_idx: Hour index (0-23)
        synthetic_supply: Base supply curve from config
    
    Returns:
        Combined supply curve sorted by price (ascending)
    """
    supply_bids = []
    
    # Collect all player device bids for this hour
    for player_id, forecast in player_forecasts.items():
        if not forecast.get('bids'):
            continue
            
        for device_id, device_bids in forecast['bids'].items():
            for bid_label in ['A', 'B', 'C']:
                if bid_label not in device_bids:
                    continue
                    
                bid = device_bids[bid_label]
                quantity = bid['hours'][hour_idx]
                price = bid['price']
                
                if quantity > 0:
                    supply_bids.append({
                        'price': price,
                        'quantity': quantity,
                        'player_id': player_id,
                        'device_id': device_id,
                        'bid_label': bid_label
                    })
    
    # Merge player bids with synthetic supply
    combined_supply = []
    
    # Add synthetic supply steps
    for price, quantity in synthetic_supply:
        combined_supply.append((price, quantity))
    
    # Add player bids
    for bid in supply_bids:
        combined_supply.append((bid['price'], bid['quantity']))
    
    # Sort by price (merit order)
    combined_supply = sorted(combined_supply, key=lambda x: x[0])
    
    return combined_supply, supply_bids
```

#### Dispatch Tracking

Market clearing identifies which bids were dispatched:

```python
dispatched_bids = []

# During market clearing loop, track accepted bids
for bid in supply_bids:
    if bid['price'] <= mcp:
        dispatched_quantity = min(bid['quantity'], remaining_demand)
        dispatched_bids.append({
            'player_id': bid['player_id'],
            'device_id': bid['device_id'],
            'bid_label': bid['bid_label'],
            'quantity_offered': bid['quantity'],
            'quantity_dispatched': dispatched_quantity,
            'price_bid': bid['price'],
            'mcp': mcp
        })
        remaining_demand -= dispatched_quantity
```

**Aggregation per Player:**

```python
# Sum all dispatched bids per player-device
player_dispatch = {}
for dispatch in dispatched_bids:
    key = (dispatch['player_id'], dispatch['device_id'])
    if key not in player_dispatch:
        player_dispatch[key] = 0
    player_dispatch[key] += dispatch['quantity_dispatched']
```

---

### Step 3: Consumer Demand Bids (Optional)

**Enabled when:** `config.market.enable_player_bidding = true` **AND** player has load devices

Consumers (devices with `type` containing "load") submit bids representing their **willingness to pay** for electricity.

#### Consumer vs Generator Bidding

| Aspect | Generators (Supply) | Consumers (Demand) |
|--------|-------------------|-------------------|
| **Bid Meaning** | Minimum price to sell | Maximum price to buy |
| **Curve** | Added to supply curve | Added to demand curve |
| **Dispatch Rule** | Dispatched if `bid_price <= MCP` | Dispatched if `bid_price >= MCP` |
| **Revenue** | Positive (earn money) | Negative (pay money) |
| **Default Prices** | Low (e.g., 50-400 ZAR/MWh) | High (e.g., 800-1200 ZAR/MWh) |

**Key Filter (Critical):** Consumer devices are **excluded from supply curve** to prevent incorrect dispatch. Only generator devices (`type` not containing "load") are added to supply.

**Code Reference:** [engine.py#L232-L235](../backend/app/engine.py#L232-L235) (supply filter), [engine.py#L360-L420](../backend/app/engine.py#L360-L420) (demand curve building)

#### Consumer Dispatch Logic

After MCP is determined:
- Consumer bids with `price >= MCP` → **100% dispatched** (willing to pay)
- Consumer bids with `price < MCP` → **0% dispatched** (not willing to pay)

**No merit order:** All consumers willing to pay MCP get fully satisfied, independent of supply availability.

---

### Step 4: Market Clearing Algorithm

The engine finds the Market Clearing Price (MCP) where supply meets demand.

**Algorithm:**

```python
def clear_market(supply, demand, price_floor=-500, price_cap=5000):
    # Sort: supply ascending, demand descending by price
    s = sorted(supply, key=lambda x: x[0])
    d = sorted(demand, key=lambda x: x[0], reverse=True)
    
    i = j = 0
    cumulative_supply = 0.0
    cumulative_demand = 0.0
    mcp = 0.0
    
    # Iterate through both curves simultaneously
    while i < len(s) and j < len(d):
        price_supply, volume_supply = s[i]
        price_demand, volume_demand = d[j]
        
        if price_supply <= price_demand:
            # Market clears at this intersection
            traded_volume = min(volume_supply, volume_demand)
            cumulative_supply += traded_volume
            cumulative_demand += traded_volume
            
            # Market clearing price is the supply price (or demand price if higher)
            mcp = max(price_supply, min(price_demand, price_supply))
            
            # Update remaining volumes
            volume_supply -= traded_volume
            volume_demand -= traded_volume
            
            # Advance to next step if volume exhausted
            if volume_supply < 0.0001:
                i += 1
            else:
                s[i] = (price_supply, volume_supply)
                
            if volume_demand < 0.0001:
                j += 1
            else:
                d[j] = (price_demand, volume_demand)
        else:
            # No overlap, advance supply side
            i += 1
    
    # Apply price bounds
    price = max(price_floor, min(price_cap, mcp))
    volume = round(min(cumulative_supply, cumulative_demand), 3)
    
    return round(price, 1), volume
```

**Example:**

```python
# Given curves above
mcp, volume = clear_market(supply_curve, demand_curve)
# Result: mcp = 1000.0 ZAR/MWh, volume = 12500 MWh
```

---

## Event Application

After market clearing, configured events modify the price and/or volume.

### Event Types

#### 1. **Round-Based Events**
Triggered for specific rounds with duration.

```json
{
  "type": "systemic",
  "trigger_type": "round",
  "trigger_value": 3,           // Start at round 3
  "duration_rounds": 2,         // Active for rounds 3 and 4
  "multiplier": 1.5,            // Price multiplied by 1.5
  "name": "Heat Wave"
}
```

**Logic:**
```python
start = trigger_value  # 3
end = start + duration_rounds - 1  # 4

if start <= current_round <= end:
    apply_event()
```

#### 2. **Probability-Based Events**
Randomly triggered each round based on probability.

```json
{
  "type": "systemic",
  "trigger_type": "prob",
  "trigger_value": 0.3,         // 30% chance per round
  "multiplier": 0.8,            // Price multiplied by 0.8
  "key": "renewable_surge",
  "name": "Renewable Energy Surge"
}
```

**Logic:**
```python
# Deterministic pseudo-random based on round and event key
hash_value = sha256(f"event_prob_{round_num}_{event_key}").hexdigest()
random_value = (int(hash_value, 16) % 1000000) / 1000000.0

if random_value < trigger_value:
    apply_event()
```

#### 3. **Additive Events**
Modify volume instead of price.

```json
{
  "type": "additive",
  "trigger_type": "round",
  "trigger_value": 5,
  "additive": -2000,            // Reduce volume by 2000 MWh
  "name": "Transmission Outage"
}
```

### Event Application Formula

```python
def apply_events(price, volume, events):
    price_multiplier = 1.0
    volume_additive = 0.0
    
    for event in events:
        if event.type == "systemic":
            price_multiplier *= event.multiplier
        elif event.type == "additive":
            volume_additive += event.additive
    
    final_price = price * price_multiplier
    final_volume = max(0.0, volume + volume_additive)
    
    return final_price, final_volume
```

**Example:**

```python
# Before events: mcp = 1000 ZAR/MWh, volume = 12500 MWh
# Events: Heat Wave (multiplier=1.5), Outage (additive=-2000)

final_price = 1000 * 1.5 = 1500 ZAR/MWh
final_volume = max(0, 12500 - 2000) = 10500 MWh
```

---

## Player Dispatch Calculation

Each player's submitted forecast is converted to dispatched energy based on market mode.

### Mode 1: Isolated Per Player (Solo Mode)

Each player operates independently. Their forecast is fully dispatched (subject to grid limits).

```python
planned_mwh = sum(forecast_hours[round_start:round_end])
dispatched_mwh = planned_mwh * dispatch_factor  # dispatch_factor = 1.0
```

### Mode 2: Shared Market (Cohort Mode)

Multiple players compete for the same market volume. Dispatch is pro-rated if total demand exceeds market volume.

```python
# Sum all players' planned energy
total_planned = sum(player_planned for all players)

# Pro-rata dispatch factor
if total_planned > market_volume:
    dispatch_factor = market_volume / total_planned
else:
    dispatch_factor = 1.0

# Each player's dispatch
dispatched_mwh = player_planned * dispatch_factor
```

**Example:**

```python
# Market volume: 10500 MWh
# Player A planned: 6000 MWh
# Player B planned: 7000 MWh
# Total planned: 13000 MWh (exceeds market)

dispatch_factor = 10500 / 13000 = 0.808

# Player A dispatched: 6000 * 0.808 = 4848 MWh
# Player B dispatched: 7000 * 0.808 = 5656 MWh
```

---

## Realistic Availability Constraints

**New in v1.4:** The engine enforces **physics-based availability constraints** for renewable energy sources.

### Availability Envelopes

Each device type has a realistic availability profile based on time of day:

#### Solar Availability (24-hour pattern)
```python
# Solar is unavailable at night, peaks at midday
SOLAR_AVAILABILITY = [
    0.0, 0.0, 0.0, 0.0, 0.0,  # Night: 00:00-04:00
    0.05, 0.15, 0.35, 0.6,     # Dawn: 05:00-08:00
    0.78, 0.9, 0.92, 0.9,      # Morning/Midday: 09:00-12:00
    0.78, 0.6, 0.35, 0.15,     # Afternoon: 13:00-16:00
    0.05, 0.0, 0.0, 0.0,       # Dusk/Night: 17:00-20:00
    0.0, 0.0, 0.0              # Night: 21:00-23:00
]
```

#### Wind Availability (24-hour pattern)
```python
# Wind is more stable but still variable (typically higher at night)
WIND_AVAILABILITY = [
    0.70-0.76,  # Night hours: higher availability
    0.47-0.55,  # Daytime: lower availability
    0.55-0.76   # Evening: increasing availability
]
# Average: ~63% across 24 hours
```

#### Dispatchable Sources (Coal, Gas, Hydro, Nuclear)
```python
# Always fully available (controllable generation)
AVAILABILITY = 1.0  # 100% at all hours
```

### Actual Delivery Calculation

The **actual** energy delivered is constrained by the availability envelope:

```python
def calculate_actual(device, dispatched, hour_of_day):
    # Get availability factor for this hour
    availability = get_availability_factor(device.type, hour_of_day)
    
    # Maximum deliverable energy
    max_available = dispatched * availability
    
    # Actual is constrained by envelope
    actual_constrained = min(dispatched, max_available)
    
    # Add noise on top of constrained value
    noise = random.uniform(-noise_pct, noise_pct) * actual_constrained
    actual = max(0.0, actual_constrained + noise)
    
    return actual
```

### Imbalance from Over-Forecasting

When players forecast more than physically deliverable:

```python
# Example: Solar plant at 02:00 (night)
dispatched = 100 MWh      # Player's forecast
availability = 0.0        # Solar unavailable at night
actual = 0 MWh            # Cannot deliver

# Imbalance calculation
imbalance = actual - dispatched = 0 - 100 = -100 MWh
imbalance_cost = abs(-100) × down_price = 100 × 800 = 80,000 ZAR
```

### Benefits

1. **Realistic Physics**: Solar delivers zero at night, regardless of forecast
2. **Automatic Penalties**: Over-forecasting renewables generates imbalance costs
3. **Strategic Gameplay**: Players must forecast realistically or pay penalties
4. **Educational Value**: Teaches renewable intermittency and forecasting challenges

### Example Scenario

**Setup:**
- Solar plant: 100 MW capacity
- Player forecasts: 100 MW for all 24 hours
- Hour 02:00 (night): availability = 0.0
- Hour 12:00 (midday): availability = 0.92

**Results:**

| Hour | Forecast | Dispatched | Availability | Actual | Imbalance Cost |
|------|----------|------------|--------------|--------|----------------|
| 02:00 | 100 MW | 100 MW | 0.0 | 0 MW | 80,000 ZAR |
| 12:00 | 100 MW | 100 MW | 0.92 | 92 MW | 6,400 ZAR |

**Round Total (24h):**
- Planned: 2,400 MWh
- Actual: ~1,530 MWh (64% average availability)
- Imbalance Cost: ~695,000 ZAR

---

## Revenue Calculation

Revenue is calculated from dispatched energy at the market clearing price.

### Formula

```
Revenue (ZAR) = Dispatched_MWh × MCP
```

**Rounding:** Rounded to nearest ZAR (no decimals).

**Example:**

```python
dispatched_mwh = 4848
mcp = 1500  # ZAR/MWh

revenue = 4848 * 1500 = 7,272,000 ZAR
```

---

## Cost Components

### 1. Fuel Cost

**Status:** Currently set to 0 ZAR in MVP implementation.

**Future Implementation:** Will be calculated based on device types:

```python
fuel_cost = sum(device_mwh * device.fuel_cost_per_mwh for each device)
```

---

### 2. Imbalance Cost

Players are penalized if their actual generation deviates from dispatched forecast.

#### Actual Generation

Actual generation includes random noise to simulate real-world uncertainty:

```python
actual_noise_pct = config.environment.actual_noise_pct  # default 5%
noise_fraction = actual_noise_pct / 100.0

noise = random.uniform(-noise_fraction, noise_fraction) * max(1.0, dispatched_mwh)
actual_mwh = max(0.0, dispatched_mwh + noise)
```

**Example:**

```python
dispatched_mwh = 4848
actual_noise_pct = 5

# Random noise between -5% and +5%
noise = random.uniform(-0.05, 0.05) * 4848
# Assume noise = -120 MWh
actual_mwh = max(0, 4848 - 120) = 4728 MWh
```

#### Imbalance Settlement

```python
def settle_balancing(planned, actual, up_price=1200, down_price=800):
    imbalance = actual - planned
    
    if imbalance > 0:
        # Over-generation: pay up_price per excess MWh
        cost = imbalance * up_price
    else:
        # Under-generation: pay down_price per deficit MWh
        cost = abs(imbalance) * down_price
    
    return round(cost, 0)
```

**Default Prices:**
- **Up-regulation price:** 1200 ZAR/MWh (excess generation)
- **Down-regulation price:** 800 ZAR/MWh (deficit generation)

**Example:**

```python
dispatched = 4848 MWh
actual = 4728 MWh
imbalance = 4728 - 4848 = -120 MWh  # Under-generation

imbalance_cost = abs(-120) * 800 = 96,000 ZAR
```

---

### 3. Curtailment Cost

Curtailment occurs when planned energy cannot be dispatched due to:
1. **Market constraints** (shared market mode)
2. **Grid constraints** (transmission limits)

#### Market-Based Curtailment

```python
market_curtailment = max(0, planned_mwh - dispatched_mwh)
```

**Example:**

```python
planned = 6000 MWh
dispatched = 4848 MWh
market_curtailment = 6000 - 4848 = 1152 MWh
```

#### Grid-Based Curtailment

Grid curtailment applies when transmission capacity is exceeded.

```python
def apply_grid(volume, atc, losses=0.02, devices=None):
    # ATC: Available Transfer Capacity matrix (zone-to-zone)
    # losses: transmission losses percentage
    
    # Total transferable capacity (sum of off-diagonal ATC elements)
    total_capacity = sum(atc[i][j] for i != j) * (1 - losses)
    
    if volume <= total_capacity:
        return 0.0, 0.0  # No curtailment
    
    curtailment_mwh = max(0, volume - total_capacity)
    
    # Congestion signal: ratio of curtailment to planned volume
    congestion_ratio = min(1.0, curtailment_mwh / max(1.0, volume))
    
    return curtailment_mwh, congestion_ratio
```

**Device Priority-Based Curtailment:**

If devices are configured, curtailment follows priority order:
1. **Priority 1** (Solar, Wind, Loads) - curtailed first
2. **Priority 2** (Gas, Hydro, Battery) - curtailed second
3. **Priority 3** (Coal) - curtailed third
4. **Priority 4** (Nuclear) - curtailed last (baseload)

*Note: Per-device curtailment allocation is a placeholder for future implementation.*

**Example:**

```python
atc = [
    [0, 1000, 500],   # From zone 0 to zones 1, 2
    [1000, 0, 800],   # From zone 1 to zones 0, 2
    [500, 800, 0]     # From zone 2 to zones 0, 1
]
losses = 0.02  # 2%

total_capacity = (1000 + 500 + 1000 + 800 + 500 + 800) * (1 - 0.02)
                = 4600 * 0.98 = 4508 MWh

dispatched = 4848 MWh
grid_curtailment = 4848 - 4508 = 340 MWh
congestion_ratio = 340 / 4848 = 0.0701
```

#### Total Curtailment Cost

```python
total_curtailment = market_curtailment + grid_curtailment
curtailment_cost = total_curtailment * mcp
```

**Example:**

```python
market_curtailment = 1152 MWh
grid_curtailment = 340 MWh
total_curtailment = 1152 + 340 = 1492 MWh

curtailment_cost = 1492 * 1500 = 2,238,000 ZAR
```

---

### 4. Congestion Revenue

Players may earn revenue from congestion when grid is constrained.

```python
congestion_revenue = dispatched_mwh * mcp * congestion_ratio
```

**Example:**

```python
dispatched = 4848 MWh
mcp = 1500 ZAR/MWh
congestion_ratio = 0.0701

congestion_revenue = 4848 * 1500 * 0.0701 = 509,821 ZAR
```

---

## Profit Calculation

### Formula

```
Profit = Revenue - Fuel_Cost - Imbalance_Cost - Curtailment_Cost + Congestion_Revenue
```

**Current MVP:**

```
Profit = Revenue - Imbalance_Cost - Curtailment_Cost + Congestion_Revenue
```

*(Fuel cost = 0 in current implementation)*

---

## Detailed Hourly Breakdown

**New in v1.5:** Each player's `round_kpis` now includes a `hourly_breakdown` array with per-hour financial details for full transparency.

### Structure

```json
{
  "round_kpis": {
    "1": {
      "planned_mwh": 600.0,
      "dispatched_mwh": 600.0,
      "actual_mwh": 540.0,
      "revenue_zar": 608400,
      "imbalance_cost_zar": 48000,
      "curtailment_cost_zar": 0,
      "profit_zar": 560400,
      "hourly_breakdown": [
        {
          "hour": 12,
          "mcp": 1063.2,
          "planned_mw": 100.0,
          "dispatched_mw": 100.0,
          "actual_mw": 92.0,
          "revenue_zar": 106320.0,
          "imbalance_mwh": 8.0,
          "imbalance_cost_zar": 6400.0,
          "curtailment_mwh": 0.0,
          "curtailment_cost_zar": 0.0
        },
        // ... 5 more hours
      ]
    }
  }
}
```

### Fields Explained

| Field | Unit | Description |
|-------|------|-------------|
| `hour` | 0-23 | Hour of day |
| `mcp` | ZAR/MWh | Market clearing price for this hour |
| `planned_mw` | MW | Sum of device forecasts |
| `dispatched_mw` | MW | Market-accepted dispatch |
| `actual_mw` | MW | Delivered (with availability constraints) |
| `revenue_zar` | ZAR | `dispatched_mw × mcp` |
| `imbalance_mwh` | MWh | `dispatched_mw - actual_mw` (if > 0) |
| `imbalance_cost_zar` | ZAR | `imbalance_mwh × 800` (down_price) |
| `curtailment_mwh` | MWh | `planned_mw - dispatched_mw` (if > 0) |
| `curtailment_cost_zar` | ZAR | `curtailment_mwh × mcp` |

### Verification

The sum of hourly values matches the round totals:

```python
assert sum(h['revenue_zar'] for h in hourly_breakdown) == round_kpis['revenue_zar']
assert sum(h['imbalance_cost_zar'] for h in hourly_breakdown) == round_kpis['imbalance_cost_zar']
```

### Use Cases

1. **Debugging:** Verify calculations per hour
2. **Strategy:** Identify which hours are profitable/costly
3. **Education:** Understand how MCP variation affects revenue
4. **Analytics:** Export hourly data for external analysis

**See:** [Round Results Transparency Guide](./ROUND_RESULTS_TRANSPARENCY.md) for detailed examples

---

## Complete Example

### Example Calculation

**Scenario Configuration:**
```json
{
  "general": { "round_span_hours": 6 },
  "market": {
    "base_price": 1000,
    "base_volume_mwh": 20000,
    "price_floor": -500,
    "price_cap": 5000
  },
  "environment": { "actual_noise_pct": 5 },
  "events": [
    {
      "type": "systemic",
      "trigger_type": "round",
      "trigger_value": 3,
      "duration_rounds": 2,
      "multiplier": 1.5,
      "name": "Heat Wave"
    }
  ],
  "grid": {
    "atc": [[0, 1000, 500], [1000, 0, 800], [500, 800, 0]],
    "transmission_losses_pct": 2
  }
}
```

**Player Forecast:**
- Round 3, Hours 12-17: `[800, 850, 900, 950, 900, 600]` MWh
- Planned: `5000 MWh`

**Mode:** Shared Market with 2 players

---

### Step-by-Step Calculation

#### 1. Market Clearing

```python
# Generate curves
supply, demand = generate_curves_from_config(config, seed="round3")

# Clear market
mcp_base, volume_base = clear_market(supply, demand)
# Result: mcp_base = 1000 ZAR/MWh, volume_base = 12500 MWh
```

#### 2. Apply Events

```python
# Round 3: Heat Wave is active (round 3-4)
events = [{"multiplier": 1.5}]

mcp = 1000 * 1.5 = 1500 ZAR/MWh
volume = 12500 MWh
```

#### 3. Dispatch Calculation

```python
# Player A planned: 5000 MWh
# Player B planned: 8000 MWh
# Total: 13000 MWh

dispatch_factor = 12500 / 13000 = 0.9615

# Player A
planned = 5000 MWh
dispatched = 5000 * 0.9615 = 4808 MWh
```

#### 4. Actual Generation

```python
noise = random.uniform(-0.05, 0.05) * 4808
# Assume noise = -120
actual = max(0, 4808 - 120) = 4688 MWh
```

#### 5. Revenue

```python
revenue = 4808 * 1500 = 7,212,000 ZAR
```

#### 6. Imbalance Cost

```python
imbalance = 4688 - 4808 = -120 MWh
imbalance_cost = 120 * 800 = 96,000 ZAR
```

#### 7. Curtailment Cost

```python
# Market curtailment
market_curtailment = 5000 - 4808 = 192 MWh

# Grid curtailment
grid_capacity = 4600 * 0.98 = 4508 MWh
grid_curtailment = max(0, 4808 - 4508) = 300 MWh

total_curtailment = 192 + 300 = 492 MWh
curtailment_cost = 492 * 1500 = 738,000 ZAR
```

#### 8. Congestion Revenue

```python
congestion_ratio = 300 / 4808 = 0.0624
congestion_revenue = 4808 * 1500 * 0.0624 = 450,029 ZAR
```

#### 9. Profit

```python
profit = revenue - imbalance_cost - curtailment_cost + congestion_revenue
       = 7,212,000 - 96,000 - 738,000 + 450,029
       = 6,828,029 ZAR
```

---

## Device Constraints Validation

Before accepting a forecast, the engine validates it against device constraints.

### Device Configuration Example

```json
{
  "id": "solar_1",
  "type": "Solar",
  "capacity_mw": 100,
  "ramp_up_limit_mw_per_hour": 50,
  "ramp_down_limit_mw_per_hour": 50,
  "min_generation_mw": 0,
  "max_generation_mw": 100
}
```

### Validation Rules

```python
def validate_forecast_constraints(device, forecast_mw):
    errors = []
    capacity = device.get("capacity_mw", float('inf'))
    min_gen = device.get("min_generation_mw", 0)
    max_gen = device.get("max_generation_mw", capacity)
    ramp_up = device.get("ramp_up_limit_mw_per_hour")
    ramp_down = device.get("ramp_down_limit_mw_per_hour")
    
    for i, mw in enumerate(forecast_mw):
        # Capacity constraints
        if mw < min_gen:
            errors.append(f"Hour {i}: {mw} MW < min {min_gen} MW")
        if mw > max_gen:
            errors.append(f"Hour {i}: {mw} MW > max {max_gen} MW")
        
        # Ramp rate constraints
        if i > 0:
            delta = mw - forecast_mw[i-1]
            if ramp_up and delta > ramp_up:
                errors.append(f"Hour {i}: ramp up {delta} MW/h exceeds limit {ramp_up} MW/h")
            if ramp_down and delta < -ramp_down:
                errors.append(f"Hour {i}: ramp down {abs(delta)} MW/h exceeds limit {ramp_down} MW/h")
    
    return errors
```

**If validation fails, the forecast is rejected with HTTP 400 and error details.**

---

## Mathematical Formulas Summary

### Market Clearing Price (MCP)

$$
\text{MCP} = \max(\text{price\_floor}, \min(\text{price\_cap}, \text{intersection\_price}))
$$

Where intersection_price is found by iterating supply/demand curves.

### Dispatch Factor (Shared Market)

$$
\text{dispatch\_factor} = \min\left(1.0, \frac{\text{market\_volume}}{\sum \text{all\_players\_planned}}\right)
$$

### Dispatched Energy

$$
\text{dispatched} = \text{planned} \times \text{dispatch\_factor}
$$

### Actual Generation

$$
\text{actual} = \max\left(0, \text{dispatched} + \text{noise}\right)
$$

$$
\text{noise} \sim U\left(-\text{noise\_pct} \times \text{dispatched}, +\text{noise\_pct} \times \text{dispatched}\right)
$$

### Revenue

$$
\text{Revenue} = \text{dispatched} \times \text{MCP}
$$

### Imbalance Cost

$$
\text{Imbalance\_Cost} = \begin{cases}
|\text{imbalance}| \times \text{up\_price} & \text{if imbalance} > 0 \\
|\text{imbalance}| \times \text{down\_price} & \text{if imbalance} < 0
\end{cases}
$$

$$
\text{imbalance} = \text{actual} - \text{dispatched}
$$

### Curtailment Cost

$$
\text{Curtailment\_Cost} = (\text{market\_curtailment} + \text{grid\_curtailment}) \times \text{MCP}
$$

### Congestion Revenue

$$
\text{Congestion\_Revenue} = \text{dispatched} \times \text{MCP} \times \text{congestion\_ratio}
$$

$$
\text{congestion\_ratio} = \min\left(1.0, \frac{\text{grid\_curtailment}}{\text{dispatched}}\right)
$$

### Profit

$$
\text{Profit} = \text{Revenue} - \text{Fuel\_Cost} - \text{Imbalance\_Cost} - \text{Curtailment\_Cost} + \text{Congestion\_Revenue}
$$

---

## Data Flow Summary

```
Player Forecast → Validation → Market Clearing → Event Application
    ↓                                    ↓
Dispatch Calc ← Market Volume    Actual Generation
    ↓                                    ↓
Revenue Calc                      Imbalance Cost
    ↓                                    ↓
Curtailment Cost ← Grid Limits   Congestion Revenue
    ↓                                    ↓
         → → → → PROFIT ← ← ← ← 
```

---

## Notes for Energy Experts

1. **Simplified Market Model:** The step-wise supply/demand curves are synthetic. Real markets use complex bidding systems.

2. **Event Modeling:** Events use simple multipliers/additives. Real-world events (weather, outages) have more nuanced impacts.

3. **Grid Modeling:** ATC matrix is simplified. Real grids use power flow models (DC/AC optimal power flow).

4. **Device Constraints:** Current validation checks capacity and ramp rates. Future versions may include:
   - Minimum up/down time
   - Start-up costs
   - Part-load efficiency curves
   - Storage state-of-charge

5. **Imbalance Settlement:** Uses fixed up/down prices (1200/800 ZAR/MWh). Real markets have dynamic balancing prices based on system frequency.

6. **Fuel Costs:** Implemented as `variable_cost_zar_per_mwh` per device. Applied only to generators based on dispatched volume.

7. **Transmission Losses:** Simplified as a percentage. Real losses depend on power flow magnitude and distance.

8. **Consumer Bidding:** Simplified willingness-to-pay model. Real demand response includes time-of-use tariffs and interruptible contracts.

---

## Validation Checklist

When reviewing calculations, verify:

- ✅ Supply/demand curves are monotonic (supply ascending, demand descending)
- ✅ Consumer devices excluded from supply curve (only in demand curve)
- ✅ Generator bids dispatched if price <= MCP, consumer bids if price >= MCP
- ✅ MCP is within [price_floor, price_cap]
- ✅ Dispatch factor ≤ 1.0
- ✅ Actual generation/consumption ≥ 0
- ✅ Curtailment ≥ 0 (generators only)
- ✅ Imbalance costs calculated for both generators and consumers
- ✅ Congestion ratio ∈ [0, 1]
- ✅ All monetary values rounded to nearest ZAR
- ✅ All energy values rounded to 3 decimal places (MWh)
- ✅ Device constraints satisfied before acceptance
- ✅ Events applied only for active rounds
- ✅ Hourly breakdown totals match round KPIs

---

## DA/ID Market Breakdown

### Overview

The engine tracks Day-Ahead (DA) and Intraday (ID) market positions separately to provide players with a realistic view of their trading activity.

### DA Baseline Storage

When a player's forecast passes a gate closure time, a DA baseline is stored:

```python
# In player.py - da_baseline endpoint
# Round 1 always creates DA baseline for Day 1
if round_num == 1:
    da_start, da_end = 0, 24  # Hours 0-23

# Later rounds check for gate crossing
gate_hour = day_ahead_gate_hour  # Default: 12
current_hour = round_num * round_span_hours
if current_hour >= gate_hour and previous_hour < gate_hour:
    day = (gate_hour // 24) + 1
    da_start, da_end = day * 24, (day + 1) * 24
```

### Gate Closure Logic

Gate closure determines when the DA position is locked:

| Scenario Time | Gate | DA Position Locked For |
|---------------|------|------------------------|
| 00:00 - 11:59 | - | (not yet) |
| 12:00+ Day 1 | 12:00 | Day 2 (hours 24-47) |
| 12:00+ Day 2 | 36:00 | Day 3 (hours 48-71) |

Configuration:
```json
{
  "day_ahead_gate_hour": 12,
  "round_span_hours": 6,
  "forecast_horizon_hours": 72
}
```

### DA/ID Revenue Calculation

Revenue is calculated with optional price differentiation:

```python
# Price configuration
id_price_spread = config.get("id_price_spread_percent", 0)  # Default: 0 (same price)
da_price = base_mcp
id_price = base_mcp * (1 + id_price_spread / 100)

# Volume calculation (with sign for consumers)
da_volume_signed = sum(da_hours)      # Negative for consumers
current_volume_signed = sum(current_hours)
id_delta_signed = current_volume_signed - da_volume_signed

# Revenue calculation
da_revenue = da_volume_signed * da_price
id_revenue = id_delta_signed * id_price
total_revenue = da_revenue + id_revenue
```

### Consumer vs Producer

The engine correctly handles both producers (positive volumes) and consumers (negative volumes):

| Role | Volume Sign | Revenue Sign | Interpretation |
|------|-------------|--------------|----------------|
| Producer | Positive (+) | Positive (+) | Sells electricity, earns revenue |
| Consumer | Negative (-) | Negative (-) | Buys electricity, pays costs |

### ID Price Spread

The `id_price_spread_percent` parameter adds realism by differentiating DA and ID prices:

| Spread Value | Meaning | Effect |
|--------------|---------|--------|
| `0` | No spread (default) | DA and ID prices equal |
| `+8` | ID 8% more expensive | Penalty for late adjustments |
| `-5` | ID 5% cheaper | Incentive for ID trading |

Example with 8% spread and MCP = 450 ZAR/MWh:
- DA Price: 450 ZAR/MWh
- ID Price: 486 ZAR/MWh (+8%)

### Round Results Output

The `da_id_breakdown` object in round results contains:

```json
{
  "is_consumer": false,
  "da_volume_mwh": 1200.0,
  "id_delta_mwh": 150.0,
  "final_volume_mwh": 1350.0,
  "da_price_zar": 450.0,
  "id_price_zar": 486.0,
  "id_price_spread_percent": 8,
  "da_revenue_zar": 540000,
  "id_revenue_zar": 72900,
  "total_revenue_zar": 612900,
  "has_baseline": true,
  "daily_summary": [
    {"day": 1, "da_mwh": 400, "id_mwh": 450, "delta_mwh": 50},
    {"day": 2, "da_mwh": 400, "id_mwh": 450, "delta_mwh": 50},
    {"day": 3, "da_mwh": 400, "id_mwh": 450, "delta_mwh": 50}
  ]
}
```

---

## References

- Energy Market Clearing: ISO/RTO market mechanisms
- Imbalance Settlement: Based on European balancing markets
- Grid Constraints: Available Transfer Capacity (ATC) methodology
- Device Ramping: NERC/ERCOT generator operating characteristics

---

**For questions or clarifications, contact the development team or refer to the source code in:**
- `backend/app/engine.py` - Core calculation engine
- `backend/app/player.py` - Forecast submission endpoint
- `backend/app/sessions.py` - DA/ID breakdown in round results
- `backend/app/device_types.py` - Device constraint validation

---

**End of Document**
