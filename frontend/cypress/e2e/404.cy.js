describe('404 Page', () => {
  it('should show 404 page for unknown routes', () => {
    cy.visit('/this-page-does-not-exist', { failOnStatusCode: false })
    
    cy.contains('404').should('be.visible')
    cy.contains('Page Not Found').should('be.visible')
    cy.contains("The page you're looking for doesn't exist or has been moved").should('be.visible')
  })

  it('should have a "Go to Home" button that navigates correctly', () => {
    cy.visit('/random-unknown-page', { failOnStatusCode: false })
    
    cy.contains('button', 'Go to Home').should('be.visible')
    cy.contains('button', 'Go to Home').click()
    
    // Should redirect based on user role (login if not authenticated)
    cy.url().should('match', /\/(login|home|admin|trainer|kse)/)
  })

  it('should navigate to correct home based on role', () => {
    // Login as player first
    cy.visit('/login')
    cy.get('input[type="email"]').type('player@test.com')
    cy.get('input[type="password"]').type('password')
    cy.get('button[type="submit"]').click()
    
    // Now visit 404
    cy.visit('/does-not-exist', { failOnStatusCode: false })
    cy.contains('button', 'Go to Home').click()
    
    // Should go to player home
    cy.url().should('include', '/home')
  })

  it('should handle nested unknown routes', () => {
    cy.visit('/api/unknown/endpoint/test', { failOnStatusCode: false })
    cy.contains('404').should('be.visible')
  })

  it('should show 404 for routes with query params', () => {
    cy.visit('/unknown?param=value&test=123', { failOnStatusCode: false })
    cy.contains('404').should('be.visible')
  })
})
