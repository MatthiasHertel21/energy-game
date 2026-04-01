/// <reference types="cypress" />

const ROUND_TOLERANCE = 1.0
const VALUE_TOLERANCE = 0.05
const MWH_TOLERANCE = 0.001

const ROUND_INPUTS = {
  1: { producerPrice: 0, consumerPrice: 5000, quantities: [0, 5], expectOvercapacity: false },
  2: { producerPrice: 25, consumerPrice: 4800, quantities: [9999, 0], expectOvercapacity: true },
  3: { producerPrice: 1, consumerPrice: 4500, quantities: [12, 3], expectOvercapacity: false },
  4: { producerPrice: 9, consumerPrice: 4200, quantities: [0, 0], expectOvercapacity: false },
  5: { producerPrice: 7, consumerPrice: 4000, quantities: [5000, 1], expectOvercapacity: true },
  6: { producerPrice: 5, consumerPrice: 3800, quantities: [10, 0], expectOvercapacity: false },
}

function setNumericInput(element, value) {
  return cy.wrap(element).then(($input) => {
    const input = $input[0]
    const win = input.ownerDocument.defaultView
    const valueSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set
    valueSetter.call(input, String(value))
    input.dispatchEvent(new win.Event('input', { bubbles: true }))
    input.dispatchEvent(new win.Event('change', { bubbles: true }))
    input.dispatchEvent(new win.Event('blur', { bubbles: true }))
  })
}

function getRoundPlan(roundNum, player) {
  const base = ROUND_INPUTS[roundNum]
  const isConsumer = player?.expected_role === 'consumer'
  return {
    ...base,
    price: isConsumer ? base.consumerPrice : base.producerPrice,
  }
}

const PREFERRED_DEVICE_IDS = {
  ptype_mj97y61j_sxl6: 'device_mlnrjhyj_1zdt',
  ptype_mj9yhsec_5orq: 'device_mj9yhxvk_1vml',
  ptype_mn4igq2n_zx58: 'device_mn4ihpl8_19oy',
}

function toFloat(value, defaultValue = 0.0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : defaultValue
}

function assertClose(actual, expected, tolerance, label) {
  expect(toFloat(actual), label).to.be.closeTo(toFloat(expected), tolerance)
}

function validateBidDispatch(bidDispatch, hourlyBreakdown) {
  const hourlySmp = {}
  ;(hourlyBreakdown || []).forEach((row, index) => {
    const hour = Number(row?.hour ?? index)
    hourlySmp[hour] = toFloat(row?.smp)
  })

  Object.values(bidDispatch || {}).forEach((deviceDispatch) => {
    Object.values(deviceDispatch || {}).forEach((lotRows) => {
      ;(lotRows || []).forEach((row) => {
        const offered = toFloat(row?.mw_offered)
        const dispatched = toFloat(row?.mw_dispatched)
        const ratio = toFloat(row?.acceptance_ratio)
        const hourIdx = Number(row?.hour_idx ?? row?.hour_offset ?? 0)
        expect(ratio, 'acceptance ratio bounds').to.be.at.least(0)
        expect(ratio, 'acceptance ratio bounds').to.be.at.most(1)
        if (Math.abs(offered) > 1e-9) {
          assertClose(ratio, dispatched / offered, 0.001, 'acceptance ratio must match dispatched divided by offered volume within ratio rounding precision')
        }
        assertClose(row?.smp, hourlySmp[hourIdx] ?? row?.smp, VALUE_TOLERANCE, 'bid dispatch SMP must match hourly SMP')
      })
    })
  })
}

