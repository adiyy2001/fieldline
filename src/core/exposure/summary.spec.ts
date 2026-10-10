import { describe, expect, it } from 'vitest';
import type { Profile, ProfileSample } from '../profile/sampler';
import { contourLevels } from './contour-levels';
import { describeReport, describeSummary, exceedanceIntervals, summarizeProfile } from './summary';

const ZERO = { re: 0, im: 0 };
const ZERO_VECTOR = { x: ZERO, y: ZERO, z: ZERO };

function sample(x: number, electricRms: number, magneticRms: number): ProfileSample {
  return { x, electricRms, magneticRms, electric: ZERO_VECTOR, magnetic: ZERO_VECTOR };
}

function profileOf(electricKilovolts: readonly number[]): Profile {
  return {
    spec: { xMin: -2, xMax: 2, step: 1, height: 1, z: 0 },
    samples: electricKilovolts.map((value, index) => sample(index - 2, value * 1000, value * 1e-5)),
  };
}

describe('exceedance intervals', () => {
  const positions = [-2, -1, 0, 1, 2];

  it('interpolates the crossings of a single hump', () => {
    const intervals = exceedanceIntervals(positions, [0, 2, 4, 2, 0], 3);
    expect(intervals).toEqual([{ from: -0.5, to: 0.5 }]);
  });

  it('keeps an open interval to the end of the profile', () => {
    expect(exceedanceIntervals(positions, [0, 0, 2, 4, 6], 3)).toEqual([{ from: 0.5, to: 2 }]);
  });

  it('starts at the first sample when the profile begins above the level', () => {
    expect(exceedanceIntervals(positions, [5, 5, 0, 0, 0], 3)).toEqual([{ from: -2, to: -0.6 }]);
  });

  it('reports two intervals for two humps and none when the level is not reached', () => {
    expect(exceedanceIntervals(positions, [4, 0, 0, 0, 4], 2)).toHaveLength(2);
    expect(exceedanceIntervals(positions, [1, 1, 1, 1, 1], 2)).toEqual([]);
    expect(exceedanceIntervals([], [], 2)).toEqual([]);
  });

  it('handles a flat segment on the level and an equal pair', () => {
    expect(exceedanceIntervals([0, 1], [2, 2], 2)).toEqual([{ from: 0, to: 1 }]);
  });
});

describe('profile summary', () => {
  const levels = contourLevels('electric', 'icnirp-2010');
  const summary = summarizeProfile(profileOf([0.5, 3, 6, 3, 0.5]), 'electric', levels);

  it('finds the peaks', () => {
    expect(summary.peakElectric).toEqual({ x: 0, value: 6 });
    expect(summary.peakMagnetic.x).toBe(0);
    expect(summary.peakMagnetic.value).toBeCloseTo(60, 9);
  });

  it('reports which of the levels are reached', () => {
    expect(summary.reports.map((report) => report.reached)).toEqual([true, true, false]);
  });

  it('describes reached and unreached levels', () => {
    const texts = summary.reports.map(describeReport);
    expect(texts[1]).toBe('5 kV/m (ICNIRP 2010, ICNIRP 1998): exceeded at x from -0.33 to 0.33 m');
    expect(texts[2]).toBe('10 kV/m (Poland public): not reached');
  });

  it('writes one sentence block for the live region', () => {
    const text = describeSummary(summary, 'electric', 1);
    expect(text).toContain('Mid-span, 1 m above ground');
    expect(text).toContain('peak E 6 kV/m at x = 0 m');
    expect(text).toContain('peak B 60 µT at x = 0 m');
    expect(text).toContain('10 kV/m (Poland public): not reached');
  });
});
