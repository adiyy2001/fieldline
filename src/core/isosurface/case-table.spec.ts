import { describe, expect, it } from 'vitest';
import {
  CASE_COUNT,
  CUBE_EDGES,
  CUBE_FACES,
  caseTable,
  cornerOffset,
  crossedEdgesOfCase,
  faceSegments,
  surfaceCycles,
  trianglesOfCase,
  triangulateCycle,
} from './case-table';

function edgeMidpoint(edgeIndex: number): readonly [number, number, number] {
  const edge = CUBE_EDGES[edgeIndex];
  if (edge === undefined) {
    return [0, 0, 0];
  }
  const a = cornerOffset(edge.from);
  const b = cornerOffset(edge.to);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function subtract(a: readonly number[], b: readonly number[]): number[] {
  return [(a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0)];
}

function cross(a: readonly number[], b: readonly number[]): number[] {
  return [
    (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
    (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
    (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
  ];
}

function dot(a: readonly number[], b: readonly number[]): number {
  return (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
}

function popcount(mask: number): number {
  let count = 0;
  for (let corner = 0; corner < 8; corner += 1) {
    count += (mask >> corner) & 1;
  }
  return count;
}

function directionToOutside(mask: number, edges: readonly number[]): number[] {
  const total = [0, 0, 0];
  for (const edgeIndex of edges) {
    const edge = CUBE_EDGES[edgeIndex];
    if (edge === undefined) {
      continue;
    }
    const fromInside = ((mask >> edge.from) & 1) === 1;
    const inside = cornerOffset(fromInside ? edge.from : edge.to);
    const outside = cornerOffset(fromInside ? edge.to : edge.from);
    const step = subtract(outside, inside);
    for (let axis = 0; axis < 3; axis += 1) {
      total[axis] = (total[axis] ?? 0) + (step[axis] ?? 0);
    }
  }
  return total;
}

describe('the marching cubes case table', () => {
  it('has an entry for every corner mask and no surface for the empty and full cubes', () => {
    const table = caseTable();
    expect(table.triangleCounts).toHaveLength(CASE_COUNT);
    expect(table.triangleCounts[0]).toBe(0);
    expect(table.triangleCounts[CASE_COUNT - 1]).toBe(0);
    expect(table.edgeTriples).toHaveLength(CASE_COUNT * table.maxTriangles * 3);
  });

  it('puts every crossed edge into exactly one cycle of at least three edges', () => {
    for (let mask = 0; mask < CASE_COUNT; mask += 1) {
      const cycles = surfaceCycles(mask);
      const used = cycles.flat();
      expect(new Set(used).size).toBe(used.length);
      expect([...used].sort((a, b) => a - b)).toEqual([...crossedEdgesOfCase(mask)]);
      for (const cycle of cycles) {
        expect(cycle.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('winds every cycle so the normal points from the inside towards the outside', () => {
    for (let mask = 1; mask < CASE_COUNT - 1; mask += 1) {
      for (const cycle of surfaceCycles(mask)) {
        const points = cycle.map(edgeMidpoint);
        const anchor = points[0] ?? [0, 0, 0];
        let area: number[] = [0, 0, 0];
        for (let index = 1; index + 1 < points.length; index += 1) {
          const normal = cross(
            subtract(points[index] ?? anchor, anchor),
            subtract(points[index + 1] ?? anchor, anchor),
          );
          area = area.map((value, axis) => value + (normal[axis] ?? 0));
        }
        expect(dot(area, directionToOutside(mask, cycle))).toBeGreaterThan(0);
      }
    }
  });

  it('triangulates a cycle of n edges into n minus 2 triangles', () => {
    expect(triangulateCycle([4, 5, 6, 7, 8])).toHaveLength(3);
    expect(triangulateCycle([])).toEqual([]);
    for (let mask = 0; mask < CASE_COUNT; mask += 1) {
      const edges = crossedEdgesOfCase(mask).length;
      const cycles = surfaceCycles(mask);
      expect(trianglesOfCase(mask).length).toBe(edges - 2 * cycles.length);
    }
  });

  it('cuts a single inside corner off with one triangle', () => {
    for (let corner = 0; corner < 8; corner += 1) {
      expect(trianglesOfCase(1 << corner)).toHaveLength(1);
    }
  });

  it('stores the triangles of each case in the table and pads the rest with minus one', () => {
    const table = caseTable();
    for (let mask = 0; mask < CASE_COUNT; mask += 1) {
      const triangles = trianglesOfCase(mask);
      for (let slot = 0; slot < table.maxTriangles; slot += 1) {
        const triangle = triangles[slot];
        const stored = Array.from(
          table.edgeTriples.subarray((mask * table.maxTriangles + slot) * 3).slice(0, 3),
        );
        expect(stored).toEqual(triangle === undefined ? [-1, -1, -1] : [...triangle]);
      }
    }
  });

  it('lets neighbouring cells agree on the segments of a shared face', () => {
    for (const face of CUBE_FACES) {
      const opposite = CUBE_FACES.find(
        (candidate) => candidate.axis === face.axis && candidate.side !== face.side,
      );
      if (opposite === undefined) {
        throw new Error('A face has no opposite');
      }
      const mapEdge = (edgeIndex: number): number => {
        const edge = CUBE_EDGES[edgeIndex];
        const shift = 1 << face.axis;
        const target = CUBE_EDGES.findIndex(
          (candidate) =>
            candidate.from === ((edge?.from ?? 0) ^ shift) &&
            candidate.to === ((edge?.to ?? 0) ^ shift),
        );
        return target;
      };
      for (let mask = 0; mask < CASE_COUNT; mask += 1) {
        const neighbour = face.corners.reduce((bits, corner) => {
          const mirrored = corner ^ (1 << face.axis);
          return bits | (((mask >> corner) & 1) << mirrored);
        }, 0);
        const own = faceSegments(face, mask).map(
          (segment) => `${String(segment.to)}>${String(segment.from)}`,
        );
        const theirs = faceSegments(opposite, neighbour).map(
          (segment) => `${String(mapEdge(segment.from))}>${String(mapEdge(segment.to))}`,
        );
        expect(theirs.sort()).toEqual(own.sort());
      }
    }
  });

  it('separates the inside corners of an ambiguous face', () => {
    const diagonal = (1 << 0) | (1 << 3);
    const face = CUBE_FACES.find((candidate) => candidate.axis === 2 && candidate.side === 0);
    if (face === undefined) {
      throw new Error('Missing face');
    }
    expect(faceSegments(face, diagonal)).toHaveLength(2);
    expect(popcount(diagonal)).toBe(2);
    expect(surfaceCycles(diagonal)).toHaveLength(2);
  });
});
