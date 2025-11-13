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

  it('loads KSE and validates simple config', () => {
    // mock preview endpoint
    cy.intercept('POST', '/api/engine/preview', { mcp: 1000, volume: 123.456 })
    // mock save scenario
    cy.intercept('POST', '/api/kse/scenarios', { id: 1, name: 'New Scenario' })
    // preset user in localStorage
    window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
    cy.visit('/kse')
    cy.contains('KSE – Scenario Editor')
    // switch to Preview tab before clicking
    cy.contains('button', 'Preview').click()
    cy.contains('Preview MCP').click()
    cy.contains('MCP: 1000')
  })
})