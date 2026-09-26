import { describe, expect, it } from 'vitest';
import { crc32, writeZip } from './zip';
import { readStoredZip } from './read-zip';

const decoder = new TextDecoder();

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for no bytes', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('writeZip', () => {
  const date = new Date(2026, 8, 26, 12, 30, 10);

  it('stores every entry in order, with its contents intact', () => {
    const zip = writeZip(
      [
        { name: 'mimetype', data: 'application/epub+zip' },
        { name: 'dir/a.bin', data: new Uint8Array([0, 255, 7]) },
      ],
      date
    );
    const files = readStoredZip(zip);
    expect(Array.from(files.keys())).toEqual(['mimetype', 'dir/a.bin']);
    expect(decoder.decode(files.get('mimetype'))).toBe('application/epub+zip');
    expect(Array.from(files.get('dir/a.bin')!)).toEqual([0, 255, 7]);
  });

  it('marks names as UTF-8 and keeps non-ASCII names', () => {
    const zip = writeZip([{ name: '홈 화면.pdf', data: 'x' }], date);
    expect(new DataView(zip.buffer).getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(Array.from(readStoredZip(zip).keys())).toEqual(['홈 화면.pdf']);
  });

  it('ends with a directory record that counts the entries and points at the directory', () => {
    const zip = writeZip([{ name: 'a', data: 'x' }, { name: 'b', data: 'yy' }], date);
    const view = new DataView(zip.buffer);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const directory = view.getUint32(end + 16, true);
    expect(view.getUint32(directory, true)).toBe(0x02014b50);
  });

  it('writes an empty archive as just the end record', () => {
    expect(writeZip([], date)).toHaveLength(22);
  });
});
