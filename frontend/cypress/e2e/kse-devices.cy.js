describe('KSE Devices Tab', () => {
  beforeEach(() => {
    // Login as admin
    cy.visit('/')
    cy.get('input[name="email"]').type('admin@test.com')
    cy.get('input[name="password"]').type('admin123')
    cy.get('button[type="submit"]').click()
    cy.url().should('include', '/home')
    
    // Navigate to KSE
    cy.visit('/kse')
    cy.contains('Knowledge Scenario Editor').should('be.visible')
  })

  it('should display Devices tab and load device types', () => {
    // Click on Devices tab (tab 5)
    cy.contains('button', 'Devices').click()
    
    // Should show "Add Device" button
    cy.contains('button', 'Add Device').should('be.visible')
  })

  it('should add a Coal device with parameters', () => {
    cy.contains('button', 'Devices').click()
    
    // Add device
    cy.contains('button', 'Add Device').click()
    
    // Select Coal type
    cy.get('select').first().select('COAL')
    
    // Fill in Coal-specific parameters
    cy.contains('Max Power (MW)').parent().find('input').clear().type('500')
    cy.contains('Min Load (%)').parent().find('input').clear().type('40')
    cy.contains('Ramp Rate (MW/min)').parent().find('input').clear().type('5')
    cy.contains('Cost (ZAR/MWh)').parent().find('input').clear().type('400')
    
    // Save scenario
    cy.contains('button', 'Save Scenario').click()
    cy.contains('Saved').should('be.visible')
  })

  it('should add a Nuclear device with Koeberg specs', () => {
    cy.contains('button', 'Devices').click()
    
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('NUCLEAR')
    
    // Koeberg specs
    cy.contains('Max Power (MW)').parent().find('input').clear().type('900')
    cy.contains('Min Load (%)').parent().find('input').clear().type('90')
    cy.contains('Ramp Rate (MW/min)').parent().find('input').clear().type('1')
    cy.contains('Cost (ZAR/MWh)').parent().find('input').clear().type('100')
    
    cy.contains('button', 'Save Scenario').click()
    cy.contains('Saved').should('be.visible')
  })

  it('should add a Solar device with capacity factor', () => {
    cy.contains('button', 'Devices').click()
    
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('SOLAR')
    
    cy.contains('Max Power (MW)').parent().find('input').clear().type('200')
    cy.contains('Capacity Factor').parent().find('input').clear().type('0.25')
    
    cy.contains('button', 'Save Scenario').click()
    cy.contains('Saved').should('be.visible')
  })

  it('should add a Battery device with storage parameters', () => {
    cy.contains('button', 'Devices').click()
    
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('BATTERY')
    
    cy.contains('Max Power (MW)').parent().find('input').clear().type('50')
    cy.contains('Capacity (MWh)').parent().find('input').clear().type('100')
    cy.contains('Efficiency').parent().find('input').clear().type('0.85')
    cy.contains('Max DoD').parent().find('input').clear().type('0.8')
    cy.contains('Degradation/Cycle').parent().find('input').clear().type('0.001')
    
    cy.contains('button', 'Save Scenario').click()
    cy.contains('Saved').should('be.visible')
  })

  it('should add multiple devices and remove one', () => {
    cy.contains('button', 'Devices').click()
    
    // Add Coal
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('COAL')
    
    // Add Gas
    cy.contains('button', 'Add Device').click()
    cy.get('select').eq(1).select('GAS')
    
    // Should show 2 devices
    cy.get('select').should('have.length', 2)
    
    // Remove first device
    cy.contains('button', 'Remove').first().click()
    
    // Should show 1 device
    cy.get('select').should('have.length', 1)
  })

  it('should persist devices after save and reload', () => {
    cy.contains('button', 'Devices').click()
    
    // Add Nuclear device
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('NUCLEAR')
    cy.contains('Max Power (MW)').parent().find('input').clear().type('900')
    
    // Fill General tab to create valid scenario
    cy.contains('button', 'General').click()
    cy.get('input[value="New Scenario"]').clear().type('Device Test Scenario')
    
    // Save
    cy.contains('button', 'Save Scenario').click()
    cy.contains('Saved').should('be.visible')
    
    // Reload page
    cy.reload()
    
    // Go back to Devices tab
    cy.contains('button', 'Devices').click()
    
    // Should show Nuclear device
    cy.get('select').should('have.value', 'NUCLEAR')
    cy.contains('Max Power (MW)').parent().find('input').should('have.value', '900')
  })

  it('should show device type info labels', () => {
    cy.contains('button', 'Devices').click()
    cy.contains('button', 'Add Device').click()
    
    // Should show InfoLabel tooltips
    cy.contains('Max Power (MW)').should('be.visible')
    cy.contains('Min Load (%)').should('be.visible')
    cy.contains('Ramp Rate (MW/min)').should('be.visible')
  })

  it('should handle different load types', () => {
    cy.contains('button', 'Devices').click()
    
    // Industrial Load
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('INDUSTRIAL_LOAD')
    cy.contains('Min Load (MW)').parent().find('input').clear().type('300')
    cy.contains('Max Load (MW)').parent().find('input').clear().type('450')
    
    // Commercial Load
    cy.contains('button', 'Add Device').click()
    cy.get('select').eq(1).select('COMMERCIAL_LOAD')
    cy.contains('Min Load (MW)').parent().find('input').eq(1).clear().type('100')
    cy.contains('Max Load (MW)').parent().find('input').eq(1).clear().type('200')
    
    cy.contains('button', 'Save Scenario').click()
    cy.contains('Saved').should('be.visible')
  })
})
