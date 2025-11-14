/// <reference types="cypress" />

// Basic Axe accessibility checks on key pages
// We limit to serious/critical impacts to make checks actionable

const checkOptions = {
  includedImpacts: ['serious', 'critical']
}

const setAuth = () => {
  window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin', email: 'admin@example.com' }))
  window.localStorage.setItem('access_token', 'mock')
  window.localStorage.setItem('refresh_token', 'mock')
}

describe('Accessibility (axe)', () => {
  it('Login page has no serious/critical violations', () => {
    cy.visit('/login')
    cy.injectAxe()
    cy.checkA11y(undefined, checkOptions)
  })

  it('KSE Editor has no serious/critical violations', () => {
    cy.window().then(setAuth)
    cy.intercept('POST', '/api/engine/preview', { mcp: 1000, volume: 123.456 })
    cy.visit('/kse')
    cy.injectAxe()
    cy.checkA11y(undefined, checkOptions)
  })

  it('Trainer page has no serious/critical violations', () => {
    cy.window().then(setAuth)
    cy.visit('/trainer')
    cy.injectAxe()
    cy.checkA11y(undefined, checkOptions)
  })

  it('Catalog and Campaign Detail have no serious/critical violations', () => {
    cy.window().then(setAuth)
    // Catalog overall
    cy.intercept('GET', '/api/catalog/campaigns*', { statusCode: 200, body: { campaigns: [] } }).as('list')
    cy.visit('/catalog')
    cy.wait('@list')
    cy.injectAxe()
    cy.checkA11y(undefined, checkOptions)

    // Campaign detail with stubbed data
    const campaign = {
      id: 1,
      name: 'Demo Campaign',
      description: 'A11y test campaign',
      cover_image_url: '/logo.svg',
      scenarios: [
        { scenario_id: 101, name: 'S1', order_index: 0, status: 'completed', solo_enabled: true, cohort_enabled: true },
        { scenario_id: 102, name: 'S2', order_index: 1, status: 'in_progress', solo_enabled: true, cohort_enabled: true },
        { scenario_id: 103, name: 'S3', order_index: 2, status: 'not_started', solo_enabled: false, cohort_enabled: false }
      ]
    }
    cy.intercept('GET', '/api/catalog/campaigns/1', campaign).as('detail')
    cy.intercept('GET', '/api/me/sessions', []).as('mysessions')
    cy.visit('/catalog/1')
    cy.wait(['@detail','@mysessions'])
    cy.injectAxe()
    cy.checkA11y(undefined, checkOptions)
  })
})
