import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, Tab, Box, Stack, TextField, Button, Paper, Typography, Select, MenuItem, IconButton, Menu, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch, Grid, Tooltip, InputAdornment } from '@mui/material'
import { Edit as EditIcon, Add as AddIcon, Visibility as VisibilityIcon } from '@mui/icons-material'
import InfoLabel from '../components/InfoLabel'
import NumberInput from '../components/inputs/NumberInput'
import RangeInput from '../components/inputs/RangeInput'
import AtcEditor from '../components/grid/AtcEditor'
import DeviceCard from '../components/devices/DeviceCard'
import { createDeviceFromPreset, duplicateDevice, DEVICE_PRESETS } from '../components/devices/devicePresets'
import EventsList from '../components/events/EventsList'
import EventEditor from '../components/events/EventEditor'
import ProfileEditorModal from '../components/ProfileEditorModal'
import ChallengesList from '../components/challenges/ChallengesList'
import ChallengeEditor from '../components/challenges/ChallengeEditor'
import api from '../services/api'
import * as d3 from 'd3'
import ReactMarkdown from 'react-markdown'
import ValidationPanel from '../components/ValidationPanel'
import StickyActionBar from '../components/StickyActionBar'
import { exportPNG, exportSVG } from '../utils/exportSvg'
import useAuth from '../store/auth'

// Bump this when making breaking/editor-visible changes to KSE
const KSE_EDITOR_VERSION = '1.1.0'

const normalizeBooleanFlag = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true
    if (['false', '0', 'no', 'off', 'disabled', ''].includes(normalized)) return false
  }
  return Boolean(value)
}

const buildEqualDistribution = (zones) => {
  const count = Math.max(1, Number(zones) || 1)
  const base = Math.floor((100 / count) * 1000) / 1000
  const values = Array.from({ length: count }, () => base)
  const total = values.reduce((sum, value) => sum + value, 0)
  values[count - 1] = Math.round((values[count - 1] + (100 - total)) * 1000) / 1000
  return values
}

const normalizeMixEntry = (entry, zones, fallbackBlocks = 0) => {
  const normalized = (entry && typeof entry === 'object' && !Array.isArray(entry))
    ? { ...entry }
    : { blocks: Number(entry ?? fallbackBlocks) || 0 }

  if (normalized.blocks == null && normalized.share_pct != null) {
    normalized.blocks = Number(normalized.share_pct) || 0
  }
  normalized.blocks = Number(normalized.blocks || 0)

  const distribution = Array.isArray(normalized.zone_distribution_pct)
    ? normalized.zone_distribution_pct.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : []
  normalized.zone_distribution_pct = distribution.length === Number(zones)
    ? distribution
    : buildEqualDistribution(zones)

  return normalized
}

const getMixBlocks = (entry, fallbackBlocks = 0) => {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return Number(entry.blocks ?? entry.share_pct ?? fallbackBlocks) || 0
  }
  return Number(entry ?? fallbackBlocks) || 0
}

const getMixZoneSharesForPreview = (mix, zones) => {
  const count = Math.max(1, Number(zones) || 1)
  const shares = Array.from({ length: count }, () => 0)
  if (!mix || typeof mix !== 'object') {
    return buildEqualDistribution(count).map((value) => value / 100)
  }
  Object.values(mix).forEach((entry) => {
    const blocks = Math.max(0, getMixBlocks(entry, 0))
    if (blocks <= 0) return
    const distribution = normalizeMixEntry(entry, count).zone_distribution_pct
    for (let idx = 0; idx < count; idx += 1) {
      shares[idx] += blocks * ((Number(distribution[idx]) || 0) / 100)
    }
  })
  const total = shares.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    return buildEqualDistribution(count).map((value) => value / 100)
  }
  return shares.map((value) => value / total)
}

const buildTopologyNeighbors = (atc, zones) => {
  const count = Math.max(1, Number(zones) || 1)
  const neighbors = Array.from({ length: count }, () => [])
  let hasExplicitLinks = false
  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < count; j += 1) {
      if (i === j) continue
      const cap = Number(atc?.[i]?.[j] ?? 0)
      if (cap > 0) {
        neighbors[i].push(j)
        hasExplicitLinks = true
      }
    }
    neighbors[i].sort((a, b) => a - b)
  }
  if (hasExplicitLinks) return neighbors
  return Array.from({ length: count }, (_, i) => (
    Array.from({ length: count }, (_, j) => j).filter((j) => j !== i)
  ))
}

const findShortestZonePath = (neighbors, source, sink) => {
  if (source === sink) return [source]
  const queue = [[source]]
  const seen = new Set([source])
  while (queue.length > 0) {
    const path = queue.shift()
    const node = path[path.length - 1]
    const nextNodes = [...(neighbors[node] || [])].sort((a, b) => a - b)
    for (const next of nextNodes) {
      if (seen.has(next)) continue
      const nextPath = [...path, next]
      if (next === sink) return nextPath
      seen.add(next)
      queue.push(nextPath)
    }
  }
  return null
}

const computeSyntheticTransferPreview = (cfg) => {
  const zones = Math.max(1, Number(cfg?.grid?.zones || 1))
  const baseVolume = Math.max(0, Number(cfg?.market?.base_volume_mwh || 0))
  const lossRate = Math.max(0, Math.min(1, Number(cfg?.grid?.losses_pct_per_link ?? 2) / 100))
  const atc = Array.isArray(cfg?.grid?.atc) ? cfg.grid.atc : []
  const generationMix = cfg?.environment?.groups || cfg?.market?.generator_mix || {}
  const consumerMix = cfg?.market?.consumer_mix || {}
  const generationShares = getMixZoneSharesForPreview(generationMix, zones)
  const demandShares = getMixZoneSharesForPreview(consumerMix, zones)

  const zoneRows = Array.from({ length: zones }, (_, idx) => {
    const generation = baseVolume * generationShares[idx]
    const demand = baseVolume * demandShares[idx]
    return {
      zoneId: idx + 1,
      generation,
      demand,
      net: generation - demand,
      imports: 0,
      exports: 0,
      losses: 0,
      shortfall: 0,
    }
  })

  const surplus = zoneRows.map((row) => Math.max(0, row.net))
  const deficit = zoneRows.map((row) => Math.max(0, -row.net))
  const neighbors = buildTopologyNeighbors(atc, zones)
  const linkRequirements = new Map()

  for (let sink = 0; sink < zones; sink += 1) {
    while (deficit[sink] > 1e-6) {
      let best = null
      for (let source = 0; source < zones; source += 1) {
        if (surplus[source] <= 1e-6) continue
        const path = findShortestZonePath(neighbors, source, sink)
        if (!path) continue
        const edgeCount = Math.max(0, path.length - 1)
        const efficiency = edgeCount > 0 ? Math.pow(1 - lossRate, edgeCount) : 1
        const candidate = { source, path, edgeCount, efficiency }
        if (!best || candidate.edgeCount < best.edgeCount || (candidate.edgeCount === best.edgeCount && candidate.source < best.source)) {
          best = candidate
        }
      }
      if (!best) {
        zoneRows[sink].shortfall += deficit[sink]
        deficit[sink] = 0
        break
      }

      const sendFromSource = Math.min(surplus[best.source], deficit[sink] / Math.max(best.efficiency, 1e-9))
      if (sendFromSource <= 1e-9) {
        zoneRows[sink].shortfall += deficit[sink]
        deficit[sink] = 0
        break
      }

      surplus[best.source] -= sendFromSource
      zoneRows[best.source].exports += sendFromSource

      let edgeFlow = sendFromSource
      for (let idx = 0; idx < best.path.length - 1; idx += 1) {
        const from = best.path[idx]
        const to = best.path[idx + 1]
        const key = `${from}-${to}`
        const existing = linkRequirements.get(key) || {
          fromZone: from + 1,
          toZone: to + 1,
          requiredAtc: 0,
          losses: 0,
          configuredAtc: Number(atc?.[from]?.[to] ?? 0),
        }
        const edgeLoss = edgeFlow * lossRate
        existing.requiredAtc += edgeFlow
        existing.losses += edgeLoss
        linkRequirements.set(key, existing)
        zoneRows[from].losses += edgeLoss
        edgeFlow -= edgeLoss
      }

      const delivered = edgeFlow
      zoneRows[sink].imports += delivered
      deficit[sink] = Math.max(0, deficit[sink] - delivered)
    }
  }

  const linkRows = Array.from(linkRequirements.values())
    .map((row) => ({
      ...row,
      gap: Math.max(0, row.requiredAtc - row.configuredAtc),
    }))
    .sort((a, b) => (a.fromZone - b.fromZone) || (a.toZone - b.toZone))

  return {
    zoneRows,
    linkRows,
    totalShortfall: zoneRows.reduce((sum, row) => sum + row.shortfall, 0),
  }
}

const normalizeScenarioConfig = (input) => {
  const next = structuredClone(input || defaultConfig)
  const zones = Math.max(1, Number(next?.grid?.zones || 2))

  if (!next.market) next.market = {}
  if (!next.environment) next.environment = {}
  if (!next.grid) next.grid = {}
  if (!next.balancing) next.balancing = {}
  if (!Array.isArray(next.player_types)) next.player_types = []

  const generatorDefaults = { pv: 250, wind: 200, hydro: 100, coal: 300, gas: 150, nuclear: 0 }
  const consumerDefaults = { industrial: 400, household: 500, agriculture: 100 }

  const sourceGeneratorMix = next.market.generator_mix || generatorDefaults
  const sourceEnvironmentGroups = next.environment.groups || sourceGeneratorMix
  const normalizedEnvironmentGroups = {}
  Object.keys(generatorDefaults).forEach((key) => {
    normalizedEnvironmentGroups[key] = normalizeMixEntry(sourceEnvironmentGroups[key] ?? sourceGeneratorMix[key] ?? generatorDefaults[key], zones, generatorDefaults[key])
  })
  next.environment.groups = normalizedEnvironmentGroups

  const normalizedGeneratorMix = {}
  Object.keys(generatorDefaults).forEach((key) => {
    const existing = sourceGeneratorMix[key] ?? normalizedEnvironmentGroups[key]
    normalizedGeneratorMix[key] = {
      ...normalizeMixEntry(existing, zones, generatorDefaults[key]),
      zone_distribution_pct: [...normalizedEnvironmentGroups[key].zone_distribution_pct],
    }
  })
  next.market.generator_mix = normalizedGeneratorMix

  const sourceConsumerMix = next.market.consumer_mix || consumerDefaults
  const normalizedConsumerMix = {}
  Object.keys(consumerDefaults).forEach((key) => {
    normalizedConsumerMix[key] = normalizeMixEntry(sourceConsumerMix[key] ?? consumerDefaults[key], zones, consumerDefaults[key])
  })
  next.market.consumer_mix = normalizedConsumerMix

  if (!next.grid.atc || !Array.isArray(next.grid.atc)) {
    next.grid.atc = Array.from({ length: zones }, (_, i) => Array.from({ length: zones }, (_, j) => (i === j ? 0 : 0)))
  }
  next.grid.losses_pct_per_link = Number(next.grid.losses_pct_per_link ?? next.grid.transmission_loss_pct ?? next.grid.losses_pct ?? 2)
  next.grid.network_settlement = {
    extra_cost_mode: next.grid.network_settlement?.extra_cost_mode || 'zonal_only',
    cost_allocation_target: next.grid.network_settlement?.cost_allocation_target || 'consumers_only',
    shortfall_price_mode: next.grid.network_settlement?.shortfall_price_mode || 'smp_multiplier',
    shortfall_price_value: Number(next.grid.network_settlement?.shortfall_price_value ?? 2) || 2,
  }
  next.grid.generator_curtailment_mode = next.grid.generator_curtailment_mode || 'pro_rata'
  next.balancing = {
    up_price_zar_per_mwh: Number(next.balancing?.up_price_zar_per_mwh ?? 1200) || 1200,
    down_price_zar_per_mwh: Number(next.balancing?.down_price_zar_per_mwh ?? 800) || 800,
  }

  next.player_types = next.player_types.map((pt) => ({ ...pt, zone: pt?.zone === '' ? undefined : pt?.zone }))

  return next
}

const parseDistributionInput = (value, zones) => {
  const parts = String(value || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part))
  return parts.length === Number(zones) ? parts : null
}

const renderLabelWithInfo = (label, tooltip) => (
  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
    <Box component="span">{label}</Box>
    <Tooltip title={tooltip} arrow enterDelay={300}>
      <Box
        component="span"
        sx={{
          width: 16,
          height: 16,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          bgcolor: 'action.hover',
          color: 'text.secondary',
          fontSize: 12,
          cursor: 'help',
          userSelect: 'none',
          lineHeight: 1,
        }}
        aria-label={`More info about ${label}`}
      >
        i
      </Box>
    </Tooltip>
  </Box>
)

const formatInt = (value) => {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return '0'
  return Math.round(numeric).toLocaleString('en-US')
}

const defaultConfig = {
  version: '1.0.0',
  objectives: '',
  general: { horizon_hours: 24, forecast_horizon_hours: 48, freeze_hours: 2, day_ahead_gate_hour: 12, id_gate_interval_hours: 4, id_gate_base_hour: 0, day_one_baseline_mode: 'preset', round_span_hours: 6, rounds: 4, round_duration_seconds: 300 },
    market: {
      base_price: 1000,
      base_volume_mwh: 20000,
      price_floor: -500,
      price_cap: 5000,
      // generator_mix / consumer_mix are interpreted as counts (0-1000) per group
      generator_mix: {
        pv: { blocks: 250, zone_distribution_pct: [50, 50] },
        wind: { blocks: 200, zone_distribution_pct: [50, 50] },
        hydro: { blocks: 100, zone_distribution_pct: [50, 50] },
        coal: { blocks: 300, zone_distribution_pct: [50, 50] },
        gas: { blocks: 150, zone_distribution_pct: [50, 50] },
        nuclear: { blocks: 0, zone_distribution_pct: [50, 50] },
      },
      consumer_mix: {
        industrial: { blocks: 400, zone_distribution_pct: [50, 50] },
        household: { blocks: 500, zone_distribution_pct: [50, 50] },
        agriculture: { blocks: 100, zone_distribution_pct: [50, 50] },
      },
      random_capacity_pct: 10,
      random_price_pct: 10,
    },
  markets: {
    dam: {
      trading: []   // Array of status per round: "on", "market_code", "off"
    },
    idm: {
      trading: []
    }
  },
  player_input: {
    mode: 'all_hours',
    editable_offsets: [0],
    hide_non_editable_hours: false,
    allow_other_rounds_editing: true,
    enable_smooth_drag: true,
  },
  grid: {
    zones: 2,
    atc: [[0,5000],[5000,0]],
    losses_pct_per_link: 2,
    network_settlement: {
      extra_cost_mode: 'zonal_only',
      cost_allocation_target: 'consumers_only',
      shortfall_price_mode: 'smp_multiplier',
      shortfall_price_value: 2,
    },
    generator_curtailment_mode: 'pro_rata',
  },
  balancing: {
    up_price_zar_per_mwh: 1200,
    down_price_zar_per_mwh: 800,
  },
  environment: {
    seed: 'preview',
    actual_noise_pct: 5,
    groups: {
      pv: { blocks: 250, zone_distribution_pct: [50, 50] },
      wind: { blocks: 200, zone_distribution_pct: [50, 50] },
      hydro: { blocks: 100, zone_distribution_pct: [50, 50] },
      coal: { blocks: 300, zone_distribution_pct: [50, 50] },
      gas: { blocks: 150, zone_distribution_pct: [50, 50] },
      nuclear: { blocks: 0, zone_distribution_pct: [50, 50] },
    },
  },
  events: [],
  devices: [],
  challenges: [],
}

