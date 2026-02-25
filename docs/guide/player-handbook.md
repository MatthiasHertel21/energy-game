# Player Guide

Last updated: 2026-02-25  
Audience: Players

## 1) Objective

This guide explains how to make better round decisions, not just how to navigate the UI.  
Focus areas:
- timing and gates,
- deliverability vs offered volume,
- event-aware risk management,
- KPI interpretation and next-round adaptation.

## 2) Round workflow

1. Check active round context (events + tradable hours).
2. Build/adjust bids per device.
3. Run a quick sanity pass (capacity, pricing, timing).
4. Submit before timer expires.
5. Analyze round report and apply one concrete adjustment.

## 3) Shared-market behavior after submit

In trainer-led sessions, after submit you enter waiting mode:
- submit status list is shown,
- you cannot advance manually,
- trainer drives progression.

This is expected behavior.

## 4) Device and bid modes

- **Single-series**: one quantity profile.
- **Multi-bid**: lots A/B/C with price+quantity.

Typical lot intent:
- A = core volume,
- B = conditional volume,
- C = opportunistic/risk volume.

## 5) Market timing and gates

DA and ID availability vary by round and hour.  
If an hour is locked, edits are blocked by timing logic (not necessarily an error).

Always validate tradable status before spending time on edits.

## 6) Events and decision impact

Events may reduce capacity or alter demand before clearing.  
If effective capacity drops, keep offered volume realistic to avoid imbalance penalties.

## 7) Reading round results

Use this order:
1. KPI cards (profit/cost/imbalance headline),
2. effective vs base capacity/demand,
3. offered vs dispatched/consumed,
4. hourly imbalance and imbalance cost.

If imbalance dominates the round, reduce exposure in affected hours next round.

## 8) Rapid recovery strategy

After a bad round:
- lower risky volume where event pressure is active,
- separate must-clear and optional quantity by lot,
- use previous SMP/IDP observations to recalibrate prices,
- prioritize deliverability over upside.

## 9) Frequent mistakes

- leaving old bids unchanged after new events,
- offering against base capacity instead of effective capacity,
- optimizing revenue while ignoring imbalance cost,
- submitting without final cross-device sanity check.

## 10) Troubleshooting

- Inputs disabled: check gate/timer/session status.
- Waiting after submit: expected in shared trainer-led mode.
- Stale values: reload once and reopen session.
- Confusing KPI: inspect hourly detail and event impact first.
