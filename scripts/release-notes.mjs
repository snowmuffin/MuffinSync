// Prints the CHANGELOG section for one version, for use as GitHub Release notes.
// Usage: node scripts/release-notes.mjs 1.1.0
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Returns the body under `## [version]`, up to the next `## ` heading, trimmed.
// Throws when the section is missing or empty, so a release cannot ship without
// the notes having been written.
export function releaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const heading = `## [${version}]`;
  const start = lines.findIndex((line) => line === heading || line.startsWith(`${heading} `));
  if (start === -1) {
    throw new Error(`CHANGELOG.md has no "${heading}" section`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  if (body === '') {
    throw new Error(`CHANGELOG.md's "${heading}" section is empty`);
  }
  return body;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!version) {
    console.error('usage: node scripts/release-notes.mjs <version>');
    process.exit(2);
  }
  try {
    const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
    process.stdout.write(`${releaseNotes(changelog, version)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
