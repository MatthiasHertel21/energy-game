const SCOPE_MODES = new Set([
  'all_hours',
  'first_hour',
  'first_two_hours',
  'first_three_hours',
  'custom_offsets'
])

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.floor(parsed))
}

export function normalizePlayerInputScope(configOrScenario, explicitRoundSpan = null) {
  const general = configOrScenario?.general || configOrScenario?.config?.general || {}
  const rawScope = configOrScenario?.player_input || configOrScenario?.config?.player_input || {}
  const roundSpan = toPositiveInt(explicitRoundSpan ?? general.round_span_hours, 6)
  const rawMode = String(rawScope?.mode || 'all_hours').trim().toLowerCase()
  const mode = SCOPE_MODES.has(rawMode) ? rawMode : 'all_hours'
  const rawOffsets = Array.isArray(rawScope?.editable_offsets) ? rawScope.editable_offsets : []
  const customOffsets = [...new Set(
    rawOffsets
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value < roundSpan)
  )].sort((a, b) => a - b)

  let editableOffsets = []
  if (mode === 'first_hour') {
    editableOffsets = [0]
  } else if (mode === 'first_two_hours') {
    editableOffsets = [0, 1].filter((offset) => offset < roundSpan)
  } else if (mode === 'first_three_hours') {
    editableOffsets = [0, 1, 2].filter((offset) => offset < roundSpan)
  } else if (mode === 'custom_offsets') {
    editableOffsets = customOffsets.length > 0 ? customOffsets : [0]
  } else {
    editableOffsets = Array.from({ length: roundSpan }, (_, idx) => idx)
  }

  return {
    mode,
    editable_offsets: editableOffsets,
    hide_non_editable_hours: Boolean(rawScope?.hide_non_editable_hours),
    allow_other_rounds_editing: rawScope?.allow_other_rounds_editing !== false,
    round_span_hours: roundSpan
  }
}

export function isPlayerInputHourAllowed(configOrScenario, hourIdx, explicitRoundSpan = null, explicitCurrentRound = null) {
  const scope = normalizePlayerInputScope(configOrScenario, explicitRoundSpan)
  const normalizedHour = Number(hourIdx)
  if (!Number.isFinite(normalizedHour) || normalizedHour < 0) return false
  if (!scope.allow_other_rounds_editing) {
    const currentRound = Number(
      explicitCurrentRound
      ?? configOrScenario?.current_round
      ?? configOrScenario?.config?.current_round
    )
    if (Number.isFinite(currentRound) && currentRound >= 1) {
      const hourRound = Math.floor(normalizedHour / scope.round_span_hours) + 1
      if (hourRound !== currentRound) return false
    }
  }
  if (scope.mode === 'all_hours') return true
  return scope.editable_offsets.includes(normalizedHour % scope.round_span_hours)
}

export function shouldHideNonEditableHours(configOrScenario, explicitRoundSpan = null) {
  return normalizePlayerInputScope(configOrScenario, explicitRoundSpan).hide_non_editable_hours
}

export function getVisibleHourIndices(configOrScenario, horizonHours, explicitRoundSpan = null) {
  const totalHours = toPositiveInt(horizonHours, 24)
  if (!shouldHideNonEditableHours(configOrScenario, explicitRoundSpan)) {
    return Array.from({ length: totalHours }, (_, idx) => idx)
  }
  return Array.from({ length: totalHours }, (_, idx) => idx)
    .filter((idx) => isPlayerInputHourAllowed(configOrScenario, idx, explicitRoundSpan))
}

export function zeroHiddenSeries(series, configOrScenario, explicitRoundSpan = null, roundNum = null) {
  const values = Array.isArray(series) ? [...series] : []
  if (!shouldHideNonEditableHours(configOrScenario, explicitRoundSpan)) {
    return values
  }

  const scope = normalizePlayerInputScope(configOrScenario, explicitRoundSpan)
  if (roundNum != null && values.length <= scope.round_span_hours) {
    const roundStart = (Math.max(1, Number(roundNum)) - 1) * scope.round_span_hours
    return values.map((value, idx) => (
      isPlayerInputHourAllowed(configOrScenario, roundStart + idx, scope.round_span_hours, roundNum) ? Number(value) || 0 : 0
    ))
  }

  return values.map((value, idx) => (
    isPlayerInputHourAllowed(
      configOrScenario,
      idx,
      scope.round_span_hours,
      roundNum ?? configOrScenario?.current_round ?? configOrScenario?.config?.current_round
    ) ? Number(value) || 0 : 0
  ))
}

export function zeroHiddenDevicePayload(devicesPayload, configOrScenario, explicitRoundSpan = null, roundNum = null) {
  if (!Array.isArray(devicesPayload)) return devicesPayload
  if (!shouldHideNonEditableHours(configOrScenario, explicitRoundSpan)) {
    return devicesPayload.map((entry) => ({ ...entry }))
  }
  return devicesPayload.map((entry) => ({
    ...entry,
    hours: zeroHiddenSeries(entry?.hours || [], configOrScenario, explicitRoundSpan, roundNum)
  }))
}

export function zeroHiddenBidsPayload(bidsPayload, configOrScenario, explicitRoundSpan = null) {
  if (!bidsPayload || typeof bidsPayload !== 'object') return bidsPayload
  if (!shouldHideNonEditableHours(configOrScenario, explicitRoundSpan)) {
    return { ...bidsPayload }
  }
  const next = {}
  Object.entries(bidsPayload).forEach(([deviceId, lots]) => {
    if (!lots || typeof lots !== 'object') return
    next[deviceId] = {}
    Object.entries(lots).forEach(([lotName, lot]) => {
      if (!lot || typeof lot !== 'object') return
      next[deviceId][lotName] = {
        ...lot,
        hours: zeroHiddenSeries(lot?.hours || [], configOrScenario, explicitRoundSpan)
      }
    })
  })
  return next
}

export function mapSeriesToVisibleHours(series, visibleHourIndices) {
  const values = Array.isArray(series) ? series : []
  return (visibleHourIndices || []).map((hourIdx) => Number(values[hourIdx] || 0))
}

export function filterArrayByVisibleHours(values, visibleHourIndices) {
  const source = Array.isArray(values) ? values : []
  return (visibleHourIndices || []).map((hourIdx) => source[hourIdx]).filter((value) => value !== undefined)
}