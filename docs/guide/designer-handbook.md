# Designer Guide

Last updated: 2026-02-25  
Audience: Scenario/Campaign Designers

## 1) Designer scope

Designers create and maintain:
- campaigns,
- scenarios,
- market/device/event/challenge configurations,
- player-type mappings.

## 2) Core pages

- `/designer` and related designer tabs/pages.
- `/kse` (scenario editor) for detailed configuration.
- campaign/scenario lists for clone/export/import workflows.

## 3) Scenario structure (current)

A scenario config typically contains:
- `general`,
- `market` and `markets`,
- `grid`,
- `environment`,
- `devices`,
- `player_types`,
- `events`,
- `challenges`,
- `scoring`.

## 4) Market availability model

Per-round market availability uses `markets.<market>.trading` arrays.

Observed values in current codebase:
- `on`
- `off`
- `market_code`

## 5) Authoring checklist

- Confirm `rounds × round_span_hours` timeline.
- Validate gate/freeze settings.
- Ensure all `player_type.devices` IDs exist.
- Verify event/challenge target IDs and trigger rounds.
- Re-test one full run after structural changes.

## 6) Current UX assumptions

- Shared multiplayer rounds are trainer-advanced.
- After submit in shared mode, players see only submit-status list.
- Round results include clearer role-specific KPI explanations.
