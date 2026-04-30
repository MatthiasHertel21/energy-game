# Designer Guide

Last updated: 2026-04-30  
Audience: Scenario/Campaign Designers

## 1) What good scenario design means here

A good scenario is not only technically valid; it creates clear learning signals:
- player decisions should visibly affect outcomes,
- events should create explainable, not random-feeling shifts,
- KPI results should be interpretable in debrief.

## 2) Designer responsibilities

Designers own:
- campaign and scenario structure,
- market timing and gate logic,
- device portfolio realism,
- event/challenge balance,
- role fairness and educational difficulty.

## 3) Main tooling surfaces

- `/designer`: campaign/scenario management.
- `/kse`: detailed scenario configuration (general, market, events, player types, challenges, etc.).
- Export/import workflow: reproducibility and review with JSON snapshots.

## 4) Scenario architecture (recommended mental model)

Treat config blocks as separate design layers:
- `general`: time mechanics and round structure.
- `market` + `markets`: price/volume envelope and DA/ID availability per round.
- `devices` + `player_types`: who controls which assets.
- `events`: controlled disruption and adaptation pressure.
- `challenges` + `scoring`: what behavior is rewarded.
- `environment` + `grid`: context realism and multi-zone topology.
- `player_input`: which hours players can edit and how.

Design quality improves when each layer has a clear teaching purpose.

## 5) Timing and market availability design

Critical relationships:
- `rounds × round_span_hours` defines total scenario horizon,
- gate/freeze settings define what can still be edited,
- `markets.<key>.trading` controls DA/ID opportunities per round.

Practical guidance:
- start simple in early rounds,
- increase decision pressure in middle rounds,
- avoid introducing too many mechanism shifts at once.

## 6) Devices and player type mapping

Each `player_type` should have a coherent strategic identity:
- asset mix supports meaningful trade-offs,
- capacities and costs create differentiated options,
- naming is explicit enough for debrief discussion.

Do not rename IDs in active ecosystems unless migration is planned.

### Variable cost tiers (coal and gas)

Coal and gas devices support a tiered cost structure that models increasing marginal cost at higher utilization:

```json
"variable_cost_tiers": [
  { "from_pct": 0,  "to_pct": 60,  "cost_zar_per_mwh": 380 },
  { "from_pct": 60, "to_pct": 90,  "cost_zar_per_mwh": 440 },
  { "from_pct": 90, "to_pct": 100, "cost_zar_per_mwh": 520 }
]
```

All tiers are shown in the player’s My Devices card so players can reason about marginal cost before bidding. A weighted average of the tiers is used for default bid price suggestions.

### Battery auto-bid configuration

Batteries can be configured to allow auto-mode for players:
- `auto_bid_allowed: true` enables the auto-mode toggle on the player screen.
- Players set a `buy_threshold_zar_mwh` (charge below this SMP) and a `sell_threshold_zar_mwh` (discharge above this SMP).
- Manual bid curves are disabled while auto-mode is active.

### Grid and zone configuration

Scenarios can model multi-zone electricity grids:

- `grid.zones`: number of zones (1–5).
- `grid.atc`: Available Transmission Capacity matrix (zones × zones, diagonal is 0).
- `grid.losses_pct_per_link`: percentage loss per transmission link.
- `grid.network_settlement`: how shortfall costs are allocated (`extra_cost_mode`, `cost_allocation_target`, `shortfall_price_mode`, `shortfall_price_value`).
- `grid.generator_curtailment_mode`: how generation is curtailed when surplus occurs (`pro_rata` or minimum-cost).

Each `player_type` can be assigned a `zone` field to locate their devices on the grid.

### Player input scope

Control which hours players can actively edit:

- `player_input.mode`: `"all_hours"` (default) or restricted.
- `player_input.editable_offsets`: list of hour offsets (relative to round start) that are editable.
- `player_input.hide_non_editable_hours`: if `true`, non-editable hour slots are hidden from the chart.
- `player_input.allow_other_rounds_editing`: whether players can pre-fill future-round hours.

Note: hidden non-editable hours are always submitted as 0 to prevent invisible bids from affecting clearing results.

## 7) Event design patterns

### A) Capability shock (e.g., outage)

- Use multiplier < 1 on targeted role/device.
- Ensure players can react (not pure unavoidable punishment).

### B) Demand shock

- Increase demand for specific roles/time windows.
- Pair with clear guidance in task text.

### C) Opportunity event

- Positive renewable or flexibility event.
- Encourage tactical repositioning, not passive gain.

### Event quality checks

- trigger timing aligns with round narrative,
- target scope is unambiguous (`all`, `player`, `device`),
- duration is long enough to react but short enough to learn.

## 8) Challenge and scoring calibration

Challenges should motivate role-appropriate behavior:
- producers: profitability and controllable risk,
- consumers: coverage and cost discipline,
- mixed roles: balance and adaptability.

Scoring weights should match learning goals.  
If imbalance awareness is central, keep imbalance weight meaningful relative to profit.

## 9) Balancing realism and playability

Too easy:
- outcomes insensitive to decisions,
- no meaningful event pressure,
- all players converge to same strategy.

Too hard:
- persistent negative outcomes without clear recovery path,
- timing complexity exceeds session pacing,
- event effects dominate all strategy choices.

Target: high signal, manageable complexity.

## 10) Validation workflow before release

1. **Static validation**
	- references and IDs are consistent,
	- role/device mappings complete,
	- numeric ranges plausible.
2. **Single-player dry run**
	- test one role through multiple rounds,
	- confirm KPI and detail consistency.
3. **Shared-mode simulation**
	- test trainer flow, submit waiting, round transitions.
4. **Debrief sanity check**
	- verify outcomes are explainable from available data.

## 11) Versioning and change governance

For each scenario revision, record:
- what changed,
- why it changed,
- expected impact on behavior,
- validation evidence.

Use export snapshots for rollback and peer review.

## 12) Common design pitfalls

- Event target mismatch (wrong role ID).
- Market arrays inconsistent with intended teaching timeline.
- Challenges disconnected from controllable player actions.
- Device capacity/cost values that make one strategy dominant.

## 13) Practical pre-launch checklist

- Timeline coherent and understandable.
- Role balance acceptable across at least one full run.
- Event effects visible in detail outputs.
- KPI interpretation text still makes sense for your mechanics.
- Trainer can explain top 3 expected failure modes.
