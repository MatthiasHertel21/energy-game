const normalizeNumber = (value) => {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

const formatSignedNumber = (value, digits = 1) => normalizeNumber(value).toLocaleString('en-US', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
})

const normalizeRole = (value, revenueHint = 0) => {
  const role = String(value || '').trim().toLowerCase()
  if (role.includes('consumer') || role.includes('buyer')) return 'consumer'
  if (role.includes('producer') || role.includes('generator') || role.includes('seller')) return 'producer'
  return normalizeNumber(revenueHint) < 0 ? 'consumer' : 'producer'
}

const normalizePriceStats = (stats = {}) => ({
  count: Math.max(0, Math.round(normalizeNumber(stats.count))),
  minZarPerMwh: normalizeNumber(stats.minZarPerMwh ?? stats.min_zar_per_mwh),
  maxZarPerMwh: normalizeNumber(stats.maxZarPerMwh ?? stats.max_zar_per_mwh),
  avgZarPerMwh: normalizeNumber(stats.avgZarPerMwh ?? stats.avg_zar_per_mwh),
})

const normalizeZoneBreakdown = (zones = []) => {
  if (!Array.isArray(zones)) return []
  return zones.map((zone) => ({
    zoneId: Math.max(0, Math.round(normalizeNumber(zone?.zoneId ?? zone?.zone_id))),
    playerCount: Math.max(0, Math.round(normalizeNumber(zone?.playerCount ?? zone?.player_count))),
    producerCount: Math.max(0, Math.round(normalizeNumber(zone?.producerCount ?? zone?.producer_count))),
    consumerCount: Math.max(0, Math.round(normalizeNumber(zone?.consumerCount ?? zone?.consumer_count))),
    productionCostZar: normalizeNumber(zone?.productionCostZar ?? zone?.production_cost_zar),
    profitZar: normalizeNumber(zone?.profitZar ?? zone?.profit_zar),
    atcDispatchCostZar: normalizeNumber(zone?.atcDispatchCostZar ?? zone?.atc_dispatch_cost_zar),
    balancingCostZar: normalizeNumber(zone?.balancingCostZar ?? zone?.balancing_cost_zar),
    balancingCostPerKwhZar: normalizeNumber(zone?.balancingCostPerKwhZar ?? zone?.balancing_cost_per_kwh_zar),
    balancingCostPerCustomerZar: normalizeNumber(zone?.balancingCostPerCustomerZar ?? zone?.balancing_cost_per_customer_zar),
    gridCurtailedMwh: normalizeNumber(zone?.gridCurtailedMwh ?? zone?.grid_curtailed_mwh),
    unservedDemandMwh: normalizeNumber(zone?.unservedDemandMwh ?? zone?.unserved_demand_mwh),
    networkShortfallMwh: normalizeNumber(zone?.networkShortfallMwh ?? zone?.network_shortfall_mwh),
    balancingSupportMwh: normalizeNumber(zone?.balancingSupportMwh ?? zone?.balancing_support_mwh),
    localGenerationMwh: normalizeNumber(zone?.localGenerationMwh ?? zone?.local_generation_mwh),
    localDemandMwh: normalizeNumber(zone?.localDemandMwh ?? zone?.local_demand_mwh),
    importsMwh: normalizeNumber(zone?.importsMwh ?? zone?.imports_mwh),
    exportsMwh: normalizeNumber(zone?.exportsMwh ?? zone?.exports_mwh),
    lossesMwh: normalizeNumber(zone?.lossesMwh ?? zone?.losses_mwh),
    bindingLinkCount: Math.max(0, Math.round(normalizeNumber(zone?.bindingLinkCount ?? zone?.binding_link_count))),
    bindingLinks: Array.isArray(zone?.bindingLinks ?? zone?.binding_links) ? (zone?.bindingLinks ?? zone?.binding_links) : [],
    zoneSmpZarPerMwh: (zone?.zoneSmpZarPerMwh ?? zone?.zone_smp_zar_per_mwh) != null
      ? normalizeNumber(zone?.zoneSmpZarPerMwh ?? zone?.zone_smp_zar_per_mwh)
      : null,
  })).filter((zone) => zone.zoneId > 0)
}

