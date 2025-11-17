/// <reference types="cypress" />

describe('Trainer Presence Tracking', () => {
  beforeEach(() => {
    window.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'trainer' }))
    window.localStorage.setItem('access_token', 'mock')
    window.localStorage.setItem('refresh_token', 'mock')
  })

  it('displays online players in presence panel', () => {
    const mockPresence = [
      {
        user_id: 10,
        email: 'student1@example.com',
        cohort_id: 2,
        cohort_name: 'Class A',
        campaign_id: 5,
        campaign_name: 'Energy Markets 101',
        scenario_id: 8,
        scenario_name: 'Market Basics',
        session_id: 42,
        status: 'running',
        last_seen: '2025-11-17T10:30:00Z'
      },
      {
        user_id: 11,
        email: 'student2@example.com',
        cohort_id: 2,
        cohort_name: 'Class A',
        campaign_id: null,
        campaign_name: null,
        scenario_id: null,
        scenario_name: null,
        session_id: null,
        status: null,
        last_seen: '2025-11-17T10:31:00Z'
      }
    ]

    cy.intercept('GET', '/api/trainer/presence*', {
      statusCode: 200,
      body: mockPresence
    }).as('getPresence')

    cy.visit('/trainer')
    cy.wait('@getPresence')

    // Check presence panel exists
    cy.contains('Online now').should('be.visible')
    
    // Check table displays both users
    cy.contains('student1@example.com').should('be.visible')
    cy.contains('student2@example.com').should('be.visible')
    
    // Check active session displays correctly
    cy.contains('Class A').should('be.visible')
    cy.contains('Energy Markets 101').should('be.visible')
    cy.contains('Market Basics').should('be.visible')
  })

  it('filters presence by cohort', () => {
    const mockPresence = [
      {
        user_id: 10,
        email: 'student1@example.com',
        cohort_id: 2,
        cohort_name: 'Class A',
        campaign_id: null,
        campaign_name: null,
        scenario_id: null,
        scenario_name: null,
        session_id: null,
        status: null,
        last_seen: '2025-11-17T10:30:00Z'
      },
      {
        user_id: 11,
        email: 'student2@example.com',
        cohort_id: 3,
        cohort_name: 'Class B',
        campaign_id: null,
        campaign_name: null,
        scenario_id: null,
        scenario_name: null,
        session_id: null,
        status: null,
        last_seen: '2025-11-17T10:31:00Z'
      }
    ]

    cy.intercept('GET', '/api/trainer/presence*', {
      statusCode: 200,
      body: mockPresence
    }).as('getPresence')

    cy.visit('/trainer')
    cy.wait('@getPresence')

    // Both students visible initially
    cy.contains('student1@example.com').should('be.visible')
    cy.contains('student2@example.com').should('be.visible')

    // Filter by cohort "Class A"
    cy.contains('Filter Cohort').parent().find('input').type('Class A')
    
    // Only student1 should be visible
    cy.contains('student1@example.com').should('be.visible')
    cy.contains('student2@example.com').should('not.exist')
  })

  it('auto-refreshes presence data every 5 seconds', () => {
    let callCount = 0
    
    cy.intercept('GET', '/api/trainer/presence*', (req) => {
      callCount++
      req.reply({
        statusCode: 200,
        body: []
      })
    }).as('getPresence')

    cy.visit('/trainer')
    cy.wait('@getPresence')
    
    // Wait 5.5 seconds and verify another request was made
    cy.wait(5500)
    cy.wait('@getPresence')
    
    // Should have at least 2 calls (initial + one refresh)
    cy.wrap(null).should(() => {
      expect(callCount).to.be.at.least(2)
    })
  })

  it('handles empty presence gracefully', () => {
    cy.intercept('GET', '/api/trainer/presence*', {
      statusCode: 200,
      body: []
    }).as('getPresence')

    cy.visit('/trainer')
    cy.wait('@getPresence')

    // Panel should still exist but show no rows
    cy.contains('Online now').should('be.visible')
    cy.get('table tbody tr').should('have.length', 0)
  })
})
