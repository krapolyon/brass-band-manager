import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the local Docker stack, which serves the built
// front and the API the way the host does. Phone-sized viewports only: the
// phone is the main use.
export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8080',
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
});
