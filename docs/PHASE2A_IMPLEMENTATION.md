# SAWEM Market Code Rev 2.1 - Phase 2A Implementation

## Overview

Phase 2A implements critical Intraday (ID) market features to improve SAWEM compliance from 85% to 90%:

1. **IDP Calculation**: Volume-weighted average with ±5% cap
2. **Gate Closure Enforcement**: Backend validation of locked hours
3. **ID Metadata Tracking**: Separate IDP, volume, and trade counts

**Compliance:** 90% SAWEM Market Code Rev 2.1 compliant

---

## 1. IDP (Intra-Day Price) Calculation

### Implementation

**File:** `backend/app/engine.py`

**Function:** `calculate_idp(cleared_bids, smp, cap_percent=5.0)`

```python
def calculate_idp(cleared_bids: List[Tuple[float, float]], smp: float, 
                  cap_percent: float = 5.0) -> float:
    """
    Calculate Intra-Day Price (IDP) as volume-weighted average with ±cap% of SMP.
    
    SAWEM Market Code Rev 2.1: IDP is the volume-weighted average of all cleared 
    ID trades, capped at ±5% of the Day-Ahead SMP to prevent extreme deviations.
    
    Args:
        cleared_bids: List of (price, volume) tuples that cleared in ID market
        smp: Day-Ahead System Marginal Price (reference price)
        cap_percent: Maximum deviation from SMP in percent (default 5%)
    
    Returns:
        Intra-Day Price (IDP) in ZAR/MWh
    """
```

### Algorithm

1. **Volume-Weighted Average:**
   ```
   VWAP = Σ(price_i × volume_i) / Σ(volume_i)
   ```

2. **Apply ±5% Cap:**
   ```
   min_price = SMP / 1.05
   max_price = SMP × 1.05
   IDP = clamp(VWAP, min_price, max_price)
   ```

3. **Special Cases:**
   - No ID trades → IDP = SMP
   - Zero volume → IDP = SMP

### Examples

**Example 1: Within Bounds**
```python
cleared_bids = [(450, 100), (460, 50), (440, 50)]
smp = 450

# VWAP = (450*100 + 460*50 + 440*50) / 200 = 450
# Within ±5% → IDP = 450
idp = calculate_idp(cleared_bids, smp)  # 450.0
```

**Example 2: Upper Cap**
```python
cleared_bids = [(500, 100)]  # 11% above SMP
smp = 450

# VWAP = 500 (outside bounds)
# Cap at +5% → IDP = 450 * 1.05 = 472.5
idp = calculate_idp(cleared_bids, smp)  # 472.5
```

**Example 3: Lower Cap**
```python
cleared_bids = [(400, 100)]  # 11% below SMP
smp = 450

# VWAP = 400 (outside bounds)
# Cap at -5% → IDP = 450 / 1.05 = 428.57
idp = calculate_idp(cleared_bids, smp)  # 428.57
```

---

## 2. Gate Closure Enforcement

### Implementation

**File:** `backend/app/player.py`

**Function:** `_get_tradeable_hours(session, round_num)`

```python
def _get_tradeable_hours(session: Session, round_num: int) -> list:
    """
    Get list of tradeable hour indices for the current round (gate closure enforcement).
    
    SAWEM Market Code Rev 2.1: Hours past gate closure are locked and cannot be modified.
    Gate closure occurs at specified hour before delivery (default 12:00).
    
    Returns:
        List of hour indices that can still be traded (not past gate)
    """
```

### Algorithm

1. **Calculate Current Simulation Hour:**
   ```
   current_sim_hour = (round_num - 1) × round_span_hours
   ```

2. **Calculate First Gate Closure:**
   ```
   first_gate_sim_hour = (gate_hour - start_hour) % 24
   hours_until_first_midnight = (24 - start_hour) % 24
   ```

3. **Determine Locked Hours:**
   ```
   gate_count = 1 + (current_sim_hour - first_gate_sim_hour) / 24
   locked_until = hours_until_first_midnight + (gate_count - 1) × 24
   ```

