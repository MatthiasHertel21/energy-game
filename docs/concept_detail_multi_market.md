# Multi-Market System: Day-Ahead & Intraday Markets
**Design Concept & Implementation Roadmap**

**Version:** 2.0  
**Date:** 23. Dezember 2025  
**Status:** Partially Implemented

---

## Implementation Status (Sprint 24)

### ✅ Completed Features

| Feature | Status | Details |
|---------|--------|---------|
| DA Baseline Storage | ✅ Done | `is_da_baseline` column in forecasts table |
| Gate Closure Logic | ✅ Done | 12:00 commits forecast for next calendar day |
| Multi-Day DA Tracking | ✅ Done | `da_baseline_hours` JSON with start/end |
| Chart Zone Visualization | ✅ Done | LOCKED/DA/ID/FUTURE zones with colors |
| Round Results DA/ID Breakdown | ✅ Done | 4 cards + daily accordion |
| Consumer Support | ✅ Done | Signed volumes, adapted labels |
| ID Price Spread | ✅ Done | `id_price_spread_percent` config |
| Market Breakdown in Evaluation | ✅ Done | Final session statistics |

### ⏳ Pending Features

| Feature | Priority | Notes |
|---------|----------|-------|
| Separate DA/ID Tables | Medium | Currently using forecasts.is_da_baseline |
| Delta-based ID Tracking | Medium | Currently absolute forecasts |
| Imbalance vs Cumulative Position | Low | Currently vs dispatch |

---

## 1. Executive Summary

### 1.1 Problem Statement
The current implementation does NOT reflect real-world energy market operations:
- **Missing market separation**: No distinction between Day-Ahead (DA) and Intraday (ID) markets
- **No position tracking**: Each round treats forecasts as absolute, not as deltas
- **Wrong imbalance calculation**: Imbalance calculated against last round's dispatch instead of cumulative DA+ID position
- **No gate closure concept**: Players can change entire forecast each round without market-specific constraints

### 1.2 Business Impact
- **Educational value compromised**: Players don't learn real market mechanics
- **Unrealistic risk modeling**: No understanding of DA commitment vs ID flexibility
- **Missing trading strategy**: No incentive to optimize DA vs ID bidding

### 1.3 Target State
Implement a realistic 2-market system:
1. **Day-Ahead Market (Round 1)**: Binding commitment for next day delivery
2. **Intraday Markets (Round 2+)**: Delta trading to adjust DA position
3. **Balancing Settlement**: Imbalance against cumulative DA+ID position
4. **Gate Closure**: Progressive locking of trading windows

---

## 2. Market Design

### 2.1 Round-to-Market Mapping

| Round | Market Type | Trading Window | Commitment Type | Example |
|-------|------------|----------------|-----------------|---------|
| 1 | Day-Ahead (DA) | Full horizon (24h) | Absolute volume | "I will deliver 100 MWh at 08:00" |
| 2 | Intraday 1 (ID1) | Next 18h | Delta vs DA | "Change DA position by +20 MWh" |
| 3 | Intraday 2 (ID2) | Next 12h | Delta vs (DA+ID1) | "Change position by -10 MWh" |
| 4 | Intraday 3 (ID3) | Next 6h | Delta vs cumulative | "Final adjustment +5 MWh" |

### 2.2 Position Accumulation

```
Delivery Hour: Tuesday 08:00

Round 1 (DA):  Player bids 100 MWh → DA Position = 100 MWh
Round 2 (ID1): Player adjusts to 120 MWh → Delta = +20 MWh → Position = 100 + 20 = 120 MWh
Round 3 (ID2): Player adjusts to 115 MWh → Delta = -5 MWh → Position = 120 - 5 = 115 MWh
Delivery:      Actual output = 110 MWh → Imbalance = 110 - 115 = -5 MWh (under-delivery)
```

### 2.3 Market Characteristics