const normalizeLinkBreakdown = (links = []) => {
  if (!Array.isArray(links)) return []
  return links.map((link) => ({
    fromZone: Math.round(normalizeNumber(link?.fromZone ?? link?.from_zone)),
    toZone: Math.round(normalizeNumber(link?.toZone ?? link?.to_zone)),
    atcMwh: normalizeNumber(link?.atcMwh ?? link?.atc_mwh),
    flowMwh: normalizeNumber(link?.flowMwh ?? link?.flow_mwh),
    utilizationPct: normalizeNumber(link?.utilizationPct ?? link?.utilization_pct),
    lossesMwh: normalizeNumber(link?.lossesMwh ?? link?.losses_mwh),
    binding: Boolean(link?.binding),
    congestionRentZar: normalizeNumber(link?.congestionRentZar ?? link?.congestion_rent_zar),
    lossesValueZar: normalizeNumber(link?.lossesValueZar ?? link?.losses_value_zar),
    congestionEarningsZar: normalizeNumber(link?.congestionEarningsZar ?? link?.congestion_earnings_zar),
    zoneFromSmpZarPerMwh: (link?.zoneFromSmpZarPerMwh ?? link?.zone_from_smp_zar_per_mwh) != null
      ? normalizeNumber(link?.zoneFromSmpZarPerMwh ?? link?.zone_from_smp_zar_per_mwh)
      : null,
    zoneToSmpZarPerMwh: (link?.zoneToSmpZarPerMwh ?? link?.zone_to_smp_zar_per_mwh) != null
      ? normalizeNumber(link?.zoneToSmpZarPerMwh ?? link?.zone_to_smp_zar_per_mwh)
      : null,
  })).filter((link) => link.fromZone > 0 && link.toZone > 0)
}

const normalizeZoneMixBreakdown = (zones = []) => {
  if (!Array.isArray(zones)) return []
  return zones.map((zone) => ({
    zoneId: Math.max(0, Math.round(normalizeNumber(zone?.zoneId ?? zone?.zone_id))),
    totalProductionMwh: normalizeNumber(zone?.totalProductionMwh ?? zone?.total_production_mwh),
    realProductionMwh: normalizeNumber(zone?.realProductionMwh ?? zone?.real_production_mwh),
    syntheticProductionMwh: normalizeNumber(zone?.syntheticProductionMwh ?? zone?.synthetic_production_mwh),
    totalConsumptionMwh: normalizeNumber(zone?.totalConsumptionMwh ?? zone?.total_consumption_mwh),
    realConsumptionMwh: normalizeNumber(zone?.realConsumptionMwh ?? zone?.real_consumption_mwh),
    syntheticConsumptionMwh: normalizeNumber(zone?.syntheticConsumptionMwh ?? zone?.synthetic_consumption_mwh),
  })).filter((zone) => zone.zoneId > 0)
}

const normalizePhaseMix = (phaseMix) => {
  if (!phaseMix || typeof phaseMix !== 'object') return null
  const out = {}
  ;['dam', 'idm'].forEach((phase) => {
    const p = phaseMix[phase]
    if (!p || typeof p !== 'object') return
    out[phase] = {
      clearedVolumeMwh: normalizeNumber(p.clearedVolumeMwh ?? p.cleared_volume_mwh),
      realProducerMwh: normalizeNumber(p.realProducerMwh ?? p.real_producer_mwh),
      syntheticProducerMwh: normalizeNumber(p.syntheticProducerMwh ?? p.synthetic_producer_mwh),
      realConsumerMwh: normalizeNumber(p.realConsumerMwh ?? p.real_consumer_mwh),
      syntheticConsumerMwh: normalizeNumber(p.syntheticConsumerMwh ?? p.synthetic_consumer_mwh),
      realProducerSharePct: normalizeNumber(p.realProducerSharePct ?? p.real_producer_share_pct),
      syntheticProducerSharePct: normalizeNumber(p.syntheticProducerSharePct ?? p.synthetic_producer_share_pct),
      realConsumerSharePct: normalizeNumber(p.realConsumerSharePct ?? p.real_consumer_share_pct),
      syntheticConsumerSharePct: normalizeNumber(p.syntheticConsumerSharePct ?? p.synthetic_consumer_share_pct),
    }
  })
  return Object.keys(out).length > 0 ? out : null
}

