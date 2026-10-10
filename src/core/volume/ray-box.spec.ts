import { describe, expect, it } from 'vitest';
import { intersectRayWithBox } from './ray-box';

const MIN = { x: -1, y: -1, z: -1 };
const MAX = { x: 1, y: 1, z: 1 };

describe('ray and box intersection', () => {
  it('finds the entry and exit distances of a ray through the centre', () => {
    const hit = intersectRayWithBox({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 1 }, MIN, MAX);
    expect(hit?.near).toBeCloseTo(4, 12);
    expect(hit?.far).toBeCloseTo(6, 12);
  });

  it('starts at zero when the origin is inside the box', () => {
    const hit = intersectRayWithBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, MIN, MAX);
    expect(hit?.near).toBe(0);
    expect(hit?.far).toBeCloseTo(1, 12);
  });

  it('misses a box behind the ray and one beside it', () => {
    expect(intersectRayWithBox({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 1 }, MIN, MAX)).toBeNull();
    expect(intersectRayWithBox({ x: 3, y: 0, z: -5 }, { x: 0, y: 0, z: 1 }, MIN, MAX)).toBeNull();
  });

  it('handles rays that are parallel to a face', () => {
    const hit = intersectRayWithBox({ x: 0.5, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, MIN, MAX);
    expect(hit).toBeNull();
    const inside = intersectRayWithBox({ x: -3, y: 0.5, z: 0 }, { x: 1, y: 0, z: 0 }, MIN, MAX);
    expect(inside?.near).toBeCloseTo(2, 12);
  });
});
