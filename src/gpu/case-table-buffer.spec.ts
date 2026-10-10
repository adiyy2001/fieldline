import { describe, expect, it } from 'vitest';
import { CASE_COUNT, CUBE_EDGES, caseTable } from '../core/isosurface/case-table';
import { gpuCaseTable } from './case-table-buffer';

describe('the marching cubes table for the GPU', () => {
  const packed = gpuCaseTable();
  const table = caseTable();

  it('starts with the corner pairs of the twelve edges', () => {
    expect(packed.caseOffset).toBe(24);
    CUBE_EDGES.forEach((edge, index) => {
      expect(packed.data[index * 2]).toBe(edge.from);
      expect(packed.data[index * 2 + 1]).toBe(edge.to);
    });
  });

  it('stores the triangle count and the edge triples of every case', () => {
    expect(packed.caseStride).toBe(1 + table.maxTriangles * 3);
    expect(packed.data.length).toBe(packed.caseOffset + CASE_COUNT * packed.caseStride);
    for (let mask = 0; mask < CASE_COUNT; mask += 1) {
      const entry = packed.caseOffset + mask * packed.caseStride;
      const count = table.triangleCounts[mask] ?? 0;
      expect(packed.data[entry]).toBe(count);
      for (let corner = 0; corner < count * 3; corner += 1) {
        const edge = packed.data[entry + 1 + corner] ?? -1;
        expect(edge).toBe(table.edgeTriples[mask * table.maxTriangles * 3 + corner]);
        expect(edge).toBeGreaterThanOrEqual(0);
        expect(edge).toBeLessThan(CUBE_EDGES.length);
      }
    }
  });

  it('has no triangles for the empty and the full cube', () => {
    expect(packed.data[packed.caseOffset]).toBe(0);
    expect(packed.data[packed.caseOffset + 255 * packed.caseStride]).toBe(0);
  });
});
