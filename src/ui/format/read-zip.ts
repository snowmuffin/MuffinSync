import { crc32 } from './zip';

/**
 * Reads back a stored-only ZIP such as `writeZip` produces, by walking its
 * local headers. Test support: it lets tests check what went into an export
 * without a ZIP library. Throws on a CRC mismatch.
 */
export function readStoredZip(zip: Uint8Array): Map<string, Uint8Array> {
  const decoder = new TextDecoder();
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const files = new Map<string, Uint8Array>();
  let at = 0;
  while (at + 4 <= zip.length && view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const name = decoder.decode(zip.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength + extra;
    const data = zip.subarray(start, start + size);
    if (crc32(data) !== view.getUint32(at + 14, true)) throw new Error(`CRC mismatch in ${name}`);
    files.set(name, data);
    at = start + size;
  }
  return files;
}
