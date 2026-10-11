import type { Page } from '@playwright/test';

type Options = {
  textSizePercent?: 100 | 120 | 140 | 160 | 180 | 200;
  hasHighContrast?: boolean;
  hasIncreasedSpacing?: boolean;
  hasLegibleFont?: boolean;
  hasReducedMotion?: boolean;
  hasExtendedTimeouts?: boolean;
};

/**
 * Turns accessibility options on for a page where nobody is signed in, the
 * way the app keeps them: in the storage of the browser. Applies from the
 * next page load on.
 */
export async function chooseAccessibility(page: Page, options: Options): Promise<void> {
  await page.addInitScript((chosen) => {
    localStorage.setItem('accessibility', JSON.stringify(chosen));
  }, options);
}
