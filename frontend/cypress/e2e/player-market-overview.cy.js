/// <reference types="cypress" />

describe('Player Market Overview', () => {
  const setAuth = () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 2, role: 'player', email: 'p@example.com' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
  }

  const visitPlayer = ({ markets }) => {
    const general = {
      round_span_hours: 6,
      forecast_horizon_hours: 12,
      horizon_hours: 12,
      freeze_hours: 0,
      id_freeze_hours: 0,
      id_gate_interval_hours: 4,
      id_gate_base_hour: 0,
      day_ahead_gate_hour: 8,
      start_time: '00:00',
      fake_date: '2026-06-08',
      rounds: 2
    }

    const briefing = {
      name: 'Scenario S',
      general,
      market: {},
      markets,
      player_types: [],
      allowed_player_types: [],
      devices: [
        {
          id: 'gen_1',
          name: 'Generator 1',
          type: 'coal',
          capacity_mw: 100,
          variable_cost_zar_per_mwh: 50,
          bid_count: 1
        }
      ],
      challenges: [],
      events: []
    }

    cy.window().then(setAuth)
    cy.intercept('GET', '/api/player/active-session', {
      session_id: 321,
      round: 2,
      time_remaining: 60,
      forecast_horizon_hours: 12,
      freeze_hours: 0,
      scenario_name: 'Scenario S',
      status: 'running'
    }).as('active')
    cy.intercept('GET', '/api/sessions/321', {
      id: 321,
      scenario_id: 1,
      status: 'running',
      mode: 'isolated_per_player',
      current_round: 2,
      general,
      market: {},
      markets,
      player_input: { mode: 'all_hours', editable_offsets: [], hide_non_editable_hours: false, allow_other_rounds_editing: true },
      scenario_name: 'Scenario S',
      campaign_name: 'Campaign C'
    }).as('sess')
    cy.intercept('GET', '/api/sessions/321/briefing', briefing).as('brief')
    cy.intercept('GET', '/api/player/forecast/full*', {
      hours: Array.from({ length: 12 }, () => 0),
      devices: [{ device_id: 'gen_1', hours: Array.from({ length: 12 }, () => 0) }],
      bids: {}
    }).as('full')
    cy.intercept('GET', '/api/player/da-baseline/321', {
      devices: { gen_1: Array.from({ length: 12 }, () => 0) },
      bids: {},
      aggregate: Array.from({ length: 12 }, () => 0),
      hour_status: Array.from({ length: 12 }, () => 'forecast'),
      locked_until_hour: 0,
      da_until_hour: 12,
      id_until_hour: 12,
      da_committed_start: -1,
      da_committed_end: -1,
      current_position: { devices: {}, bids: {}, aggregate: Array.from({ length: 12 }, () => 0) },
      prev_dispatched: {}
    }).as('baseline')
    cy.intercept('GET', '/api/player/results/321', {
      rounds: [],
      hourly_results: [],
      dam_hourly_results: [],
      idm_hourly_results: []
    }).as('results')

    cy.visit('/player?sessionId=321')
    cy.wait(['@sess', '@brief', '@full', '@baseline', '@results'])
    cy.contains('Campaign C').should('be.visible')
    cy.contains('Generator 1').should('be.visible')
  }

  it('hides gate events when DAM and IDM are disabled in the current round', () => {
    visitPlayer({
      dam: { trading: ['off', 'off'] },
      idm: { trading: ['off', 'off'] }
    })

    cy.get('[aria-label="Market availability timeline"]').click('center')

    cy.contains('Market Overview — Scope: All devices').should('be.visible')
    cy.contains('Gate events in this round').should('not.exist')
  })

  it('shows gate events when DAM and IDM are gated in the current round', () => {
    visitPlayer({
      dam: { trading: ['market_code', 'market_code'] },
      idm: { trading: ['market_code', 'market_code'] }
    })

    cy.get('[aria-label="Market availability timeline"]').click('center')

    cy.contains('Market Overview — Scope: All devices').should('be.visible')
    cy.contains('Gate events in this round').should('be.visible')
    cy.contains('DAM gate').should('be.visible')
    cy.contains('IDM gate').should('be.visible')
  })
})