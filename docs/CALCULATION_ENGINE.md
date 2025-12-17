# EMSG - Energy Market Calculation Engine Documentation

## Overview

This document describes the exact calculations performed when a player submits forecast data for a round in the Energy Market Simulation Game (EMSG). The engine computes market clearing price, dispatch, revenues, costs, and profits based on energy market principles.

**Version:** 1.2  
**Last Updated:** December 17, 2025

---

## Table of Contents

1. [Input Data](#input-data)
2. [Market Clearing Process](#market-clearing-process)
   - 2.1 [Synthetic Supply/Demand Generation](#synthetic-supply-demand-generation)
   - 2.2 [Multi-Bid Player Supply (Optional)](#multi-bid-player-supply)
   - 2.3 [Market Clearing Algorithm](#market-clearing-algorithm)
3. [Event Application](#event-application)
4. [Player Dispatch Calculation](#player-dispatch-calculation)
5. [Revenue Calculation](#revenue-calculation)
6. [Cost Components](#cost-components)
7. [Profit Calculation](#profit-calculation)
8. [Device Constraints Validation](#device-constraints-validation)
9. [Mathematical Formulas](#mathematical-formulas)
10. [Example Calculation](#example-calculation)

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

### Step 3: Market Clearing Algorithm

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

5. **Imbalance Settlement:** Uses fixed up/down prices. Real markets have dynamic balancing prices based on system frequency.

6. **Fuel Costs:** Currently zero. Will be device-specific (coal ~ZAR 200/MWh, gas ~ZAR 800/MWh, renewables ~ZAR 0/MWh).

7. **Transmission Losses:** Simplified as a percentage. Real losses depend on power flow magnitude and distance.

---

## Validation Checklist

When reviewing calculations, verify:

- ✅ Supply/demand curves are monotonic (supply ascending, demand descending)
- ✅ MCP is within [price_floor, price_cap]
- ✅ Dispatch factor ≤ 1.0
- ✅ Actual generation ≥ 0
- ✅ Curtailment ≥ 0
- ✅ Congestion ratio ∈ [0, 1]
- ✅ All monetary values rounded to nearest ZAR
- ✅ All energy values rounded to 3 decimal places (MWh)
- ✅ Device constraints satisfied before acceptance
- ✅ Events applied only for active rounds

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
- `backend/app/device_types.py` - Device constraint validation

---

**End of Document**
