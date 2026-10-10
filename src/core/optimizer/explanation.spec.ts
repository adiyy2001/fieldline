import type { ArrangementResult } from './evaluate';
import { explainBestAgainstWorst, unlikePairCount } from './explanation';
import type { RankedResult } from './ranking';

function ranked(
  rank: number,
  label: string,
  arrangement: ArrangementResult['arrangement'],
  peakElectric: number,
  magneticMoment: number,
  electricMoment: number,
  selfMirrored: boolean,
): RankedResult {
  return {
    rank,
    value: peakElectric,
    result: {
      arrangement,
      label,
      classKey: '012',
      mirrorClassKey: '012',
      selfMirrored,
      metrics: {
        peakElectric,
        peakMagnetic: 5e-6,
        electricAtDistance: 100,
        magneticAtDistance: 1e-7,
      },
      moments: { electric: electricMoment, magnetic: magneticMoment },
      profile: { x: [], electric: new Float64Array(), magnetic: new Float64Array() },
    },
  };
}

describe('explanation', () => {
  const best = ranked(
    1,
    'ABC | BCA',
    { left: [0, 1, 2], right: [1, 2, 0] },
    1200,
    8000,
    20e-6,
    false,
  );
  const worst = ranked(
    6,
    'ABC | ABC',
    { left: [0, 1, 2], right: [0, 1, 2] },
    3000,
    24000,
    60e-6,
    true,
  );

  it('counts the levels where the two circuits carry different phases', () => {
    expect(unlikePairCount(best.result)).toBe(3);
    expect(unlikePairCount(worst.result)).toBe(0);
  });

  it('builds the sentences from the numbers', () => {
    const explanation = explainBestAgainstWorst(best, worst, {
      criterion: 'peak-electric',
      height: 1,
      distance: 30,
    });
    expect(explanation.reductionPercent).toBeCloseTo(60, 9);
    expect(explanation.magneticMomentRatio).toBeCloseTo(3, 9);
    expect(explanation.electricMomentRatio).toBeCloseTo(3, 9);
    expect(explanation.sentences[0]).toBe(
      'ABC | BCA gives the lowest peak electric field at 1 m above ground: 1.2 kV/m, against 3 kV/m for ABC | ABC, which is 60 percent lower.',
    );
    expect(explanation.sentences[1]).toContain('dipole moment');
    expect(explanation.sentences[1]).toContain('8000 A·m');
    expect(explanation.sentences[1]).toContain('24000 A·m');
    expect(explanation.sentences[2]).toContain('20 µC for the best arrangement and 60 µC');
    expect(explanation.sentences[3]).toContain('at 3 of them and the worst at 0');
    expect(explanation.sentences[4]).toBe(
      'Its mirror image ABC | CAB has the same peak values with the profile mirrored left to right.',
    );
  });

  it('omits the mirror sentence for a self mirrored best arrangement', () => {
    const own = ranked(1, 'ABC | CBA', { left: [0, 1, 2], right: [2, 1, 0] }, 1000, 1, 1, true);
    const explanation = explainBestAgainstWorst(own, worst, {
      criterion: 'peak-magnetic',
      height: 1.8,
      distance: 30,
    });
    expect(explanation.sentences).toHaveLength(4);
    expect(explanation.sentences[0]).toContain('peak magnetic flux density at 1.8 m above ground');
  });

  it('writes a numerically zero moment as zero', () => {
    const cancelled = ranked(
      1,
      'ABC | CBA',
      { left: [0, 1, 2], right: [2, 1, 0] },
      1000,
      2e-11,
      1e-18,
      true,
    );
    const explanation = explainBestAgainstWorst(cancelled, worst, {
      criterion: 'peak-electric',
      height: 1,
      distance: 30,
    });
    expect(explanation.sentences[1]).toContain('summed) of 0 A·m, against 24000 A·m');
    expect(explanation.sentences[2]).toContain('is 0 µC for the best');
  });

  it('names the distance criteria', () => {
    const electric = explainBestAgainstWorst(best, worst, {
      criterion: 'electric-at-distance',
      height: 1,
      distance: 30,
    });
    expect(electric.sentences[0]).toContain(
      'electric field at 30 m from the axis, 1 m above ground',
    );
    const magnetic = explainBestAgainstWorst(best, worst, {
      criterion: 'magnetic-at-distance',
      height: 1,
      distance: 20,
    });
    expect(magnetic.sentences[0]).toContain('magnetic flux density at 20 m from the axis');
  });

  it('handles an equal pair without dividing by zero', () => {
    const zero = ranked(1, 'ABC | BCA', { left: [0, 1, 2], right: [1, 2, 0] }, 0, 0, 0, true);
    const explanation = explainBestAgainstWorst(zero, zero, {
      criterion: 'peak-electric',
      height: 1,
      distance: 30,
    });
    expect(explanation.reductionPercent).toBe(0);
    expect(explanation.magneticMomentRatio).toBe(Number.POSITIVE_INFINITY);
  });
});
