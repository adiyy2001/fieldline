import { ELECTRIC_CONSTANT, MAGNETIC_CONSTANT } from '../core/constants';
import { MICROCOULOMB_PER_COULOMB, MICROTESLA_PER_TESLA } from '../core/backend/types';
import fieldGround from './shaders/field_ground.wgsl';
import fieldPoints from './shaders/field_points.wgsl';
import fieldLines from './shaders/field_lines.wgsl';
import fieldVolume from './shaders/field_volume.wgsl';
import marchingCubes from './shaders/marching_cubes.wgsl';
import segmentMath from './shaders/segment_math.wgsl';
import segmentModule from './shaders/segment.wgsl';

export type KernelKind = 'ground' | 'volume' | 'points';

export interface WorkgroupShape {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface KernelOptions {
  readonly tiled: boolean;
  readonly workgroup: WorkgroupShape;
}

export const TILE_SIZE = 64;

export const DEFAULT_WORKGROUPS: Readonly<Record<KernelKind, WorkgroupShape>> = {
  ground: { x: 8, y: 8, z: 1 },
  volume: { x: 4, y: 4, z: 4 },
  points: { x: 64, y: 1, z: 1 },
};

const entrySources: Readonly<Record<KernelKind, string>> = {
  ground: fieldGround,
  volume: fieldVolume,
  points: fieldPoints,
};

export function wgslFloat(value: number): string {
  const text = value.toPrecision(9);
  return /[.e]/.test(text) ? text : `${text}.0`;
}

export function physicsHeader(): string {
  const electric = ELECTRIC_CONSTANT / MICROCOULOMB_PER_COULOMB;
  const magnetic = MAGNETIC_CONSTANT * MICROTESLA_PER_TESLA;
  return [
    `const ELECTRIC_PER_MICROCOULOMB: f32 = ${wgslFloat(electric)};`,
    `const MAGNETIC_MICROTESLA_PER_AMPERE: f32 = ${wgslFloat(magnetic)};`,
  ].join('\n');
}

export function constantsHeader(options: KernelOptions): string {
  const { workgroup } = options;
  return [
    physicsHeader(),
    `const TILED: bool = ${String(options.tiled)};`,
    `const TILE_SIZE: u32 = ${String(TILE_SIZE)}u;`,
    `const WORKGROUP_X: u32 = ${String(workgroup.x)}u;`,
    `const WORKGROUP_Y: u32 = ${String(workgroup.y)}u;`,
    `const WORKGROUP_Z: u32 = ${String(workgroup.z)}u;`,
    `const WORKGROUP_SIZE: u32 = ${String(workgroup.x * workgroup.y * workgroup.z)}u;`,
  ].join('\n');
}

export function defaultKernelOptions(kind: KernelKind): KernelOptions {
  return { tiled: true, workgroup: DEFAULT_WORKGROUPS[kind] };
}

export function composeKernel(
  kind: KernelKind,
  options: KernelOptions = defaultKernelOptions(kind),
): string {
  return [constantsHeader(options), segmentMath, segmentModule, entrySources[kind]].join('\n\n');
}

export const LINE_WORKGROUP_SIZE = 64;

export function composeLinesKernel(): string {
  return [
    physicsHeader(),
    `const LINE_WORKGROUP: u32 = ${String(LINE_WORKGROUP_SIZE)}u;`,
    segmentMath,
    fieldLines,
  ].join('\n\n');
}

export function composeMarchingCubes(caseOffset: number, caseStride: number): string {
  return [
    `const CASE_OFFSET: u32 = ${String(caseOffset)}u;`,
    `const CASE_STRIDE: u32 = ${String(caseStride)}u;`,
    marchingCubes,
  ].join('\n\n');
}
