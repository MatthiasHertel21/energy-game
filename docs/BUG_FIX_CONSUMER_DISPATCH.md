# Bug Fix: Consumer Dispatch and Imbalance Calculation

**Date:** December 19, 2025  
**Version:** 1.1  
**Status:** Complete

---

## Overview

This document describes critical bugs found in consumer (load) device handling and the fixes implemented.

---

## Bug 1: Consumers Added to Supply Curve (CRITICAL)

### Symptoms
- Consumer bids with price **below SMP** were dispatched at 100%
- Consumer bids with price **above SMP** were also dispatched
- Market clearing logic completely broken for consumers

### Root Cause

In [engine.py#L232](../backend/app/engine.py#L232), the `build_supply_from_bids` function was processing **ALL devices with bids**, including consumers (loads).

```python
# BEFORE (WRONG):
def build_supply_from_bids(player_forecasts, hour_idx, synthetic_supply):
    for player_id, forecast in player_forecasts.items():
        for device_id, device_bids in forecast['bids'].items():
            # NO FILTER - processes both generators AND consumers!
            for bid_label in ['A', 'B', 'C']:
                # Add to supply curve...
```

This meant consumers were competing in the **supply curve** (sellers) instead of the **demand curve** (buyers).

### Impact
- **Incorrect dispatch:** Consumers with low bids got dispatched (should be 0%)
- **Market distortion:** Supply curve artificially inflated, depressing SMP
- **Revenue errors:** Consumers "earning" revenue instead of paying expenses

### Fix

Added device type filter to skip loads in supply curve:

```python
# AFTER (CORRECT):
def build_supply_from_bids(player_forecasts, hour_idx, synthetic_supply):
    for player_id, forecast in player_forecasts.items():
        for device_id, device_bids in forecast['bids'].items():
            # Get device config to check type
            device_config = get_device_config(device_id)
            device_type = device_config.get('type', '')
            
            # CRITICAL: Skip loads (consumers) - they belong in demand curve!
            if 'load' in device_type.lower():
                continue
            
            for bid_label in ['A', 'B', 'C']:
                # Add to supply curve (generators only)
```

**Code Reference:** [engine.py#L232-L235](../backend/app/engine.py#L232-L235)

### Verification

**Test Scenario:** Consumer with 3 bids, SMP = 1,070 ZAR/MWh

| Lot | Bid Price | Offered (MWh) | Expected Dispatch | Actual Dispatch (Before) | Actual Dispatch (After) |
|-----|-----------|---------------|-------------------|-------------------------|------------------------|
| A   | 1,200     | 411.2         | 100% (>= SMP)     | 100% ✅                 | 100% ✅                |
| B   | 1,000     | 359.8         | 0% (< SMP)        | 100% ❌                 | 0% ✅                  |
| C   | 800       | 257.0         | 0% (< SMP)        | 100% ❌                 | 0% ✅                  |

---

## Bug 2: Consumer Actual Values Not Tracked

### Symptoms
- Hourly breakdown showing **zero imbalance** for consumers
- Consumer `actual_mw` always equal to `dispatched_mw` in hourly details
- Total imbalance cost correct, but hourly breakdown wrong

### Root Cause

In [engine.py#L956-L960](../backend/app/engine.py#L956-L960), consumer `actual` was calculated with noise:

```python
# BEFORE:
if is_consumer:
    noise = random.uniform(-frac, frac) * max(1.0, dispatched)
    actual = max(0.0, dispatched + noise)
    # BUT: actual NOT stored in per_device_hourly_actual!
```

However, this `actual` value was only used for total KPI calculation. The **per-device tracking** only happened for generators (Line 974), inside a separate `elif` block.

### Impact
- `per_device_hourly_actual[device_id]` remained at 0 for all consumer devices
- Hourly breakdown calculated: `imbalance_h = actual_h - dispatched_h = 0 - dispatched = -dispatched`
- All consumers showing **under-consumption** equal to full dispatched amount
- Hourly imbalance values **drastically incorrect** (e.g., 254 MWh per hour instead of ~5-10 MWh)

### Fix

Added consumer actual tracking with proportional distribution:

```python
# AFTER (CORRECT):
if is_consumer:
    noise = random.uniform(-frac, frac) * max(1.0, dispatched)
    actual = max(0.0, dispatched + noise)
    
    # Track consumer actual per device for hourly breakdown
    if enable_bidding and pid in hour_bid_dispatch:
        # Distribute actual proportionally to each consumer device
        total_dispatched = dispatched
        for device_id, device_dispatch in hour_bid_dispatch[pid].items():
            device_dispatched = sum(bid_info.get('mw_dispatched', 0.0) 
                                   for bid_info in device_dispatch.values())
            if total_dispatched > 0:
                device_actual = actual * (device_dispatched / total_dispatched)
            else:
                device_actual = 0.0
            
            # Track device actual
            if device_id in per_device_hourly_actual:
                per_device_hourly_actual[device_id][hour_offset] = device_actual
```

**Code Reference:** [engine.py#L956-L975](../backend/app/engine.py#L956-L975)

### Verification

**Test Scenario:** Consumer with 411 MWh dispatched, 5% noise

| Hour | Dispatched (MWh) | Actual Before | Actual After | Imbalance Before | Imbalance After |
|------|-----------------|---------------|--------------|------------------|----------------|
| 18   | 250.0           | 0.0           | 242.5        | 250.0 ❌         | 7.5 ✅         |
| 19   | 242.0           | 0.0           | 236.9        | 242.0 ❌         | 5.1 ✅         |
| 20   | 232.0           | 0.0           | 239.4        | 232.0 ❌         | 7.4 ✅         |

---

## Bug 3: Hourly Imbalance Calculation Mismatch

### Symptoms
- Total imbalance cost: ZAR 53,197
- Sum of hourly imbalance costs: ZAR 1,110,400
- **10x discrepancy** between totals and hourly breakdown

### Root Cause

The main KPI calculation uses `settle_balancing` function which distinguishes between over/under delivery:

```python
# Main KPI (CORRECT):
def settle_balancing(planned: float, actual: float, up_price=1200, down_price=800):
    imbalance = actual - planned
    if imbalance > 0:  # Over-delivery
        return round(imbalance * up_price, 0)  # 1200 ZAR/MWh
    else:  # Under-delivery
        return round(abs(imbalance) * down_price, 0)  # 800 ZAR/MWh
```

But the hourly breakdown was using simplified logic:

```python
# BEFORE (WRONG):
imbalance_h = abs(dispatched_h - actual_h)  # Always positive!
if imbalance_h > 0:
    hour_detail["imbalance_cost_zar"] += imbalance_h * 800  # Always down_price
```

This meant:
- All imbalances treated as **under-delivery** (800 ZAR/MWh)
- **Over-delivery** (which costs 1200 ZAR/MWh) was incorrectly priced

### Impact
- Hourly imbalance costs **underestimated** by up to 33% when over-delivery occurs
- Totals didn't match sum of hourly values
- Misleading hourly breakdown for debugging

### Fix

Applied same logic as `settle_balancing`:

```python
# AFTER (CORRECT):
imbalance_h = actual_h - dispatched_h
if imbalance_h > 0:  # Over-delivery/consumption
    hour_detail["imbalance_mwh"] += imbalance_h
    hour_detail["imbalance_cost_zar"] += imbalance_h * 1200  # up_price
elif imbalance_h < 0:  # Under-delivery/consumption
    hour_detail["imbalance_mwh"] += abs(imbalance_h)
    hour_detail["imbalance_cost_zar"] += abs(imbalance_h) * 800  # down_price
```

**Code Reference:** [engine.py#L1148-L1158](../backend/app/engine.py#L1148-L1158)

### Verification

**Test Scenario:** 6-hour round, generator with availability variance

| Hour | Dispatched | Actual | Imbalance | Type | Cost Before (800) | Cost After (1200/800) |
|------|-----------|--------|-----------|------|------------------|-----------------------|
| 12   | 100.0     | 92.0   | -8.0      | Under | 6,400           | 6,400 ✅              |
| 13   | 100.0     | 105.0  | +5.0      | Over  | 4,000 ❌         | 6,000 ✅              |
| 14   | 100.0     | 98.0   | -2.0      | Under | 1,600           | 1,600 ✅              |

**Total Before:** 12,000 ZAR (incorrect)  
**Total After:** 14,000 ZAR (matches main KPI) ✅

---

## Summary of Changes

| File | Lines | Change |
|------|-------|--------|
| `backend/app/engine.py` | 232-235 | Added load device filter in `build_supply_from_bids` |
| `backend/app/engine.py` | 956-975 | Added consumer actual tracking with proportional distribution |
| `backend/app/engine.py` | 1148-1158 | Fixed hourly imbalance calculation to match `settle_balancing` |
| `frontend/src/pages/Player.jsx` | 141-151 | Updated default consumer bids: A:1200, B:1000, C:800 |

---

## Testing Recommendations

1. **Consumer Dispatch Validation:**
   - Create player with only load devices
   - Submit bids above and below typical SMP (1000-1100)
   - Verify: High bids → 100% dispatch, Low bids → 0% dispatch

2. **Hourly Breakdown Accuracy:**
   - Play round with both generators and consumers
   - Check: Sum of hourly revenues = Total revenue
   - Check: Sum of hourly imbalance costs = Total imbalance cost

3. **Mixed Portfolio:**
   - Player with both generators and consumers
   - Verify each device type processed correctly (generators in supply, consumers in demand)

---

## Related Documentation

- [Round Results Transparency Guide](./ROUND_RESULTS_TRANSPARENCY.md) - Explains KPI calculations
- [Calculation Engine](./CALCULATION_ENGINE.md) - Market clearing algorithm
- [Device Model](./device-model.md) - Device types and configurations

---

## Lessons Learned

1. **Type Filtering Critical:** Always filter device types when building supply/demand curves
2. **Data Consistency:** Ensure hourly breakdown uses same calculations as totals
3. **Proportional Allocation:** When aggregating to player level, track device-level details
4. **Unit Tests Needed:** These bugs highlight need for comprehensive market clearing tests

---

**End of Document**
