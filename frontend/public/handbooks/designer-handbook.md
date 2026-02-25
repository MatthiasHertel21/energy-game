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
- `general` (rounds, timing, horizons, gate settings),
- `market` and `markets` (rules and per-round trading availability),
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
- `market_code` (gated/limited by logic)

Design recommendation:
- align trading arrays with your intended DA/ID teaching sequence,
- test the resulting hour-status behavior in the player view.

## 5) Devices and player types

Each player type references device IDs.

Common device groups:
- thermal generators,
- renewables,
- storage,
- load/consumer assets.

Keep naming and IDs stable once sessions are in use; it reduces reporting and replay confusion.

## 6) Events and challenges

Events:
- trigger by round,
- can target all players or specific player types,
- can use multipliers/additives and durations.

Challenges:
- role-specific KPIs,
- optional/required objectives,
- clear target thresholds.

## 7) Authoring checklist

- Confirm `rounds × round_span_hours` matches your intended timeline.
- Validate `freeze_hours`, `day_ahead_gate_hour`, `id_gate_base_hour` coherence.
- Check every `player_type.devices` ID exists in `devices`.
- Review event/challenge target IDs for typos.
- Verify price floor/cap and base volume realism.

## 8) Export/import and versioning

- Export scenarios to JSON for review and backup.
- Keep a version note in scenario description/objectives.
- Re-test one full run after any structural change (devices, timing, market arrays).

## 9) Current UX assumptions to respect

- Shared multiplayer rounds are trainer-advanced.
- After submit in shared mode, players see only submit-status list.
- Round results include clearer role-specific KPI explanations.