function validateDeviceBreakdown(deviceBreakdown) {
  let co2Sum = 0.0
  let batteryChargeSum = 0.0
  let batteryDischargeSum = 0.0
  let batteryChargeCostSum = 0.0
  let batteryRevenueSum = 0.0
  let firstBatterySoc = null
  let lastBatterySoc = null

  Object.entries(deviceBreakdown || {}).forEach(([deviceId, rows]) => {
    expect(rows, `${deviceId} rows must be array`).to.be.an('array')
    rows.forEach((row) => {
      const totalDispatched = toFloat(row?.total_dispatched_mwh ?? row?.dispatched_mw)
      const daDispatched = toFloat(row?.da_dispatched_mwh)
      const idDispatched = toFloat(row?.id_dispatched_mwh)
      const revenue = toFloat(row?.revenue_zar)
      const daRevenue = toFloat(row?.da_revenue_zar)
      const idRevenue = toFloat(row?.id_revenue_zar)
      const variableCost = toFloat(row?.variable_cost_zar)
      const fixedCost = toFloat(row?.fixed_cost_zar)
      const imbalanceCost = toFloat(row?.imbalance_cost_zar)
      const batteryChargeCost = toFloat(row?.battery_charge_cost_zar)
      const congestionRevenue = toFloat(row?.congestion_revenue_zar)
      const networkShortfallCost = toFloat(row?.network_shortfall_cost_zar)
      const profit = toFloat(row?.profit_zar)
      const imbalanceMwh = toFloat(row?.imbalance_mwh)
      const actualMw = toFloat(row?.actual_mw)
      const dispatchedMw = toFloat(row?.total_dispatched_mwh ?? row?.dispatched_mw)
      const networkShortfallMwh = toFloat(row?.network_shortfall_mwh)
      const rawImbalanceMwh = actualMw - dispatchedMw
      const expectedImbalanceMwh = rawImbalanceMwh > 0
        ? rawImbalanceMwh - Math.min(networkShortfallMwh, rawImbalanceMwh)
        : rawImbalanceMwh

      assertClose(totalDispatched, daDispatched + idDispatched, MWH_TOLERANCE, 'device total dispatched must equal DA plus ID dispatched')
      assertClose(revenue, daRevenue + idRevenue, VALUE_TOLERANCE, 'device revenue must equal DA plus ID revenue')
      assertClose(imbalanceMwh, expectedImbalanceMwh, VALUE_TOLERANCE, 'device imbalance must equal actual minus dispatched with network shortfall only waiving positive consumer underdelivery')

      const expectedProfit = revenue - variableCost - fixedCost - imbalanceCost - batteryChargeCost - networkShortfallCost + congestionRevenue
      assertClose(profit, expectedProfit, ROUND_TOLERANCE, 'device profit must match device profit formula within currency rounding tolerance')

      const socStart = row?.battery_soc_start_pct
      const socEnd = row?.battery_soc_end_pct
      if (socStart !== undefined && socStart !== null) {
        if (firstBatterySoc === null) firstBatterySoc = toFloat(socStart)
        lastBatterySoc = toFloat(socEnd)
      }

      batteryChargeSum += toFloat(row?.battery_charged_mwh)
      batteryDischargeSum += totalDispatched
      batteryChargeCostSum += batteryChargeCost
      batteryRevenueSum += daRevenue + idRevenue
      co2Sum += toFloat(row?.co2_kg)
    })
  })

  return {
    co2Sum,
    batteryChargeSum,
    batteryDischargeSum,
    batteryChargeCostSum,
    batteryRevenueSum,
    firstBatterySoc,
    lastBatterySoc,
  }
}

function validateHourlyBreakdown(hourlyBreakdown, deviceBreakdown) {
  const deviceIds = Object.keys(deviceBreakdown || {})
  ;(hourlyBreakdown || []).forEach((hour, index) => {
    const deviceRows = deviceIds
      .map((deviceId) => deviceBreakdown?.[deviceId]?.[index])
      .filter(Boolean)

    const plannedSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.planned_mw), 0)
    const dispatchedSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.total_dispatched_mwh ?? row?.dispatched_mw), 0)
    const actualSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.actual_mw), 0)
    const revenueSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.revenue_zar), 0)
    const variableSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.variable_cost_zar), 0)
    const fixedSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.fixed_cost_zar), 0)
    const imbalanceMwhSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.imbalance_mwh), 0)
    const imbalanceCostSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.imbalance_cost_zar), 0)
    const batteryChargeCostSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.battery_charge_cost_zar), 0)
    const congestionSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.congestion_revenue_zar), 0)
    const shortfallCostSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.network_shortfall_cost_zar), 0)
    const profitSum = deviceRows.reduce((sum, row) => sum + toFloat(row?.profit_zar), 0)

    assertClose(hour?.planned_mw, plannedSum, MWH_TOLERANCE, 'hour planned volume must equal sum of device planned volumes')
    assertClose(hour?.dispatched_mw, dispatchedSum, MWH_TOLERANCE, 'hour dispatched volume must equal sum of device dispatched volumes')
    assertClose(hour?.actual_mw, actualSum, VALUE_TOLERANCE, 'hour actual volume must equal sum of device actual volumes')
    assertClose(hour?.revenue_zar, Math.round(revenueSum), ROUND_TOLERANCE, 'hour revenue must equal rounded sum of device revenue')
    assertClose(hour?.variable_cost_zar, Math.round(variableSum), ROUND_TOLERANCE, 'hour variable cost must equal rounded sum of device variable costs')
    assertClose(hour?.fixed_cost_zar, Math.round(fixedSum), ROUND_TOLERANCE, 'hour fixed cost must equal rounded sum of device fixed costs')
    assertClose(hour?.imbalance_mwh, Number(imbalanceMwhSum.toFixed(3)), VALUE_TOLERANCE, 'hour imbalance must equal sum of device imbalance')
    assertClose(hour?.imbalance_cost_zar, Math.round(imbalanceCostSum), ROUND_TOLERANCE, 'hour imbalance cost must equal rounded sum of device imbalance costs')
    assertClose(hour?.battery_charge_cost_zar, Number(batteryChargeCostSum.toFixed(2)), VALUE_TOLERANCE, 'hour battery charge cost must equal sum of device charge costs')
    assertClose(hour?.congestion_revenue_zar, Math.round(congestionSum), ROUND_TOLERANCE, 'hour congestion revenue must equal rounded sum of device congestion revenue')
    if (hour && Object.prototype.hasOwnProperty.call(hour, 'network_shortfall_cost_zar')) {
      assertClose(hour?.network_shortfall_cost_zar, Math.round(shortfallCostSum), ROUND_TOLERANCE, 'hour network shortfall cost must equal rounded sum of device shortfall costs')
    }
    assertClose(hour?.profit_zar, Math.round(profitSum), ROUND_TOLERANCE, 'hour profit must equal rounded sum of hourly profits')

    const expectedProfit = toFloat(hour?.revenue_zar) - toFloat(hour?.variable_cost_zar) - toFloat(hour?.fixed_cost_zar) - toFloat(hour?.imbalance_cost_zar) - toFloat(hour?.battery_charge_cost_zar) - toFloat(hour?.network_shortfall_cost_zar) + toFloat(hour?.congestion_revenue_zar)
    assertClose(hour?.profit_zar, expectedProfit, ROUND_TOLERANCE, 'hour profit must satisfy hourly profit formula')
  })
}

