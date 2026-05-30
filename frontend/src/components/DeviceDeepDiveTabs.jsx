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
  Typography,
  Tooltip
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
  const isIdmRound = currentRound > 1 && idmStatus !== 'off'
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

  const hasBidDispatchRows = (bidDispatch) => (
    Boolean(bidDispatch)
    && typeof bidDispatch === 'object'
    && Object.keys(bidDispatch).length > 0
  )

  const hasDeviceHourlyDetailRows = (details) => {
    if (!details || typeof details !== 'object') return false
    return ['co2', 'balancing'].some((sectionKey) => {
      const section = details[sectionKey]
      return section && typeof section === 'object' && Object.keys(section).length > 0
    })
  }

  const hasHistoricalDam = hasBidDispatchRows(my_result.dam_bid_dispatch)
    || hasDeviceHourlyDetailRows(my_result.dam_device_hourly_details)
    || Boolean(damHourlyResults.length)

  const preferredDamBidDispatch = hasBidDispatchRows(my_result?.dam_bid_dispatch)
    ? (my_result.dam_bid_dispatch || {})
    : (my_result.bid_dispatch || {})

  const preferredDamDeviceHourlyDetails = hasDeviceHourlyDetailRows(my_result?.dam_device_hourly_details)
    ? (my_result.dam_device_hourly_details || {})
    : (my_result.device_hourly_details || {})

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
  const hasDam = isCurrentRoundDamOnly || (hasHistoricalDam && damHasCoverageForWindow(preferredDamBidDispatch))
  const damBidDispatch = isCurrentRoundDamOnly
    ? preferredDamBidDispatch
    : (hasDam ? (my_result.dam_bid_dispatch || {}) : {})
  const idmBidDispatch = isCurrentRoundDamOnly
    ? {}
    : (hasHistoricalDam ? (my_result.bid_dispatch || {}) : {})
  
  const damDeviceHourlyDetails = isCurrentRoundDamOnly
    ? preferredDamDeviceHourlyDetails
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

  const hasIdmActivity = hasBidDispatchRows(idmBidDispatch)
    || effectiveHourlyResults.some((entry) => {
      const smp = Number(entry?.smp ?? 0)
      const volume = Number(entry?.volume ?? 0)
      const idVolume = Number(entry?.id_volume_mwh ?? 0)
      return (Number.isFinite(smp) && smp > 0)
        || (Number.isFinite(volume) && volume > 0)
        || (Number.isFinite(idVolume) && idVolume > 0)
    })
  const showDamBaselineNotice = isIdmRound && hasDam && !hasIdmActivity

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
  const deviceType = (deviceConfig.type || 'Unknown').toLowerCase()
  const isBatteryDevice = deviceType === 'battery'
  const devicePowerMw = Number(
    deviceConfig.power_mw
    || deviceConfig.power_rating_mw
    || deviceConfig.max_power_mw
    || deviceConfig.capacity_mw
    || 0
  )
  const deviceEnergyMwh = Number(deviceConfig.capacity_mwh || 0)
  const batteryLegEfficiency = (() => {
    if (!isBatteryDevice) return 0
    const rtePct = Number(deviceConfig.efficiency_pct ?? 85)
    const rte = Number.isFinite(rtePct) ? Math.max(0.01, Math.min(1, rtePct / 100)) : 0.85
    return Math.sqrt(rte)
  })()
  const deviceCapacity = isBatteryDevice ? devicePowerMw : Number(deviceConfig.capacity_mw || deviceConfig.max_power_mw || 0)

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

  const deviceHeadline = isBatteryDevice
    ? `${deviceType} • ${devicePowerMw > 0 ? `${formatNumber(devicePowerMw, 1)} MW` : '? MW'}${deviceEnergyMwh > 0 ? ` • ${formatNumber(deviceEnergyMwh, 1)} MWh` : ''}`
    : `${deviceType} • ${deviceCapacity > 0 ? formatNumber(deviceCapacity, 1) : '?'} MW`

  const displayMoney = (value) => {
    const num = Number(value ?? 0)
    if (!Number.isFinite(num)) return 0
    return isConsumer ? Math.abs(num) : num
  }

  const parseOptionalNumber = (value) => {
    if (value === undefined || value === null || value === '') return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
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

  // Pre-build lookup for player-level grid_curtailed_mw (lives in kpis.hourly_breakdown, not device-level)
  const playerHourlyByScenarioHour = (my_result?.kpis?.hourly_breakdown || []).reduce((acc, entry) => {
    const key = entry?.hour ?? entry?.hour_idx ?? entry?.scenario_hour_idx ?? entry?.hour_offset
    if (key !== undefined && key !== null) acc[Number(key)] = entry
    return acc
  }, {})

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
    const baseCapacityRaw = parseOptionalNumber(deviceBreakdown.base_capacity_mw)
    const effectiveCapacityRaw = parseOptionalNumber(deviceBreakdown.effective_capacity_mw)
    const totalOfferedFromBreakdown = deviceBreakdown.total_offered_mw || 0

    // Calculate totals for DAM/IDM:
    // Prefer backend-provided canonical DA/ID split so KPI and details cannot diverge.
    const totalOffered_DAM = (lotA_DAM.mw_offered || 0) + (lotB_DAM.mw_offered || 0) + (lotC_DAM.mw_offered || 0)
    const totalOffered_IDM = getSignedOffered(lotA_IDM) + getSignedOffered(lotB_IDM) + getSignedOffered(lotC_IDM)

    const backendDaDispatched = parseOptionalNumber(deviceBreakdown.da_dispatched_mwh)
    const backendIdDispatched = parseOptionalNumber(deviceBreakdown.id_dispatched_mwh)

    const totalDispatched_DAM = backendDaDispatched !== null
      ? backendDaDispatched
      : ((lotA_DAM.mw_dispatched || 0) + (lotB_DAM.mw_dispatched || 0) + (lotC_DAM.mw_dispatched || 0))

    const totalDispatched_IDM = backendIdDispatched !== null
      ? backendIdDispatched
      : ((lotA_IDM.mw_dispatched || 0) + (lotB_IDM.mw_dispatched || 0) + (lotC_IDM.mw_dispatched || 0))
    const marketAwardedMwh = totalDispatched_DAM + totalDispatched_IDM

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
      ? (baseCapacityRaw !== null && baseCapacityRaw > 0 ? baseCapacityRaw : fallbackDemandBase)
      : (baseCapacityRaw ?? Number(deviceCapacity || 0))
    const effectiveCapacity = isConsumer
      ? (effectiveCapacityRaw !== null && effectiveCapacityRaw > 0 ? effectiveCapacityRaw : fallbackDemandEffective)
      : (effectiveCapacityRaw ?? Number(deviceCapacity || 0))

    const offeredForOverbid = totalOfferedFromBreakdown > 0 ? totalOfferedFromBreakdown : totalOffered_DAM
    const backendOverbid = parseOptionalNumber(deviceBreakdown.overbid_mw)
    const fallbackOverbid = Math.max(0, offeredForOverbid - Number(effectiveCapacity || 0))
    const preferFallbackConsumerOverbid = isConsumer
      && offeredForOverbid > 0
      && effectiveCapacity > 0
      && (effectiveCapacityRaw === null || effectiveCapacityRaw <= 0)
    const overbidMw = (!preferFallbackConsumerOverbid && backendOverbid !== null)
      ? backendOverbid
      : fallbackOverbid
    const capacityViolation = Boolean(deviceBreakdown.capacity_violation) || overbidMw > 0.001
    
    const smp = hour.smp || 0
    const backendDaPrice = parseOptionalNumber(deviceBreakdown.da_price_zar)
    const backendIdPrice = parseOptionalNumber(deviceBreakdown.id_price_zar)
    const damPrice = backendDaPrice !== null
      ? backendDaPrice
      : (Number.isFinite(roundLevelDaPrice) ? roundLevelDaPrice : smp)
    const fallbackIdPrice = (hour.idp !== undefined && hour.idp !== null)
      ? Number(hour.idp)
      : (Number.isFinite(roundLevelIdp) ? roundLevelIdp : smp)
    const idp = (backendIdPrice !== null && backendIdPrice > 0)
      ? backendIdPrice
      : (Number.isFinite(fallbackIdPrice) && fallbackIdPrice > 0 ? fallbackIdPrice : null)
    // Revenue: always prefer backend canonical settlement values (DA+ID), otherwise fallback.
    const backendDaRevenue = parseOptionalNumber(deviceBreakdown.da_revenue_zar)
    const backendIdRevenue = parseOptionalNumber(deviceBreakdown.id_revenue_zar)
    const backendRevenue = parseOptionalNumber(deviceBreakdown.revenue_zar)

    const revenue_DAM = backendDaRevenue !== null
      ? backendDaRevenue
      : (totalDispatched_DAM * damPrice)

    const revenue_IDM = backendIdRevenue !== null
      ? backendIdRevenue
      : (totalDispatched_IDM * (Number.isFinite(idp) ? idp : 0))

    const totalDispatched = totalDispatched_DAM + totalDispatched_IDM
    const imbalanceMwhBackend = parseOptionalNumber(deviceBreakdown.imbalance_mwh)
    const imbalanceMwhDisplay = imbalanceMwhBackend !== null
      ? imbalanceMwhBackend
      : Number(balancingData.imbalance_mwh || 0)

    const imbalanceCostBackend = parseOptionalNumber(deviceBreakdown.imbalance_cost_zar)
    const imbalanceCostDisplay = imbalanceCostBackend !== null
      ? imbalanceCostBackend
      : Number(balancingData.balancing_cost_zar || 0)

    const chargedMwh = Number(deviceBreakdown.battery_charged_mwh ?? 0)
    const explicitDischargedMwh = parseOptionalNumber(deviceBreakdown.battery_discharged_mwh)
    let dischargedMwh = explicitDischargedMwh !== null ? explicitDischargedMwh : 0
    if (explicitDischargedMwh === null && isBatteryDevice && deviceEnergyMwh > 0 && batteryLegEfficiency > 0) {
      const socStartPct = parseOptionalNumber(deviceBreakdown.battery_soc_start_pct)
      const socEndPct = parseOptionalNumber(deviceBreakdown.battery_soc_end_pct)
      if (socStartPct !== null && socEndPct !== null) {
        const socStartMwh = deviceEnergyMwh * socStartPct / 100
        const socEndMwh = deviceEnergyMwh * socEndPct / 100
        dischargedMwh = Math.max(0, (socStartMwh + chargedMwh * batteryLegEfficiency - socEndMwh) * batteryLegEfficiency)
      }
    }
    const awardPhysicalGapMwh = Math.max(0, marketAwardedMwh - dischargedMwh)

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
      hasBaseCapacityValue: baseCapacityRaw !== null || baseCapacity > 0,
      baseCapacity,
      hasEffectiveCapacityValue: effectiveCapacityRaw !== null || effectiveCapacity > 0,
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
      // Network curtailment from player-level hourly_breakdown (producer only)
      // Declared before netMwh so we can subtract it in the same object literal.
      gridCurtailedMw: Number(playerHourlyByScenarioHour[Number(scenarioHourIdx)]?.grid_curtailed_mw || 0),
      // Totals — subtract curtailed MWh so Net MWh reflects actual delivery
      get netMwh() { return totalDispatched_DAM + totalDispatched_IDM + imbalanceMwhDisplay - this.gridCurtailedMw },
      netRevenue: ((backendRevenue !== null)
        ? backendRevenue
        : (revenue_DAM + revenue_IDM)) - imbalanceCostDisplay - Number(deviceBreakdown.battery_charge_cost_zar ?? 0),
      // Battery SoC fields (non-zero only for battery devices)
      socStartPct: Number(deviceBreakdown.battery_soc_start_pct ?? 0),
      socEndPct: Number(deviceBreakdown.battery_soc_end_pct ?? 0),
      chargedMwh,
      dischargedMwh,
      chargeCostZar: Number(deviceBreakdown.battery_charge_cost_zar ?? 0),
      marketAwardedMwh,
      awardPhysicalGapMwh,
      networkShortfallMwh: Number(deviceBreakdown.network_shortfall_mwh ?? 0),
      networkShortfallCostZar: Number(deviceBreakdown.network_shortfall_cost_zar ?? 0),
      // Effective average cost rate for this hour (tiered or flat, from backend)
      variableCostRateEffective: Number(deviceBreakdown.variable_cost_rate_effective_zar ?? NaN),
      // Backend-settled cost values (prefer over frontend-recalculated)
      variableCostZar: Number(deviceBreakdown.variable_cost_zar ?? NaN),
      fixedCostZar: Number(deviceBreakdown.fixed_cost_zar ?? NaN),
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
    totalCO2: hourlyData.reduce((sum, h) => sum + h.co2Kg, 0),
    totalGridCurtailed: hourlyData.reduce((sum, h) => sum + (h.gridCurtailedMw || 0), 0),
    totalNetworkShortfallCostZar: hourlyData.reduce((sum, h) => sum + (h.networkShortfallCostZar || 0), 0),
    // Battery
    totalChargedMwh: hourlyData.reduce((sum, h) => sum + (h.chargedMwh || 0), 0),
    totalDischargedMwh: hourlyData.reduce((sum, h) => sum + (h.dischargedMwh || 0), 0),
    totalChargeCostZar: hourlyData.reduce((sum, h) => sum + (h.chargeCostZar || 0), 0),
    totalMarketAwardedMwh: hourlyData.reduce((sum, h) => sum + (h.marketAwardedMwh || 0), 0),
    battSocStart: hourlyData.length > 0 ? hourlyData[0].socStartPct : 0,
    battSocEnd: hourlyData.length > 0 ? hourlyData[hourlyData.length - 1].socEndPct : 0,
  }
  const showIdmSection = hourlyData.some((h) => (
    h.totalOffered_IDM !== 0
    || h.totalDispatched_IDM > 0
    || displayMoney(h.revenue_IDM) !== 0
    || h.idp > 0
    || h.smp > 0
  ))
  const batteryAwardPhysicalGapMwh = Math.max(0, roundTotals.totalMarketAwardedMwh - roundTotals.totalDischargedMwh)

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
    // Prefer backend-settled value (includes tiered cost logic)
    if (Number.isFinite(hourData.variableCostZar) && hourData.variableCostZar >= 0) return hourData.variableCostZar
    // Fall back to frontend recalculation
    const dispatchedMwh = Math.max(0, Number(hourData.totalDispatched_DAM || 0) + Number(hourData.totalDispatched_IDM || 0))
    const rate = Number.isFinite(hourData.variableCostRateEffective) && hourData.variableCostRateEffective >= 0
      ? hourData.variableCostRateEffective
      : selectedDeviceVariableRate
    return dispatchedMwh * rate
  })

  const rawHourlyFixedCosts = hourlyData.map((hourData) =>
    Number.isFinite(hourData.fixedCostZar) ? hourData.fixedCostZar : selectedDeviceFixedPerHour
  )

  const hourlyVariableCosts = rawHourlyVariableCosts
  const hourlyFixedCosts = rawHourlyFixedCosts
  const hourlyVariableCostTotal = hourlyVariableCosts.reduce((sum, value) => sum + value, 0)
  const hourlyFixedCostTotal = hourlyFixedCosts.reduce((sum, value) => sum + value, 0)

  // ─── Tooltip helpers ────────────────────────────────────────────────────────
  // Returns a tooltip-wrapped label for the first (row-label) cell.
  const RowLabel = ({ children, title }) => (
    <Tooltip
      title={<Typography variant="caption" sx={{ whiteSpace: 'pre-line' }}>{title}</Typography>}
      placement="right"
      arrow
      enterDelay={300}
    >
      <span style={{ cursor: 'help', borderBottom: '1px dotted #aaa' }}>{children}</span>
    </Tooltip>
  )

  // Returns a tooltip-wrapped cell value for an hourly data cell.
  const HourTip = ({ children, title }) => (
    <Tooltip
      title={<Typography variant="caption" sx={{ whiteSpace: 'pre-line' }}>{title}</Typography>}
      placement="top"
      arrow
      enterDelay={300}
    >
      <span style={{ cursor: 'help' }}>{children}</span>
    </Tooltip>
  )

  // Returns a tooltip-wrapped cell value for a Round Total cell.
  const TotalTip = ({ children, title }) => (
    <Tooltip
      title={<Typography variant="caption" sx={{ whiteSpace: 'pre-line' }}>{title}</Typography>}
      placement="left"
      arrow
      enterDelay={300}
    >
      <span style={{ cursor: 'help' }}>{children}</span>
    </Tooltip>
  )

  // Formats a number safely for use in tooltip strings.
  const tt = (v, dec = 1) => {
    const n = Number(v ?? 0)
    return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—'
  }
  const tti = (v) => {
    const n = Number(v ?? 0)
    return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—'
  }

  const formatTooltipMoney = (value) => {
    const num = Number(value ?? 0)
    if (!Number.isFinite(num)) return 'ZAR 0'
    return `ZAR ${Math.round(Math.abs(num)).toLocaleString('en-US')}`
  }

  const rowVisibilityReason = (metricKey) => {
    if (metricKey.startsWith('idm_')) {
      return 'Visible because this device has non-zero intraday market data in at least one shown hour.'
    }
    if (metricKey.startsWith('battery_')) {
      return 'Visible because the selected device is a battery and state-of-charge / charging data exists for battery devices only.'
    }
    if (metricKey === 'grid_curtailed') {
      return 'Visible because this producer has player-level constrained-off energy in the round and the value is only shown in the single-device producer view to avoid double counting.'
    }
    if (metricKey === 'network_shortfall_cost') {
      return 'Visible because redispatch cost from zonal/network shortfall is non-zero in this consumer round.'
    }
    if (metricKey === 'avg_cost_rate') {
      return 'Visible because at least one hour contains an effective variable cost rate from backend settlement.'
    }
    return 'Visible in the standard detail table for the selected device and shown round hours.'
  }

  const getRowTooltip = (metricKey) => {
    const roleDemand = isConsumer ? 'demand' : 'capacity'
    const revenueLabel = isConsumer ? 'cost' : 'revenue'
    const netRevenueLabel = isConsumer ? 'Net Cost (signed settlement after imbalance and battery charging cost at device level)' : 'Net Revenue (device-level settlement after imbalance and battery charging cost)'

    const descriptions = {
      base_capacity: `Base ${roleDemand} is the pre-adjustment technical baseline for this device in the hour. It is the reference before profiles, events, availability effects, or other effective-capacity modifiers are applied.\n\n${rowVisibilityReason('base_capacity')}`,
      effective_capacity: `Effective ${roleDemand} is the volume that is actually available for market clearing in the hour after profiles, events, and other dynamic constraints are applied. If it is below the base value, the device was effectively derated for that hour.\n\n${rowVisibilityReason('effective_capacity')}`,
      dam_offered: `This row shows the total day-ahead volume offered or requested by the device in the shown hour. It is the sum of the Base, Mid, and Peak DAM bid lots.\n\n${rowVisibilityReason('dam_offered')}`,
      dam_lot_a: `This is the day-ahead Base bid lot. The number in brackets is the average bid price across shown hours where the lot has a price. The colored cell background indicates clearing outcome: green high acceptance, yellow/orange partial acceptance, red rejection or capacity-violation context.\n\n${rowVisibilityReason('dam_lot_a')}`,
      dam_lot_b: `This is the day-ahead Mid bid lot. The number in brackets is the average bid price across shown hours where the lot has a price. The colored cell background indicates clearing outcome: green high acceptance, yellow/orange partial acceptance, red rejection or capacity-violation context.\n\n${rowVisibilityReason('dam_lot_b')}`,
      dam_lot_c: `This is the day-ahead Peak bid lot. The number in brackets is the average bid price across shown hours where the lot has a price. The colored cell background indicates clearing outcome: green high acceptance, yellow/orange partial acceptance, red rejection or capacity-violation context.\n\n${rowVisibilityReason('dam_lot_c')}`,
      dam_price: isIdmRound
        ? `This row shows the day-ahead settlement price used for the DA portion of settlement in each hour. In later rounds with active IDM it stays the DA baseline price for previously cleared DA volume.\n\n${rowVisibilityReason('dam_price')}`
        : `This row shows the market clearing price (SMP) used to settle the shown DAM-only hour.\n\n${rowVisibilityReason('dam_price')}`,
      dam_dispatched: `${isBatteryDevice ? 'This row shows the day-ahead awarded market volume for the battery.' : 'This row shows the day-ahead dispatched or consumed volume for the device.'} It is the awarded DA volume, preferably taken from backend-settled DA dispatch fields so the detail table stays consistent with the KPI computation.${isBatteryDevice ? ' For batteries this is a market commitment and can exceed the physically executable discharge shown in the Battery Storage section.' : ''}\n\n${rowVisibilityReason('dam_dispatched')}`,
      grid_curtailed: `Grid curtailed energy is commercially cleared producer output that could not be physically transported because of network constraints. It is shown separately so delivery and profit interpretation can distinguish market clearing from feasible physical transport.\n\n${rowVisibilityReason('grid_curtailed')}`,
      dam_revenue: `This row shows day-ahead ${revenueLabel} for the device. It is based on backend-settled DA revenue when available, otherwise approximated as DA dispatched volume × DA price.\n\n${rowVisibilityReason('dam_revenue')}`,
      overbid: `${isConsumer ? 'Over-demand' : 'Overbid'} is the part of offered/requested volume that exceeds effective ${roleDemand}. It highlights hours where the market request was above what the device could effectively provide or absorb.\n\n${rowVisibilityReason('overbid')}`,
      idm_offered: `This row shows the total intraday volume offered or requested by the device in the shown hour. It is the signed sum of the Base, Mid, and Peak IDM bid lots, so purchases and sales can offset each other.\n\n${rowVisibilityReason('idm_offered')}`,
      idm_lot_a: `This is the intraday Base bid lot. The number in brackets is the average bid price across shown hours where the lot has a price. For intraday rows the offered quantity is signed, so negative values can represent charging or buying behavior.\n\n${rowVisibilityReason('idm_lot_a')}`,
      idm_lot_b: `This is the intraday Mid bid lot. The number in brackets is the average bid price across shown hours where the lot has a price. For intraday rows the offered quantity is signed, so negative values can represent charging or buying behavior.\n\n${rowVisibilityReason('idm_lot_b')}`,
      idm_lot_c: `This is the intraday Peak bid lot. The number in brackets is the average bid price across shown hours where the lot has a price. For intraday rows the offered quantity is signed, so negative values can represent charging or buying behavior.\n\n${rowVisibilityReason('idm_lot_c')}`,
      id_price: `This row shows the current intraday market price used for the IDM portion of device settlement in each hour. If the backend does not provide a dedicated ID price, the UI falls back to the current hourly IDP/SMP so the current round price remains visible even without a cleared player-side intraday trade.\n\n${rowVisibilityReason('id_price')}`,
      idm_dispatched: `${isBatteryDevice ? 'This row shows the incremental intraday awarded market volume for the battery.' : 'This row shows the incremental intraday dispatched or consumed volume for the device.'} It is the awarded IDM delta, preferably from backend-settled ID dispatch fields so the detail table matches KPI settlement logic.${isBatteryDevice ? ' For batteries this is a market commitment and can differ from physical charge/discharge.' : ''}\n\n${rowVisibilityReason('idm_dispatched')}`,
      idm_revenue: `This row shows intraday ${revenueLabel} for the device. It is based on backend-settled IDM revenue when available, otherwise approximated as IDM dispatched volume × IDM price.\n\n${rowVisibilityReason('idm_revenue')}`,
      battery_soc_start: 'SoC Start is the battery state of charge at the start of the hour, after the previous hour has been settled and before the current hour charging/discharging is applied.\n\n' + rowVisibilityReason('battery_soc_start'),
      battery_soc_end: 'SoC End is the battery state of charge after the current hour charging/discharging has been applied in the backend battery state logic.\n\n' + rowVisibilityReason('battery_soc_end'),
      battery_charged: 'Charged energy is the grid-side charging volume stored for the battery in the hour. It is a physical charging flow and does not itself mean positive market revenue; it usually creates a charge cost.\n\n' + rowVisibilityReason('battery_charged'),
      battery_discharged: 'Executed discharge is the physical battery energy actually delivered in the hour. Source priority: explicit backend battery_discharged_mwh; otherwise the UI derives it from battery SoC start/end, charge volume, and battery efficiency.\n\n' + rowVisibilityReason('battery_discharged'),
      battery_charge_cost: 'Charge Cost is the settlement cost caused by charging the battery in the hour. It is shown as a negative contribution because charging consumes market energy rather than selling it.\n\n' + rowVisibilityReason('battery_charge_cost'),
      imbalance: 'Imbalance is the difference between dispatched position and actual realized device outcome in the hour, based on backend balancing detail when available. A non-zero value leads to balancing settlement.\n\n' + rowVisibilityReason('imbalance'),
      imbalance_cost: 'Imbalance Cost is the monetary settlement of the imbalance using configured balancing prices rather than the market clearing price. Non-zero imbalance cost directly worsens profit or net result.\n\n' + rowVisibilityReason('imbalance_cost'),
      balancing_price: 'Balancing Price is the effective price per MWh used to settle the imbalance in the hour. If the backend provides an explicit balancing price it is shown; otherwise it is inferred from imbalance cost divided by imbalance MWh.\n\n' + rowVisibilityReason('balancing_price'),
      net_mwh: 'Net MWh is the device-level delivered energy after combining DA dispatch, IDM dispatch, imbalance, and producer-side grid curtailment. It shows what effectively remains as net physical energy contribution in the hour.\n\n' + rowVisibilityReason('net_mwh'),
      net_revenue: `${netRevenueLabel}. It is not the same as round profit: for producers, variable cost, fixed cost, redispatch cost (ATC), and congestion revenue are handled separately at KPI level.\n\n${rowVisibilityReason('net_revenue')}`,
      network_shortfall_cost: 'Redispatch Cost (ATC) is the network-related cost caused by zonal shortfall or transport limits. It is separate from imbalance cost and is shown only when it is present.\n\n' + rowVisibilityReason('network_shortfall_cost'),
      variable_cost: 'Variable Cost is the backend-settled or reconstructed operating cost associated with dispatched production in the hour. It contributes negatively to producer profit.\n\n' + rowVisibilityReason('variable_cost'),
      fixed_cost: 'Fixed Cost is the per-hour fixed operating cost attributed to this device in the hour. It contributes negatively to producer profit independently of dispatched volume.\n\n' + rowVisibilityReason('fixed_cost'),
      avg_cost_rate: 'Average Cost Rate is the effective variable cost per dispatched MWh in the hour. It is shown only when a backend effective variable cost rate exists.\n\n' + rowVisibilityReason('avg_cost_rate'),
      co2: `CO2 is the device-level emission contribution for the hour. Backend values are stored in kg and shown here directly in kg. It feeds the round CO2 KPI by summation over devices and hours.\n\n${rowVisibilityReason('co2')}`,
    }
    return descriptions[metricKey] || rowVisibilityReason(metricKey)
  }

  const getHourTooltip = (metricKey, hourData, extra = {}) => {
    const demandLabel = isConsumer ? 'demand' : 'capacity'
    const costLabel = isConsumer ? 'cost' : 'revenue'
    const lines = [`Hour ${hourData.hourLabel}`]

    switch (metricKey) {
      case 'base_capacity':
        lines.push(`Displayed value: ${tt(hourData.baseCapacity)} MW.`)
        lines.push(`Source: frontend uses device-hour breakdown base_capacity_mw when present; otherwise a role-specific fallback baseline is derived.`)
        break
      case 'effective_capacity':
        lines.push(`Displayed value: ${tt(hourData.effectiveCapacity)} MW.`)
        lines.push(`Source: device-hour breakdown effective_capacity_mw when available, otherwise a fallback derived from actual/planned/dispatch context.`)
        lines.push(`Interpretation: this is the effective ${demandLabel} after dynamic reductions, profiles, or event effects.`)
        break
      case 'dam_offered':
        lines.push(`Formula: DAM total offered = lot A + lot B + lot C = ${tt(hourData.lotA_DAM.mw_offered || 0)} + ${tt(hourData.lotB_DAM.mw_offered || 0)} + ${tt(hourData.lotC_DAM.mw_offered || 0)} = ${tt(hourData.totalOffered_DAM)} MWh.`)
        break
      case 'dam_lot_a':
      case 'dam_lot_b':
      case 'dam_lot_c': {
        const lot = metricKey === 'dam_lot_a' ? hourData.lotA_DAM : metricKey === 'dam_lot_b' ? hourData.lotB_DAM : hourData.lotC_DAM
        lines.push(`Displayed value: ${tt(lot.mw_offered || 0)} MWh offered in this DAM lot at ${tti(lot.price_bid || 0)} ZAR/MWh.`)
        lines.push(`Acceptance ratio: ${tt((lot.acceptance_ratio || 0) * 100)}%. Dispatched from this lot: ${tt(lot.mw_dispatched || 0)} MWh.`)
        if (hourData.capacityViolation) lines.push(`The red background is consistent with a capacity-violation context because offered volume exceeds effective ${demandLabel} in this hour.`)
        break
      }
      case 'dam_price':
        lines.push(`Displayed value: ${tt(hourData.damPrice)} ZAR/MWh.`)
        lines.push('Source priority: device-hour breakdown DA price, otherwise round-level DA price, otherwise SMP fallback.')
        break
      case 'dam_dispatched':
        lines.push(`Displayed value: ${tt(hourData.totalDispatched_DAM)} MWh.`)
        lines.push(`Source priority: backend da_dispatched_mwh, otherwise sum of DAM lot dispatches.`)
        lines.push(`Fallback formula: ${tt(hourData.lotA_DAM.mw_dispatched || 0)} + ${tt(hourData.lotB_DAM.mw_dispatched || 0)} + ${tt(hourData.lotC_DAM.mw_dispatched || 0)} MWh.`)
        if (isBatteryDevice) lines.push(`For batteries this is the awarded DA market position, not necessarily the physically executable discharge. Compare with Executed Discharge = ${tt(hourData.dischargedMwh)} MWh.`)
        break
      case 'grid_curtailed':
        lines.push(`Displayed value: ${tt(hourData.gridCurtailedMw)} MWh.`)
        lines.push('Source: player-level hourly breakdown grid_curtailed_mw for the same scenario hour.')
        lines.push('This is constrained-off producer volume after market clearing and is subtracted from net MWh.')
        break
      case 'dam_revenue':
        lines.push(`Displayed value: ${tti(displayMoney(hourData.revenue_DAM))} ${isConsumer ? 'ZAR cost' : 'ZAR revenue'}.`)
        lines.push(`Source priority: backend da_revenue_zar; fallback formula: ${tt(hourData.totalDispatched_DAM)} × ${tt(hourData.damPrice)} = ${tt(hourData.totalDispatched_DAM * hourData.damPrice, 1)} ZAR.`)
        break
      case 'overbid':
        lines.push(`Displayed value: ${tt(hourData.overbidMw)} MW.`)
        lines.push(`Formula: max(0, offered/requested - effective ${demandLabel}) = max(0, ${tt((hourData.totalOffered_DAM || 0))} - ${tt(hourData.effectiveCapacity)}) with backend overbid preferred when available.`)
        break
      case 'idm_offered':
        lines.push(`Formula: IDM total offered = signed lot A + lot B + lot C = ${tt(getSignedOffered(hourData.lotA_IDM), 1)} + ${tt(getSignedOffered(hourData.lotB_IDM), 1)} + ${tt(getSignedOffered(hourData.lotC_IDM), 1)} = ${tt(hourData.totalOffered_IDM)} MWh.`)
        lines.push('Signed values are intentional: buys/charging can appear negative while sells/discharging appear positive.')
        break
      case 'idm_lot_a':
      case 'idm_lot_b':
      case 'idm_lot_c': {
        const lot = metricKey === 'idm_lot_a' ? hourData.lotA_IDM : metricKey === 'idm_lot_b' ? hourData.lotB_IDM : hourData.lotC_IDM
        lines.push(`Displayed value: ${tt(getSignedOffered(lot))} MWh signed intraday offer at ${tti(lot.price_bid || 0)} ZAR/MWh.`)
        lines.push(`Dispatch from this lot: ${tt(lot.mw_dispatched || 0)} MWh. Acceptance ratio: ${tt((lot.acceptance_ratio || 0) * 100)}%.`)
        break
      }
      case 'id_price':
        lines.push(`Displayed value: ${tt(hourData.idp)} ZAR/MWh.`)
        lines.push('Source priority: backend id_price_zar when positive, otherwise hourly ID price, otherwise round-level ID price, otherwise current SMP fallback.')
        break
      case 'idm_dispatched':
        lines.push(`Displayed value: ${tt(hourData.totalDispatched_IDM)} MWh.`)
        lines.push('Source priority: backend id_dispatched_mwh, otherwise sum of IDM lot dispatches.')
        if (isBatteryDevice) lines.push(`For batteries this is the awarded IDM market delta, not necessarily the physical battery movement. Compare with Executed Discharge = ${tt(hourData.dischargedMwh)} MWh and Charged = ${tt(hourData.chargedMwh)} MWh.`)
        break
      case 'idm_revenue':
        lines.push(`Displayed value: ${tti(displayMoney(hourData.revenue_IDM))} ${isConsumer ? 'ZAR cost' : 'ZAR revenue'}.`)
        lines.push(`Source priority: backend id_revenue_zar; fallback formula: ${tt(hourData.totalDispatched_IDM)} × ${tt(hourData.idp || 0)}.`)
        break
      case 'battery_soc_start':
        lines.push(`Displayed value: ${tt(hourData.socStartPct, 0)}%.`)
        lines.push('Source: battery_soc_start_pct from backend device-hour breakdown.')
        break
      case 'battery_soc_end':
        lines.push(`Displayed value: ${tt(hourData.socEndPct, 0)}%.`)
        lines.push('Source: battery_soc_end_pct from backend device-hour breakdown after hourly charge/discharge logic.')
        break
      case 'battery_charged':
        lines.push(`Displayed value: ${tt(hourData.chargedMwh)} MWh.`)
        lines.push('Source: battery_charged_mwh from backend device-hour breakdown.')
        break
      case 'battery_discharged':
        lines.push(`Displayed value: ${tt(hourData.dischargedMwh)} MWh.`)
        lines.push('Source priority: backend battery_discharged_mwh; fallback derives physical discharge from battery SoC start/end, charge volume, and efficiency.')
        lines.push(`This is the physical battery output. Market-awarded volume for the same hour is ${tt(hourData.marketAwardedMwh)} MWh.`)
        break
      case 'battery_charge_cost':
        lines.push(`Displayed value: -${formatTooltipMoney(hourData.chargeCostZar)}.`)
        lines.push(`Source: battery_charge_cost_zar from backend device-hour breakdown.`)
        lines.push('This value is subtracted in profit / net-result calculations.')
        break
      case 'imbalance':
        lines.push(`Displayed value: ${tt(hourData.imbalanceMwh)} MWh.`)
        lines.push('Source priority: backend imbalance_mwh from device breakdown; fallback balancing detail imbalance_mwh.')
        break
      case 'imbalance_cost':
        lines.push(`Displayed value: ${formatTooltipMoney(hourData.imbalanceCostDisplay)}.`)
        lines.push('Source priority: backend imbalance_cost_zar from device breakdown; fallback balancing detail balancing_cost_zar.')
        break
      case 'balancing_price':
        lines.push(`Displayed value: ${tti(hourData.balancingPrice)} ZAR/MWh.`)
        lines.push('Source: explicit backend balancing price when available; otherwise inferred as |imbalance cost / imbalance MWh|.')
        break
      case 'net_mwh':
        lines.push(`Formula: net MWh = DA dispatch + IDM dispatch + imbalance - grid curtailment = ${tt(hourData.totalDispatched_DAM)} + ${tt(hourData.totalDispatched_IDM)} + ${tt(hourData.imbalanceMwh)} - ${tt(hourData.gridCurtailedMw || 0)} = ${tt(hourData.netMwh)} MWh.`)
        break
      case 'net_revenue':
        lines.push(`Displayed value: ${formatTooltipMoney(displayMoney(hourData.netRevenue))} ${costLabel}.`)
        lines.push(`Formula: (${tt(hourData.revenue_DAM)} + ${tt(hourData.revenue_IDM)}) - ${tt(hourData.imbalanceCostDisplay)} - ${tt(hourData.chargeCostZar || 0)} = ${tt(hourData.netRevenue)} ZAR, with backend revenue_zar preferred when available.`)
        lines.push('This is a device-level settlement view, not full round profit.')
        break
      case 'network_shortfall_cost':
        lines.push(`Displayed value: ${formatTooltipMoney(hourData.networkShortfallCostZar)}.`)
        lines.push('Source: network_shortfall_cost_zar from backend device breakdown.')
        lines.push('This contributes to round Redispatch Cost (ATC).')
        break
      case 'variable_cost':
        lines.push(`Displayed value: ${formatTooltipMoney(hourlyVariableCosts[extra.hourIndex])}.`)
        lines.push('Source priority: backend variable_cost_zar; fallback formula: dispatched MWh × effective variable cost rate.')
        break
      case 'fixed_cost':
        lines.push(`Displayed value: ${formatTooltipMoney(hourlyFixedCosts[extra.hourIndex])}.`)
        lines.push('Source priority: backend fixed_cost_zar; fallback fixed_cost_zar_per_hour from device config.')
        break
      case 'avg_cost_rate':
        lines.push(`Displayed value: ${tt(hourData.variableCostRateEffective)} ZAR/MWh.`)
        lines.push('Source: variable_cost_rate_effective_zar from backend device breakdown.')
        break
      case 'co2':
        lines.push(`Displayed value: ${tt(hourData.co2Kg)} kg.`)
        lines.push('Source priority: backend device breakdown co2_kg; fallback device CO2 detail for the hour.')
        lines.push('This contributes directly to the round CO2 KPI by summation.')
        break
      default:
        lines.push('Value explanation not defined.')
    }

    return lines.join('\n')
  }

  const getTotalTooltip = (metricKey) => {
    const lines = ['Round total / aggregate column']
    switch (metricKey) {
      case 'base_capacity':
      case 'effective_capacity':
        lines.push('No round total is shown because these are hour-specific technical reference values and a sum would be misleading.')
        lines.push('These values influence dispatch feasibility indirectly, not KPIs by direct aggregation.')
        break
      case 'dam_offered':
        lines.push(`Formula: sum of hourly DAM total offered values = ${tt(roundTotals.totalOffered_DAM)} MWh.`)
        lines.push('This does not feed a KPI directly, but it provides context for award rates, overbid, and price competitiveness.')
        break
      case 'dam_lot_a':
      case 'dam_lot_b':
      case 'dam_lot_c':
        lines.push('Formula: sum of hourly offered values in this lot across the shown hours.')
        lines.push('This is an input-side explanation row. It does not feed a KPI directly, but affects dispatch and therefore revenue/cost and imbalance outcomes.')
        break
      case 'dam_price':
        lines.push(`Formula: arithmetic average of shown hourly DA prices = ${tt(roundTotals.avgDamPrice)} ZAR/MWh.`)
        lines.push('This is explanatory only. KPI revenue is not computed from this average but from hour-by-hour price × volume settlement.')
        break
      case 'dam_dispatched':
        lines.push(`Formula: sum of hourly DA dispatched values = ${tt(roundTotals.totalDispatched_DAM)} MWh.`)
        lines.push(isBatteryDevice
          ? 'For batteries this is the awarded DA market position. Physical battery output is shown separately in Executed Discharge.'
          : 'This contributes to dispatched_mwh KPI and, together with prices, to revenue/cost KPIs.')
        break
      case 'grid_curtailed':
        lines.push(`Formula: sum of hourly grid-curtailed values = ${tt(roundTotals.totalGridCurtailed)} MWh.`)
        lines.push('This does not appear as a standalone KPI card here, but it reduces effective net delivery and explains network-constrained producer outcomes.')
        break
      case 'dam_revenue':
        lines.push(`Formula: sum of hourly DA ${isConsumer ? 'cost' : 'revenue'} values = ${tti(roundTotals.revenue_DAM)} ZAR.`)
        lines.push('This is a settlement component of the round revenue/cost KPI, but full KPI revenue also includes IDM settlement where applicable.')
        break
      case 'overbid':
        lines.push(`Formula: sum of hourly overbid / over-demand values = ${tt(roundTotals.totalOverbid)} MW.`)
        lines.push('This does not feed a KPI directly. It explains technical infeasibility that can drive reduced dispatch and later imbalance.')
        break
      case 'idm_offered':
        lines.push(`Formula: sum of signed hourly IDM offers = ${tt(roundTotals.totalOffered_IDM)} MWh.`)
        lines.push('This does not feed a KPI directly, but it explains the intraday position that can change dispatch and settlement.')
        break
      case 'idm_lot_a':
      case 'idm_lot_b':
      case 'idm_lot_c':
        lines.push('Formula: sum of hourly signed offered values in this intraday lot across the shown hours.')
        lines.push('This is explanatory input data, not a KPI by itself.')
        break
      case 'id_price':
        lines.push(`Formula: arithmetic average of shown hourly current intraday prices = ${tt(roundTotals.avgIdPrice)} ZAR/MWh.`)
        lines.push('This is explanatory only. KPI revenue/cost uses hour-by-hour settlement, not the displayed average.')
        break
      case 'idm_dispatched':
        lines.push(`Formula: sum of hourly IDM dispatched values = ${tt(roundTotals.totalDispatched_IDM)} MWh.`)
        lines.push(isBatteryDevice
          ? 'For batteries this is the awarded IDM market delta. Physical battery movement is shown separately in Charged / Executed Discharge.'
          : 'This contributes to dispatched_mwh KPI and to the IDM share of revenue/cost settlement.')
        break
      case 'idm_revenue':
        lines.push(`Formula: sum of hourly IDM ${isConsumer ? 'cost' : 'revenue'} values = ${tti(roundTotals.revenue_IDM)} ZAR.`)
        lines.push('This is the intraday settlement component of the round revenue/cost KPI.')
        break
      case 'battery_soc_start':
        lines.push(`Displayed value: first shown hourly SoC start = ${tt(roundTotals.battSocStart, 0)}%.`)
        lines.push('This is not a sum. It is the round entry state of charge and serves as battery-state context, not a KPI input.')
        break
      case 'battery_soc_end':
        lines.push(`Displayed value: last shown hourly SoC end = ${tt(roundTotals.battSocEnd, 0)}%.`)
        lines.push('This is not a sum. It is the round exit state of charge and serves as battery-state context, not a KPI input.')
        break
      case 'battery_charged':
        lines.push(`Formula: sum of hourly battery charge volumes = ${tt(roundTotals.totalChargedMwh)} MWh.`)
        lines.push('This contributes to battery activity interpretation; the associated monetary effect flows into battery charge cost and then into profit/net result.')
        break
      case 'battery_discharged':
        lines.push(`Formula: sum of hourly physical battery discharge values = ${tt(roundTotals.totalDischargedMwh)} MWh.`)
        lines.push('This is the physical battery output. It is intentionally separated from awarded DA/ID market volume when the market commitment exceeds executable battery energy.')
        break
      case 'battery_charge_cost':
        lines.push(`Formula: sum of hourly battery charge costs = ${tti(roundTotals.totalChargeCostZar)} ZAR.`)
        lines.push('This feeds the battery_charge_cost_zar KPI and is subtracted in the round profit / net-result formula.')
        break
      case 'imbalance':
        lines.push(`Formula: sum of hourly imbalance values = ${tt(roundTotals.totalImbalance)} MWh.`)
        lines.push('This feeds the imbalance_mwh KPI directly.')
        break
      case 'imbalance_cost':
        lines.push(`Formula: sum of hourly imbalance costs = ${tti(roundTotals.totalBalancingCost)} ZAR.`)
        lines.push('This feeds the imbalance_cost_zar KPI and is subtracted in the round profit / net-result formula.')
        break
      case 'balancing_price':
        lines.push(`Formula: arithmetic average of non-zero hourly balancing prices = ${tti(roundTotals.avgBalancingPrice)} ZAR/MWh.`)
        lines.push('This is explanatory only. KPI imbalance cost is based on hour-by-hour settlement, not this average.')
        break
      case 'net_mwh':
        lines.push(`Formula: sum of hourly net MWh values = ${tt(roundTotals.totalNetMwh)} MWh.`)
        lines.push('This is a device-level explanatory aggregate. It is related to dispatch and balancing outcomes, but the main KPI uses the canonical backend dispatched_mwh / actual_mwh / imbalance fields rather than this frontend-only summary row.')
        break
      case 'net_revenue':
        lines.push(`Formula: sum of hourly net revenue values = ${tti(roundTotals.totalNetRevenue)} ZAR.`)
        lines.push('This is a device-level explanatory aggregate. It is not identical to round profit because variable cost, fixed cost, redispatch cost (ATC), and congestion revenue are handled separately at KPI level.')
        break
      case 'network_shortfall_cost':
        lines.push(`Formula: sum of hourly network shortfall costs = ${tti(roundTotals.totalNetworkShortfallCostZar)} ZAR.`)
        lines.push('This contributes to Redispatch Cost (ATC) in the round KPI view.')
        break
      case 'variable_cost':
        lines.push(`Formula: sum of hourly variable costs = ${tti(hourlyVariableCostTotal)} ZAR.`)
        lines.push('This contributes to the variable_cost_zar KPI and is subtracted in producer profit.')
        break
      case 'fixed_cost':
        lines.push(`Formula: sum of hourly fixed costs = ${tti(hourlyFixedCostTotal)} ZAR.`)
        lines.push('This contributes to the fixed_cost_zar KPI and is subtracted in producer profit.')
        break
      case 'avg_cost_rate': {
        const totalDispatchMwh = hourlyData.reduce((sum, h) => sum + Math.max(0, Number(h.totalDispatched_DAM || 0) + Number(h.totalDispatched_IDM || 0)), 0)
        lines.push(`Formula: hourly variable cost total / total dispatched MWh = ${tti(hourlyVariableCostTotal)} / ${tt(totalDispatchMwh)} = ${totalDispatchMwh > 0 ? tt(hourlyVariableCostTotal / totalDispatchMwh) : '—'} ZAR/MWh.`)
        lines.push('This is explanatory only. KPI variable cost uses monetary sums, not the displayed average rate.')
        break
      }
      case 'co2':
        lines.push(`Formula: sum of hourly CO2 values = ${tt(roundTotals.totalCO2)} kg.`)
        lines.push('This feeds the co2_emissions_kg KPI directly.')
        break
      default:
        lines.push('No aggregate explanation defined.')
    }

    return lines.join('\n')
  }
  // ────────────────────────────────────────────────────────────────────────────

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
          {deviceHeadline}
        </Typography>
        {isBatteryDevice && (
          <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', minWidth: 90 }}>SoC this round:</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 160 }}>
                <Typography variant="caption" sx={{ minWidth: 36, textAlign: 'right' }}>{roundTotals.battSocStart.toFixed(0)}%</Typography>
                <Box sx={{ flex: 1, minWidth: 80, height: 10, bgcolor: 'grey.300', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
                  <Box sx={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${Math.min(100, roundTotals.battSocStart)}%`,
                    bgcolor: roundTotals.battSocStart > 40 ? 'success.main' : roundTotals.battSocStart > 20 ? 'warning.main' : 'error.main',
                    transition: 'width 0.3s'
                  }} />
                </Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>→</Typography>
                <Box sx={{ flex: 1, minWidth: 80, height: 10, bgcolor: 'grey.300', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
                  <Box sx={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${Math.min(100, roundTotals.battSocEnd)}%`,
                    bgcolor: roundTotals.battSocEnd > 40 ? 'success.main' : roundTotals.battSocEnd > 20 ? 'warning.main' : 'error.main',
                    transition: 'width 0.3s'
                  }} />
                </Box>
                <Typography variant="caption" sx={{ minWidth: 36 }}>{roundTotals.battSocEnd.toFixed(0)}%</Typography>
              </Box>
              {roundTotals.totalChargedMwh > 0 && (
                <Typography variant="caption" sx={{ color: 'primary.main' }}>
                  ↑ {formatNumber(roundTotals.totalChargedMwh, 1)} MWh charged
                </Typography>
              )}
              {roundTotals.totalMarketAwardedMwh > 0 && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Awarded: {formatNumber(roundTotals.totalMarketAwardedMwh, 1)} MWh
                </Typography>
              )}
              {roundTotals.totalDischargedMwh > 0 && (
                <Typography variant="caption" sx={{ color: 'success.dark' }}>
                  ↓ {formatNumber(roundTotals.totalDischargedMwh, 1)} MWh executed discharge
                </Typography>
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Submitted market positions appear in the DAM/IDM Offered rows. Awarded market volume appears in the DAM/IDM Awarded rows. Physical battery movement appears only in Charged, Executed Discharge, and SoC.
            </Typography>
          </Box>
        )}
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
        {showDamBaselineNotice && (
          <Alert severity="info" variant="outlined" sx={{ mt: 1.5 }}>
            <Typography variant="body2">
              No new intraday trade cleared in this round. The day-ahead rows below show the carried-over Round 1 baseline for context. Current-round IDM offered volume, awarded volume, and SMP stay at 0.
            </Typography>
          </Alert>
        )}
        {isBatteryDevice && batteryAwardPhysicalGapMwh > 0.05 && (
          <Alert severity="warning" variant="outlined" sx={{ mt: 1.5 }}>
            <Typography variant="body2">
              Awarded market volume exceeds executable battery discharge by {formatNumber(batteryAwardPhysicalGapMwh, 1)} MWh in this round. The DAM/IDM Awarded rows show market commitments; the Battery Storage rows show the physical battery flow constrained by SoC and efficiency.
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
              <TableCell><RowLabel title={getRowTooltip('base_capacity')}>{isConsumer ? 'Base Demand (MW)' : 'Base Capacity (MW)'}</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right">
                  <HourTip title={getHourTooltip('base_capacity', h)}>{h.hasBaseCapacityValue ? formatNumber(h.baseCapacity, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50', fontStyle: 'italic', color: 'text.secondary' }}>
                <TotalTip title={getTotalTooltip('base_capacity')}>-</TotalTip>
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell><RowLabel title={getRowTooltip('effective_capacity')}>{isConsumer ? 'Effective Demand (MW)' : 'Effective Capacity (MW)'}</RowLabel></TableCell>
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
                  <HourTip title={getHourTooltip('effective_capacity', h)}>{h.hasEffectiveCapacityValue ? formatNumber(h.effectiveCapacity, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('effective_capacity')}>-</TotalTip>
              </TableCell>
            </TableRow>

            {/* DAM Section */}
            <TableRow sx={{ bgcolor: 'primary.50' }}>
              <TableCell colSpan={hourlyData.length + 2} sx={{ fontWeight: 'bold' }}>
                {isIdmRound ? 'Day-Ahead Baseline (from Round 1)' : 'Day-Ahead Market (DAM)'}
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell><RowLabel title={getRowTooltip('dam_offered')}>{isBatteryDevice ? 'DA Submitted (MWh)' : (isConsumer ? 'Demanded (MWh)' : 'Offered (MWh)')}</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right" sx={getOverbidStyle(h)}>
                  <HourTip title={getHourTooltip('dam_offered', h)}>{h.totalOffered_DAM > 0 ? formatNumber(h.totalOffered_DAM, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('dam_offered')}>{formatNumber(roundTotals.totalOffered_DAM, 1)}</TotalTip>
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>
                <RowLabel title={getRowTooltip('dam_lot_a')}>Base {roundTotals.hasLotA_DAM ? `(${formatInteger(roundTotals.avgLotA_DAM)} ZAR/MWh)` : ''}</RowLabel>
              </TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ bgcolor: getLotBgColor(h.lotA_DAM, h), fontWeight: 'medium' }}
                >
                  <HourTip title={getHourTooltip('dam_lot_a', h)}>{h.lotA_DAM.mw_offered > 0 ? formatNumber(h.lotA_DAM.mw_offered, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('dam_lot_a')}>{roundTotals.totalLotAOffered_DAM > 0 ? formatNumber(roundTotals.totalLotAOffered_DAM, 1) : '-'}</TotalTip>
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>
                <RowLabel title={getRowTooltip('dam_lot_b')}>Mid {roundTotals.hasLotB_DAM ? `(${formatInteger(roundTotals.avgLotB_DAM)} ZAR/MWh)` : ''}</RowLabel>
              </TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ bgcolor: getLotBgColor(h.lotB_DAM, h), fontWeight: 'medium' }}
                >
                  <HourTip title={getHourTooltip('dam_lot_b', h)}>{h.lotB_DAM.mw_offered > 0 ? formatNumber(h.lotB_DAM.mw_offered, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('dam_lot_b')}>{roundTotals.totalLotBOffered_DAM > 0 ? formatNumber(roundTotals.totalLotBOffered_DAM, 1) : '-'}</TotalTip>
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>
                <RowLabel title={getRowTooltip('dam_lot_c')}>Peak {roundTotals.hasLotC_DAM ? `(${formatInteger(roundTotals.avgLotC_DAM)} ZAR/MWh)` : ''}</RowLabel>
              </TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ bgcolor: getLotBgColor(h.lotC_DAM, h), fontWeight: 'medium' }}
                >
                  <HourTip title={getHourTooltip('dam_lot_c', h)}>{h.lotC_DAM.mw_offered > 0 ? formatNumber(h.lotC_DAM.mw_offered, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('dam_lot_c')}>{roundTotals.totalLotCOffered_DAM > 0 ? formatNumber(roundTotals.totalLotCOffered_DAM, 1) : '-'}</TotalTip>
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell><RowLabel title={getRowTooltip('dam_price')}>{isIdmRound ? 'DA Price (ZAR/MWh)' : 'SMP (ZAR/MWh)'}</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right">
                  <HourTip title={getHourTooltip('dam_price', h)}>{h.damPrice > 0 ? formatNumber(h.damPrice, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('dam_price')}>{roundTotals.avgDamPrice > 0 ? `Avg ${formatNumber(roundTotals.avgDamPrice, 1)}` : '-'}</TotalTip>
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell><RowLabel title={getRowTooltip('dam_dispatched')}>{isBatteryDevice ? 'DA Awarded (MWh)' : (isConsumer ? 'Consumed (MWh)' : 'Dispatched (MWh)')}</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right" sx={getOverbidStyle(h)}>
                  <HourTip title={getHourTooltip('dam_dispatched', h)}>{h.totalDispatched_DAM > 0 ? formatNumber(h.totalDispatched_DAM, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('dam_dispatched')}>{formatNumber(roundTotals.totalDispatched_DAM, 1)}</TotalTip>
              </TableCell>
            </TableRow>
            {!isConsumer && deviceIds.length === 1 && roundTotals.totalGridCurtailed > 0.001 && (
              <TableRow hover>
                <TableCell sx={{ color: 'warning.dark', fontStyle: 'italic' }}><RowLabel title={getRowTooltip('grid_curtailed')}>Grid Curtailed (MWh)</RowLabel></TableCell>
                {hourlyData.map((h) => (
                  <TableCell
                    key={h.hourKey}
                    align="right"
                    sx={{
                      color: (h.gridCurtailedMw || 0) > 0.001 ? 'warning.dark' : 'inherit',
                      fontStyle: 'italic'
                    }}
                  >
                    <HourTip title={getHourTooltip('grid_curtailed', h)}>{(h.gridCurtailedMw || 0) > 0.001 ? formatNumber(h.gridCurtailedMw, 1) : '-'}</HourTip>
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50', color: 'warning.dark' }}>
                  <TotalTip title={getTotalTooltip('grid_curtailed')}>{formatNumber(roundTotals.totalGridCurtailed, 1)}</TotalTip>
                </TableCell>
              </TableRow>
            )}
            <TableRow hover>
              <TableCell><RowLabel title={getRowTooltip('dam_revenue')}>{isConsumer ? 'Cost (ZAR)' : 'Revenue (ZAR)'}</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right">
                  <HourTip title={getHourTooltip('dam_revenue', h)}>{displayMoney(h.revenue_DAM) !== 0 ? formatInteger(displayMoney(h.revenue_DAM)) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('dam_revenue')}>{formatInteger(roundTotals.revenue_DAM)}</TotalTip>
              </TableCell>
            </TableRow>
            
            {/* Overbid Row */}
            <TableRow hover>
              <TableCell><RowLabel title={getRowTooltip('overbid')}>{isConsumer ? 'Over-demand (MW)' : 'Overbid (MW)'}</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ 
                    color: (h.overbidMw || 0) > 0 ? 'error.main' : 'inherit',
                    fontWeight: (h.overbidMw || 0) > 0 ? 'bold' : 'normal'
                  }}
                >
                  <HourTip title={getHourTooltip('overbid', h)}>{(h.overbidMw || 0) > 0 ? formatNumber(h.overbidMw, 1) : '-'}</HourTip>
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
                <TotalTip title={getTotalTooltip('overbid')}>{roundTotals.totalOverbid > 0 ? formatNumber(roundTotals.totalOverbid, 1) : '-'}</TotalTip>
              </TableCell>
            </TableRow>

            {/* IDM Section - show whenever current-round intraday price or any IDM settlement data exists */}
            {showIdmSection && (
              <>
                <TableRow sx={{ bgcolor: 'info.50' }}>
                  <TableCell colSpan={hourlyData.length + 2} sx={{ fontWeight: 'bold' }}>
                    Intraday Market (IDM)
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('idm_offered')}>{isBatteryDevice ? 'ID Submitted (MWh)' : (isConsumer ? 'Demanded (MWh)' : 'Offered (MWh)')}</RowLabel></TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right" sx={getOverbidStyle(h)}>
                      <HourTip title={getHourTooltip('idm_offered', h)}>{h.totalOffered_IDM !== 0 ? formatNumber(h.totalOffered_IDM, 1) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('idm_offered')}>{roundTotals.totalOffered_IDM !== 0 ? formatNumber(roundTotals.totalOffered_IDM, 1) : '-'}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>
                    <RowLabel title={getRowTooltip('idm_lot_a')}>Base {roundTotals.hasLotA_IDM ? `(${formatInteger(roundTotals.avgLotA_IDM)} ZAR/MWh)` : ''}</RowLabel>
                  </TableCell>
                  {hourlyData.map((h) => (
                    <TableCell 
                      key={h.hourKey} 
                      align="right"
                      sx={{ bgcolor: getLotBgColor(h.lotA_IDM, h), fontWeight: 'medium' }}
                    >
                      <HourTip title={getHourTooltip('idm_lot_a', h)}>{getSignedOffered(h.lotA_IDM) !== 0 ? formatNumber(getSignedOffered(h.lotA_IDM), 1) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('idm_lot_a')}>{roundTotals.totalLotAOffered_IDM !== 0 ? formatNumber(roundTotals.totalLotAOffered_IDM, 1) : '-'}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>
                    <RowLabel title={getRowTooltip('idm_lot_b')}>Mid {roundTotals.hasLotB_IDM ? `(${formatInteger(roundTotals.avgLotB_IDM)} ZAR/MWh)` : ''}</RowLabel>
                  </TableCell>
                  {hourlyData.map((h) => (
                    <TableCell 
                      key={h.hourKey} 
                      align="right"
                      sx={{ bgcolor: getLotBgColor(h.lotB_IDM, h), fontWeight: 'medium' }}
                    >
                      <HourTip title={getHourTooltip('idm_lot_b', h)}>{getSignedOffered(h.lotB_IDM) !== 0 ? formatNumber(getSignedOffered(h.lotB_IDM), 1) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('idm_lot_b')}>{roundTotals.totalLotBOffered_IDM !== 0 ? formatNumber(roundTotals.totalLotBOffered_IDM, 1) : '-'}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell>
                    <RowLabel title={getRowTooltip('idm_lot_c')}>Peak {roundTotals.hasLotC_IDM ? `(${formatInteger(roundTotals.avgLotC_IDM)} ZAR/MWh)` : ''}</RowLabel>
                  </TableCell>
                  {hourlyData.map((h) => (
                    <TableCell 
                      key={h.hourKey} 
                      align="right"
                      sx={{ bgcolor: getLotBgColor(h.lotC_IDM, h), fontWeight: 'medium' }}
                    >
                      <HourTip title={getHourTooltip('idm_lot_c', h)}>{getSignedOffered(h.lotC_IDM) !== 0 ? formatNumber(getSignedOffered(h.lotC_IDM), 1) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('idm_lot_c')}>{roundTotals.totalLotCOffered_IDM !== 0 ? formatNumber(roundTotals.totalLotCOffered_IDM, 1) : '-'}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('id_price')}>Current Price / SMP (ZAR/MWh)</RowLabel></TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right">
                      <HourTip title={getHourTooltip('id_price', h)}>{h.idp > 0 ? formatNumber(h.idp, 1) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('id_price')}>{roundTotals.avgIdPrice > 0 ? `Avg ${formatNumber(roundTotals.avgIdPrice, 1)}` : '-'}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('idm_dispatched')}>{isBatteryDevice ? 'ID Awarded (MWh)' : (isConsumer ? 'Consumed (MWh)' : 'Dispatched (MWh)')}</RowLabel></TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right" sx={getOverbidStyle(h)}>
                      <HourTip title={getHourTooltip('idm_dispatched', h)}>{h.totalDispatched_IDM > 0 ? formatNumber(h.totalDispatched_IDM, 1) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('idm_dispatched')}>{formatNumber(roundTotals.totalDispatched_IDM, 1)}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('idm_revenue')}>{isConsumer ? 'Cost (ZAR)' : 'Revenue (ZAR)'}</RowLabel></TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right">
                      <HourTip title={getHourTooltip('idm_revenue', h)}>{displayMoney(h.revenue_IDM) !== 0 ? formatInteger(displayMoney(h.revenue_IDM)) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('idm_revenue')}>{formatInteger(roundTotals.revenue_IDM)}</TotalTip>
                  </TableCell>
                </TableRow>
              </>
            )}

            {/* Battery SoC Section - only for battery devices */}
            {isBatteryDevice && (
              <>
                <TableRow sx={{ bgcolor: 'success.50' }}>
                  <TableCell colSpan={hourlyData.length + 2} sx={{ fontWeight: 'bold', color: 'success.dark' }}>
                    Battery Storage
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('battery_soc_start')}>SoC Start (%)</RowLabel></TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right">
                      <HourTip title={getHourTooltip('battery_soc_start', h)}><Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25 }}>
                        <Typography variant="caption">{h.socStartPct != null ? `${h.socStartPct.toFixed(0)}%` : '-'}</Typography>
                        {h.socStartPct != null && (
                          <Box sx={{ width: 48, height: 6, bgcolor: 'grey.300', borderRadius: 0.5, overflow: 'hidden' }}>
                            <Box sx={{
                              height: '100%',
                              width: `${Math.min(100, h.socStartPct)}%`,
                              bgcolor: h.socStartPct > 40 ? 'success.main' : h.socStartPct > 20 ? 'warning.main' : 'error.main'
                            }} />
                          </Box>
                        )}
                      </Box></HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('battery_soc_start')}>{`${roundTotals.battSocStart.toFixed(0)}%`}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('battery_soc_end')}>SoC End (%)</RowLabel></TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right">
                      <HourTip title={getHourTooltip('battery_soc_end', h)}><Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25 }}>
                        <Typography variant="caption">{`${h.socEndPct.toFixed(0)}%`}</Typography>
                        {(
                          <Box sx={{ width: 48, height: 6, bgcolor: 'grey.300', borderRadius: 0.5, overflow: 'hidden' }}>
                            <Box sx={{
                              height: '100%',
                              width: `${Math.min(100, h.socEndPct)}%`,
                              bgcolor: h.socEndPct > 40 ? 'success.main' : h.socEndPct > 20 ? 'warning.main' : 'error.main'
                            }} />
                          </Box>
                        )}
                      </Box></HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('battery_soc_end')}>{`${roundTotals.battSocEnd.toFixed(0)}%`}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('battery_charged')}>Charged (MWh)</RowLabel></TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right" sx={{ color: h.chargedMwh > 0 ? 'primary.main' : 'inherit' }}>
                      <HourTip title={getHourTooltip('battery_charged', h)}>{h.chargedMwh > 0 ? formatNumber(h.chargedMwh, 1) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50', color: roundTotals.totalChargedMwh > 0 ? 'primary.main' : 'inherit' }}>
                    <TotalTip title={getTotalTooltip('battery_charged')}>{roundTotals.totalChargedMwh > 0 ? formatNumber(roundTotals.totalChargedMwh, 1) : '-'}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('battery_discharged')}>Executed Discharge (MWh)</RowLabel></TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right" sx={{ color: h.dischargedMwh > 0 ? 'success.dark' : 'inherit' }}>
                      <HourTip title={getHourTooltip('battery_discharged', h)}>{h.dischargedMwh > 0 ? formatNumber(h.dischargedMwh, 1) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50', color: roundTotals.totalDischargedMwh > 0 ? 'success.dark' : 'inherit' }}>
                    <TotalTip title={getTotalTooltip('battery_discharged')}>{roundTotals.totalDischargedMwh > 0 ? formatNumber(roundTotals.totalDischargedMwh, 1) : '-'}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('battery_charge_cost')}>Charge Cost (ZAR)</RowLabel></TableCell>
                  {hourlyData.map((h) => (
                    <TableCell key={h.hourKey} align="right" sx={{ color: h.chargeCostZar > 0 ? 'error.main' : 'inherit' }}>
                      <HourTip title={getHourTooltip('battery_charge_cost', h)}>{h.chargeCostZar > 0 ? `-${formatInteger(h.chargeCostZar)}` : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50', color: roundTotals.totalChargeCostZar > 0 ? 'error.main' : 'inherit' }}>
                    <TotalTip title={getTotalTooltip('battery_charge_cost')}>{roundTotals.totalChargeCostZar > 0 ? `-${formatInteger(roundTotals.totalChargeCostZar)}` : '-'}</TotalTip>
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
              <TableCell><RowLabel title={getRowTooltip('imbalance')}>Imbalance (MWh)</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ color: h.imbalanceMwh !== 0 ? 'error.main' : 'inherit' }}
                >
                  <HourTip title={getHourTooltip('imbalance', h)}>{h.imbalanceMwh !== 0 ? formatNumber(h.imbalanceMwh, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('imbalance')}>{roundTotals.totalImbalance !== 0 ? formatNumber(roundTotals.totalImbalance, 1) : '-'}</TotalTip>
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell><RowLabel title={getRowTooltip('imbalance_cost')}>Imbalance Cost (ZAR)</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell 
                  key={h.hourKey} 
                  align="right"
                  sx={{ color: h.imbalanceCostDisplay !== 0 ? 'error.main' : 'inherit' }}
                >
                  <HourTip title={getHourTooltip('imbalance_cost', h)}>{h.imbalanceCostDisplay !== 0 ? formatInteger(h.imbalanceCostDisplay) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50', color: roundTotals.totalBalancingCost !== 0 ? 'error.main' : 'inherit' }}>
                <TotalTip title={getTotalTooltip('imbalance_cost')}>{roundTotals.totalBalancingCost !== 0 ? formatInteger(roundTotals.totalBalancingCost) : '-'}</TotalTip>
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell><RowLabel title={getRowTooltip('balancing_price')}>Price (ZAR/MWh)</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right">
                  <HourTip title={getHourTooltip('balancing_price', h)}>{h.balancingPrice !== 0 ? formatInteger(h.balancingPrice) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('balancing_price')}>{roundTotals.avgBalancingPrice !== 0 ? `Avg ${formatInteger(roundTotals.avgBalancingPrice)}` : '-'}</TotalTip>
              </TableCell>
            </TableRow>

            {/* Totals Section */}
            <TableRow sx={{ bgcolor: 'grey.200' }}>
              <TableCell colSpan={hourlyData.length + 2} sx={{ fontWeight: 'bold' }}>
                Totals
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell sx={{ fontWeight: 'bold' }}><RowLabel title={getRowTooltip('net_mwh')}>Net MWh</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right" sx={{ fontWeight: 'bold' }}>
                  <HourTip title={getHourTooltip('net_mwh', h)}>{h.netMwh !== 0 ? formatNumber(h.netMwh, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('net_mwh')}>{formatNumber(roundTotals.totalNetMwh, 1)}</TotalTip>
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell sx={{ fontWeight: 'bold' }}><RowLabel title={getRowTooltip('net_revenue')}>{isConsumer ? 'Net Cost (ZAR)' : 'Net Revenue (ZAR)'}</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right" sx={{ fontWeight: 'bold' }}>
                  <HourTip title={getHourTooltip('net_revenue', h)}>{displayMoney(h.netRevenue) !== 0 ? formatInteger(displayMoney(h.netRevenue)) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('net_revenue')}>{formatInteger(roundTotals.totalNetRevenue)}</TotalTip>
              </TableCell>
            </TableRow>
            {isConsumer && roundTotals.totalNetworkShortfallCostZar > 0.5 && (
              <TableRow hover>
                <TableCell sx={{ color: 'error.main' }}><RowLabel title={getRowTooltip('network_shortfall_cost')}>Redispatch Cost (ATC) (ZAR)</RowLabel></TableCell>
                {hourlyData.map((h) => (
                  <TableCell key={h.hourKey} align="right" sx={{ color: h.networkShortfallCostZar > 0 ? 'error.main' : 'text.secondary' }}>
                    <HourTip title={getHourTooltip('network_shortfall_cost', h)}>{h.networkShortfallCostZar > 0 ? formatInteger(h.networkShortfallCostZar) : '-'}</HourTip>
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50', color: 'error.main' }}>
                  <TotalTip title={getTotalTooltip('network_shortfall_cost')}>{formatInteger(roundTotals.totalNetworkShortfallCostZar)}</TotalTip>
                </TableCell>
              </TableRow>
            )}
            {!isConsumer && (
              <>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('variable_cost')}>Variable Cost (ZAR)</RowLabel></TableCell>
                  {hourlyData.map((h, idx) => (
                    <TableCell key={h.hourKey} align="right">
                      <HourTip title={getHourTooltip('variable_cost', h, { hourIndex: idx })}>{hourlyVariableCosts[idx] > 0 ? formatInteger(hourlyVariableCosts[idx]) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('variable_cost')}>{hourlyVariableCostTotal !== 0 ? formatInteger(hourlyVariableCostTotal) : '-'}</TotalTip>
                  </TableCell>
                </TableRow>
                <TableRow hover>
                  <TableCell><RowLabel title={getRowTooltip('fixed_cost')}>Fixed Cost (ZAR)</RowLabel></TableCell>
                  {hourlyData.map((h, idx) => (
                    <TableCell key={h.hourKey} align="right">
                      <HourTip title={getHourTooltip('fixed_cost', h, { hourIndex: idx })}>{hourlyFixedCosts[idx] > 0 ? formatInteger(hourlyFixedCosts[idx]) : '-'}</HourTip>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                    <TotalTip title={getTotalTooltip('fixed_cost')}>{hourlyFixedCostTotal !== 0 ? formatInteger(hourlyFixedCostTotal) : '-'}</TotalTip>
                  </TableCell>
                </TableRow>
                {hourlyData.some((h) => Number.isFinite(h.variableCostRateEffective)) && (
                  <TableRow hover>
                    <TableCell sx={{ color: 'text.secondary', fontStyle: 'italic' }}><RowLabel title={getRowTooltip('avg_cost_rate')}>Avg Cost Rate (ZAR/MWh)</RowLabel></TableCell>
                    {hourlyData.map((h) => (
                      <TableCell key={h.hourKey} align="right" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                        <HourTip title={getHourTooltip('avg_cost_rate', h)}>{Number.isFinite(h.variableCostRateEffective) && h.variableCostRateEffective > 0
                          ? formatNumber(h.variableCostRateEffective, 1)
                          : '-'}</HourTip>
                      </TableCell>
                    ))}
                    <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50', color: 'text.secondary', fontStyle: 'italic' }}>
                      <TotalTip title={getTotalTooltip('avg_cost_rate')}>{(() => {
                        const totalDispatchMwh = hourlyData.reduce(
                          (sum, h) => sum + Math.max(0, Number(h.totalDispatched_DAM || 0) + Number(h.totalDispatched_IDM || 0)),
                          0,
                        )
                        return totalDispatchMwh > 0
                          ? formatNumber(hourlyVariableCostTotal / totalDispatchMwh, 1)
                          : '-'
                      })()}</TotalTip>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
            <TableRow hover>
              <TableCell><RowLabel title={getRowTooltip('co2')}>{isConsumer ? 'CO2 Caused (kg)' : 'CO2 Emissions (kg)'}</RowLabel></TableCell>
              {hourlyData.map((h) => (
                <TableCell key={h.hourKey} align="right">
                  <HourTip title={getHourTooltip('co2', h)}>{h.co2Kg > 0 ? formatNumber(h.co2Kg, 1) : '-'}</HourTip>
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>
                <TotalTip title={getTotalTooltip('co2')}>{formatNumber(roundTotals.totalCO2, 1)}</TotalTip>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
