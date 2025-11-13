// Cypress support - can add commands here

// Ignore app uncaught exceptions so tests can proceed when UI throws non-critical errors in mocked flows
Cypress.on('uncaught:exception', (err) => {
	// you can filter by message if desired
	return false
})