import { test as base, type ConsoleMessage, expect } from '@playwright/test';

// The `test` of every screen test: Playwright's own, plus one check after
// each test, that no page was refused something by the Content Security
// Policy of the front (web/public/.htaccess, issue #51). A screen that loads
// a resource the policy does not allow fails here, with what was refused,
// instead of silently losing its map, its score or its clip.
//
// Browsers write such a refusal to the console of the page or of the
// worker, which survives navigation, unlike an event listener in the page.
// Not every refusal is written: a function written at run time inside a
// worker is refused as an error thrown to the code (the MuseScore engine
// without its exception). The tests of the screen then fail on what it no
// longer shows, which is why every screen test runs under the policy.
export const test = base.extend<{ cspRefusals: string[] }>({
  cspRefusals: [
    async ({ page }, use) => {
      const refusals: string[] = [];
      const listen = (message: ConsoleMessage) => {
        const text = message.text();
        if (/Content Security Policy|Content-Security-Policy/i.test(text)) refusals.push(text);
      };
      page.on('console', listen);
      // A worker (the MuseScore engine, the map) writes to a console of its own.
      page.on('worker', (worker) => worker.on('console', listen));
      await use(refusals);
      expect(refusals, 'refused by the Content Security Policy').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
