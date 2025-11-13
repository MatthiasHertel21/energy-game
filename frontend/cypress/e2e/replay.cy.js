/// <reference types="cypress" />

describe('Replay View', () => {
  // set localStorage in app window on visit

  it.skip('renders rounds and KPIs', () => {
    const payload = {
      session: { id: 55, scenario: 'Test Scenario', general: { rounds: 4 } },
      rounds: [
        { round: 1, mcp: 1000.0, volume: 100.123, players: [{ player_id: 1, kpis: { profit_zar: 1000, planned_mwh: 10, actual_mwh: 10 } }] },
        { round: 2, mcp: 1100.0, volume: 120.000, players: [{ player_id: 2, kpis: { profit_zar: 2000, planned_mwh: 12, actual_mwh: 12 } }] },
      ],
    }
    cy.intercept('GET', '/api/sessions/55/replay', payload).as('replay')
    cy.visit('/replay?session=55', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 2, role: 'admin' }))
        win.localStorage.setItem('access_token', 'mock')
        win.localStorage.setItem('refresh_token', 'mock')
      }
    })
  cy.wait('@replay')
  cy.get('[data-testid="replay-mcp-title"]').should('exist')
  // verify round 1 KPIs visible
  cy.contains('Round 1')
  cy.contains('1000')
  })
})