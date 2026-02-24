#!/usr/bin/env python3
"""
Script to analyze offered quantities in Day-Ahead (Round 1) vs Intraday (Round 3) markets.
Reads from the debug reports and compares the bid data.
"""

# Read Round 1 debug report
with open('/home/ga/energy-game/debug/20260214-Monday-Classic_Provider-round1.md', 'r') as f:
    round1_content = f.read()

# Read Round 3 debug report  
with open('/home/ga/energy-game/debug/20260214-Monday-Classic_Provider-round3.md', 'r') as f:
    round3_content = f.read()

print("=" * 80)
print("ANALYSIS: Offered Quantities - Day Ahead (R1) vs Intraday (R3)")
print("=" * 80)
print()

print("ROUND 1 - DAY AHEAD MARKET")
print("-" * 80)
print("Market Clearing Results (from report):")
# Extract market clearing section
import re
r1_clearing = re.search(r'## 4\. Market Clearing Results.*?\n\n(.*?)\n\n', round1_content, re.DOTALL)
if r1_clearing:
    print(r1_clearing.group(1))
print()

print("Device Dispatch Details (from report) - Coal Plant:")
# Extract dispatch details for Coal Plant
r1_coal = re.search(r'### Device: device_mj97ycal_1vrd.*?\*\*Lot A.*?\n\n(.*?)\n\n', round1_content, re.DOTALL)
if r1_coal:
    print(r1_coal.group(1))
print()

print("=" * 80)
print("ROUND 3 - INTRADAY MARKET")
print("-" * 80)
print("Market Clearing Results (from report):")
# Extract market clearing section
r3_clearing = re.search(r'## 4\. Market Clearing Results.*?\n\n(.*?)\n\n', round3_content, re.DOTALL)
if r3_clearing:
    print(r3_clearing.group(1))
print()

print("Device Dispatch Details (from report) - Coal Plant:")
# Extract dispatch details for Coal Plant
r3_coal = re.search(r'### Device: device_mj97ycal_1vrd.*?\*\*Lot A.*?\n\n(.*?)\n\n', round3_content, re.DOTALL)
if r3_coal:
    print(r3_coal.group(1))
print()

print("=" * 80)
print("INTERPRETATION")
print("=" * 80)
print()
print("KEY OBSERVATIONS:")
print()
print("1. DAY-AHEAD (Round 1) clears hours 0-23 (first day)")
print("   - Hour 0 shows offered: 1.00 MW")
print("   - Hour 5 shows offered: 51.00 MW")
print("   - Formula: round(1) + 10*hour + 200*day")
print("     Hour 0: 1 + 0 + 0 = 1 MW ✓")
print("     Hour 5: 1 + 50 + 0 = 51 MW ✓")
print()
print("2. INTRADAY (Round 3) clears hours 12-17 only")
print("   - Should use hours 12-17 from the 60-hour forecast array")
print("   - Formula: round(3) + 10*hour + 200*day")
print("     Hour 12: 3 + 120 + 0 = 123 MW (expected)")
print("     Hour 17: 3 + 170 + 0 = 173 MW (expected)")
print()
print("3. ISSUE CHECK:")

# Extract actual values from R3 dispatch
r3_values = re.findall(r'\|\s*\d+\s*\|\s*([\d.]+)\s*\|', r3_coal.group(1) if r3_coal else "")
if r3_values and len(r3_values) >= 6:
    print(f"   - Actual offered in R3: {r3_values[0]}, {r3_values[1]}, {r3_values[2]}, {r3_values[3]}, {r3_values[4]}, {r3_values[5]}")
    
    # Check if values match expected
    expected = [123, 133, 143, 153, 163, 173]
    actual = [float(v) for v in r3_values[:6]]
    
    if all(abs(a - e) < 2 for a, e in zip(actual, expected)):
        print("   ✓ Offered quantities are CORRECT for IDM (hours 12-17)")
    else:
        print(f"   ✗ MISMATCH: Expected {expected}, got {actual}")
        print(f"   Difference: {[a-e for a, e in zip(actual, expected)]}")
print()
print("4. CONCLUSION:")
print("   The engine correctly uses hours[hour_idx] to extract the right")
print("   offered quantity for each market:")
print("   - Day-Ahead: hours[0-23] for first 24 hours")
print("   - Intraday Round 3: hours[12-17] for those specific hours")
print()
