/// <reference types="cypress" />

describe('Force Navigate Feature', () => {
  beforeEach(() => {
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
  })

  it('trainer can start session with force navigate enabled', () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'trainer' }))

    let capturedRequest = null

    cy.intercept('POST', '/api/sessions', (req) => {
      capturedRequest = req.body
      req.reply({ 
        statusCode: 201,
        body: { id: 99, status: 'running' }
      })
    }).as('createSession')

    cy.intercept('GET', '/api/sessions/99/status', {
      statusCode: 200,
      body: { rounds: 0, players: [] }
    }).as('sessionStatus')

    cy.visit('/trainer')

    // Select mode
    cy.get('div.MuiSelect-select').click()
    cy.contains('shared_market').click()

    // Enable force navigate checkbox
    cy.contains('Navigate cohort on start').parent().find('input[type="checkbox"]').check()

    // Start session
    cy.contains('button', 'Start').click()
    cy.wait('@createSession')

    // Verify force_navigate flag was sent
    cy.wrap(null).should(() => {
      expect(capturedRequest).to.exist
      expect(capturedRequest.force_navigate).to.be.true
    })
  })

  it('player gets navigated when force navigate is triggered', () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 10, role: 'player' }))

    let pollCount = 0

    // First poll returns null, second poll returns navigation URL
    cy.intercept('GET', '/api/me/navigate', (req) => {
      pollCount++
      if (pollCount === 1) {
        req.reply({ statusCode: 200, body: { url: null } })
      } else if (pollCount === 2) {
        req.reply({ statusCode: 200, body: { url: '/briefing/99' } })
      } else {
        req.reply({ statusCode: 200, body: { url: null } })
      }
    }).as('pollNavigate')

    cy.visit('/dashboard')
    
    // Wait for initial poll
    cy.wait('@pollNavigate')

    // Wait for second poll that triggers navigation
    cy.wait('@pollNavigate')

    // Should navigate to briefing page
    cy.url().should('include', '/briefing/99')
  })

  it('player polling works continuously every 5 seconds', () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 10, role: 'player' }))

    let callCount = 0

    cy.intercept('GET', '/api/me/navigate', (req) => {
      callCount++
      req.reply({ statusCode: 200, body: { url: null } })
    }).as('pollNavigate')

    cy.visit('/dashboard')
    
    // Wait for initial poll
    cy.wait('@pollNavigate')
    
    // Wait 5.5 seconds for next poll
    cy.wait(5500)
    cy.wait('@pollNavigate')

    // Verify multiple polls occurred
    cy.wrap(null).should(() => {
      expect(callCount).to.be.at.least(2)
    })
  })

  it('non-player roles do not poll for navigation', () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'trainer' }))

    cy.intercept('GET', '/api/me/navigate', (req) => {
      // This should NOT be called for trainers
      req.reply({ statusCode: 200, body: { url: null } })
    }).as('pollNavigate')

    cy.visit('/trainer')

    // Wait long enough for a poll to happen if it were active
    cy.wait(6000)

    // Verify no navigation polling occurred
    cy.get('@pollNavigate.all').should('have.length', 0)
  })

  it('force navigate checkbox defaults to unchecked', () => {
    window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'trainer' }))

    cy.visit('/trainer')

    // Checkbox should exist but be unchecked by default
    cy.contains('Navigate cohort on start')
      .parent()
      .find('input[type="checkbox"]')
      .should('not.be.checked')
  })
})