const finalizeSummary = ({ totalVolumeMwh = 0, realPlayers = {}, syntheticMarket = {}, priceStats = {}, zoneBreakdown = [], zoneMixBreakdown = [], linkBreakdown = [], activeEventsCount = 0, roundsCount = 0, phaseMix = null }) => {
  const realProducerVolume = normalizeNumber(realPlayers.producerDispatchedMwh ?? realPlayers.producer_dispatched_mwh)
  const realConsumerVolume = normalizeNumber(realPlayers.consumerDispatchedMwh ?? realPlayers.consumer_dispatched_mwh)
  const normalizedTotalVolume = Math.max(
    normalizeNumber(totalVolumeMwh),
    realProducerVolume,
    realConsumerVolume,
  )

  const syntheticProducerVolume = Math.max(
    0,
    normalizeNumber(syntheticMarket.producerDispatchedMwh ?? syntheticMarket.producer_dispatched_mwh)
      || (normalizedTotalVolume - realProducerVolume),
  )
  const syntheticConsumerVolume = Math.max(
    0,
    normalizeNumber(syntheticMarket.consumerDispatchedMwh ?? syntheticMarket.consumer_dispatched_mwh)
      || (normalizedTotalVolume - realConsumerVolume),
  )
  const pct = (value) => (normalizedTotalVolume > 0 ? (value / normalizedTotalVolume) * 100 : 0)

  return {
    totalVolumeMwh: normalizedTotalVolume,
    realPlayers: {
      count: Math.max(0, Math.round(normalizeNumber(realPlayers.count))),
      producerCount: Math.max(0, Math.round(normalizeNumber(realPlayers.producerCount ?? realPlayers.producer_count))),
      consumerCount: Math.max(0, Math.round(normalizeNumber(realPlayers.consumerCount ?? realPlayers.consumer_count))),
      producerDispatchedMwh: realProducerVolume,
      consumerDispatchedMwh: realConsumerVolume,
      producerSharePct: normalizeNumber(realPlayers.producerSharePct ?? realPlayers.producer_share_pct) || pct(realProducerVolume),
      consumerSharePct: normalizeNumber(realPlayers.consumerSharePct ?? realPlayers.consumer_share_pct) || pct(realConsumerVolume),
    },
    syntheticMarket: {
      producerDispatchedMwh: syntheticProducerVolume,
      consumerDispatchedMwh: syntheticConsumerVolume,
      producerSharePct: normalizeNumber(syntheticMarket.producerSharePct ?? syntheticMarket.producer_share_pct) || pct(syntheticProducerVolume),
      consumerSharePct: normalizeNumber(syntheticMarket.consumerSharePct ?? syntheticMarket.consumer_share_pct) || pct(syntheticConsumerVolume),
    },
    priceStats: normalizePriceStats(priceStats),
    zoneBreakdown: normalizeZoneBreakdown(zoneBreakdown),
    zoneMixBreakdown: normalizeZoneMixBreakdown(zoneMixBreakdown),
    linkBreakdown: normalizeLinkBreakdown(linkBreakdown),
    activeEventsCount: Math.max(0, Math.round(normalizeNumber(activeEventsCount))),
    roundsCount: Math.max(0, Math.round(normalizeNumber(roundsCount))),
    phaseMix: normalizePhaseMix(phaseMix),
  }
}

export const normalizeMarketSummary = (summary) => finalizeSummary({
  totalVolumeMwh: summary?.totalVolumeMwh ?? summary?.total_volume_mwh,
  realPlayers: summary?.realPlayers ?? summary?.real_players ?? {},
  syntheticMarket: summary?.syntheticMarket ?? summary?.synthetic_market ?? {},
  priceStats: summary?.priceStats ?? summary?.price_stats ?? {},
  zoneBreakdown: summary?.zoneBreakdown ?? summary?.zone_breakdown ?? [],
  zoneMixBreakdown: summary?.zoneMixBreakdown ?? summary?.zone_mix_breakdown ?? [],
  linkBreakdown: summary?.linkBreakdown ?? summary?.link_breakdown ?? [],
  activeEventsCount: summary?.activeEventsCount ?? summary?.active_events_count,
  roundsCount: summary?.roundsCount ?? summary?.rounds_count,
  phaseMix: summary?.phaseMix ?? summary?.phase_mix ?? null,
})