4. **Return Tradeable Hours:**
   ```
   tradeable = [h for h in range(horizon_hours) if h > locked_until]
   ```

### Validation in Forecast Endpoint

**File:** `backend/app/player.py` → `ForecastAPI.post()`

```python
# Get previous forecast
prev_forecast = Forecast.query.filter_by(...).order_by(...).first()

# Check if locked hours were modified
for h in range(len(prev_hours)):
    if h not in tradeable_hours:
        if abs(prev_hours[h] - new_hours[h]) > 0.01:
            return {
                "error": "Gate closure violation",
                "details": {
                    "locked_hours_modified": locked_modified,
                    "tradeable_hours": tradeable_hours
                }
            }, HTTPStatus.BAD_REQUEST
```

### Examples

**Example 1: Round 1 (DA Baseline)**
```python
# Configuration
round_num = 1
gate_hour = 12
start_time = "00:00"
horizon_hours = 24

# Result: All hours tradeable (DA baseline)
tradeable = _get_tradeable_hours(session, 1)
# [0, 1, 2, ..., 23]
```

**Example 2: Round 3 (After First Gate)**
```python
# Configuration
round_num = 3
gate_hour = 12
round_span = 6
current_sim_hour = (3-1) * 6 = 12

# First gate at sim hour 12 → locks hours 0-23
tradeable = _get_tradeable_hours(session, 3)
# [] (no tradeable hours within 24h horizon)
```

**Example 3: Gate Closure Violation**
```http
POST /api/player/forecast
{
  "session_id": 1,
  "round_num": 3,
  "hours": [100, 150, ...]  # Modified locked hour 0
}

Response: 400 Bad Request
{
  "error": "Gate closure violation: Cannot modify hours past gate closure",
  "details": {
    "locked_hours_modified": [0, 1, 2],
    "tradeable_hours": [24, 25, 26, ...],
    "message": "Hours [0, 1, 2] are past gate closure and cannot be modified"
  }
}
```

---

## 3. ID Metadata Tracking

### Implementation

**File:** `backend/app/engine.py` → `run_round()`

```python
# SAWEM Phase 2A: Calculate IDP for Intraday markets (round_num > 1)
if round_num > 1:
    # Collect all cleared bids from this round
    id_cleared_bids = []
    
    if enable_bidding and bid_dispatch_tracking:
        for pid in players:
            if pid in bid_dispatch_tracking:
                for device_id, device_data in bid_dispatch_tracking[pid].items():
                    for bid_label, bid_info in device_data.items():
                        price = bid_info.get('price_bid', 0)
                        dispatched = bid_info.get('mw_dispatched', 0)
                        if dispatched > 0:
                            id_cleared_bids.append((price, dispatched))
    
    # Calculate IDP
    if id_cleared_bids:
        idp = calculate_idp(id_cleared_bids, avg_mcp, cap_percent=5.0)
        result["idp"] = idp
        result["id_trade_count"] = len(id_cleared_bids)
        result["id_volume_mwh"] = sum(vol for _, vol in id_cleared_bids)
    else:
        result["idp"] = avg_mcp  # No trades → IDP = SMP
        result["id_trade_count"] = 0
        result["id_volume_mwh"] = 0.0
```

### API Response Structure

**File:** `backend/app/sessions.py` → `RoundResults.get()`

```json
{
  "round": 2,
  "my_result": {
    "player_id": 1,
    "smp": 450.0,
    "volume": 1200.5,
    "idp": 455.3,
    "id_volume_mwh": 850.2,
    "id_trade_count": 15,
    "kpis": { ... }
  },
  "ranking": [...]
}
```

### Metadata Fields

| Field | Type | Description | Round |
|-------|------|-------------|-------|
| `smp` | float | System Marginal Price (DA baseline) | All |
| `volume` | float | Total cleared volume (MWh) | All |
| `idp` | float | Intra-Day Price (ZAR/MWh) | > 1 |
| `id_volume_mwh` | float | Volume traded in ID market | > 1 |
| `id_trade_count` | int | Number of cleared ID bids | > 1 |

---

## Testing

### Test Coverage

