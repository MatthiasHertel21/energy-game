# Device Parameters

This document lists the device parameters that are currently consumed by gameplay logic.

Only parameters that affect forecasting, bidding, dispatch, clearing, settlement, emissions, curtailment, or storage state are included here.
Parameters not listed in this document are currently not gameplay-active.

## Coal Power Plant

- `max_power_mw`: Maximum generation capacity used as an upper bound for available output and dispatch.
- `min_load_pct`: Minimum stable operating level used when building baseline generator output and validating generator forecasts.
- `variable_cost_zar_per_mwh`: Variable production cost used as the default offer price in market clearing.
- `fixed_cost_zar_per_hour`: Fixed hourly operating cost included in cost and profit settlement.
- `co2_emissions_kg_per_mwh`: Emissions intensity used for CO2 accounting in round KPIs.
- `availability_profile`: Hourly availability factor applied to the unit's available capacity.
- `bid_count`: Controls whether the device uses implicit single-cost bidding or explicit multi-bid behavior.
- `curtailment_priority`: Determines how early the unit is curtailed when network or balancing constraints force curtailment.

## Gas Turbine

- `max_power_mw`: Maximum generation capacity used as an upper bound for available output and dispatch.
- `min_load_pct`: Minimum stable operating level used when building baseline generator output and validating generator forecasts.
- `variable_cost_zar_per_mwh`: Variable production cost used as the default offer price in market clearing.
- `fixed_cost_zar_per_hour`: Fixed hourly operating cost included in cost and profit settlement.
- `co2_emissions_kg_per_mwh`: Emissions intensity used for CO2 accounting in round KPIs.
- `availability_profile`: Hourly availability factor applied to the unit's available capacity.
- `bid_count`: Controls whether the device uses implicit single-cost bidding or explicit multi-bid behavior.
- `curtailment_priority`: Determines how early the unit is curtailed when network or balancing constraints force curtailment.

## Hydro Power

- `max_power_mw`: Maximum generation capacity used as an upper bound for available output and dispatch.
- `min_load_pct`: Minimum stable operating level used when building baseline generator output and validating generator forecasts.
- `variable_cost_zar_per_mwh`: Variable production cost used as the default offer price in market clearing.
- `fixed_cost_zar_per_hour`: Fixed hourly operating cost included in cost and profit settlement.
- `co2_emissions_kg_per_mwh`: Emissions intensity used for CO2 accounting in round KPIs.
- `availability_profile`: Hourly availability factor applied to the unit's available capacity.
- `bid_count`: Controls whether the device uses implicit single-cost bidding or explicit multi-bid behavior.
- `curtailment_priority`: Determines how early the unit is curtailed when network or balancing constraints force curtailment.

## Nuclear Power Plant

- `max_power_mw`: Maximum generation capacity used as an upper bound for available output and dispatch.
- `min_load_pct`: Minimum stable operating level used when building baseline generator output and validating generator forecasts.
- `variable_cost_zar_per_mwh`: Variable production cost used as the default offer price in market clearing.
- `fixed_cost_zar_per_hour`: Fixed hourly operating cost included in cost and profit settlement.
- `co2_emissions_kg_per_mwh`: Emissions intensity used for CO2 accounting in round KPIs.
- `availability_profile`: Hourly availability factor applied to the unit's available capacity.
- `must_run`: Marks the unit as inflexible so it can force dispatch behavior even in edge cases with no flexible supply volume.
- `bid_count`: Controls whether the device uses implicit single-cost bidding or explicit multi-bid behavior.
- `curtailment_priority`: Determines how early the unit is curtailed when network or balancing constraints force curtailment.

## Solar PV