console.info('[KSE] Editor version', KSE_EDITOR_VERSION)

function Curves({ cfg, preview, groups, showSupply=true, showDemand=true, showSmp=true, svgRef }){
  // Step supply/demand preview with axes and legend
  const ref = svgRef ?? useRef(null)
  useEffect(() => {
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const M = { top: 16, right: 16, bottom: 28, left: 48 }
    const W = 360 - M.left - M.right
    const H = 180 - M.top - M.bottom
    const g = svg.attr('width', 360).attr('height', 180).append('g').attr('transform', `translate(${M.left},${M.top})`)

    const baseP = Number(cfg.market.base_price || 1000)
    const baseV = Number(cfg.market.base_volume_mwh || 20000)
    const previewSupplyCurve = Array.isArray(preview?.supply_curve)
      ? preview.supply_curve
          .map((step) => ({
            q: Number(step?.quantity ?? step?.q ?? 0),
            p: Number(step?.price ?? step?.p ?? 0),
          }))
          .filter((step) => Number.isFinite(step.q) && step.q > 0 && Number.isFinite(step.p))
      : []
    const previewDemandCurve = Array.isArray(preview?.demand_curve)
      ? preview.demand_curve
          .map((step) => ({
            q: Number(step?.quantity ?? step?.q ?? 0),
            p: Number(step?.price ?? step?.p ?? 0),
          }))
          .filter((step) => Number.isFinite(step.q) && step.q > 0 && Number.isFinite(step.p))
      : []
    const hasBackendCurves = previewSupplyCurve.length > 0 && previewDemandCurve.length > 0
    const mix = cfg?.environment?.groups || cfg?.market?.generator_mix || groups || { pv: 250, wind: 200, hydro: 100, coal: 300, gas: 150 }
    const distArr = Object.entries(mix).map(([type, entry]) => [type, getMixBlocks(entry, 0)])
    // Interpret generator_mix values as non-negative block counts per group
    const totalBlocksSupply = distArr.reduce((s, [, v]) => s + Math.max(0, Number(v) || 0), 0) || 1

    // Build block volumes by groups, then split into ~participants blocks
    const seedStr = cfg.environment?.seed || 'step'
    const seedNum = seedStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const rng = d3.randomLcg((seedNum % 2147483647) / 2147483647)

    // Jitter magnitudes
    const capJitter = Math.max(0, Math.min(0.5, Number(cfg?.market?.random_capacity_pct || 0) / 100))
    const priceJitter = Math.max(0, Math.min(0.5, Number(cfg?.market?.random_price_pct || 0) / 100))

    // Type-specific marginal cost ranges (ZAR/MWh)
    const COST = {
      pv: [0, 50],
      wind: [50, 150],
      hydro: [50, 200],
      nuclear: [200, 400],
      coal: [400, 700],
      gas: [700, 1200],
    }

    // Build SUPPLY blocks per type based on per-type block counts
    let sBlocks = []
    distArr.forEach(([type, pct]) => {
      const n = Math.max(0, Math.round(Number(pct || 0)))
      if (!n) return
      const vol = baseV * (Number(pct || 0) / totalBlocksSupply)
      const avg = vol / n
      const [pMin, pMax] = COST[type] || [baseP - 500, baseP + 500]
      for (let i = 0; i < n; i++) {
        const qJ = 1 + (rng() - 0.5) * 2 * capJitter
        const basePrice = pMin + rng() * (pMax - pMin)
        const pJ = 1 + (rng() - 0.5) * 2 * priceJitter
        sBlocks.push({ q: Math.max(0, avg * qJ), p: basePrice * pJ })
      }
    })
    // normalize volumes to baseV and clamp prices to floor/cap
    const sSum = sBlocks.reduce((s, b) => s + b.q, 0) || 1
    const floor = Number(cfg.market.price_floor ?? -Infinity)
    const cap = Number(cfg.market.price_cap ?? Infinity)
    sBlocks.forEach(b => { b.q = (b.q / sSum) * baseV; b.p = Math.min(cap, Math.max(floor, b.p)) })

    // Sort supply ascending by price
    const supply = hasBackendCurves
      ? [...previewSupplyCurve].sort((a, b) => a.p - b.p)
      : sBlocks.sort((a, b) => a.p - b.p)

    // Build DEMAND blocks by consumer mix with non-linear decreasing schedule and jitter
    const cmix = (cfg?.market?.consumer_mix) || { industrial: 400, household: 500, agriculture: 100 }
    const cArr = Object.entries(cmix).map(([type, entry]) => [type, getMixBlocks(entry, 0)])
    // Interpret consumer_mix values as non-negative block counts per group
    const totalBlocksDemand = cArr.reduce((s, [, v]) => s + Math.max(0, Number(v) || 0), 0) || 1
    let dBlocks = []
    cArr.forEach(([ctype, pct]) => {
      const n = Math.max(0, Math.round(Number(pct || 0)))
      if (!n) return
      const vol = baseV * (Number(pct || 0) / totalBlocksDemand)
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0
        // WTP base by segment, then apply non-linear shape and jitter
        let wtpBase = baseP + 400 - 800 * Math.pow(t, 2)
        if (ctype === 'industrial') wtpBase += 100
        if (ctype === 'agriculture') wtpBase -= 100
        const p = Math.min(cap, Math.max(floor, wtpBase * (1 + (rng() - 0.5) * 2 * priceJitter * 0.5)))
        const q = Math.max(0, (vol / n) * (1 + (rng() - 0.5) * 2 * capJitter))
        dBlocks.push({ q, p })
      }
    })
    // normalize demand volume to baseV and sort descending by price
    const dSum = dBlocks.reduce((s, b) => s + b.q, 0) || 1
    dBlocks.forEach(b => { b.q = (b.q / dSum) * baseV })
    const demand = hasBackendCurves
      ? [...previewDemandCurve].sort((a, b) => b.p - a.p)
      : dBlocks.sort((a, b) => b.p - a.p)

    // Build cumulative x (quantity) for step plot (price vs quantity)
    const cum = (arr) => {
      let acc = 0
      return arr.map(({ q, p }) => ({ x0: acc, x1: (acc += q), p }))
    }
    const sCum = cum(supply)
    const dCum = cum(demand)
    const xMax = Math.max(d3.sum(supply, (d) => d.q), d3.sum(demand, (d) => d.q)) || baseV

    const x = d3.scaleLinear().domain([0, xMax]).range([0, W]).clamp(true)
    // dynamic Y domain: scale to min/max of actual prices (with small padding)
    const allPrices = [...supply.map(d=>d.p), ...demand.map(d=>d.p)]
    if (!allPrices.length || !Number.isFinite(d3.min(allPrices)) || !Number.isFinite(d3.max(allPrices))) {
      g.append('text')
        .attr('x', W / 2)
        .attr('y', H / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .attr('font-size', 12)
        .text('No preview blocks configured')
      return
    }
    const minP = d3.min(allPrices)
    const maxP = d3.max(allPrices)
    const pad = (maxP - minP) * 0.05
    const y = d3.scaleLinear().domain([minP - pad, maxP + pad]).nice().range([H, 0]).clamp(true)

    // axes
    g.append('g').attr('transform', `translate(0,${H})`).call(d3.axisBottom(x).ticks(5))
    g.append('g').call(d3.axisLeft(y).ticks(5))
    g.append('text').attr('x', W / 2).attr('y', H + 24).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 10).text('Quantity (MWh)')
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -H / 2).attr('y', -36).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 10).text('Price (ZAR/MWh)')

    // step paths
    const toStep = (arr) => {
      const pts = []
      arr.forEach(({ x0, x1, p }, i) => {
        // horizontal segment from x0 to x1 at price p, then vertical to next price
        pts.push([x(x0), y(p)])
        pts.push([x(x1), y(p)])
      })
      return pts
    }
    const sPts = toStep(sCum)
    const dPts = toStep(dCum)

    if (showSupply) g.append('path').attr('d', d3.line()(sPts)).attr('fill', 'none').attr('stroke', '#2e7d32').attr('stroke-width', 2)
    if (showDemand) g.append('path').attr('d', d3.line()(dPts)).attr('fill', 'none').attr('stroke', '#c62828').attr('stroke-width', 2)

    // Compute SMP as intersection of supply and demand curves
    let smpVal = Number(preview?.smp)
    let smpQty = Number(preview?.volume)
    if (!Number.isFinite(smpQty)) smpQty = null
    
    // Find intersection point by scanning through cumulative curves
    if (showSmp && sCum.length > 0 && dCum.length > 0 && !hasBackendCurves) {
      // Convert to continuous functions for intersection search
      let sIdx = 0, dIdx = 0
      let foundIntersection = false
      
      // Step through quantity range looking for where supply price >= demand price
      const step = xMax / 1000
      for (let q = 0; q < xMax && !foundIntersection; q += step) {
        // Find supply price at quantity q
        while (sIdx < sCum.length - 1 && sCum[sIdx].x1 < q) sIdx++
        const sPrice = sCum[sIdx]?.p || 0
        
        // Find demand price at quantity q
        while (dIdx < dCum.length - 1 && dCum[dIdx].x1 < q) dIdx++
        const dPrice = dCum[dIdx]?.p || 0
        
        // Intersection occurs when supply crosses above demand
        if (sPrice >= dPrice) {
          smpVal = (sPrice + dPrice) / 2  // Average of the two prices at intersection
          smpQty = q
          foundIntersection = true
        }
      }
    }
    
    if (showSmp && !Number.isNaN(smpVal)) {
      const smpY = y(smpVal)
      const smpX = smpQty !== null ? x(smpQty) : W
      
      // Draw horizontal SMP line
      g.append('line')
        .attr('x1', 0)
        .attr('x2', W)
        .attr('y1', smpY)
        .attr('y2', smpY)
        .attr('stroke', '#1976d2')
        .attr('stroke-dasharray', '4 4')
      
      // Draw vertical line at intersection point if found
      if (smpQty !== null) {
        g.append('line')
          .attr('x1', smpX)
          .attr('x2', smpX)
          .attr('y1', 0)
          .attr('y2', H)
          .attr('stroke', '#1976d2')
          .attr('stroke-dasharray', '2 2')
          .attr('opacity', 0.5)
        
        // Highlight intersection point
        g.append('circle')
          .attr('cx', smpX)
          .attr('cy', smpY)
          .attr('r', 4)
          .attr('fill', '#1976d2')
      }
      
      g.append('text')
        .attr('x', W - 4)
        .attr('y', smpY - 4)
        .attr('text-anchor', 'end')
        .attr('fill', '#1976d2')
        .attr('font-size', 10)
        .text(`SMP ${smpVal.toFixed(1)}`)
    }

    // Legend
    const legend = svg.append('g').attr('transform', `translate(${M.left + 4},${M.top + 4})`)
    legend.append('rect').attr('x', 0).attr('y', 0).attr('width', 10).attr('height', 10).attr('fill', showSupply ? '#2e7d32' : '#ccc')
    legend.append('text').attr('x', 14).attr('y', 9).attr('font-size', 10).attr('fill', '#333').text('Supply')
    legend.append('rect').attr('x', 70).attr('y', 0).attr('width', 10).attr('height', 10).attr('fill', showDemand ? '#c62828' : '#ccc')
    legend.append('text').attr('x', 84).attr('y', 9).attr('font-size', 10).attr('fill', '#333').text('Demand')
    legend.append('line').attr('x1', 140).attr('x2', 150).attr('y1', 5).attr('y2', 5).attr('stroke', showSmp ? '#1976d2' : '#ccc').attr('stroke-dasharray', '4 4')
    legend.append('text').attr('x', 156).attr('y', 9).attr('font-size', 10).attr('fill', '#333').text('SMP')
  }, [cfg, preview, groups])

  return <svg ref={ref} width={360} height={180} style={{ border: '1px solid #ddd', cursor:'pointer' }} onClick={()=> ref.current && exportPNG(ref.current, 'kse_step.png')} />
}