#### Day-Ahead Market
- **Gate Closure**: 12:00 D-1 (day before delivery)
- **Delivery Window**: Full next day (00:00 - 24:00)
- **Liquidity**: Highest volume, most competitive pricing
- **Binding**: Positions are locked and tradeable only via ID

#### Intraday Markets
- **Gate Closure**: Progressive (6h, 3h, 1h before delivery)
- **Delivery Window**: Remaining hours only
- **Liquidity**: Lower volume, higher volatility
- **Purpose**: Risk management, forecast updates, portfolio balancing

---

## 3. Data Model Changes

### 3.1 New Database Tables

#### `player_da_positions`
Stores Day-Ahead market commitments (Round 1 only)

```sql
CREATE TABLE player_da_positions (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(50),
    hour_index INTEGER NOT NULL,  -- Absolute hour index (0-based from session start)
    position_mwh DECIMAL(10, 3) NOT NULL,  -- DA committed volume
    price_bid DECIMAL(10, 2),  -- Price at which bid was submitted
    price_cleared DECIMAL(10, 2),  -- Market clearing price
    dispatched_mwh DECIMAL(10, 3),  -- Actually dispatched volume
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, player_id, device_id, hour_index)
);
```

#### `player_id_positions`
Stores Intraday market deltas (Round 2+)

```sql
CREATE TABLE player_id_positions (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    round_num INTEGER NOT NULL,  -- Which ID round (2, 3, 4...)
    device_id VARCHAR(50),
    hour_index INTEGER NOT NULL,
    delta_mwh DECIMAL(10, 3) NOT NULL,  -- Delta vs previous position (can be negative)
    price_bid DECIMAL(10, 2),
    price_cleared DECIMAL(10, 2),
    dispatched_mwh DECIMAL(10, 3),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, player_id, round_num, device_id, hour_index)
);
```

#### `player_cumulative_positions` (Materialized View)
Fast lookup for total position at any point

```sql
CREATE MATERIALIZED VIEW player_cumulative_positions AS
SELECT 
    session_id,
    player_id,
    device_id,
    hour_index,
    da_position,
    SUM(id_delta) as total_id_delta,
    da_position + SUM(id_delta) as cumulative_position_mwh
FROM (
    -- DA positions
    SELECT session_id, player_id, device_id, hour_index, 
           position_mwh as da_position, 0 as id_delta
    FROM player_da_positions
    
    UNION ALL
    
    -- ID deltas
    SELECT session_id, player_id, device_id, hour_index,
           0 as da_position, delta_mwh as id_delta
    FROM player_id_positions
) combined
GROUP BY session_id, player_id, device_id, hour_index, da_position;
```

### 3.2 Schema for `forecasts` Table Extension

Add market type tracking to existing forecasts:

```sql
ALTER TABLE forecasts ADD COLUMN market_type VARCHAR(10);  -- 'DA' or 'ID'
ALTER TABLE forecasts ADD COLUMN is_delta BOOLEAN DEFAULT FALSE;  -- TRUE for ID rounds
```

---

## 4. Backend Architecture

### 4.1 New Engine Functions

#### `determine_market_type(round_num: int) -> str`
```python
def determine_market_type(round_num: int) -> str:
    """
    Determine if this round is Day-Ahead or Intraday market.
    
    Args:
        round_num: Current round number (1-based)
    
    Returns:
        'DA' if round 1, 'ID' otherwise
    """
    return 'DA' if round_num == 1 else 'ID'
```