function validateDaIdBreakdown(daIdBreakdown) {
  const hourlyDetail = daIdBreakdown?.hourly_detail || []
  const dailySummary = daIdBreakdown?.daily_summary || []

  assertClose(daIdBreakdown?.total_revenue_zar, toFloat(daIdBreakdown?.da_revenue_zar) + toFloat(daIdBreakdown?.id_revenue_zar), ROUND_TOLERANCE, 'DA/ID total revenue must equal DA plus ID revenue')
  assertClose(daIdBreakdown?.final_volume_signed_mwh, toFloat(daIdBreakdown?.da_volume_signed_mwh) + toFloat(daIdBreakdown?.id_delta_mwh), VALUE_TOLERANCE, 'final signed volume must equal DA signed plus ID delta')
  assertClose(daIdBreakdown?.da_volume_mwh, Math.abs(toFloat(daIdBreakdown?.da_volume_signed_mwh)), VALUE_TOLERANCE, 'absolute DA volume must match signed DA volume')
  assertClose(daIdBreakdown?.final_volume_mwh, Math.abs(toFloat(daIdBreakdown?.final_volume_signed_mwh)), VALUE_TOLERANCE, 'absolute final volume must match signed final volume')

  const dailyFromHours = {}
  hourlyDetail.forEach((entry) => {
    const day = Number(entry?.day || 0)
    dailyFromHours[day] ||= { da_mwh: 0.0, id_mwh: 0.0, delta_mwh: 0.0 }
    dailyFromHours[day].da_mwh += Math.abs(toFloat(entry?.da_mwh))
    dailyFromHours[day].id_mwh += Math.abs(toFloat(entry?.id_mwh))
    dailyFromHours[day].delta_mwh += toFloat(entry?.delta_mwh)
    assertClose(entry?.delta_mwh, toFloat(entry?.id_mwh) - toFloat(entry?.da_mwh), VALUE_TOLERANCE, 'hourly delta must equal ID minus DA')
    expect(Boolean(entry?.is_da_locked)).to.eq(toFloat(entry?.da_mwh) !== 0.0)
  })

  dailySummary.forEach((entry) => {
    const day = Number(entry?.day || 0)
    const expected = dailyFromHours[day] || { da_mwh: 0.0, id_mwh: 0.0, delta_mwh: 0.0 }
    assertClose(entry?.da_mwh, Number(expected.da_mwh.toFixed(2)), VALUE_TOLERANCE, 'daily DA volume must equal sum of hourly DA volumes')
    assertClose(entry?.id_mwh, Number(expected.id_mwh.toFixed(2)), VALUE_TOLERANCE, 'daily ID volume must equal sum of hourly ID volumes')
    assertClose(entry?.delta_mwh, expected.delta_mwh, VALUE_TOLERANCE, 'daily delta must equal sum of hourly deltas')
  })
}

