# Interzonal Model Phase 1 Specification

Date: 2026-03-13
Owner: TBD
Status: Draft

## Summary

Phase 1 introduces a physically constrained interzonal grid model while keeping a single global market price.

Commercial clearing remains global and produces one SMP for all zones. After clearing, the engine performs a zonal physical feasibility pass using configured zones, ATC links, per-link losses, and deterministic routing. If a zone cannot fully cover demand from local production plus imports, the remaining shortage creates zonal extra costs. These extra costs are not treated as imbalance and are allocated only to consumers in the affected zone.

## Goals

- Preserve the existing one-market commercial model with a global SMP.
- Use existing zone assignments on player types and devices as physical location inputs.
- Add explicit zonal distribution for synthetic producers and consumers.
- Add deterministic interzonal routing for 2 to 5 zones.
- Expose zone status, link utilization, and zonal extra costs in round results.
- Keep grid constraint costs separate from imbalance costs.

## Non-Goals

- No zonal SMP in Phase 1.
- No separate market per zone.
- No full nodal power flow or voltage model.
- No redispatch compensation scheme for constrained-off generation.
- No topology-first visual redesign in the first implementation cut.

## Product Decisions

- Market model: one-market-model with global SMP.
- Extra costs: separate grid constraint cost, not imbalance.
- Extra cost allocation target: consumers only.
- Losses: applied per link.
- Generator curtailment mode: configurable in KSE.
- Synthetic generation stays in `environment.groups` and synthetic demand stays in `market.consumer_mix`.
- Player physical zone is derived from `player_types[].zone`; `general.player_zone` is legacy fallback only.
- Routing is implemented as deterministic min-cost flow.
- Player results must show zone, zone status, extra cost, and link utilization around the player's zone.

## Scenario Model Changes

### 1. Synthetic Zone Distribution

Phase 1 does not introduce a new top-level synthetic model block.

Instead, existing scenario blocks remain the source of truth:

- synthetic generation stays in `environment.groups`,
- synthetic demand stays in `market.consumer_mix`.

Both structures are extended with explicit zonal distribution vectors across all configured zones.

Requirements:

- Vector length equals `grid.zones`.
- Percentages are non-negative.
- Percentages sum to 100.

Example:

```json
{
  "environment": {
    "groups": {
      "solar": { "share_pct": 40, "zone_distribution_pct": [50, 30, 20] },
      "wind": { "share_pct": 30, "zone_distribution_pct": [20, 40, 40] },
      "gas": { "share_pct": 30, "zone_distribution_pct": [30, 50, 20] }
    }
  },
  "market": {
    "consumer_mix": {
      "residential": { "share_pct": 70, "zone_distribution_pct": [40, 35, 25] },
      "industrial": { "share_pct": 30, "zone_distribution_pct": [20, 50, 30] }
    }
  }
}
```

Backward compatibility:

- existing `environment.zone_split` remains readable for old scenarios,
- new multi-zone scenarios must use explicit zonal distribution vectors instead of `zone_split`.

### 2. Existing Player-Type And Device Zones

For Phase 1, `player_types[].zone` is the authoritative source of physical zone assignment for player-side assets.

Rules:

- all devices assigned to a player type inherit that player type's zone,
- `general.player_zone` remains only as legacy fallback for old scenarios,
- Phase 1 does not require a separate per-device zone override.

The engine must stop collapsing all players into `general.player_zone` for physical flow calculation and instead aggregate by actual configured player-type zone.

### 3. Grid Settlement Settings

Add a new grid settlement block in scenario configuration.

```json
{
  "grid": {
    "zones": 3,
    "atc": [
      [0, 3000, 1500],
      [3000, 0, 2000],
      [1500, 2000, 0]
    ],
    "losses_pct_per_link": 2.0,
    "network_settlement": {
      "extra_cost_mode": "zonal_only",
      "cost_allocation_target": "consumers_only",
      "shortfall_price_mode": "smp_multiplier",
      "shortfall_price_value": 2.0
    },
    "generator_curtailment_mode": "pro_rata"
  }
}
```

### 4. Allowed Values

`grid.network_settlement.extra_cost_mode`

- `zonal_only`
- `partially_socialized`
- `fully_socialized`

`grid.network_settlement.cost_allocation_target`