#### `compute_position_delta(session_id, player_id, device_id, current_forecast, round_num) -> dict`
```python
def compute_position_delta(
    session_id: int,
    player_id: int, 
    device_id: str,
    current_forecast: List[float],
    round_num: int
) -> Dict[int, float]:
    """
    Calculate delta between current forecast and previous cumulative position.
    
    For Round 1 (DA): Returns forecast as-is (absolute position)
    For Round 2+ (ID): Returns delta vs (DA + all previous ID)
    
    Returns:
        Dict mapping hour_index to delta_mwh
    """
    if round_num == 1:
        # Day-Ahead: forecast is absolute
        return {i: val for i, val in enumerate(current_forecast)}
    
    # Intraday: calculate delta
    previous_position = get_cumulative_position(session_id, player_id, device_id)
    deltas = {}
    for hour_idx, forecast_val in enumerate(current_forecast):
        prev_val = previous_position.get(hour_idx, 0.0)
        deltas[hour_idx] = forecast_val - prev_val
    
    return deltas
```

#### `get_cumulative_position(session_id, player_id, device_id) -> dict`
```python
def get_cumulative_position(
    session_id: int,
    player_id: int,
    device_id: str
) -> Dict[int, float]:
    """
    Get current cumulative position (DA + all ID rounds so far).
    
    Returns:
        Dict mapping hour_index to cumulative_position_mwh
    """
    # Query player_cumulative_positions materialized view
    # or compute on-the-fly from DA + ID tables
    pass
```

### 4.2 Modified `run_round()` Function

```python
def run_round(
    session_id: int,
    round_num: int,
    players: List[int],
    forecasts: Dict[int, dict],
    config: dict,
    mode: str = "shared_market",
    seed: Optional[str] = None
) -> dict:
    """
    Enhanced with DA/ID market separation.
    """
    market_type = determine_market_type(round_num)
    
    # Step 1: Convert forecasts to positions/deltas
    player_positions = {}
    for player_id, forecast_data in forecasts.items():
        if market_type == 'DA':
            # Round 1: Store as DA positions
            player_positions[player_id] = store_da_positions(
                session_id, player_id, forecast_data
            )
        else:
            # Round 2+: Calculate deltas and store as ID positions
            deltas = compute_position_deltas(
                session_id, player_id, forecast_data, round_num
            )
            player_positions[player_id] = store_id_positions(
                session_id, player_id, round_num, deltas
            )
    
    # Step 2: Build market curves based on cumulative positions
    cumulative_positions = get_all_cumulative_positions(session_id, players)
    
    # Step 3: Market clearing (same as before, but with cumulative positions)
    supply, supply_bids = build_supply_from_positions(
        cumulative_positions, config
    )
    demand, demand_bids = build_demand_from_positions(
        cumulative_positions, config
    )
    
    # ... rest of clearing logic
    
    # Step 4: Calculate imbalance against cumulative position (not round dispatch)
    for player_id in players:
        cumulative_pos = cumulative_positions[player_id]
        actual_delivery = get_actual_delivery(player_id)  # from config/stochastic
        imbalance = actual_delivery - cumulative_pos
        # ... imbalance settlement
```

### 4.3 Gate Closure Logic

```python
def get_tradeable_hours(round_num: int, current_round_start_hour: int, horizon_hours: int) -> List[int]:
    """
    Determine which hours are still tradeable in this round.
    
    Round 1 (DA): All future hours (full horizon)
    Round 2+ (ID): Only hours beyond gate closure window
    
    Returns:
        List of hour indices that can be traded
    """
    if round_num == 1:
        # DA: all hours in horizon
        return list(range(horizon_hours))
    
    # ID: progressive gate closure
    # Example: ID1 can trade h+6 and beyond, ID2 can trade h+3 and beyond
    gate_closure_hours = {
        2: 6,   # ID1: 6h gate closure
        3: 3,   # ID2: 3h gate closure
        4: 1    # ID3: 1h gate closure
    }
    
    min_hour = gate_closure_hours.get(round_num, 0)
    return list(range(min_hour, horizon_hours))
```

---

## 5. Frontend Changes

### 5.1 Player Interface Modifications

