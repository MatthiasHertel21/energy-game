# Bug Analysis: P0 & P1 Critical Issues

**Date:** February 15, 2026  
**Session:** 388 (Monday-Classic_Provider)  
**Status:** ANALYZED (Not Fixed Yet)

---

## Executive Summary

Analyzed 5 bugs across P0 (critical) and P1 (high) priority levels. All bugs validated with root cause identified:

**P0 (Critical):**
1. ✅ **Hour Mapping Drift** - Multiple time reference systems cause confusion
2. ✅ **DA/ID Split Wrong in Round 1** - Balancing shows DA=0, ID>0 instead of DA=dispatch, ID=0
3. ✅ **CO2 H? Issue** - Already fixed as Bug N2 in previous session

**P1 (High):**
4. ✅ **KPI Costs Missing Details** - Imbalance costs shown without device/hour breakdown
5. ✅ **KPI Semantics Inconsistent** - Mixed use of MWh vs ZAR in different modules

All bugs are **fachlich significant** and impact data integrity, auditability, and SAWEM compliance.

---

## Bug P0-1: Stunden-Mapping Driftet Zwischen Modulen

### Problem Description

**Symptom:** Different parts of the codebase use different hour reference systems:
- `hour_idx`: Absolute scenario hour (0-59 for 60-hour scenario)
- `hour_offset`: Round-local index (0-5 for 6-hour rounds)
- `hour_of_day`: Clock time (0-23)

This creates confusion when interpreting data, especially for time-dependent profiles like solar availability.