export const summarizeMarketFromRanking = ({
  ranking = [],
  totalVolumeMwh = 0,
  dispatchedAccessor,
  roleAccessor,
  revenueAccessor,
}) => {
  const producerIds = new Set()
  const consumerIds = new Set()
  let realProducerVolume = 0
  let realConsumerVolume = 0

  ranking.forEach((row) => {
    if (!row || typeof row !== 'object') return

    const dispatched = Math.max(0, normalizeNumber(
      dispatchedAccessor ? dispatchedAccessor(row) : (row?.kpis?.dispatched_mwh ?? row?.total_dispatched_mwh),
    ))
    const revenueHint = revenueAccessor
      ? revenueAccessor(row)
      : (row?.kpis?.revenue_zar ?? row?.total_revenue)
    const role = normalizeRole(roleAccessor ? roleAccessor(row) : row?.player_role, revenueHint)
    const playerId = row?.player_id ?? row?.email ?? row?.rank

    if (role === 'consumer') {
      realConsumerVolume += dispatched
      if (playerId != null) consumerIds.add(playerId)
      return
    }

    realProducerVolume += dispatched
    if (playerId != null) producerIds.add(playerId)
  })

  return finalizeSummary({
    totalVolumeMwh,
    realPlayers: {
      count: producerIds.size + consumerIds.size,
      producerCount: producerIds.size,
      consumerCount: consumerIds.size,
      producerDispatchedMwh: realProducerVolume,
      consumerDispatchedMwh: realConsumerVolume,
    },
  })
}

const formatVolumeShare = (value, pct, formatInt) => `${formatInt(value)} MWh (${normalizeNumber(pct).toFixed(1)}%)`

export const buildParticipantsCard = (summary) => ({
  key: 'players',
  title: 'Participants',
  value: String(summary.realPlayers.count),
  caption: `Real players: ${summary.realPlayers.producerCount} producers · ${summary.realPlayers.consumerCount} consumers`,
})

export const buildVolumeCard = (summary, formatInt) => ({
  key: 'dispatch',
  title: 'Market Volume',
  value: `${formatInt(summary.totalVolumeMwh)} MWh`,
  caption: `Real share: producers ${summary.realPlayers.producerSharePct.toFixed(1)}% · consumers ${summary.realPlayers.consumerSharePct.toFixed(1)}%`,
})

export const buildPriceCard = (summary) => {
  if (!summary?.priceStats?.count) return null

  return {
    key: 'prices',
    title: 'Prices',
    value: `Avg ZAR ${formatSignedNumber(summary.priceStats.avgZarPerMwh, 1)}/MWh`,
    caption: `Min ZAR ${formatSignedNumber(summary.priceStats.minZarPerMwh, 1)} · Max ZAR ${formatSignedNumber(summary.priceStats.maxZarPerMwh, 1)}`,
  }
}

export const buildCompositionSection = (summary, formatInt) => ({
  title: 'Real vs synthetic market volume',
  rows: [
    {
      label: 'Real producer volume',
      value: formatVolumeShare(summary.realPlayers.producerDispatchedMwh, summary.realPlayers.producerSharePct, formatInt),
    },
    {
      label: 'Synthetic producer volume',
      value: formatVolumeShare(summary.syntheticMarket.producerDispatchedMwh, summary.syntheticMarket.producerSharePct, formatInt),
    },
    {
      label: 'Real consumer volume',
      value: formatVolumeShare(summary.realPlayers.consumerDispatchedMwh, summary.realPlayers.consumerSharePct, formatInt),
    },
    {
      label: 'Synthetic consumer volume',
      value: formatVolumeShare(summary.syntheticMarket.consumerDispatchedMwh, summary.syntheticMarket.consumerSharePct, formatInt),
    },
  ],
})

