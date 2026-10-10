import { describe, expect, it } from 'vitest';
import { contourLevels } from '../core/exposure/contour-levels';
import { HEATMAP_PARAMS_BYTES, packHeatmapParams } from './heatmap-params';
import heatmapSource from './shaders/heatmap.wgsl';

const base = {
  nx: 512,
  nz: 1024,
  quantity: 'electric' as const,
  mode: 'rms' as const,
  phaseRadians: 0,
  maximum: 5,
  width: 800,
  height: 300,
  levels: contourLevels('electric', 'icnirp-2010'),
};

describe('heatmap uniform block', () => {
  it('has the size the shader declares', () => {
    expect(packHeatmapParams(base).byteLength).toBe(HEATMAP_PARAMS_BYTES);
    expect(heatmapSource).toContain('levels: array<Level, MAXIMUM_LEVELS>');
    expect(heatmapSource).toContain('const MAXIMUM_LEVELS: u32 = 4u;');
  });

  it('packs the grid, quantity and mode', () => {
    const view = new DataView(
      packHeatmapParams({ ...base, quantity: 'magnetic', mode: 'instantaneous' }),
    );
    expect(view.getUint32(0, true)).toBe(512);
    expect(view.getUint32(4, true)).toBe(1024);
    expect(view.getUint32(8, true)).toBe(6);
    expect(view.getUint32(12, true)).toBe(1);
    expect(view.getFloat32(24, true)).toBe(1);
  });

  it('packs the phase, the scale and the frame', () => {
    const view = new DataView(packHeatmapParams({ ...base, phaseRadians: Math.PI / 2 }));
    expect(view.getFloat32(16, true)).toBeCloseTo(0, 6);
    expect(view.getFloat32(20, true)).toBeCloseTo(1, 6);
    expect(view.getFloat32(24, true)).toBeCloseTo(0.001, 9);
    expect(view.getFloat32(28, true)).toBe(5);
    expect(view.getFloat32(32, true)).toBe(800);
    expect(view.getFloat32(36, true)).toBe(300);
    expect(view.getFloat32(44, true)).toBe(3);
  });

  it('packs one record per level', () => {
    const view = new DataView(packHeatmapParams(base));
    expect(view.getFloat32(48, true)).toBe(1);
    expect(view.getFloat32(64, true)).toBe(5);
    expect(view.getFloat32(68, true)).toBe(1);
    expect(view.getFloat32(72, true)).toBe(1);
    expect(view.getFloat32(80, true)).toBe(10);
    expect(view.getFloat32(88, true)).toBe(0);
  });

  it('writes no more levels than the shader holds', () => {
    const many = [...base.levels, ...base.levels];
    const view = new DataView(packHeatmapParams({ ...base, levels: many }));
    expect(view.getFloat32(44, true)).toBe(4);
  });
});
