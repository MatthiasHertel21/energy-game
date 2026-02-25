# Calculation Engine Guide

Last updated: 2026-02-25  
Audience: Admins, Designers, Technical Trainers

## 1) Engine purpose

The calculation engine resolves round outcomes from submitted bids/forecasts and writes market/KPI results used by player, trainer, and evaluation views.

## 2) High-level processing flow

Per round, the engine:
1. Loads session/scenario configuration.
2. Resolves market availability (DA/ID and gate behavior).
3. Processes participant submissions.
4. Clears markets and computes dispatch/prices.
5. Computes KPI outputs and detail breakdowns.
6. Persists round results and emits status updates.

## 3) Inputs that strongly affect outcomes

- `general`: rounds, span, freeze/gate timing
- `market` and `markets`: pricing bounds and per-round trading states
- `devices` and `player_types`: technical limits and role assets
- `events`: temporary multipliers/additives
- submitted bids/forecasts

## 4) KPI consistency principle

UI KPIs should reconcile with detail tables (allowing rounding tolerance).  
When validating scenarios, compare:
- top-level KPI values,
- hour/device detail aggregations,
- role-specific semantics (producer vs consumer interpretation).

## 5) Shared-market round progression

In trainer-led shared mode:
- players submit,
- waiting status is shown,
- trainer advances round/session phase.

Engine state transitions must remain consistent with this flow to avoid UI mismatches.

## 6) Debugging checklist

- Verify session mode and status transitions.
- Validate per-round market availability arrays.
- Confirm player-type selection and device mappings.
- Compare KPI totals against hourly/device breakdowns.
- Reproduce with deterministic config export where possible.

## 7) Practical validation strategy

- Start with one scenario, one role, one round.
- Expand to full-round run.
- Validate both UI text interpretation and numeric consistency.
- Keep tolerance thresholds explicit for automated checks.
