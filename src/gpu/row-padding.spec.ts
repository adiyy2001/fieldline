import { describe, expect, it } from 'vitest';
import { alignedRowBytes, unpadRows } from './row-padding';

describe('texture readback helpers', () => {
  it('rounds row sizes up to 256 bytes', () => {
    expect(alignedRowBytes(1)).toBe(256);
    expect(alignedRowBytes(64)).toBe(256);
    expect(alignedRowBytes(65)).toBe(512);
    expect(alignedRowBytes(640)).toBe(2560);
  });

  it('removes the row padding', () => {
    const rowBytes = alignedRowBytes(2);
    const padded = new Uint8Array(rowBytes * 2).fill(99);
    padded.set([1, 2, 3, 4, 5, 6, 7, 8], 0);
    padded.set([9, 10, 11, 12, 13, 14, 15, 16], rowBytes);
    expect(Array.from(unpadRows(padded, 2, 2))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });
});
