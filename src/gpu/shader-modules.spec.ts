import { describe, expect, it } from 'vitest';
import { ELECTRIC_CONSTANT } from '../core/constants';
import {
  DEFAULT_WORKGROUPS,
  TILE_SIZE,
  composeKernel,
  constantsHeader,
  defaultKernelOptions,
  wgslFloat,
} from './shader-modules';

describe('WGSL composition', () => {
  it('puts the constants first, then the segment module, then the entry point', () => {
    for (const kind of ['ground', 'volume', 'points'] as const) {
      const source = composeKernel(kind);
      const header = source.indexOf('const ELECTRIC_PER_MICROCOULOMB');
      const common = source.indexOf('struct Segment');
      const entry = source.indexOf('fn main(');
      expect(header).toBe(0);
      expect(common).toBeGreaterThan(header);
      expect(entry).toBeGreaterThan(common);
      expect(source.match(/fn main\(/g)).toHaveLength(1);
    }
  });

  it('takes the physical constants from the core in microcoulomb and microtesla units', () => {
    const header = constantsHeader(defaultKernelOptions('ground'));
    expect(header).toContain('const ELECTRIC_PER_MICROCOULOMB: f32 = 8987.55179;');
    expect(Number(/ELECTRIC_PER_MICROCOULOMB: f32 = ([\d.]+);/.exec(header)?.[1])).toBeCloseTo(
      ELECTRIC_CONSTANT / 1e6,
      4,
    );
    expect(header).toMatch(/MAGNETIC_MICROTESLA_PER_AMPERE: f32 = 0\.1000000/);
  });

  it('writes the workgroup shape and the tiling switch into the header', () => {
    expect(constantsHeader({ tiled: true, workgroup: DEFAULT_WORKGROUPS.ground })).toContain(
      'const WORKGROUP_SIZE: u32 = 64u;',
    );
    const untiled = constantsHeader({ tiled: false, workgroup: { x: 16, y: 16, z: 1 } });
    expect(untiled).toContain('const TILED: bool = false;');
    expect(untiled).toContain('const WORKGROUP_X: u32 = 16u;');
    expect(untiled).toContain('const WORKGROUP_SIZE: u32 = 256u;');
    expect(untiled).toContain(`const TILE_SIZE: u32 = ${TILE_SIZE}u;`);
  });

  it('uses 8 by 8, 4 by 4 by 4 and 64 invocations as in ADR 7', () => {
    expect(DEFAULT_WORKGROUPS.ground).toEqual({ x: 8, y: 8, z: 1 });
    expect(DEFAULT_WORKGROUPS.volume).toEqual({ x: 4, y: 4, z: 4 });
    expect(DEFAULT_WORKGROUPS.points.x).toBe(64);
  });

  it('formats floats as WGSL literals', () => {
    expect(wgslFloat(2)).toBe('2.00000000');
    expect(wgslFloat(1e-7)).toContain('e-7');
    expect(wgslFloat(0.5)).toBe('0.500000000');
  });

  it('declares the point binding only in the point list kernel', () => {
    expect(composeKernel('points')).toContain('@binding(3)');
    expect(composeKernel('ground')).not.toContain('@binding(3)');
    expect(composeKernel('volume')).not.toContain('@binding(3)');
  });

  it('contains no comments', () => {
    for (const kind of ['ground', 'volume', 'points'] as const) {
      expect(composeKernel(kind)).not.toMatch(/\/\/|\/\*/);
    }
  });
});
