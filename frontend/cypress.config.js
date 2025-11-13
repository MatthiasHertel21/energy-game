import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
  baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:18081',
    supportFile: 'cypress/support/e2e.js',
    video: false,
  },
})