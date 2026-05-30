/// <reference types="cypress" />

describe('Campaign detail status', () => {
  it('does not mark a scenario completed from ended sessions alone', () => {
    cy.intercept('GET', '/api/catalog/campaigns/8', {
      id: 8,
      name: 'Power Markets and Trading in Africa',
      description: 'Campaign detail regression test',
      cover_image_url: '/logo.svg',
      scenarios: [
        {
          scenario_id: 18,
          name: 'Level 2a - Price formation',
          order_index: 1,
          solo_enabled: true,
          cohort_enabled: true,
          status: 'not_started',
        },
      ],
    }).as('detail')

    cy.intercept('GET', '/api/me/sessions', [
      {
        id: 257,
        scenario_id: 18,
        scenario_name: 'Level 2a - Price formation',
        campaign_id: 8,
        cohort_name: 'UCT Cohort A',
        status: 'ended',
        current_round: 4,
        max_rounds: 4,
        mode: 'shared_market',
        next_round_at: null,
        started_at: '2026-05-28T09:00:00',
        general: {},
        market: {},
        player_type: null,
        total_points: 0,
      },
    ]).as('mySessions')

    cy.visit('/catalog/8', {
      onBeforeLoad(win) {
        win.localStorage.setItem('user', JSON.stringify({ id: 5, role: 'player', email: 'm.walter@fastbreak.one' }))
        win.localStorage.setItem('access_token', 'mock')
        win.localStorage.setItem('refresh_token', 'mock')
      },
    })

    cy.wait('@detail')
    cy.wait('@mySessions')

    cy.contains('Scenarios').should('be.visible')
    cy.contains('Completed').should('not.exist')
    cy.contains('button', 'Play').should('exist')
  })
})