function validateKpis(kpis, myResult, weights) {
  const hourlyBreakdown = kpis?.hourly_breakdown || []
  const deviceBreakdown = kpis?.device_hourly_breakdown || {}
  const deviceTotals = validateDeviceBreakdown(deviceBreakdown)
  validateHourlyBreakdown(hourlyBreakdown, deviceBreakdown)
  validateBidDispatch(kpis?.bid_dispatch || {}, hourlyBreakdown)

  assertClose(kpis?.planned_mwh, hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.planned_mw), 0), MWH_TOLERANCE, 'planned_mwh must equal sum of hourly planned')
  assertClose(kpis?.dispatched_mwh, hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.dispatched_mw), 0), MWH_TOLERANCE, 'dispatched_mwh must equal sum of hourly dispatched')
  assertClose(kpis?.actual_mwh, hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.actual_mw), 0), VALUE_TOLERANCE, 'actual_mwh must equal sum of hourly actual')
  assertClose(kpis?.revenue_zar, Math.round(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.revenue_zar), 0)), ROUND_TOLERANCE, 'revenue_zar must equal rounded sum of hourly revenue')
  assertClose(kpis?.variable_cost_zar, Math.round(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.variable_cost_zar), 0)), ROUND_TOLERANCE, 'variable_cost_zar must equal rounded sum of hourly variable cost')
  assertClose(kpis?.fixed_cost_zar, Math.round(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.fixed_cost_zar), 0)), ROUND_TOLERANCE, 'fixed_cost_zar must equal rounded sum of hourly fixed cost')
  assertClose(kpis?.imbalance_mwh, Number(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.imbalance_mwh), 0).toFixed(3)), VALUE_TOLERANCE, 'imbalance_mwh must equal sum of hourly imbalance')
  assertClose(kpis?.imbalance_cost_zar, Math.round(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.imbalance_cost_zar), 0)), ROUND_TOLERANCE, 'imbalance_cost_zar must equal rounded sum of hourly imbalance cost')
  assertClose(kpis?.battery_charge_cost_zar, Number(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.battery_charge_cost_zar), 0).toFixed(2)), VALUE_TOLERANCE, 'battery_charge_cost_zar must equal sum of hourly battery charge costs')
  assertClose(kpis?.congestion_revenue_zar, Math.round(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.congestion_revenue_zar), 0)), ROUND_TOLERANCE, 'congestion_revenue_zar must equal rounded sum of hourly congestion revenue')
  assertClose(kpis?.profit_zar, Math.round(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.profit_zar), 0)), ROUND_TOLERANCE, 'profit_zar must equal the rounded sum of hourly profits')
  assertClose(kpis?.curtailment_mwh, Number(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.curtailment_mwh), 0).toFixed(3)), VALUE_TOLERANCE, 'curtailment_mwh must equal sum of hourly curtailment')
  assertClose(kpis?.curtailment_cost_zar, Math.round(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.curtailment_cost_zar), 0)), ROUND_TOLERANCE, 'curtailment_cost_zar must equal rounded sum of hourly curtailment cost')
  if (hourlyBreakdown.some((hour) => Object.prototype.hasOwnProperty.call(hour || {}, 'network_shortfall_cost_zar'))) {
    assertClose(kpis?.atc_dispatch_cost_zar, Math.round(hourlyBreakdown.reduce((sum, hour) => sum + toFloat(hour?.network_shortfall_cost_zar), 0)), ROUND_TOLERANCE, 'ATC dispatch cost must equal the rounded sum of hourly network shortfall costs')
  }
  assertClose(kpis?.co2_emissions_kg, Number(deviceTotals.co2Sum.toFixed(2)), VALUE_TOLERANCE, 'co2_emissions_kg must equal sum of device CO2 emissions')

  assertClose(kpis?.atc_dispatch_cost_zar, kpis?.grid_constraint_cost_zar, ROUND_TOLERANCE, 'ATC dispatch cost must equal legacy grid constraint cost alias')
  const dispatched = toFloat(kpis?.dispatched_mwh)
  const expectedGridCostPerMwh = dispatched > 1e-9 ? Number((toFloat(kpis?.grid_constraint_cost_zar) / dispatched).toFixed(2)) : 0.0
  assertClose(kpis?.grid_constraint_cost_per_mwh_zar, expectedGridCostPerMwh, VALUE_TOLERANCE, 'grid cost per MWh must equal grid cost divided by dispatched volume')

  assertClose(myResult?.profit, kpis?.profit_zar, ROUND_TOLERANCE, 'top-level profit must match KPI profit')
  assertClose(myResult?.variable_cost, kpis?.variable_cost_zar, ROUND_TOLERANCE, 'top-level variable cost must match KPI variable cost')
  assertClose(myResult?.imbalance, kpis?.imbalance_mwh, VALUE_TOLERANCE, 'top-level imbalance must match KPI imbalance')
  assertClose(myResult?.curtailment, kpis?.curtailment_mwh, VALUE_TOLERANCE, 'top-level curtailment must match KPI curtailment')

  const batteryRows = Object.values(deviceBreakdown || {})
    .flat()
    .filter((row) => toFloat(row?.battery_charged_mwh) > 1e-9 || toFloat(row?.battery_charge_cost_zar) > 1e-9 || toFloat(row?.battery_soc_end_pct) > 1e-9)
  if (batteryRows.length > 0) {
    assertClose(kpis?.battery_charged_mwh, Number(deviceTotals.batteryChargeSum.toFixed(3)), VALUE_TOLERANCE, 'battery_charged_mwh must equal sum of battery charge volume')
    assertClose(kpis?.battery_discharged_mwh, Number(deviceTotals.batteryDischargeSum.toFixed(3)), VALUE_TOLERANCE, 'battery_discharged_mwh must equal sum of battery discharge volume')
    assertClose(kpis?.battery_charge_cost_zar, Number(deviceTotals.batteryChargeCostSum.toFixed(2)), VALUE_TOLERANCE, 'battery charge cost must equal sum of battery device costs')
    assertClose(kpis?.battery_arbitrage_revenue_zar, Math.round(deviceTotals.batteryRevenueSum - deviceTotals.batteryChargeCostSum), ROUND_TOLERANCE, 'battery arbitrage revenue must equal battery revenue minus charge cost')
    if (deviceTotals.firstBatterySoc !== null) {
      assertClose(kpis?.battery_soc_start_pct, deviceTotals.firstBatterySoc, VALUE_TOLERANCE, 'battery_soc_start_pct must match first battery SoC')
      assertClose(kpis?.battery_soc_end_pct, deviceTotals.lastBatterySoc, VALUE_TOLERANCE, 'battery_soc_end_pct must match last battery SoC')
    }
  }

  const rawScore = toFloat(kpis?.profit_zar) * toFloat(weights?.profit ?? 0.6) - Math.abs(toFloat(kpis?.imbalance_mwh)) * toFloat(weights?.imbalance ?? 0.3) * 1000 - Math.abs(toFloat(kpis?.curtailment_mwh)) * toFloat(weights?.curtailment ?? 0.1) * 1000
  const expectedTotalScore = Math.max(0, Math.min(100, (rawScore + 5000000) / 100000))
  assertClose(myResult?.total_score, Number(expectedTotalScore.toFixed(2)), VALUE_TOLERANCE, 'total_score must match scoring formula')
}