export const buildPhaseMixSections = (summary, formatInt) => {
  const phaseMix = summary?.phaseMix
  if (!phaseMix || typeof phaseMix !== 'object') return []

  const phaseLabels = {
    dam: 'Day-Ahead market (Phase 1)',
    idm: 'Intraday market (Phase 2)',
  }

  return ['dam', 'idm']
    .filter((phase) => phaseMix[phase])
    .map((phase) => {
      const p = phaseMix[phase]
      const cleared = normalizeNumber(p.clearedVolumeMwh)
      return {
        title: `${phaseLabels[phase]} — real vs synthetic`,
        caption: `Cleared volume: ${formatInt(cleared)} MWh`,
        rows: [
          {
            label: 'Real producer volume',
            value: formatVolumeShare(p.realProducerMwh, p.realProducerSharePct, formatInt),
          },
          {
            label: 'Synthetic producer volume',
            value: formatVolumeShare(p.syntheticProducerMwh, p.syntheticProducerSharePct, formatInt),
          },
          {
            label: 'Real consumer volume',
            value: formatVolumeShare(p.realConsumerMwh, p.realConsumerSharePct, formatInt),
          },
          {
            label: 'Synthetic consumer volume',
            value: formatVolumeShare(p.syntheticConsumerMwh, p.syntheticConsumerSharePct, formatInt),
          },
        ],
      }
    })
}

export const buildZoneMixMatrixSection = (summary, formatInt) => {
  if (!Array.isArray(summary?.zoneMixBreakdown) || summary.zoneMixBreakdown.length === 0) return null

  const totalColumnSx = {
    backgroundColor: 'action.hover',
    fontWeight: 700,
  }

  const summaryRowSx = {
    backgroundColor: 'action.hover',
    '& .MuiTableCell-root': {
      fontWeight: 700,
    },
  }

  const zoneColumns = summary.zoneMixBreakdown.map((zone) => ({
    key: `zone_${zone.zoneId}`,
    label: `Zone ${zone.zoneId}`,
    align: 'right',
  }))

  const buildRow = (key, label, valueKey, rowSx = null) => {
    const row = {
      key,
      metric: label,
      total: `${formatInt(summary.zoneMixBreakdown.reduce((sum, zone) => sum + normalizeNumber(zone?.[valueKey]), 0))} MWh`,
    }

    if (rowSx) {
      row.sx = rowSx
    }

    summary.zoneMixBreakdown.forEach((zone) => {
      row[`zone_${zone.zoneId}`] = `${formatInt(zone?.[valueKey])} MWh`
    })

    return row
  }

  return {
    title: 'Zonal real vs synthetic volume distribution',
    columns: [
      { key: 'metric', label: 'Volume' },
      ...zoneColumns,
      { key: 'total', label: 'Total', align: 'right', headerSx: totalColumnSx, cellSx: totalColumnSx },
    ],
    rows: [
      buildRow('production-total', 'Production total', 'totalProductionMwh', summaryRowSx),
      buildRow('production-real', 'Production real', 'realProductionMwh'),
      buildRow('production-synthetic', 'Production synthetic', 'syntheticProductionMwh'),
      buildRow('consumption-total', 'Consumption total', 'totalConsumptionMwh', summaryRowSx),
      buildRow('consumption-real', 'Consumption real', 'realConsumptionMwh'),
      buildRow('consumption-synthetic', 'Consumption synthetic', 'syntheticConsumptionMwh'),
    ],
  }
}

