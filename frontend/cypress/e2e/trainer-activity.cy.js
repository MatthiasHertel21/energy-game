/// <reference types="cypress" />

describe('Trainer Cohort Activity Tab', () => {
  it('loads activity list with filters and CSV export', () => {
    // Auth as trainer
    window.localStorage.setItem('user', JSON.stringify({ id: 9, role: 'trainer' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')

    // Mock cohorts
    cy.intercept('GET', '/api/cohorts*', { statusCode: 200, body: [{ id: 1, name: 'C1', members: [] }] })
    // Mock cohort activity
    cy.intercept('GET', '/api/cohorts/1/activity*', {
      statusCode: 200,
      body: {
        activities: [
          { id: 1, timestamp: '2025-11-12T10:00:00Z', user_email: 's@example.com', user_name: 's', action_type: 'login', details: {} },
          { id: 2, timestamp: '2025-11-12T10:05:00Z', user_email: 's@example.com', user_name: 's', action_type: 'forecast_submit', details: { round: 1 } }
        ],
        total: 2,
        limit: 50,
        offset: 0
      }
    }).as('activity')

    cy.visit('/cohorts')
    // Switch to Activity tab
    cy.contains('button', 'Activity').click()
    cy.wait('@activity')

    // Table rows present
    cy.contains('s@example.com')
    cy.contains('forecast_submit')

    // Trigger CSV export request
    cy.intercept('GET', '/api/cohorts/1/activity*format=csv*', {
      statusCode: 200,
      headers: { 'content-type': 'text/csv' },
      body: 'Timestamp,User Email,User Name,Action Type,Session ID,Details\n'
    }).as('csv')
    cy.contains('button', 'Export CSV').click()
    cy.wait('@csv')
  })
})