#### Round 1 (DA Market)
```
╔══════════════════════════════════════════════════════════════╗
║  DAY-AHEAD MARKET (Round 1)                                  ║
║  Submit your binding commitment for tomorrow's delivery       ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  [Chart showing absolute forecast values]                   ║
║                                                              ║
║  These values will become your DA Position after submission  ║
║                                                              ║
║  ⚠️ DA positions cannot be cancelled, only adjusted via ID   ║
╚══════════════════════════════════════════════════════════════╝
```

#### Round 2+ (ID Market)
```
╔══════════════════════════════════════════════════════════════╗
║  INTRADAY MARKET (Round 2)                                   ║
║  Adjust your position by trading deltas                      ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Current Position (DA + ID1):                                ║
║  [Chart showing locked DA base + editable delta layer]       ║
║                                                              ║
║  ■ Grey bars: DA Position (locked)                          ║
║  ■ Blue bars: Your delta adjustment (editable)              ║
║  ■ Green line: Resulting total position                     ║
║                                                              ║
║  Gate Closed: Hours 0-6 (delivery imminent)                 ║
║  Tradeable: Hours 7-24                                       ║
╚══════════════════════════════════════════════════════════════╝
```

### 5.2 New React Components

#### `<DAForecastEditor />`
- Absolute value input
- Warning banner about binding commitment
- Validation against device capacity

#### `<IDDeltaEditor />`
- Base position display (read-only)
- Delta input controls (+/- from base)
- Cumulative position preview
- Gate closure visual indicators

#### `<PositionSummary />`
- DA position breakdown
- ID delta history
- Cumulative position per hour
- Imbalance risk indicator

### 5.3 State Management Changes

```javascript
// New state structure for Player.jsx
const [positions, setPositions] = useState({
  da: {},        // DA positions by device/hour (locked after R1)
  id: {},        // ID deltas by round/device/hour
  cumulative: {} // Computed cumulative position
})

const [marketType, setMarketType] = useState('DA')  // 'DA' or 'ID'
const [tradeableHours, setTradeableHours] = useState([])
```

---

## 6. API Changes

### 6.1 New Endpoints

#### `GET /api/player/positions/:session_id`
Returns player's complete position structure

**Response:**
```json
{
  "da_positions": {
    "device_1": [100, 100, 100, ...],  // 24 hours
    "device_2": [50, 50, 50, ...]
  },
  "id_deltas": {
    "2": {  // Round 2 deltas
      "device_1": [0, 0, 20, 0, ...],
      "device_2": [0, -10, 0, 0, ...]
    },
    "3": {  // Round 3 deltas
      "device_1": [0, 0, -5, 0, ...]
    }
  },
  "cumulative_positions": {
    "device_1": [100, 100, 115, 115, ...],  // DA + all ID deltas
    "device_2": [50, 40, 40, 40, ...]
  },
  "tradeable_hours": [6, 7, 8, ..., 23],  // Based on gate closure
  "market_type": "ID"
}
```

#### `POST /api/player/forecast`
Modified to handle DA vs ID submission

**Request (Round 1 - DA):**
```json
{
  "session_id": 123,
  "round_num": 1,
  "market_type": "DA",
  "devices": [
    {
      "device_id": "device_1",
      "hours": [100, 100, 100, ...]  // Absolute values
    }
  ],
  "bids": {
    "device_1": {
      "A": {"price": 350, "hours": [50, 50, 50, ...]},
      "B": {"price": 400, "hours": [30, 30, 30, ...]},
      "C": {"price": 480, "hours": [20, 20, 20, ...]}
    }
  }
}
```

**Request (Round 2+ - ID):**
```json
{
  "session_id": 123,
  "round_num": 2,
  "market_type": "ID",
  "devices": [
    {
      "device_id": "device_1",
      "hours": [100, 100, 120, 120, ...],  // New absolute forecast (backend calculates delta)
      "is_delta": false  // Frontend sends absolute, backend converts to delta
    }
  ],
  "bids": {
    "device_1": {
      "A": {"price": 350, "hours": [50, 50, 60, ...]},  // Adjusted absolute volumes
      "B": {"price": 400, "hours": [30, 30, 35, ...]},
      "C": {"price": 480, "hours": [20, 20, 25, ...]}
    }
  }
}
```

