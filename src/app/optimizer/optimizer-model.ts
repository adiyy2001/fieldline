import type { ChartSpec } from '../../core/plot/chart-model';
import type { ContourLevel } from '../../core/exposure/contour-levels';
import { formatQuantity } from '../../core/exposure/contour-levels';
import { type FieldQuantity, kilovoltsPerMetre, microtesla } from '../../core/exposure/levels';
import type { LineParameters } from '../../core/model/parameters';
import {
  IDENTITY,
  type Arrangement,
  type Permutation,
  arrangementFromPhasing,
  arrangementLabel,
  classKey,
  classOfArrangement,
  isSelfMirrored,
  mirrorClass,
} from '../../core/optimizer/arrangements';
import type { BasisFieldSource } from '../../core/optimizer/basis-field-source';
import {
  type ArrangementResult,
  type OptimizerSettings,
  evaluateArrangements,
} from '../../core/optimizer/evaluate';
import {
  type RankCriterion,
  type RankedResult,
  bestAndWorst,
  rankArrangements,
} from '../../core/optimizer/ranking';
import { DEFAULT_PROFILE_SPEC } from '../../core/profile/sampler';
import { levelLines } from '../profile/profile-model';

export type SortColumn =
  | 'rank'
  | 'arrangement'
  | 'peakElectric'
  | 'peakMagnetic'
  | 'electricAtDistance'
  | 'magneticAtDistance';

export type SortDirection = 'ascending' | 'descending';

export interface OptimizerRow {
  readonly key: string;
  readonly rank: number;
  readonly label: string;
  readonly symbols: string;
  readonly peakElectric: number;
  readonly peakMagnetic: number;
  readonly electricAtDistance: number;
  readonly magneticAtDistance: number;
  readonly mirror: string | null;
  readonly current: boolean;
  readonly best: boolean;
  readonly worst: boolean;
  readonly arrangement: Arrangement;
}

export interface OptimizerRequest {
  readonly parameters: LineParameters;
  readonly height: number;
  readonly z: number;
  readonly distance: number;
  readonly step: number;
}

export const CRITERION_LABELS: Readonly<Record<RankCriterion, string>> = {
  'peak-electric': 'Peak electric field',
  'peak-magnetic': 'Peak magnetic flux density',
  'electric-at-distance': 'Electric field at a distance',
  'magnetic-at-distance': 'Magnetic flux density at a distance',
};

export const CRITERIA: readonly RankCriterion[] = [
  'peak-electric',
  'peak-magnetic',
  'electric-at-distance',
  'magnetic-at-distance',
];

const PHASE_SYMBOLS = ['●', '■', '▲'];
const PHASE_LETTERS = ['A', 'B', 'C'];

export function supportsOptimizer(parameters: LineParameters): boolean {
  return parameters.phasing.length === 6;
}

export function criterionQuantity(criterion: RankCriterion): FieldQuantity {
  return criterion === 'peak-electric' || criterion === 'electric-at-distance'
    ? 'electric'
    : 'magnetic';
}

export function criterionNeedsDistance(criterion: RankCriterion): boolean {
  return criterion === 'electric-at-distance' || criterion === 'magnetic-at-distance';
}

export function optimizerSettings(request: OptimizerRequest): OptimizerSettings {
  return {
    lineToLineVolts: request.parameters.lineToLineKilovolts * 1000,
    currentAmperes: request.parameters.currentAmperes,
    powerFactorAngleDegrees: request.parameters.powerFactorAngleDegrees,
    profile: {
      ...DEFAULT_PROFILE_SPEC,
      step: request.step,
      height: request.height,
      z: request.z,
    },
    distance: request.distance,
  };
}

export function evaluateOptimizer(
  source: BasisFieldSource,
  request: OptimizerRequest,
): readonly ArrangementResult[] {
  return evaluateArrangements(source, optimizerSettings(request));
}

export function phaseSymbols(permutation: Permutation): string {
  return permutation.map((phase) => PHASE_SYMBOLS[phase] ?? '?').join(' ');
}

export function arrangementSymbols(arrangement: Arrangement): string {
  return `${phaseSymbols(arrangement.left)} | ${phaseSymbols(arrangement.right)}`;
}

export function arrangementSpelling(arrangement: Arrangement): string {
  const spell = (permutation: Permutation) =>
    permutation.map((phase) => `phase ${PHASE_LETTERS[phase] ?? '?'}`).join(', ');
  return `top to bottom, left circuit ${spell(arrangement.left)}; right circuit ${spell(arrangement.right)}`;
}

