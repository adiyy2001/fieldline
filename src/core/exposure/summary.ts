import type { Profile } from '../profile/sampler';
import { profilePeak, profileValues } from '../profile/sampler';
import { type ContourLevel, formatNumber, formatQuantity } from './contour-levels';
import type { FieldQuantity } from './levels';

export interface Interval {
  readonly from: number;
  readonly to: number;
}

export interface LevelReport {
  readonly level: ContourLevel;
  readonly reached: boolean;
  readonly intervals: readonly Interval[];
}

export interface ProfileSummary {
  readonly peakElectric: { readonly x: number; readonly value: number };
  readonly peakMagnetic: { readonly x: number; readonly value: number };
  readonly reports: readonly LevelReport[];
}

function crossingPosition(x0: number, x1: number, v0: number, v1: number, level: number): number {
  const span = v1 - v0;
  return span === 0 ? x0 : x0 + ((level - v0) / span) * (x1 - x0);
}

export function exceedanceIntervals(
  positions: readonly number[],
  values: readonly number[],
  level: number,
): readonly Interval[] {
  const intervals: Interval[] = [];
  let start: number | null = null;
  for (let index = 0; index < positions.length; index += 1) {
    const x = positions[index] ?? 0;
    const value = values[index] ?? 0;
    const above = value >= level;
    if (index === 0) {
      start = above ? x : null;
      continue;
    }
    const previousX = positions[index - 1] ?? 0;
    const previousValue = values[index - 1] ?? 0;
    if (above && start === null) {
      start = crossingPosition(previousX, x, previousValue, value, level);
    } else if (!above && start !== null) {
      intervals.push({
        from: start,
        to: crossingPosition(previousX, x, previousValue, value, level),
      });
      start = null;
    }
  }
  const last = positions[positions.length - 1];
  if (start !== null && last !== undefined) {
    intervals.push({ from: start, to: last });
  }
  return intervals;
}

function displayedValues(profile: Profile, quantity: FieldQuantity): readonly number[] {
  const values = profileValues(profile, quantity);
  return quantity === 'electric' ? values.map((value) => value / 1000) : values;
}

export function summarizeProfile(
  profile: Profile,
  quantity: FieldQuantity,
  levels: readonly ContourLevel[],
): ProfileSummary {
  const electric = profilePeak(profile, 'electric');
  const magnetic = profilePeak(profile, 'magnetic');
  const positions = profile.samples.map((sample) => sample.x);
  const values = displayedValues(profile, quantity);
  return {
    peakElectric: { x: electric.x, value: electric.value / 1000 },
    peakMagnetic: magnetic,
    reports: levels.map((level) => {
      const intervals = exceedanceIntervals(positions, values, level.value);
      return { level, reached: intervals.length > 0, intervals };
    }),
  };
}

function describeInterval(interval: Interval): string {
  return `${formatNumber(interval.from)} to ${formatNumber(interval.to)} m`;
}

export function describeReport(report: LevelReport): string {
  const name = `${report.level.text} (${report.level.sources.join(', ')})`;
  return report.reached
    ? `${name}: exceeded at x from ${report.intervals.map(describeInterval).join(' and ')}`
    : `${name}: not reached`;
}

export function describeSummary(
  summary: ProfileSummary,
  quantity: FieldQuantity,
  height: number,
): string {
  const electric = `${formatQuantity(summary.peakElectric.value, 'electric')} at x = ${formatNumber(summary.peakElectric.x)} m`;
  const magnetic = `${formatQuantity(summary.peakMagnetic.value, 'magnetic')} at x = ${formatNumber(summary.peakMagnetic.x)} m`;
  const reports = summary.reports.map(describeReport).join('. ');
  const subject = quantity === 'electric' ? 'electric field' : 'magnetic field';
  return `Mid-span, ${formatNumber(height)} m above ground: peak E ${electric}, peak B ${magnetic}. Contours for the ${subject}. ${reports}.`;
}
