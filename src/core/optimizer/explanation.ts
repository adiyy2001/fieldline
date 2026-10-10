import { IDENTITY, arrangementLabel, classOfArrangement, mirrorClass } from './arrangements';
import type { ArrangementResult } from './evaluate';
import { type RankCriterion, type RankedResult, criterionValue } from './ranking';

export interface ExplanationContext {
  readonly criterion: RankCriterion;
  readonly height: number;
  readonly distance: number;
}

export interface Explanation {
  readonly reductionPercent: number;
  readonly magneticMomentRatio: number;
  readonly electricMomentRatio: number;
  readonly unlikePairsBest: number;
  readonly unlikePairsWorst: number;
  readonly sentences: readonly string[];
}

const CRITERION_UNITS: Readonly<Record<RankCriterion, { scale: number; unit: string }>> = {
  'peak-electric': { scale: 1e-3, unit: 'kV/m' },
  'peak-magnetic': { scale: 1e6, unit: 'µT' },
  'electric-at-distance': { scale: 1e-3, unit: 'kV/m' },
  'magnetic-at-distance': { scale: 1e6, unit: 'µT' },
};

function significant(value: number): string {
  return String(Number(value.toPrecision(3)));
}

const NEGLIGIBLE_RATIO = 1e-6;

function significantAgainst(value: number, reference: number): string {
  return value <= NEGLIGIBLE_RATIO * reference ? '0' : significant(value);
}

function criterionSubject(context: ExplanationContext): string {
  const height = `${significant(context.height)} m above ground`;
  const distance = `${significant(context.distance)} m from the axis`;
  switch (context.criterion) {
    case 'peak-electric':
      return `peak electric field at ${height}`;
    case 'peak-magnetic':
      return `peak magnetic flux density at ${height}`;
    case 'electric-at-distance':
      return `electric field at ${distance}, ${height}`;
    case 'magnetic-at-distance':
      return `magnetic flux density at ${distance}, ${height}`;
  }
}

export function unlikePairCount(result: ArrangementResult): number {
  const { left, right } = result.arrangement;
  return left.filter((phase, level) => phase !== right[level]).length;
}

function ratio(worst: number, best: number): number {
  return best > 0 ? worst / best : Number.POSITIVE_INFINITY;
}

function levelsSentence(best: number, worst: number): string {
  return `Counting the three heights where the two circuits face each other, the best arrangement puts different phases opposite each other at ${best} of them and the worst at ${worst}.`;
}

export function explainBestAgainstWorst(
  best: RankedResult,
  worst: RankedResult,
  context: ExplanationContext,
): Explanation {
  const { scale, unit } = CRITERION_UNITS[context.criterion];
  const bestValue = criterionValue(best.result, context.criterion);
  const worstValue = criterionValue(worst.result, context.criterion);
  const reductionPercent = worstValue > 0 ? (1 - bestValue / worstValue) * 100 : 0;
  const magneticMomentRatio = ratio(worst.result.moments.magnetic, best.result.moments.magnetic);
  const electricMomentRatio = ratio(worst.result.moments.electric, best.result.moments.electric);
  const sentences = [
    `${best.result.label} gives the lowest ${criterionSubject(context)}: ${significant(bestValue * scale)} ${unit}, against ${significant(worstValue * scale)} ${unit} for ${worst.result.label}, which is ${significant(reductionPercent)} percent lower.`,
    `The six currents of ${best.result.label} have a dipole moment (each current times its position, summed) of ${significantAgainst(best.result.moments.magnetic, worst.result.moments.magnetic)} A·m, against ${significant(worst.result.moments.magnetic)} A·m for ${worst.result.label}. The currents add up to zero, so far from the line the magnetic field is dominated by this moment, and a smaller moment means stronger cancellation.`,
    `The same argument holds for the electric field with the ground included: the vertical charge moment is ${significantAgainst(best.result.moments.electric * 1e6, worst.result.moments.electric * 1e6)} µC for the best arrangement and ${significant(worst.result.moments.electric * 1e6)} µC for the worst.`,
    levelsSentence(unlikePairCount(best.result), unlikePairCount(worst.result)),
  ];
  if (!best.result.selfMirrored) {
    const mirror = arrangementLabel({
      left: IDENTITY,
      right: mirrorClass(classOfArrangement(best.result.arrangement)),
    });
    sentences.push(
      `Its mirror image ${mirror} has the same peak values with the profile mirrored left to right.`,
    );
  }
  return {
    reductionPercent,
    magneticMomentRatio,
    electricMomentRatio,
    unlikePairsBest: unlikePairCount(best.result),
    unlikePairsWorst: unlikePairCount(worst.result),
    sentences,
  };
}