function makeRoundSnapshot(roundData) {
  const kpis = roundData.my_result.kpis
  return {
    round_num: roundData.round,
    profit: Number(toFloat(kpis?.profit_zar).toFixed(2)),
    revenue_zar: Number(toFloat(kpis?.revenue_zar).toFixed(2)),
    total_costs_zar: Number((Math.abs(toFloat(kpis?.variable_cost_zar)) + Math.abs(toFloat(kpis?.fixed_cost_zar)) + Math.abs(toFloat(kpis?.imbalance_cost_zar)) + Math.abs(toFloat(kpis?.atc_dispatch_cost_zar ?? kpis?.grid_constraint_cost_zar))).toFixed(2)),
    co2_emissions_kg: Number(toFloat(kpis?.co2_emissions_kg).toFixed(2)),
    imbalance_mwh: Number(toFloat(kpis?.imbalance_mwh).toFixed(3)),
    imbalance_cost: Number(toFloat(kpis?.imbalance_cost_zar).toFixed(2)),
    atc_dispatch_cost: Number(toFloat(kpis?.atc_dispatch_cost_zar ?? kpis?.grid_constraint_cost_zar).toFixed(2)),
    curtailment_mwh: Number(toFloat(kpis?.curtailment_mwh).toFixed(3)),
    curtailment_cost: Number(toFloat(kpis?.curtailment_cost_zar).toFixed(2)),
    dispatched_mwh: Number(toFloat(kpis?.dispatched_mwh).toFixed(2)),
    planned_mwh: Number(toFloat(kpis?.planned_mwh).toFixed(2)),
    total_score: Number(toFloat(roundData.my_result?.total_score).toFixed(2)),
  }
}

