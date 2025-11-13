/// <reference types="cypress" />

describe('Admin Activity Dashboard', () => {
  beforeEach(() => {
    // Mock login as admin
    cy.intercept('POST', '/api/auth/login', {
      statusCode: 200,
      body: {
        access_token: 'mock',
        refresh_token: 'mock',
        user: { id: 1, email: 'admin@example.com', role: 'admin' },
      },
    }).as('login')

    // Mock summary
    cy.intercept('GET', '/api/admin/activity/summary*', {
      statusCode: 200,
      body: {
        total_users: 10,
        active_users_7d: 5,
        active_users_30d: 7,
        sessions_started: 3,
        sessions_completed: 2,
        avg_forecasts_per_session: 12.5,
        total_forecasts: 123,
        period: '30d'
      }
    }).as('summary')

    // Mock timeseries
    cy.intercept('GET', '/api/admin/activity/timeseries*', (req) => {
      const metric = new URL(req.url, window.location.origin).searchParams.get('metric') || 'logins'
      const data = Array.from({ length: 10 }).map((_,i)=> ({ date: `2025-11-${(i+1).toString().padStart(2,'0')}`, count: (i+1) * (metric === 'registrations' ? 1 : metric === 'sessions' ? 2 : 3) }))
      req.reply({ statusCode: 200, body: { metric, interval: 'daily', data } })
    }).as('series')

    // Mock recent
    cy.intercept('GET', '/api/admin/activity/recent*', {
      statusCode: 200,
      body: { activities: [
        { id: 1, timestamp: '2025-11-12T10:00:00Z', user_email: 'a@example.com', action_type: 'login', session_id: null, details: {} },
        { id: 2, timestamp: '2025-11-12T10:05:00Z', user_email: 'b@example.com', action_type: 'forecast_submit', session_id: 42, details: { round: 1 } }
      ] }
    }).as('recent')
  })

  it('renders dashboard KPIs and charts', () => {
    cy.visit('/login')
    cy.get('input[type="email"]').type('admin@example.com')
    cy.get('input[type="password"]').type('secret')
    cy.contains('button', 'Login').click()
    cy.wait('@login')

    // Navigate to admin
    cy.contains('button', 'Admin').click()

    // Switch to Activity Dashboard tab
    cy.contains('button', 'Activity Dashboard').click()

    // Wait for API calls
    cy.wait('@summary')
    cy.wait('@series')

    // KPIs present
    cy.contains('Total Users')
    cy.contains('Active Users 7d')
    cy.contains('Sessions Started')
    cy.contains('Total Forecasts')

    // Charts render (svg present)
    cy.get('svg[role="img"]').should('have.length.at.least', 1)

    // Recent activity table rows
    cy.contains('a@example.com')
    cy.contains('forecast_submit')
  })
})
