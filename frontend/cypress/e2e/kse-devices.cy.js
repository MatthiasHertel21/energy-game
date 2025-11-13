describe('KSE Devices Tab', () => {
  beforeEach(() => {
    // Stub backend APIs used by KSE so tests run without backend
    const deviceTypes = [
      { type: 'coal', name: 'Coal Power Plant', description: 'Coal', defaults: { max_power_mw: 500, min_load_pct: 40, ramp_rate_mw_per_min: 5, variable_cost_zar_per_mwh: 400 }, required_params: ['max_power_mw','min_load_pct','ramp_rate_mw_per_min','variable_cost_zar_per_mwh'], optional_params: ['efficiency_pct'] },
      { type: 'nuclear', name: 'Nuclear Power Plant', description: 'Nuclear', defaults: { max_power_mw: 900, min_load_pct: 90, ramp_rate_mw_per_min: 1, variable_cost_zar_per_mwh: 100 }, required_params: ['max_power_mw','min_load_pct','ramp_rate_mw_per_min','variable_cost_zar_per_mwh'], optional_params: ['efficiency_pct'] },
      { type: 'solar', name: 'Solar PV', description: 'Solar', defaults: { max_power_mw: 200, capacity_factor_pct: 25, variable_cost_zar_per_mwh: 0 }, required_params: ['max_power_mw'], optional_params: ['capacity_factor_pct','variable_cost_zar_per_mwh'] },
      { type: 'battery', name: 'Battery Storage', description: 'Battery', defaults: { capacity_mwh: 100, power_mw: 50, efficiency_pct: 85, max_dod_pct: 80, degradation_pct_per_cycle: 0.1 }, required_params: ['capacity_mwh','power_mw','efficiency_pct'], optional_params: ['max_dod_pct','degradation_pct_per_cycle'] },
      { type: 'gas', name: 'Gas Turbine (OCGT)', description: 'Gas', defaults: { max_power_mw: 200, min_load_pct: 20, ramp_rate_mw_per_min: 15, variable_cost_zar_per_mwh: 1200 }, required_params: ['max_power_mw','min_load_pct','ramp_rate_mw_per_min','variable_cost_zar_per_mwh'], optional_params: [] },
      { type: 'industrial_load', name: 'Industrial Load', description: 'Load', defaults: { baseline_load_mw: 300, peak_load_mw: 450, drm_capable: true }, required_params: ['baseline_load_mw','peak_load_mw'], optional_params: ['drm_capable'] },
      { type: 'commercial_load', name: 'Commercial Load', description: 'Load', defaults: { baseline_load_mw: 100, peak_load_mw: 200, drm_capable: false }, required_params: ['baseline_load_mw','peak_load_mw'], optional_params: ['drm_capable'] },
    ]
    cy.intercept('GET', '/api/kse/device-types', deviceTypes).as('deviceTypes')
    cy.intercept('POST', '/api/kse/scenarios', { id: 101, name: 'Test', ok: true }).as('createScenario')
    cy.intercept('PUT', /\/api\/kse\/scenarios\/\d+/, { statusCode: 200, body: { ok: true } }).as('updateScenario')

    // Visit KSE with mocked auth to avoid flaky login
    cy.visit('/kse', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
        win.localStorage.setItem('access_token', 'mock')
        win.localStorage.setItem('refresh_token', 'mock')
      }
    })
    cy.contains('KSE – Scenario Editor').should('be.visible')
    cy.wait('@deviceTypes')
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
    
    // Select Coal type (by display name)
    cy.get('select').first().select('Coal Power Plant')
    
    // Fill in Coal-specific parameters (by param keys)
  cy.contains('max_power_mw').parent().parent().find('input').clear().type('500')
  cy.contains('min_load_pct').parent().parent().find('input').clear().type('40')
  cy.contains('ramp_rate_mw_per_min').parent().parent().find('input').clear().type('5')
  cy.contains('variable_cost_zar_per_mwh').parent().parent().find('input').clear().type('400')
    
    // Save scenario
    cy.on('window:alert', (txt) => { expect(txt).to.match(/Saved/) })
    cy.contains('button', 'Save Scenario').click()
  })

  it('should add a Nuclear device with Koeberg specs', () => {
    cy.contains('button', 'Devices').click()
    
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('Nuclear Power Plant')
    
  cy.contains('max_power_mw').parent().parent().find('input').clear().type('900')
  cy.contains('min_load_pct').parent().parent().find('input').clear().type('90')
  cy.contains('ramp_rate_mw_per_min').parent().parent().find('input').clear().type('1')
  cy.contains('variable_cost_zar_per_mwh').parent().parent().find('input').clear().type('100')
    
    cy.on('window:alert', (txt) => { expect(txt).to.match(/Saved/) })
    cy.contains('button', 'Save Scenario').click()
  })

  it('should add a Solar device with capacity factor', () => {
    cy.contains('button', 'Devices').click()
    
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('Solar PV')
    
  cy.contains('max_power_mw').parent().parent().find('input').clear().type('200')
  cy.contains('capacity_factor_pct').parent().parent().find('input').clear().type('25')
    
    cy.on('window:alert', (txt) => { expect(txt).to.match(/Saved/) })
    cy.contains('button', 'Save Scenario').click()
  })

  it('should add a Battery device with storage parameters', () => {
    cy.contains('button', 'Devices').click()
    
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('Battery Storage')
    
  cy.contains('power_mw').parent().parent().find('input').clear().type('50')
  cy.contains('capacity_mwh').parent().parent().find('input').clear().type('100')
  cy.contains('efficiency_pct').parent().parent().find('input').clear().type('85')
  cy.contains('max_dod_pct').parent().parent().find('input').clear().type('80')
  cy.contains('degradation_pct_per_cycle').parent().parent().find('input').clear().type('0.1')
    
    cy.on('window:alert', (txt) => { expect(txt).to.match(/Saved/) })
    cy.contains('button', 'Save Scenario').click()
  })

  it('should add multiple devices and remove one', () => {
    cy.contains('button', 'Devices').click()
    
  // Add Coal
  cy.contains('button', 'Add Device').click()
  cy.get('select').first().select('Coal Power Plant')
    
    // Add Gas
    cy.contains('button', 'Add Device').click()
  cy.get('select').eq(1).select('Gas Turbine (OCGT)')
    
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
    cy.get('select').first().select('Nuclear Power Plant')
    cy.contains('max_power_mw').parent().parent().find('input').clear().type('900')
    
    // Fill General tab to create valid scenario
    cy.contains('button', 'General').click()
    cy.get('input[value="New Scenario"]').clear().type('Device Test Scenario')
    
    // Save (mocked)
    cy.on('window:alert', (txt) => { expect(txt).to.match(/Saved/) })
    cy.contains('button', 'Save Scenario').click()
    
    // Revisit with id=101 to simulate fetching saved scenario
    cy.visit('/kse?id=101', {
      onBeforeLoad(win){
        win.localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }))
        win.localStorage.setItem('access_token', 'mock')
        win.localStorage.setItem('refresh_token', 'mock')
      }
    })
    
    cy.contains('button', 'Devices').click()
    cy.get('select').should('have.value', 'nuclear')
    cy.contains('max_power_mw').parent().parent().find('input').should('have.value', '900')
  })

  it('should show device type info labels', () => {
    cy.contains('button', 'Devices').click()
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('Coal Power Plant')
    
    // Should show InfoLabel labels
    cy.contains('max_power_mw').should('be.visible')
    cy.contains('min_load_pct').should('be.visible')
    cy.contains('ramp_rate_mw_per_min').should('be.visible')
  })

  it('should handle different load types', () => {
    cy.contains('button', 'Devices').click()
    
    // Industrial Load
    cy.contains('button', 'Add Device').click()
    cy.get('select').first().select('Industrial Load')
  cy.contains('baseline_load_mw').parent().parent().find('input').clear().type('300')
  cy.contains('peak_load_mw').parent().parent().find('input').clear().type('450')
    
    // Commercial Load
    cy.contains('button', 'Add Device').click()
    cy.get('select').eq(1).select('Commercial Load')
  cy.contains('baseline_load_mw').parent().parent().find('input').eq(1).clear().type('100')
  cy.contains('peak_load_mw').parent().parent().find('input').eq(1).clear().type('200')
    
    cy.on('window:alert', (txt) => { expect(txt).to.match(/Saved/) })
    cy.contains('button', 'Save Scenario').click()
  })
})
