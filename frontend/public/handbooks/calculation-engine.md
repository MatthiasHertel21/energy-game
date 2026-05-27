# Calculation Engine Guide

Last updated: 2026-05-27
Audience: Admins, Designers, Technical Trainers

## 1) What this guide is for

The calculation engine turns scenario configuration and player submissions into settled market outcomes. It is the source of truth for:
- prices,
- cleared quantities,
- dispatch or consumption,
- KPI totals,
- the result payloads shown in the player and trainer UIs.

This guide describes the current implemented behavior at a product level. For deep formulas and older detailed derivations, use the repository document `docs/CALCULATION_ENGINE.md` as the longer reference.

## 2) Core round pipeline

For each round, the engine performs this sequence:
1. Load the session, scenario, player assignments, and current submissions.
2. Determine the active hours, round-local offsets, and market availability for DAM and IDM.
3. Resolve all events that are active for the round.
4. Build effective capacity or demand from device data, profiles, and event effects.
5. Accept tradable bids according to the round's trading state.
6. Clear the market and derive price and volume outputs.
7. Apply physical and grid-related settlement logic.
8. Compute KPI totals and detailed breakdowns.
9. Persist results and publish the next session state.

## 3) Input blocks that actually shape outcomes

The most important scenario blocks are:
- `general`: round span, number of rounds, timing, freeze, balancing, and player editing rules,
- `market` and `markets`: price limits plus DAM and IDM trading state per round,
- `devices`: technical constraints and cost structure,
- `player_types`: role mapping, device ownership, and zone location,
- `events`: trigger logic plus multiplier and additive impacts,
- `grid`: zones, ATC, losses, curtailment, and shortfall settlement,
- `player_input`: which hours the player may edit and how the UI behaves.

Player submissions are only one part of the result. Scenario structure can materially restrict what those submissions can achieve.

## 4) Bidding and market clearing model

### Implicit versus explicit bidding

Devices may operate in:
- **implicit mode**, where the player edits one hourly quantity profile,
- **explicit multi-bid mode**, where the player submits price layers.

The current UI supports up to five bid layers per device:
- `A`
- `B`
- `C`
- `D`
- `E`

### How lots are cleared

The implemented clearing rule is:
- bid layers are ordered from lower to higher price,
- clearing walks up that order until demand is satisfied,
- all cleared volume receives the System Marginal Price (SMP), not the individual bid price.

This matters for interpretation:
- a low bid price improves the chance of clearing,
- profit still depends on SMP, variable cost, imbalance, and grid effects,
- a bid can clear and still lead to a bad net result if the quantity was not deliverable.

### Market availability per round

For each round, DAM and IDM trading can be:
- `Gated` (`market_code` behavior),
- always enabled,
- disabled.

Important: trading controls whether player bids are accepted for that market phase. Clearing itself still occurs as part of the round settlement pipeline.

## 5) Effective capacity and demand

The engine does not settle against static nameplate values alone. It derives effective capability from:
- device configuration,
- hourly profiles,
- seasonal or monthly profiles,
- renewable availability,
- state of charge for batteries,
- event modifiers.

Conceptually:

```text
effective_value = available_value * multiplier + additive
```

That is why a player can offer a quantity that looked sensible in the editor but still incur imbalance in the live round.

## 6) Battery behavior

Battery settlement includes:
- power limits,
- energy limits,
- state-of-charge tracking,
- efficiency,
- optional threshold-based auto-bid behavior.

When auto-bid is enabled, player-side thresholds drive charge and discharge decisions, but the engine still enforces the battery's physical limits.

## 7) Grid and zonal settlement

The current grid implementation supports:
- 1 to 5 zones,
- symmetric ATC matrices,
- transmission losses per link,
- player-type-specific zones,
- network shortfall pricing,
- configurable generator curtailment rules.

Important current rule:
- `player_types[].zone` is the authoritative location for assets,
- `general.player_zone` is only a legacy fallback for older scenarios.

### Network settlement concepts

Relevant configuration blocks include:
- `extra_cost_mode`,
- `cost_allocation_target`,
- `shortfall_price_mode`,
- `shortfall_price_value`,
- `generator_curtailment_mode`.

In practice, this means a round can look commercially cleared at the market level while still producing zonal shortfall cost, ATC cost, or curtailment once the network is checked.

## 8) Event model

Events are resolved by:
- trigger type,
- trigger value,
- duration,
- target scope,
- multiplier,
- additive term.

The engine applies multiplier first and additive second. This design is visible in the player results because event-driven drops in effective capacity or shifts in demand appear before dispatch and imbalance are calculated.

## 9) KPI composition

Current KPI sets can include:
- revenue,
- profit,
- variable cost,
- fixed cost,
- imbalance cost,
- curtailment cost,
- ATC or grid-constraint cost,
- congestion revenue,
- CO2 emissions,
- planned MWh,
- actual MWh,
- dispatched MWh,
- zone shortfall MWh.

Round and cumulative views are built from these layers. Small UI rounding differences can happen, but the data should still reconcile directionally and structurally.

## 10) Result payload layers and where they appear

A complete round result contains more than headline KPIs. The current UI consumes:
- top-level round KPIs,
- hourly market outcomes,
- per-device hourly breakdowns,
- bid or lot detail,
- player-zone and balancing metadata,
- ranking and market summary data for trainer and final result screens.

This powers several explanation surfaces:
- player round results,
- device deep-dive tabs,
- market overview dialogs,
- trainer market overview,
- final scenario summary.

## 11) Why imbalance often dominates the story

Large imbalance cost usually means the plan and the physically feasible outcome diverged. Common causes are:
- event-driven capacity reduction,
- aggressive volume despite lower effective capacity,
- locked hours or gate timing that prevented correction,
- network-induced constraints.

That is why a player can show strong revenue and still have poor profit.

## 12) Solo mode versus shared mode

The engine serves both orchestration models:

### Solo mode

- the player starts the scenario,
- the player advances between rounds after results,
- the flow is self-paced within the scenario rules.

### Shared trainer-led mode

- players submit,
- the UI stays in a waiting state,
- the trainer advances the session,
- engine state updates must stay aligned with that control model.

This difference is operational, not mathematical, but it matters for debugging because some "stuck" reports are really orchestration misunderstandings.

## 13) Recommended debugging sequence

When numbers look wrong, check in this order:
1. session ID, round number, player or role, and timestamp,
2. active events and market availability,
3. player type, devices, and zone assignment,
4. base versus effective capacity or demand,
5. planned versus dispatched or actual quantity,
6. imbalance, curtailment, and ATC or grid cost,
7. whether the UI is rendering the current payload or stale expectations.

## 14) Validation checklist for scenario or engine-facing changes

Before release, verify at least:
- event impacts are visible in effective rows,
- explicit bid layers clear in the expected order,
- zonal costs are explainable when the grid is active,
- round results and final results reconcile with the payload,
- shared-mode waiting and trainer advancement still behave correctly,
- handbook wording still matches the shipped mechanics.

## 15) Common failure patterns

- confusing absolute hours with round-local offsets,
- wrong event target IDs,
- outdated assumptions about how many bid layers exist,
- treating static capacity as if it were settled capacity,
- documenting handbook behavior from old routes instead of current UI.
