// Writes api/resources/emailTheme.json, what the server needs to draw an email
// (issue #65), from web/src/styles/tokens.css: the one source of the colours
// and sizes of the app. An email is drawn in the Dark scheme and the default
// theme of the band (Figma, page Emails), so the file holds, for each accent
// theme, the colours of the Dark scheme resolved to plain values, and the
// sizes in pixels.
//
// A colour with transparency is flattened over the sheet of its theme: some
// mail clients (Outlook) draw no transparency, and every translucent colour
// of an email sits on the sheet.
//
//   node scripts/email-theme.mjs          writes the file
//   node scripts/email-theme.mjs --check  fails when the file is not the one
//                                         tokens.css gives (npm run check)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokensPath = join(root, 'web/src/styles/tokens.css');
const outPath = join(root, 'api/resources/emailTheme.json');
const themesPath = join(root, 'web/src/themes.ts');

// The semantic colours an email uses (Figma: the Scheme collection).
const COLOURS = [
  'ground',
  'sheet',
  'control',
  'border',
  'text',
  'textMuted',
  'accent',
  'onAccent',
  'accentText',
  'success',
  'successSoft',
  'warning',
  'warningSoft',
  'info',
  'infoSoft',
];
// The sizes it uses, in pixels (Figma: the Size collection, text at 100 %).
const SIZES = [
  'spaceXxs',
  'spaceXs',
  'spaceSm',
  'spaceMd',
  'spaceXl',
  'spaceXxl',
  'radiusSm',
  'radiusLg',
  'controlHeight',
  'textSizeTitle',
  'textSizeHeading',
  'textSizeBodyLarge',
  'textSizeButton',
  'textSizeCaption',
];

const css = readFileSync(tokensPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every block whose selector list matches. */
function declarations(matches) {
  const found = {};
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const list = selectors.split(',').map((one) => one.trim());
    if (!matches(list)) continue;
    for (const [, name, value] of body.matchAll(/--([A-Za-z0-9]+)\s*:\s*([^;]+);/g)) {
      found[name] = value.trim();
    }
  }
  return found;
}

const base = declarations((list) => list.includes(':root'));
const dark = declarations((list) => list.includes('[data-scheme="dark"]'));
const themeNames = [
  ...readFileSync(themesPath, 'utf8')
    .match(/accentThemes = \[([^\]]*)\]/)[1]
    .matchAll(/'([a-z]+)'/g),
].map((match) => match[1]);

/** A colour as [r, g, b, a], from #rrggbb or rgb(r g b / a). */
function parse(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)];
  throw new Error(`Not a colour: ${value}`);
}

const hexOf = ([r, g, b]) =>
  `#${[r, g, b].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;

const theme = {};
for (const name of themeNames) {
  const own = declarations((list) => list.includes(`[data-theme="${name}"]`));
  const vars = { ...base, ...own, ...dark };
  const resolve = (value, depth = 0) => {
    const alias = value.match(/^var\(--([A-Za-z0-9]+)\)$/);
    if (!alias) return value;
    if (depth > 10 || vars[alias[1]] === undefined) throw new Error(`Cannot resolve ${value}`);
    return resolve(vars[alias[1]], depth + 1);
  };
  const sheet = parse(resolve('var(--sheet)'));
  const colours = {};
  for (const colour of COLOURS) {
    const [r, g, b, a] = parse(resolve(`var(--${colour})`));
    colours[colour] = hexOf([0, 1, 2].map((i) => [r, g, b][i] * a + sheet[i] * (1 - a)));
  }
  theme[name] = colours;
}

const sizes = {};
for (const size of SIZES) {
  const value = base[size];
  const rem = value?.match(/^([\d.]+)rem$/);
  if (!rem) throw new Error(`Not a size in rem: --${size}`);
  sizes[size] = Number(rem[1]) * 16;
}

const json = `${JSON.stringify(
  {
    note: 'Written by scripts/email-theme.mjs from web/src/styles/tokens.css. Do not edit: run npm run email:theme.',
    themes: theme,
    sizes,
  },
  null,
  2,
)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outPath, 'utf8');
  } catch {}
  if (current !== json) {
    console.error('api/resources/emailTheme.json is not up to date: run npm run email:theme.');
    process.exit(1);
  }
} else {
  writeFileSync(outPath, json);
  console.log(`Wrote ${outPath}`);
}
