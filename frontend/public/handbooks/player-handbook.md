# Player Guide

Last updated: 2026-02-25  
Audience: Players

## 1) What you do as a player

In each round, you:
- Review tasks/events and market phase availability.
- Enter bids/forecasts per device (or per lot A/B/C when multi-bid is enabled).
- Submit the round before timer expiry.
- Review round results and continue.

## 2) Main pages and statuses

- `Briefing`: scenario intro, role, devices, objectives.
- `Running / Round Active`: full player workspace (tasks, devices, charts, market panel).
- `Round Closing / Calculating`: waiting state while backend processes.
- `Round Results`: KPI cards, explanations, and round interpretation.
- `Scenario Complete`: final scenario summary.

## 3) Multiplayer submit behavior (shared market)

After you submit in a multi-player session:
- You now see only the player status list (name, player type, submit status).
- You also see a waiting hint:
  - “Please wait: The trainer will advance to the next phase.”

You cannot continue manually from this waiting state.

## 4) Bid input and device views

Depending on scenario/device settings:
- **Single-series mode**: edit one hourly profile.
- **Multi-bid mode**: edit lots A/B/C (price + hourly quantities).

Views:
- **Bid Input**: lot prices and quantities.
- **Device Chart**: interactive per-hour editing.
- **Bid Overview**: stacked lot visualization with limit/reference lines.

## 5) Market timing and gates

The game distinguishes Day-Ahead (DA) and Intraday (ID) availability per round/hour.

Important effects:
- Not all hours are editable in each round.
- Some hours are locked by gate/freeze logic.
- In Round 1, scenarios may use a DA special rule (if configured).

Use the market timeline/legend and hour status indicators to see what is currently tradable.

## 6) Market overview modal

The market overview dialog title now indicates its scope:
- all devices, or
- one specific device.

This helps avoid confusion when comparing market structure with your own bids.

## 7) Round results interpretation

Round results include role-aware explanations.

For consumers:
- Cost and settlement language is consumer-specific.
- Demand coverage can exceed 100% (for example over-procurement or balancing effects).
- The UI explicitly explains this >100% case.

## 8) Best practices

- Submit early; avoid last-second edits.
- Check each device’s effective limit and active market window.
- For multi-bid: keep lot prices logically ordered unless your strategy requires otherwise.
- In shared sessions, monitor the waiting list after submit and wait for trainer progression.

## 9) Troubleshooting

- If inputs appear disabled, check gate/freeze state and timer.
- If no progress after submit in shared mode, wait for trainer action.
- If data seems stale, refresh once; session state is server-driven.
- If a chart looks unreadable, switch theme and report the page + screenshot.
