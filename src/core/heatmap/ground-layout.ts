import { towerPositions } from '../geometry/discretize';
import type { LineGeometry } from '../geometry/line-geometry';
import { SQRT2 } from '../constants';
import type { DisplayMode } from '../model/settings';
import { type Tick, buildTicks, createScale, niceStep } from '../plot/scale';

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface GroundExtent {
  readonly xMin: number;
  readonly xMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

export interface ProbePosition {
  readonly lateral: number;
  readonly along: number;
}

export interface GroundProjection {
  zToPixel(z: number): number;
  xToPixel(x: number): number;
  pixelToZ(pixel: number): number;
  pixelToX(pixel: number): number;
}

export interface AxisTicks {
  readonly along: readonly Tick[];
  readonly lateral: readonly Tick[];
}

export interface LegendTick {
  readonly value: number;
  readonly fraction: number;
  readonly label: string;
}

export interface ConductorLine {
  readonly x: number;
  readonly zStart: number;
  readonly zEnd: number;
  readonly role: 'phase' | 'shield';
}

export interface TowerMark {
  readonly z: number;
  readonly xStart: number;
  readonly xEnd: number;
}

export interface Footprint {
  readonly lines: readonly ConductorLine[];
  readonly towers: readonly TowerMark[];
}

export const AXIS_MARGINS = { left: 58, right: 16, top: 12, bottom: 44 } as const;
export const MINIMUM_PLOT_SIZE = 16;
export const LEGEND_TICK_TARGET = 5;
export const AXIS_TICK_TARGET = 6;

export function plotBox(width: number, height: number): Box {
  return {
    left: AXIS_MARGINS.left,
    top: AXIS_MARGINS.top,
    width: Math.max(MINIMUM_PLOT_SIZE, width - AXIS_MARGINS.left - AXIS_MARGINS.right),
    height: Math.max(MINIMUM_PLOT_SIZE, height - AXIS_MARGINS.top - AXIS_MARGINS.bottom),
  };
}

export function createProjection(extent: GroundExtent, plot: Box): GroundProjection {
  const spanZ = extent.zMax - extent.zMin || 1;
  const spanX = extent.xMax - extent.xMin || 1;
  return {
    zToPixel: (z) => plot.left + ((z - extent.zMin) / spanZ) * plot.width,
    xToPixel: (x) => plot.top + (1 - (x - extent.xMin) / spanX) * plot.height,
    pixelToZ: (pixel) => extent.zMin + ((pixel - plot.left) / plot.width) * spanZ,
    pixelToX: (pixel) => extent.xMin + (1 - (pixel - plot.top) / plot.height) * spanX,
  };
}

export function probeWorld(extent: GroundExtent, probe: ProbePosition): { x: number; z: number } {
  return {
    x: extent.xMin + probe.lateral * (extent.xMax - extent.xMin),
    z: extent.zMin + probe.along * (extent.zMax - extent.zMin),
  };
}

export function probeFromPixel(
  projection: GroundProjection,
  extent: GroundExtent,
  pixelX: number,
  pixelY: number,
): ProbePosition {
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  const z = projection.pixelToZ(pixelX);
  const x = projection.pixelToX(pixelY);
  return {
    lateral: clamp((x - extent.xMin) / (extent.xMax - extent.xMin || 1)),
    along: clamp((z - extent.zMin) / (extent.zMax - extent.zMin || 1)),
  };
}

export function axisTicks(extent: GroundExtent, plot: Box): AxisTicks {
  const along = createScale(
    'linear',
    [extent.zMin, extent.zMax],
    [plot.left, plot.left + plot.width],
  );
  const lateral = createScale(
    'linear',
    [extent.xMin, extent.xMax],
    [plot.top + plot.height, plot.top],
  );
  return {
    along: buildTicks(along, AXIS_TICK_TARGET),
    lateral: buildTicks(lateral, AXIS_TICK_TARGET),
  };
}

export function legendMaximum(maximum: number, mode: DisplayMode): number {
  const peak = mode === 'instantaneous' ? maximum * SQRT2 : maximum;
  if (!(peak > 0) || !Number.isFinite(peak)) {
    return 1;
  }
  const step = niceStep(peak, LEGEND_TICK_TARGET);
  return Math.ceil(peak / step - 1e-9) * step;
}

export function legendTicks(maximum: number): readonly LegendTick[] {
  const scale = createScale('linear', [0, maximum], [0, 1]);
  return buildTicks(scale, LEGEND_TICK_TARGET).map((tick) => ({
    value: tick.value,
    fraction: tick.position,
    label: tick.label,
  }));
}

export function footprint(geometry: LineGeometry): Footprint {
  const positions = towerPositions(geometry);
  const zStart = positions[0] ?? 0;
  const zEnd = positions[positions.length - 1] ?? zStart;
  const xs = geometry.conductors.map((conductor) => conductor.x);
  const xStart = Math.min(...xs);
  const xEnd = Math.max(...xs);
  return {
    lines: geometry.conductors.map((conductor) => ({
      x: conductor.x,
      zStart,
      zEnd,
      role: conductor.role,
    })),
    towers: positions.map((z) => ({ z, xStart, xEnd })),
  };
}
