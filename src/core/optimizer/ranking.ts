import type { ArrangementMetrics, ArrangementResult } from './evaluate';

export type RankCriterion =
  'peak-electric' | 'peak-magnetic' | 'electric-at-distance' | 'magnetic-at-distance';

export interface RankedResult {
  readonly rank: number;
  readonly value: number;
  readonly result: ArrangementResult;
}

const CRITERION_FIELD: Readonly<Record<RankCriterion, keyof ArrangementMetrics>> = {
  'peak-electric': 'peakElectric',
  'peak-magnetic': 'peakMagnetic',
  'electric-at-distance': 'electricAtDistance',
  'magnetic-at-distance': 'magneticAtDistance',
};

const TIE_TOLERANCE = 1e-9;

export function criterionValue(result: ArrangementResult, criterion: RankCriterion): number {
  return result.metrics[CRITERION_FIELD[criterion]];
}

function tied(first: number, second: number): boolean {
  return Math.abs(first - second) <= TIE_TOLERANCE * Math.max(Math.abs(first), Math.abs(second));
}

export function rankArrangements(
  results: readonly ArrangementResult[],
  criterion: RankCriterion,
): readonly RankedResult[] {
  const ordered = results
    .map((result) => ({ result, value: criterionValue(result, criterion) }))
    .sort((a, b) => a.value - b.value || a.result.label.localeCompare(b.result.label));
  const ranked: RankedResult[] = [];
  ordered.forEach((entry, index) => {
    const previous = ranked[index - 1];
    const rank =
      previous !== undefined && tied(previous.value, entry.value) ? previous.rank : index + 1;
    ranked.push({ rank, ...entry });
  });
  return ranked;
}

export function bestAndWorst(ranked: readonly RankedResult[]): {
  readonly best: RankedResult;
  readonly worst: RankedResult;
} {
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (best === undefined || worst === undefined) {
    throw new RangeError('There is nothing to rank');
  }
  return { best, worst };
}
