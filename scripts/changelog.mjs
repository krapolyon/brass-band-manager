// The changelog of the app: npm run changelog
//
// web/src/changelog/en.json is the source, written in English, the newest
// version first; web/src/changelog/fr.json holds the French of each line,
// by version and by English line. This script writes CHANGELOG.md from
// en.json: never edit CHANGELOG.md by hand.
//
// With --check (run by npm run check), it writes nothing and fails when:
//   - the version of package.json has no entry in en.json, or not the first;
//   - a line of that entry, or its note, has no French;
//   - CHANGELOG.md is not what en.json gives (run npm run changelog).
// See docs/architecture.md, "Versions and the changelog".

import { readFileSync, writeFileSync } from 'node:fs';

const KINDS = { added: 'Added', changed: 'Changed', fixed: 'Fixed' };

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const entries = read('web/src/changelog/en.json');
const french = read('web/src/changelog/fr.json');
const { version } = read('package.json');

function markdown() {
  const lines = [
    '# Changelog',
    '',
    'What changes in the app, version after version. This file is written by',
    '`npm run changelog` from `web/src/changelog/en.json`: do not edit it by hand.',
  ];
  for (const entry of entries) {
    const note = entry.note ? ` — ${entry.note}` : '';
    lines.push('', `## ${entry.version} — ${entry.date}${note}`);
    for (const [kind, title] of Object.entries(KINDS)) {
      const changes = entry.changes.filter((change) => change.kind === kind);
      if (changes.length === 0) continue;
      lines.push('', `### ${title}`, '');
      for (const change of changes) lines.push(`- ${change.text}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function problems() {
  const found = [];
  for (const entry of entries) {
    if (entry.note !== undefined && (typeof entry.note !== 'string' || entry.note === '')) {
      found.push(`${entry.version}: the note, when there is one, is a text.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '')) {
      found.push(`${entry.version}: the date is not written YYYY-MM-DD.`);
    }
    for (const change of entry.changes ?? []) {
      if (!(change.kind in KINDS)) found.push(`${entry.version}: unknown kind "${change.kind}".`);
    }
  }
  const current = entries.find((entry) => entry.version === version);
  if (!current) {
    found.push(`Version ${version} of package.json has no entry in web/src/changelog/en.json.`);
  } else if (entries[0] !== current) {
    found.push(`The entry of version ${version} must come first in web/src/changelog/en.json.`);
  } else {
    const texts = current.changes.map((change) => change.text);
    if (current.note) texts.push(current.note);
    for (const text of texts) {
      if (!french[version]?.[text]) {
        found.push(`No French in web/src/changelog/fr.json for "${text}".`);
      }
    }
  }
  let written = '';
  try {
    written = readFileSync('CHANGELOG.md', 'utf8');
  } catch {
    // Missing: said below.
  }
  if (written !== markdown()) found.push('CHANGELOG.md is not up to date: run npm run changelog.');
  return found;
}

if (process.argv.includes('--check')) {
  const found = problems();
  if (found.length > 0) {
    console.error(`Changelog:\n${found.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`Changelog: version ${version} has its entry, in English and in French.`);
} else {
  writeFileSync('CHANGELOG.md', markdown());
  console.log('CHANGELOG.md written from web/src/changelog/en.json.');
}