**Example Confusion:**
- Solar availability calculated for `hour_of_day=4` (04:00, low availability)
- But this is `hour_idx=28` in Round 5
- Debug logs show "H28" with low solar, which looks wrong (28:00 doesn't exist)
- Actual meaning: Scenario hour 28 = Day 2, 04:00 clock time

**Reproduction:** Check any debug log capacity_debug section, compare hour references across dispatch/capacity/balancing sections.

### Root Cause

**Files:** [backend/app/engine.py](backend/app/engine.py)

Multiple time reference systems used without consistent conversion:

```python
# Line 1515-1517: Main loop uses all three
for hour_offset in range(span):
    hour_idx = base_idx + hour_offset
    hour_of_day = extract_hour_of_day(hour_idx, start_time)
```

**Problematic Code Snippets:**

1. **Build supply uses hour_idx (absolute):**
```python
# Line 621
quantity = float(hours[hour_idx])  # Expects absolute scenario index
```

2. **Availability uses hour_of_day (clock):**
```python
# Line 98-120
def calculate_realistic_availability(device: dict, hour_of_day: int, config: dict):
    if device_type == "solar":
        return SOLAR_AVAILABILITY[hour_of_day % 24]  # Clock time
```

3. **Dispatch tracking uses hour_offset (round-local):**
```python
# Line 1914
'hour_offset': hour_offset,  # Round-local 0-5
```

4. **Output contains all three:**
```python
# Line 2439-2448
hour_entry = {
    "hour": hour_result["hour_idx"],           # Absolute
    "hour_offset": current_hour_offset,        # Round-local
    "capacity_debug": {
        "hour_of_day": hour_of_day,           # Clock time
        ...
    }
}
```

### Impact

❌ **Data Interpretation:**
- Analysts confused which "hour" field to use
- Solar/wind profiles appear in "wrong" hours
- Capacity calculations not traceable to clock time

❌ **Debugging Difficulty:**
- Three different hour references in same data structure
- No clear mapping between systems
- Cross-module data comparison error-prone

❌ **Auditability:**
- Cannot easily verify "was solar availability correct at 04:00?"
- Need to reverse-engineer hour_idx → clock time mapping

### Recommended Fix

**Strategy:** Standardize on ONE primary reference with clear labels:

```python
# PROPOSED SCHEMA:
{
    "scenario_hour": 28,           # Absolute scenario index (hour_idx)
    "round_hour": 4,               # Round-local offset (hour_offset)
    "clock_hour": 4,               # Time of day 0-23 (hour_of_day)
    "display": "H28 (04:00)"       # Human-readable combined
}
```

**Implementation:**
1. Rename fields for clarity: `hour_idx` → `scenario_hour`, `hour_offset` → `round_hour`
2. Always include all three in output dictionaries
3. Create utility function `format_hour_display(scenario_hour, clock_hour)`
4. Update debug_logger.py to show combined format

**Complexity:** Medium (requires changes across engine.py, debug_logger.py, frontend)

---

## Bug P0-2: DA/ID-Aufteilung in Round 1 Fachlich Falsch

### Problem Description

**Symptom:** Round 1 balancing table shows:
- DA Dispatch = 0.0  ← **WRONG!**
- ID Dispatch = 568.570  ← **WRONG!**
- Total = 568.570

**Fachlich korrekt für Round 1 wäre:**
- DA Dispatch = 568.570 (all dispatch is Day-Ahead)
- ID Dispatch = 0.0 (no Intraday in Round 1)
- Total = 568.570

**Example from Round 1 Debug Log:**
```markdown
| Hour | DA Dispatch | ID Dispatch | Total Commit | Actual | Imbalance |
|------|-------------|-------------|--------------|--------|-----------|
| H0   | 0.000       | 568.570     | 568.570      | 624.363| 55.793    |
| H1   | 0.000       | 600.000     | 600.000      | 623.028| 23.028    |
```

**Reproduction:** Session 388, Round 1, Balancing/Imbalance Breakdown section.

### Root Cause

**File:** [backend/app/engine.py:1887-1914](backend/app/engine.py#L1887-L1914)

Balancing data construction has wrong logic for Round 1:

```python
# Line 1887-1897: DA dispatch calculation
da_dispatched_for_device = 0.0
if round_num > 1 and 'da_baseline_dispatch' in locals() and da_baseline_dispatch:
    # Get DA dispatch for this device from Round 1
    if pid in da_baseline_dispatch and device_id in da_baseline_dispatch[pid]:
        # Sum across all lots (A, B, C) for this hour
        for lot_label in ['A', 'B', 'C']:
            if lot_label in da_baseline_dispatch[pid][device_id]:
                lot_hourly = da_baseline_dispatch[pid][device_id][lot_label]
                if isinstance(lot_hourly, list) and hour_offset < len(lot_hourly):
                    da_dispatched_for_device += lot_hourly[hour_offset].get('mw_dispatched', 0.0)

# Line 1911-1914: Store wrong values
per_device_hourly_balancing[device_id].append({
    'da_dispatched_mwh': round(da_dispatched_for_device, 3),  # 0.0 in Round 1!
    'id_dispatched_mwh': round(device_dispatched, 3),         # Should be 0!
    ...
})
```

**Problem:**
- Condition `if round_num > 1` means `da_dispatched_for_device = 0.0` in Round 1
- `device_dispatched` is the **current round dispatch** (should be DA in Round 1)
- Result: Current dispatch incorrectly labeled as "ID Dispatch"

**Fachlich:**
- Round 1 is **pure Day-Ahead** → all dispatch is DA, ID = 0
- Round 2+ is **Intraday** → DA from baseline, ID is delta

### Impact

❌ **Fachliche Inkorrektheit:**
- Contradicts SAWEM market structure (§3 Market Phases)
- Round 1 labeled "Day-Ahead" but data shows "Intraday"
- Violates educational goal (players learn wrong concepts)

❌ **Data Integrity:**
- Historical analysis broken (cannot separate DA vs ID contributions)
- KPI aggregation may use wrong fields
- Compliance audit fails (DA/ID split incorrect)

❌ **User Confusion:**
- Players see ID dispatch in Round 1, assume intraday trading active
- "Why do I have ID dispatch when I can't trade intraday yet?"

### Recommended Fix

**Strategy:** Conditional field assignment based on round number:

```python
# PROPOSED FIX:
if round_num == 1:
    # Round 1: Pure Day-Ahead
    da_dispatched_for_device = device_dispatched  # Current dispatch IS DA
    id_dispatched_for_device = 0.0                # No intraday yet
else:
    # Round 2+: Intraday
    da_dispatched_for_device = <load from baseline>
    id_dispatched_for_device = device_dispatched  # Current dispatch IS ID delta
```

**Implementation:**
```python
# Line 1887-1920 (replace existing logic)
if round_num == 1:
    # Round 1: All dispatch is Day-Ahead, no Intraday
    da_dispatched_for_device = device_dispatched
    id_dispatched_for_device = 0.0
else:
    # Round 2+: Load DA baseline and calculate ID delta
    da_dispatched_for_device = 0.0
    if 'da_baseline_dispatch' in locals() and da_baseline_dispatch:
        if pid in da_baseline_dispatch and device_id in da_baseline_dispatch[pid]:
            for lot_label in ['A', 'B', 'C']:
                if lot_label in da_baseline_dispatch[pid][device_id]:
                    lot_hourly = da_baseline_dispatch[pid][device_id][lot_label]
                    if isinstance(lot_hourly, list) and hour_offset < len(lot_hourly):
                        da_dispatched_for_device += lot_hourly[hour_offset].get('mw_dispatched', 0.0)
    id_dispatched_for_device = device_dispatched  # Current round = ID delta

# Total committed = DA + ID
total_dispatched = da_dispatched_for_device + id_dispatched_for_device
```

**Same fix needed for consumers** (around Line 1828).

**Complexity:** Low (single conditional, clear semantics)

---

## Bug P0-3: CO2-Tabelle Zeigt „H?" Statt Stunden

### Problem Description

**Symptom:** CO2 emission tables show "H?" instead of concrete hour numbers.

**Example:**
```markdown
| Hour | CO2 (kg) | CO2 Rate (kg/MWh) | Dispatched (MWh) |
|------|----------|-------------------|------------------|
| H?  | 570,000.0 | 950.0 | 600.00 |
| H?  | 570,000.0 | 950.0 | 600.00 |
```

### Status

✅ **ALREADY FIXED** as Bug N2 in previous fix session.

**Fix Applied:** [backend/app/debug_logger.py:605-612](backend/app/debug_logger.py#L605-L612)

Changed from:
```python
hour = hour_data.get("hour", "?")  # Field doesn't exist!
```

To:
```python
hour = hour_data.get("hour_offset", hour_data.get("hour_idx", "?"))  # Correct fields
```

**No further action needed.**

---

## Bug P1-1: KPI-Kosten Ohne Nachvollziehbare Detailzeilen

### Problem Description

**Symptom:** KPIs show costs (e.g., Imbalance Cost = 203 ZAR) but Sections 6 & 7 (Device Dispatch Details, Capacity Analysis) are empty.

**Example Round 2:**
```markdown
## 6. Device Dispatch Details
[EMPTY]

## 7. Capacity Analysis (per Device)
[EMPTY]

## 8. Financial Results (KPIs)
| Imbalance Cost | 203 ZAR |  ← Where does this come from?
```

**Problem:** Cannot trace costs back to specific devices/hours.

**Reproduction:** Session 388, Round 2 or 3, compare Sections 6-8.

### Root Cause

**Files:** [backend/app/engine.py:2571-2580](backend/app/engine.py#L2571-L2580) + [backend/app/debug_logger.py:415-550](backend/app/debug_logger.py#L415-L550)

**Engine doesn't always export bid_dispatch:**
```python
# Line 2571-2580
if enable_bidding and bid_dispatch_tracking:
    result["bid_dispatch"] = bid_dispatch_tracking
else:
    logger.warning(f"No bid_dispatch: enable_bidding={enable_bidding}, tracking_empty={not bid_dispatch_tracking}")
    # result["bid_dispatch"] NOT added!
```

**Debug logger requires bid_dispatch:**
```python
# Line 417
if "bid_dispatch" in results and results["bid_dispatch"]:
    # Render Device Dispatch Details
else:
    # Section 6 stays EMPTY
```

**But KPIs are always rendered:**
```python
# Line 510
if "kpis" in results:
    imbalance_cost = kpis.get('imbalance_cost_zar', 0)
    md.append(f"| Imbalance Cost | {imbalance_cost:,.0f} ZAR |\n")
    # Always shown, regardless of details availability!
```

**Scenarios where this fails:**
1. `enable_bidding=False` → No bid_dispatch → No details but KPIs still calculated
2. `bid_dispatch_tracking` empty → No details but KPIs still shown
3. Round with `volume=0` → Imbalance calculated (Bug N3 interaction) but no dispatch to detail

### Impact

❌ **Auditability Broken:**
- Cannot verify where 203 ZAR imbalance comes from
- No device-level breakdown to check calculations
- QA team cannot validate correctness

❌ **Player Trust:**
- "Why am I charged 203 ZAR with no explanation?"
- Looks like arbitrary penalty

❌ **Debugging Impossible:**
- Cannot diagnose which device/hour caused imbalance
- Cannot reproduce calculation manually

### Recommended Fix

**Strategy 1:** Always include balancing details (preferred)

```python
# Line 2580-2590: Add balancing details even without bid_dispatch
if not enable_bidding or not bid_dispatch_tracking:
    # Create minimal bid_dispatch from balancing data
    minimal_dispatch = {}
    for dev_id, bal_entries in per_device_hourly_balancing.items():
        minimal_dispatch[dev_id] = {
            'balancing_only': True,
            'hours': bal_entries  # Contains dispatch, actual, imbalance
        }
    result["bid_dispatch"] = minimal_dispatch
```

**Strategy 2:** Suppress KPI display if no details (alternative)

```python
# debug_logger.py Line 510: Conditional KPI rendering
if "kpis" in results:
    kpis = results["kpis"]
    has_details = "bid_dispatch" in results or "device_hourly_details" in results
    
    if not has_details:
        md.append("*Note: Detail breakdown not available (bidding disabled)*\n\n")
    
    # Show KPIs with caveat
```

**Strategy 3:** Use device_hourly_details (best)

```python
# debug_logger.py Line 415: Check alternative source
if "bid_dispatch" in results:
    # Render from bid_dispatch (existing code)
elif "device_hourly_details" in results:
    # Render from device_hourly_details.balancing
    details = results["device_hourly_details"]
    if "balancing" in details:
        for dev_id, bal_entries in details["balancing"].items():
            # Render balancing table
```

**Complexity:** Medium (need to handle multiple data sources)

---

## Bug P1-2: KPI-Semantik Uneinheitlich (Cost vs. MWh)

### Problem Description

**Symptom:** Different modules interpret KPI fields inconsistently:
- Some use `imbalance_mwh` (quantity in MWh)
- Some use `imbalance_cost_zar` (cost in ZAR)
- Some mix both with fallbacks `imbalance_mwh or cost/1000`

This creates semantic confusion and incorrect calculations.

**Reproduction:** Check sessions.py, search for "imbalance" or "curtailment" field usage.

### Root Cause

**File:** [backend/app/sessions.py](backend/app/sessions.py)

**Inconsistent field usage across functions:**

1. **Scoring (Line 532):**
```python
imbalance = float(kpis.get("imbalance_mwh", 0) or 
                  kpis.get("imbalance_cost_zar", 0) / 1000 or 
                  kpis.get("imbalance", 0))
# Uses MWh with fallback to cost/1000 approximation
```

2. **Player Totals (Line 765):**
```python
player_totals[pid]["imbalance"] += float(
    kpis.get("imbalance_mwh", 0) or 
    kpis.get("imbalance_cost_zar", 0) / 1000
)
# Same pattern: MWh preferred
```

3. **Challenge Scoring (Line 882):**
```python
abs(float(kpis.get("imbalance_cost_zar", 0))) * weights.get("imbalance", 0.3)
# Uses COST directly, not MWh!
```

4. **Challenge Display (Line 889):**
```python
"imbalance": round(float(kpis.get("imbalance_cost_zar", 0)), 2)
# Returns cost as "imbalance" (semantic mismatch)
```

**Additional Issues in Line 760:**
```python
player_totals[pid]["imbalance_cost"] += float(kpis.get("imbalance_cost_zar", 0))
player_totals[pid]["imbalance"] += float(kpis.get("imbalance_mwh", 0) or ...)
# Two different fields for same concept
```

### Impact

❌ **Incorrect Calculations:**
- Challenge scoring uses ZAR where MWh expected
- Can't compare imbalance across players (different units)
- Weights applied to wrong dimensions

❌ **Semantic Confusion:**
- Field named "imbalance" sometimes means MWh, sometimes ZAR
- API consumers don't know which unit returned

❌ **Data Migration Issues:**
- Old sesions use `cost/1000` approximation
- New sessions have separate `_mwh` fields
- Fallback logic brittle

### Recommended Fix

**Strategy:** Strict semantic separation with clear naming:

```python
# PROPOSED SCHEMA:
kpis = {
    # Quantities (physical units)
    "imbalance_mwh": 55.793,           # Signed MWh
    "curtailment_mwh": 12.5,           # Unsigned MWh
    
    # Costs (financial units)
    "imbalance_cost_zar": 44634,       # ZAR penalty
    "curtailment_cost_zar": 5625,      # ZAR penalty
    
    # Derived metrics (dimensionless)
    "imbalance_severity": 0.093,       # |MWh| / planned (%)
}
```

**Implementation Changes:**

1. **Scoring (use MWh only):**
```python
# Line 532: Remove fallback to cost
imbalance_mwh = float(kpis.get("imbalance_mwh", 0))
curtailment_mwh = float(kpis.get("curtailment_mwh", 0))

# Scale to ZAR equivalent for weighted score
imbalance_penalty = abs(imbalance_mwh) * 1000  # Convert to ZAR scale
```

2. **Challenge Scoring (separate quantity and cost weights):**
```python
# Line 882: Use MWh for challenges
"imbalance": {
    "mwh": abs(float(kpis.get("imbalance_mwh", 0))),
    "cost_zar": abs(float(kpis.get("imbalance_cost_zar", 0))),
    "weight": weights.get("imbalance", 0.3)
}
```

3. **Player Totals (consistent aggregation):**
```python
# Line 760-765: Separate cost and quantity totals
player_totals[pid]["imbalance_cost_zar"] += kpis.get("imbalance_cost_zar", 0)
player_totals[pid]["imbalance_mwh"] += kpis.get("imbalance_mwh", 0)
# No mixing!
```

**Complexity:** Medium (affects multiple calculation paths, needs testing)

---

## Summary Table

| Bug ID | Priority | Category | Complexity | SAWEM Impact | Status |
|--------|----------|----------|------------|--------------|--------|
| P0-1 | Critical | Data Integrity | Medium | Moderate | Analyzed |
| P0-2 | Critical | Market Logic | Low | High | Analyzed |
| P0-3 | Critical | Reporting | N/A | Low | Fixed (N2) |
| P1-1 | High | Auditability | Medium | Moderate | Analyzed |
| P1-2 | High | Data Semantics | Medium | Moderate | Analyzed |

---

## SAWEM Market Code Compliance Impact

### §3 Market Phases (P0-2 violation)

**Requirement:**
> Day-Ahead Market (DAM) clears in Round 1. Intraday Market (IDM) operates in Rounds 2+.

**Current Issue:**
- Round 1 data shows ID Dispatch > 0 (violates phase separation)
- Contradicts market timeline documentation

**Compliance Status:** 🔴 **Non-compliant** until P0-2 fixed

### §4.2 Settlement Logic (P1-2 violation)

**Requirement:**
> Imbalance calculated as actual delivery minus scheduled dispatch (MWh), penalized at BPB/BPS (ZAR/MWh).

**Current Issue:**
- Mixed use of MWh and ZAR in settlement calculations
- Challenge scoring uses cost where quantity expected

**Compliance Status:** 🟡 **Partially compliant** (calculations correct but semantics unclear)

### §7 Transparency (P1-1 violation)

**Requirement:**
> All settlements must be auditable with hour-by-hour device-level breakdown.

**Current Issue:**
- KPI costs shown without supporting details
- Cannot verify calculation correctness

**Compliance Status:** 🟡 **Partially compliant** (data exists but not always exported)

---

## Recommended Fix Priority

### Phase 1: Critical Fixes (1-2 days)
1. **P0-2: DA/ID Split** (HIGHEST)
   - Impact: Fachlich incorrect, confuses users
   - Effort: Low (single conditional)
   - Testing: Validate Round 1 shows DA>0, ID=0

2. **P1-2: KPI Semantics** (HIGH)
   - Impact: Incorrect challenge scoring
   - Effort: Medium (multiple touch points)
   - Testing: Validate scoring uses MWh consistently

### Phase 2: Auditability (2-3 days)
3. **P1-1: Missing Details** (HIGH)
   - Impact: Broken audit trail
   - Effort: Medium (need alternative data source)
   - Testing: Validate all KPIs have breakdowns

### Phase 3: Consistency (3-4 days)
4. **P0-1: Hour Mapping** (MEDIUM)
   - Impact: Confusion, not calculation error
   - Effort: Medium (many touch points)
   - Testing: Validate all hour references clear

---

## Testing Strategy

### Unit Tests (Recommended)

```python
# test_bug_p0_2_da_id_split.py
def test_round1_shows_only_da_dispatch():
    """Validate Round 1 balancing shows DA>0, ID=0"""
    result = run_round(session_id=388, round_num=1)
    balancing = result["device_hourly_details"]["balancing"]
    
    for dev_id, entries in balancing.items():
        for entry in entries:
            assert entry["da_dispatched_mwh"] > 0, "Round 1 must have DA dispatch"
            assert entry["id_dispatched_mwh"] == 0, "Round 1 must not have ID dispatch"

def test_round2_shows_da_plus_id():
    """Validate Round 2+ shows both DA and ID"""
    result = run_round(session_id=388, round_num=2)
    balancing = result["device_hourly_details"]["balancing"]
    
    # At least some entries should have both
    found_both = False
    for dev_id, entries in balancing.items():
        for entry in entries:
            if entry["da_dispatched_mwh"] > 0 and entry["id_dispatched_mwh"] != 0:
                found_both = True
    
    assert found_both, "Round 2+ should show DA baseline + ID delta"

# test_bug_p1_2_kpi_semantics.py
def test_scoring_uses_mwh_not_cost():
    """Validate scoring calculations use MWh quantities"""
    kpis = {"imbalance_mwh": 55.793, "imbalance_cost_zar": 44634}
    score = calculate_score(kpis)
    
    # Score should use MWh * 1000 (scale), not direct cost
    expected_penalty = abs(55.793) * 0.3 * 1000
    assert abs(score.components["imbalance"] - expected_penalty) < 1
```

### Integration Tests

1. **Replay Session 388** with fixes applied
2. Compare Round 1 vs Round 2 balancing tables
3. Validate all KPIs have corresponding details
4. Check challenge scoring uses correct units

---

## Deployment Checklist

- [ ] Code fixes implemented (P0-2, P1-2, P1-1)
- [ ] Unit tests added and passing
- [ ] Integration tests with Session 388
- [ ] Backward compatibility validated (old sessions)
- [ ] Documentation updated (hour mapping conventions)
- [ ] Backend Docker image rebuilt
- [ ] Services restarted
- [ ] Validation with new test session
- [ ] Regression test with Session 387 (previous baseline)

---

## Related Documents

- [Bug Fixes N1-N3](BUG_FIXES_N1_N2_N3.md) - Previous critical fixes
- [SAWEM Market Code Compliance](market-code-compliance.md) - §3, §4.2, §7
- [Calculation Engine Review](CALCULATION_ENGINE_REVIEW.md) - Engine architecture

---

**Analysis Status:** ✅ **COMPLETE**  
**Next Steps:** Awaiting decision on fix implementation priority and timeline.
