/// <reference types="cypress" />

describe('Player Forecast', () => {
  beforeEach(() => {
    window.localStorage.setItem('user', JSON.stringify({ id: 2, role: 'player' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
  })

  it('saves full forecast and submits current round', () => {
    cy.intercept('GET', '/api/sessions/99', { id: 99, status: 'running', scenario_id: 1, general: { round_span_hours: 6, forecast_horizon_hours: 24, freeze_hours: 6, horizon_hours: 24 }, current_round: 1 }).as('sess')
    cy.intercept('GET', '/api/player/forecast/full*', { hours: null }).as('loadFull')
    cy.intercept('POST', '/api/player/forecast/full', { status: 'ok', id: 1 }).as('saveFull')
    cy.intercept('POST', '/api/player/forecast', { status: 'ok', id: 2 }).as('submitSlice')
    cy.visit('/player?session=99')
    cy.wait('@sess')
    cy.wait('@loadFull')
  // change a visible unlocked hour (after freeze h6 => start from h7)
  cy.get('input').its('length').should('be.gt', 6)
  cy.get('input').eq(7).clear().type('10')
    cy.contains('Save Full Forecast').click()
    cy.wait('@saveFull')
    cy.contains('Submit Current Round').click()
    cy.wait('@submitSlice')
  })
})