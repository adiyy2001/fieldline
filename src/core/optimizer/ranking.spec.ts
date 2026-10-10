import type { ArrangementResult } from './evaluate';
import { bestAndWorst, criterionValue, rankArrangements } from './ranking';

function result(label: string, peakElectric: number, peakMagnetic = 1): ArrangementResult {
  return {
    arrangement: { left: [0, 1, 2], right: [0, 1, 2] },
    label,
    classKey: '012',
    mirrorClassKey: '012',
    selfMirrored: true,
    metrics: {
      peakElectric,
      peakMagnetic,
      electricAtDistance: peakElectric / 2,
      magneticAtDistance: peakMagnetic / 2,
    },
    moments: { electric: 1, magnetic: 1 },
    profile: { x: [], electric: new Float64Array(), magnetic: new Float64Array() },
  };
}

describe('ranking', () => {
  const results = [result('C', 30), result('A', 10), result('B', 20), result('D', 10)];

  it('sorts ascending and gives ties the same rank', () => {
    const ranked = rankArrangements(results, 'peak-electric');
    expect(ranked.map((entry) => entry.result.label)).toEqual(['A', 'D', 'B', 'C']);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 3, 4]);
  });

  it('reads each criterion from the matching metric', () => {
    const entry = result('X', 8, 4);
    expect(criterionValue(entry, 'peak-electric')).toBe(8);
    expect(criterionValue(entry, 'peak-magnetic')).toBe(4);
    expect(criterionValue(entry, 'electric-at-distance')).toBe(4);
    expect(criterionValue(entry, 'magnetic-at-distance')).toBe(2);
  });

  it('returns the first and last entry as best and worst', () => {
    const { best, worst } = bestAndWorst(rankArrangements(results, 'peak-electric'));
    expect(best.result.label).toBe('A');
    expect(worst.result.label).toBe('C');
  });

  it('refuses to pick from an empty ranking', () => {
    expect(() => bestAndWorst([])).toThrow(RangeError);
  });
});
