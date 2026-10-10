import { describe, expect, it } from 'vitest';
import { extractIsosurface, meshArea, triangleCount, type ScalarVolume } from './extraction';

function sphereVolume(size: number, radius: number): { volume: ScalarVolume; level: number } {
  const half = 1.5 * radius;
  const spacing = (2 * half) / (size - 1);
  const values = new Float32Array(size * size * size);
  for (let iz = 0; iz < size; iz += 1) {
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const x = -half + (ix + 0.013) * spacing;
        const y = -half + (iy + 0.007) * spacing;
        const z = -half + (iz + 0.021) * spacing;
        values[ix + size * (iy + size * iz)] = -Math.hypot(x, y, z);
      }
    }
  }
  return {
    volume: {
      nx: size,
      ny: size,
      nz: size,
      origin: { x: -half, y: -half, z: -half },
      spacing: { x: spacing, y: spacing, z: spacing },
      values,
    },
    level: -radius,
  };
}

describe('the CPU isosurface extraction', () => {
  it('reproduces the area of a sphere within one percent on a 64 cube grid', () => {
    const { volume, level } = sphereVolume(64, 2);
    const mesh = extractIsosurface(volume, level);
    const expected = 4 * Math.PI * 4;
    expect(Math.abs(meshArea(mesh.positions) / expected - 1)).toBeLessThan(0.01);
    expect(triangleCount(mesh)).toBeGreaterThan(1000);
  });

  it('places every vertex on the sphere and points the normals outwards', () => {
    const { volume, level } = sphereVolume(40, 2);
    const mesh = extractIsosurface(volume, level);
    for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
      const x = mesh.positions[3 * vertex] ?? 0;
      const y = mesh.positions[3 * vertex + 1] ?? 0;
      const z = mesh.positions[3 * vertex + 2] ?? 0;
      const radius = Math.hypot(x, y, z);
      expect(Math.abs(radius - 2)).toBeLessThan(0.05);
      const outward =
        ((mesh.normals[3 * vertex] ?? 0) * x +
          (mesh.normals[3 * vertex + 1] ?? 0) * y +
          (mesh.normals[3 * vertex + 2] ?? 0) * z) /
        radius;
      expect(outward).toBeGreaterThan(0.95);
    }
  });

  it('emits triangles whose winding agrees with the normals', () => {
    const { volume, level } = sphereVolume(40, 2);
    const mesh = extractIsosurface(volume, level);
    for (let base = 0; base < mesh.vertexCount * 3; base += 9) {
      const p = Array.from(mesh.positions.subarray(base, base + 9));
      const u = [(p[3] ?? 0) - (p[0] ?? 0), (p[4] ?? 0) - (p[1] ?? 0), (p[5] ?? 0) - (p[2] ?? 0)];
      const v = [(p[6] ?? 0) - (p[0] ?? 0), (p[7] ?? 0) - (p[1] ?? 0), (p[8] ?? 0) - (p[2] ?? 0)];
      const normal = [
        (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
        (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
        (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
      ];
      const reference = Array.from(mesh.normals.subarray(base, base + 3));
      const alignment =
        (normal[0] ?? 0) * (reference[0] ?? 0) +
        (normal[1] ?? 0) * (reference[1] ?? 0) +
        (normal[2] ?? 0) * (reference[2] ?? 0);
      expect(alignment).toBeGreaterThan(0);
    }
  });

  it('returns an empty mesh when the level is outside the data', () => {
    const { volume } = sphereVolume(8, 1);
    expect(extractIsosurface(volume, 10).vertexCount).toBe(0);
    expect(extractIsosurface(volume, -10).vertexCount).toBe(0);
  });

  it('makes a closed surface: every edge of the mesh is shared by exactly two triangles', () => {
    const { volume, level } = sphereVolume(24, 2);
    const mesh = extractIsosurface(volume, level);
    const key = (vertex: number) =>
      [0, 1, 2].map((axis) => (mesh.positions[3 * vertex + axis] ?? 0).toFixed(5)).join(',');
    const edges = new Map<string, number>();
    for (let triangle = 0; triangle < mesh.vertexCount; triangle += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const a = key(triangle + corner);
        const b = key(triangle + ((corner + 1) % 3));
        const id = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(id, (edges.get(id) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
  });
});