export const buildZoneSection = (summary, formatCurrency, formatInt) => {
  if (!Array.isArray(summary?.zoneBreakdown) || summary.zoneBreakdown.length === 0) return null

  const hasSmp = summary.zoneBreakdown.some((zone) => zone.zoneSmpZarPerMwh != null)

  const columns = [
    { key: 'zone', label: 'Zone' },
    ...(hasSmp ? [{ key: 'zoneSmp', label: 'Ø Zone SMP (ZAR/MWh)', align: 'right' }] : []),
    { key: 'productionCost', label: 'Production Cost', align: 'right' },
    { key: 'profit', label: 'Profit', align: 'right' },
    { key: 'atcRestrictions', label: 'ATC Restrictions' },
    { key: 'balancingCost', label: 'Balancing / Congestion Cost', align: 'right' },
    { key: 'balancingAverages', label: 'Avg Cost' },
    { key: 'notDelivered', label: 'Not Delivered', align: 'right' },
    { key: 'notReceived', label: 'Not Received', align: 'right' },
  ]

  return {
    title: 'Per-zone market and network impacts',
    columns,
    rows: summary.zoneBreakdown.map((zone) => ({
      key: `zone-${zone.zoneId}`,
      zone: `Zone ${zone.zoneId}`,
      ...(hasSmp ? {
        zoneSmp: zone.zoneSmpZarPerMwh != null
          ? formatSignedNumber(zone.zoneSmpZarPerMwh, 2)
          : '—',
      } : {}),
      productionCost: formatCurrency(zone.productionCostZar),
      profit: formatCurrency(zone.profitZar),
      atcRestrictions: zone.bindingLinkCount > 0
        ? `${zone.bindingLinkCount} binding link${zone.bindingLinkCount === 1 ? '' : 's'}${zone.bindingLinks.length ? ` (${zone.bindingLinks.join(', ')})` : ''} · ATC cost ${formatCurrency(zone.atcDispatchCostZar)}`
        : `No binding links · ATC cost ${formatCurrency(zone.atcDispatchCostZar)}`,
      balancingCost: `${formatCurrency(zone.balancingCostZar)}${zone.balancingSupportMwh > 0 ? ` · support ${formatInt(zone.balancingSupportMwh)} MWh` : ''}`,
      balancingAverages: `${zone.balancingCostPerKwhZar.toFixed(4)} ZAR/kWh · ${zone.consumerCount > 0 ? formatCurrency(zone.balancingCostPerCustomerZar) : '—'} per customer`,
      notDelivered: `${formatInt(zone.gridCurtailedMwh)} MWh`,
      notReceived: `${formatInt(zone.unservedDemandMwh)} MWh`,
    })),
  }
}

export const buildLinkSection = (summary, formatCurrency, formatInt) => {
  if (!Array.isArray(summary?.linkBreakdown) || summary.linkBreakdown.length === 0) return null

  const anyBinding = summary.linkBreakdown.some((link) => link.binding)
  const hasEarnings = summary.linkBreakdown.some((link) => link.congestionEarningsZar != null)
  const hasSmpData = summary.linkBreakdown.some((link) => link.zoneFromSmpZarPerMwh != null)
  const totalEarnings = summary.linkBreakdown.reduce((s, l) => s + (l.congestionEarningsZar || 0), 0)
  const totalLossesValue = summary.linkBreakdown.reduce((s, l) => s + (l.lossesValueZar || 0), 0)

  const columns = [
    { key: 'link', label: 'Link' },
    { key: 'atcMwh', label: 'ATC Limit (MWh)', align: 'right' },
    { key: 'flowMwh', label: 'Flow (MWh)', align: 'right' },
    { key: 'utilizationPct', label: 'Utilization', align: 'right' },
    ...(hasSmpData ? [{ key: 'smpFrom', label: 'SMP Zone from', align: 'right' }, { key: 'smpTo', label: 'SMP Zone to', align: 'right' }] : []),
    { key: 'lossesMwh', label: 'Losses (MWh)', align: 'right' },
    { key: 'lossesValue', label: 'Loss Value', align: 'right' },
    ...(hasEarnings ? [{ key: 'congestionEarnings', label: 'Congestion Earnings', align: 'right' }] : []),
  ]

  return {
    title: 'Interconnector / ATC link results',
    caption: anyBinding
      ? 'Congestion Earnings = (SMP_to − SMP_from) × Flow. Binding links ⚡ cause zonal price divergence.'
      : 'No binding links this round — all zones cleared at the same price.',
    columns,
    rows: [
      ...summary.linkBreakdown.map((link) => {
        const utilizationStr = `${formatSignedNumber(link.utilizationPct, 1)}%`
        const earningsLabel = link.congestionEarningsZar > 0.01
          ? formatCurrency(link.congestionEarningsZar)
          : link.congestionEarningsZar < -0.01
            ? formatCurrency(link.congestionEarningsZar)
            : '—'
        return {
          key: `link-${link.fromZone}-${link.toZone}`,
          link: `Zone ${link.fromZone} → Zone ${link.toZone}`,
          atcMwh: `${formatInt(link.atcMwh)} MWh`,
          flowMwh: `${formatInt(link.flowMwh)} MWh`,
          utilizationPct: link.binding
            ? `${utilizationStr} ⚡`
            : utilizationStr,
          smpFrom: link.zoneFromSmpZarPerMwh != null ? `${formatSignedNumber(link.zoneFromSmpZarPerMwh, 0)}/MWh` : '—',
          smpTo: link.zoneToSmpZarPerMwh != null ? `${formatSignedNumber(link.zoneToSmpZarPerMwh, 0)}/MWh` : '—',
          lossesMwh: link.lossesMwh > 0.001 ? `${formatInt(link.lossesMwh)} MWh` : '—',
          lossesValue: (link.lossesValueZar || 0) > 0.01 ? formatCurrency(link.lossesValueZar) : '—',
          congestionEarnings: earningsLabel,
          cellSxByKey: link.binding
            ? { link: { fontWeight: 600 }, utilizationPct: { color: 'warning.dark', fontWeight: 600 }, congestionEarnings: { fontWeight: 600, color: 'success.dark' } }
            : {},
        }
      }),
      // Total row
      {
        key: 'link-total',
        link: 'Total',
        atcMwh: '',
        flowMwh: '',
        utilizationPct: '',
        smpFrom: '',
        smpTo: '',
        lossesMwh: '',
        lossesValue: totalLossesValue > 0.01 ? formatCurrency(totalLossesValue) : '—',
        congestionEarnings: formatCurrency(totalEarnings),
        sx: { '& td': { fontWeight: 700, borderTop: '2px solid rgba(0,0,0,0.15)' } },
      },
    ],
  }
}

