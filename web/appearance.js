// Runs before the page is drawn, so that a device set to light, or one that
// asks for more contrast, never sees a flash of the dark scheme.
// web/src/appearance.ts takes over as soon as the app has loaded, with the
// choices of the member; keep the two in agreement.
(() => {
  var root = document.documentElement;
  var asks = (query) => window.matchMedia?.(query).matches;
  var light = asks('(prefers-color-scheme: light)');
  root.dataset.scheme = light ? 'light' : 'dark';
  // On an iPhone set to light, a translucent status bar would write its clock
  // in white over a light ground: the bar of the light scheme instead (#28).
  // Read when the installed app starts, so it follows the device.
  var bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar && light) bar.setAttribute('content', 'default');
  if (asks('(prefers-contrast: more)')) root.dataset.contrast = 'more';
})();