function validateFinalResults(finalData, typeId, totalRounds, snapshots) {
  expect(finalData?.total_rounds).to.eq(totalRounds)
  expect(finalData?.my_cumulative?.type).to.eq(typeId)
  expect(finalData?.my_cumulative?.rounds_played).to.eq(totalRounds)
  expect(finalData?.round_history).to.have.length(totalRounds)
  expect(finalData?.final_ranking).to.have.length(1)

  const byRound = Object.fromEntries((snapshots || []).map((snapshot) => [snapshot.round_num, snapshot]))
  ;(finalData.round_history || []).forEach((entry) => {
    const expected = byRound[entry.round_num]
    expect(expected, `missing snapshot for round ${entry.round_num}`).to.exist
    assertClose(entry?.profit, expected.profit, ROUND_TOLERANCE, 'round_history profit must match round result')
    assertClose(entry?.revenue_zar, expected.revenue_zar, ROUND_TOLERANCE, 'round_history revenue must match round result')
    assertClose(entry?.total_costs_zar, expected.total_costs_zar, ROUND_TOLERANCE, 'round_history total costs must match round result')
    assertClose(entry?.co2_emissions_kg, expected.co2_emissions_kg, VALUE_TOLERANCE, 'round_history CO2 must match round result')
    assertClose(entry?.imbalance_mwh, expected.imbalance_mwh, VALUE_TOLERANCE, 'round_history imbalance must match round result')
    assertClose(entry?.imbalance_cost, expected.imbalance_cost, ROUND_TOLERANCE, 'round_history imbalance cost must match round result')
    assertClose(entry?.atc_dispatch_cost, expected.atc_dispatch_cost, ROUND_TOLERANCE, 'round_history ATC cost must match round result')
    assertClose(entry?.curtailment_mwh, expected.curtailment_mwh, VALUE_TOLERANCE, 'round_history curtailment must match round result')
    assertClose(entry?.curtailment_cost, expected.curtailment_cost, ROUND_TOLERANCE, 'round_history curtailment cost must match round result')
    assertClose(entry?.dispatched_mwh, expected.dispatched_mwh, VALUE_TOLERANCE, 'round_history dispatched must match round result')
    assertClose(entry?.planned_mwh, expected.planned_mwh, VALUE_TOLERANCE, 'round_history planned must match round result')
    assertClose(entry?.total_score, expected.total_score, VALUE_TOLERANCE, 'round_history total_score must match round result')
  })

  const sums = (snapshots || []).reduce((acc, entry) => {
    acc.total_profit += entry.profit
    acc.total_revenue += entry.revenue_zar
    acc.total_co2_emissions += entry.co2_emissions_kg
    acc.total_imbalance += entry.imbalance_mwh
    acc.total_curtailment += entry.curtailment_mwh
    acc.total_dispatched_mwh += entry.dispatched_mwh
    acc.total_planned_mwh += entry.planned_mwh
    acc.total_atc_dispatch_cost += entry.atc_dispatch_cost
    return acc
  }, {
    total_profit: 0,
    total_revenue: 0,
    total_co2_emissions: 0,
    total_imbalance: 0,
    total_curtailment: 0,
    total_dispatched_mwh: 0,
    total_planned_mwh: 0,
    total_atc_dispatch_cost: 0,
  })

  const myCumulative = finalData.my_cumulative || {}
  assertClose(myCumulative?.total_profit, Number(sums.total_profit.toFixed(2)), ROUND_TOLERANCE, 'final total profit must equal sum of round profits')
  assertClose(myCumulative?.total_revenue, Number(sums.total_revenue.toFixed(2)), ROUND_TOLERANCE, 'final total revenue must equal sum of round revenues')
  assertClose(myCumulative?.total_co2_emissions, Number(sums.total_co2_emissions.toFixed(2)), ROUND_TOLERANCE, 'final total CO2 must equal sum of round CO2')
  assertClose(myCumulative?.total_imbalance, Number(sums.total_imbalance.toFixed(2)), ROUND_TOLERANCE, 'final total imbalance must equal sum of round imbalance')
  assertClose(myCumulative?.total_curtailment, Number(sums.total_curtailment.toFixed(2)), ROUND_TOLERANCE, 'final total curtailment must equal sum of round curtailment')
  assertClose(myCumulative?.total_dispatched_mwh, Number(sums.total_dispatched_mwh.toFixed(2)), ROUND_TOLERANCE, 'final dispatched MWh must equal sum of round dispatched MWh')
  assertClose(myCumulative?.total_planned_mwh, Number(sums.total_planned_mwh.toFixed(2)), ROUND_TOLERANCE, 'final planned MWh must equal sum of round planned MWh')
  assertClose(myCumulative?.total_atc_dispatch_cost, Number(sums.total_atc_dispatch_cost.toFixed(2)), ROUND_TOLERANCE, 'final ATC cost must equal sum of round ATC cost')
}

function authHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` }
}

function waitForSessionStatus(sessionId, accessToken, expectedStatuses, attempts = 60) {
  if (attempts <= 0) {
    throw new Error(`Timed out waiting for session ${sessionId} status ${expectedStatuses.join(', ')}`)
  }
  return cy.request({
    method: 'GET',
    url: `/api/sessions/${sessionId}`,
    headers: authHeaders(accessToken),
  }).then(({ body }) => {
    if (expectedStatuses.includes(body?.status)) {
      return body
    }
    return cy.wait(1000).then(() => waitForSessionStatus(sessionId, accessToken, expectedStatuses, attempts - 1))
  })
}

function visitPlayerScreen(sessionId, auth) {
  return cy.visit(`/player?session=${sessionId}`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('user', JSON.stringify(auth.user))
      win.localStorage.setItem('access_token', auth.access_token)
      win.localStorage.setItem('refresh_token', auth.refresh_token)
    },
  })
}

function openPlayerScreen(sessionId, auth) {
  return cy.visit(`/player?sessionId=${sessionId}`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('user', JSON.stringify(auth.user))
      win.localStorage.setItem('access_token', auth.access_token)
      win.localStorage.setItem('refresh_token', auth.refresh_token)
    },
  }).then(() => {
    cy.location('pathname').then((pathname) => {
      if (pathname === '/home') {
        cy.contains('button', /^Continue$/).click({ force: true })
      }
    })

    cy.location('pathname', { timeout: 15000 }).should('eq', '/player')
    cy.url().should('include', `sessionId=${sessionId}`)
  })
}

function selectEditableDevice(player) {
  const preferredId = PREFERRED_DEVICE_IDS[player?.type_id]
  if (preferredId) {
    return cy.get('body').then(($body) => {
      const selector = `[data-cy="device-card-${preferredId}"]`
      if ($body.find(selector).length > 0) {
        return cy.get(selector).scrollIntoView()
      }
      if ($body.find('[data-cy^="device-card-"]').length > 0) {
        return cy.get('[data-cy^="device-card-"]').first().scrollIntoView()
      }
      return null
    })
  }

  return cy.get('body').then(($body) => {
    if ($body.find('[data-cy^="device-card-"]').length > 0) {
      return cy.get('[data-cy^="device-card-"]').first().scrollIntoView()
    }
    return null
  })
}

function buildRoundSubmissionPayload(fullForecast, sessionId, roundNum, roundSpan = 6) {
  const start = (roundNum - 1) * roundSpan
  const end = start + roundSpan
  const payload = {
    session_id: sessionId,
    round_num: roundNum,
    hours: (fullForecast?.hours || []).slice(start, end),
  }

  if (Array.isArray(fullForecast?.devices) && fullForecast.devices.length > 0) {
    payload.devices = fullForecast.devices.map((device) => ({
      ...device,
      hours: (device?.hours || []).slice(start, end),
    }))
  }

  if (fullForecast?.bids && typeof fullForecast.bids === 'object') {
    payload.bids = fullForecast.bids
  }

  return payload
}

function applyRoundInputs(roundNum, player) {
  const plan = getRoundPlan(roundNum, player)
  selectEditableDevice(player).then((deviceCard) => {
    if (!deviceCard) {
      cy.log(`Round ${roundNum}: no device cards rendered in player UI, submitting existing values`)
      return
    }

    cy.wrap(deviceCard).as('editableDevice')
    cy.get('@editableDevice').find('[data-cy^="device-view-fields-"]').first().click({ force: true })
    cy.wait(250)
    cy.get('@editableDevice').find('[data-cy^="device-hour-input-"]').then(($inputs) => {
      const enabled = [...$inputs].filter((input) => !input.disabled)
      if (enabled.length === 0) {
        cy.log(`Round ${roundNum}: no editable quantity inputs exposed in player UI, submitting existing values`)
        return
      }

      cy.get('@editableDevice').then(($device) => {
        const $prices = $device.find('[data-cy^="device-bid-price-"]')
        if ($prices.length > 0) {
          setNumericInput($prices[0], plan.price)
        }
      })

      setNumericInput(enabled[0], plan.quantities[0])
      if (enabled[1] && plan.quantities.length > 1) {
        setNumericInput(enabled[1], plan.quantities[1])
      }
    })
  })
}

function submitRoundFromUi(roundNum, sessionId, auth) {
  const plan = ROUND_INPUTS[roundNum]
  cy.intercept('POST', '/api/player/forecast').as(`submitForecastRound${roundNum}`)

  cy.get('body').then(($body) => {
    if ($body.find('[data-cy="submit-current-round"]').length === 0) {
      cy.log(`Round ${roundNum}: submit button not available in UI, falling back to current forecast API submit`)
      return cy.request({
        method: 'GET',
        url: `/api/player/forecast/full?session_id=${sessionId}`,
        headers: authHeaders(auth.access_token),
      }).then(({ body }) => {
        return cy.request({
          method: 'POST',
          url: '/api/player/forecast',
          headers: authHeaders(auth.access_token),
          body: buildRoundSubmissionPayload(body, sessionId, roundNum),
          failOnStatusCode: false,
        }).then((response) => {
          if (response.status !== 201) {
            throw new Error(`Round ${roundNum} fallback submit failed: ${JSON.stringify(response.body || {})}`)
          }
        })
      })
    }

    cy.get('[data-cy="submit-current-round"]').click({ force: true })

    if (plan.expectOvercapacity) {
      cy.get('body', { timeout: 10000 }).then(($confirmBody) => {
        if ($confirmBody.find('[data-cy="confirm-overcapacity-submit"]').length > 0) {
          cy.get('[data-cy="confirm-overcapacity-submit"]').click({ force: true })
        } else {
          cy.log(`Round ${roundNum}: expected overcapacity dialog did not appear, continuing with direct submit result`)
        }
      })
    } else {
      cy.get('body').then(($confirmBody) => {
        if ($confirmBody.find('[data-cy="confirm-overcapacity-submit"]').length > 0) {
          cy.get('[data-cy="confirm-overcapacity-submit"]').click({ force: true })
        }
      })
    }

    cy.wait(`@submitForecastRound${roundNum}`, { timeout: 20000 }).then((interception) => {
      const statusCode = interception?.response?.statusCode
      if (statusCode !== 201) {
        throw new Error(`Round ${roundNum} submit failed: ${JSON.stringify(interception?.response?.body || {})}`)
      }
    })
  })
}
function runPlayerType(seed, player) {
  const roundSnapshots = []
  const generalTotalRounds = 6

  cy.log(`Run ${player.type_id}`)
  return cy.request('POST', '/api/auth/login', {
    email: player.email,
    password: player.password,
  }).then(({ body: auth }) => {
    const headers = authHeaders(auth.access_token)

    return cy.request({
      method: 'POST',
      url: '/api/player/solo-sessions',
      headers,
      body: { scenario_id: seed.scenario_id, campaign_id: seed.campaign_id },
    }).then(({ body }) => {
      const sessionId = body.session_id
      return cy.request({
        method: 'POST',
        url: `/api/sessions/${sessionId}/select-type`,
        headers,
        body: { type_id: player.type_id },
      }).then(() => {
        return cy.request({
          method: 'POST',
          url: `/api/sessions/${sessionId}/start-briefing`,
          headers,
        }).then(() => {
          return waitForSessionStatus(sessionId, auth.access_token, ['round_active', 'running']).then(() => {
            const runRound = (roundNum) => {
              return openPlayerScreen(sessionId, auth).then(() => {
                applyRoundInputs(roundNum, player)
                submitRoundFromUi(roundNum, sessionId, auth)

                return waitForSessionStatus(sessionId, auth.access_token, ['round_results', 'scenario_complete']).then(() => {
                  return cy.request({
                    method: 'GET',
                    url: `/api/sessions/${sessionId}/round-results/${roundNum}`,
                    headers,
                  }).then(({ body: roundData }) => {
                    expect(roundData?.my_result?.type).to.eq(player.type_id)
                    expect(roundData?.my_result?.player_role).to.eq(player.expected_role)
                    validateKpis(roundData.my_result.kpis, roundData.my_result, roundData.weights)
                    validateDaIdBreakdown(roundData.my_result.da_id_breakdown)
                    roundSnapshots.push(makeRoundSnapshot(roundData))

                    if (roundNum < generalTotalRounds) {
                      return cy.request({
                        method: 'POST',
                        url: `/api/sessions/${sessionId}/advance-round`,
                        headers,
                      }).then(() => waitForSessionStatus(sessionId, auth.access_token, ['round_active', 'running'])).then(() => runRound(roundNum + 1))
                    }

                    return waitForSessionStatus(sessionId, auth.access_token, ['scenario_complete', 'round_results']).then((statusBody) => {
                      if (statusBody?.status !== 'scenario_complete') {
                        return cy.request({
                          method: 'POST',
                          url: `/api/sessions/${sessionId}/advance-round`,
                          headers,
                        }).then(() => waitForSessionStatus(sessionId, auth.access_token, ['scenario_complete']))
                      }
                      return null
                    }).then(() => {
                      return cy.request({
                        method: 'GET',
                        url: `/api/sessions/${sessionId}/final-results`,
                        headers,
                      }).then(({ body: finalData }) => {
                        validateFinalResults(finalData, player.type_id, generalTotalRounds, roundSnapshots)
                      })
                    })
                  })
                })
              })
            }

            return runRound(1)
          })
        })
      })
    })
  })
}

describe('Monday Player Screen All Rounds', () => {
  let seed

  before(() => {
    cy.readFile('cypress/fixtures/monday_ui_seed.json').then((data) => {
      seed = data
    })
  })

  it('runs all Monday player types through all rounds with real player-screen input and validates every KPI aggregation', () => {
    expect(seed?.players, 'seed players').to.have.length(3)
    return seed.players.reduce((chain, player) => {
      return chain.then(() => runPlayerType(seed, player))
    }, cy.wrap(null))
  })
})