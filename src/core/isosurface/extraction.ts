import type { Point3 } from '../field-types';
import { CORNER_COUNT, CUBE_EDGES, type CaseTable, caseTable, cornerOffset } from './case-table';

export interface ScalarVolume {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly origin: Point3;
  readonly spacing: Point3;
  readonly values: ArrayLike<number>;
}

export interface SurfaceMesh {
  readonly vertexCount: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
}

export function voxelIndex(volume: ScalarVolume, ix: number, iy: number, iz: number): number {
  return ix + volume.nx * (iy + volume.ny * iz);
}

export function voxelValue(volume: ScalarVolume, ix: number, iy: number, iz: number): number {
  return volume.values[voxelIndex(volume, ix, iy, iz)] ?? 0;
}

function clampIndex(index: number, count: number): number {
  return Math.min(count - 1, Math.max(0, index));
}

export function gradientAt(volume: ScalarVolume, ix: number, iy: number, iz: number): Point3 {
  const sample = (dx: number, dy: number, dz: number) =>
    voxelValue(
      volume,
      clampIndex(ix + dx, volume.nx),
      clampIndex(iy + dy, volume.ny),
      clampIndex(iz + dz, volume.nz),
    );
  const spanX = clampIndex(ix + 1, volume.nx) - clampIndex(ix - 1, volume.nx);
  const spanY = clampIndex(iy + 1, volume.ny) - clampIndex(iy - 1, volume.ny);
  const spanZ = clampIndex(iz + 1, volume.nz) - clampIndex(iz - 1, volume.nz);
  return {
    x: (sample(1, 0, 0) - sample(-1, 0, 0)) / (Math.max(1, spanX) * volume.spacing.x),
    y: (sample(0, 1, 0) - sample(0, -1, 0)) / (Math.max(1, spanY) * volume.spacing.y),
    z: (sample(0, 0, 1) - sample(0, 0, -1)) / (Math.max(1, spanZ) * volume.spacing.z),
  };
}

function cellMask(volume: ScalarVolume, ix: number, iy: number, iz: number, level: number): number {
  let mask = 0;
  for (let corner = 0; corner < CORNER_COUNT; corner += 1) {
    const [ox, oy, oz] = cornerOffset(corner);
    if (voxelValue(volume, ix + ox, iy + oy, iz + oz) > level) {
      mask |= 1 << corner;
    }
  }
  return mask;
}

interface EdgeVertex {
  readonly position: Point3;
  readonly normal: Point3;
}

function edgeVertex(
  volume: ScalarVolume,
  cell: readonly [number, number, number],
  edgeIndex: number,
  level: number,
): EdgeVertex {
  const edge = CUBE_EDGES[edgeIndex];
  if (edge === undefined) {
    throw new RangeError(`Edge ${String(edgeIndex)} does not exist`);
  }
  const from = cornerOffset(edge.from);
  const to = cornerOffset(edge.to);
  const fromNode = [cell[0] + from[0], cell[1] + from[1], cell[2] + from[2]] as const;
  const toNode = [cell[0] + to[0], cell[1] + to[1], cell[2] + to[2]] as const;
  const fromValue = voxelValue(volume, ...fromNode);
  const toValue = voxelValue(volume, ...toNode);
  const fraction = fromValue === toValue ? 0.5 : (level - fromValue) / (toValue - fromValue);
  const fromGradient = gradientAt(volume, ...fromNode);
  const toGradient = gradientAt(volume, ...toNode);
  const gradient = {
    x: fromGradient.x + fraction * (toGradient.x - fromGradient.x),
    y: fromGradient.y + fraction * (toGradient.y - fromGradient.y),
    z: fromGradient.z + fraction * (toGradient.z - fromGradient.z),
  };
  const length = Math.hypot(gradient.x, gradient.y, gradient.z) || 1;
  return {
    position: {
      x: volume.origin.x + (fromNode[0] + fraction * (toNode[0] - fromNode[0])) * volume.spacing.x,
      y: volume.origin.y + (fromNode[1] + fraction * (toNode[1] - fromNode[1])) * volume.spacing.y,
      z: volume.origin.z + (fromNode[2] + fraction * (toNode[2] - fromNode[2])) * volume.spacing.z,
    },
    normal: { x: -gradient.x / length, y: -gradient.y / length, z: -gradient.z / length },
  };
}

export function extractIsosurface(
  volume: ScalarVolume,
  level: number,
  table: CaseTable = caseTable(),
): SurfaceMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  for (let iz = 0; iz + 1 < volume.nz; iz += 1) {
    for (let iy = 0; iy + 1 < volume.ny; iy += 1) {
      for (let ix = 0; ix + 1 < volume.nx; ix += 1) {
        const mask = cellMask(volume, ix, iy, iz, level);
        const count = table.triangleCounts[mask] ?? 0;
        for (let triangle = 0; triangle < count; triangle += 1) {
          for (let corner = 0; corner < 3; corner += 1) {
            const edgeIndex =
              table.edgeTriples[(mask * table.maxTriangles + triangle) * 3 + corner] ?? 0;
            const vertex = edgeVertex(volume, [ix, iy, iz], edgeIndex, level);
            positions.push(vertex.position.x, vertex.position.y, vertex.position.z);
            normals.push(vertex.normal.x, vertex.normal.y, vertex.normal.z);
          }
        }
      }
    }
  }
  return {
    vertexCount: positions.length / 3,
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
  };
}

export function triangleCount(mesh: SurfaceMesh): number {
  return mesh.vertexCount / 3;
}

export function meshArea(positions: ArrayLike<number>): number {
  let area = 0;
  for (let base = 0; base + 8 < positions.length; base += 9) {
    const ax = (positions[base + 3] ?? 0) - (positions[base] ?? 0);
    const ay = (positions[base + 4] ?? 0) - (positions[base + 1] ?? 0);
    const az = (positions[base + 5] ?? 0) - (positions[base + 2] ?? 0);
    const bx = (positions[base + 6] ?? 0) - (positions[base] ?? 0);
    const by = (positions[base + 7] ?? 0) - (positions[base + 1] ?? 0);
    const bz = (positions[base + 8] ?? 0) - (positions[base + 2] ?? 0);
    area += 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  }
  return area;
}
