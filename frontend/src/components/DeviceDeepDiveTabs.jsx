import React, { useState } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography
} from '@mui/material'
import { getVisibleHourIndices, shouldHideNonEditableHours } from '../utils/playerInputScope'

/**
 * DeviceDeepDiveTabs - Shows hourly breakdown per device with tabs
 * @param {Object} results - Round results data
 * @param {Object} scenario - Scenario configuration
 * @param {string} roleType - 'producer' or 'consumer'
 */
export default function DeviceDeepDiveTabs({ results, scenario, roleType }) {
  const [selectedDeviceIdx, setSelectedDeviceIdx] = useState(0)

  if (!results || !results.my_result) {
    return null
  }

  const { my_result } = results
  const currentRound = Number(results?.round || 0)
  const roundSpan = Number(scenario?.config?.general?.round_span_hours || 6)
  const forecastHorizon = Number(scenario?.config?.general?.forecast_horizon_hours || scenario?.config?.general?.horizon_hours || 48)
  const roundStartHour = Math.max(0, (currentRound - 1) * roundSpan)
  const roundEndHour = roundStartHour + roundSpan
  const hideNonEditableHours = shouldHideNonEditableHours(scenario?.config || {}, roundSpan)
  const visibleHourSet = new Set(
    getVisibleHourIndices(scenario?.config || {}, forecastHorizon, roundSpan)
      .filter((hourIdx) => hourIdx >= roundStartHour && hourIdx < roundEndHour)
  )
  const isIdmRound = currentRound > 1
  const isConsumer = roleType === 'consumer'
  const roundLevelIdp = Number(my_result?.idp)
  const roundLevelDaPrice = Number(
    my_result?.kpis?.hourly_breakdown?.find((entry) => entry?.da_price_zar !== undefined && entry?.da_price_zar !== null)?.da_price_zar
  )

  const getTradingStatusForRound = (marketKey) => {
    const marketsCfg = scenario?.config?.markets || {}
    const roundIdx = Math.max(0, currentRound - 1)
    const marketData = marketsCfg?.[marketKey]

    if (Array.isArray(marketData)) {
      return marketData[roundIdx] ?? 'market_code'
    }
    if (marketData && typeof marketData === 'object') {
      const tradingArray = marketData.trading
      if (Array.isArray(tradingArray)) {
        return tradingArray[roundIdx] ?? 'market_code'
      }
    }
    return 'market_code'
  }

  const damStatus = getTradingStatusForRound('dam')
  const idmStatus = getTradingStatusForRound('idm')
  const isCurrentRoundDamOnly = currentRound > 1 && damStatus !== 'off' && idmStatus === 'off'
  
  // Debug logging
  console.log('[DeviceDeepDive] results:', results)
  console.log('[DeviceDeepDive] my_result:', my_result)
  console.log('[DeviceDeepDive] my_result.bid_dispatch:', my_result.bid_dispatch)
  console.log('[DeviceDeepDive] my_result.dam_bid_dispatch:', my_result.dam_bid_dispatch)
  console.log('[DeviceDeepDive] my_result.device_hourly_details:', my_result.device_hourly_details)
  
  // Use current round hourly results for labels and calculations
  const hourlyResults = my_result.hourly_results || my_result.hourly_breakdown || []
  const damHourlyResults = my_result.dam_hourly_results || []

  const hasHistoricalDam = Boolean(my_result.dam_bid_dispatch)
    || Boolean(my_result.dam_device_hourly_details)
    || Boolean(damHourlyResults.length)

  const damHasCoverageForWindow = (bidDispatch) => {
    if (!bidDispatch || typeof bidDispatch !== 'object') return false
    const isInWindow = (hourValue) => {
      const h = Number(hourValue)
      return Number.isFinite(h) && h >= roundStartHour && h < roundEndHour
    }

    // If we have explicit scenario hour indices, require overlap with the current round window.
    // Otherwise (legacy hour_offset-only payloads), assume it's meant for this window.
    let sawExplicitHour = false
    let sawOverlap = false
    let sawRoundLocalHour = false

    Object.values(bidDispatch).forEach((lots) => {
      if (!lots || typeof lots !== 'object') return
      Object.values(lots).forEach((rows) => {
        if (!Array.isArray(rows)) return
        rows.forEach((row) => {
          if (!row || typeof row !== 'object') return
          const explicit = row.scenario_hour_idx ?? row.hour_idx
          if (explicit !== undefined && explicit !== null) {
            sawExplicitHour = true
            const numericExplicit = Number(explicit)
            if (isInWindow(numericExplicit)) sawOverlap = true
            if (Number.isFinite(numericExplicit) && numericExplicit >= 0 && numericExplicit < roundSpan) {
              sawRoundLocalHour = true
            }
          }
        })
      })
    })

    if (sawExplicitHour) {
      if (sawOverlap) return true
      if (sawRoundLocalHour) return true
      return false
    }

    return true
  }

  // Separate DAM and IDM data
  const hasDam = isCurrentRoundDamOnly || (hasHistoricalDam && damHasCoverageForWindow(my_result?.dam_bid_dispatch))
  const damBidDispatch = isCurrentRoundDamOnly
    ? (my_result.bid_dispatch || {})
    : (hasDam ? (my_result.dam_bid_dispatch || {}) : {})
  const idmBidDispatch = isCurrentRoundDamOnly
    ? {}
    : (hasHistoricalDam ? (my_result.bid_dispatch || {}) : {})
  
  const damDeviceHourlyDetails = isCurrentRoundDamOnly
    ? (my_result.device_hourly_details || {})
    : (hasDam ? (my_result.dam_device_hourly_details || {}) : {})
  const idmDeviceHourlyDetails = isCurrentRoundDamOnly
    ? {}
    : (hasHistoricalDam ? (my_result.device_hourly_details || {}) : {})

  const addDeviceIdsFromDetails = (details, targetSet) => {
    if (!details || typeof details !== 'object') return
    const co2Map = details.co2 || {}
    const balancingMap = details.balancing || {}
    Object.keys(co2Map).forEach((id) => targetSet.add(id))
    Object.keys(balancingMap).forEach((id) => targetSet.add(id))
  }

  const buildHourAxisFromDetails = (details) => {
    if (!details || typeof details !== 'object') return []
    const hourSet = new Set()
    const collectHours = (entries) => {
      if (!Array.isArray(entries)) return
      entries.forEach((entry) => {
        const hour = entry?.scenario_hour_idx ?? entry?.hour_idx ?? entry?.hour_offset ?? entry?.hour
        if (Number.isFinite(Number(hour))) {
          hourSet.add(Number(hour))
        }
      })
    }

    Object.values(details.co2 || {}).forEach(collectHours)
    Object.values(details.balancing || {}).forEach(collectHours)

    return [...hourSet].sort((a, b) => a - b).map((hour) => ({
      scenario_hour_idx: hour,
      hour_offset: hour,
      hour_idx: hour,
      hour
    }))
  }

  const normalizeScenarioHour = (entry) => {
    const rawScenario = entry?.scenario_hour_idx ?? entry?.hour_idx
    if (Number.isFinite(Number(rawScenario))) return Number(rawScenario)
    const rawOffset = entry?.round_hour_offset ?? entry?.hour_offset ?? entry?.hour
    if (Number.isFinite(Number(rawOffset))) return roundStartHour + Number(rawOffset)
    return null
  }

  const allHourlyResults = hourlyResults.length > 0
    ? hourlyResults
    : buildHourAxisFromDetails(hasDam ? damDeviceHourlyDetails : idmDeviceHourlyDetails)

  const effectiveHourlyResults = allHourlyResults.filter((entry) => {
    const scenarioHour = normalizeScenarioHour(entry)
    if (scenarioHour == null || scenarioHour < roundStartHour || scenarioHour >= roundEndHour) return false
    if (!hideNonEditableHours) return true
    return visibleHourSet.has(scenarioHour)
  })

  console.log('[DeviceDeepDive] damBidDispatch:', damBidDispatch)
  console.log('[DeviceDeepDive] idmBidDispatch:', idmBidDispatch)
  console.log('[DeviceDeepDive] hourlyResults:', effectiveHourlyResults)
  console.log('[DeviceDeepDive] deviceIds DAM:', Object.keys(damBidDispatch))
  console.log('[DeviceDeepDive] deviceIds IDM:', Object.keys(idmBidDispatch))

  // Get device list from all available sources
  const deviceIdSet = new Set()
  Object.keys(damBidDispatch || {}).forEach((id) => deviceIdSet.add(id))
  Object.keys(idmBidDispatch || {}).forEach((id) => deviceIdSet.add(id))
  addDeviceIdsFromDetails(damDeviceHourlyDetails, deviceIdSet)
  addDeviceIdsFromDetails(idmDeviceHourlyDetails, deviceIdSet)
  Object.keys(my_result?.kpis?.device_hourly_breakdown || {}).forEach((id) => deviceIdSet.add(id))

  const deviceIds = [...deviceIdSet]
  
  if (deviceIds.length === 0) {
    return (
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body2" color="text.secondary">
          No device details available
        </Typography>
      </Paper>
    )
  }

  // Get device names from scenario config
  const devices = scenario?.config?.devices || []
  const deviceMap = {}
  devices.forEach(d => {
    deviceMap[d.id] = d
  })

  const selectedDeviceId = deviceIds[selectedDeviceIdx]
  const deviceConfig = deviceMap[selectedDeviceId] || {}
  const deviceName = deviceConfig.name || selectedDeviceId
  const deviceType = deviceConfig.type || 'Unknown'
  const deviceCapacity = Number(deviceConfig.capacity_mw || deviceConfig.max_power_mw || 0)

  const parseStartHour = (startTime) => {
    if (!startTime || typeof startTime !== 'string') return 0
    const hour = Number(startTime.split(':')[0])
    return Number.isFinite(hour) ? hour : 0
  }

  const startHour = parseStartHour(scenario?.config?.general?.start_time)
  const formatHourLabel = (hourIndex) => {
    const hour = (startHour + (Number(hourIndex) || 0)) % 24
    return `${String(hour).padStart(2, '0')}:00`
  }

  const formatNumber = (value, decimals = 1) => {
    const num = Number(value ?? 0)
    if (!Number.isFinite(num)) return '0'
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }

  const formatInteger = (value) => {
    const num = Number(value ?? 0)
    if (!Number.isFinite(num)) return '0'
    return Math.round(num).toLocaleString('en-US')
  }

  const displayMoney = (value) => {
    const num = Number(value ?? 0)
    if (!Number.isFinite(num)) return 0
    return isConsumer ? Math.abs(num) : num
  }

  // Get hourly data for selected device - separate DAM and IDM
  const deviceBidsDAM = damBidDispatch[selectedDeviceId] || {}
  const deviceBidsIDM = idmBidDispatch[selectedDeviceId] || {}
  
  const deviceCO2_DAM = damDeviceHourlyDetails.co2?.[selectedDeviceId] || []
  const deviceBalancing_DAM = damDeviceHourlyDetails.balancing?.[selectedDeviceId] || []
  
  const deviceCO2_IDM = idmDeviceHourlyDetails.co2?.[selectedDeviceId] || []
  const deviceBalancing_IDM = idmDeviceHourlyDetails.balancing?.[selectedDeviceId] || []

  const getSignedOffered = (lot) => {
    if (!lot || typeof lot !== 'object') return 0
    if (lot.mw_offered_signed !== undefined && lot.mw_offered_signed !== null) {
      const signed = Number(lot.mw_offered_signed)
      return Number.isFinite(signed) ? signed : 0
    }
    const offered = Number(lot.mw_offered || 0)
    return Number.isFinite(offered) ? offered : 0
  }

  const findHourlyEntry = (entries, hourOffset, scenarioHourIdx) => {
    if (!Array.isArray(entries)) return {}

    const byScenarioHour = entries.find((entry) => {
      const entryScenarioHour = entry?.scenario_hour_idx ?? entry?.hour_idx
      return Number(entryScenarioHour) === Number(scenarioHourIdx)
    })
    if (byScenarioHour) return byScenarioHour

    // If payload has explicit hour fields, they can be either absolute scenario hours
    // OR round-local offsets (legacy/compat payloads).
    // Only block remapping when values clearly look like absolute scenario hours.
    const hasExplicit = entries.some((entry) => {
      const entryScenarioHour = entry?.scenario_hour_idx ?? entry?.hour_idx
      return entryScenarioHour !== undefined && entryScenarioHour !== null
    })
    if (hasExplicit) {
      const explicitHours = entries
        .map((entry) => Number(entry?.scenario_hour_idx ?? entry?.hour_idx))
        .filter((value) => Number.isFinite(value))
      const hasWindowOverlap = explicitHours.some((value) => value >= roundStartHour && value < roundEndHour)
      const looksRoundLocal = explicitHours.some((value) => value >= 0 && value < roundSpan)
      if (!looksRoundLocal || hasWindowOverlap) return {}
    }

    const byMappedOffset = entries.find((entry) => {
      const entryOffset = entry?.round_hour_offset ?? entry?.hour_offset ?? entry?.hour
      if (!Number.isFinite(Number(entryOffset))) return false
      const mappedScenarioHour = roundStartHour + Number(entryOffset)
      return mappedScenarioHour === Number(scenarioHourIdx)
    })
    return byMappedOffset || {}
  }

  // Build hourly data array
  const hourlyData = effectiveHourlyResults.map((hour, idx) => {
    const hourOffset = hour.round_hour_offset ?? hour.hour_offset ?? idx
    const scenarioHourIdx = hour.scenario_hour_idx ?? hour.hour_idx ?? hour.hour ?? hourOffset ?? idx
    
    // Helper to find lot data by hour_offset (not array index!)
    const findLotData = (lotsArray) => {
      if (!Array.isArray(lotsArray)) return {}

      const byScenarioHour = lotsArray.find((lot) => {
        const lotHourIdx = lot?.hour_idx
        return Number(lotHourIdx) === Number(scenarioHourIdx)
      })
      if (byScenarioHour) return byScenarioHour

      // hour_idx can be absolute scenario hour or round-local offset.
      // If values look round-local (0..roundSpan-1), allow remapping.
      const hasExplicit = lotsArray.some((lot) => {
        const explicit = lot?.scenario_hour_idx ?? lot?.hour_idx
        return explicit !== undefined && explicit !== null
      })
      if (hasExplicit) {
        const explicitHours = lotsArray
          .map((lot) => Number(lot?.scenario_hour_idx ?? lot?.hour_idx))
          .filter((value) => Number.isFinite(value))
        const hasWindowOverlap = explicitHours.some((value) => value >= roundStartHour && value < roundEndHour)
        const looksRoundLocal = explicitHours.some((value) => value >= 0 && value < roundSpan)
        if (!looksRoundLocal || hasWindowOverlap) return {}
      }

      const byMappedOffset = lotsArray.find((lot) => {
        const lotOffset = lot?.round_hour_offset ?? lot?.hour_offset ?? lot?.hour
        if (!Number.isFinite(Number(lotOffset))) return false
        const mappedScenarioHour = roundStartHour + Number(lotOffset)
        return mappedScenarioHour === Number(scenarioHourIdx)
      })
      return byMappedOffset || {}
    }
    
    // DAM bids for this hour (lots A, B, C) - FIND BY hour_offset
    const lotA_DAM = findLotData(deviceBidsDAM.A)
    const lotB_DAM = findLotData(deviceBidsDAM.B)
    const lotC_DAM = findLotData(deviceBidsDAM.C)
    
    // IDM bids for this hour (lots A, B, C) - FIND BY hour_offset
    const lotA_IDM = findLotData(deviceBidsIDM.A)
    const lotB_IDM = findLotData(deviceBidsIDM.B)
    const lotC_IDM = findLotData(deviceBidsIDM.C)

    // Get CO2 for this hour - FIND BY hour_offset
    const co2Dam = findHourlyEntry(deviceCO2_DAM, hourOffset, scenarioHourIdx)
    const co2Idm = findHourlyEntry(deviceCO2_IDM, hourOffset, scenarioHourIdx)
    const co2Data = (isIdmRound ? (co2Idm || co2Dam) : (co2Dam || co2Idm)) || {}

    // Get balancing for this hour - FIND BY hour_offset
    const balancingDam = findHourlyEntry(deviceBalancing_DAM, hourOffset, scenarioHourIdx)
    const balancingIdm = findHourlyEntry(deviceBalancing_IDM, hourOffset, scenarioHourIdx)
    const balancingData = (isIdmRound ? (balancingIdm || balancingDam) : (balancingDam || balancingIdm)) || {}
    
    // Get capacity data from device_hourly_breakdown if available - FIND BY hour_offset
    const deviceBreakdownArray = my_result?.kpis?.device_hourly_breakdown?.[selectedDeviceId] || []
    const deviceBreakdown = deviceBreakdownArray.find(b => (b.hour_offset ?? b.hour ?? b.hour_idx) === hourOffset) || {}
    const baseCapacityRaw = deviceBreakdown.base_capacity_mw !== undefined ? deviceBreakdown.base_capacity_mw : deviceCapacity
    const effectiveCapacityRaw = deviceBreakdown.effective_capacity_mw !== undefined ? deviceBreakdown.effective_capacity_mw : deviceCapacity
    const totalOfferedFromBreakdown = deviceBreakdown.total_offered_mw || 0

    // Calculate totals for DAM/IDM:
    // Prefer backend-provided canonical DA/ID split so KPI and details cannot diverge.
    const totalOffered_DAM = (lotA_DAM.mw_offered || 0) + (lotB_DAM.mw_offered || 0) + (lotC_DAM.mw_offered || 0)
    const totalOffered_IDM = getSignedOffered(lotA_IDM) + getSignedOffered(lotB_IDM) + getSignedOffered(lotC_IDM)

    const backendDaDispatched = Number(deviceBreakdown.da_dispatched_mwh ?? 0)
    const backendIdDispatched = Number(deviceBreakdown.id_dispatched_mwh ?? 0)
    const hasBackendDispatchSplit = Number.isFinite(backendDaDispatched) || Number.isFinite(backendIdDispatched)

    const totalDispatched_DAM = Number.isFinite(backendDaDispatched)
      ? backendDaDispatched
      : ((lotA_DAM.mw_dispatched || 0) + (lotB_DAM.mw_dispatched || 0) + (lotC_DAM.mw_dispatched || 0))

    const totalDispatched_IDM = Number.isFinite(backendIdDispatched)
      ? backendIdDispatched
      : ((lotA_IDM.mw_dispatched || 0) + (lotB_IDM.mw_dispatched || 0) + (lotC_IDM.mw_dispatched || 0))

    const fallbackDemandBase = Math.max(
      Number(totalOfferedFromBreakdown || 0),
      Number(totalOffered_DAM || 0),
      Math.abs(Number(totalOffered_IDM || 0)),
      Number(deviceBreakdown.planned_mw || 0),
      Number(deviceBreakdown.dispatched_mw || 0)
    )
    const fallbackDemandEffective = Math.max(
      Number(deviceBreakdown.actual_mw || 0),
      Number(deviceBreakdown.planned_mw || 0),
      Number(totalDispatched_DAM + totalDispatched_IDM || 0),
      fallbackDemandBase
    )

    const baseCapacity = isConsumer
      ? (Number(baseCapacityRaw || 0) > 0 ? Number(baseCapacityRaw || 0) : fallbackDemandBase)
      : Number(baseCapacityRaw || 0)
    const effectiveCapacity = isConsumer
      ? (Number(effectiveCapacityRaw || 0) > 0 ? Number(effectiveCapacityRaw || 0) : fallbackDemandEffective)
      : Number(effectiveCapacityRaw || 0)

    const offeredForOverbid = totalOfferedFromBreakdown > 0 ? totalOfferedFromBreakdown : totalOffered_DAM
    const backendOverbid = Number(deviceBreakdown.overbid_mw || 0)
    const fallbackOverbid = Math.max(0, offeredForOverbid - Number(effectiveCapacity || 0))
    const overbidMw = backendOverbid > 0 ? backendOverbid : fallbackOverbid
    const capacityViolation = Boolean(deviceBreakdown.capacity_violation) || overbidMw > 0.001
    
    const smp = hour.smp || 0
    const hourlyIdTradeCount = Number(hour.id_trade_count ?? 0)
    const backendDaPrice = Number(deviceBreakdown.da_price_zar)
    const backendIdPrice = Number(deviceBreakdown.id_price_zar)
    const damPrice = Number.isFinite(backendDaPrice)
      ? backendDaPrice
      : (Number.isFinite(roundLevelDaPrice) ? roundLevelDaPrice : smp)
    const idp = hourlyIdTradeCount > 0
      ? ((Number.isFinite(backendIdPrice) && backendIdPrice > 0)
        ? backendIdPrice
        : ((hour.idp !== undefined && hour.idp !== null)
          ? Number(hour.idp)
          : (Number.isFinite(roundLevelIdp) ? roundLevelIdp : smp)))
      : null
    // Revenue: always prefer backend canonical settlement values (DA+ID), otherwise fallback.
    const backendDaRevenue = Number(deviceBreakdown.da_revenue_zar)
    const backendIdRevenue = Number(deviceBreakdown.id_revenue_zar)
    const backendRevenue = Number(deviceBreakdown.revenue_zar)

    const revenue_DAM = Number.isFinite(backendDaRevenue)
      ? backendDaRevenue
      : (totalDispatched_DAM * damPrice)

    const revenue_IDM = Number.isFinite(backendIdRevenue)
      ? backendIdRevenue
      : (totalDispatched_IDM * (Number.isFinite(idp) ? idp : 0))

    const totalDispatched = totalDispatched_DAM + totalDispatched_IDM
    const imbalanceMwhBackend = Number(deviceBreakdown.imbalance_mwh)
    const imbalanceMwhDisplay = Number.isFinite(imbalanceMwhBackend)
      ? imbalanceMwhBackend
      : Number(balancingData.imbalance_mwh || 0)

    const imbalanceCostBackend = Number(deviceBreakdown.imbalance_cost_zar)
    const imbalanceCostDisplay = Number.isFinite(imbalanceCostBackend)
      ? imbalanceCostBackend
      : Number(balancingData.balancing_cost_zar || 0)

    const balancingPriceBackend = (Math.abs(imbalanceMwhDisplay) > 0.0001)
      ? Math.abs(imbalanceCostDisplay / imbalanceMwhDisplay)
      : 0
    const balancingPriceRaw = Number(balancingData.balancing_price || 0)
    const balancingPriceDisplay = Number.isFinite(balancingPriceRaw) && balancingPriceRaw > 0
      ? balancingPriceRaw
      : balancingPriceBackend

    const hourKey = scenarioHourIdx
    return {
      hourLabel: formatHourLabel(scenarioHourIdx),
      hourKey,
      hourOffset,
      scenarioHourIdx,
      isClearingHour: Boolean(hour?.is_clearing_hour ?? true),
      // Capacity
      baseCapacity,
      effectiveCapacity,
      overbidMw,
      capacityViolation,
      // DAM
      lotA_DAM,
      lotB_DAM,
      lotC_DAM,
      totalOffered_DAM,
      totalDispatched_DAM,
      damPrice,
      smp,
      revenue_DAM,
      // IDM
      lotA_IDM,
      lotB_IDM,
      lotC_IDM,
      totalOffered_IDM,
      totalDispatched_IDM,
      idp,
      revenue_IDM,
      // Balancing
      imbalanceMwh: imbalanceMwhDisplay,
      balancingPrice: balancingPriceDisplay,
      balancingCost: balancingData.balancing_cost_zar || 0,
      imbalanceCostDisplay,
      // CO2
      co2Kg: (Number.isFinite(Number(deviceBreakdown.co2_kg))
        ? Number(deviceBreakdown.co2_kg)
        : (co2Data.co2_kg || 0)),
      // Totals
      netMwh: totalDispatched_DAM + totalDispatched_IDM + imbalanceMwhDisplay,
      netRevenue: (Number.isFinite(backendRevenue)
        ? backendRevenue
        : (revenue_DAM + revenue_IDM)) - imbalanceCostDisplay
    }
  })

  const getAvgLotPrice = (lotKey) => {
    const prices = hourlyData
      .map((h) => h[lotKey]?.price_bid)
      .filter((price) => price !== null && price !== undefined && price !== '')
      .map((price) => Number(price))
      .filter((price) => Number.isFinite(price))

    if (prices.length === 0) {
      return { hasPrice: false, avgPrice: 0 }
    }

    return {
      hasPrice: true,
      avgPrice: prices.reduce((sum, price) => sum + price, 0) / prices.length
    }
  }

  const damLotA = getAvgLotPrice('lotA_DAM')
  const damLotB = getAvgLotPrice('lotB_DAM')
  const damLotC = getAvgLotPrice('lotC_DAM')
  const idmLotA = getAvgLotPrice('lotA_IDM')
  const idmLotB = getAvgLotPrice('lotB_IDM')
  const idmLotC = getAvgLotPrice('lotC_IDM')

  // Calculate round totals/averages
  const roundTotals = {
    // DAM - Summed
    totalOffered_DAM: hourlyData.reduce((sum, h) => sum + h.totalOffered_DAM, 0),
    totalLotAOffered_DAM: hourlyData.reduce((sum, h) => sum + (h.lotA_DAM.mw_offered || 0), 0),
    totalLotBOffered_DAM: hourlyData.reduce((sum, h) => sum + (h.lotB_DAM.mw_offered || 0), 0),
    totalLotCOffered_DAM: hourlyData.reduce((sum, h) => sum + (h.lotC_DAM.mw_offered || 0), 0),
    totalDispatched_DAM: hourlyData.reduce((sum, h) => sum + h.totalDispatched_DAM, 0),
    revenue_DAM: hourlyData.reduce((sum, h) => sum + displayMoney(h.revenue_DAM), 0),
    // DAM - Averaged prices
    avgLotA_DAM: damLotA.avgPrice,
    avgLotB_DAM: damLotB.avgPrice,
    avgLotC_DAM: damLotC.avgPrice,
    hasLotA_DAM: damLotA.hasPrice,
    hasLotB_DAM: damLotB.hasPrice,
    hasLotC_DAM: damLotC.hasPrice,
    avgDamPrice: hourlyData.filter(h => h.damPrice > 0).reduce((sum, h) => sum + h.damPrice, 0) / (hourlyData.filter(h => h.damPrice > 0).length || 1),
    avgSMP: hourlyData.filter(h => h.smp > 0).reduce((sum, h) => sum + h.smp, 0) / (hourlyData.filter(h => h.smp > 0).length || 1),
    // IDM - Summed
    totalOffered_IDM: hourlyData.reduce((sum, h) => sum + h.totalOffered_IDM, 0),
    totalLotAOffered_IDM: hourlyData.reduce((sum, h) => sum + getSignedOffered(h.lotA_IDM), 0),
    totalLotBOffered_IDM: hourlyData.reduce((sum, h) => sum + getSignedOffered(h.lotB_IDM), 0),
    totalLotCOffered_IDM: hourlyData.reduce((sum, h) => sum + getSignedOffered(h.lotC_IDM), 0),
    totalDispatched_IDM: hourlyData.reduce((sum, h) => sum + h.totalDispatched_IDM, 0),
    revenue_IDM: hourlyData.reduce((sum, h) => sum + displayMoney(h.revenue_IDM), 0),
    // IDM - Averaged prices
    avgLotA_IDM: idmLotA.avgPrice,
    avgLotB_IDM: idmLotB.avgPrice,
    avgLotC_IDM: idmLotC.avgPrice,
    hasLotA_IDM: idmLotA.hasPrice,
    hasLotB_IDM: idmLotB.hasPrice,
    hasLotC_IDM: idmLotC.hasPrice,
    avgIdPrice: hourlyData.filter(h => h.idp > 0).reduce((sum, h) => sum + h.idp, 0) / (hourlyData.filter(h => h.idp > 0).length || 1),
    // Capacity - Summed overbid
    totalOverbid: hourlyData.reduce((sum, h) => sum + (h.overbidMw || 0), 0),
    // Balancing - Summed for MWh and Cost
    totalImbalance: hourlyData.reduce((sum, h) => sum + h.imbalanceMwh, 0),
    totalBalancingCost: hourlyData.reduce((sum, h) => sum + h.imbalanceCostDisplay, 0),
    avgBalancingPrice: hourlyData.filter(h => h.balancingPrice !== 0).reduce((sum, h) => sum + h.balancingPrice, 0) / (hourlyData.filter(h => h.balancingPrice !== 0).length || 1),
    // Totals - Summed
    totalNetMwh: hourlyData.reduce((sum, h) => sum + h.netMwh, 0),
    totalNetRevenue: hourlyData.reduce((sum, h) => sum + displayMoney(h.netRevenue), 0),
    totalCO2: hourlyData.reduce((sum, h) => sum + h.co2Kg, 0)
  }

  const selectedDeviceVariableRate = Math.max(0, Number(deviceConfig.variable_cost_zar_per_mwh ?? deviceConfig.cost_per_mwh_zar ?? 0))
  const selectedDeviceFixedPerHour = Math.max(0, Number(deviceConfig.fixed_cost_zar_per_hour ?? 0))

  const eventImpactRows = (my_result?.kpis?.device_hourly_breakdown?.[selectedDeviceId] || [])
    .filter((entry) => {
      const debug = entry?.capacity_debug || {}
      const eventMult = Number(debug.event_mult)
      const eventAdd = Number(debug.event_add)
      const hasMultiplierImpact = Number.isFinite(eventMult) && Math.abs(eventMult - 1) > 0.0001
      const hasAdditiveImpact = Number.isFinite(eventAdd) && Math.abs(eventAdd) > 0.0001
      return hasMultiplierImpact || hasAdditiveImpact
    })

  const eventImpactSummary = (() => {
    if (!eventImpactRows.length) return null

    const withBase = eventImpactRows.filter((entry) => Number(entry?.base_capacity_mw || 0) > 0)
    const avgDropPct = withBase.length > 0
      ? withBase.reduce((sum, entry) => {
        const base = Number(entry?.base_capacity_mw || 0)
        const effective = Number(entry?.effective_capacity_mw || 0)
        return sum + Math.max(0, ((base - effective) / base) * 100)
      }, 0) / withBase.length
      : 0

    const firstDebug = eventImpactRows.find((entry) => entry?.capacity_debug)?.capacity_debug || {}
    const eventMult = Number(firstDebug.event_mult)
    const eventAdd = Number(firstDebug.event_add)
    const impactBits = []
    if (Number.isFinite(eventMult) && Math.abs(eventMult - 1) > 0.0001) {
      impactBits.push(`×${eventMult.toFixed(2)}`)
    }
    if (Number.isFinite(eventAdd) && Math.abs(eventAdd) > 0.0001) {
      impactBits.push(`${eventAdd >= 0 ? '+' : ''}${eventAdd.toFixed(1)} MW`)
    }

    return {
      hours: eventImpactRows.length,
      avgDropPct,
      impactText: impactBits.join(' ')
    }
  })()

  const relevantSystemicEvents = (Array.isArray(results?.active_events) ? results.active_events : []).filter((evt) => {
    if (String(evt?.type || '').toLowerCase() !== 'systemic') return false
    const target = String(evt?.target || 'all').toLowerCase()
    const targetId = String(evt?.target_id || '').toLowerCase()
    if (target === 'all') return true
    if (target === 'player') {
      const typeId = String(my_result?.type || '').toLowerCase()
      const playerId = String(my_result?.player_id || '').toLowerCase()
      return targetId === typeId || targetId === playerId
    }
    if (target === 'device') {
      const selectedType = String(deviceConfig?.type || '').toLowerCase()
      return targetId === String(selectedDeviceId || '').toLowerCase() || targetId === selectedType
    }
    return false
  })

  const rawHourlyVariableCosts = hourlyData.map((hourData) => {
    const dispatchedMwh = Math.max(0, Number(hourData.totalDispatched_DAM || 0) + Number(hourData.totalDispatched_IDM || 0))
    return dispatchedMwh * selectedDeviceVariableRate
  })

  const rawHourlyFixedCosts = hourlyData.map(() => selectedDeviceFixedPerHour)

  const hourlyVariableCosts = rawHourlyVariableCosts
  const hourlyFixedCosts = rawHourlyFixedCosts
  const hourlyVariableCostTotal = hourlyVariableCosts.reduce((sum, value) => sum + value, 0)
  const hourlyFixedCostTotal = hourlyFixedCosts.reduce((sum, value) => sum + value, 0)

  // Helper to get lot status background color with capacity_violation priority
  const getLotBgColor = (lot, hourData) => {
    if (!lot || !lot.mw_offered) return '#ffffff'
    
    // Priority 1: Capacity violation (RED)
    if (hourData && hourData.capacityViolation) {
      return '#ffebee'  // Red 50
    }
    
    // Priority 2: Acceptance ratio
    const ratio = lot.acceptance_ratio || 0
    if (ratio >= 0.95) return '#e8f5e9'  // Light green
    if (ratio >= 0.5) return '#fff9c4'   // Light yellow
    if (ratio > 0) return '#ffe0b2'      // Light orange
    return '#ffebee'  // Light red
  }

  const getOverbidStyle = (hourData) => {
    if (isConsumer) return undefined
    if (!hourData || !hourData.capacityViolation) return undefined
    return { color: 'error.main', fontWeight: 'bold' }
  }

  return (
    <Paper sx={{ mt: 3 }}>
      {/* Device Tabs */}
      <Tabs
        value={selectedDeviceIdx}
        onChange={(e, newValue) => setSelectedDeviceIdx(newValue)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {deviceIds.map((devId, idx) => {
          const devCfg = deviceMap[devId] || {}
          const devName = devCfg.name || devId
          return (
            <Tab key={devId} label={devName} />
          )
        })}
      </Tabs>

      {/* Device Info */}
      <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
        <Typography variant="h6">{deviceName}</Typography>
        <Typography variant="body2" color="text.secondary">
          {deviceType} • {deviceConfig.capacity_mw || deviceConfig.max_power_mw || '?'} MW
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Current round window: hours {roundStartHour + 1}-{roundEndHour}
        </Typography>
        {eventImpactSummary && (
          <Alert severity="warning" variant="outlined" sx={{ mt: 1.5 }}>
            <Typography variant="body2">
              Event impact detected in this round: effective {isConsumer ? 'demand' : 'capacity'} adjusted in {eventImpactSummary.hours} hour(s)
              {eventImpactSummary.avgDropPct > 0 ? `, avg reduction ${eventImpactSummary.avgDropPct.toFixed(0)}%` : ''}
              {eventImpactSummary.impactText ? ` (${eventImpactSummary.impactText})` : ''}.
            </Typography>
          </Alert>
        )}
        {!eventImpactSummary && relevantSystemicEvents.length > 0 && (
          <Alert severity="info" variant="outlined" sx={{ mt: 1.5 }}>
            <Typography variant="body2">
              Active systemic event(s) for your scope: {relevantSystemicEvents.map((evt) => evt?.name || 'Event').join(' · ')}.
              No explicit event modifier row is present for this device in the stored round details.
            </Typography>
          </Alert>
        )}
      </Box>

      {/* Transposed Hourly Details Table */}
      <TableContainer sx={{ maxHeight: 700 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 150, fontWeight: 'bold', bgcolor: 'grey.100' }}>Metric</TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="center" sx={{ minWidth: 80, fontWeight: 'bold', bgcolor: 'grey.100' }}>
                  {h.hourLabel}
                </TableCell>
              ))}
              <TableCell align="center" sx={{ minWidth: 100, fontWeight: 'bold', bgcolor: 'primary.100', color: 'primary.main' }}>
                Round Total
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow hover>
              <TableCell>{isConsumer ? 'Base Demand (MW)' : 'Base Capacity (MW)'}</TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                  {h.baseCapacity > 0 ? formatNumber(h.baseCapacity, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50', fontStyle: 'italic', color: 'text.secondary' }}>
                -
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>{isConsumer ? 'Effective Demand (MW)' : 'Effective Capacity (MW)'}</TableCell>
              {hourlyData.map((h) => (
                <TableCell
                  key={h.hourKey}
                  align="right"
                  sx={{
                    fontWeight: 'medium',
                    color: h.effectiveCapacity < h.baseCapacity ? 'warning.main' : 'text.primary',
                    bgcolor: h.effectiveCapacity < h.baseCapacity ? 'warning.50' : 'inherit'
                  }}
                >
                  {h.effectiveCapacity > 0 ? formatNumber(h.effectiveCapacity, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                -
              </TableCell>
            </TableRow>

            {/* DAM Section */}
            <TableRow sx={{ bgcolor: 'primary.50' }}>
              <TableCell colSpan={hourlyData.length + 2} sx={{ fontWeight: 'bold' }}>
                Day-Ahead Market (DAM)
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>{isConsumer ? 'Demanded (MWh)' : 'Offered (MWh)'}</TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right" sx={getOverbidStyle(h)}>
                  {h.totalOffered_DAM > 0 ? formatNumber(h.totalOffered_DAM, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {formatNumber(roundTotals.totalOffered_DAM, 1)}
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>
                Base {roundTotals.hasLotA_DAM ? `(${formatInteger(roundTotals.avgLotA_DAM)} ZAR/MWh)` : ''}
              </TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ bgcolor: getLotBgColor(h.lotA_DAM, h), fontWeight: 'medium' }}
                >
                  {h.lotA_DAM.mw_offered > 0 ? formatNumber(h.lotA_DAM.mw_offered, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {roundTotals.totalLotAOffered_DAM > 0 ? formatNumber(roundTotals.totalLotAOffered_DAM, 1) : '-'}
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>
                Mid {roundTotals.hasLotB_DAM ? `(${formatInteger(roundTotals.avgLotB_DAM)} ZAR/MWh)` : ''}
              </TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ bgcolor: getLotBgColor(h.lotB_DAM, h), fontWeight: 'medium' }}
                >
                  {h.lotB_DAM.mw_offered > 0 ? formatNumber(h.lotB_DAM.mw_offered, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {roundTotals.totalLotBOffered_DAM > 0 ? formatNumber(roundTotals.totalLotBOffered_DAM, 1) : '-'}
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>
                Peak {roundTotals.hasLotC_DAM ? `(${formatInteger(roundTotals.avgLotC_DAM)} ZAR/MWh)` : ''}
              </TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ bgcolor: getLotBgColor(h.lotC_DAM, h), fontWeight: 'medium' }}
                >
                  {h.lotC_DAM.mw_offered > 0 ? formatNumber(h.lotC_DAM.mw_offered, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {roundTotals.totalLotCOffered_DAM > 0 ? formatNumber(roundTotals.totalLotCOffered_DAM, 1) : '-'}
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>{isIdmRound ? 'DA Price (ZAR/MWh)' : 'SMP (ZAR/MWh)'}</TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right">
                  {h.damPrice > 0 ? formatNumber(h.damPrice, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {roundTotals.avgDamPrice > 0 ? `Ø ${formatNumber(roundTotals.avgDamPrice, 1)}` : '-'}
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>{isConsumer ? 'Consumed (MWh)' : 'Dispatched (MWh)'}</TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right" sx={getOverbidStyle(h)}>
                  {h.totalDispatched_DAM > 0 ? formatNumber(h.totalDispatched_DAM, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {formatNumber(roundTotals.totalDispatched_DAM, 1)}
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>{isConsumer ? 'Cost (ZAR)' : 'Revenue (ZAR)'}</TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right">
                  {displayMoney(h.revenue_DAM) !== 0 ? formatInteger(displayMoney(h.revenue_DAM)) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {formatInteger(roundTotals.revenue_DAM)}
              </TableCell>
            </TableRow>
            
            {/* Overbid Row */}
            <TableRow hover>
              <TableCell>{isConsumer ? 'Over-demand (MW)' : 'Overbid (MW)'}</TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ 
                    color: (h.overbidMw || 0) > 0 ? 'error.main' : 'inherit',
                    fontWeight: (h.overbidMw || 0) > 0 ? 'bold' : 'normal'
                  }}
                >
                  {(h.overbidMw || 0) > 0 ? formatNumber(h.overbidMw, 1) : '-'}
                </TableCell>
              ))}
              <TableCell 
                align="right" 
                sx={{ 
                  fontWeight: 'bold', 
                  bgcolor: 'grey.50',
                  color: roundTotals.totalOverbid > 0 ? 'error.main' : 'inherit'
                }}
              >
                {roundTotals.totalOverbid > 0 ? formatNumber(roundTotals.totalOverbid, 1) : '-'}
              </TableCell>
            </TableRow>

            {/* IDM Section - only show if any IDM data exists */}
            {hourlyData.some(h => h.totalOffered_IDM > 0) && (
              <>
                <TableRow sx={{ bgcolor: 'info.50' }}>
                  <TableCell colSpan={hourlyData.length + 2} sx={{ fontWeight: 'bold' }}>
                    Intraday Market (IDM)
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>{isConsumer ? 'Demanded (MWh)' : 'Offered (MWh)'}</TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right" sx={getOverbidStyle(h)}>
                      {h.totalOffered_IDM !== 0 ? formatNumber(h.totalOffered_IDM, 1) : '-'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    {roundTotals.totalOffered_IDM !== 0 ? formatNumber(roundTotals.totalOffered_IDM, 1) : '-'}
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>
                    Base {roundTotals.hasLotA_IDM ? `(${formatInteger(roundTotals.avgLotA_IDM)} ZAR/MWh)` : ''}
                  </TableCell>
                  {hourlyData.map((h) => (
                    <TableCell 
                      key={h.hourKey} 
                      align="right"
                      sx={{ bgcolor: getLotBgColor(h.lotA_IDM, h), fontWeight: 'medium' }}
                    >
                      {getSignedOffered(h.lotA_IDM) !== 0 ? formatNumber(getSignedOffered(h.lotA_IDM), 1) : '-'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    {roundTotals.totalLotAOffered_IDM !== 0 ? formatNumber(roundTotals.totalLotAOffered_IDM, 1) : '-'}
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>
                    Mid {roundTotals.hasLotB_IDM ? `(${formatInteger(roundTotals.avgLotB_IDM)} ZAR/MWh)` : ''}
                  </TableCell>
                  {hourlyData.map((h) => (
                    <TableCell 
                      key={h.hourKey} 
                      align="right"
                      sx={{ bgcolor: getLotBgColor(h.lotB_IDM, h), fontWeight: 'medium' }}
                    >
                      {getSignedOffered(h.lotB_IDM) !== 0 ? formatNumber(getSignedOffered(h.lotB_IDM), 1) : '-'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    {roundTotals.totalLotBOffered_IDM !== 0 ? formatNumber(roundTotals.totalLotBOffered_IDM, 1) : '-'}
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>
                    Peak {roundTotals.hasLotC_IDM ? `(${formatInteger(roundTotals.avgLotC_IDM)} ZAR/MWh)` : ''}
                  </TableCell>
                  {hourlyData.map((h) => (
                    <TableCell 
                      key={h.hourKey} 
                      align="right"
                      sx={{ bgcolor: getLotBgColor(h.lotC_IDM, h), fontWeight: 'medium' }}
                    >
                      {getSignedOffered(h.lotC_IDM) !== 0 ? formatNumber(getSignedOffered(h.lotC_IDM), 1) : '-'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    {roundTotals.totalLotCOffered_IDM !== 0 ? formatNumber(roundTotals.totalLotCOffered_IDM, 1) : '-'}
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>ID Price (ZAR/MWh)</TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right">
                      {h.idp > 0 ? formatNumber(h.idp, 1) : '-'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    {roundTotals.avgIdPrice > 0 ? `Ø ${formatNumber(roundTotals.avgIdPrice, 1)}` : '-'}
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>{isConsumer ? 'Consumed (MWh)' : 'Dispatched (MWh)'}</TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right" sx={getOverbidStyle(h)}>
                      {h.totalDispatched_IDM > 0 ? formatNumber(h.totalDispatched_IDM, 1) : '-'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    {formatNumber(roundTotals.totalDispatched_IDM, 1)}
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>{isConsumer ? 'Cost (ZAR)' : 'Revenue (ZAR)'}</TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right">
                      {displayMoney(h.revenue_IDM) !== 0 ? formatInteger(displayMoney(h.revenue_IDM)) : '-'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    {formatInteger(roundTotals.revenue_IDM)}
                  </TableCell>
                </TableRow>
              </>
            )}

            {/* Balancing Section */}
            <TableRow sx={{ bgcolor: 'warning.50' }}>
              <TableCell colSpan={hourlyData.length + 2} sx={{ fontWeight: 'bold' }}>
                Balancing
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>Imbalance (MWh)</TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ color: h.imbalanceMwh !== 0 ? 'error.main' : 'inherit' }}
                >
                  {h.imbalanceMwh !== 0 ? formatNumber(h.imbalanceMwh, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {roundTotals.totalImbalance !== 0 ? formatNumber(roundTotals.totalImbalance, 1) : '-'}
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>Imbalance Cost (ZAR)</TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ color: h.imbalanceCostDisplay !== 0 ? 'error.main' : 'inherit' }}
                >
                  {h.imbalanceCostDisplay !== 0 ? formatInteger(h.imbalanceCostDisplay) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50', color: roundTotals.totalBalancingCost !== 0 ? 'error.main' : 'inherit' }}>
                {roundTotals.totalBalancingCost !== 0 ? formatInteger(roundTotals.totalBalancingCost) : '-'}
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>Price (ZAR/MWh)</TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right">
                  {h.balancingPrice !== 0 ? formatInteger(h.balancingPrice) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {roundTotals.avgBalancingPrice !== 0 ? `Ø ${formatInteger(roundTotals.avgBalancingPrice)}` : '-'}
              </TableCell>
            </TableRow>

            {/* Totals Section */}
            <TableRow sx={{ bgcolor: 'grey.200' }}>
              <TableCell colSpan={hourlyData.length + 2} sx={{ fontWeight: 'bold' }}>
                Totals
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell sx={{ fontWeight: 'bold' }}>Net MWh</TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right" sx={{ fontWeight: 'bold' }}>
                  {h.netMwh !== 0 ? formatNumber(h.netMwh, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {formatNumber(roundTotals.totalNetMwh, 1)}
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell sx={{ fontWeight: 'bold' }}>{isConsumer ? 'Net Cost (ZAR)' : 'Net Revenue (ZAR)'}</TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right" sx={{ fontWeight: 'bold' }}>
                  {displayMoney(h.netRevenue) !== 0 ? formatInteger(displayMoney(h.netRevenue)) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {formatInteger(roundTotals.totalNetRevenue)}
              </TableCell>
            </TableRow>
            {!isConsumer && (
              <>
                <TableRow hover>
                  <TableCell>Variable Cost (ZAR)</TableCell>
                  {hourlyData.map((h, idx) => (
                    <TableCell key={h.hourKey} align="right">
                      {hourlyVariableCosts[idx] > 0 ? formatInteger(hourlyVariableCosts[idx]) : '-'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    {hourlyVariableCostTotal !== 0 ? formatInteger(hourlyVariableCostTotal) : '-'}
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>Fixed Cost (ZAR)</TableCell>
                  {hourlyData.map((h, idx) => (
                    <TableCell key={h.hourKey} align="right">
                      {hourlyFixedCosts[idx] > 0 ? formatInteger(hourlyFixedCosts[idx]) : '-'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    {hourlyFixedCostTotal !== 0 ? formatInteger(hourlyFixedCostTotal) : '-'}
                  </TableCell>
                </TableRow>
              </>
            )}
            <TableRow hover>
              <TableCell>{isConsumer ? 'CO2 Caused (kg)' : 'CO2 Emissions (kg)'}</TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right">
                  {h.co2Kg > 0 ? formatNumber(h.co2Kg, 1) : '-'}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                {formatNumber(roundTotals.totalCO2, 1)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
