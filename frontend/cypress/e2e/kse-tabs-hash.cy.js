describe('KSE Tabs Hash Sync', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/kse/device-types', []).as('deviceTypes')
  })

  it('opens Events tab via URL hash and updates hash on tab click', () => {
    cy.visit('/kse#kse-events', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
        win.localStorage.setItem('access_token', 'mock')
      }
    })
    cy.wait('@deviceTypes')

    // Should land on Events tab (Add Event visible)
    cy.contains('button', 'Add Event').should('be.visible')

    // Click Grid tab; hash should change and Zones input visible
    cy.contains('button', 'Grid').click()
    cy.location('hash').should('eq', '#kse-grid')
    cy.contains('label', 'Zones').should('be.visible')

    // Click Scoring; hash should update
    cy.contains('button', 'Scoring').click()
    cy.location('hash').should('eq', '#kse-scoring')
    cy.contains('label', 'Profit').should('be.visible')
  })

  it('navigates directly to Grid via hash', () => {
    cy.visit('/kse#kse-grid', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
        win.localStorage.setItem('access_token', 'mock')
      }
    })
    cy.wait('@deviceTypes')
    cy.contains('label', 'Zones').should('be.visible')
  })
})
