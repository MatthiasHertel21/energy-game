export const ROLE_TERMINOLOGY = {
  producer: {
    roleLabel: 'Producer',
    revenueOrCostLabel: 'Revenue',
    totalRevenueOrCostLabel: 'Total Revenue',
    profitOrCoverageLabel: 'Profit',
    totalProfitOrCoverageLabel: 'Total Profit',
    energyLabel: 'Dispatched',
    totalEnergyLabel: 'Total Dispatched',
    energyNoun: 'Dispatched energy',
    co2CardLabel: 'CO₂ Emissions',
    totalCo2Label: 'Total CO₂ Emissions',
    co2ColumnLabel: 'CO₂ Emissions',
    co2BreakdownTitle: 'CO2 Emissions Calculation',
    co2BreakdownDescription: 'Total CO2 emissions for this round (kg).',
    co2BreakdownFormula: 'CO2 = Σ(Dispatched MWh × CO2 Rate kg/MWh)',
    co2TotalLinePrefix: 'Total CO2',
    co2IntensityUnit: 't/MWh',
    co2FallbackUnit: 'Tonnes CO₂',
    coverageFormulaText: 'Coverage = Dispatched MWh / Planned MWh',
  },
  consumer: {
    roleLabel: 'Consumer',
    revenueOrCostLabel: 'Costs',
    totalRevenueOrCostLabel: 'Total Costs',
    profitOrCoverageLabel: 'Coverage',
    totalProfitOrCoverageLabel: 'Coverage',
    energyLabel: 'Consumed',
    totalEnergyLabel: 'Total Consumed',
    energyNoun: 'Consumed energy',
    co2CardLabel: 'CO₂ Caused',
    totalCo2Label: 'Total CO₂ Caused',
    co2ColumnLabel: 'CO₂ Caused',
    co2BreakdownTitle: 'CO2 Caused Calculation',
    co2BreakdownDescription: 'Allocated CO2 caused by consumed energy in this round (kg).',
    co2BreakdownFormula: 'CO2 caused = Consumed MWh × Market average CO2 intensity (kg/MWh)',
    co2TotalLinePrefix: 'Total CO2 caused',
    co2IntensityUnit: 't/MWh consumed',
    co2FallbackUnit: 'Tonnes CO₂ caused',
    coverageFormulaText: 'Coverage = Consumed MWh / Planned MWh',
  }
}

export function getRoleTerminology(isProducer) {
  return isProducer ? ROLE_TERMINOLOGY.producer : ROLE_TERMINOLOGY.consumer
}
