# Round Results Transparency Guide

**Version:** 1.0  
**Date:** December 18, 2025  
**Status:** Complete

## Overview

This document explains how round results are calculated, how to interpret the detailed breakdown, and what to check if results appear inconsistent.

---

## 1. Player-Specific vs Market-Wide Costs

### ✅ Confirmed: Costs are Player-Specific

All costs (imbalance, curtailment, congestion) are calculated **per player**, not market-wide.

**Test Results:**
```
Multi-Player Scenario (Midday):
  Player 1 (Solar): Imbalance = 240,000 ZAR
  Player 2 (Wind):  Imbalance = 0 ZAR
  Player 3 (Load):  Imbalance = 0 ZAR (exempt)
```

### Consumer vs Generator Logic

**Consumers** (devices with `type` containing "load"):
- ✅ Pay for energy (negative revenue)
- ✅ Exempt from imbalance costs
- ✅ Exempt from curtailment costs
- ✅ `actual_mwh` = `dispatched_mwh` (no availability envelope)

**Generators** (all other device types):
- ✅ Earn revenue (positive revenue)
- ✅ Subject to imbalance costs (dispatched ≠ actual)
- ✅ Subject to curtailment costs (planned > dispatched)
- ✅ `actual_mwh` constrained by availability envelope

**Code Reference:** [engine.py](../backend/app/engine.py#L918-L927)

---

## 2. Detailed Hourly Breakdown

### New Field: `hourly_breakdown`

Each player's `round_kpis` now includes a `hourly_breakdown` array with per-hour details:

```json
{
  "round_kpis": {
    "1": {
      "planned_mwh": 600.0,
      "dispatched_mwh": 600.0,
      "actual_mwh": 5.0,
      "revenue_zar": 587340,
      "imbalance_cost_zar": 476000,
      "curtailment_cost_zar": 0,
      "profit_zar": 111340,
      "hourly_breakdown": [
        {
          "hour": 0,
          "mcp": 978.9,
          "planned_mw": 100.0,
          "dispatched_mw": 100.0,
          "actual_mw": 0.0,
          "revenue_zar": 97890.0,
          "imbalance_mwh": 100.0,
          "imbalance_cost_zar": 80000.0,
          "curtailment_mwh": 0.0,
          "curtailment_cost_zar": 0.0
        },
        // ... more hours
      ]
    }
  }
}
```

### Breakdown Fields

| Field | Description | Formula |
|-------|-------------|---------|
| `hour` | Hour index (0-23) | `round_num * span + offset` |
| `mcp` | Market Clearing Price | Hourly equilibrium price |
| `planned_mw` | Planned generation | Sum of device forecasts |
| `dispatched_mw` | Market-accepted | From bid dispatch |
| `actual_mw` | Delivered | `dispatched × availability` |
| `revenue_zar` | Revenue/Expense | `dispatched × mcp` |
| `imbalance_mwh` | Under-delivery | `dispatched - actual` |
| `imbalance_cost_zar` | Imbalance penalty | `imbalance × 800 ZAR/MWh` |
| `curtailment_mwh` | Not dispatched | `planned - dispatched` |
| `curtailment_cost_zar` | Opportunity cost | `curtailment × mcp` |

### Verification

The sum of hourly values matches the round totals:

```python
sum(h['revenue_zar'] for h in hourly_breakdown) == round_kpis['revenue_zar']
sum(h['imbalance_cost_zar'] for h in hourly_breakdown) == round_kpis['imbalance_cost_zar']
```

---

## 3. MCP Variation Across Rounds

### Why MCP Might Appear Constant

**Root Cause:** Scenario uses **flat temporal profiles**

```json
{
  "environment": {
    "diurnal_profile": [1.0, 1.0, 1.0, ..., 1.0],  // 24 values
    "seasonal_factors": [1.0, 1.0, ..., 1.0]       // 12 values
  }
}
```

### Test Results

#### Scenario 1: WITHOUT Temporal Profiles (Flat)
```
Round 1 (Hours  0- 5): MCP = 978.9 ZAR/MWh (constant)
Round 2 (Hours  6-11): MCP = 978.9 ZAR/MWh (constant)
Round 3 (Hours 12-17): MCP = 978.9 ZAR/MWh (constant)
Round 4 (Hours 18-23): MCP = 978.9 ZAR/MWh (constant)
```

#### Scenario 2: WITH Temporal Profiles (Variable)
```
Round 1 (Hours  0- 5): MCP = 936.8 ZAR/MWh (night low)
Round 2 (Hours  6-11): MCP = 988.1 ZAR/MWh (morning ramp)
Round 3 (Hours 12-17): MCP = 1014.0 ZAR/MWh (midday peak)
Round 4 (Hours 18-23): MCP = 995.2 ZAR/MWh (evening)
```

### Solution: Configure Realistic Temporal Profiles

#### Recommended Diurnal Profile
```json
"diurnal_profile": [
  0.7, 0.7, 0.7, 0.7, 0.7, 0.7,  // Night (00:00-05:00) - Low demand
  0.8, 0.9, 1.0, 1.1, 1.2, 1.3,  // Morning (06:00-11:00) - Ramp up
  1.4, 1.3, 1.2, 1.1, 1.0, 1.1,  // Afternoon (12:00-17:00) - Peak
  1.2, 1.3, 1.2, 1.0, 0.9, 0.8   // Evening (18:00-23:00) - Wind down
]
```

#### Recommended Seasonal Factors
```json
"seasonal_factors": [
  1.2, 1.1, 1.0, 0.9, 0.8, 0.7,  // Jan-Jun (Summer high → Winter low)
  0.7, 0.8, 0.9, 1.0, 1.1, 1.2   // Jul-Dec (Winter low → Summer high)
]
```

### How to Check Your Scenario

1. Open scenario config in Admin UI
2. Navigate to Environment Settings
3. Check `diurnal_profile` array
4. If all values are `1.0`, MCP will be constant
5. Apply realistic profile to see variation

---

## 4. Example: Solar at Night

### Scenario
- Solar plant bids 100 MW for night hours (00:00-05:00)
- Solar availability at night = 0%

### Results
```
Round 1 (Night):
  Planned:      600.0 MWh (100 MW × 6 hours)
  Dispatched:   600.0 MWh (market accepted bid)
  Actual:         5.0 MWh (availability = 0%, noise adds ~5 MWh)
  
  Revenue:      587,340 ZAR (dispatched × MCP)
  Imbalance:    476,000 ZAR (595 MWh × 800 ZAR/MWh)
  Curtailment:        0 ZAR (all bids accepted)
  Profit:       111,340 ZAR (revenue - costs)
```

### Hourly Breakdown
```
Hour  MCP     Planned  Dispatch  Actual  Imbalance  Revenue    Imb.Cost
   0  978.9   100.0    100.0     0.0     100.0      97,890     80,000
   1  978.9   100.0    100.0     0.0     100.0      97,890     80,000
   2  978.9   100.0    100.0     0.0     100.0      97,890     80,000
   3  978.9   100.0    100.0     0.0     100.0      97,890     80,000
   4  978.9   100.0    100.0     0.0     100.0      97,890     80,000
   5  978.9   100.0    100.0     5.0      95.0      97,890     76,000
--------------------------------------------------------------------
TOTAL          600.0    600.0     5.0     595.0     587,340    476,000
```

### Lesson
❌ Don't bid solar at night (availability = 0%)  
✅ Bid solar during midday (availability = 92%)

---

## 5. Troubleshooting Checklist

### Issue 1: Imbalance Costs Seem Too High

**Check:**
1. Is device a **generator** (not consumer)?
2. Is `actual_mwh` < `dispatched_mwh`?
3. Are you bidding renewables at wrong time?
   - Solar at night → 0% availability
   - Wind at calm hours → 47-53% availability
4. Is `actual_noise_pct` too high? (default 5%)

**Solution:**
- Bid solar only when `SOLAR_AVAILABILITY[hour]` > 0.5
- Bid wind consistently (average ~63% availability)
- Reduce noise if testing: `"actual_noise_pct": 0`

### Issue 2: MCP Stays Constant

**Check:**
1. Is `diurnal_profile` flat (all 1.0)?
2. Is `seasonal_factors` flat (all 1.0)?

**Solution:**
- Apply realistic temporal profiles (see section 3)
- Verify in scenario config: `environment.diurnal_profile`

### Issue 3: Consumer Paying Imbalance Costs

**Check:**
1. Is device type exactly "load" (lowercase)?
2. Check [engine.py#L880](../backend/app/engine.py#L880): `'load' in dev.get('type', '').lower()`

**Solution:**
- Ensure load devices use `"type": "load"` (case-insensitive)
- Consumer logic exempts imbalance/curtailment automatically

### Issue 4: Hourly Breakdown Doesn't Match Totals

**Check:**
1. Sum of `hourly_breakdown[*].revenue_zar` vs `round_kpis.revenue_zar`
2. Sum of `hourly_breakdown[*].imbalance_cost_zar` vs `round_kpis.imbalance_cost_zar`

**Solution:**
- This is a bug if sums don't match
- Report with scenario config and round number

---

## 6. API Reference

### Request
```http
POST /api/sessions/{session_id}/play-round
{
  "forecasts": {
    "1": {
      "devices": [
        {"device_id": "solar_1", "hours": [100, 100, ..., 100]}
      ],
      "bids": {
        "solar_1": {
          "A": {"price": 50, "hours": [100, 100, ..., 100]}
        }
      }
    }
  }
}
```

### Response
```json
{
  "status": "success",
  "result": {
    "mcp": 1014.0,
    "volume": 32335.0,
    "round_kpis": {
      "1": {
        "planned_mwh": 600.0,
        "dispatched_mwh": 600.0,
        "actual_mwh": 540.0,
        "revenue_zar": 608400,
        "imbalance_cost_zar": 48000,
        "curtailment_cost_zar": 0,
        "congestion_revenue_zar": 0,
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
    },
    "hourly_results": [
      {"hour_idx": 12, "hour_offset": 0, "mcp": 1063.2, "volume": 5450.0},
      // ... 5 more hours
    ]
  }
}
```

---

## 7. Related Documentation

- [Calculation Engine](./CALCULATION_ENGINE.md) - Core algorithm details
- [Device Model](./device-model.md) - Device types and constraints
- [Admin Handbook](./guide/admin-handbook.md) - Scenario configuration
- [Player Handbook](./guide/player-handbook.md) - Bidding strategies

---

## Changelog

**v1.0 (2025-12-18)**
- Initial documentation
- Added hourly breakdown to `round_kpis`
- Confirmed player-specific cost attribution
- Explained MCP variation with temporal profiles
- Added troubleshooting checklist
