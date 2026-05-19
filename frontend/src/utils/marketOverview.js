const normalizeNumber = (value) => {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

const normalizeRole = (value, revenueHint = 0) => {
  const role = String(value || '').trim().toLowerCase()
  if (role.includes('consumer') || role.includes('buyer')) return 'consumer'
  if (role.includes('producer') || role.includes('generator') || role.includes('seller')) return 'producer'
  return normalizeNumber(revenueHint) < 0 ? 'consumer' : 'producer'
}

const finalizeSummary = ({ totalVolumeMwh = 0, realPlayers = {}, syntheticMarket = {} }) => {
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
  }
}

export const normalizeMarketSummary = (summary) => finalizeSummary({
  totalVolumeMwh: summary?.totalVolumeMwh ?? summary?.total_volume_mwh,
  realPlayers: summary?.realPlayers ?? summary?.real_players ?? {},
  syntheticMarket: summary?.syntheticMarket ?? summary?.synthetic_market ?? {},
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