import { describe, expect, it } from 'vitest';
import { defaultGridSpec } from '../backend/regions';
import { lineGeometryFromParameters, defaultParameters } from '../model/parameters';
import {
  AXIS_MARGINS,
  axisTicks,
  createProjection,
  footprint,
  legendMaximum,
  legendTicks,
  plotBox,
  probeFromPixel,
  probeWorld,
} from './ground-layout';

const geometry = lineGeometryFromParameters(defaultParameters('horizontal'));
const extent = defaultGridSpec(geometry);
const plot = plotBox(1000, 400);

describe('the ground plot layout', () => {
  it('keeps room for the axes and never collapses', () => {
    expect(plot.left).toBe(AXIS_MARGINS.left);
    expect(plot.width).toBe(1000 - AXIS_MARGINS.left - AXIS_MARGINS.right);
    expect(plot.height).toBe(400 - AXIS_MARGINS.top - AXIS_MARGINS.bottom);
    expect(plotBox(10, 10).width).toBeGreaterThan(0);
  });

  it('puts z left to right and x bottom to top', () => {
    const projection = createProjection(extent, plot);
    expect(projection.zToPixel(extent.zMin)).toBe(plot.left);
    expect(projection.zToPixel(extent.zMax)).toBeCloseTo(plot.left + plot.width, 9);
    expect(projection.xToPixel(extent.xMax)).toBe(plot.top);
    expect(projection.xToPixel(extent.xMin)).toBeCloseTo(plot.top + plot.height, 9);
  });

  it('inverts the projection', () => {
    const projection = createProjection(extent, plot);
    expect(projection.pixelToZ(projection.zToPixel(123.4))).toBeCloseTo(123.4, 9);
    expect(projection.pixelToX(projection.xToPixel(-7.5))).toBeCloseTo(-7.5, 9);
  });

  it('maps the probe between world and fractions', () => {
    expect(probeWorld(extent, { lateral: 0.5, along: 0.5 })).toEqual({ x: 0, z: 450 });
    expect(probeWorld(extent, { lateral: 0, along: 1 })).toEqual({ x: -60, z: 960 });
    const projection = createProjection(extent, plot);
    const probe = probeFromPixel(projection, extent, plot.left + plot.width / 2, plot.top);
    expect(probe.lateral).toBeCloseTo(1, 9);
    expect(probe.along).toBeCloseTo(0.5, 9);
  });

  it('clamps a probe that is dragged outside the plot', () => {
    const projection = createProjection(extent, plot);
    expect(probeFromPixel(projection, extent, -50, 5000)).toEqual({ lateral: 0, along: 0 });
  });

  it('builds ticks inside the plot with plain labels', () => {
    const ticks = axisTicks(extent, plot);
    expect(ticks.along.length).toBeGreaterThan(3);
    expect(ticks.along.every((tick) => tick.position >= plot.left - 1e-9)).toBe(true);
    expect(ticks.lateral.map((tick) => tick.label)).toContain('0');
    const zero = ticks.lateral.find((tick) => tick.value === 0);
    expect(zero?.position).toBeCloseTo(plot.top + plot.height / 2, 9);
  });

  it('rounds the legend maximum up to a tick', () => {
    expect(legendMaximum(3.2, 'rms')).toBe(4);
    expect(legendMaximum(0, 'rms')).toBe(1);
    expect(legendMaximum(Number.NaN, 'rms')).toBe(1);
    expect(legendMaximum(3.2, 'instantaneous')).toBeGreaterThanOrEqual(3.2 * Math.SQRT2);
  });

  it('labels the legend from zero to the maximum', () => {
    const ticks = legendTicks(4);
    expect(ticks[0]).toMatchObject({ value: 0, fraction: 0, label: '0' });
    expect(ticks[ticks.length - 1]?.fraction).toBeCloseTo(1, 9);
  });

  it('draws every conductor across the whole line and a mark per tower', () => {
    const marks = footprint(geometry);
    expect(marks.lines).toHaveLength(5);
    expect(marks.lines.filter((line) => line.role === 'phase').map((line) => line.x)).toEqual([
      -10, 0, 10,
    ]);
    expect(marks.lines.every((line) => line.zStart === 0 && line.zEnd === 900)).toBe(true);
    expect(marks.towers.map((tower) => tower.z)).toEqual([0, 300, 600, 900]);
    expect(marks.towers[0]).toMatchObject({ xStart: -10, xEnd: 10 });
  });
});
