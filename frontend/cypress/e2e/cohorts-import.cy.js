/// <reference types="cypress" />

describe('Cohorts CSV Import', () => {
  it('imports players via CSV', () => {
    cy.intercept('GET', '/api/cohorts', [{ id: 1, name: 'C1', trainer_id: 1 }]).as('list')
    cy.intercept('POST', '/api/cohorts', { id: 2, name: 'C2' }).as('create')
    cy.intercept('POST', '/api/cohorts/1/players', { added: 1, invited: 1 }).as('importCsv')
    cy.visit('/cohorts', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
        win.localStorage.setItem('access_token', 'mock')
        win.localStorage.setItem('refresh_token', 'mock')
      }
    })
    cy.wait('@list')
    cy.contains('C1')
  cy.contains('Select').click()
  cy.get('[data-testid="cohorts-import-section"]').scrollIntoView().should('exist')
  cy.get('[data-testid="cohorts-import-section"]').find('textarea[data-testid="cohorts-csv"]').should('exist').type('user@example.com')
  cy.get('[data-testid="cohorts-import-btn"]').click()
    cy.wait('@importCsv')
  })
})