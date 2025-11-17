/// <reference types="cypress" />

describe('EMSG Smoke', () => {
  it('loads login and allows mocked login', () => {
    cy.intercept('POST', '/api/auth/login', {
      statusCode: 200,
      body: {
        access_token: 'mock',
        refresh_token: 'mock',
        user: { id: 1, email: 'admin@example.com', role: 'admin' },
      },
    }).as('login')

    cy.visit('/login')
    cy.get('input[type="email"]').type('admin@example.com')
    cy.get('input[type="password"]').type('secret')
    cy.contains('button', 'Login').click()
    cy.wait('@login')
    // after login, admin nav should be visible
    cy.contains('Admin')
  })

  it('loads KSE and validates simple config (Market tab)', () => {
    // mock preview endpoint
    cy.intercept('POST', '/api/engine/preview', { mcp: 1000, volume: 123.456 })
    cy.intercept('POST', '/api/engine/preview/hourly', { hours: 24, mcp: Array(24).fill(1000), volume: Array(24).fill(5000) })
    // mock save scenario
    cy.intercept('POST', '/api/kse/scenarios', { id: 1, name: 'New Scenario' })
    // preset user in localStorage
    window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
    cy.visit('/kse')
    cy.contains('KSE – Scenario Editor')
    // switch to Market tab
    cy.contains('button', 'Market').click()
    cy.contains('Preview MCP').click()
    cy.contains('MCP: 1000')
    // hourly preview
    cy.contains('Hourly Preview').click()
    cy.contains('Hourly MCP')
  })

  it('KSE import/export and description modal work', () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
    cy.visit('/kse')
    cy.contains('KSE – Scenario Editor')
    // Import/Export modal
    cy.contains('button', 'Import/Export').click()
    cy.contains('Scenario Import / Export')
    cy.contains('button', 'Close').click()
    // Description modal
    cy.contains('button', 'Edit Description').click()
    cy.contains('Edit Scenario Description (Markdown)')
    cy.get('textarea').first().clear().type('# Hello')
    cy.contains('button', 'Save').click()
  })
})