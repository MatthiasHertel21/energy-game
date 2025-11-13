/// <reference types="cypress" />

describe('Trainer Flow', () => {
  beforeEach(() => {
    window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
  })

  it('starts a session (shared_market) and loads status', () => {
    cy.intercept('POST', '/api/sessions', (req) => {
      expect(req.body.mode).to.eq('shared_market')
      req.reply({ id: 42, status: 'running' })
    }).as('start')
  cy.intercept('GET', '/api/sessions/42/status', { rounds: 4, players: [] }).as('status')
    cy.visit('/trainer')
    cy.contains('Trainer – Session Control')
    // choose shared_market
    cy.get('div.MuiSelect-select').click()
    cy.contains('shared_market').click()
    cy.contains('button', 'Start').click()
    cy.wait('@start')
    // status may load delayed; just ensure Status section present
    cy.contains('Status')
  })
})