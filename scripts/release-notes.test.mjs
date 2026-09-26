import { describe, expect, it } from 'vitest';
import { releaseNotes } from './release-notes.mjs';

const changelog = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '## [1.1.0] - 2026-10-01',
  '',
  '### Added',
  '- Find & Replace.',
  '',
  '## [1.0.0] - 2025-08-08',
  '',
  '### Added',
  '- Extract and import.',
  '',
].join('\n');

describe('releaseNotes', () => {
  it('returns the section body up to the next version heading', () => {
    expect(releaseNotes(changelog, '1.1.0')).toBe('### Added\n- Find & Replace.');
  });

  it('returns the last section up to the end of the file', () => {
    expect(releaseNotes(changelog, '1.0.0')).toBe('### Added\n- Extract and import.');
  });

  it('matches the version exactly, not as a prefix', () => {
    expect(() => releaseNotes(changelog, '1.1')).toThrow('no "## [1.1]" section');
  });

  it('rejects a missing section', () => {
    expect(() => releaseNotes(changelog, '2.0.0')).toThrow('no "## [2.0.0]" section');
  });

  it('rejects an empty section', () => {
    expect(() => releaseNotes(changelog, 'Unreleased')).toThrow('section is empty');
  });

  it('accepts CRLF line endings', () => {
    expect(releaseNotes(changelog.replace(/\n/g, '\r\n'), '1.0.0')).toBe(
      '### Added\n- Extract and import.',
    );
  });
});