export default function KSE(){
  const [sp] = useSearchParams()
  const user = useAuth((state) => state.user)
  const scenarioParam = sp.get('id')
  const [tab, setTab] = useState(0)
  const [name, setName] = useState('New Scenario')
  const [cfg, setCfg] = useState(normalizeScenarioConfig(defaultConfig))
  const [scenarioId, setScenarioId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [errors, setErrors] = useState([])
  const [importText, setImportText] = useState('')
  const [hPrev, setHPrev] = useState(null)
  const [previewDate, setPreviewDate] = useState('2025-01-15') // Preview date for seasonal variation
  const [previewTime, setPreviewTime] = useState('00:00') // Preview start time
  const [showHourlyPoints, setShowHourlyPoints] = useState(false)
  const [showHourlyGrid, setShowHourlyGrid] = useState(false)
  // Compute hours from config instead of state
  const hours = Number(cfg?.general?.forecast_horizon_hours) || 24
  const smpRef = useRef(null)
  const volRef = useRef(null)
  const syntheticTransferPreview = useMemo(() => computeSyntheticTransferPreview(cfg), [cfg])
  // generator mix now stored in cfg.market.generator_mix
  const [zoneSplit, setZoneSplit] = useState(50)
  const [envGen, setEnvGen] = useState(null)
  const [deviceTypes, setDeviceTypes] = useState([])
  const [atcEditorOpen, setAtcEditorOpen] = useState(false)
  const [expandedDevice, setExpandedDevice] = useState(null)
  const [presetMenu, setPresetMenu] = useState(null)
  const [eventEditorOpen, setEventEditorOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [editingEventIndex, setEditingEventIndex] = useState(null)
  // Challenge editor
  const [challengeEditorOpen, setChallengeEditorOpen] = useState(false)
  const [editingChallenge, setEditingChallenge] = useState(null)
  const [editingChallengeIndex, setEditingChallengeIndex] = useState(null)
  // Template dialog
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  // Profile Editor Modal
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [profileEditorType, setProfileEditorType] = useState('') // 'pv', 'wind', 'industrial', etc.
  const [profileEditorTitle, setProfileEditorTitle] = useState('')
  const [profileEditorCurrent, setProfileEditorCurrent] = useState(null)
  const [profileEditorPath, setProfileEditorPath] = useState([]) // path in config object
  const [profileEditorKind, setProfileEditorKind] = useState('generator')
  // Modals (IO + Description)
  const [ioOpen, setIoOpen] = useState(false)
  const [ioTab, setIoTab] = useState(0)
  const [descOpen, setDescOpen] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [descMode, setDescMode] = useState('edit') // 'edit' | 'preview'
  const [descImgWidth, setDescImgWidth] = useState('100%') // default width for pasted images
  const [descImgHeight, setDescImgHeight] = useState('') // optional height for pasted images
  // Step chart toggles + ref
  const [showSupply, setShowSupply] = useState(true)
  const [showDemand, setShowDemand] = useState(true)
  const [showSmp, setShowSmp] = useState(true)
  const stepRef = useRef(null)
  const descInputRef = useRef(null)
  // Refs for validation scroll
  const refZones = useRef(null)
  const refForecastH = useRef(null)
  const refHorizon = useRef(null)
  const refRoundSpan = useRef(null)
  const refRounds = useRef(null)
  const refWeights = useRef(null)
  const refDescName = useRef(null)
  const refHours = useRef(null)
  const refAddEvent = useRef(null)
  const refAddPlayerType = useRef(null)
  // Debounce/abort for previews
  const previewTimer = useRef(null)
  const hourlyTimer = useRef(null)
  const previewController = useRef(null)
  const hourlyController = useRef(null)

  useEffect(()=>{
    // Load device types on mount
    api.get('/api/kse/device-types').then(res=> setDeviceTypes(res.data)).catch(()=>{})
    // Load existing scenario if id is provided
    if (scenarioParam) {
      const id = Number(scenarioParam)
      if (id>0) {
        api.get(`/api/kse/scenarios/${id}`).then(({data})=>{
          setScenarioId(id)
          setName(data.name || `Scenario ${id}`)
          setCfg(normalizeScenarioConfig(data.config || defaultConfig))
        }).catch(()=>{})
      }
    }
  },[])

  useEffect(() => {
    setCfg((prev) => normalizeScenarioConfig(prev))
  }, [cfg?.grid?.zones])

  // URL hash ↔ tab sync for deep-linking and back/forward
  useEffect(()=>{
    const map = ['#kse-desc','#kse-general','#kse-market','#kse-grid','#kse-events','#kse-ptypes','#kse-challenges']
    const applyHash = ()=>{
      const h = window.location.hash
      const idx = map.indexOf(h)
      if (idx >= 0) setTab(idx)
    }
    // on mount
    applyHash()
    // on hash change
    const onHash = ()=> applyHash()
    window.addEventListener('hashchange', onHash)
    return ()=> window.removeEventListener('hashchange', onHash)
  },[])

  useEffect(()=>{
    const map = ['#kse-desc','#kse-general','#kse-market','#kse-grid','#kse-events','#kse-ptypes','#kse-challenges']
    const h = map[tab]
    if (h) {
      try { window.history.replaceState(null, '', h) } catch(_) {}
    }
  }, [tab])

  const update = (path, value)=>{
    setCfg(prev=>{
      const next = structuredClone(prev)
      let node = next
      for(let i=0;i<path.length-1;i++){
        const key = path[i]
        if (node[key] == null || typeof node[key] !== 'object') node[key] = {}
        node = node[key]
      }
      node[path[path.length-1]] = value
      return next
    })
  }

  const openProfileEditor = (type, title, currentHourlyProfile, currentSeasonalProfile, currentZonalDistribution, savePath, kind = 'generator') => {
    setProfileEditorType(type)
    setProfileEditorTitle(title)
    setProfileEditorCurrent({ hourly: currentHourlyProfile, seasonal: currentSeasonalProfile, zonal: currentZonalDistribution })
    setProfileEditorPath(savePath)
    setProfileEditorKind(kind)
    setProfileEditorOpen(true)
  }

  const handleProfileSave = (profiles) => {
    // Save both hourly and seasonal profiles to generator_mix or consumer_mix
    const current = profileEditorPath.reduce((obj, key) => obj?.[key], cfg)
    const baseValue = (typeof current === 'object' && current !== null && !Array.isArray(current))
      ? current
      : { blocks: current || 0 }
    const updatedValue = {
      ...baseValue,
      profile: profiles.hourly,
      seasonal_profile: profiles.seasonal,
      zone_distribution_pct: profiles.zonal,
    }

    if (profileEditorKind === 'generator') {
      const generatorType = profileEditorPath[profileEditorPath.length - 1]
      const currentEnv = normalizeMixEntry(cfg.environment.groups?.[generatorType], cfg.grid.zones)
      update(profileEditorPath, updatedValue)
      update(['environment', 'groups', generatorType], {
        ...currentEnv,
        blocks: updatedValue.blocks,
        profile: profiles.hourly,
        seasonal_profile: profiles.seasonal,
        zone_distribution_pct: profiles.zonal,
      })
    } else {
      update(profileEditorPath, updatedValue)
    }
    setProfileEditorOpen(false)
  }

  const getGeneratorMixValue = (type) => {
    const val = cfg.market.generator_mix?.[type]
    if (typeof val === 'object') return val.blocks || 0
    return val || 0
  }

  const getGeneratorMixProfile = (type) => {
    const val = cfg.market.generator_mix?.[type]
    if (typeof val === 'object') return val.profile
    return null
  }

  const getGeneratorMixSeasonalProfile = (type) => {
    const val = cfg.market.generator_mix?.[type]
    if (typeof val === 'object') return val.seasonal_profile
    return null
  }

  const setGeneratorMixBlocks = (type, blocks) => {
    const currentMarket = normalizeMixEntry(cfg.market.generator_mix?.[type], cfg.grid.zones)
    const currentEnv = normalizeMixEntry(cfg.environment.groups?.[type], cfg.grid.zones)
    update(['market', 'generator_mix', type], { ...currentMarket, blocks })
    update(['environment', 'groups', type], { ...currentEnv, blocks })
  }

  const getGeneratorZoneDistribution = (type) => {
    const val = cfg.environment.groups?.[type] || cfg.market.generator_mix?.[type]
    return normalizeMixEntry(val, cfg.grid.zones).zone_distribution_pct
  }

  const setGeneratorZoneDistribution = (type, distribution) => {
    const currentMarket = normalizeMixEntry(cfg.market.generator_mix?.[type], cfg.grid.zones)
    const currentEnv = normalizeMixEntry(cfg.environment.groups?.[type], cfg.grid.zones)
    update(['market', 'generator_mix', type], { ...currentMarket, zone_distribution_pct: distribution })
    update(['environment', 'groups', type], { ...currentEnv, zone_distribution_pct: distribution })
  }

  const getConsumerMixValue = (type) => {
    const val = cfg.market.consumer_mix?.[type]
    if (typeof val === 'object') return val.blocks || 0
    return val || 0
  }

  const getConsumerMixProfile = (type) => {
    const val = cfg.market.consumer_mix?.[type]
    if (typeof val === 'object') return val.profile
    return null
  }

  const getConsumerMixSeasonalProfile = (type) => {
    const val = cfg.market.consumer_mix?.[type]
    if (typeof val === 'object') return val.seasonal_profile
    return null
  }

  const setConsumerMixBlocks = (type, blocks) => {
    const current = cfg.market.consumer_mix?.[type]
    if (typeof current === 'object') {
      update(['market', 'consumer_mix', type], { ...current, blocks })
    } else {
      update(['market', 'consumer_mix', type], blocks)
    }
  }

  const getConsumerZoneDistribution = (type) => {
    const val = cfg.market.consumer_mix?.[type]
    return normalizeMixEntry(val, cfg.grid.zones).zone_distribution_pct
  }

  const setConsumerZoneDistribution = (type, distribution) => {
    const current = normalizeMixEntry(cfg.market.consumer_mix?.[type], cfg.grid.zones)
    update(['market', 'consumer_mix', type], { ...current, zone_distribution_pct: distribution })
  }

  const validate = ()=>{
    const errs = []
    const zones = cfg.grid.zones
    if(zones<1 || zones>5) errs.push('Zones must be 1–5')
    const validateDistribution = (label, distribution) => {
      if (!Array.isArray(distribution) || distribution.length !== Number(zones)) {
        errs.push(`${label} must define ${zones} zone values`)
        return
      }
      const values = distribution.map((value) => Number(value))
      if (values.some((value) => !Number.isFinite(value) || value < 0)) {
        errs.push(`${label} must contain non-negative numeric values`)
      }
      const sum = values.reduce((acc, value) => acc + value, 0)
      if (Math.abs(sum - 100) > 1e-6) errs.push(`${label} must sum to 100`)
    }
    ;['pv','wind','hydro','coal','gas','nuclear'].forEach((type) => validateDistribution(`environment.groups.${type}.zone_distribution_pct`, getGeneratorZoneDistribution(type)))
    ;['industrial','household','agriculture'].forEach((type) => validateDistribution(`market.consumer_mix.${type}.zone_distribution_pct`, getConsumerZoneDistribution(type)))
    const settlement = cfg?.grid?.network_settlement || {}
    if (!['zonal_only'].includes(String(settlement.extra_cost_mode || 'zonal_only'))) {
      errs.push('grid.network_settlement.extra_cost_mode invalid')
    }
    if (!['consumers_only'].includes(String(settlement.cost_allocation_target || 'consumers_only'))) {
      errs.push('grid.network_settlement.cost_allocation_target invalid')
    }
    if (!['fixed_price', 'smp_multiplier', 'value_of_lost_load'].includes(String(settlement.shortfall_price_mode || 'smp_multiplier'))) {
      errs.push('grid.network_settlement.shortfall_price_mode invalid')
    }
    if (!(Number(settlement.shortfall_price_value) > 0)) errs.push('grid.network_settlement.shortfall_price_value must be > 0')
    if (!['pro_rata', 'reverse_merit_order', 'renewables_first', 'renewables_last'].includes(String(cfg?.grid?.generator_curtailment_mode || 'pro_rata'))) {
      errs.push('grid.generator_curtailment_mode invalid')
    }
    if (!(Number(cfg?.grid?.losses_pct_per_link ?? 2) >= 0 && Number(cfg?.grid?.losses_pct_per_link ?? 2) <= 100)) {
      errs.push('grid.losses_pct_per_link must be within [0, 100]')
    }
    if (!(Number(cfg?.balancing?.up_price_zar_per_mwh ?? 1200) > 0)) errs.push('balancing.up_price_zar_per_mwh must be > 0')
    if (!(Number(cfg?.balancing?.down_price_zar_per_mwh ?? 800) > 0)) errs.push('balancing.down_price_zar_per_mwh must be > 0')
    if(!cfg.general.forecast_horizon_hours || cfg.general.forecast_horizon_hours<=0) errs.push('forecast_horizon_hours must be > 0')
    if(cfg.general.forecast_horizon_hours && cfg.general.horizon_hours && Number(cfg.general.forecast_horizon_hours) < Number(cfg.general.horizon_hours)) errs.push('forecast_horizon_hours must be >= horizon_hours')
    // Removed scoring.weights validation (replaced by challenges)
    const h = cfg.general.horizon_hours, sp = cfg.general.round_span_hours, r = cfg.general.rounds
    if(sp<=0 || Math.floor(h/sp)!==r) errs.push('horizon ÷ round_span must equal rounds')
    const inputMode = String(cfg?.player_input?.mode || 'all_hours')
    const customOffsets = Array.isArray(cfg?.player_input?.editable_offsets) ? cfg.player_input.editable_offsets : []
    if (inputMode === 'custom_offsets') {
      if (customOffsets.length === 0) errs.push('player_input.editable_offsets must contain at least one hour for custom scope')
      customOffsets.forEach((offset) => {
        const normalized = Number(offset)
        if (!Number.isInteger(normalized) || normalized < 0 || normalized >= Number(sp || 0)) {
          errs.push('player_input.editable_offsets must be integers within round_span_hours')
        }
      })
    }
    if (Number(zones) > 1) {
      const playerTypes = Array.isArray(cfg.player_types) ? cfg.player_types : []
      const missingZones = playerTypes.filter((pt) => pt?.devices?.length && (pt?.zone == null || pt?.zone === ''))
      if (missingZones.length > 0 && (cfg?.general?.player_zone == null || cfg?.general?.player_zone === '')) {
        errs.push('Multi-zone scenarios require player type zones or legacy player zone')
      }
      playerTypes.forEach((pt) => {
        if (pt?.zone != null && pt?.zone !== '' && (Number(pt.zone) < 1 || Number(pt.zone) > Number(zones))) {
          errs.push(`player type ${pt.name || pt.id} zone must be within 1..zones`)
        }
      })
    }
    setErrors(errs)
    return errs.length===0
  }

  useEffect(()=>{ validate() },[cfg])
  
  // Fetch templates when dialog opens
  useEffect(()=>{
    if (templateDialogOpen) {
      api.get('/api/kse/templates')
        .then(({data})=> setTemplates(Array.isArray(data)? data : []))
        .catch(()=> setTemplates([]))
    }
  }, [templateDialogOpen])

  const doPreviewNow = async ()=>{
    if(!validate()) return
    try{
      if (previewController.current) previewController.current.abort()
      const controller = new AbortController()
      previewController.current = controller
      const { data } = await api.post('/api/engine/preview', { 
        config: cfg, 
        round: 1,
        preview_date: previewDate,
        preview_time: previewTime
      }, { signal: controller.signal })
      setPreview(data)
    }catch(err){ /* aborted or failed */ }
  }
  const doPreview = ()=>{
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(doPreviewNow, 300)
  }

  const save = async ()=>{
    try {
      if(!validate()) return
      // ensure schema version on save
      if (!cfg.version) {
        setCfg(prev => ({ ...prev, version: '1.0.0' }))
      }
      // ensure horizon stays consistent on save
      try {
        setCfg(prev => {
          const n = structuredClone(prev)
          const r = Number(n?.general?.rounds || 0)
          const sp = Number(n?.general?.round_span_hours || 0)
          if (r > 0 && sp > 0) n.general.horizon_hours = r * sp
          return n
        })
      } catch(_) {}
      // Normalize player type IDs (required by backend)
      const norm = normalizeScenarioConfig(cfg)
      // Trading-only market config: drop deprecated clearing arrays
      try {
        const markets = norm.markets || {}
        const sanitizeMarketEntry = (entry) => {
          if (Array.isArray(entry)) {
            return { trading: [...entry] }
          }
          if (entry && typeof entry === 'object') {
            const trading = Array.isArray(entry.trading)
              ? [...entry.trading]
              : (Array.isArray(entry.clearing) ? [...entry.clearing] : [])
            return { trading }
          }
          return { trading: [] }
        }
        norm.markets = {
          dam: sanitizeMarketEntry(markets.dam),
          idm: sanitizeMarketEntry(markets.idm)
        }
      } catch (_) { /* ignore */ }
      try {
        const roundSpan = Number(norm?.general?.round_span_hours || 6)
        const playerInput = norm.player_input || {}
        const rawMode = String(playerInput.mode || 'all_hours').trim().toLowerCase()
        const allowedModes = new Set(['all_hours', 'first_hour', 'first_two_hours', 'first_three_hours', 'custom_offsets'])
        const mode = allowedModes.has(rawMode) ? rawMode : 'all_hours'
        const editableOffsets = Array.isArray(playerInput.editable_offsets)
          ? [...new Set(playerInput.editable_offsets
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value) && value >= 0 && value < roundSpan)
            )].sort((a, b) => a - b)
          : []
        norm.player_input = {
          mode,
          editable_offsets: editableOffsets,
          hide_non_editable_hours: Boolean(playerInput.hide_non_editable_hours),
          allow_other_rounds_editing: playerInput.allow_other_rounds_editing !== false,
          enable_smooth_drag: playerInput.enable_smooth_drag !== false
        }
      } catch (_) { /* ignore */ }
      // Convert frontend device shape -> backend schema
      try{
        if (Array.isArray(norm.devices)){
          norm.devices = norm.devices.map(d => {
            const t = (d.type||'').toLowerCase()
            const out = { ...d, type: t }
            if (out.co2_emissions_kg_per_mwh == null && out.co2_kg_per_mwh != null) {
              out.co2_emissions_kg_per_mwh = out.co2_kg_per_mwh
            }
            if ([ 'coal','gas','hydro','nuclear' ].includes(t)){
              out.max_power_mw = out.max_power_mw ?? out.capacity_mw ?? 0
              out.variable_cost_zar_per_mwh = out.variable_cost_zar_per_mwh ?? out.cost_per_mwh_zar ?? 0
              out.fixed_cost_zar_per_hour = out.fixed_cost_zar_per_hour ?? 0
              if (out.min_load_pct == null) out.min_load_pct = 0
              if (out.ramp_rate_mw_per_min == null) out.ramp_rate_mw_per_min = 60
            } else if ([ 'solar','wind' ].includes(t)){
              out.max_power_mw = out.max_power_mw ?? out.capacity_mw ?? 0
              out.variable_cost_zar_per_mwh = out.variable_cost_zar_per_mwh ?? out.cost_per_mwh_zar ?? 0
              out.fixed_cost_zar_per_hour = out.fixed_cost_zar_per_hour ?? 0
              if (out.capacity_factor_pct == null) out.capacity_factor_pct = 30
            } else if (t === 'battery'){
              out.capacity_mwh = out.capacity_mwh ?? out.capacity_mw ?? 100
              out.power_mw = out.power_mw ?? out.power_rating_mw ?? 50
              out.efficiency_pct = out.efficiency_pct ?? 85
              out.initial_soc_pct = out.initial_soc_pct ?? 50
              out.fixed_cost_zar_per_hour = out.fixed_cost_zar_per_hour ?? 0
            } else if (t.endsWith('_load')){
              // baseline_load_mw / peak_load_mw already present from UI
              out.fixed_cost_zar_per_hour = out.fixed_cost_zar_per_hour ?? 0
            }
            return out
          })
        }
      }catch(_){ /* ignore */ }
      try{
        const seen = new Set()
        if (Array.isArray(norm.player_types)){
          norm.player_types = norm.player_types.map((pt)=>{
            let id = (pt.id||'').trim()
            if(!id){
              id = `ptype_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`
            }
            // ensure unique
            while(seen.has(id)){
              id = `ptype_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`
            }
            seen.add(id)
            return { ...pt, id }
          })
        }
      }catch(_){ /* ignore */ }
      if (scenarioId) {
        await api.put(`/api/kse/scenarios/${scenarioId}`, { name, config: norm })
        alert('Saved changes')
      } else {
        const { data } = await api.post('/api/kse/scenarios', { name, config: norm })
        setScenarioId(data?.id)
        alert(`Saved as #${data?.id || ''}`)
      }
    } catch (err) {
      console.error('Save error:', err)
      const errData = err?.response?.data
      if (errData?.errors && Array.isArray(errData.errors)) {
        alert(`Validation errors:\\n${errData.errors.join('\\n')}`)
      } else {
        alert(`Save failed: ${err?.response?.data?.message || err?.message || 'Unknown error'}`)
      }
    }
  }

  const drawHourly = (data)=>{
    const h = data?.hours || 0
    // create or reuse a floating tooltip div for charts
    const tipSel = d3.select('body').select('div.emsg-chart-tip')
    const tooltip = tipSel.empty() ? d3.select('body').append('div').attr('class','emsg-chart-tip') : tipSel
    tooltip
      .style('position','absolute')
      .style('pointer-events','none')
      .style('background','#111')
      .style('color','#fff')
      .style('padding','4px 8px')
      .style('border-radius','4px')
      .style('font-size','12px')
      .style('display','none')
      .style('z-index','9999')
    // SMP
    if(smpRef.current && data?.smp){
      const svg = d3.select(smpRef.current); svg.selectAll('*').remove()
      const M = {top:10,right:10,bottom:24,left:40}, W=360-M.left-M.right, H=120-M.top-M.bottom
  const g = svg.attr('width', 360).attr('height', 120).append('g').attr('transform',`translate(${M.left},${M.top})`)
      const x = d3.scaleLinear().domain([1, h||1]).range([0,W])
      const y = d3.scaleLinear().domain([d3.min(data.smp)||0, d3.max(data.smp)||1]).nice().range([H,0])
      const line = d3.line().x((_,i)=> x(i+1)).y((d)=> y(d))
  // gridlines
  if (showHourlyGrid) {
    g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat('')).selectAll('line').attr('stroke','#ddd').attr('stroke-opacity',0.6)
  }
      g.append('path').datum(data.smp).attr('fill','none').attr('stroke','#2e7d32').attr('stroke-width',2).attr('d', line)
  g.append('g').attr('transform',`translate(0,${H})`).call(d3.axisBottom(x).ticks(Math.min(h,12)))
  g.append('g').call(d3.axisLeft(y).ticks(4))
      // points + tooltips
      if (showHourlyPoints) {
        g.selectAll('circle.point')
          .data((data.smp||[]).map((v,i)=> ({ x:i+1, y:v })))
          .enter()
          .append('circle')
          .attr('class','point')
          .attr('cx', d=> x(d.x))
          .attr('cy', d=> y(d.y))
          .attr('r', 2.5)
          .attr('fill', '#2e7d32')
          .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`h${d.x}: ${d.y} ZAR/MWh`) })
          .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
          .on('mouseleave', ()=> { tooltip.style('display','none') })
      }
  // axis labels
  g.append('text').attr('x', W/2).attr('y', H+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Hour')
  g.append('text').attr('transform','rotate(-90)').attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('SMP (ZAR/MWh)')
    }
    // Volume
    if(volRef.current && data?.volume){
      const svg = d3.select(volRef.current); svg.selectAll('*').remove()
      const M = {top:10,right:10,bottom:24,left:40}, W=360-M.left-M.right, H=120-M.top-M.bottom
  const g = svg.attr('width', 360).attr('height', 120).append('g').attr('transform',`translate(${M.left},${M.top})`)
      const x = d3.scaleLinear().domain([1, h||1]).range([0,W])
      const y = d3.scaleLinear().domain([0, d3.max(data.volume)||1]).nice().range([H,0])
      const line = d3.line().x((_,i)=> x(i+1)).y((d)=> y(d))
  // gridlines
  if (showHourlyGrid) {
    g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat('')).selectAll('line').attr('stroke','#ddd').attr('stroke-opacity',0.6)
  }
      g.append('path').datum(data.volume).attr('fill','none').attr('stroke','#1976d2').attr('stroke-width',2).attr('d', line)
  g.append('g').attr('transform',`translate(0,${H})`).call(d3.axisBottom(x).ticks(Math.min(h,12)))
  g.append('g').call(d3.axisLeft(y).ticks(4))
      // points + tooltips
      if (showHourlyPoints) {
        g.selectAll('circle.point')
          .data((data.volume||[]).map((v,i)=> ({ x:i+1, y:v })))
          .enter()
          .append('circle')
          .attr('class','point')
          .attr('cx', d=> x(d.x))
          .attr('cy', d=> y(d.y))
          .attr('r', 2.5)
          .attr('fill', '#1976d2')
          .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`h${d.x}: ${d.y} MWh`) })
          .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
          .on('mouseleave', ()=> { tooltip.style('display','none') })
      }
  // axis labels
  g.append('text').attr('x', W/2).attr('y', H+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Hour')
  g.append('text').attr('transform','rotate(-90)').attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Volume (MWh)')
    }
  }

  const doHourlyNow = async ()=>{
    if(!validate()) return
    try{
      if (hourlyController.current) hourlyController.current.abort()
      const controller = new AbortController()
      hourlyController.current = controller
      const { data } = await api.post('/api/engine/preview/hourly', { 
        config: cfg, 
        hours: hours,
        preview_date: previewDate,
        preview_time: previewTime
      }, { signal: controller.signal })
      setHPrev(data)
      drawHourly(data)
    }catch(err){ /* aborted or failed */ }
  }
  const doHourly = ()=>{
    if (hourlyTimer.current) clearTimeout(hourlyTimer.current)
    hourlyTimer.current = setTimeout(doHourlyNow, 300)
  }

  // Auto update previews when Market tab is active and relevant inputs change
  useEffect(()=>{
    if (tab===2) doPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, cfg, previewDate, previewTime])

  useEffect(()=>{
    if (tab===2) doHourly()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, cfg, previewDate, previewTime])

  const onValidationSelect = (_idx, text)=>{
    const map = [
      { match: 'Zones must be 1–5', el: refZones, tab: 3 },
      { match: 'forecast_horizon_hours must be > 0', el: refForecastH, tab: 1 },
      { match: 'forecast_horizon_hours must be >= horizon_hours', el: refForecastH, tab: 1 },
      // Removed scoring weights validation (replaced by challenges)
      { match: 'horizon ÷ round_span must equal rounds', el: refRoundSpan, tab: 1 },
    ]
    const m = map.find(m => text.includes(m.match))
    if (m) {
      setTab(m.tab)
      setTimeout(()=> m.el.current && m.el.current.scrollIntoView({ behavior:'smooth', block:'center' }), 50)
    }
  }

  // Focus management on tab change
  useEffect(()=>{
    const focusEl = (elRef)=> { try { elRef?.current && elRef.current.focus() } catch(_) {} }
    switch(tab){
      case 0: focusEl(refDescName); break
      case 1: focusEl(refHorizon); break
      case 2: focusEl(refHours); break
      case 3: focusEl(refZones); break
      case 4: focusEl(refAddEvent); break
      case 5: focusEl(refAddPlayerType); break
      // case 6: Challenges tab - no specific focus element
      default: break
    }
  }, [tab])

  const exportCurrentConfig = ()=>{
    const data = { name, config: cfg }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `scenario_${scenarioId || 'draft'}.json`; a.click(); URL.revokeObjectURL(url)
  }

  const doImport = async ()=>{
    try{
      const json = JSON.parse(importText)
      const incomingVersion = json?.config?.version || '0.0.0'
      const currentVersion = cfg?.version || '1.0.0'
      if (incomingVersion !== currentVersion) {
        const proceed = confirm(`Config version (${incomingVersion}) differs from current (${currentVersion}). Proceed?`)
        if (!proceed) return
      }
      const { data } = await api.post('/api/kse/scenarios/import', json)
      alert(`Imported as #${data.id}` )
      setScenarioId(data.id)
      setName(data.name || name)
      setCfg(data.config || cfg)
      setImportText('')
      setIoOpen(false)
    }catch(e){ alert('Invalid JSON') }
  }

  return (
    <Stack spacing={2}>
      {/* Header + Toolbar (right aligned) */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">KSE – Scenario Editor</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="outlined" onClick={()=> setIoOpen(true)}>Import/Export</Button>
          <Button variant="contained" onClick={save} disabled={errors.length>0}>Save</Button>
        </Stack>
      </Stack>
      <Paper sx={{ p:2 }}>
        <Tabs 
          value={tab} 
          onChange={(_,v)=>setTab(v)} 
          variant="scrollable"
          role="tablist"
          aria-label="KSE scenario editor sections"
        >
          <Tab id="kse-tab-0" aria-controls="kse-panel-0" label="Description" role="tab" aria-selected={tab===0} />
          <Tab id="kse-tab-1" aria-controls="kse-panel-1" label="General" role="tab" aria-selected={tab===1} />
          <Tab id="kse-tab-2" aria-controls="kse-panel-2" label="Supply and Demand" role="tab" aria-selected={tab===2} />
          <Tab id="kse-tab-3" aria-controls="kse-panel-3" label="Markets" role="tab" aria-selected={tab===3} />
          <Tab id="kse-tab-4" aria-controls="kse-panel-4" label="Grid" role="tab" aria-selected={tab===4} />
          <Tab id="kse-tab-5" aria-controls="kse-panel-5" label="Events" role="tab" aria-selected={tab===5} />
          <Tab id="kse-tab-6" aria-controls="kse-panel-6" label="Player Types" role="tab" aria-selected={tab===6} />
          <Tab id="kse-tab-7" aria-controls="kse-panel-7" label="Challenges" role="tab" aria-selected={tab===7} />
        </Tabs>
        <Stack direction="row" spacing={2} sx={{ mt:2 }}>
          <Box sx={{ flex: 1 }}>
          {tab===1 && (()=>{
            const rounds = Number(cfg.general.rounds || 0)
            const span = Number(cfg.general.round_span_hours || 0)
            const computedH = rounds > 0 && span > 0 ? rounds * span : 0
            const setRounds = (val)=>{
              setCfg(prev=>{
                const n = structuredClone(prev)
                n.general.rounds = val
                const sp = Number(n.general.round_span_hours || 0)
                n.general.horizon_hours = val>0 && sp>0 ? val*sp : 0
                return n
              })
            }
            const setSpan = (val)=>{
              setCfg(prev=>{
                const n = structuredClone(prev)
                n.general.round_span_hours = val
                const r = Number(n.general.rounds || 0)
                n.general.horizon_hours = r>0 && val>0 ? r*val : 0
                return n
              })
            }
            const fhErr = !(cfg.general.forecast_horizon_hours>0) || (Number(cfg.general.forecast_horizon_hours) < computedH)
            return (
              <Stack id="kse-panel-1" role="tabpanel" aria-labelledby="kse-tab-1" spacing={2}>
                {/* Round Timings group */}
                <Paper sx={{ p:2 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Round Timings</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Set the fictional date/time and the number/length of rounds. Scenario Horizon is computed as Rounds × Round span.
                  </Typography>
                  <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
                    <Box sx={{ flex: '1 1 220px', minWidth: 220 }}>
                      <NumberInput
                        label="Rounds"
                        value={cfg.general.rounds}
                        onChange={setRounds}
                        min={1}
                        max={48}
                        step={1}
                        tooltip="Total rounds in the scenario."
                        inputRef={refRounds}
                      />
                    </Box>
                    <Box sx={{ flex: '1 1 240px', minWidth: 240 }}>
                      <NumberInput
                        label="Round span (h)"
                        value={cfg.general.round_span_hours}
                        onChange={setSpan}
                        min={1}
                        max={24}
                        step={1}
                        unit="h"
                        tooltip="Simulated hours per round."
                        inputRef={refRoundSpan}
                      />
                    </Box>
                    <Box sx={{ flex: '1 1 240px', minWidth: 240 }}>
                      <NumberInput
                        label="Round duration (s)"
                        value={cfg.general.round_duration_seconds ?? 300}
                        onChange={(val)=>update(['general','round_duration_seconds'], val)}
                        min={30}
                        max={1800}
                        step={30}
                        unit="s"
                        tooltip="Real-world seconds per round (default: 300s = 5min)."
                      />
                    </Box>
                    <Box sx={{ flex: '1 1 260px', minWidth: 260 }}>
                      <TextField
                        label="Scenario Horizon (h)"
                        value={computedH}
                        size="small"
                        disabled
                        fullWidth
                        InputLabelProps={{ shrink: true, sx: { whiteSpace: 'normal', lineHeight: 1.2 } }}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">h</InputAdornment>
                          )
                        }}
                        inputRef={refHorizon}
                      />
                    </Box>
                  </Stack>
                </Paper>
                {/* Player Settings group */}
                <Paper sx={{ p:2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Player Settings</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Configure the player interface: fictional date/time, baseline generation, and forecast horizon.
                  </Typography>
                  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                    <TextField
                      type="date"
                      label="Fictional Date"
                      value={cfg.general.fake_date || ''}
                      onChange={e=>update(['general','fake_date'], e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      size="small"
                      sx={{ flex: '1 1 220px', minWidth: 220 }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip title="Contextual date for briefings and charts. Not used in simulation." arrow>
                              <IconButton size="small" tabIndex={-1} aria-label="help">
                                <VisibilityIcon fontSize="small"/>
                              </IconButton>
                            </Tooltip>
                          </InputAdornment>
                        )
                      }}
                    />
                    <TextField
                      type="time"
                      label="Fictional Start Time"
                      value={cfg.general.start_time || ''}
                      onChange={e=>update(['general','start_time'], e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      size="small"
                      sx={{ flex: '1 1 200px', minWidth: 200 }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip title="Fictional clock time of hour 1; used for labels." arrow>
                              <IconButton size="small" tabIndex={-1} aria-label="help">
                                <VisibilityIcon fontSize="small"/>
                              </IconButton>
                            </Tooltip>
                          </InputAdornment>
                        )
                      }}
                    />
                    <Box sx={{ flex: '1 1 240px', minWidth: 240 }}>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        label="Day 1 Baseline"
                        value={cfg.general.day_one_baseline_mode ?? 'preset'}
                        onChange={(e)=>update(['general','day_one_baseline_mode'], e.target.value)}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <Tooltip title="Day 1 position: 'zero' = no DA trading (0 MW), 'preset' = auto-generated position (locked), 'edit_round_one' = players edit Day 1 in Round 1 (DAM opens)" arrow>
                                <IconButton size="small" tabIndex={-1} aria-label="help">
                                  <VisibilityIcon fontSize="small"/>
                                </IconButton>
                              </Tooltip>
                            </InputAdornment>
                          )
                        }}
                      >
                        <MenuItem value="zero">Zero (no DA trading)</MenuItem>
                        <MenuItem value="preset">Preset (auto-generated, locked)</MenuItem>
                        <MenuItem value="edit_round_one">Edit Round 1 (DAM opens)</MenuItem>
                      </TextField>
                    </Box>
                    <Box sx={{ flex: '1 1 260px', minWidth: 260 }}>
                      <NumberInput
                        label="Forecast Horizon (h)"
                        value={cfg.general.forecast_horizon_hours}
                        onChange={(val)=>update(['general','forecast_horizon_hours'], val)}
                        min={1}
                        max={168}
                        step={1}
                        unit="h"
                        tooltip="Must be ≥ Scenario Horizon. Controls forecast inputs."
                        error={fhErr}
                        helperText={fhErr ? 'Must be ≥ Scenario Horizon' : ''}
                        inputRef={refForecastH}
                      />
                    </Box>
                  </Stack>
                </Paper>
                {/* Market Basics group */}
                <Paper sx={{ p:2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Market Basics</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Baseline price/volume levels and floor/cap limits for market simulation.
                  </Typography>
                  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                    <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                      <InfoLabel title="Baseline price level (ZAR/MWh)" tooltip="Center price used for sample supply/demand curves and previews." showTitle={false} />
                      <NumberInput label="Base Price" value={cfg.market.base_price} onChange={(val)=>update(['market','base_price'], val)} min={0} max={10000} step={100} unit="ZAR/MWh" />
                    </Stack>
                    <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                      <InfoLabel title="Baseline traded volume (MWh)" tooltip="Scales the preview supply/demand curves and initial market environment." showTitle={false} />
                      <NumberInput label="Base Volume" value={cfg.market.base_volume_mwh} onChange={(val)=>update(['market','base_volume_mwh'], val)} min={1000} max={100000} step={1000} unit="MWh" />
                    </Stack>
                    <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                      <InfoLabel title="Minimum allowed market price" tooltip="Price floor in ZAR/MWh (e.g., -500)." showTitle={false} />
                      <NumberInput label="Floor" value={cfg.market.price_floor} onChange={(val)=>update(['market','price_floor'], val)} min={-1000} max={5000} step={100} unit="ZAR/MWh" />
                    </Stack>
                    <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                      <InfoLabel title="Maximum allowed market price" tooltip="Price cap in ZAR/MWh (e.g., +5000)." showTitle={false} />
                      <NumberInput label="Cap" value={cfg.market.price_cap} onChange={(val)=>update(['market','price_cap'], val)} min={1000} max={20000} step={500} unit="ZAR/MWh" />
                    </Stack>
                  </Stack>
                </Paper>
              </Stack>
            )
          })()}
          {tab===0 && (
            <Stack id="kse-panel-0" role="tabpanel" aria-labelledby="kse-tab-0" spacing={2}>
              <Stack spacing={0.5} sx={{ maxWidth: 520 }}>
                <TextField inputRef={refDescName} fullWidth label="Scenario Name" value={name} onChange={e=>setName(e.target.value)} />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" sx={{ flex: 1 }}>Description</Typography>
                <IconButton size="small" aria-label={descMode==='edit'?'Preview description':'Edit description'} onClick={()=> setDescMode(m=> m==='edit'?'preview':'edit')}>
                  {descMode==='edit' ? <VisibilityIcon fontSize="small"/> : <EditIcon fontSize="small"/>}
                </IconButton>
                <Button size="small" variant="outlined" onClick={()=> setTemplateDialogOpen(true)}>Load Template</Button>
                {descMode==='edit' && (
                  <>
                    <TextField
                      size="small"
                      label="Img width"
                      value={descImgWidth}
                      onChange={(e)=> setDescImgWidth(e.target.value)}
                      placeholder="e.g., 640px or 75%"
                      sx={{ width: 160 }}
                    />
                    <TextField
                      size="small"
                      label="Img height"
                      value={descImgHeight}
                      onChange={(e)=> setDescImgHeight(e.target.value)}
                      placeholder="optional, e.g., 400px"
                      sx={{ width: 170 }}
                    />
                    <Button size="small" onClick={()=>{
                      try{
                        const el = descInputRef.current
                        const cur = cfg?.objectives || ''
                        const hasSel = el && typeof el.selectionStart === 'number' && el.selectionStart !== el.selectionEnd
                        const start = hasSel ? el.selectionStart : 0
                        const end = hasSel ? el.selectionEnd : cur.length
                        const before = cur.slice(0, start)
                        const target = cur.slice(start, end)
                        const after = cur.slice(end)
                        const cleaned = target
                          .replace(/\s*w:([0-9.]+(?:px|%|em|rem|vw|vh))/gi, '')
                          .replace(/\s*h:([0-9.]+(?:px|%|em|rem|vw|vh))/gi, '')
                        const next = before + cleaned + after
                        update(['objectives'], next)
                        setTimeout(()=>{
                          try{
                            if (el){
                              const pos = start + cleaned.length
                              el.setSelectionRange(pos, pos)
                            }
                          }catch(_){ }
                        },0)
                      }catch(_){ /* ignore */ }
                    }}>Reset size</Button>
                  </>
                )}
              </Stack>
              {descMode==='edit' ? (
                <TextField
                  label="Markdown"
                  value={cfg?.objectives || ''}
                  onChange={(e)=> update(['objectives'], e.target.value)}
                  onPaste={async (e)=>{
                    try{
                      const items = e.clipboardData && e.clipboardData.items
                      if (!items) return
                      const images = []
                      for (let i=0;i<items.length;i++){
                        const it = items[i]
                        if (it.type && it.type.startsWith('image/')){
                          const file = it.getAsFile()
                          if (file) images.push(file)
                        }
                      }
                      if (images.length===0) return
                      e.preventDefault()
                      const el = descInputRef.current
                      const start = el?.selectionStart ?? (cfg?.objectives || '').length
                      const end = el?.selectionEnd ?? start
                      let insertText = ''
                      for (const file of images){
                        const fd = new FormData()
                        fd.append('file', file)
                        // optional default downscale
                        fd.append('max_width', '1600')
                        const res = await api.post('/api/kse/images', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                        const url = res?.data?.url
                        if (url){
                          const hints = [`w:${descImgWidth}`].concat(descImgHeight ? [`h:${descImgHeight}`] : [])
                          insertText += (insertText? '\n' : '') + `![${hints.join(' ')}](${url})\n`
                        }
                      }
                      const cur = cfg?.objectives || ''
                      const next = cur.slice(0, start) + insertText + cur.slice(end)
                      update(['objectives'], next)
                      setTimeout(()=>{
                        try{ el && el.setSelectionRange(start + insertText.length, start + insertText.length) }catch(_){ }
                      }, 0)
                    }catch(_){ /* ignore */ }
                  }}
                  multiline minRows={12}
                  fullWidth
                  inputRef={descInputRef}
                />
              ) : (
                <Paper variant="outlined" sx={{ p:2, '& h1,h2,h3':{ mt:1 }, '& p':{ mb:1 }, '& img': { maxWidth: '100%', height: 'auto' } }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview</Typography>
                  <Box sx={{ maxHeight: 480, overflow: 'auto' }}>
                    <ReactMarkdown components={{
                      img: ({node, ...props}) => {
                        const alt = props.alt || ''
                        const mw = alt && alt.match(/w:([0-9.]+(?:px|%|em|rem|vw|vh))/i)
                        const mh = alt && alt.match(/h:([0-9.]+(?:px|%|em|rem|vw|vh))/i)
                        const style = { maxWidth: '100%', height: 'auto' }
                        if (mw) style.width = mw[1]
                        if (mh) style.height = mh[1]
                        const cleanAlt = alt
                          .replace(/\s*w:([0-9.]+(?:px|%|em|rem|vw|vh))\s*/i, ' ')
                          .replace(/\s*h:([0-9.]+(?:px|%|em|rem|vw|vh))\s*/i, ' ')
                          .trim()
                        return <img {...props} alt={cleanAlt} style={style} />
                      }
                    }}>
                      {cfg?.objectives || '*No content*'}
                    </ReactMarkdown>
                  </Box>
                </Paper>
              )}
              {descMode==='edit' && (
                <Typography variant="caption" color="text.secondary">Tip: Paste images to upload; width/height hints like <code>![w:640px h:400px](...)</code> or <code>![w:75%](...)</code> are added. Leave height empty to keep aspect ratio.</Typography>
              )}
            </Stack>
          )}
          {tab===2 && (
            <Stack id="kse-panel-2" role="tabpanel" aria-labelledby="kse-tab-2" direction="row" spacing={2}>
              {/* Left: Parameters */}
              <Stack spacing={2} sx={{ minWidth: 320, flex: 1 }}>
                <Typography variant="subtitle2">Generator Mix</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="PV blocks" tooltip="Number of PV supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="PV (#)" value={getGeneratorMixValue('pv')} onChange={(val)=>setGeneratorMixBlocks('pv', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('solar', 'PV Profile', getGeneratorMixProfile('pv'), getGeneratorMixSeasonalProfile('pv'), getGeneratorZoneDistribution('pv'), ['market','generator_mix','pv'], 'generator')} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Wind blocks" tooltip="Number of wind supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Wind (#)" value={getGeneratorMixValue('wind')} onChange={(val)=>setGeneratorMixBlocks('wind', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('wind', 'Wind Profile', getGeneratorMixProfile('wind'), getGeneratorMixSeasonalProfile('wind'), getGeneratorZoneDistribution('wind'), ['market','generator_mix','wind'], 'generator')} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Hydro blocks" tooltip="Number of hydro supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Hydro (#)" value={getGeneratorMixValue('hydro')} onChange={(val)=>setGeneratorMixBlocks('hydro', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('hydro', 'Hydro Profile', getGeneratorMixProfile('hydro'), getGeneratorMixSeasonalProfile('hydro'), getGeneratorZoneDistribution('hydro'), ['market','generator_mix','hydro'], 'generator')} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Coal blocks" tooltip="Number of coal supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Coal (#)" value={getGeneratorMixValue('coal')} onChange={(val)=>setGeneratorMixBlocks('coal', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('baseload', 'Coal Profile', getGeneratorMixProfile('coal'), getGeneratorMixSeasonalProfile('coal'), getGeneratorZoneDistribution('coal'), ['market','generator_mix','coal'], 'generator')} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Gas blocks" tooltip="Number of gas supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Gas (#)" value={getGeneratorMixValue('gas')} onChange={(val)=>setGeneratorMixBlocks('gas', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('peaking', 'Gas Profile', getGeneratorMixProfile('gas'), getGeneratorMixSeasonalProfile('gas'), getGeneratorZoneDistribution('gas'), ['market','generator_mix','gas'], 'generator')} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Nuclear blocks" tooltip="Number of nuclear supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Nuclear (#)" value={getGeneratorMixValue('nuclear')} onChange={(val)=>setGeneratorMixBlocks('nuclear', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('baseload', 'Nuclear Profile', getGeneratorMixProfile('nuclear'), getGeneratorMixSeasonalProfile('nuclear'), getGeneratorZoneDistribution('nuclear'), ['market','generator_mix','nuclear'], 'generator')} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                </Stack>
                {(() => {
                  const gm = cfg.market.generator_mix||{}
                  const sum = ['pv','wind','hydro','coal','gas','nuclear'].reduce((s,k)=> s + getGeneratorMixValue(k), 0)
                  return <Typography variant="caption" color={sum>0? 'text.secondary':'warning.main'}>Total generator blocks: {sum} (normalized in preview)</Typography>
                })()}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Edit hourly, seasonal, and zonal behavior for each generator type via its <strong>Edit</strong> profile dialog.
                </Typography>

                <Typography variant="subtitle2">Consumer Mix</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Industrial blocks" tooltip="Number of industrial consumer blocks in preview demand mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Industrial (#)" value={getConsumerMixValue('industrial')} onChange={(val)=>setConsumerMixBlocks('industrial', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('industrial', 'Industrial Load Profile', getConsumerMixProfile('industrial'), getConsumerMixSeasonalProfile('industrial'), getConsumerZoneDistribution('industrial'), ['market','consumer_mix','industrial'], 'consumer')} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Household blocks" tooltip="Number of household consumer blocks in preview demand mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Household (#)" value={getConsumerMixValue('household')} onChange={(val)=>setConsumerMixBlocks('household', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('residential', 'Household Load Profile', getConsumerMixProfile('household'), getConsumerMixSeasonalProfile('household'), getConsumerZoneDistribution('household'), ['market','consumer_mix','household'], 'consumer')} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Agriculture blocks" tooltip="Number of agriculture consumer blocks in preview demand mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Agriculture (#)" value={getConsumerMixValue('agriculture')} onChange={(val)=>setConsumerMixBlocks('agriculture', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('industrial', 'Agriculture Load Profile', getConsumerMixProfile('agriculture'), getConsumerMixSeasonalProfile('agriculture'), getConsumerZoneDistribution('agriculture'), ['market','consumer_mix','agriculture'], 'consumer')} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                </Stack>
                {(() => {
                  const cm = cfg.market.consumer_mix||{}
                  const sum = ['industrial','household','agriculture'].reduce((s,k)=> s + getConsumerMixValue(k), 0)
                  return <Typography variant="caption" color={sum>0? 'text.secondary':'warning.main'}>Total consumer blocks: {sum} (normalized in preview)</Typography>
                })()}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Edit hourly, seasonal, and zonal behavior for each consumer type via its <strong>Edit</strong> profile dialog.
                </Typography>

                <Typography variant="subtitle2">Randomness</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel title="Capacity jitter (%)" tooltip="Random variation of individual block quantities. 0–50%." showTitle={false} />
                    <NumberInput label="Capacity Jitter" value={cfg.market.random_capacity_pct} onChange={(val)=>update(['market','random_capacity_pct'], Number(val)||0)} min={0} max={50} step={1} unit="%" />
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel title="Price jitter (%)" tooltip="Random variation of marginal costs and demand price steps. 0–50%." showTitle={false} />
                    <NumberInput label="Price Jitter" value={cfg.market.random_price_pct} onChange={(val)=>update(['market','random_price_pct'], Number(val)||0)} min={0} max={50} step={1} unit="%" />
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel title="Actual vs Forecast noise (%)" tooltip="Std. deviation of actual dispatch around dispatched plan used in sessions. Affects Actual vs Forecast (default 5%)." showTitle={false} />
                    <NumberInput label="Actual Noise" value={cfg.environment.actual_noise_pct ?? 5} onChange={(val)=>update(['environment','actual_noise_pct'], Number(val)||0)} min={0} max={100} step={1} unit="%" />
                  </Stack>
                </Stack>

                <Typography variant="subtitle2" sx={{ mt: 2 }}>DAM / IDM Market Split</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Configure how synthetic supply/demand capacity is split between Day-Ahead Market (DAM) and Intraday Market (IDM).
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Stack spacing={0.5} sx={{ minWidth: 180 }}>
                    <InfoLabel title="DAM Capacity (%)" tooltip="Percentage of synthetic supply/demand capacity available in DAM clearing. Default: 90%." showTitle={false} />
                    <NumberInput label="DAM Capacity" value={cfg.market.dam_synthetic_capacity_pct ?? 90} onChange={(val)=>update(['market','dam_synthetic_capacity_pct'], Number(val)||0)} min={0} max={100} step={5} unit="%" />
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 180 }}>
                    <InfoLabel title="IDM Capacity (%)" tooltip="Percentage of synthetic supply/demand capacity available in IDM clearing. Default: 10%." showTitle={false} />
                    <NumberInput label="IDM Capacity" value={cfg.market.idm_synthetic_capacity_pct ?? 10} onChange={(val)=>update(['market','idm_synthetic_capacity_pct'], Number(val)||0)} min={0} max={100} step={5} unit="%" />
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 180 }}>
                    <InfoLabel title="IDM Producer Discount (%)" tooltip="Price discount for producers in IDM (lower prices to incentivize sales). Default: 10%." showTitle={false} />
                    <NumberInput label="IDM Producer Discount" value={cfg.market.idm_price_discount_producer_pct ?? 10} onChange={(val)=>update(['market','idm_price_discount_producer_pct'], Number(val)||0)} min={0} max={50} step={5} unit="%" />
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 180 }}>
                    <InfoLabel title="IDM Consumer Markup (%)" tooltip="Price markup for consumers in IDM (higher prices, more expensive). Default: 10%." showTitle={false} />
                    <NumberInput label="IDM Consumer Markup" value={cfg.market.idm_price_markup_consumer_pct ?? 10} onChange={(val)=>update(['market','idm_price_markup_consumer_pct'], Number(val)||0)} min={0} max={50} step={5} unit="%" />
                  </Stack>
                </Stack>

                <Typography variant="subtitle2">Environment</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Stack spacing={0.5} sx={{ minWidth: 260 }}>
                    <InfoLabel title="Preview seed" tooltip="Used only for KSE previews. Simulation uses campaign.seed." showTitle={false} />
                    <TextField label="Preview Seed" value={cfg.environment.seed} onChange={e=>update(['environment','seed'], e.target.value)}/>
                  </Stack>
                </Stack>
              </Stack>
              {/* Right: Sticky Preview */}
              <Box sx={{ width: 380 }}>
                {/* Auto-updating SMP/Volume preview above chart */}
                {preview && <Typography sx={{ mb:1 }}>SMP: {preview.smp} | Volume: {preview.volume}</Typography>}
                <Curves cfg={cfg} preview={preview} groups={cfg.market?.generator_mix} showSupply={true} showDemand={true} showSmp={true} svgRef={stepRef} />
                <Stack spacing={1} sx={{ mt:1 }}>
                  <Typography variant="caption" sx={{ display:'block', mt:1 }}>Hourly SMP</Typography>
                  <svg ref={smpRef} width={360} height={120} style={{ border:'1px solid #eee', cursor:'pointer' }} onClick={()=> smpRef.current && exportPNG(smpRef.current, 'kse_hourly_smp.png')} />
                  <Typography variant="caption" sx={{ display:'block', mt:1 }}>Hourly Volume</Typography>
                  <svg ref={volRef} width={360} height={120} style={{ border:'1px solid #eee', cursor:'pointer' }} onClick={()=> volRef.current && exportPNG(volRef.current, 'kse_hourly_volume.png')} />
                  {/* Date/Time controls for preview */}
                  <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mt:1 }}>
                    <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                      <InfoLabel title="Preview Date" tooltip="Start date for preview (affects seasonal profiles)" showTitle={false} />
                      <TextField type="date" size="small" label="Preview Date" value={previewDate} onChange={e=>setPreviewDate(e.target.value)} sx={{ width: 160 }} />
                    </Stack>
                    <Stack spacing={0.5} sx={{ minWidth: 140 }}>
                      <InfoLabel title="Preview Time" tooltip="Start time for preview (affects hourly profiles)" showTitle={false} />
                      <TextField type="time" size="small" label="Preview Time" value={previewTime} onChange={e=>setPreviewTime(e.target.value)} sx={{ width: 140 }} />
                    </Stack>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          )}
          {tab===3 && (
            <Stack id="kse-panel-3" role="tabpanel" aria-labelledby="kse-tab-3" spacing={2}>
              {/* Market Gate Timing group */}
              <Paper sx={{ p:2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Market Gate Timing</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Define when markets close before delivery.
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
                    <NumberInput
                      label="DA Gate Hour"
                      value={cfg.general.day_ahead_gate_hour ?? 12}
                      onChange={(val)=>update(['general','day_ahead_gate_hour'], val)}
                      min={0}
                      max={23}
                      step={1}
                      unit="h"
                      tooltip="Day-Ahead market gate closure hour (0-23). Default: 12 = 12:00. In real markets, DA trading closes around noon for next-day delivery."
                    />
                  </Box>
                  <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
                    <NumberInput
                      label="ID Gate Base Hour"
                      value={cfg.general.id_gate_base_hour ?? 0}
                      onChange={(val)=>update(['general','id_gate_base_hour'], val)}
                      min={0}
                      max={23}
                      step={1}
                      unit="h"
                      tooltip="Base hour for ID gate alignment (0-23). Gates occur at this hour plus multiples of the interval. Default: 0 (midnight). Example: Base=0, Interval=4 → gates at 00:00, 04:00, 08:00, etc."
                    />
                  </Box>
                  <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
                    <NumberInput
                      label="ID Gate Interval (h)"
                      value={cfg.general.id_gate_interval_hours ?? 4}
                      onChange={(val)=>update(['general','id_gate_interval_hours'], val)}
                      min={1}
                      max={24}
                      step={1}
                      unit="h"
                      tooltip="Intraday gate interval: How often ID gates close (e.g., every 4 hours). Default: 4h. Affects when ID trading windows close before delivery."
                    />
                  </Box>
                  <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
                    <NumberInput
                      label="IDM Freeze (h)"
                      value={cfg.general.freeze_hours ?? 2}
                      onChange={(val)=>update(['general','freeze_hours'], val)}
                      min={0}
                      max={Number(cfg.general.round_span_hours||24)}
                      step={1}
                      unit="h"
                      tooltip="Intraday Market gate closure: Hours before delivery when IDM closes. Only affects Intraday trading window. Default: 2h."
                    />
                  </Box>
                </Stack>
              </Paper>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Balancing Settlement</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Configure the default imbalance settlement prices. These are exogenous balancing prices, not prices formed by a separate balancing market. Standard defaults are 1200 ZAR/MWh for positive imbalance and 800 ZAR/MWh for negative imbalance.
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Box sx={{ flex: '1 1 220px', minWidth: 220 }}>
                    <NumberInput
                      label="Positive Imbalance Price"
                      value={cfg.balancing?.up_price_zar_per_mwh ?? 1200}
                      onChange={(val)=>update(['balancing','up_price_zar_per_mwh'], Number(val) || 0)}
                      min={0.1}
                      max={100000}
                      step={10}
                      unit="ZAR/MWh"
                      tooltip="Applied when actual energy exceeds planned energy. Default: 1200 ZAR/MWh. This is a configurable settlement parameter, not a market-cleared balancing price."
                    />
                  </Box>
                  <Box sx={{ flex: '1 1 220px', minWidth: 220 }}>
                    <NumberInput
                      label="Negative Imbalance Price"
                      value={cfg.balancing?.down_price_zar_per_mwh ?? 800}
                      onChange={(val)=>update(['balancing','down_price_zar_per_mwh'], Number(val) || 0)}
                      min={0.1}
                      max={100000}
                      step={10}
                      unit="ZAR/MWh"
                      tooltip="Applied when actual energy is below planned energy. Default: 800 ZAR/MWh. This is a configurable settlement parameter, not a market-cleared balancing price."
                    />
                  </Box>
                </Stack>
              </Paper>
              <Paper sx={{ p: 2, mt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Player Hour Scope</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Reduce player complexity by limiting which hour slots inside each round can be actively edited.
                  Hidden non-editable hours remain part of the scenario setup, but are submitted as 0 to avoid invisible bids affecting results.
                </Typography>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={4}>
                    <TextField
                      select
                      fullWidth
                      label="Editable Hours Per Round"
                      value={cfg?.player_input?.mode || 'all_hours'}
                      onChange={(e) => update(['player_input', 'mode'], e.target.value)}
                      helperText="Choose which hour positions inside each round the player can actively edit."
                    >
                      <MenuItem value="all_hours">All hours playable</MenuItem>
                      <MenuItem value="first_hour">First hour only</MenuItem>
                      <MenuItem value="first_two_hours">First two hours</MenuItem>
                      <MenuItem value="first_three_hours">First three hours</MenuItem>
                      <MenuItem value="custom_offsets">Custom hour offsets</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Custom Offsets"
                      value={Array.isArray(cfg?.player_input?.editable_offsets) ? cfg.player_input.editable_offsets.join(', ') : ''}
                      onChange={(e) => {
                        const offsets = e.target.value
                          .split(',')
                          .map((part) => Number(part.trim()))
                          .filter((value) => Number.isInteger(value) && value >= 0)
                        update(['player_input', 'editable_offsets'], offsets)
                      }}
                      disabled={(cfg?.player_input?.mode || 'all_hours') !== 'custom_offsets'}
                      helperText="Comma-separated hour offsets inside one round, zero-based. Example: 0, 1, 2"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FormControlLabel
                      control={(
                        <Switch
                          checked={Boolean(cfg?.player_input?.hide_non_editable_hours)}
                          onChange={(e) => update(['player_input', 'hide_non_editable_hours'], e.target.checked)}
                        />
                      )}
                      label="Hide non-editable hours"
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      When enabled, hidden hours are submitted as 0 so invisible default bids cannot change round results.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FormControlLabel
                      control={(
                        <Switch
                          checked={cfg?.player_input?.allow_other_rounds_editing !== false}
                          onChange={(e) => update(['player_input', 'allow_other_rounds_editing'], e.target.checked)}
                        />
                      )}
                      label="Allow editing in other rounds"
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      Disable this to lock all hour slots outside the active round. If those hours are also hidden, they are submitted as 0 until their round becomes active.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FormControlLabel
                      control={(
                        <Switch
                          checked={cfg?.player_input?.enable_smooth_drag !== false}
                          onChange={(e) => update(['player_input', 'enable_smooth_drag'], e.target.checked)}
                        />
                      )}
                      label="Enable smooth dragging"
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      When disabled, dragging changes only the selected hour. When enabled, neighboring editable hours are adjusted with falloff.
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Market Availability per Round</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Configure <strong>Trading</strong> (bidding allowed) per round for DAM and IDM.
                  <br/>Clearing is always executed and is no longer configurable.
                  <br/>• <strong>Gated</strong> (default): Follows SAWEM rules (gate hours, DA cutoff, ID gates)
                  <br/>• <strong>enabled</strong>: Always trading-active, ignoring gate hours
                  <br/>• <strong>disabled</strong>: Trading disabled (no bids accepted)
                </Typography>
                <Box sx={{ overflowX: 'auto' }}>
                  {(() => {
                    const rounds = Number(cfg.general.rounds || 4)
                    const markets = cfg.markets || { dam: { trading: [] }, idm: { trading: [] } }
                    
                    // Normalize legacy format: if dam/idm are arrays, convert to { trading: [] }
                    const normalizeLegacy = (m) => {
                      const normalized = {}
                      for (const [market, value] of Object.entries(m)) {
                        if (Array.isArray(value)) {
                          normalized[market] = { trading: [...value] }
                        } else {
                          // Trading-only model (fallback to old clearing for migration)
                          normalized[market] = {
                            trading: [...(value?.trading || [])],
                          }
                          if ((!normalized[market].trading || normalized[market].trading.length === 0) && Array.isArray(value?.clearing)) {
                            normalized[market].trading = [...value.clearing]
                          }
                        }
                      }
                      if (!normalized.dam) normalized.dam = { trading: [] }
                      if (!normalized.idm) normalized.idm = { trading: [] }
                      return normalized
                    }
                    
                    const normalizedMarkets = normalizeLegacy(markets)
                    
                    // Ensure arrays have correct length
                    const ensureLength = (arr, len, defaultVal = 'market_code') => {
                      const result = [...(arr || [])]
                      while (result.length < len) result.push(defaultVal)
                      return result.slice(0, len)
                    }
                    
                    const damTrading = ensureLength(normalizedMarkets.dam?.trading, rounds)
                    const idmTrading = ensureLength(normalizedMarkets.idm?.trading, rounds)
                    
                    const updateMarket = (marketType, roundIdx, value) => {
                      setCfg(prev => {
                        const n = structuredClone(prev)
                        if (!n.markets) n.markets = { dam: { trading: [] }, idm: { trading: [] } }
                        
                        // Ensure trading-only structure
                        if (!n.markets[marketType] || Array.isArray(n.markets[marketType])) {
                          n.markets[marketType] = { trading: [] }
                        }
                        if (!Array.isArray(n.markets[marketType].trading)) {
                          n.markets[marketType].trading = []
                        }
                        if ('clearing' in n.markets[marketType]) delete n.markets[marketType].clearing
                        
                        // Ensure array is long enough
                        const r = Number(prev.general.rounds || 4)
                        while (n.markets[marketType].trading.length < r) {
                          n.markets[marketType].trading.push('market_code')
                        }
                        
                        n.markets[marketType].trading[roundIdx] = value
                        return n
                      })
                    }
                    
                    const getStatusColor = (status) => {
                      switch (status) {
                        case 'on': return 'success.light'
                        case 'off': return 'grey.400'
                        default: return 'info.light'  // market_code
                      }
                    }
                    
                    const getStatusLabel = (status) => {
                      switch (status) {
                        case 'on': return 'enabled'
                        case 'off': return 'disabled'
                        default: return 'Gated'
                      }
                    }
                    
                    return (
                      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
                        <thead>
                          <tr>
                            <th style={{ width: 80, padding: 8, textAlign: 'left', borderBottom: '2px solid #ddd' }}>Round</th>
                            <th style={{ padding: 8, textAlign: 'center', borderBottom: '2px solid #ddd' }}>DAM Trading</th>
                            <th style={{ padding: 8, textAlign: 'center', borderBottom: '2px solid #ddd' }}>IDM Trading</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: rounds }, (_, roundIdx) => (
                            <tr key={roundIdx}>
                              <td style={{ padding: 8, fontWeight: 600, borderBottom: '1px solid #eee' }}>
                                {roundIdx + 1}
                              </td>
                              {[
                                { market: 'dam', data: damTrading[roundIdx] },
                                { market: 'idm', data: idmTrading[roundIdx] }
                              ].map(({ market, data }, colIdx) => (
                                <td key={colIdx} style={{ padding: 4, borderBottom: '1px solid #eee' }}>
                                  <Select
                                    size="small"
                                    fullWidth
                                    value={data || 'market_code'}
                                    onChange={(e) => updateMarket(market, roundIdx, e.target.value)}
                                    variant="outlined"
                                    sx={{
                                      '& .MuiSelect-select': {
                                        py: 0.5,
                                        fontSize: '0.8rem'
                                      }
                                    }}
                                  >
                                    <MenuItem value="market_code">Gated</MenuItem>
                                    <MenuItem value="on">Enabled</MenuItem>
                                    <MenuItem value="off">Disabled</MenuItem>
                                  </Select>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  })()}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                  <strong>Note:</strong> Trading controls whether players can submit bids. Clearing is always executed.
                </Typography>
              </Paper>
            </Stack>
          )}
          {tab===4 && (
            <Stack id="kse-panel-4" role="tabpanel" aria-labelledby="kse-tab-4" spacing={2}>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <Box sx={{ minWidth: 220 }}>
                  <NumberInput
                    inputRef={refZones}
                    label="Zones"
                    value={cfg.grid.zones}
                    onChange={z => {
                      const atc = Array.from({length:z}, (_,i)=> Array.from({length:z}, (_,j)=> i===j?0: (cfg.grid.atc?.[i]?.[j] ?? 0)))
                      setCfg(prev=> ({...prev, grid: { ...prev.grid, zones: z, atc }}))
                    }}
                    min={1}
                    max={5}
                    step={1}
                    error={cfg.grid.zones<1 || cfg.grid.zones>5}
                    helperText={(cfg.grid.zones<1 || cfg.grid.zones>5) ? 'Supported range: 1–5' : ''}
                    tooltip="Supported range: 1–5. Changing this rebuilds the symmetric ATC matrix; diagonal stays 0 MW."
                  />
                </Box>
                <Box sx={{ minWidth: 220 }}>
                  <NumberInput
                    label="Legacy Player Zone (fallback)"
                    value={cfg.general.player_zone||1}
                    onChange={val=>update(['general','player_zone'], val)}
                    min={1}
                    max={cfg.grid.zones||1}
                    step={1}
                    tooltip="Legacy fallback for older scenarios that do not assign zones per player type. In new multi-zone scenarios, physical location should come from player_types[].zone instead. This fallback is only used when a player type has no explicit zone configured."
                  />
                </Box>
                <Box sx={{ minWidth: 220 }}>
                  <NumberInput
                    label="Transmission Loss Per Link (%)"
                    value={cfg.grid.losses_pct_per_link ?? 2}
                    onChange={val=>update(['grid','losses_pct_per_link'], val)}
                    min={0}
                    max={20}
                    step={0.5}
                    unit="%"
                    tooltip="Percentage of energy lost on every traversed interzonal link. Losses compound over multi-hop paths, so higher values make indirect transfers more expensive and less effective. Example: with 2% loss per link, a two-link path delivers less energy than a direct one-link path."
                  />
                </Box>
              </Stack>
              <Paper sx={{ p: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">Network Settlement</Typography>
                  <InfoLabel
                    title="Network Settlement"
                    tooltip="Controls how physical network shortages are converted into player-facing economic effects. In Phase 1 the market still clears with one global SMP, but after clearing the engine checks whether energy can actually be delivered across zones. If not, shortages and constrained-off generation are settled using the settings below."
                    showTitle={false}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Extra grid costs are separate from imbalance and are currently allocated as zonal-only costs to consumers in the affected zone in Phase 1.
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label={renderLabelWithInfo('Extra Cost Mode', 'Determines how network-induced shortage costs are distributed. In the current Phase 1 implementation only zonal_only is active, which means the affected zone carries its own extra cost instead of spreading it across all zones or all players.')}
                      value={cfg.grid.network_settlement?.extra_cost_mode || 'zonal_only'}
                      onChange={(e) => update(['grid', 'network_settlement', 'extra_cost_mode'], e.target.value)}
                    >
                      <MenuItem value="zonal_only">Zonal only</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label={renderLabelWithInfo('Allocation Target', 'Defines which player group pays the network-induced extra cost within the affected zone. In the current Phase 1 model, only consumers_only is supported, meaning producers are not charged these shortage costs directly.')}
                      value={cfg.grid.network_settlement?.cost_allocation_target || 'consumers_only'}
                      onChange={(e) => update(['grid', 'network_settlement', 'cost_allocation_target'], e.target.value)}
                    >
                      <MenuItem value="consumers_only">Consumers only</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label={renderLabelWithInfo('Shortfall Price Mode', 'Defines how the engine prices physically unserved demand after the network feasibility check. fixed_price uses a constant ZAR/MWh value, smp_multiplier uses the round SMP times the configured multiplier, and value_of_lost_load lets you enter a direct high penalty value representing severe scarcity.')}
                      value={cfg.grid.network_settlement?.shortfall_price_mode || 'smp_multiplier'}
                      onChange={(e) => update(['grid', 'network_settlement', 'shortfall_price_mode'], e.target.value)}
                    >
                      <MenuItem value="fixed_price">Fixed price</MenuItem>
                      <MenuItem value="smp_multiplier">SMP multiplier</MenuItem>
                      <MenuItem value="value_of_lost_load">Value of lost load</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <NumberInput
                      label="Shortfall Price Value"
                      value={cfg.grid.network_settlement?.shortfall_price_value ?? 2}
                      onChange={(val) => update(['grid', 'network_settlement', 'shortfall_price_value'], Number(val) || 0)}
                      min={0.1}
                      max={100000}
                      step={0.1}
                      tooltip="Numeric parameter used by the selected Shortfall Price Mode. For fixed_price and value_of_lost_load, this is a direct ZAR/MWh penalty. For smp_multiplier, this is the multiplier applied to the round SMP. Example: multiplier 2.0 means unserved demand is priced at 2 × SMP."
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label={renderLabelWithInfo('Generator Curtailment Rule', 'Determines how commercially cleared generation is reduced when the network cannot physically export all surplus energy. pro_rata cuts all affected producers proportionally; reverse_merit_order cuts the highest-cost units first; renewables_first and renewables_last prioritize curtailment based on renewable share.')}
                      value={cfg.grid.generator_curtailment_mode || 'pro_rata'}
                      onChange={(e) => update(['grid', 'generator_curtailment_mode'], e.target.value)}
                    >
                      <MenuItem value="pro_rata">Pro rata</MenuItem>
                      <MenuItem value="reverse_merit_order">Reverse merit order</MenuItem>
                      <MenuItem value="renewables_first">Renewables first</MenuItem>
                      <MenuItem value="renewables_last">Renewables last</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
              </Paper>
              <Paper sx={{ p: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">Player Zone Source</Typography>
                  <InfoLabel
                    title="Player Zone Source"
                    tooltip="Explains which configuration entry determines the physical location of player assets in the grid model. In Phase 1, player_types[].zone is the authoritative source. The legacy general.player_zone setting only exists as a backward-compatible fallback for scenarios that predate explicit player-type zones."
                    showTitle={false}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  In Phase 1, physical player location comes from <strong>player type zones</strong>. The legacy player zone above is only a fallback for older scenarios.
                </Typography>
              </Paper>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">ATC Matrix (MW)</Typography>
                  <Tooltip title="Symmetric off-diagonals; diagonal is 0 MW. Limits power flow per direction between zones. Engine applies transmission losses and enforces ATC when clearing with congestion." arrow>
                    <Box
                      component="span"
                      sx={{
                        width: 16,
                        height: 16,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        bgcolor: 'action.hover',
                        color: 'text.secondary',
                        fontSize: 12,
                        cursor: 'help',
                        userSelect: 'none',
                      }}
                      aria-label="More info"
                    >
                      i
                    </Box>
                  </Tooltip>
                </Stack>

                {/* Inline editable ATC matrix */}
                <Box sx={{ overflowX: 'auto' }}>
                  {(() => {
                    const z = Number(cfg.grid.zones || 0)
                    if (!z || z < 1) return null
                    const atc = cfg.grid.atc || []
                    const updateCell = (i, j, val) => {
                      const v = Number(val) || 0
                      setCfg(prev => {
                        const n = structuredClone(prev)
                        if (!n.grid.atc) n.grid.atc = []
                        for (let r = 0; r < z; r++) {
                          if (!Array.isArray(n.grid.atc[r])) n.grid.atc[r] = Array.from({ length: z }, (_, c) => (r === c ? 0 : 0))
                        }
                        if (i !== j) {
                          n.grid.atc[i][j] = v
                          n.grid.atc[j][i] = v // enforce symmetry
                        }
                        return n
                      })
                    }
                    return (
                      <table style={{ borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ width: 80 }} />
                            {Array.from({ length: z }, (_, j) => (
                              <th key={j} style={{ border: '1px solid #ddd', padding: 4, textAlign: 'center' }}>Z{j+1}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: z }, (_, i) => (
                            <tr key={i}>
                              <th style={{ padding: 4, textAlign: 'left' }}>Z{i+1}</th>
                              {Array.from({ length: z }, (_, j) => (
                                <td key={j} style={{ border: '1px solid #eee', padding: 4 }}>
                                  {i === j ? (
                                    <TextField size="small" type="number" value={0} disabled sx={{ width: 100 }} />
                                  ) : (
                                    <TextField
                                      size="small"
                                      type="number"
                                      sx={{ width: 100 }}
                                      value={Number(atc?.[i]?.[j] ?? 0)}
                                      onChange={(e) => updateCell(i, j, e.target.value)}
                                    />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  })()}
                </Box>
              </Box>
              <Paper sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle2">Synthetic Transfer Requirement Preview</Typography>
                    <InfoLabel
                      title="Synthetic Transfer Requirement Preview"
                      tooltip="Indicative preview of how much interzonal transfer would be needed to move the configured synthetic generation to the configured synthetic demand locations, based on the current zone distributions and base market volume. Required ATC is shown before comparing it to the configured ATC matrix."
                      showTitle={false}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    This preview uses only the configured synthetic generator and consumer distributions. It is intended as a planning aid for the grid setup, not as a full market outcome.
                  </Typography>
                  <Typography variant="caption" color={syntheticTransferPreview.totalShortfall > 0 ? 'warning.main' : 'text.secondary'}>
                    {syntheticTransferPreview.totalShortfall > 0
                      ? `Configured topology would still leave an estimated shortfall of ${formatInt(syntheticTransferPreview.totalShortfall)} MWh in this synthetic-only preview.`
                      : 'Configured topology can route the synthetic-only zonal balances without residual shortfall in this preview.'}
                  </Typography>
                  <Box sx={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'left' }}>Zone</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Generation</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Demand</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Net Position</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Imports</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Exports</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Losses</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Shortfall</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syntheticTransferPreview.zoneRows.map((row) => (
                          <tr key={`zone-preview-${row.zoneId}`}>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>Zone {row.zoneId}</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatInt(row.generation)} MWh</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatInt(row.demand)} MWh</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right', color: row.net >= 0 ? '#2e7d32' : '#c62828' }}>{formatInt(row.net)} MWh</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatInt(row.imports)} MWh</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatInt(row.exports)} MWh</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatInt(row.losses)} MWh</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right', color: row.shortfall > 0 ? '#c62828' : 'inherit' }}>{formatInt(row.shortfall)} MWh</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                  <Box sx={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'left' }}>Link</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Required ATC</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Configured ATC</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Gap</th>
                          <th style={{ padding: 6, borderBottom: '1px solid #ddd', textAlign: 'right' }}>Losses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syntheticTransferPreview.linkRows.length > 0 ? syntheticTransferPreview.linkRows.map((row) => (
                          <tr key={`link-preview-${row.fromZone}-${row.toZone}`}>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>Zone {row.fromZone} → Zone {row.toZone}</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatInt(row.requiredAtc)} MW</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatInt(row.configuredAtc)} MW</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right', color: row.gap > 0 ? '#c62828' : '#2e7d32' }}>{formatInt(row.gap)} MW</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatInt(row.losses)} MWh</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={5} style={{ padding: 8, color: '#666' }}>No interzonal transfer is required for the current synthetic-only setup.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </Box>
                </Stack>
              </Paper>
            </Stack>
          )}
          {/* Environment tab removed (merged) */}
          {tab===5 && (
            <Stack id="kse-panel-5" role="tabpanel" aria-labelledby="kse-tab-5" spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack spacing={0.5}>
                  <InfoLabel
                    title="Scenario events and their impact"
                    tooltip="Define systemic or player-specific impacts. Events trigger at specific rounds or probabilistically and can modify prices, capacities, or other parameters."
                  />
                  <Typography variant="subtitle2">Events</Typography>
                </Stack>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setEditingEvent(null)
                    setEditingEventIndex(null)
                    setEventEditorOpen(true)
                  }}
                  ref={refAddEvent}
                >
                  Add Event
                </Button>
              </Stack>

              <EventsList
                events={cfg.events || []}
                onEdit={(event, index) => {
                  setEditingEvent(event)
                  setEditingEventIndex(index)
                  setEventEditorOpen(true)
                }}
                onDelete={(index) => {
                  setCfg((prev) => {
                    const n = structuredClone(prev)
                    n.events.splice(index, 1)
                    return n
                  })
                }}
                onDuplicate={(index) => {
                  setCfg((prev) => {
                    const n = structuredClone(prev)
                    const duplicated = structuredClone(n.events[index])
                    duplicated.name = (duplicated.name || `Event ${index + 1}`) + ' (Copy)'
                    n.events.splice(index + 1, 0, duplicated)
                    return n
                  })
                }}
              />
            </Stack>
          )}
          {tab===6 && (
            <Stack id="kse-panel-6" role="tabpanel" aria-labelledby="kse-tab-6" spacing={2}>
              <Stack spacing={0.5}>
                <InfoLabel
                  title="Player Types for this scenario"
                  tooltip="Define scenario-specific player archetypes. Each type references devices defined in this scenario and constrains player inputs."
                />
                <Typography variant="subtitle2">Player Types</Typography>
              </Stack>
              <Paper sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary">
                    Configure explicit bidding per device via Bid Count. Devices with bid count 0 stay in implicit offer mode.
                  </Typography>
                </Stack>
              </Paper>
              {(cfg.player_types||[]).map((pt, idx)=> (
                <Paper key={idx} sx={{ p:1.5, border:'1px solid #ddd' }}>
                  <Grid container spacing={2}>
                    {/* Left Column: Player Type Fields */}
                    <Grid item xs={12} md={4}>
                      <Stack spacing={2}>
                        <TextField 
                          size="small" 
                          fullWidth 
                          label="Name" 
                          value={pt.name||''} 
                          onChange={e=>{
                            const v = e.target.value
                            setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].name = v; return n })
                          }}
                        />
                        <TextField 
                          size="small" 
                          fullWidth 
                          label="Description" 
                          value={pt.description||''} 
                          onChange={e=>{
                            const v = e.target.value
                            setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].description = v; return n })
                          }}
                          multiline
                          minRows={3}
                        />
                        <TextField 
                          size="small" 
                          fullWidth 
                          type="number" 
                          label={renderLabelWithInfo('Zone (optional)', 'Physical zone assigned to this player type. All devices belonging to this player type are treated as located in this zone for interzonal dispatch, import/export feasibility, shortages, and zone-specific result reporting. Leave it empty only for legacy scenarios that still rely on the fallback player zone.')}
                          value={pt.zone||''} 
                          onChange={e=>{
                            const v = e.target.value === '' ? undefined : Number(e.target.value)
                            setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].zone = v; return n })
                          }}
                        />
                        <Button 
                          size="small" 
                          color="error" 
                          onClick={()=> setCfg(prev=>{ const n = structuredClone(prev); n.player_types.splice(idx,1); return n })}
                        >
                          Remove Type
                        </Button>
                      </Stack>
                    </Grid>
                    
                    {/* Right Column: Devices */}
                    <Grid item xs={12} md={8}>
                      <Stack spacing={1}>
                      <InfoLabel title="Devices of this type" tooltip="Each device belongs exactly to one player type. Click expand to edit, or use presets to add quickly." />
                      {(() => {
                        const devMap = new Map((cfg.devices||[]).map(d=> [d.id, d]))
                        const ids = pt.devices || []
                        const myDevs = ids.map(id=> devMap.get(id)).filter(Boolean)
                        
                        return (
                          <Stack spacing={1.5}>
                            {myDevs.map((dev)=>{
                              const idxDev = (cfg.devices||[]).findIndex(d=> d.id===dev.id)
                              return (
                                <DeviceCard
                                  key={dev.id}
                                  device={dev}
                                  onChange={(updated) => {
                                    setCfg(prev=>{ 
                                      const n = structuredClone(prev)
                                      n.devices[idxDev] = updated
                                      return n 
                                    })
                                  }}
                                  onDelete={() => {
                                    setCfg(prev=>{ 
                                      const n = structuredClone(prev)
                                      n.devices.splice(idxDev,1)
                                      n.player_types[idx].devices = (n.player_types[idx].devices||[]).filter(x=> x!==dev.id)
                                      return n 
                                    })
                                  }}
                                  onDuplicate={() => {
                                    const newDev = duplicateDevice(dev)
                                    setCfg(prev=>{
                                      const n = structuredClone(prev)
                                      n.devices = [...(n.devices||[]), newDev]
                                      n.player_types[idx].devices = [...(n.player_types[idx].devices||[]), newDev.id]
                                      return n
                                    })
                                  }}
                                  expanded={expandedDevice === dev.id}
                                  onExpandToggle={() => setExpandedDevice(expandedDevice === dev.id ? null : dev.id)}
                                />
                              )
                            })}
                            
                            {/* Add Device with Preset Menu */}
                            <Box>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                startIcon={<AddIcon />}
                                onClick={(e) => setPresetMenu({ anchor: e.currentTarget, playerTypeIdx: idx })}
                              >
                                Add Device
                              </Button>
                              <Menu
                                open={Boolean(presetMenu) && presetMenu.playerTypeIdx === idx}
                                anchorEl={presetMenu?.anchor}
                                onClose={() => setPresetMenu(null)}
                              >
                                {Object.keys(DEVICE_PRESETS).map(presetName => (
                                  <MenuItem 
                                    key={presetName}
                                    onClick={() => {
                                      const newDev = createDeviceFromPreset(presetName)
                                      setCfg(prev=>{
                                        const n = structuredClone(prev)
                                        n.devices = [...(n.devices||[]), newDev]
                                        n.player_types[idx].devices = [...(n.player_types[idx].devices||[]), newDev.id]
                                        return n
                                      })
                                      setPresetMenu(null)
                                      setExpandedDevice(newDev.id)
                                    }}
                                  >
                                    {presetName.toUpperCase()}
                                  </MenuItem>
                                ))}
                              </Menu>
                            </Box>
                          </Stack>
                        )
                      })()}
                      </Stack>
                    </Grid>
                  </Grid>
                </Paper>
              ))}
              <Button ref={refAddPlayerType} variant="outlined" onClick={()=> setCfg(prev=> { const n=structuredClone(prev); const id=`ptype_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`; n.player_types = [...(n.player_types||[]), { id, name:'', devices:[] }]; return n })}>Add Player Type</Button>
            </Stack>
          )}
          {tab===7 && (
            <Stack id="kse-panel-7" role="tabpanel" aria-labelledby="kse-tab-7" spacing={2}>
              <ChallengesList
                challenges={cfg.challenges || []}
                onAdd={() => {
                  setEditingChallenge(null);
                  setEditingChallengeIndex(null);
                  setChallengeEditorOpen(true);
                }}
                onEdit={(index) => {
                  // Create a deep copy to ensure editability
                  const challengeCopy = JSON.parse(JSON.stringify(cfg.challenges[index]));
                  setEditingChallenge(challengeCopy);
                  setEditingChallengeIndex(index);
                  setChallengeEditorOpen(true);
                }}
                onDelete={(index) => {
                  setCfg(prev => ({
                    ...prev,
                    challenges: prev.challenges.filter((_, i) => i !== index)
                  }));
                }}
              />
            </Stack>
          )}
          {/* Preview tab removed (merged) */}
          <Stack spacing={2} sx={{ mt: 2 }}>
            <ValidationPanel errors={errors} onSelect={onValidationSelect} />
            {errors.length>0 && (
              <Paper sx={{p:2}}>
                <Typography color="error">{errors.join(' · ')}</Typography>
              </Paper>
            )}
          </Stack>
        </Box>
      </Stack>
      </Paper>
  {/* Bottom actions removed: now in toolbar and modal */}

      {/* ATC Matrix Editor Modal */}
      <AtcEditor
        open={atcEditorOpen}
        onClose={() => setAtcEditorOpen(false)}
        zones={(cfg.grid?.zones && Array.from({ length: cfg.grid.zones }, (_, i) => ({ 
          id: i + 1, 
          name: `Zone ${i + 1}` 
        }))) || []}
        atcMatrix={cfg.grid?.atc || []}
        onSave={(newMatrix) => {
          setCfg(prev => ({
            ...prev,
            grid: {
              ...prev.grid,
              atc: newMatrix
            }
          }))
        }}
      />

      {/* Event Editor Drawer */}
      <EventEditor
        open={eventEditorOpen}
        onClose={() => {
          setEventEditorOpen(false)
          setEditingEvent(null)
          setEditingEventIndex(null)
        }}
        event={editingEvent}
        playerTypes={cfg.player_types || []}
        devices={cfg.devices || []}
        onSave={(eventData) => {
          setCfg((prev) => {
            const n = structuredClone(prev)
            if (!n.events) n.events = []
            
            if (editingEventIndex !== null) {
              // Editing existing event
              n.events[editingEventIndex] = eventData
            } else {
              // Creating new event
              n.events.push(eventData)
            }
            
            return n
          })
        }}
      />

      {/* Challenge Editor Modal */}
      <ChallengeEditor
        open={challengeEditorOpen}
        onClose={() => {
          setChallengeEditorOpen(false)
          setEditingChallenge(null)
          setEditingChallengeIndex(null)
        }}
        challenge={editingChallenge}
        playerTypes={cfg.player_types || []}
        onSave={(challengeData) => {
          setCfg((prev) => {
            const n = structuredClone(prev)
            if (!n.challenges) n.challenges = []
            
            if (editingChallengeIndex !== null) {
              // Editing existing challenge
              n.challenges[editingChallengeIndex] = challengeData
            } else {
              // Creating new challenge
              n.challenges.push(challengeData)
            }
            
            return n
          })
          setChallengeEditorOpen(false)
          setEditingChallenge(null)
          setEditingChallengeIndex(null)
        }}
      />

      {/* Import/Export Modal */}
      <Dialog open={ioOpen} onClose={()=> setIoOpen(false)} fullWidth maxWidth="md" aria-label="Scenario Import Export">
        <DialogTitle>Scenario Import / Export</DialogTitle>
        <DialogContent dividers>
          <Tabs value={ioTab} onChange={(_,v)=> setIoTab(v)}>
            <Tab label="Save/Export"/>
            <Tab label="Import"/>
          </Tabs>
          <Box sx={{ mt:2 }}>
            {ioTab===0 && (
              <Stack spacing={1}>
                <Typography variant="body2">Schema version: {cfg.version || '1.0.0'}</Typography>
                <Button variant="outlined" onClick={exportCurrentConfig}>Download JSON</Button>
              </Stack>
            )}
            {ioTab===1 && (
              <Stack spacing={1}>
                <Typography variant="body2">Paste scenario JSON below. Version will be checked and migration hints shown if needed.</Typography>
                <TextField fullWidth multiline minRows={8} value={importText} onChange={e=>setImportText(e.target.value)} placeholder='{"name":"...","config":{...}}' />
              </Stack>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setIoOpen(false)}>Close</Button>
          {ioTab===1 && <Button variant="contained" onClick={doImport}>Import</Button>}
        </DialogActions>
      </Dialog>

      {/* Description Modal (Markdown) */}
      <Dialog open={descOpen} onClose={()=> setDescOpen(false)} fullScreen aria-label="Scenario Description">
        <DialogTitle>Edit Scenario Description (Markdown)</DialogTitle>
        <DialogContent dividers sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Stack direction={{ xs:'column', md:'row' }} spacing={2} sx={{ flex: 1, minHeight: 0 }}>
            <TextField
              label="Markdown"
              multiline
              value={descDraft}
              onChange={e=> setDescDraft(e.target.value)}
              sx={{
                flex: 1,
                minHeight: 0,
                '& .MuiInputBase-root': { height: '100%', alignItems: 'stretch' },
                '& textarea': { height: '100% !important', overflow: 'auto' }
              }}
            />
            <Paper variant="outlined" sx={{ p:1, flex: 1, minHeight: 0, overflow:'auto', bgcolor:'background.default' }}>
              <Typography variant="subtitle2" sx={{ mb:1 }}>Preview</Typography>
              <Box sx={{ '& h1,h2,h3':{ mt:1 }, '& p':{ mb:1 } }}>
                <ReactMarkdown>{descDraft || '*No content*'}</ReactMarkdown>
              </Box>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setDescOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={()=> { update(['objectives'], descDraft); setDescOpen(false) }}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Template Picker Dialog */}
      <Dialog open={templateDialogOpen} onClose={()=> setTemplateDialogOpen(false)} fullWidth maxWidth="sm" aria-label="Load Scenario Template">
        <DialogTitle>Load Template</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography variant="body2">Select a template to load. Current unsaved changes will be replaced.</Typography>
            <Select
              size="small"
              value={selectedTemplateId}
              onChange={(e)=> setSelectedTemplateId(e.target.value)}
              displayEmpty
            >
              <MenuItem value=""><em>Select template…</em></MenuItem>
              {templates.map(t=> (
                <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
              ))}
            </Select>
            {(() => {
              const t = templates.find(x=> x.id === selectedTemplateId)
              return t ? (
                <Paper variant="outlined" sx={{ p:1 }}>
                  <Typography variant="subtitle2" sx={{ mb:0.5 }}>{t.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{t.description}</Typography>
                </Paper>
              ) : null
            })()}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setTemplateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!selectedTemplateId}
            onClick={async ()=>{
              try{
                const { data } = await api.get(`/api/kse/templates/${selectedTemplateId}`)
                if (data?.name) setName(data.name)
                if (data?.config) setCfg(data.config)
                setTemplateDialogOpen(false)
              }catch(_){ alert('Failed to load template') }
            }}
          >
            Load
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sticky Action Bar */}
      <StickyActionBar
        onSave={save}
        onValidate={doPreview}
        onImportExport={()=> setIoOpen(true)}
        onEditDescription={()=> { setDescDraft(cfg?.objectives || ''); setDescOpen(true) }}
        disabled={errors.length>0}
      />
      
      {/* Profile Editor Modal */}
      <ProfileEditorModal
        open={profileEditorOpen}
        onClose={()=> setProfileEditorOpen(false)}
        title={profileEditorTitle}
        hourlyProfile={profileEditorCurrent?.hourly}
        seasonalProfile={profileEditorCurrent?.seasonal}
        zonalDistribution={profileEditorCurrent?.zonal}
        zoneCount={cfg.grid?.zones || 1}
        onSave={handleProfileSave}
        type={profileEditorType}
      />
      
      {/* Bottom padding to prevent content being hidden by sticky bar */}
      <Box sx={{ height: 80 }} />
    </Stack>
  )
}