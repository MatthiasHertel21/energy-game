#!/usr/bin/env python3
"""
Generate phase breakdown table for market timeline visualization.
Shows which phases are active for each hour from 1.1.2026 00:00 onwards.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Tuple

# Configuration (matching Session 154)
START_TIME = "02:00"
START_HOUR = 2
ROUND_SPAN_HOURS = 6
HORIZON_HOURS = 48
DA_GATE_HOUR = 12
FREEZE_HOURS = 6

def calculate_hour_status(round_num: int, start_hour: int, round_span: int, 
                         horizon: int, gate_hour: int) -> List[str]:
    """Calculate hour_status array for a given round."""
    
    current_sim_hour = (round_num - 1) * round_span
    
    # Calculate midnight boundaries
    hours_until_first_midnight = (24 - start_hour) % 24
    if hours_until_first_midnight == 0:
        hours_until_first_midnight = 24
    
    # Round 1: DA baseline
    if round_num == 1:
        hour_status = ["da"] * hours_until_first_midnight
        rest = horizon - hours_until_first_midnight
        hour_status += ["future"] * rest
        return hour_status
    
    # Round 2+: Past, ID, DA, Future
    hour_status = []
    
    for h in range(horizon):
        if h < current_sim_hour:
            hour_status.append("locked")
        elif h < hours_until_first_midnight:
            hour_status.append("id")
        elif h < hours_until_first_midnight + 24:
            hour_status.append("da")
        else:
            hour_status.append("future")
    
    return hour_status


def get_phase_ranges(hour_status: List[str], current_sim_hour: int, 
                     freeze_hours: int) -> Dict[str, Tuple[int, int]]:
    """Convert hour_status to phase ranges with start/end indices."""
    
    phases = {}
    
    # Find ranges
    locked_range = None
    id_range = None
    da_range = None
    future_range = None
    
    for i, status in enumerate(hour_status):
        if status == "locked":
            if locked_range is None:
                locked_range = [i, i]
            else:
                locked_range[1] = i
        elif status == "id":
            if id_range is None:
                id_range = [i, i]
            else:
                id_range[1] = i
        elif status == "da":
            if da_range is None:
                da_range = [i, i]
            else:
                da_range[1] = i
        elif status == "future":
            if future_range is None:
                future_range = [i, i]
            else:
                future_range[1] = i
    
    # Convert to dict with inclusive ranges
    if locked_range:
        phases['past'] = (locked_range[0], locked_range[1])
    
    if id_range:
        phases['committed_da'] = (id_range[0], id_range[1])
        
        # Calculate ID gate closed until
        id_gate_closed_until = current_sim_hour + freeze_hours
        
        # ID Closed: from id_start to min(id_gate_closed_until, id_end)
        if id_range[0] < id_gate_closed_until and id_gate_closed_until <= id_range[1]:
            phases['id_closed'] = (id_range[0], id_gate_closed_until - 1)
        
        # ID Open: from max(id_gate_closed_until, id_start) to id_end
        if id_gate_closed_until < id_range[1]:
            phases['id_open'] = (max(id_gate_closed_until, id_range[0]), id_range[1])
    
    if da_range:
        phases['da_open'] = (da_range[0], da_range[1])
    
    if future_range:
        phases['future'] = (future_range[0], future_range[1])
    
    return phases


def format_time(hour_index: int, start_hour: int) -> str:
    """Convert hour index to time string."""
    actual_hour = (start_hour + hour_index) % 24
    return f"{actual_hour:02d}:00"


def generate_phase_table():
    """Generate phase breakdown table showing time ranges for each phase."""
    
    print(f"\n{'='*120}")
    print(f"MARKET PHASE TIME RANGES")
    print(f"{'='*120}")
    print(f"Configuration: Start {START_TIME}, Round span {ROUND_SPAN_HOURS}h, Horizon {HORIZON_HOURS}h")
    print(f"DA Gate: {DA_GATE_HOUR}:00, ID Gate: {FREEZE_HOURS}h before delivery")
    print()
    
    # Calculate base time
    base_time = datetime(2026, 1, 1, START_HOUR, 0, 0)
    
    # Header
    header = f"{'Runde 2 Start':15} | {'Past':15} | {'Committed DA':20} | {'ID Closed':20} | {'ID Open':20} | {'DA Open':20} | {'Future':15}"
    print(header)
    print("=" * 120)
    
    # Generate rows for different round 2 start times
    # Round 2 can start at different times depending on round span
    for round_num in range(1, 9):
        current_sim_hour = (round_num - 1) * ROUND_SPAN_HOURS
        current_time = base_time + timedelta(hours=current_sim_hour)
        
        # Calculate hour status
        hour_status = calculate_hour_status(
            round_num, START_HOUR, ROUND_SPAN_HOURS, 
            HORIZON_HOURS, DA_GATE_HOUR
        )
        
        # Get phase ranges
        phases = get_phase_ranges(hour_status, current_sim_hour, FREEZE_HOURS)
        
        # Format time ranges for each phase
        def format_range(phase_name):
            if phase_name not in phases:
                return "-"
            start, end = phases[phase_name]
            start_time = format_time(start, START_HOUR)
            end_time = format_time(end + 1, START_HOUR)  # +1 for exclusive end
            return f"{start_time}-{end_time}"
        
        # Format row
        round_time = current_time.strftime('%d.%m. %H:%M')
        past = format_range('past')
        committed_da = format_range('committed_da')
        id_closed = format_range('id_closed')
        id_open = format_range('id_open')
        da_open = format_range('da_open')
        future = format_range('future')
        
        row = f"{round_time:15} | {past:15} | {committed_da:20} | {id_closed:20} | {id_open:20} | {da_open:20} | {future:15}"
        print(row)
    
    print("=" * 120)


def main():
    """Generate phase time range table."""
    generate_phase_table()


if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()