- `consumers_only`

`grid.network_settlement.shortfall_price_mode`

- `fixed_price`
- `smp_multiplier`
- `value_of_lost_load`

`grid.generator_curtailment_mode`

- `pro_rata`
- `reverse_merit_order`
- `renewables_first`
- `renewables_last`

### 5. Phase 1 Defaults

- `extra_cost_mode = zonal_only`
- `cost_allocation_target = consumers_only`
- `shortfall_price_mode = smp_multiplier`
- `shortfall_price_value = 2.0`
- `generator_curtailment_mode = pro_rata`
- `losses_pct_per_link = 2.0`

## Hourly Engine Flow

The new hourly logic is inserted after commercial clearing.

### Step 1. Commercial Clearing

- Clear market globally as today.
- Compute commercial SMP and commercially cleared player/device quantities.

### Step 2. Zonal Aggregation

For each hour and zone, aggregate:

- local commercially cleared generation,
- local consumer demand,
- local synthetic generation,
- local synthetic demand.

### Step 3. Raw Net Position

For each zone:

```text
raw_net_position_mwh = local_generation_cleared_mwh - local_demand_mwh
```

Positive values indicate surplus available for export.

Negative values indicate deficit requiring imports.

### Step 4. Deterministic Routing

Use deterministic routing over the zone graph.

Rules:

- Direct links are preferred over indirect paths.
- If several paths are equally good, use fixed tie-break by ascending zone id.
- Primary objective: maximize coverage of deficit zones.
- Secondary objective: prefer lower path length or lower transport burden.
- Losses are applied on every traversed link.

Implementation approach:

- deterministic min-cost flow is the required routing model for Phase 1.

The solver goal ordering is:

- maximize coverage of deficit zones,
- minimize transport cost proxy such as path length or link-loss burden,
- resolve ties deterministically by ascending zone id.

This keeps flows reproducible for 2 to 5 zones and avoids order-dependent path artifacts.

### Step 5. Link-Level Flow And Losses

For each used link:

- enforce ATC cap,
- compute actual flow,
- compute delivered energy after losses,
- compute utilization percentage,
- mark whether the link is binding.

### Step 6. Final Deliverable Generation

If a surplus zone cannot export all commercially cleared generation, the excess becomes grid curtailment.

Per generator and per zone, track:

- `market_cleared_mwh`
- `grid_deliverable_mwh`
- `grid_curtailed_mwh`

Formula:

```text
grid_curtailed_mwh = market_cleared_mwh - grid_deliverable_mwh
```

The constrained-off share:

- is not imbalance,
- does not receive revenue in Phase 1,
- does not trigger extra generator penalties in Phase 1.

### Step 7. Generator Curtailment Distribution

When a zone must reduce export-constrained generation, curtailment is distributed using `grid.generator_curtailment_mode`.

Modes:

- `pro_rata`
- `reverse_merit_order`
- `renewables_first`
- `renewables_last`

Phase 1 recommendation: `pro_rata`.

### Step 8. Unserved Demand And Extra Costs

If a zone remains short after all feasible imports, compute:

- `unserved_demand_mwh`
- `shortfall_price_zar_per_mwh`
- `extra_cost_total_zar`

Formula:

```text
extra_cost_total_zar = unserved_demand_mwh * shortfall_price_zar_per_mwh
```

If `shortfall_price_mode = smp_multiplier`:

```text
shortfall_price_zar_per_mwh = smp * shortfall_price_value
```

### Step 9. Cost Allocation To Consumers Only

In Phase 1, extra costs are allocated only to consumers in the affected zone.

Recommended rule:

```text
zone_extra_cost_per_consumed_mwh_zar = extra_cost_total_zar / zone_consumed_mwh
```

Player allocation:

```text
player_grid_constraint_cost_zar = player_consumed_mwh * zone_extra_cost_per_consumed_mwh_zar
```

Guard against divide-by-zero when `zone_consumed_mwh = 0`.

## Zone Status Model

Every zone receives one of three statuses per hour and per round aggregate.

- `local_supply_sufficient`
- `grid_supported_supply`
- `supply_shortfall`

Meaning:

- `local_supply_sufficient`: local production alone covered local demand.
- `grid_supported_supply`: local production did not suffice, but local production plus imports did.
- `supply_shortfall`: demand remained uncovered after feasible imports.

