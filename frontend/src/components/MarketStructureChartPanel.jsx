import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import {
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import api from '../services/api'

/** Compute hour-of-day label from global hour index and start_time string ("HH:MM"). */
function computeHourOfDay(globalHour, startTime) {
  const startHour = parseInt((startTime || '00:00').split(':')[0], 10) || 0
  return (startHour + globalHour) % 24
}

function buildDashGradient(dasharray, color) {
  const segments = String(dasharray || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)

  if (segments.length === 0) {
    return 'none'
  }

  const stops = []
  let offset = 0
  for (let index = 0; index < segments.length; index += 2) {
    const dash = segments[index]
    const gap = segments[index + 1] ?? segments[1] ?? dash
    stops.push(`${color} ${offset}px ${offset + dash}px`)
    offset += dash
    stops.push(`transparent ${offset}px ${offset + gap}px`)
    offset += gap
  }

  return `repeating-linear-gradient(to right, ${stops.join(', ')})`
}

function buildLineSwatchSx(color, dasharray) {
  return {
    width: 28,
    minWidth: 28,
    height: 4,
    borderRadius: 999,
    backgroundColor: dasharray ? 'transparent' : color,
    backgroundImage: dasharray ? buildDashGradient(dasharray, color) : 'none',
  }
}

function formatWholeNumber(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function formatRoundedMwh(value) {
  return `${formatWholeNumber(Math.abs(Number(value || 0)))} MWh`
}

function buildIdmGuidance(deltaSupplyRaw, deltaDemandRaw) {
  const deltaSupply = Number(deltaSupplyRaw || 0)
  const deltaDemand = Number(deltaDemandRaw || 0)

  if (deltaDemand > 0.5 && deltaSupply <= 0.5) {
    return {
      title: 'IDM instruction',
      summary: `Power demand up ~${formatRoundedMwh(deltaDemand)}.`,
      action: 'Forecast: increase above the DAM baseline.',
    }
  }
  if (deltaSupply > 0.5 && deltaDemand <= 0.5) {
    return {
      title: 'IDM instruction',
      summary: `Power demand down ~${formatRoundedMwh(deltaSupply)}.`,
      action: 'Forecast: reduce below the DAM baseline.',
    }
  }
  if (deltaSupply > 0.5 && deltaDemand > 0.5) {
    return {
      title: 'IDM instruction',
      summary: `Demand +${formatRoundedMwh(deltaDemand)}. Supply +${formatRoundedMwh(deltaSupply)}.`,
      action: 'Forecast: increase to add supply; reduce to create demand.',
    }
  }
  return {
    title: 'IDM instruction',
    summary: 'No IDM shift in this round.',
    action: '',
  }
}

function buildInterzonalLinkKey(link) {
  return `${link.fromZone}-${link.toZone}`
}

export default function MarketStructureChartPanel({
  sessionId,
  roundNum,
  roundSpan = 6,
  startTime = '00:00',
  overlayRounds = null,
  historicalMode = false,
  forcePhase = null,
}) {
  const theme = useTheme()
  const chipSupplyColor = theme.palette.success.main
  const chipDemandColor = theme.palette.error.main
  const chipPriceColor = theme.palette.info.main
  const svgRef = useRef(null)
  const [localHour, setLocalHour] = useState(0)
  const [chartEntries, setChartEntries] = useState([])
  const [selectedZoneIds, setSelectedZoneIds] = useState([])
  const [selectedInterzonalLinkKey, setSelectedInterzonalLinkKey] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const overlayMode = Array.isArray(overlayRounds) && overlayRounds.length > 0
  const activeRounds = useMemo(() => {
    if (overlayMode) {
      return overlayRounds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    }
    const normalizedRound = Number(roundNum)
    return Number.isFinite(normalizedRound) && normalizedRound > 0 ? [normalizedRound] : []
  }, [overlayMode, overlayRounds, roundNum])
  const activeRoundsKey = activeRounds.join(',')
  const chartData = chartEntries[0]?.data || null
  const idmForecastChange = chartData?.idm_forecast_change && chartData.idm_forecast_change.active
    ? chartData.idm_forecast_change
    : null
  const selectedHourIdmForecastChange = idmForecastChange?.selected_hour || null
  // In a two-phase round the DAM snapshot is fetched alongside the IDM one so both
  // merit-order curves can be overlaid (DAM as dashed reference, IDM as the active curves).
  const hasDamCompanion = !overlayMode
    && chartData?.market_phase === 'idm'
    && chartData?.dam_companion?.market_phase === 'dam'
  const currentIdmGuidance = useMemo(() => buildIdmGuidance(
    idmForecastChange?.round_totals?.delta_supply_mwh,
    idmForecastChange?.round_totals?.delta_demand_mwh,
  ), [idmForecastChange])
  const liveMarketStats = useMemo(() => {
    const supplySteps = Array.isArray(chartData?.supply) ? chartData.supply : []
    const demandSteps = Array.isArray(chartData?.demand) ? chartData.demand : []

    let totalSupply = 0
    let totalDemand = 0
    let bestSupplyPrice = null
    let bestDemandPrice = null

    supplySteps.forEach((step) => {
      const volume = Number(step?.volume || 0)
      const price = Number(step?.price)
      totalSupply += volume
      if (Number.isFinite(price)) {
        bestSupplyPrice = bestSupplyPrice == null ? price : Math.min(bestSupplyPrice, price)
      }
    })

    demandSteps.forEach((step) => {
      const volume = Number(step?.volume || 0)
      const price = Number(step?.price)
      totalDemand += volume
      if (Number.isFinite(price)) {
        bestDemandPrice = bestDemandPrice == null ? price : Math.max(bestDemandPrice, price)
      }
    })

    return {
      totalSupply,
      totalDemand,
      bestSupplyPrice,
      bestDemandPrice,
    }
  }, [chartData])
  const zonalCurves = useMemo(() => {
    const rawZones = Array.isArray(chartData?.zones)
      ? chartData.zones
      : Array.isArray(chartData?.zone_curves)
        ? chartData.zone_curves
        : []

    return rawZones
      .map((zone) => {
        const zoneId = Number(zone?.zone_id ?? zone?.zoneId ?? 0)
        const zonePrice = Number(zone?.zone_price ?? zone?.zone_price_zar_per_mwh)
        const localClearPrice = Number(zone?.local_clear_price ?? zone?.local_clear_price_zar_per_mwh)
        return {
          ...zone,
          zoneId,
          zonePrice: Number.isFinite(zonePrice) ? zonePrice : null,
          localClearPrice: Number.isFinite(localClearPrice) ? localClearPrice : null,
        }
      })
      .filter((zone) => zone.zoneId > 0)
  }, [chartData])
  const zonalZoneIds = useMemo(() => zonalCurves.map((zone) => zone.zoneId), [zonalCurves])
  const zonalZoneIdsKey = zonalZoneIds.join(',')
  const zonalStyleIndexByZoneId = useMemo(() => zonalZoneIds.reduce((acc, zoneId, index) => {
    acc[zoneId] = index
    return acc
  }, {}), [zonalZoneIdsKey])
  const zonalChartAvailable = !overlayMode && zonalZoneIds.length > 1
  const selectedZoneIdsKey = selectedZoneIds.join(',')
  const visibleZonalCurves = useMemo(() => {
    if (!zonalChartAvailable) return []
    return zonalCurves.filter((zone) => selectedZoneIds.includes(zone.zoneId))
  }, [selectedZoneIdsKey, zonalChartAvailable, zonalCurves])
  const interzonalLinks = useMemo(() => {
    const rawLinks = Array.isArray(chartData?.interzonal_links) ? chartData.interzonal_links : []

    return rawLinks
      .map((link) => {
        const fromZone = Number(link?.from_zone ?? link?.fromZone ?? 0)
        const toZone = Number(link?.to_zone ?? link?.toZone ?? 0)
        const flowMwh = Number(link?.flow_mwh ?? link?.flowMwh ?? 0)
        const flowReceivedMwh = Number(link?.flow_received_mwh ?? link?.flowReceivedMwh ?? flowMwh)
        const atcMwh = Number(link?.atc_mwh ?? link?.atcMwh ?? 0)
        const lossesMwh = Number(link?.losses_mwh ?? link?.lossesMwh ?? Math.max(flowMwh - flowReceivedMwh, 0))
        return {
          fromZone,
          toZone,
          flowMwh,
          flowReceivedMwh,
          atcMwh,
          lossesMwh,
          binding: Boolean(link?.binding),
          utilizationPct: atcMwh > 0 ? (Math.abs(flowMwh) / atcMwh) * 100 : 0,
        }
      })
      .filter((link) => link.fromZone > 0 && link.toZone > 0)
      .filter((link) => Math.abs(link.flowMwh) > 0.01 || link.binding)
  }, [chartData])
  const visibleInterzonalLinks = useMemo(() => {
    if (!zonalChartAvailable || selectedZoneIds.length === 0) {
      return interzonalLinks
    }
    return interzonalLinks.filter((link) => selectedZoneIds.includes(link.fromZone) && selectedZoneIds.includes(link.toZone))
  }, [interzonalLinks, selectedZoneIds, zonalChartAvailable])
  const visibleInterzonalLinksKey = useMemo(
    () => visibleInterzonalLinks.map((link) => buildInterzonalLinkKey(link)).join(','),
    [visibleInterzonalLinks]
  )
  const selectedInterzonalLink = useMemo(() => {
    if (!selectedInterzonalLinkKey) return null
    return visibleInterzonalLinks.find((link) => buildInterzonalLinkKey(link) === selectedInterzonalLinkKey) || null
  }, [selectedInterzonalLinkKey, visibleInterzonalLinks])
  const overlayLineStyles = useMemo(() => ([
    { dasharray: null, label: 'solid' },
    { dasharray: '10,4', label: 'long dash' },
    { dasharray: '4,4', label: 'dash' },
    { dasharray: '2,4', label: 'dot' },
    { dasharray: '12,4,2,4', label: 'dash-dot' },
    { dasharray: '14,5,3,5,3,5', label: 'dash-dot-dot' },
    { dasharray: '1,3', label: 'fine dot' },
    { dasharray: '16,5', label: 'extra long dash' },
  ]), [])

  // Reset to hour 0 when round changes
  useEffect(() => {
    setLocalHour(0)
    setChartEntries([])
  }, [activeRoundsKey, sessionId])

  useEffect(() => {
    if (overlayMode) {
      setSelectedZoneIds([])
      return
    }
    if (zonalZoneIds.length === 0) {
      setSelectedZoneIds([])
      return
    }
    setSelectedZoneIds((current) => {
      const retained = current.filter((zoneId) => zonalZoneIds.includes(zoneId))
      return retained.length > 0 ? retained : [...zonalZoneIds]
    })
  }, [overlayMode, zonalZoneIdsKey])

  useEffect(() => {
    if (overlayMode || visibleInterzonalLinks.length === 0) {
      setSelectedInterzonalLinkKey(null)
      return
    }
    setSelectedInterzonalLinkKey((current) => {
      if (!current) return null
      return visibleInterzonalLinks.some((link) => buildInterzonalLinkKey(link) === current) ? current : null
    })
  }, [overlayMode, visibleInterzonalLinksKey])

  const handleZoneToggle = (zoneId) => {
    setSelectedZoneIds((current) => {
      if (current.includes(zoneId)) {
        return current.length === 1 ? current : current.filter((value) => value !== zoneId)
      }
      return [...current, zoneId].sort((left, right) => left - right)
    })
  }

  const handleInterzonalLinkToggle = (linkKey) => {
    setSelectedInterzonalLinkKey((current) => (current === linkKey ? null : linkKey))
  }

  // Fetch market structure from backend
  useEffect(() => {
    if (!sessionId || activeRounds.length === 0) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all(
      activeRounds.map(async (currentRound) => {
        const globalHour = (Number(currentRound) - 1) * roundSpan + localHour
        const baseParams = historicalMode ? { historical: 1 } : undefined
        // When a single phase is forced (two separate DAM/IDM charts), request only that
        // phase and do not overlay a companion curve.
        const params = forcePhase ? { ...(baseParams || {}), market_phase: forcePhase } : baseParams
        const { data } = await api.get(`/api/player/market-structure/${sessionId}/${currentRound}/${globalHour}`, { params })
        // Two-phase rounds clear DAM and IDM under the SAME round_num. When the active
        // snapshot is the IDM phase, also fetch the DAM phase so BOTH merit-order curves
        // can be overlaid. If the round is not two-phase, the explicit market_phase=dam
        // request returns the IDM phase again and is ignored.
        if (!overlayMode && !forcePhase && data?.market_phase === 'idm') {
          try {
            const damParams = { ...(baseParams || {}), market_phase: 'dam' }
            const { data: damData } = await api.get(`/api/player/market-structure/${sessionId}/${currentRound}/${globalHour}`, { params: damParams })
            if (damData?.market_phase === 'dam') data.dam_companion = damData
          } catch { /* DAM companion is optional; ignore fetch errors */ }
        }
        return { roundNum: currentRound, data }
      })
    )
      .then((results) => {
        if (!cancelled) setChartEntries(results)
      })
      .catch(() => {
        if (!cancelled) setError('Marktstruktur konnte nicht geladen werden.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeRounds, historicalMode, localHour, overlayMode, roundSpan, sessionId, forcePhase])

  // D3 render
  useEffect(() => {
    if (!svgRef.current) return
    if (overlayMode && chartEntries.length === 0) return
    if (!overlayMode && !chartData) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const M = { top: 24, right: 24, bottom: 52, left: 72 }
    const VW = 860
    const VH = 420
    const W = VW - M.left - M.right
    const H = VH - M.top - M.bottom

    const g = svg
      .attr('viewBox', `0 0 ${VW} ${VH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')
      .style('display', 'block')
      .append('g')
      .attr('transform', `translate(${M.left},${M.top})`)

    const axisColor = theme.palette.text.secondary
    const gridColor = theme.palette.divider
    const supplyColor = theme.palette.success.main
    const demandColor = theme.palette.error.main
    const smpColor = theme.palette.info.main
    const flowColor = theme.palette.primary.main
    const selectedFlowColor = selectedInterzonalLink?.binding ? theme.palette.warning.main : flowColor

    // Cumulative volumes for step curves
    const cumulate = (arr) => {
      let acc = 0
      return arr.map(({ price, volume }) => ({ x0: acc, x1: (acc += volume), p: price }))
    }
    const toStepPath = (arr, x, y, H, extendToTop) => {
      const pts = []
      arr.forEach(({ x0, x1, p }) => {
        pts.push([x(x0), y(p)])
        pts.push([x(x1), y(p)])
      })
      if (pts.length > 0) {
        pts.push([pts[pts.length - 1][0], extendToTop ? 0 : H])
      }
      return pts
    }

    if (zonalChartAvailable) {
      const zoneSeries = visibleZonalCurves
        .map((zone) => {
          const supply = (Array.isArray(zone?.supply) ? zone.supply : [])
            .map((item) => ({
              price: Number(item?.price ?? 0),
              volume: Number(item?.volume ?? 0),
            }))
            .filter((item) => Number.isFinite(item.price) && Number.isFinite(item.volume) && item.volume > 0)
            .sort((left, right) => left.price - right.price)
          const demand = (Array.isArray(zone?.demand) ? zone.demand : [])
            .map((item) => ({
              price: Number(item?.price ?? 0),
              volume: Number(item?.volume ?? 0),
            }))
            .filter((item) => Number.isFinite(item.price) && Number.isFinite(item.volume) && item.volume > 0)
            .sort((left, right) => right.price - left.price)
          return {
            zoneId: zone.zoneId,
            supply,
            demand,
            zonePrice: zone.zonePrice,
            localClearPrice: zone.localClearPrice,
            clearedDemandVolumeMwh: Number(zone?.cleared_demand_volume_mwh ?? zone?.cleared_volume_mwh ?? 0),
            lineStyle: overlayLineStyles[(zonalStyleIndexByZoneId[zone.zoneId] ?? 0) % overlayLineStyles.length],
          }
        })
        .filter((zone) => zone.supply.length > 0 || zone.demand.length > 0)

      if (zoneSeries.length === 0) {
        return
      }

      const xMax = zoneSeries.reduce((maxValue, zone) => {
        const supplyVolume = d3.sum(zone.supply, (item) => item.volume) || 0
        const demandVolume = d3.sum(zone.demand, (item) => item.volume) || 0
        const clearedVolume = Number.isFinite(zone.clearedDemandVolumeMwh) ? zone.clearedDemandVolumeMwh : 0
        return Math.max(maxValue, supplyVolume, demandVolume, clearedVolume)
      }, 0) || 1000
      const allPrices = zoneSeries.flatMap((zone) => [
        ...zone.supply.map((item) => item.price),
        ...zone.demand.map((item) => item.price),
        ...(Number.isFinite(zone.zonePrice) ? [zone.zonePrice] : []),
        ...(Number.isFinite(zone.localClearPrice) ? [zone.localClearPrice] : []),
      ])
      const minP = allPrices.length ? d3.min(allPrices) : 0
      const maxP = allPrices.length ? d3.max(allPrices) : 1000
      const pad = Math.max((maxP - minP) * 0.12, maxP * 0.06, 10)
      const x = d3.scaleLinear().domain([0, xMax]).range([0, W]).clamp(true)
      const y = d3.scaleLinear().domain([minP - pad, maxP + pad]).nice().range([H, 0]).clamp(true)

      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(6).tickSize(-W).tickFormat(''))
        .call((gg) => gg.select('.domain').remove())
        .selectAll('line')
        .attr('stroke', gridColor)
        .attr('stroke-dasharray', '3,3')

      const xFmt = (value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`
      const xAxis = g.append('g')
        .attr('transform', `translate(0,${H})`)
        .call(d3.axisBottom(x).ticks(8).tickFormat(xFmt))
      const yAxis = g.append('g')
        .call(d3.axisLeft(y).ticks(6).tickFormat((value) => `${value.toFixed(0)}`))

      xAxis.selectAll('path,line').attr('stroke', gridColor)
      yAxis.selectAll('path,line').attr('stroke', gridColor)
      xAxis.selectAll('text').attr('fill', axisColor).attr('font-size', 11)
      yAxis.selectAll('text').attr('fill', axisColor).attr('font-size', 11)

      g.append('text')
        .attr('x', W / 2).attr('y', H + 42)
        .attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 12)
        .text('Capacity (MWh)')
      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -H / 2).attr('y', -56)
        .attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 12)
        .text('Price (ZAR/MWh)')

      zoneSeries.forEach((zone) => {
        const supplyPoints = toStepPath(cumulate(zone.supply), x, y, H, true)
        const demandPoints = toStepPath(cumulate(zone.demand), x, y, H, false)
        ;[
          { points: supplyPoints, color: supplyColor, baseWidth: 2.5 },
          { points: demandPoints, color: demandColor, baseWidth: 2.5 },
        ].forEach((series) => {
          g.append('path')
            .attr('d', d3.line()(series.points))
            .attr('fill', 'none')
            .attr('stroke', series.color)
            .attr('stroke-width', series.baseWidth)
            .attr('stroke-dasharray', zone.lineStyle.dasharray)
        })
      })

      if (chartData?.zonal_pricing_active) {
        zoneSeries.forEach((zone, index) => {
          if (!Number.isFinite(zone.zonePrice) || zone.zonePrice <= 0) return
          const yPos = y(zone.zonePrice)
          g.append('line')
            .attr('x1', 0).attr('x2', W)
            .attr('y1', yPos).attr('y2', yPos)
            .attr('stroke', smpColor)
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', zone.lineStyle.dasharray || '7,4')
            .attr('opacity', 0.75)

          if (Number.isFinite(zone.clearedDemandVolumeMwh) && zone.clearedDemandVolumeMwh > 0) {
            g.append('circle')
              .attr('cx', x(zone.clearedDemandVolumeMwh))
              .attr('cy', yPos)
              .attr('r', 5)
              .attr('fill', smpColor)
              .attr('stroke', theme.palette.background.paper)
              .attr('stroke-width', 2)
          }

          g.append('text')
            .attr('x', W - 6)
            .attr('y', yPos - 7 - (index * 12))
            .attr('font-size', 11)
            .attr('fill', smpColor)
            .attr('text-anchor', 'end')
            .text(`Zone ${zone.zoneId}: ${zone.zonePrice.toFixed(1)} ZAR/MWh`)
        })
      } else if (Number(chartData?.smp || 0) > 0) {
        g.append('line')
          .attr('x1', 0).attr('x2', W)
          .attr('y1', y(Number(chartData.smp))).attr('y2', y(Number(chartData.smp)))
          .attr('stroke', smpColor)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '7,4')

        g.append('text')
          .attr('x', W - 6)
          .attr('y', y(Number(chartData.smp)) - 7)
          .attr('font-size', 13)
          .attr('fill', smpColor)
          .attr('text-anchor', 'end')
          .text(`Reference price: ${Number(chartData.smp).toFixed(1)} ZAR/MWh`)
      }

      if (selectedInterzonalLink) {
        const fromZoneSeries = zoneSeries.find((zone) => zone.zoneId === selectedInterzonalLink.fromZone)
        const toZoneSeries = zoneSeries.find((zone) => zone.zoneId === selectedInterzonalLink.toZone)
        const fromPrice = Number.isFinite(fromZoneSeries?.zonePrice) ? fromZoneSeries.zonePrice : fromZoneSeries?.localClearPrice
        const toPrice = Number.isFinite(toZoneSeries?.zonePrice) ? toZoneSeries.zonePrice : toZoneSeries?.localClearPrice

        if (
          fromZoneSeries &&
          toZoneSeries &&
          Number.isFinite(fromPrice) &&
          Number.isFinite(toPrice)
        ) {
          const markerId = `interzonal-flow-arrow-${selectedInterzonalLink.fromZone}-${selectedInterzonalLink.toZone}`
          const defs = svg.append('defs')
          defs.append('marker')
            .attr('id', markerId)
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 9)
            .attr('refY', 5)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto-start-reverse')
            .append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z')
            .attr('fill', selectedFlowColor)

          const fromX = x(Math.max(fromZoneSeries.clearedDemandVolumeMwh, 0))
          const fromY = y(fromPrice)
          const toX = x(Math.max(toZoneSeries.clearedDemandVolumeMwh, 0))
          const toY = y(toPrice)
          const controlY = Math.max(18, Math.min(fromY, toY) - 54)
          const path = d3.path()
          path.moveTo(fromX, fromY)
          path.bezierCurveTo(fromX, controlY, toX, controlY, toX, toY)

          const annotationLayer = g.append('g').attr('class', 'selected-interzonal-flow')
          annotationLayer.append('path')
            .attr('d', path.toString())
            .attr('fill', 'none')
            .attr('stroke', selectedFlowColor)
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', '8,4')
            .attr('marker-end', `url(#${markerId})`)

          ;[
            { xPos: fromX, yPos: fromY, zoneId: selectedInterzonalLink.fromZone },
            { xPos: toX, yPos: toY, zoneId: selectedInterzonalLink.toZone },
          ].forEach((point) => {
            annotationLayer.append('circle')
              .attr('cx', point.xPos)
              .attr('cy', point.yPos)
              .attr('r', 6)
              .attr('fill', theme.palette.background.paper)
              .attr('stroke', selectedFlowColor)
              .attr('stroke-width', 2)
            annotationLayer.append('text')
              .attr('x', point.xPos)
              .attr('y', point.yPos - 10)
              .attr('text-anchor', 'middle')
              .attr('font-size', 10)
              .attr('font-weight', 600)
              .attr('fill', selectedFlowColor)
              .text(`Z${point.zoneId}`)
          })

          const labelWidth = 176
          const labelHeight = selectedInterzonalLink.lossesMwh > 0 ? 52 : 40
          const labelX = Math.max(10, Math.min(W - labelWidth - 10, ((fromX + toX) / 2) - (labelWidth / 2)))
          const labelY = Math.max(10, controlY - labelHeight - 10)

          annotationLayer.append('rect')
            .attr('x', labelX)
            .attr('y', labelY)
            .attr('width', labelWidth)
            .attr('height', labelHeight)
            .attr('rx', 10)
            .attr('fill', theme.palette.background.paper)
            .attr('stroke', selectedFlowColor)
            .attr('stroke-width', 1.5)

          const labelText = annotationLayer.append('text')
            .attr('x', labelX + 12)
            .attr('y', labelY + 16)
            .attr('font-size', 11)
            .attr('fill', theme.palette.text.primary)

          labelText.append('tspan')
            .attr('x', labelX + 12)
            .attr('dy', 0)
            .attr('font-weight', 600)
            .text(`Flow Z${selectedInterzonalLink.fromZone} -> Z${selectedInterzonalLink.toZone}`)

          labelText.append('tspan')
            .attr('x', labelX + 12)
            .attr('dy', 14)
            .text(`${formatWholeNumber(selectedInterzonalLink.flowMwh)} / ${formatWholeNumber(selectedInterzonalLink.atcMwh)} MWh · ${selectedInterzonalLink.utilizationPct.toFixed(0)}% ATC`)

          if (selectedInterzonalLink.lossesMwh > 0) {
            labelText.append('tspan')
              .attr('x', labelX + 12)
              .attr('dy', 14)
              .text(`Losses: ${formatWholeNumber(selectedInterzonalLink.lossesMwh)} MWh`)
          }
        }
      }
      return
    }

    if (overlayMode) {
      const overlaySeries = chartEntries
        .filter((entry) => entry?.data)
        .map((entry, index) => {
          const supply = (entry.data.supply || []).slice().sort((a, b) => a.price - b.price)
          const demand = (entry.data.demand || []).slice().sort((a, b) => b.price - a.price)
          return {
            roundNum: entry.roundNum,
            lineStyle: overlayLineStyles[index % overlayLineStyles.length],
            supply,
            demand,
            smp: Number(entry.data.smp || 0),
            volume: Number(entry.data.volume || 0),
          }
        })

      const xMax = overlaySeries.reduce((maxValue, entry) => {
        const supplyVolume = d3.sum(entry.supply, (d) => d.volume) || 0
        const demandVolume = d3.sum(entry.demand, (d) => d.volume) || 0
        return Math.max(maxValue, supplyVolume, demandVolume)
      }, 0) || 1000
      const allPrices = overlaySeries.flatMap((entry) => [
        ...entry.supply.map((item) => item.price),
        ...entry.demand.map((item) => item.price),
        ...(entry.smp > 0 ? [entry.smp] : []),
      ])
      const minP = allPrices.length ? d3.min(allPrices) : 0
      const maxP = allPrices.length ? d3.max(allPrices) : 1000
      const pad = Math.max((maxP - minP) * 0.12, maxP * 0.06, 10)
      const x = d3.scaleLinear().domain([0, xMax]).range([0, W]).clamp(true)
      const y = d3.scaleLinear().domain([minP - pad, maxP + pad]).nice().range([H, 0]).clamp(true)

      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(6).tickSize(-W).tickFormat(''))
        .call((gg) => gg.select('.domain').remove())
        .selectAll('line')
        .attr('stroke', gridColor)
        .attr('stroke-dasharray', '3,3')

      const xFmt = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
      const xAxis = g.append('g')
        .attr('transform', `translate(0,${H})`)
        .call(d3.axisBottom(x).ticks(8).tickFormat(xFmt))
      const yAxis = g.append('g')
        .call(d3.axisLeft(y).ticks(6).tickFormat((v) => `${v.toFixed(0)}`))

      xAxis.selectAll('path,line').attr('stroke', gridColor)
      yAxis.selectAll('path,line').attr('stroke', gridColor)
      xAxis.selectAll('text').attr('fill', axisColor).attr('font-size', 11)
      yAxis.selectAll('text').attr('fill', axisColor).attr('font-size', 11)

      g.append('text')
        .attr('x', W / 2).attr('y', H + 42)
        .attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 12)
        .text('Capacity (MWh)')
      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -H / 2).attr('y', -56)
        .attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 12)
        .text('Price (ZAR/MWh)')

      const overlaySmpGuide = g.append('g')
        .attr('class', 'overlay-smp-guide')
        .style('display', 'none')

      const overlaySmpLine = overlaySmpGuide.append('line')
        .attr('x1', 0)
        .attr('x2', W)
        .attr('stroke', smpColor)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '7,4')

      const overlaySmpMarker = overlaySmpGuide.append('circle')
        .attr('r', 6)
        .attr('fill', smpColor)
        .attr('stroke', theme.palette.background.paper)
        .attr('stroke-width', 2)

      const overlaySmpLabel = overlaySmpGuide.append('text')
        .attr('x', W - 6)
        .attr('font-size', 13)
        .attr('fill', smpColor)
        .attr('text-anchor', 'end')

      const hideOverlaySmpGuide = () => {
        overlaySmpGuide.style('display', 'none')
      }

      const showOverlaySmpGuide = (entry) => {
        if (!entry || !Number.isFinite(entry.smp) || entry.smp <= 0) {
          hideOverlaySmpGuide()
          return
        }
        const yPos = y(entry.smp)
        overlaySmpGuide.style('display', null)
        overlaySmpLine
          .attr('y1', yPos)
          .attr('y2', yPos)
        overlaySmpLabel
          .attr('y', yPos - 7)
          .text(`Round ${entry.roundNum} SMP: ${entry.smp.toFixed(1)} ZAR/MWh`)
        if (Number.isFinite(entry.volume) && entry.volume > 0) {
          overlaySmpMarker
            .style('display', null)
            .attr('cx', x(entry.volume))
            .attr('cy', yPos)
        } else {
          overlaySmpMarker.style('display', 'none')
        }
      }

      const resetHighlight = () => {
        g.selectAll('.overlay-round-series').attr('opacity', 0.85)
        g.selectAll('.overlay-round-line')
          .attr('stroke-width', function setWidth() {
            return Number(this.getAttribute('data-base-width') || 2.4)
          })
        hideOverlaySmpGuide()
      }

      const highlightRound = (hoverRoundNum) => {
        const highlightedEntry = overlaySeries.find((entry) => entry.roundNum === hoverRoundNum)
        g.selectAll('.overlay-round-series').attr('opacity', function setOpacity() {
          return Number(this.getAttribute('data-round')) === hoverRoundNum ? 1 : 0.14
        })
        g.selectAll('.overlay-round-line').attr('stroke-width', function setWidth() {
          return Number(this.getAttribute('data-round')) === hoverRoundNum ? 4.4 : 1.4
        })
        showOverlaySmpGuide(highlightedEntry)
      }

      overlaySeries.forEach((entry) => {
        const sPts = toStepPath(cumulate(entry.supply), x, y, H, true)
        const dPts = toStepPath(cumulate(entry.demand), x, y, H, false)
        const group = g.append('g')
          .attr('class', 'overlay-round-series')
          .attr('data-round', String(entry.roundNum))
          .attr('opacity', 0.85)

        ;[
          { points: sPts, color: supplyColor, baseWidth: 2.8 },
          { points: dPts, color: demandColor, baseWidth: 2.8 },
        ].forEach((series) => {
          group.append('path')
            .attr('class', 'overlay-round-line')
            .attr('data-round', String(entry.roundNum))
            .attr('data-base-width', String(series.baseWidth))
            .attr('d', d3.line()(series.points))
            .attr('fill', 'none')
            .attr('stroke', series.color)
            .attr('stroke-width', series.baseWidth)
            .attr('stroke-dasharray', entry.lineStyle.dasharray)
            .style('cursor', 'pointer')
            .on('mouseenter', () => highlightRound(entry.roundNum))
            .on('mouseleave', resetHighlight)
        })
      })

      resetHighlight()
      return
    }

    const supply = (chartData.supply || []).slice().sort((a, b) => a.price - b.price)
    const demand = (chartData.demand || []).slice().sort((a, b) => b.price - a.price)
    // Two-phase rounds: overlay the cleared DAM merit order (player DA bids + synthetic
    // demand) as a dashed reference next to the active IDM curves. The synthetic-only
    // baseline_supply/baseline_demand arrays are insufficient here (DAM supply comes from
    // player bids, so baseline_supply is often empty), so use the dedicated DAM snapshot.
    const damCompanion = (!overlayMode && chartData?.dam_companion && chartData.dam_companion.market_phase === 'dam')
      ? chartData.dam_companion
      : null
    const damSupply = damCompanion ? (damCompanion.supply || []).slice().sort((a, b) => a.price - b.price) : []
    const damDemand = damCompanion ? (damCompanion.demand || []).slice().sort((a, b) => b.price - a.price) : []
    const damSmp = damCompanion ? Number(damCompanion.smp || 0) : 0
    const showDamReference = chartData?.market_phase === 'idm' && (damSupply.length > 0 || damDemand.length > 0)
    const smp = chartData.smp || 0
    const sCum = cumulate(supply)
    const dCum = cumulate(demand)

    // Cleared quantity that lies ON the displayed offered curves: the volume tradable at
    // the clearing price (min of supply available at/below price and demand at/above price).
    // Using this for the SMP marker places the dot on the visible supply/demand crossing,
    // instead of the stored result volume which may include synthetic system blocks.
    const clearedQtyFromCurves = (supplyAsc, demandDesc, price) => {
      const p = Number(price || 0)
      let supplyAtPrice = 0
      let demandAtPrice = 0
      supplyAsc.forEach((s) => { if (Number(s.price) <= p + 1e-9) supplyAtPrice += Number(s.volume || 0) })
      demandDesc.forEach((d) => { if (Number(d.price) >= p - 1e-9) demandAtPrice += Number(d.volume || 0) })
      return Math.min(supplyAtPrice, demandAtPrice)
    }

    // When the DAM reference is shown alongside the IDM curves, the x-axis (capacity) and
    // y-axis (price) must span both markets so the full DAM merit order is visible and not
    // clamped off-screen behind the smaller IDM delta.
    const xMax = Math.max(
      d3.sum(supply, (d) => d.volume),
      d3.sum(demand, (d) => d.volume),
      ...(showDamReference ? [d3.sum(damSupply, (d) => d.volume), d3.sum(damDemand, (d) => d.volume)] : []),
    ) || 1000

    const x = d3.scaleLinear().domain([0, xMax]).range([0, W]).clamp(true)

    const allPrices = [
      ...supply.map((d) => d.price),
      ...demand.map((d) => d.price),
      ...(showDamReference ? damSupply.map((d) => d.price) : []),
      ...(showDamReference ? damDemand.map((d) => d.price) : []),
      ...(showDamReference && damSmp > 0 ? [damSmp] : []),
      ...(smp > 0 ? [smp] : []),
    ]
    const minP = allPrices.length ? d3.min(allPrices) : 0
    const maxP = allPrices.length ? d3.max(allPrices) : 1000
    const pad = Math.max((maxP - minP) * 0.12, maxP * 0.06, 10)
    const y = d3.scaleLinear().domain([minP - pad, maxP + pad]).nice().range([H, 0]).clamp(true)

    // Horizontal grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(6).tickSize(-W).tickFormat(''))
      .call((gg) => gg.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '3,3')

    // Axes
    const xFmt = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${H})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(xFmt))
    const yAxis = g.append('g')
      .call(d3.axisLeft(y).ticks(6).tickFormat((v) => `${v.toFixed(0)}`))

    xAxis.selectAll('path,line').attr('stroke', gridColor)
    yAxis.selectAll('path,line').attr('stroke', gridColor)
    xAxis.selectAll('text').attr('fill', axisColor).attr('font-size', 11)
    yAxis.selectAll('text').attr('fill', axisColor).attr('font-size', 11)

    g.append('text')
      .attr('x', W / 2).attr('y', H + 42)
      .attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 12)
      .text('Capacity (MWh)')
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -H / 2).attr('y', -56)
      .attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 12)
      .text('Price (ZAR/MWh)')

    const sPts = toStepPath(sCum, x, y, H, true)
    const dPts = toStepPath(dCum, x, y, H, false)

    // DAM reference curves (drawn first, beneath the active IDM curves)
    if (showDamReference) {
      if (damSupply.length > 0) {
        g.append('path')
          .attr('d', d3.line()(toStepPath(cumulate(damSupply), x, y, H, true)))
          .attr('fill', 'none')
          .attr('stroke', supplyColor)
          .attr('stroke-width', 1.8)
          .attr('stroke-dasharray', '6,4')
          .attr('opacity', 0.55)
      }
      if (damDemand.length > 0) {
        g.append('path')
          .attr('d', d3.line()(toStepPath(cumulate(damDemand), x, y, H, false)))
          .attr('fill', 'none')
          .attr('stroke', demandColor)
          .attr('stroke-width', 1.8)
          .attr('stroke-dasharray', '6,4')
          .attr('opacity', 0.55)
      }
      if (damSmp > 0) {
        const damQ = clearedQtyFromCurves(damSupply, damDemand, damSmp)
        g.append('line')
          .attr('x1', 0).attr('x2', W)
          .attr('y1', y(damSmp)).attr('y2', y(damSmp))
          .attr('stroke', smpColor)
          .attr('stroke-width', 1.2)
          .attr('stroke-dasharray', '2,3')
          .attr('opacity', 0.6)
        if (damQ > 0) {
          g.append('circle')
            .attr('cx', x(damQ)).attr('cy', y(damSmp))
            .attr('r', 5)
            .attr('fill', 'none')
            .attr('stroke', smpColor)
            .attr('stroke-width', 2)
            .attr('opacity', 0.85)
        }
        g.append('text')
          .attr('x', W - 6).attr('y', y(damSmp) - 7)
          .attr('font-size', 11).attr('fill', smpColor).attr('opacity', 0.85).attr('text-anchor', 'end')
          .text(`DAM SMP: ${damSmp.toFixed(1)} ZAR/MWh`)
      }
    }

    // Supply and demand step curves
    g.append('path')
      .attr('d', d3.line()(sPts))
      .attr('fill', 'none')
      .attr('stroke', supplyColor)
      .attr('stroke-width', 2.5)

    g.append('path')
      .attr('d', d3.line()(dPts))
      .attr('fill', 'none')
      .attr('stroke', demandColor)
      .attr('stroke-width', 2.5)

    // SMP dashed line + intersection marker
    if (smp > 0) {
      // Place the marker on the visible supply/demand crossing (offered curves), not the
      // stored result volume which can include synthetic system blocks that are not drawn.
      const clearedVol = clearedQtyFromCurves(supply, demand, smp)
      const xIntersect = clearedVol > 0 ? x(clearedVol) : null

      g.append('line')
        .attr('x1', 0).attr('x2', W)
        .attr('y1', y(smp)).attr('y2', y(smp))
        .attr('stroke', smpColor)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '7,4')

      g.append('text')
        .attr('x', W - 6).attr('y', y(smp) - 7)
        .attr('font-size', 13).attr('fill', smpColor).attr('text-anchor', 'end')
        .text(`SMP: ${smp.toFixed(1)} ZAR/MWh`)

      if (xIntersect !== null) {
        // Vertical dashed line at clearing volume
        g.append('line')
          .attr('x1', xIntersect).attr('x2', xIntersect)
          .attr('y1', y(smp)).attr('y2', H)
          .attr('stroke', smpColor)
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,3')

        g.append('circle')
          .attr('cx', xIntersect).attr('cy', y(smp))
          .attr('r', 6)
          .attr('fill', smpColor)
          .attr('stroke', 'white')
          .attr('stroke-width', 2)
      }
    }

  }, [chartData, chartEntries, idmForecastChange, overlayLineStyles, overlayMode, selectedInterzonalLink, selectedZoneIdsKey, theme, visibleZonalCurves, zonalChartAvailable, zonalStyleIndexByZoneId])

  const hourOptions = Array.from({ length: roundSpan }, (_, i) => ({
    localIdx: i,
    hod: activeRounds.length > 0 ? computeHourOfDay((Number(activeRounds[0]) - 1) * roundSpan + i, startTime) : 0,
  }))

  return (
    <Stack spacing={2}>
      {/* Controls row */}
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Hour</InputLabel>
          <Select
            value={localHour}
            label="Hour"
            onChange={(e) => setLocalHour(Number(e.target.value))}
          >
            {hourOptions.map(({ localIdx, hod }) => (
              <MenuItem key={localIdx} value={localIdx}>
                {overlayMode ? `Slot ${localIdx + 1}` : `${String(hod).padStart(2, '0')}:00 (Slot ${localIdx + 1})`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {overlayMode ? (
          <Chip
            size="small"
            label={`Overlay comparison (${activeRounds.length} rounds)`}
            variant="outlined"
          />
        ) : chartData && (
          <Chip
            size="small"
            label={
              chartData.market_source === 'submitted_market'
                ? `${historicalMode ? 'Historical Market' : 'Live Market'} (${chartData.submitted_players} players)`
                : 'Synthetic Preview'
            }
            color={chartData.market_source === 'submitted_market' ? 'success' : 'default'}
            variant="outlined"
          />
        )}

        {!overlayMode && historicalMode && chartData?.market_source === 'submitted_market' && (
          <Typography variant="body2" color="text.secondary">
            Historical clearing: matched volume and price come from the stored round result. Offered curves come from the saved bids of that round.
          </Typography>
        )}

        {!overlayMode && chartData?.volume != null && (
          <Typography variant="body2" color="text.secondary">
            Matched Volume: {Number(chartData.volume).toLocaleString('en-US', { maximumFractionDigits: 0 })} MWh
          </Typography>
        )}

        {zonalChartAvailable ? (
          <Chip
            size="small"
            label={chartData?.zonal_pricing_active ? 'Zonal merit-order view' : 'Zonal curve view'}
            color={chartData?.zonal_pricing_active ? 'warning' : 'default'}
            variant="outlined"
          />
        ) : null}

        {overlayMode && activeRounds.length > 0 ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip
              size="small"
              label="Supply"
              sx={{ borderColor: 'success.main', color: 'success.main' }}
              variant="outlined"
            />
            <Chip
              size="small"
              label="Demand"
              sx={{ borderColor: 'error.main', color: 'error.main' }}
              variant="outlined"
            />
            {activeRounds.map((currentRound, index) => (
              <Chip
                key={currentRound}
                size="small"
                label={(
                  <Stack direction="row" spacing={0.9} alignItems="center">
                    <Stack spacing={0.35}>
                      <Box component="span" sx={buildLineSwatchSx(chipSupplyColor, overlayLineStyles[index % overlayLineStyles.length].dasharray)} />
                      <Box component="span" sx={buildLineSwatchSx(chipDemandColor, overlayLineStyles[index % overlayLineStyles.length].dasharray)} />
                    </Stack>
                    <Box component="span">{`Round ${currentRound} · ${overlayLineStyles[index % overlayLineStyles.length].label}`}</Box>
                  </Stack>
                )}
                sx={{
                  borderColor: 'divider',
                  color: 'text.primary',
                  '& .MuiChip-label': { px: 1.1 },
                }}
                variant="outlined"
              />
            ))}
          </Stack>
        ) : null}

        {zonalChartAvailable ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip
              size="small"
              label="Supply"
              sx={{ borderColor: 'success.main', color: 'success.main' }}
              variant="outlined"
            />
            <Chip
              size="small"
              label="Demand"
              sx={{ borderColor: 'error.main', color: 'error.main' }}
              variant="outlined"
            />
            {zonalCurves.map((zone) => {
              const style = overlayLineStyles[(zonalStyleIndexByZoneId[zone.zoneId] ?? 0) % overlayLineStyles.length]
              const isSelected = selectedZoneIds.includes(zone.zoneId)
              const zonePriceLabel = Number.isFinite(zone.zonePrice)
                ? ` · ZAR ${zone.zonePrice.toFixed(0)}`
                : ''
              return (
                <Chip
                  key={`zone-toggle-${zone.zoneId}`}
                  size="small"
                  clickable
                  onClick={() => handleZoneToggle(zone.zoneId)}
                  label={(
                    <Stack direction="row" spacing={0.9} alignItems="center">
                      <Stack spacing={0.35}>
                        <Box component="span" sx={buildLineSwatchSx(chipSupplyColor, style.dasharray)} />
                        <Box component="span" sx={buildLineSwatchSx(chipDemandColor, style.dasharray)} />
                      </Stack>
                      <Box component="span">{`Zone ${zone.zoneId} · ${style.label}${zonePriceLabel}`}</Box>
                    </Stack>
                  )}
                  variant="outlined"
                  sx={{
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    borderWidth: isSelected ? 2 : 1,
                    color: 'text.primary',
                    bgcolor: isSelected ? 'action.selected' : 'transparent',
                    '& .MuiChip-label': { px: 1.1 },
                  }}
                />
              )
            })}
          </Stack>
        ) : null}
      </Stack>

      {idmForecastChange ? (() => {
        const noTradeBecausePriceGap = (
          Number(chartData?.volume || 0) <= 0.5
          && liveMarketStats.totalSupply > 0.5
          && liveMarketStats.totalDemand > 0.5
          && liveMarketStats.bestSupplyPrice != null
          && liveMarketStats.bestDemandPrice != null
          && liveMarketStats.bestDemandPrice < liveMarketStats.bestSupplyPrice
        )
        return (
          <Box
            sx={{
              p: 1.5,
              border: '1px solid',
              borderColor: 'info.light',
              borderRadius: 1.5,
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(2, 136, 209, 0.12)' : 'rgba(2, 136, 209, 0.06)',
            }}
          >
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{currentIdmGuidance.title}</Typography>
            <Typography variant="body2" color="text.secondary">{currentIdmGuidance.summary}</Typography>
            {currentIdmGuidance.action && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {currentIdmGuidance.action}
              </Typography>
            )}
            {chartData?.market_source === 'submitted_market' ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {historicalMode ? 'Historical offers' : 'Live bids'}: supply {formatWholeNumber(liveMarketStats.totalSupply)} MWh · demand {formatWholeNumber(liveMarketStats.totalDemand)} MWh.
              </Typography>
            ) : null}
            {noTradeBecausePriceGap ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                No trade: best bid {liveMarketStats.bestDemandPrice.toFixed(0)} ZAR/MWh is below best offer {liveMarketStats.bestSupplyPrice.toFixed(0)} ZAR/MWh.
              </Typography>
            ) : null}
            {selectedHourIdmForecastChange ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Synthetic KSE shift only: supply {formatWholeNumber(selectedHourIdmForecastChange.delta_supply_mwh)} MWh · demand {formatWholeNumber(selectedHourIdmForecastChange.delta_demand_mwh)} MWh.
              </Typography>
            ) : null}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {hasDamCompanion
                ? 'The solid curves show the active IDM market. The dashed green/red curves show the cleared DAM market for the same hour as a reference.'
                : 'Supply and demand curves for the Intraday market at the selected hour.'}
            </Typography>
          </Box>
        )
      })() : null}

      {zonalChartAvailable && visibleInterzonalLinks.length > 0 ? (
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">
            Interzonal flows for the selected hour. Click one card to annotate it in the chart.
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {visibleInterzonalLinks.map((link) => {
              const linkKey = buildInterzonalLinkKey(link)
              const isSelected = selectedInterzonalLinkKey === linkKey
              return (
                <Box
                  key={`interzonal-link-${link.fromZone}-${link.toZone}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleInterzonalLinkToggle(linkKey)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleInterzonalLinkToggle(linkKey)
                    }
                  }}
                  sx={{
                    minWidth: 220,
                    px: 1.25,
                    py: 1,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: isSelected ? 'primary.main' : (link.binding ? 'warning.main' : 'divider'),
                    borderWidth: isSelected ? 2 : 1,
                    bgcolor: isSelected ? 'action.selected' : (link.binding ? 'action.hover' : 'background.paper'),
                    cursor: 'pointer',
                    transition: 'border-color 120ms ease, background-color 120ms ease',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600}>
                      {`Zone ${link.fromZone} → Zone ${link.toZone}`}
                    </Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" justifyContent="flex-end">
                      {link.binding ? (
                        <Chip size="small" label="Binding" color="warning" variant="filled" />
                      ) : null}
                      <Chip
                        size="small"
                        label={isSelected ? 'Annotated' : 'Annotate'}
                        color={isSelected ? 'primary' : 'default'}
                        variant={isSelected ? 'filled' : 'outlined'}
                      />
                    </Stack>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {`${formatWholeNumber(link.flowMwh)} / ${formatWholeNumber(link.atcMwh)} MWh · ${link.utilizationPct.toFixed(0)}% ATC`}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {`Delivered: ${formatWholeNumber(link.flowReceivedMwh)} MWh${link.lossesMwh > 0 ? ` · Losses: ${formatWholeNumber(link.lossesMwh)} MWh` : ''}`}
                  </Typography>
                </Box>
              )
            })}
          </Stack>
        </Stack>
      ) : null}

      {!overlayMode && chartData ? (
        <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Legend
          </Typography>
          <Stack direction="row" spacing={0.8} alignItems="center">
            <Box component="span" sx={buildLineSwatchSx(chipSupplyColor, null)} />
            <Typography variant="caption" color="text.secondary">Supply</Typography>
          </Stack>
          <Stack direction="row" spacing={0.8} alignItems="center">
            <Box component="span" sx={buildLineSwatchSx(chipDemandColor, null)} />
            <Typography variant="caption" color="text.secondary">Demand</Typography>
          </Stack>
          <Stack direction="row" spacing={0.8} alignItems="center">
            <Box component="span" sx={buildLineSwatchSx(chipPriceColor, '7,4')} />
            <Typography variant="caption" color="text.secondary">
              {zonalChartAvailable && chartData?.zonal_pricing_active ? 'Zone price guide' : 'Reference price'}
            </Typography>
          </Stack>
          {hasDamCompanion && !zonalChartAvailable ? (
            <>
              <Stack direction="row" spacing={0.8} alignItems="center">
                <Box component="span" sx={buildLineSwatchSx(chipSupplyColor, '6,4')} />
                <Typography variant="caption" color="text.secondary">DAM supply (reference)</Typography>
              </Stack>
              <Stack direction="row" spacing={0.8} alignItems="center">
                <Box component="span" sx={buildLineSwatchSx(chipDemandColor, '6,4')} />
                <Typography variant="caption" color="text.secondary">DAM demand (reference)</Typography>
              </Stack>
            </>
          ) : null}
          {selectedInterzonalLink ? (
            <Stack direction="row" spacing={0.8} alignItems="center">
              <Box component="span" sx={buildLineSwatchSx(selectedInterzonalLink.binding ? theme.palette.warning.main : theme.palette.primary.main, '8,4')} />
              <Typography variant="caption" color="text.secondary">
                {`Annotated flow Z${selectedInterzonalLink.fromZone} → Z${selectedInterzonalLink.toZone}`}
              </Typography>
            </Stack>
          ) : null}
        </Stack>
      ) : null}

      {/* Chart area */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      ) : !sessionId || activeRounds.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          No round selected.
        </Typography>
      ) : !chartData ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={20} />
        </Box>
      ) : (
        <Box
          sx={{
            width: '100%',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: 1,
            backgroundColor: 'background.paper',
          }}
        >
          <svg ref={svgRef} />
        </Box>
      )}

      <Typography variant="caption" color="text.secondary">
        {overlayMode
          ? 'The overlay compares supply and demand curves across rounds for the selected slot. Supply stays green, demand stays red, rounds use different line styles, and hovering one line highlights that round and shows its SMP.'
          : zonalChartAvailable
            ? 'The chart overlays one supply and one demand curve per selected grid zone. Supply stays green, demand stays red, zones use different line styles, and the zone chips above mirror those line patterns while toggling visibility. The flow cards summarize active interzonal transfers, ATC usage, and losses for the same hour, and a selected card adds that transfer as an in-chart annotation. When zonal pricing is active, each zone also gets its own price guide.'
            : 'The curves show the aggregated supply and demand profile for the selected hour. The intersection yields the System Marginal Price (SMP).'}
      </Typography>
    </Stack>
  )
}
