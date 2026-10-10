import { describe, expect, it } from 'vitest';
import {
  EXTRACT_PARAMS_BYTES,
  SURFACE_DRAW_BYTES,
  SURFACE_VERTEX_BYTES,
  packExtractParams,
  packSurfaceDraw,
  surfaceLevels,
  usableVertexCount,
  vertexCapacityFor,
  volumeSpacingOf,
} from './surface-params';

const SPEC = { xMin: -50, xMax: 50, yMin: 0, yMax: 60, zMin: 0, zMax: 126, nx: 51, ny: 31, nz: 64 };

describe('isosurface parameters', () => {
  it('computes the node spacing from the volume spec', () => {
    expect(volumeSpacingOf(SPEC)).toEqual({ x: 2, y: 2, z: 2 });
    expect(volumeSpacingOf({ ...SPEC, nx: 1 }).x).toBe(100);
  });

  it('lays the extraction uniform out as the shader reads it', () => {
    const buffer = packExtractParams(SPEC, 5, 1, 999);
    expect(buffer.byteLength).toBe(EXTRACT_PARAMS_BYTES);
    const floats = new Float32Array(buffer);
    const words = new Uint32Array(buffer);
    expect(Array.from(floats.slice(0, 8))).toEqual([-50, 0, 0, 0, 2, 2, 2, 0]);
    expect(Array.from(words.slice(8, 12))).toEqual([51, 31, 64, 999]);
    expect(Array.from(floats.slice(12, 14))).toEqual([5, 1]);
  });

  it('writes the matrix, camera and four colours into the draw uniform', () => {
    const matrix = Float32Array.from({ length: 16 }, (_, index) => index + 1);
    const buffer = packSurfaceDraw(matrix, { x: 7, y: 8, z: 9 });
    expect(buffer.byteLength).toBe(SURFACE_DRAW_BYTES);
    const floats = new Float32Array(buffer);
    expect(Array.from(floats.slice(0, 16))).toEqual(Array.from(matrix));
    expect(Array.from(floats.slice(16, 19))).toEqual([7, 8, 9]);
    expect(floats[23]).toBeGreaterThan(0);
  });

  it('limits the vertex capacity by the request, the buffer limit and the cell count', () => {
    expect(vertexCapacityFor(1_000_000, 1 << 30, 300)).toBe(300);
    expect(vertexCapacityFor(1_000_000, SURFACE_VERTEX_BYTES * 30, 300_000)).toBe(30);
    expect(vertexCapacityFor(10, 1 << 30, 300_000)).toBe(60);
    expect(vertexCapacityFor(0, 1 << 30)).toBe(3);
  });

  it('keeps whole triangles when the counter exceeds the capacity', () => {
    expect(usableVertexCount(100, 90)).toBe(90);
    expect(usableVertexCount(100, 200)).toBe(99);
    expect(usableVertexCount(0, 200)).toBe(0);
  });

  it('keeps at most three levels that fall inside the data range', () => {
    expect(surfaceLevels([0, 1, 5, 10, 50, 500], 100)).toEqual([1, 5, 10]);
    expect(surfaceLevels([200], 100)).toEqual([]);
  });
});