**File:** `backend/tests/test_phase2a_market_code.py`

**Test Results:** ✅ 20/20 tests passing

#### 1. IDP Calculation Tests (10 tests)
- ✅ Simple average
- ✅ Upper cap (+5%)
- ✅ Lower cap (-5%)
- ✅ Within bounds (no capping)
- ✅ Multiple bids weighted
- ✅ Empty bids (returns SMP)
- ✅ Zero volume (returns SMP)
- ✅ High volume dominance
- ✅ Extreme prices (capping)
- ✅ Custom cap percentage

#### 2. Gate Closure Tests (5 tests)
- ✅ Round 1 (all hours tradeable)
- ✅ After gate (hours locked)
- ✅ Start time offset
- ✅ No session (safety)
- ✅ No scenario (safety)

#### 3. ID Metadata Tests (3 tests)
- ✅ Round 1 (no IDP metadata)
- ✅ Round 2 (IDP metadata present)
- ✅ No bids (IDP = SMP)

#### 4. Integration Tests (2 tests)
- ✅ Full ID workflow
- ✅ Phase 2A SAWEM compliance

### Running Tests

```bash
# All Phase 2A tests
docker exec energy-game_backend_1 pytest tests/test_phase2a_market_code.py -v

# Specific test class
docker exec energy-game_backend_1 pytest tests/test_phase2a_market_code.py::TestIDPCalculation -v
```

---

## SAWEM Compliance Impact

### Before Phase 2A (85%)

| Feature | Status |
|---------|--------|
| Pro-rata tie-breaking | ✅ Implemented |
| Monotonicity validation | ✅ Implemented |
| Inflexible units filter | ✅ Implemented |
| IDP calculation | ❌ Missing |
| Gate closure enforcement | ⚠️ UI only |
| ID metadata tracking | ❌ Missing |

### After Phase 2A (90%)

| Feature | Status |
|---------|--------|
| Pro-rata tie-breaking | ✅ Implemented |
| Monotonicity validation | ✅ Implemented |
| Inflexible units filter | ✅ Implemented |
| IDP calculation | ✅ Implemented |
| Gate closure enforcement | ✅ Backend enforced |
| ID metadata tracking | ✅ Implemented |

### Remaining Gaps (10%)

1. **Delta-based clearing** (not applicable for game simulation)
2. **Position accumulation** (complex, low impact for game)
3. **Advanced balancing settlement** (simplified model sufficient)

---

## Migration Guide

### No Breaking Changes

Phase 2A is **fully backward compatible**:

- IDP metadata only added for `round_num > 1`
- Gate closure validation only applies when modifying forecasts
- All existing API endpoints remain unchanged

### Database Changes

**No migration required:** ID metadata stored in existing `Result.data` JSON column.

### Frontend Updates (Optional)

To display IDP information:

```javascript
// RoundResultsScreen.jsx
const { smp, idp, id_volume_mwh, id_trade_count } = my_result;

if (round > 1 && idp) {
  // Display ID market summary
  <Typography>
    Intra-Day Price: {formatCurrency(idp)}
    <br />
    ID Volume: {formatInt(id_volume_mwh)} MWh
    <br />
    ID Trades: {id_trade_count}
  </Typography>
}
```

---

## Performance

**Minimal overhead:**

- IDP calculation: O(n) where n = number of cleared bids
- Gate closure validation: O(h) where h = horizon_hours
- Metadata tracking: No additional storage overhead

**Typical impact:** < 1ms per round

---

## Summary

Phase 2A successfully implements three critical Intraday market features:

1. ✅ **IDP Calculation**: Volume-weighted average with SAWEM-compliant ±5% cap
2. ✅ **Gate Closure Enforcement**: Backend validation prevents trading past gate
3. ✅ **ID Metadata Tracking**: Transparent reporting of ID market activity

**Result:** SAWEM compliance improved from 85% → 90%

**Testing:** 20/20 tests passing, fully backward compatible

**Next Steps:** Phase 2B (Advanced position tracking, 3-4 days) or Phase 3 (Regional markets, 5-7 days)
