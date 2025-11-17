/// <reference types="cypress" />

describe('Player Chart Editor', () => {
  const setAuth = () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 2, role: 'player', email: 'p@example.com' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
  }

  it('shows chart editor and toggles to fields', () => {
    cy.window().then(setAuth)
    // Active session
    cy.intercept('GET', '/api/player/active-session', { session_id: 123, round: 1, time_remaining: 60, forecast_horizon_hours: 24, freeze_hours: 6, scenario_name: 'S', status: 'running' }).as('active')
    // Session details
    cy.intercept('GET', '/api/sessions/123', { general: { round_span_hours: 6, forecast_horizon_hours: 24, freeze_hours: 6, horizon_hours: 24 }, current_round: 1, scenario_name: 'S', status: 'running', mode: 'isolated_per_player' }).as('sess')
    cy.intercept('GET', '/api/sessions/123/briefing', { player_types: [], allowed_player_types: [] }).as('brief')
    cy.intercept('GET', '/api/player/forecast/full*', { hours: Array.from({ length: 24 }, () => 0) }).as('full')

    cy.visit('/player')
    cy.wait(['@active','@sess','@brief','@full'])
    // Chart present
    cy.contains('Chart Editor').should('exist')
    // Toggle to fields
    cy.contains('button', 'Switch to fields').click()
    cy.findAllByRole('textbox').its('length').should('be.greaterThan', 10)
  })
})
