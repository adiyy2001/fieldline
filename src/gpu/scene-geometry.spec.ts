import { describe, expect, it } from 'vitest';
import { discretizeLine, defaultDiscretization } from '../core/geometry/discretize';
import { packSegments } from '../core/field3d/segment-set';
import { defaultParameters, lineGeometryFromParameters } from '../core/model/parameters';
import {
  AXIS_LENGTH,
  LINE_INSTANCE_FLOATS,
  axisLines,
  boxCenter,
  boxLines,
  buildBackdrop,
  clipSegmentToDepth,
  conductorLines,
  gridLines,
  packLineInstances,
  towerLines,
} from './scene-geometry';

const BOX = { min: { x: -50, y: 0, z: -20 }, max: { x: 50, y: 60, z: 320 } };

function lineFixture() {
  const geometry = lineGeometryFromParameters(defaultParameters('horizontal'));
  const set = packSegments(discretizeLine(geometry, defaultDiscretization(8)));
  return { geometry, set };
}

describe('depth clipping of a segment', () => {
  it('keeps a segment inside the range as it is', () => {
    const clipped = clipSegmentToDepth({ x: 1, y: 2, z: 10 }, { x: 1, y: 2, z: 20 }, 0, 30);
    expect(clipped?.start.z).toBe(10);
    expect(clipped?.end.z).toBe(20);
  });

  it('cuts a segment at both ends of the range and interpolates the other coordinates', () => {
    const clipped = clipSegmentToDepth({ x: 0, y: 0, z: -10 }, { x: 40, y: 20, z: 30 }, 0, 20);
    expect(clipped?.start).toEqual({ x: 10, y: 5, z: 0 });
    expect(clipped?.end).toEqual({ x: 30, y: 15, z: 20 });
  });

  it('drops segments outside the range, also when they run backwards', () => {
    expect(clipSegmentToDepth({ x: 0, y: 0, z: 40 }, { x: 0, y: 0, z: 50 }, 0, 20)).toBeNull();
    expect(clipSegmentToDepth({ x: 0, y: 0, z: 50 }, { x: 0, y: 0, z: 40 }, 0, 20)).toBeNull();
    expect(clipSegmentToDepth({ x: 0, y: 0, z: 50 }, { x: 0, y: 0, z: 10 }, 0, 20)?.start.z).toBe(
      20,
    );
  });

  it('handles segments across the lateral plane', () => {
    expect(clipSegmentToDepth({ x: 0, y: 0, z: 5 }, { x: 9, y: 0, z: 5 }, 0, 20)).not.toBeNull();
    expect(clipSegmentToDepth({ x: 0, y: 0, z: 25 }, { x: 9, y: 0, z: 25 }, 0, 20)).toBeNull();
  });
});

describe('the scene backdrop', () => {
  it('draws twelve box edges and the axes in three colours', () => {
    expect(boxLines(BOX)).toHaveLength(12);
    const axes = axisLines(BOX);
    expect(axes).toHaveLength(3);
    expect(axes[0]?.end.x).toBeCloseTo(BOX.min.x + AXIS_LENGTH, 12);
    expect(new Set(axes.map((axis) => axis.color.join(','))).size).toBe(3);
  });

  it('places grid lines on multiples of the spacing inside the box', () => {
    const grid = gridLines(BOX, 10);
    const across = grid.filter((line) => line.start.x === line.end.x);
    const along = grid.filter((line) => line.start.z === line.end.z);
    expect(across).toHaveLength(11);
    expect(along).toHaveLength(35);
    expect(across.every((line) => line.start.x % 10 === 0)).toBe(true);
  });

  it('clips conductors to the box and colours shield wires differently', () => {
    const { set } = lineFixture();
    const lines = conductorLines(set, BOX);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(set.count);
    expect(
      lines.every((line) => line.start.z >= BOX.min.z - 1e-9 && line.end.z <= BOX.max.z + 1e-9),
    ).toBe(true);
    expect(new Set(lines.map((line) => line.color.join(','))).size).toBe(2);
  });

  it('marks only the towers that lie inside the box', () => {
    const { geometry } = lineFixture();
    const marks = towerLines(geometry, BOX);
    const perTower = 1 + geometry.conductors.length;
    expect(marks.length % perTower).toBe(0);
    expect(marks.length / perTower).toBeGreaterThanOrEqual(1);
    expect(marks.every((line) => line.start.z >= BOX.min.z && line.start.z <= BOX.max.z)).toBe(
      true,
    );
  });

  it('packs twelve floats per line with the width in the fourth slot', () => {
    const packed = packLineInstances([
      {
        start: { x: 1, y: 2, z: 3 },
        end: { x: 4, y: 5, z: 6 },
        width: 2.5,
        color: [0.1, 0.2, 0.3, 0.4],
      },
    ]);
    expect(packed).toHaveLength(LINE_INSTANCE_FLOATS);
    expect(Array.from(packed).map((value) => Number(value.toFixed(3)))).toEqual([
      1, 2, 3, 2.5, 4, 5, 6, 0, 0.1, 0.2, 0.3, 0.4,
    ]);
  });

  it('builds one backdrop with the ground plane sized to the box', () => {
    const { geometry, set } = lineFixture();
    const backdrop = buildBackdrop(set, geometry, BOX);
    expect(backdrop.instances.length).toBe(backdrop.count * LINE_INSTANCE_FLOATS);
    expect(backdrop.ground).toEqual({ height: 0, halfWidth: 50, halfLength: 170, centerZ: 150 });
    expect(boxCenter(BOX)).toEqual({ x: 0, y: 30, z: 150 });
  });
});