## Result Payload Extensions

### 1. Round-Level Zone Results

```json
{
  "zone_results": [
    {
      "zone_id": 1,
      "status": "grid_supported_supply",
      "local_generation_mwh": 4200,
      "local_demand_mwh": 5000,
      "imports_mwh": 900,
      "exports_mwh": 0,
      "losses_mwh": 18,
      "unserved_demand_mwh": 0,
      "extra_cost_total_zar": 0,
      "extra_cost_per_mwh_zar": 0,
      "coverage_local_pct": 84.0,
      "coverage_total_pct": 100.0
    }
  ]
}
```

### 2. Round-Level Link Results

```json
{
  "link_results": [
    {
      "from_zone": 1,
      "to_zone": 2,
      "atc_mwh": 3000,
      "flow_mwh": 2600,
      "utilization_pct": 86.7,
      "losses_mwh": 52,
      "binding": false
    }
  ]
}
```

### 3. Player Zone Info

```json
{
  "player_zone_info": {
    "zone_id": 2,
    "zone_status": "supply_shortfall",
    "zone_local_generation_mwh": 1800,
    "zone_local_demand_mwh": 2600,
    "zone_imports_mwh": 500,
    "zone_exports_mwh": 0,
    "zone_unserved_demand_mwh": 300,
    "zone_extra_cost_total_zar": 600000,
    "zone_extra_cost_per_mwh_zar": 260.9,
    "zone_coverage_total_pct": 88.5,
    "zone_links": [
      {
        "peer_zone": 1,
        "flow_mwh": 500,
        "atc_mwh": 500,
        "utilization_pct": 100.0
      }
    ]
  }
}
```

## KPI Changes

Add a separate grid cost block.

- `grid_constraint_cost_zar`
- `grid_constraint_cost_per_mwh_zar`
- `zone_shortfall_mwh`

Profit formula:

```text
profit_zar = revenue_zar
           - variable_cost_zar
           - fixed_cost_zar
           - imbalance_cost_zar
           - grid_constraint_cost_zar
           + congestion_revenue_zar
```

`grid_constraint_cost_zar` must not be merged into `imbalance_cost_zar`.

## UI Requirements For Round Results

Every player round result must expose:

- player zone badge,
- zone status card,
- zonal extra cost total and cost per MWh,
- local generation and local demand of the zone,
- imports and exports of the zone,
- unserved demand of the zone,
- relevant link utilization around the player's zone.

Phase 1 UI can use cards and tables. Topology visualization is optional later.

## Validation Requirements

Add validation rules for:

- zone distribution vectors sum to 100,
- zone distribution vector length equals configured zones,
- no negative distribution values,
- `environment.groups` remains valid for generation mix,
- `market.consumer_mix` remains valid for demand mix,
- valid `generator_curtailment_mode`,
- valid `extra_cost_mode`,
- valid `shortfall_price_mode`,
- positive `shortfall_price_value`,
- valid `losses_pct_per_link`,
- all configured `player_types[].zone` values lie within `1..zones`,
- legacy `general.player_zone` remains valid when present.

## Backward Compatibility

- Existing scenarios without the new grid settlement block default to Phase 1 defaults.
- Existing scenarios with old `environment.zone_split` remain readable, but new zonal synthetic modeling should use explicit distribution vectors inside `environment.groups` and `market.consumer_mix`.
- Historical result payloads remain readable without `zone_results`, `link_results`, or `player_zone_info`.

## Suggested Delivery Sequence

1. Scenario schema and validation.
2. KSE UI for new fields.
3. Engine-side zonal aggregation and routing.
4. KPI and result payload extensions.
5. Player round-result UI.
6. Regression tests and scenario smoke checks.

## Definition Of Done

- Scenarios can configure zonal synthetic distributions and grid settlement rules.
- Engine uses actual zone assignments for synthetic and player-side quantities.
- Routing produces deterministic link flows for 2 to 5 zones.
- Unserved demand creates zonal extra costs allocated only to consumers.
- Grid constraint cost is visible as a separate KPI.
- Player round results show zone, zone status, and link utilization.
- Regression coverage exists for 2-zone and multi-zone cases, including shortages and constrained-off generation.