### 6.2 Modified Endpoints

#### `GET /api/sessions/:id/results/:round`
Enhanced with position breakdown

**New fields in response:**
```json
{
  "round_kpis": {
    "player_1": {
      "da_position_mwh": 2400,      // NEW: DA commitment
      "id_delta_mwh": 120,           // NEW: ID adjustments this round
      "cumulative_position_mwh": 2520, // NEW: Total position
      "dispatched_mwh": 2500,
      "actual_mwh": 2480,
      "imbalance_mwh": -20,          // vs cumulative position!
      "da_revenue_zar": 840000,      // NEW: Revenue from DA market
      "id_revenue_zar": 48000,       // NEW: Revenue from ID market
      "imbalance_cost_zar": 16000
    }
  }
}
```

---

## 7. Migration Strategy

### 7.1 Database Migration

**Phase 1: Schema Creation**
```sql
-- Create new tables (see section 3.1)
-- Add new columns to forecasts table
-- Create indexes for performance
```

**Phase 2: Data Migration for Existing Sessions**
```sql
-- Option A: Mark all existing sessions as "legacy mode"
UPDATE sessions SET market_mode = 'legacy' WHERE created_at < '2025-12-22';

-- Option B: Migrate existing forecasts to DA positions (if feasible)
INSERT INTO player_da_positions (session_id, player_id, device_id, hour_index, position_mwh)
SELECT session_id, user_id, 'default_device', hour_index, forecast_value
FROM forecasts
WHERE round_num = 1;
```

### 7.2 Backward Compatibility

**Feature Flag:** `multi_market_enabled`
```python
# In config/scenario definition
{
  "market": {
    "enable_player_bidding": true,
    "multi_market_enabled": true,  # NEW: Enable DA/ID separation
    "legacy_mode": false            # NEW: Fall back to old behavior
  }
}
```

**Engine behavior:**
```python
if config.get("market", {}).get("multi_market_enabled", False):
    # New DA/ID logic
    return run_round_multi_market(...)
else:
    # Legacy: current single-market logic
    return run_round_legacy(...)
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

**New test files:**
- `test_multi_market.py`: Core market separation logic
- `test_position_tracking.py`: DA/ID position accumulation
- `test_delta_calculation.py`: Forecast delta computation
- `test_gate_closure.py`: Tradeable hours logic

**Example test case:**
```python
def test_id_delta_calculation():
    """Test that ID round correctly calculates delta vs DA position"""
    # Setup: Player has DA position of 100 MWh
    da_position = {'device_1': [100] * 24}
    store_da_positions(session_id=1, player_id=1, positions=da_position)
    
    # Round 2: Player submits forecast of 120 MWh
    id_forecast = {'device_1': [120] * 24}
    deltas = compute_position_delta(
        session_id=1, player_id=1, 
        forecast=id_forecast, round_num=2
    )
    
    # Assert: Delta should be +20 MWh
    assert deltas['device_1'][0] == 20.0
    
    # Cumulative position should be 120 MWh
    cumulative = get_cumulative_position(session_id=1, player_id=1)
    assert cumulative['device_1'][0] == 120.0
```

### 8.2 Integration Tests

**Scenario: 3-round DA/ID flow**
```python
def test_multi_round_position_accumulation():
    """Test position accumulation across DA + 2 ID rounds"""
    
    # Round 1 (DA): Submit 100 MWh
    submit_forecast(round=1, values=[100]*24)
    assert get_da_position()[0] == 100
    
    # Round 2 (ID1): Adjust to 120 MWh
    submit_forecast(round=2, values=[120]*24)
    assert get_id_delta(round=2)[0] == 20
    assert get_cumulative_position()[0] == 120
    
    # Round 3 (ID2): Adjust to 115 MWh
    submit_forecast(round=3, values=[115]*24)
    assert get_id_delta(round=3)[0] == -5
    assert get_cumulative_position()[0] == 115
    
    # Delivery: Actual = 110 MWh
    # Imbalance should be vs 115 (not vs last dispatch)
    imbalance = calculate_imbalance(actual=110)
    assert imbalance == -5  # Under-delivery vs cumulative position
