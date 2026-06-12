#!/usr/bin/env python3
"""
Test plan for market phases validation
Scenario: Start 1.1.2026 02:00, round_span=6h, horizon=48h, DA gate=12:00
"""

def calculate_expected_phases(round_num, round_span=6, start_hour=2, horizon=48, gate_hour=12):
    """
    LLM-generated expected market phases based on market logic
    """
    current_sim_hour = (round_num - 1) * round_span
    current_clock_hour = (start_hour + current_sim_hour) % 24
    
    # Calculate hours until first midnight
    hours_until_first_midnight = (24 - start_hour) % 24
    if hours_until_first_midnight == 0:
        hours_until_first_midnight = 24
    
    # First DA gate simulation hour
    first_gate_sim_hour = (gate_hour - start_hour) % 24
    if first_gate_sim_hour <= 0:
        first_gate_sim_hour += 24
    
    print(f"\n=== Round {round_num} ===")
    print(f"Clock time: {start_hour + current_sim_hour}:00 (hour {current_clock_hour}:00 on day {1 + current_sim_hour // 24})")
    print(f"Simulation hour: {current_sim_hour}")
    print(f"Hours until first midnight: {hours_until_first_midnight}")
    print(f"First gate at sim hour: {first_gate_sim_hour}")
    
    phases = []
    
    if round_num == 1:
        # Round 1: DA Baseline for Day 1
        print(f"Round 1: Setting DA baseline for Day 1")
        for h in range(horizon):
            if h < hours_until_first_midnight:
                phases.append(("da", f"Hour {h} ({start_hour + h}:00 Day 1): DA baseline"))
            else:
                phases.append(("future", f"Hour {h}: Future (beyond Day 1)"))
    else:
        # Round 2+: Calculate committed days
        if current_sim_hour >= first_gate_sim_hour:
            gates_closed = 1 + (current_sim_hour - first_gate_sim_hour) // 24
        else:
            gates_closed = 0
        
        committed_end = hours_until_first_midnight + gates_closed * 24
        
        print(f"Gates closed: {gates_closed}")
        print(f"Committed end: hour {committed_end}")
        
        for h in range(horizon):
            real_hour = (start_hour + h) % 24
            day = 1 + h // 24
            
            if h < current_sim_hour:
                phases.append(("locked", f"Hour {h} ({real_hour}:00 Day {day}): Already delivered"))
            elif h < hours_until_first_midnight:
                phases.append(("id", f"Hour {h} ({real_hour}:00 Day 1): ID market (Day 1 committed in R1)"))
            elif h < committed_end:
                phases.append(("id", f"Hour {h} ({real_hour}:00 Day {day}): ID market (gate closed)"))
            elif h < committed_end + 24:
                phases.append(("da", f"Hour {h} ({real_hour}:00 Day {day}): DA market (gate open)"))
            else:
                phases.append(("future", f"Hour {h} ({real_hour}:00 Day {day}): Future"))
    
    return phases


def print_phase_summary(phases):
    """Print compact phase summary"""
    if not phases:
        return
    
    current_phase = phases[0][0]
    start_hour = 0
    
    print("\nPhase Summary:")
    print("-" * 60)
    
    for i, (phase, _) in enumerate(phases):
        if phase != current_phase or i == len(phases) - 1:
            end_hour = i if phase != current_phase else i + 1
            print(f"  Hours {start_hour:2d}-{end_hour-1:2d}: {current_phase.upper()}")
            if phase != current_phase:
                start_hour = i
                current_phase = phase
    
    # Print last phase if needed
    if phases[-1][0] != current_phase:
        print(f"  Hours {start_hour:2d}-{len(phases)-1:2d}: {phases[-1][0].upper()}")


def main():
    """Run test plan for rounds 1-8"""
    print("=" * 80)
    print("MARKET PHASES TEST PLAN")
    print("Scenario: Start 1.1.2026 02:00, round_span=6h, horizon=48h, DA gate=12:00")
    print("=" * 80)
    
    for round_num in range(1, 9):
        phases = calculate_expected_phases(round_num)
        print_phase_summary(phases)
        
        # Print detailed first 10 hours
        print("\nDetailed (first 10 hours):")
        for i, (phase, desc) in enumerate(phases[:10]):
            print(f"  {desc}")
        
        if round_num < 8:
            print("\n" + "=" * 80)


if __name__ == "__main__":
    main()
