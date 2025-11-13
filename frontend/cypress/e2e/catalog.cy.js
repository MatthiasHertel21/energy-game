/// <reference types="cypress" />

describe('Catalog – Player flows', () => {

  it('lists published campaigns and opens detail', () => {
    cy.intercept('GET', '/api/catalog/campaigns', [
      { id: 1, name: 'Intro to SAWEM', description: 'Basics of the market', cover_image_url: '/logo.svg', scenarios_count: 3, progress: { completed: 1, total: 3 } },
      { id: 2, name: 'Advanced Trading', description: 'Events and storage', cover_image_url: '/logo.svg', scenarios_count: 2, progress: { completed: 0, total: 2 } },
    ]).as('catalog')

    cy.visit('/catalog', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 10, role: 'player', email: 'p@example.com' }))
        win.localStorage.setItem('access_token', 'mock')
        win.localStorage.setItem('refresh_token', 'mock')
      }
    })
    cy.contains('Campaign Catalog')
    cy.contains('Intro to SAWEM')
    cy.contains('Advanced Trading')
    cy.contains('View').first().click()
  })

  it('shows campaign detail and starts a solo session', () => {
    cy.intercept('GET', '/api/catalog/campaigns/1', {
      id: 1,
      name: 'Intro to SAWEM',
      description: 'Basics of the market',
      cover_image_url: '/logo.svg',
      scenarios: [
        { scenario_id: 101, name: 'Scenario A', order_index: 0, solo_enabled: true, cohort_enabled: true, status: 'not_started' },
        { scenario_id: 102, name: 'Scenario B', order_index: 1, solo_enabled: false, cohort_enabled: true, status: 'in_progress' },
      ],
    }).as('detail')
    cy.intercept('GET', '/api/me/sessions', []).as('mysessions')
    cy.intercept('POST', '/api/player/solo-sessions', { statusCode: 201, body: { session_id: 9001, status: 'running' } }).as('solo')

    cy.visit('/catalog/1', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 10, role: 'player', email: 'p@example.com' }))
        win.localStorage.setItem('access_token', 'mock')
        win.localStorage.setItem('refresh_token', 'mock')
      }
    })
    cy.contains('Scenarios')
    cy.contains('Scenario A').parent().parent().within(() => {
      cy.contains('Play solo').click()
    })
    cy.wait('@solo')
  })
})