```

### 8.3 E2E Tests (Cypress)

```javascript
describe('Multi-Market Flow', () => {
  it('should handle DA submission in Round 1', () => {
    // Navigate to session in Round 1
    cy.visit('/player?session=99')
    
    // Should show DA market UI
    cy.contains('DAY-AHEAD MARKET').should('be.visible')
    cy.contains('binding commitment').should('be.visible')
    
    // Submit forecast
    cy.get('input[label="h1"]').type('100')
    cy.contains('Submit Round 1').click()
    
    // Should store as DA position
    cy.wait('@submitDA').its('request.body').should('deep.include', {
      market_type: 'DA',
      round_num: 1
    })
  })
  
  it('should handle ID delta submission in Round 2', () => {
    // Advance to Round 2
    cy.visit('/player?session=99&round=2')
    
    // Should show ID market UI
    cy.contains('INTRADAY MARKET').should('be.visible')
    cy.contains('Adjust your position').should('be.visible')
    
    // Should display DA position (locked)
    cy.get('.da-position-bar').should('have.attr', 'data-value', '100')
    
    // Submit adjustment
    cy.get('input[label="h1"]').clear().type('120')
    cy.contains('Submit Round 2').click()
    
    // Backend should calculate delta = +20
    cy.wait('@submitID').then(xhr => {
      // Frontend sends absolute, backend converts to delta
      expect(xhr.request.body.devices[0].hours[0]).to.equal(120)
    })
  })
})
```

---

## 9. Implementation Roadmap

### Phase 1: Foundation (Week 1)
**Goal:** Database schema + basic position tracking

- [ ] Create DB migration for new tables
- [ ] Implement `player_da_positions` table
- [ ] Implement `player_id_positions` table
- [ ] Create materialized view for cumulative positions
- [ ] Add `market_type` column to forecasts table
- [ ] Write unit tests for position storage/retrieval

**Deliverable:** DB schema deployed, basic CRUD operations working

### Phase 2: Backend Core Logic (Week 2)
**Goal:** DA/ID separation in engine.py

- [ ] Implement `determine_market_type()`
- [ ] Implement `compute_position_delta()`
- [ ] Implement `get_cumulative_position()`
- [ ] Implement `store_da_positions()`
- [ ] Implement `store_id_positions()`
- [ ] Modify `run_round()` to support market types
- [ ] Implement gate closure logic
- [ ] Write unit tests for delta calculation

**Deliverable:** Engine can process DA and ID rounds separately

### Phase 3: API Layer (Week 2-3)
**Goal:** Expose position data via REST API

- [ ] Create `GET /api/player/positions/:session_id` endpoint
- [ ] Modify `POST /api/player/forecast` to handle market types
- [ ] Enhance `GET /api/sessions/:id/results/:round` with position breakdown
- [ ] Add validation for gate closure (reject trades on locked hours)
- [ ] Write integration tests for API endpoints

**Deliverable:** Frontend can fetch/submit position data

### Phase 4: Frontend UI (Week 3-4)
**Goal:** Player interface for DA/ID markets

- [ ] Create `<DAForecastEditor />` component
- [ ] Create `<IDDeltaEditor />` component
- [ ] Create `<PositionSummary />` component
- [ ] Add market type detection in Player.jsx
- [ ] Implement position state management
- [ ] Add visual indicators for gate closure
- [ ] Update ForecastChartEditor for position layers
- [ ] Write Cypress E2E tests

**Deliverable:** Complete player workflow from DA to ID rounds

### Phase 5: Results & Analytics (Week 4-5)
**Goal:** Enhanced results display with position breakdown

- [ ] Update round results to show DA vs ID revenue
- [ ] Add position history visualization
- [ ] Update leaderboard to reflect multi-market strategy
- [ ] Create admin view for position monitoring
- [ ] Add export functionality for position data

**Deliverable:** Complete transparency of DA/ID trading activity

### Phase 6: Testing & Documentation (Week 5)
**Goal:** Comprehensive testing + migration path

- [ ] Complete unit test coverage (>80%)
- [ ] Complete integration test suite
- [ ] Complete E2E test scenarios
- [ ] Write migration guide for existing sessions
- [ ] Update player handbook with DA/ID explanation
- [ ] Create trainer guide for multi-market scenarios

**Deliverable:** Production-ready system with full documentation

### Phase 7: Deployment & Rollout (Week 5-6)
**Goal:** Safe production deployment

- [ ] Deploy to staging environment
- [ ] Run migration on test database
- [ ] Conduct user acceptance testing
- [ ] Create feature flag rollout plan
- [ ] Monitor performance (DB query optimization)
- [ ] Gradual rollout to production sessions

**Deliverable:** Live multi-market system

---

## 10. Risk Assessment

### 10.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| DB migration breaks existing sessions | HIGH | MEDIUM | Feature flag, backward compatibility mode |
| Performance degradation (complex queries) | MEDIUM | HIGH | Materialized views, indexes, query optimization |
| Frontend state management complexity | MEDIUM | MEDIUM | Gradual refactoring, thorough testing |
| Position calculation errors | HIGH | MEDIUM | Extensive unit tests, audit logging |

### 10.2 UX Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Players confused by delta concept | HIGH | HIGH | Clear UI labels, tutorial/handbook updates |
| Frustration with gate closure | MEDIUM | MEDIUM | Visual indicators, warning messages |
| Difficulty understanding position layers | MEDIUM | MEDIUM | Simplified visualization, tooltips |

### 10.3 Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking existing campaigns mid-session | HIGH | LOW | Legacy mode for old sessions |
| Training disruption during rollout | MEDIUM | MEDIUM | Phased rollout, trainer communication |
| Resistance to change from trainers | MEDIUM | LOW | Early stakeholder involvement, benefits demo |

---

## 11. Success Metrics

### 11.1 Technical Metrics
- [ ] Position calculation accuracy: 100% (no errors in cumulative position)
- [ ] API response time: <200ms for position queries
- [ ] DB query performance: <50ms for cumulative position lookup
- [ ] Test coverage: >85% for new code

### 11.2 User Metrics
- [ ] Player confusion rate: <10% (support tickets about DA/ID)
- [ ] Forecast submission success rate: >95%
- [ ] Player engagement with ID rounds: >80% (not skipping ID rounds)

### 11.3 Educational Metrics
- [ ] Post-game survey: "Understanding of DA/ID markets" >4.0/5.0
- [ ] Trainer feedback: Improved realism score >4.5/5.0

---

## 12. Open Questions

1. **ID Market Pricing**: Should ID markets have different price volatility than DA?
   - **Proposal**: Add volatility multiplier (e.g., ID price range ±20% wider than DA)

2. **Negative Bids**: Should we allow negative prices in ID market for surplus disposal?
   - **Proposal**: Yes, set floor at -500 ZAR/MWh

3. **Cross-Device Trading**: Can players trade delta from one device to another?
   - **Proposal**: Phase 2 feature (keep device-specific for MVP)

4. **ID Round Frequency**: Should we support multiple ID rounds in same time window?
   - **Proposal**: Start with fixed sequence (1 DA + 3 ID), make configurable later

5. **Position Netting**: Should we allow portfolio netting across devices?
   - **Proposal**: Phase 2 feature (keep separate for MVP)

6. **Historical Position View**: How far back should players see their position history?
   - **Proposal**: Full session history, with drill-down by round

---

## 13. Appendix

### 13.1 Glossary

- **DA (Day-Ahead)**: Market for next-day delivery commitments, clearing at 12:00 D-1
- **ID (Intraday)**: Market for same-day delivery adjustments, continuous trading until gate closure
- **Position**: Cumulative volume commitment for a specific delivery hour
- **Delta**: Change in position relative to previous commitment
- **Gate Closure**: Deadline after which trading is no longer possible for a delivery hour

---

## 14. Current Implementation Details (Sprint 24)

### 14.1 DA Baseline Storage

The DA baseline is stored in the existing `forecasts` table with additional columns:

```python
# In models.py
class Forecast(db.Model):
    is_da_baseline = db.Column(db.Boolean, default=False)
    # data["da_baseline_hours"] = {"start": 0, "end": 24}  # Hours 0-23 for Day 1
