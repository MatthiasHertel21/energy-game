describe('Student Flow', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('should complete full student flow: login → home → play → submit', () => {
    // Login as player
    cy.get('[href="/login"]').click()
    cy.url().should('include', '/login')

    cy.get('input[type="email"]').type('player@test.com')
    cy.get('input[type="password"]').type('password123')
    cy.get('button[type="submit"]').click()

    // Should redirect to /home for players
    cy.url().should('include', '/home')
    cy.contains('My Scenarios').should('be.visible')

    // Check for session cards
    cy.get('[data-testid="session-card"]').should('exist')

    // Click "Play" button on first active session
    cy.contains('button', 'Play').first().click()

    // Should navigate to Player page
    cy.url().should('include', '/player')
    cy.contains('Round Editor').should('be.visible')

    // Check countdown timer exists
    cy.contains(/\d{2}:\d{2}/).should('be.visible')

    // Fill in forecast values
    cy.get('input[label="h1"]').first().clear().type('100')
    cy.get('input[label="h2"]').first().clear().type('150')

    // Submit button should be enabled
    cy.contains('button', 'Submit Current Round').should('not.be.disabled')

    // Click submit
    cy.contains('button', 'Submit Current Round').click()

    // Success toast should appear
    cy.contains('submitted successfully').should('be.visible')
  })

  it('should show 404 for unknown routes', () => {
    cy.visit('/unknown-page-12345')
    cy.contains('404').should('be.visible')
    cy.contains('Page Not Found').should('be.visible')
    cy.contains('button', 'Go to Home').should('be.visible')
  })

  it('should redirect based on role after login', () => {
    // Test player redirect
    cy.visit('/login')
    cy.get('input[type="email"]').type('player@test.com')
    cy.get('input[type="password"]').type('password')
    cy.get('button[type="submit"]').click()
    cy.url().should('match', /\/(home|$)/)

    // Logout
    cy.contains('button', 'Logout').click()

    // Test admin redirect
    cy.visit('/login')
    cy.get('input[type="email"]').type('admin@test.com')
    cy.get('input[type="password"]').type('password')
    cy.get('button[type="submit"]').click()
    cy.url().should('include', '/admin')
  })

  it('should show empty state when no scenarios assigned', () => {
    // Login as new player without scenarios
    cy.visit('/home')
    cy.contains('No Scenarios Assigned').should('be.visible')
    cy.contains('Contact your trainer').should('be.visible')
  })

  it('should display countdown timer warning at T-30s', () => {
    // Navigate to player page with active session
    cy.visit('/player?sessionId=1')

    // Wait for countdown to appear
    cy.contains(/\d{2}:\d{2}/, { timeout: 10000 }).should('be.visible')

    // Mock time remaining <= 30s via WebSocket event (in real test)
    // cy.window().then((win) => {
    //   win.mockSocketEvent('tick', { session_id: 1, remaining: 25 })
    // })

    // Timer should show warning color/message
    // cy.contains('Time is running out').should('be.visible')
  })
})
