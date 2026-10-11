// Runs before the page is drawn, so that a device set to light, or one that
// asks for more contrast, never sees a flash of the dark scheme.
// web/src/appearance.ts takes over as soon as the app has loaded, with the
// choices of the member; keep the two in agreement.
(() => {
  var root = document.documentElement;
  var asks = (query) => window.matchMedia?.(query).matches;
  root.dataset.scheme = asks('(prefers-color-scheme: light)') ? 'light' : 'dark';
  if (asks('(prefers-contrast: more)')) root.dataset.contrast = 'more';
})();
