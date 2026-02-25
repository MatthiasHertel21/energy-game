# Calculation Engine Guide

Last updated: 2026-02-25  
Audience: Admins, Designers, Technical Trainers

## 1) Engine purpose

The engine converts player inputs and scenario rules into round outcomes:
- market prices and cleared volumes,
- dispatch/consumption per hour and device,
- KPI summaries used across player/trainer/evaluation UIs.

It is the canonical source of truth for settlement numbers.

## 2) Core round pipeline

For each round, the system performs:
1. Load session, scenario, role assignments, and current submissions.
2. Determine active hours and market availability (DA/ID rules).
3. Resolve active events for this round.
4. Apply technical and event constraints to capacities/demand.
5. Clear market(s) and derive price signals.
6. Compute dispatch, imbalance, costs, and KPI components.
7. Persist result payloads and publish round status.

## 3) Input domains that shape outcomes

- **General timing** (`general`): round span, horizon, gate/freeze behavior.
- **Market config** (`market`, `markets`): caps/floors and per-round trading states.
- **Physical model** (`devices`, `player_types`): who can do what technically.
- **Scenario dynamics** (`events`, `environment`): temporary shifts and profiles.
- **Player actions** (bids/forecasts): the primary controllable variable.

## 4) Event handling model

Events are filtered by round activation logic (trigger + duration/probability).  
For affected scope (`all`, `player`, `device`), event modifiers are applied before clearing.

Conceptually:
- `available_capacity` is derived from base plus availability/profile factors,
- `effective_capacity = available_capacity * multiplier + additive`.

This is why outages or demand spikes can drastically alter dispatch and imbalance outcomes.

## 5) Price and dispatch concepts

- **SMP** (day-ahead/system price) comes from clearing supply-demand intersection under market bounds.
- **IDP** is based on intraday trade dynamics with configured constraints.
- Cleared quantity is distributed across submitted bid structures (including lot logic where enabled).

Interpretation note: price can look stable while cost/profit swings sharply due to quantity mismatch effects.

## 6) KPI composition logic

Top-level KPIs are composed from hourly and per-device settlements:
- revenue/cost settlement,
- variable + fixed costs,
- imbalance and curtailment components,
- congestion and additional adjustments where applicable.

The UI should reconcile with this structure; rounding differences are expected but should be bounded.

## 7) Why imbalance can dominate profit

Large imbalance cost usually indicates a structural mismatch between planned and deliverable/actual volume.  
Typical causes:
- event-driven capacity reduction,
- over-offering despite lower effective capacity,
- gate-timing mismatch and limited correction options.

When imbalance grows, profit can turn negative even with high gross market revenue.

## 8) Result payload layers (conceptual)

A round result generally includes:
- top-level KPI aggregate,
- hourly market outcomes,
- per-device hourly breakdown,
- bid/dispatch details,
- metadata needed for explanation screens.

Design goal: explainability from KPI down to hour-level causes.

## 9) Shared-mode orchestration

In trainer-led shared sessions:
- players submit,
- waiting state persists,
- trainer advances the session.

Engine processing and session status updates must align with this control model to avoid UX inconsistency.

## 10) Debugging methodology

### Step 1: Scope first

- session ID,
- round number,
- affected role/player,
- symptom category (missing dispatch, high imbalance, wrong explanation text).

### Step 2: Validate mechanics

- active events for round,
- market availability state,
- selected player type and mapped devices,
- effective vs base capacity rows.

### Step 3: Reconcile numbers

- KPI totals vs hourly sums,
- hourly imbalance vs imbalance cost,
- device-level contributions to outliers.

### Step 4: Confirm UX representation

- detail table matches backend payload,
- explanation text references relevant causal factors.

## 11) Validation strategy for scenario changes

Minimum safe sequence:
1. one-round dry run with one role,
2. multi-round run with known event timing,
3. shared-mode trainer progression test,
4. report consistency check (KPI cards vs detail tables).

## 12) Quality criteria for engine-facing changes

Prefer changes that preserve:
- deterministic reproducibility where expected,
- explicit event-to-impact traceability,
- numeric reconciliation across layers,
- backwards compatibility for historical result payloads.

## 13) Common failure patterns

- wrong round/hour mapping (absolute vs round-local indices),
- event target mismatch (role/device IDs),
- stale assumptions in explanation text,
- incomplete fallback handling in legacy result formats.

## 14) Practical review checklist before release

- event impacts visible in effective capacity/demand rows,
- imbalance spikes are explainable from detail data,
- guide text matches actual mechanics,
- no regression in round progression flow,
- build/test smoke checks pass.
