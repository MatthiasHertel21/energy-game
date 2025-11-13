/// <reference types="cypress" />

describe('KSE Import/Export', () => {
  it('imports scenario JSON', () => {
    cy.intercept('POST', '/api/kse/scenarios/import', { id: 99, name: 'Imported' }).as('import')
    cy.visit('/kse', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
        win.localStorage.setItem('access_token', 'mock')
        win.localStorage.setItem('refresh_token', 'mock')
      }
    })
  cy.contains('KSE – Scenario Editor')
  cy.get('[data-testid="kse-import-section"]').scrollIntoView().should('exist')
  cy.get('[data-testid="kse-import-section"]').find('textarea[data-testid="kse-import-json"]').should('exist').type('{"name":"X","config":{"general":{"horizon_hours":24,"forecast_horizon_hours":48,"round_span_hours":6,"rounds":4},"grid":{"zones":1}}}', { parseSpecialCharSequences: false })
    cy.get('[data-testid="kse-import-btn"]').click()
    cy.wait('@import')
  })
})