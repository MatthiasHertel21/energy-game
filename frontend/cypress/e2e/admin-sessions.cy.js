/// <reference types="cypress" />

describe('Admin Sessions Management', () => {
  const setAuth = () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin', email: 'admin@example.com' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
  }

  it('renders Sessions tab and lists sessions', () => {
    cy.window().then(setAuth)
    cy.intercept('GET', '/api/admin/users', []).as('users')
    cy.intercept('GET', '/api/admin/activity/*', { statusCode: 200, body: { data: [], activities: [], total: 0 } })
    cy.intercept('GET', '/api/admin/sessions*', {
      statusCode: 200,
      body: {
        sessions: [
          { id: 101, scenario_id: 5, scenario_name: 'Test Scenario', cohort_id: 9, cohort_name: 'C1', status: 'running', mode: 'isolated_per_player', created_at: new Date().toISOString(), round: 2, player_count: 4 },
        ],
        total: 1,
        limit: 1000,
        offset: 0,
      },
    }).as('sessions')

    cy.visit('/admin')
    cy.wait('@users')
    cy.contains('button', 'Activity Dashboard').click()
    cy.contains('button', 'Sessions').click()
    cy.wait('@sessions')
    cy.findByRole('table', { name: /sessions table/i }).within(() => {
      cy.contains('td', '#101').should('exist')
      cy.contains('td', 'Test Scenario').should('exist')
      cy.contains('td', 'running').should('exist')
    })
  })
})
