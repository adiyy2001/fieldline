import { describe, expect, it } from 'vitest';
import {
  closureDistance,
  compareLineEnd,
  compareMeshes,
  mirrorDifference,
  pixelAt,
  summarizeStridedMesh,
} from './scene3d-parity';

describe('mesh summaries', () => {
  it('sums the area of triangles stored with a stride', () => {
    const data = [0, 0, 0, 9, 1, 0, 0, 9, 0, 1, 0, 9, 0, 0, 0, 9, 2, 0, 0, 9, 0, 2, 0, 9];
    const summary = summarizeStridedMesh({ data, stride: 4, vertexCount: 6 });
    expect(summary.triangles).toBe(2);
    expect(summary.area).toBeCloseTo(0.5 + 2, 12);
  });

  it('ignores a trailing partial triangle', () => {
    const summary = summarizeStridedMesh({
      data: new Array(16).fill(0),
      stride: 4,
      vertexCount: 4,
    });
    expect(summary.triangles).toBe(1);
  });

  it('compares triangle counts and the relative area', () => {
    const comparison = compareMeshes({ triangles: 101, area: 10.1 }, { triangles: 100, area: 10 });
    expect(comparison.triangleDifference).toBe(1);
    expect(comparison.relativeAreaDifference).toBeCloseTo(0.01, 12);
    expect(compareMeshes({ triangles: 0, area: 0 }, { triangles: 0, area: 0 })).toMatchObject({
      relativeAreaDifference: 0,
    });
  });
});

describe('line comparisons', () => {
  const line = (points: number[][], end: number) => ({
    pointCount: points.length,
    end,
    positions: points.flat(),
  });

  it('measures the distance between the last recorded points', () => {
    const comparison = compareLineEnd(
      line(
        [
          [0, 0, 0],
          [3, 4, 0],
          [9, 9, 9],
        ].slice(0, 2),
        1,
      ),
      line(
        [
          [0, 0, 0],
          [3, 4, 5],
        ],
        1,
      ),
      100,
    );
    expect(comparison.endDistance).toBe(5);
    expect(comparison.endFraction).toBe(0.05);
    expect(comparison.sameEnd).toBe(true);
    expect(comparison.pointCountDifference).toBe(0);
  });

  it('reports different ends and lengths', () => {
    const comparison = compareLineEnd(
      line([[0, 0, 0]], 1),
      line(
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        3,
      ),
      10,
    );
    expect(comparison.sameEnd).toBe(false);
    expect(comparison.pointCountDifference).toBe(1);
  });

  it('computes how far a line ends from where it started', () => {
    expect(
      closureDistance(
        line(
          [
            [1, 1, 1],
            [2, 2, 2],
            [1, 1, 4],
          ],
          0,
        ),
      ),
    ).toBe(3);
  });
});

describe('pixel helpers', () => {
  const pixels = [10, 20, 30, 255, 99, 99, 99, 255, 1, 2, 3, 255, 1, 2, 3, 255];

  it('finds the largest channel difference between mirrored columns', () => {
    expect(mirrorDifference(pixels, 2, 2)).toBe(89);
    expect(mirrorDifference([5, 5, 5, 255, 5, 5, 5, 255], 2, 1)).toBe(0);
  });

  it('reads one pixel', () => {
    expect(pixelAt(pixels, 2, 1, 0)).toEqual([99, 99, 99, 255]);
  });
});