```

### 14.2 Gate Closure Logic

Gate closure is determined by scenario config and current simulation time:

```python
# In player.py - da_baseline endpoint
day_ahead_gate_hour = config.get("day_ahead_gate_hour", 12)  # Default: 12:00
current_hour = round_num * round_span_hours

# Calculate which day's baseline to create
if round_num == 1:
    # Round 1: DA for Day 1 (hours 0-24)
    da_start, da_end = 0, 24
else:
    # Check if we're crossing a gate
    gate_hours = [h for h in range(day_ahead_gate_hour, forecast_horizon_hours, 24)]
    for gate_hour in gate_hours:
        if current_hour >= gate_hour and previous_hour < gate_hour:
            # Gate crossed: create DA for next day
            day = (gate_hour // 24) + 1
            da_start = day * 24
            da_end = (day + 1) * 24
```

### 14.3 Round Results DA/ID Breakdown

The round-results endpoint calculates:

```python
# In sessions.py
da_volume_signed = sum(v for v in da_hours)  # With sign (negative = consumer)
current_volume_signed = sum(v for v in current_hours)
id_delta_signed = current_volume_signed - da_volume_signed

# Price differentiation
id_price_spread = config.get("id_price_spread_percent", 0)
da_price = base_mcp
id_price = base_mcp * (1 + id_price_spread / 100)

# Revenue calculation
da_revenue = da_volume_signed * da_price
id_revenue = id_delta_signed * id_price
```

### 14.4 Frontend Display

The RoundResultsScreen shows:

1. **4 Summary Cards**: DA Volume, ID Delta, Final Position, ID Adjustment %
2. **Consumer Badge**: Rosa chip wenn `is_consumer = true`
3. **Price Display**: Separate DA/ID Preise mit Spread-Badge
4. **Daily Accordion**: Klappbare Tabelle mit Tag-für-Tag Aufschlüsselung

### 14.5 Configuration

```json
{
  "day_ahead_gate_hour": 12,
  "id_price_spread_percent": 8,
  "round_span_hours": 6,
  "forecast_horizon_hours": 72
}
```
- **Imbalance**: Difference between actual delivery and cumulative position
- **Dispatch**: Actual volume instructed by system operator (may differ from bid)

### 13.2 References

- Real-world market design: EPEX SPOT (European Power Exchange)
- ENTSO-E transparency platform: Market timings and gate closures
- Current codebase: `backend/app/engine.py`, `frontend/src/pages/Player.jsx`

### 13.3 Stakeholder Sign-off

| Role | Name | Approval | Date |
|------|------|----------|------|
| Product Owner | TBD | ☐ Approved ☐ Rejected | |
| Tech Lead | TBD | ☐ Approved ☐ Rejected | |
| Trainer Representative | TBD | ☐ Approved ☐ Rejected | |

---

**Next Steps:**
1. Review this concept with stakeholders
2. Prioritize open questions for resolution
3. Confirm roadmap timeline and resource allocation
4. Begin Phase 1 implementation after approval