export function currentClassKey(phasing: readonly number[]): string | null {
  const arrangement = arrangementFromPhasing(phasing);
  return arrangement === undefined ? null : classKey(classOfArrangement(arrangement));
}

export function optimizerRows(
  results: readonly ArrangementResult[],
  criterion: RankCriterion,
  phasing: readonly number[],
): readonly OptimizerRow[] {
  const ranked = rankArrangements(results, criterion);
  const current = currentClassKey(phasing);
  const lastRank = ranked[ranked.length - 1]?.rank;
  return ranked.map((entry) => {
    const { result } = entry;
    const permutation = classOfArrangement(result.arrangement);
    const mirror = isSelfMirrored(permutation)
      ? null
      : arrangementLabel({ left: IDENTITY, right: mirrorClass(permutation) });
    return {
      key: result.classKey,
      rank: entry.rank,
      label: result.label,
      symbols: arrangementSymbols(result.arrangement),
      peakElectric: kilovoltsPerMetre(result.metrics.peakElectric),
      peakMagnetic: microtesla(result.metrics.peakMagnetic),
      electricAtDistance: kilovoltsPerMetre(result.metrics.electricAtDistance),
      magneticAtDistance: microtesla(result.metrics.magneticAtDistance),
      mirror,
      current: result.classKey === current,
      best: entry.rank === 1,
      worst: entry.rank === lastRank && lastRank !== 1,
      arrangement: result.arrangement,
    };
  });
}

function sortValue(row: OptimizerRow, column: SortColumn): number | string {
  return column === 'arrangement' ? row.label : row[column];
}

export function sortRows(
  rows: readonly OptimizerRow[],
  column: SortColumn,
  direction: SortDirection,
): readonly OptimizerRow[] {
  const factor = direction === 'ascending' ? 1 : -1;
  return [...rows].sort((first, second) => {
    const a = sortValue(first, column);
    const b = sortValue(second, column);
    const order =
      typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b);
    return factor * order || first.label.localeCompare(second.label);
  });
}

export function nextSort(
  current: { column: SortColumn; direction: SortDirection },
  column: SortColumn,
): { column: SortColumn; direction: SortDirection } {
  if (current.column === column) {
    return { column, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
  }
  return { column, direction: 'ascending' };
}

export function bestWorstOf(
  results: readonly ArrangementResult[],
  criterion: RankCriterion,
): { best: RankedResult; worst: RankedResult } {
  return bestAndWorst(rankArrangements(results, criterion));
}

export interface ComparisonInput {
  readonly best: ArrangementResult;
  readonly worst: ArrangementResult;
  readonly quantity: FieldQuantity;
  readonly levels: readonly ContourLevel[];
  readonly height: number;
}

export function comparisonChartSpec(input: ComparisonInput): ChartSpec {
  const { best, worst, quantity } = input;
  const electric = quantity === 'electric';
  const convert = electric ? kilovoltsPerMetre : microtesla;
  const pointsOf = (result: ArrangementResult) => {
    const values = electric ? result.profile.electric : result.profile.magnetic;
    return result.profile.x.map((x, index) => ({ x, y: convert(values[index] ?? 0) }));
  };
  const peakOf = (result: ArrangementResult) =>
    formatQuantity(
      convert(electric ? result.metrics.peakElectric : result.metrics.peakMagnetic),
      quantity,
    );
  const first = best.profile.x[0] ?? -60;
  const last = best.profile.x[best.profile.x.length - 1] ?? 60;
  return {
    title: `Best and worst arrangement, ${electric ? 'electric field E' : 'magnetic flux density B'}`,
    description: `Resultant rms value ${String(input.height)} m above ground for the best arrangement ${best.label} (peak ${peakOf(best)}) and the worst arrangement ${worst.label} (peak ${peakOf(worst)}).`,
    x: { label: 'Lateral distance x (m)', min: first, max: last },
    y: { label: electric ? 'E (kV/m)' : 'B (µT)' },
    series: [
      {
        id: 'best',
        label: `Best ${best.label}, peak ${peakOf(best)}`,
        points: pointsOf(best),
        colorIndex: 0,
        dash: '',
      },
      {
        id: 'worst',
        label: `Worst ${worst.label}, peak ${peakOf(worst)}`,
        points: pointsOf(worst),
        colorIndex: 1,
        dash: '8 4',
      },
    ],
    levelLines: levelLines(input.levels),
  };
}
