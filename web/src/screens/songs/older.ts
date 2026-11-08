// Whether this browser is older than the ones the app is built for (1.1.0):
// Safari and iOS 16.4, Chrome 111, Firefox 114 (docs/architecture.md, "The
// browsers the app runs on"). Told by a feature, never by the name of the
// browser (Figma: Songs, section 22): the engines of the PDF, the MIDI player
// and the reading mode are written for that baseline, and a browser below it
// cannot even read their files. Look-behind in a regular expression came
// with Safari 16.4, the last of the three to have it; it is tested through
// the RegExp constructor, which the security policy of the app allows.
export function isOlderThanTheApp(): boolean {
  try {
    // Through Reflect, never as a literal: a literal would stop the whole file
    // from being read on such a browser, and a plain `new RegExp('…')` is
    // turned into a literal by the code checks, or dropped by the minifier.
    const pattern = Reflect.construct(RegExp, ['(?<=a)b']) as RegExp;
    return !pattern.test('ab');
  } catch {
    return true;
  }
}
