import type { ContourLevel } from '../../core/exposure/contour-levels';
import {
  DASH_PATTERNS,
  dashDescription,
  formatNumber,
  formatQuantity,
} from '../../core/exposure/contour-levels';
import {
  type ProfileSummary,
  describeSummary,
  summarizeProfile,
} from '../../core/exposure/summary';
import { viridisBytes } from '../../core/heatmap/color';
import {
  type GroundExtent,
  probeWorld,
  type ProbePosition,
} from '../../core/heatmap/ground-layout';
import { scalarOfVector } from '../../core/heatmap/scalar';
import type { ViewSettings } from '../../core/model/settings';
import type { FieldFrame } from '../services/field-pipeline';

export interface ProbeReading {
  readonly x: number;
  readonly z: number;
  readonly electric: number;
  readonly magnetic: number;
  readonly text: string;
}

export interface LevelLabel {
  readonly text: string;
  readonly x: number;
  readonly z: number;
}

export interface LegendEntry {
  readonly text: string;
  readonly sources: string;
  readonly dashName: string;
  readonly pattern: readonly number[];
  readonly emphasised: boolean;
}

export const GRADIENT_STOPS = 8;
export const LABEL_EDGE_MARGIN_METRES = 0.5;

export function extentOf(frame: FieldFrame): GroundExtent {
  const { xMin, xMax, zMin, zMax } = frame.grid;
  return { xMin, xMax, zMin, zMax };
}

export function readProbe(
  frame: FieldFrame,
  settings: ViewSettings,
  probe: ProbePosition,
): ProbeReading {
  const { x, z } = probeWorld(extentOf(frame), probe);
  const field = frame.evaluator({ x, y: frame.grid.height, z });
  const selection = { quantity: 'electric' as const, mode: settings.mode, phaseRadians: 0 };
  const phaseRadians = (settings.phaseDegrees * Math.PI) / 180;
  const electric = scalarOfVector(field.electric, { ...selection, phaseRadians });
  const magnetic = scalarOfVector(field.magnetic, {
    ...selection,
    quantity: 'magnetic',
    phaseRadians,
  });
  const kind = settings.mode === 'rms' ? 'rms' : 'instantaneous';
  return {
    x,
    z,
    electric,
    magnetic,
    text: `Probe at x = ${formatNumber(x)} m, z = ${formatNumber(z)} m, ${formatNumber(frame.grid.height)} m above ground (${kind}): E ${formatQuantity(electric, 'electric')}, B ${formatQuantity(magnetic, 'magnetic')}`,
  };
}

export function legendGradient(): string {
  const stops = Array.from({ length: GRADIENT_STOPS }, (_, index) => {
    const fraction = index / (GRADIENT_STOPS - 1);
    const [red, green, blue] = viridisBytes(fraction);
    return `rgb(${String(red)} ${String(green)} ${String(blue)}) ${String(Math.round(fraction * 100))}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export function legendEntries(levels: readonly ContourLevel[]): readonly LegendEntry[] {
  return levels.map((level) => ({
    text: level.text,
    sources: level.sources.join(', '),
    dashName: dashDescription(level),
    pattern: DASH_PATTERNS[level.dashIndex] ?? [],
    emphasised: level.emphasised,
  }));
}

export function groundSummary(
  frame: FieldFrame,
  settings: ViewSettings,
  levels: readonly ContourLevel[],
): { readonly summary: ProfileSummary; readonly text: string } {
  const summary = summarizeProfile(frame.profile, settings.quantity, levels);
  return { summary, text: describeSummary(summary, settings.quantity, frame.grid.height) };
}

export function levelLabels(
  summary: ProfileSummary,
  extent: GroundExtent,
  alongMetres: number,
): readonly LevelLabel[] {
  return summary.reports.flatMap((report) =>
    report.intervals.flatMap((interval) =>
      [interval.from, interval.to]
        .filter(
          (x) =>
            x > extent.xMin + LABEL_EDGE_MARGIN_METRES &&
            x < extent.xMax - LABEL_EDGE_MARGIN_METRES,
        )
        .map((x) => ({ text: report.level.text, x, z: alongMetres })),
    ),
  );
}