- `max_power_mw`: Installed capacity used as the base for available renewable output.
- `capacity_factor_pct`: Additional scaling factor applied to renewable availability.
- `variable_cost_zar_per_mwh`: Offer price used if the solar unit submits implicit cost-based supply.
- `fixed_cost_zar_per_hour`: Fixed hourly operating cost included in cost and profit settlement.
- `co2_emissions_kg_per_mwh`: Emissions intensity used for CO2 accounting in round KPIs.
- `availability_profile`: Hourly availability factor applied to the solar unit's available capacity.
- `bid_count`: Controls whether the device uses implicit single-cost bidding or explicit multi-bid behavior.
- `curtailment_priority`: Determines how early the unit is curtailed when network or balancing constraints force curtailment.

## Wind Turbine

- `max_power_mw`: Installed capacity used as the base for available renewable output.
- `capacity_factor_pct`: Additional scaling factor applied to renewable availability.
- `variable_cost_zar_per_mwh`: Offer price used if the wind unit submits implicit cost-based supply.
- `fixed_cost_zar_per_hour`: Fixed hourly operating cost included in cost and profit settlement.
- `co2_emissions_kg_per_mwh`: Emissions intensity used for CO2 accounting in round KPIs.
- `availability_profile`: Hourly availability factor applied to the wind unit's available capacity.
- `bid_count`: Controls whether the device uses implicit single-cost bidding or explicit multi-bid behavior.
- `curtailment_priority`: Determines how early the unit is curtailed when network or balancing constraints force curtailment.

## Battery Storage

- `capacity_mwh`: Energy capacity used to track the battery state of charge.
- `power_mw`: Maximum charging and discharging power used to cap hourly battery dispatch.
- `efficiency_pct`: Round-trip efficiency used when updating state of charge during charge and discharge.
- `initial_soc_pct`: Initial state of charge at the beginning of the round.
- `max_dod_pct`: Maximum depth of discharge used to derive the minimum allowed state of charge.
- `fixed_cost_zar_per_hour`: Fixed hourly operating cost included in cost and profit settlement.
- `availability_profile`: Hourly availability factor applied to the battery's usable power.
- `bid_count`: Controls whether the battery uses implicit behavior or explicit multi-bid offers.
- `charge_price_zar_per_mwh`: Maximum price the battery is willing to pay when a classic forecast implies charging demand.

## Industrial Load

- `baseline_load_mw`: Base demand level used to construct the hourly consumption baseline.
- `load_profile`: Hourly load factor applied to the baseline demand.
- `fixed_cost_zar_per_hour`: Fixed hourly operating cost included in cost and profit settlement.
- `value_of_lost_load`: Maximum willingness-to-pay used for implicit consumer bids in market clearing.
- `willingness_to_pay`: Alternative engine-supported key for the same willingness-to-pay behavior.
- `bid_count`: Controls whether the consumer uses implicit willingness-to-pay bidding or explicit multi-bid demand offers.

## Commercial Load

- `baseline_load_mw`: Base demand level used to construct the hourly consumption baseline.
- `load_profile`: Hourly load factor applied to the baseline demand.
- `fixed_cost_zar_per_hour`: Fixed hourly operating cost included in cost and profit settlement.
- `value_of_lost_load`: Maximum willingness-to-pay used for implicit consumer bids in market clearing.
- `willingness_to_pay`: Alternative engine-supported key for the same willingness-to-pay behavior.
- `bid_count`: Controls whether the consumer uses implicit willingness-to-pay bidding or explicit multi-bid demand offers.

## Residential Load

- `baseline_load_mw`: Base demand level used to construct the hourly consumption baseline.
- `load_profile`: Hourly load factor applied to the baseline demand.
- `fixed_cost_zar_per_hour`: Fixed hourly operating cost included in cost and profit settlement.
- `value_of_lost_load`: Maximum willingness-to-pay used for implicit consumer bids in market clearing.
- `willingness_to_pay`: Alternative engine-supported key for the same willingness-to-pay behavior.
- `bid_count`: Controls whether the consumer uses implicit willingness-to-pay bidding or explicit multi-bid demand offers.