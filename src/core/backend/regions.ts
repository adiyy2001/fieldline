import type { LineGeometry } from '../geometry/line-geometry';
import { towerPositions } from '../geometry/discretize';
import type { GridSpec, VolumeSpec } from './types';

export const GROUND_PLANE_HEIGHT = 1;
export const GROUND_HALF_WIDTH = 60;
export const GROUND_END_MARGIN = 60;
export const VOLUME_HALF_WIDTH = 50;
export const VOLUME_HEIGHT = 60;
export const VOLUME_END_MARGIN = 20;
export const GPU_GRID_SIZE = { nx: 512, nz: 1024 } as const;
export const CPU_GRID_SIZE = { nx: 128, nz: 256 } as const;
export const DRAFT_GRID_SIZE = { nx: 256, nz: 512 } as const;
export const VOLUME_SIZE = { nx: 64, ny: 64, nz: 128 } as const;

export interface GridSize {
  readonly nx: number;
  readonly nz: number;
}

export interface VolumeSize {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

export function defaultGridSpec(geometry: LineGeometry, size: GridSize = GPU_GRID_SIZE): GridSpec {
  const towers = towerPositions(geometry);
  const first = towers[0] ?? 0;
  const last = towers[towers.length - 1] ?? first;
  return {
    height: GROUND_PLANE_HEIGHT,
    xMin: -GROUND_HALF_WIDTH,
    xMax: GROUND_HALF_WIDTH,
    zMin: first - GROUND_END_MARGIN,
    zMax: last + GROUND_END_MARGIN,
    nx: size.nx,
    nz: size.nz,
  };
}

export function defaultVolumeSpec(
  geometry: LineGeometry,
  referenceIndex: number,
  size: VolumeSize = VOLUME_SIZE,
): VolumeSpec {
  const towers = towerPositions(geometry);
  const start = towers[referenceIndex] ?? 0;
  const end = towers[referenceIndex + 1] ?? start;
  return {
    xMin: -VOLUME_HALF_WIDTH,
    xMax: VOLUME_HALF_WIDTH,
    yMin: 0,
    yMax: VOLUME_HEIGHT,
    zMin: start - VOLUME_END_MARGIN,
    zMax: end + VOLUME_END_MARGIN,
    nx: size.nx,
    ny: size.ny,
    nz: size.nz,
  };
}