export const buildActiveEventsSection = (activeEvents = []) => {
  if (!Array.isArray(activeEvents) || activeEvents.length === 0) return null

  return {
    title: 'Active events',
    items: activeEvents.map((event, index) => {
      const name = String(event?.name || `Event ${index + 1}`)
      const description = String(event?.description || '').trim()
      const target = String(event?.target || '').trim()
      const detail = [description, target && target !== 'all' ? `Target: ${target}` : ''].filter(Boolean).join(' · ')
      return {
        key: `${name}-${index}`,
        text: detail ? `${name}: ${detail}` : name,
      }
    }),
  }
}

export const buildGroupedRankingSections = ({
  entries = [],
  title = 'Ranking',
  scoreLabel = 'Score',
  valueLabel = 'Profit',
  actionLabel = 'Action',
}) => {
  const rows = Array.isArray(entries)
    ? entries.filter((entry) => entry && typeof entry === 'object')
    : []

  if (rows.length === 0) {
    return [{
      title,
      items: [{ text: 'No ranking data available yet.' }],
    }]
  }

  const includeAction = rows.some((entry) => entry.action != null)

  const columns = [
    { key: 'rank', label: 'Rank' },
    { key: 'player', label: 'Player' },
    { key: 'type', label: 'Type' },
    { key: 'score', label: scoreLabel, align: 'right' },
    { key: 'primaryValue', label: valueLabel, align: 'right' },
    ...(includeAction ? [{ key: 'action', label: actionLabel, cellSx: { whiteSpace: 'nowrap' } }] : []),
  ]

  const overallRows = rows.map((entry, index) => ({
    key: entry.key || `${entry.player}-${index}`,
    rank: entry.rank || `#${index + 1}`,
    player: entry.player || `Player ${index + 1}`,
    type: entry.type || '-',
    score: entry.score ?? '-',
    primaryValue: entry.primaryValue ?? '-',
    ...(includeAction ? { action: entry.action ?? null } : {}),
  }))

  const sections = [{
    title,
    columns,
    rows: overallRows,
  }]

  const grouped = overallRows.reduce((acc, row) => {
    const type = String(row.type || '-').trim() || '-'
    if (!acc[type]) acc[type] = []
    acc[type].push(row)
    return acc
  }, {})

  const meaningfulTypes = Object.keys(grouped).filter((type) => type !== '-')
  if (meaningfulTypes.length === 0) return sections

  meaningfulTypes
    .sort((a, b) => a.localeCompare(b))
    .forEach((type) => {
      sections.push({
        title: `${type} ranking`,
        columns,
        rows: grouped[type].map((row, index) => ({
          ...row,
          key: `${row.key}-${type}`,
          rank: `#${index + 1}`,
        })),
      })
    })

  return sections
}