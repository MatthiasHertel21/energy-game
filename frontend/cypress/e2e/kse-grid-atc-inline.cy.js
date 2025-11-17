describe('KSE Grid ATC Inline Editing', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/kse/device-types', []).as('deviceTypes')
    cy.visit('/kse#kse-grid', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
        win.localStorage.setItem('access_token', 'mock')
      }
    })
    cy.wait('@deviceTypes')
    cy.contains('label', 'Zones').should('be.visible')
  })

  it('updates symmetric ATC cells inline', () => {
    // Ensure zones is 2 (default) and inline matrix is present
    // Row 1, Col 2 (i=0, j=1)
    cy.get('table').should('exist')
    cy.get('table tbody tr').eq(0).find('td input[type="number"]').eq(1)
      .clear().type('7500')

    // Symmetric counterpart Row 2, Col 1 (i=1, j=0) should reflect 7500
    cy.get('table tbody tr').eq(1).find('td input[type="number"]').eq(0)
      .should('have.value', '7500')
  })
})
