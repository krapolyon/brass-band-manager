import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the local test server (port 8081), which serves
// the built front and the API the way the host does, on a database of its own
// that the tests empty at will. See docs/architecture.md, "Tests".
export default defineConfig({
  testDir: 'tests',
  // One test at a time: the tests of the API share one database.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8081',
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [
    // The API alone, without a browser.
    { name: 'api', testMatch: 'api/**/*.spec.ts' },
    // The screens, on phone-sized viewports only: the phone is the main use.
    { name: 'android', testIgnore: 'api/**', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', testIgnore: 'api/**', use: { ...devices['iPhone 14'] } },
  ],
});
