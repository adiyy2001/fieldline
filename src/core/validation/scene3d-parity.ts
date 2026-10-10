import type { Point3 } from '../field-types';

export interface StridedMesh {
  readonly data: ArrayLike<number>;
  readonly stride: number;
  readonly vertexCount: number;
}

export interface MeshSummary {
  readonly triangles: number;
  readonly area: number;
}

export function summarizeStridedMesh(mesh: StridedMesh): MeshSummary {
  const triangles = Math.floor(mesh.vertexCount / 3);
  let area = 0;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const base = triangle * 3 * mesh.stride;
    const at = (vertex: number, axis: number) => mesh.data[base + vertex * mesh.stride + axis] ?? 0;
    const ax = at(1, 0) - at(0, 0);
    const ay = at(1, 1) - at(0, 1);
    const az = at(1, 2) - at(0, 2);
    const bx = at(2, 0) - at(0, 0);
    const by = at(2, 1) - at(0, 1);
    const bz = at(2, 2) - at(0, 2);
    area += 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  }
  return { triangles, area };
}

export interface MeshComparison {
  readonly gpuTriangles: number;
  readonly cpuTriangles: number;
  readonly triangleDifference: number;
  readonly relativeAreaDifference: number;
}

export function compareMeshes(gpu: MeshSummary, cpu: MeshSummary): MeshComparison {
  return {
    gpuTriangles: gpu.triangles,
    cpuTriangles: cpu.triangles,
    triangleDifference: Math.abs(gpu.triangles - cpu.triangles),
    relativeAreaDifference:
      cpu.area > 0 ? Math.abs(gpu.area - cpu.area) / cpu.area : Math.abs(gpu.area - cpu.area),
  };
}

export interface LineEndpoint {
  readonly pointCount: number;
  readonly end: number;
  readonly positions: ArrayLike<number>;
}

export interface LineComparison {
  readonly endDistance: number;
  readonly endFraction: number;
  readonly sameEnd: boolean;
  readonly pointCountDifference: number;
}

function lastPoint(line: LineEndpoint): Point3 {
  const index = Math.max(0, line.pointCount - 1);
  return {
    x: line.positions[index * 3] ?? 0,
    y: line.positions[index * 3 + 1] ?? 0,
    z: line.positions[index * 3 + 2] ?? 0,
  };
}

export function compareLineEnd(
  gpu: LineEndpoint,
  cpu: LineEndpoint,
  domainSize: number,
): LineComparison {
  const from = lastPoint(gpu);
  const to = lastPoint(cpu);
  const endDistance = Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);
  return {
    endDistance,
    endFraction: endDistance / domainSize,
    sameEnd: gpu.end === cpu.end,
    pointCountDifference: Math.abs(gpu.pointCount - cpu.pointCount),
  };
}

export function closureDistance(line: LineEndpoint): number {
  const end = lastPoint(line);
  const start = {
    x: line.positions[0] ?? 0,
    y: line.positions[1] ?? 0,
    z: line.positions[2] ?? 0,
  };
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}

export function mirrorDifference(pixels: ArrayLike<number>, width: number, height: number): number {
  let worst = 0;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < Math.floor(width / 2); column += 1) {
      const left = (row * width + column) * 4;
      const right = (row * width + (width - 1 - column)) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        worst = Math.max(
          worst,
          Math.abs((pixels[left + channel] ?? 0) - (pixels[right + channel] ?? 0)),
        );
      }
    }
  }
  return worst;
}

export function pixelAt(
  pixels: ArrayLike<number>,
  width: number,
  column: number,
  row: number,
): readonly [number, number, number, number] {
  const base = (row * width + column) * 4;
  return [pixels[base] ?? 0, pixels[base + 1] ?? 0, pixels[base + 2] ?? 0, pixels[base + 3] ?? 0];
}
