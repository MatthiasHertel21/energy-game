/// <reference types="cypress" />

describe('Designer – Campaign management', () => {

  it('creates campaign, uploads cover, assigns scenario, reorders and toggles flags', () => {
    cy.intercept('GET', '/api/kse/campaigns', [
      { id: 11, name: 'Existing', description: 'draft', published: false, cover_image_url: '' },
    ]).as('getCampaigns')

    cy.intercept('GET', '/api/kse/scenarios', [
      { id: 101, name: 'Scenario A' },
      { id: 102, name: 'Scenario B' },
    ]).as('getScenarios')

    cy.intercept('GET', '/api/kse/campaigns/11/scenarios', [
      { scenario_id: 101, name: 'Scenario A', order_index: 0, solo_enabled: true, cohort_enabled: true },
      { scenario_id: 102, name: 'Scenario B', order_index: 1, solo_enabled: true, cohort_enabled: true },
    ]).as('getMap')

    cy.intercept('POST', '/api/kse/campaigns', (req) => {
      expect(req.body).to.have.property('name')
      req.reply({ id: 12, name: req.body.name })
    }).as('create')

    cy.intercept('PATCH', '/api/kse/campaigns/11', { status: 'ok' }).as('saveMeta')

    cy.intercept('POST', '/api/kse/campaigns/11/image', { cover_image_url: '/uploads/campaigns/11.png' }).as('upload')

    // assign/post not needed in this flow; mapping is pre-populated

    cy.intercept('PUT', '/api/kse/campaigns/11/scenarios/reorder', { status: 'ok' }).as('reorder')
    cy.intercept('PATCH', '/api/kse/campaigns/11/scenarios/*', { status: 'ok' }).as('toggle')
    cy.intercept('DELETE', '/api/kse/campaigns/11/scenarios/*', { status: 'ok' }).as('remove')

    cy.visit('/designer/campaigns', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'designer', email: 'd@example.com' }))
        win.localStorage.setItem('access_token', 'mock')
        win.localStorage.setItem('refresh_token', 'mock')
      }
    })
    // page should render and data loaded
  cy.wait(['@getCampaigns','@getScenarios'])

    // Select existing, set metadata and publish
  cy.contains('Edit campaign')
  cy.contains('Existing').click()
  // MUI TextField renders a <label> and an <input> as siblings; select input via the label
  cy.contains('label', 'Name').parent().parent().find('input').should('exist')
    cy.contains('Published').parent().find('input[type="checkbox"]').check({ force: true })
    cy.contains('Save').click()
    cy.wait('@saveMeta')

    // Upload cover (mock)
    const blob = new Blob(['fake'], { type: 'image/png' })
    const file = new File([blob], 'cover.png', { type: 'image/png' })
    cy.contains('Upload').parent().find('input[type="file"]').selectFile({ contents: file, fileName: 'cover.png', mimeType: 'image/png' }, { force: true })
    cy.wait('@upload')

    // Assign scenario A
  cy.contains('Assigned scenarios')

    // Reorder down then up
    cy.get('button[aria-label="move down"]').first().click()
    cy.wait('@reorder')
    cy.get('button[aria-label="move up"]').eq(1).click()
    cy.wait('@reorder')

    // Toggle flags
    cy.contains('label','Solo').parent().find('input[type="checkbox"]').uncheck({ force: true })
    cy.wait('@toggle')
    cy.contains('label','Cohort').parent().find('input[type="checkbox"]').uncheck({ force: true })
    cy.wait('@toggle')

    // Remove mapping
    cy.get('button[aria-label="remove"]').first().click()
    cy.wait('@remove')
  })
})
