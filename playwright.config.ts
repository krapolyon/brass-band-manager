import { defineConfig, devices } from '@playwright/test';

// The install guide comes once per phone, after sign-in. Every test of a
// screen starts on a device where it was already offered, so that signing in
// leads home; the tests of the guide start from an empty device.
const guideOffered = {
  cookies: [],
  // 8082: the test server without a mail server.
  origins: ['http://localhost:8081', 'http://localhost:8082'].map((origin) => ({
    origin,
    localStorage: [{ name: 'installGuideOffered', value: '1' }],
  })),
};

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
    {
      name: 'android',
      testIgnore: 'api/**',
      use: { ...devices['Pixel 7'], storageState: guideOffered },
    },
    {
      name: 'iphone',
      testIgnore: 'api/**',
      use: { ...devices['iPhone 14'], storageState: guideOffered },
    },
  ],
});
