import type { LineParameters } from '../src/core/model/parameters';
import { defaultParameters } from '../src/core/model/parameters';
import type { TowerKind } from '../src/core/geometry/tower';

export interface LatencyCase {
  readonly name: string;
  readonly tower: TowerKind;
  readonly change: 'geometry' | 'drag' | 'voltage' | 'phasing';
  readonly base: LineParameters;
  readonly patches: readonly [Partial<LineParameters>, Partial<LineParameters>];
  readonly sweep: SagSweep | null;
  readonly interactive: boolean;
}

export interface SagSweep {
  readonly from: number;
  readonly step: number;
  readonly count: number;
}

export interface LatencyInput {
  readonly cases: readonly LatencyCase[];
  readonly warmups: number;
  readonly repeats: number;
}

export interface LatencySample {
  readonly backend: string | null;
  readonly quality: string | null;
  readonly solveMilliseconds: number;
  readonly evaluateMilliseconds: number;
  readonly pipelineMilliseconds: number;
  readonly updateMilliseconds: number;
  readonly renderMilliseconds: number;
  readonly endToEndMilliseconds: number;
}

export interface LatencyRow {
  readonly name: string;
  readonly samples: readonly LatencySample[];
}

export const LATENCY_WARMUPS = 3;
export const LATENCY_REPEATS = 15;
export const UPDATE_TARGET_MILLISECONDS = 200;

const HORIZONTAL = defaultParameters('horizontal');
const DOUBLE = defaultParameters('double-circuit');

const SAG_PATCHES: readonly [Partial<LineParameters>, Partial<LineParameters>] = [
  { phaseSag: 9 },
  { phaseSag: 11 },
];
export const SAG_SWEEP: SagSweep = { from: 8, step: 0.1, count: 40 };
const VOLTAGE_PATCHES: readonly [Partial<LineParameters>, Partial<LineParameters>] = [
  { lineToLineKilovolts: 380 },
  { lineToLineKilovolts: 420 },
];
const PHASING_PATCHES: readonly [Partial<LineParameters>, Partial<LineParameters>] = [
  { phasing: [0, 1, 2, 0, 1, 2] },
  { phasing: [0, 1, 2, 2, 1, 0] },
];

function latencyCase(
  tower: TowerKind,
  change: LatencyCase['change'],
  patches: LatencyCase['patches'],
  sweep: SagSweep | null = null,
): LatencyCase {
  return {
    name: `${tower} ${change === 'drag' ? 'geometry drag, draft quality' : change === 'geometry' ? 'geometry change' : change === 'voltage' ? 'voltage change' : 'phasing change'}`,
    tower,
    change,
    base: tower === 'horizontal' ? HORIZONTAL : DOUBLE,
    patches,
    sweep,
    interactive: change === 'drag',
  };
}

export const LATENCY_CASES: readonly LatencyCase[] = [
  latencyCase('horizontal', 'geometry', SAG_PATCHES, SAG_SWEEP),
  latencyCase('horizontal', 'drag', SAG_PATCHES, SAG_SWEEP),
  latencyCase('horizontal', 'voltage', VOLTAGE_PATCHES),
  latencyCase('double-circuit', 'geometry', SAG_PATCHES, SAG_SWEEP),
  latencyCase('double-circuit', 'voltage', VOLTAGE_PATCHES),
  latencyCase('double-circuit', 'phasing', PHASING_PATCHES),
];

export const LATENCY_SOURCE = `async (input) => {
  const api = window.fieldline;
  const rows = [];
  for (const spec of input.cases) {
    await api.setParameters(spec.base);
    const samples = [];
    for (let index = 0; index < input.warmups + input.repeats; index += 1) {
      const patch = spec.sweep === null
        ? spec.patches[index % 2]
        : { phaseSag: spec.sweep.from + (index % spec.sweep.count) * spec.sweep.step };
      const sample = await api.measureUpdate({ patch, interactive: spec.interactive });
      if (index >= input.warmups) {
        samples.push(sample);
      }
    }
    rows.push({ name: spec.name, samples });
  }
  return rows;
}`;

export interface LatencySummary {
  readonly name: string;
  readonly backend: string | null;
  readonly quality: string | null;
  readonly updateMedianMilliseconds: number;
  readonly updateP95Milliseconds: number;
  readonly solveMedianMilliseconds: number;
  readonly evaluateMedianMilliseconds: number;
  readonly renderMedianMilliseconds: number;
  readonly endToEndMedianMilliseconds: number;
  readonly withinTarget: boolean;
}

function quantile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

function roundTo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function summarizeLatency(row: LatencyRow): LatencySummary {
  const pick = (select: (sample: LatencySample) => number, fraction = 0.5): number =>
    roundTo(quantile(row.samples.map(select), fraction));
  const update = pick((sample) => sample.updateMilliseconds);
  return {
    name: row.name,
    backend: row.samples[0]?.backend ?? null,
    quality: row.samples[0]?.quality ?? null,
    updateMedianMilliseconds: update,
    updateP95Milliseconds: pick((sample) => sample.updateMilliseconds, 0.95),
    solveMedianMilliseconds: pick((sample) => sample.solveMilliseconds),
    evaluateMedianMilliseconds: pick((sample) => sample.evaluateMilliseconds),
    renderMedianMilliseconds: pick((sample) => sample.renderMilliseconds),
    endToEndMedianMilliseconds: pick((sample) => sample.endToEndMilliseconds),
    withinTarget: update < UPDATE_TARGET_MILLISECONDS,
  };
}
