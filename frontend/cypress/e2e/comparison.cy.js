/// <reference types="cypress" />

describe('Comparison Dashboard', () => {
  beforeEach(() => {
    window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
  })

  it('shows leaderboard table and chart', () => {
    const rows = [
      { player_id: 10, profit_zar: 3000, revenue_zar: 5000, imbalance_cost_zar: 1000, curtailment_cost_zar: 200, rounds: 2, score: 3000 },
      { player_id: 11, profit_zar: 1000, revenue_zar: 3000, imbalance_cost_zar: 500, curtailment_cost_zar: 100, rounds: 2, score: 1000 },
    ]
    cy.intercept('GET', '/api/leaderboard/sessions/77', rows).as('lb')
    cy.visit('/comparison?session=77')
    cy.wait('@lb')
    cy.contains('Comparison Dashboard')
    cy.contains('Player')
    cy.contains('3000')
    // chart svg present
    cy.get('svg').should('exist')
  })
})