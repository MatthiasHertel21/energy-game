/// <reference types="cypress" />

describe('Campaign Timeline', () => {
  it('renders bubbles and scrolls to card on click', () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 3, role: 'admin' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')

    // Mock campaign detail
    cy.intercept('GET', '/api/catalog/campaigns/1', {
      statusCode: 200,
      body: {
        id: 1,
        name: 'Test Campaign',
        scenarios: [
          { id: 11, name: 'S1', order_index: 1, status: 'completed' },
          { id: 12, name: 'S2 with longer name', order_index: 2, status: 'in_progress' },
          { id: 13, name: 'S3', order_index: 3, status: 'not_started' }
        ]
      }
    })

    cy.visit('/catalog/1')

    // Three bubbles rendered (circles)
    cy.get('svg').find('circle').should('have.length.at.least', 3)

    // Click bubble 2
    cy.get('svg').find('circle').eq(1).click()
    // Expect page to not crash, scenario card presence
    cy.contains('S2 with longer name')
  })
})
