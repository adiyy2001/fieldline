import { createBasisFieldSource2D } from '../field2d/basis-source';
import { resultantRms } from '../phasor';
import { DEFAULT_PROFILE_SPEC } from '../profile/sampler';
import { evaluatorFor, fixtureFor } from '../testing/fixtures';
import {
  allArrangements,
  classKey,
  classOfArrangement,
  classRepresentatives,
} from './arrangements';
import { type OptimizerSettings, evaluateArrangements, optimizerPoints } from './evaluate';

const fixture = fixtureFor('double-circuit');
const source = createBasisFieldSource2D(fixture.solver);
const settings: OptimizerSettings = {
  lineToLineVolts: 400e3,
  currentAmperes: 1000,
  powerFactorAngleDegrees: 0,
  profile: DEFAULT_PROFILE_SPEC,
  distance: 30,
};

describe('arrangement evaluation', () => {
  const everything = evaluateArrangements(source, settings, allArrangements());
  const representatives = evaluateArrangements(source, settings);

  it('adds the two distance points to the profile points', () => {
    const points = optimizerPoints(settings);
    expect(points).toHaveLength(241 + 2);
    expect(points[241]).toEqual({ x: -30, y: 1, z: 0 });
    expect(points[242]).toEqual({ x: 30, y: 1, z: 0 });
  });

  it('evaluates the six class representatives by default', () => {
    expect(representatives).toHaveLength(6);
    expect(representatives.map((result) => result.label)[0]).toBe('ABC | ABC');
  });

  it('gives the same metrics to all members of a class', () => {
    const byClass = new Map<string, typeof everything>();
    everything.forEach((result) => {
      const key = classKey(classOfArrangement(result.arrangement));
      byClass.set(key, [...(byClass.get(key) ?? []), result]);
    });
    expect(byClass.size).toBe(6);
    byClass.forEach((members) => {
      const first = members[0];
      members.forEach((member) => {
        expect(member.metrics.peakElectric).toBeCloseTo(first?.metrics.peakElectric ?? 0, 6);
        expect(member.metrics.peakMagnetic).toBeCloseTo(first?.metrics.peakMagnetic ?? 0, 12);
        expect(member.metrics.electricAtDistance).toBeCloseTo(
          first?.metrics.electricAtDistance ?? 0,
          6,
        );
        expect(member.moments.magnetic).toBeCloseTo(first?.moments.magnetic ?? 0, 6);
        expect(member.moments.electric).toBeCloseTo(first?.moments.electric ?? 0, 15);
      });
    });
  });

  it('matches a direct evaluation of the field for the peak values', () => {
    const result = representatives[3];
    if (result === undefined) {
      throw new Error('missing result');
    }
    const direct = evaluatorFor(fixture, [...result.arrangement.left, ...result.arrangement.right]);
    let peakE = 0;
    let peakB = 0;
    result.profile.x.forEach((x) => {
      const field = direct({ x, y: 1, z: 0 });
      peakE = Math.max(peakE, resultantRms(field.electric));
      peakB = Math.max(peakB, resultantRms(field.magnetic));
    });
    expect(result.metrics.peakElectric).toBeCloseTo(peakE, 6);
    expect(result.metrics.peakMagnetic).toBeCloseTo(peakB, 12);
  });

  it('reports the larger side for the value at a distance', () => {
    const result = representatives[1];
    const left = result?.profile.x.indexOf(-30) ?? -1;
    const right = result?.profile.x.indexOf(30) ?? -1;
    const expected = Math.max(
      result?.profile.electric[left] ?? 0,
      result?.profile.electric[right] ?? 0,
    );
    expect(result?.metrics.electricAtDistance).toBeCloseTo(expected, 9);
  });

  it('gives a mirrored profile for the two cyclic classes and equal peaks', () => {
    const cyclic = representatives.filter((result) => !result.selfMirrored);
    expect(cyclic).toHaveLength(2);
    const [first, second] = cyclic;
    expect(first?.mirrorClassKey).toBe(second?.classKey);
    expect(first?.metrics.peakElectric).toBeCloseTo(second?.metrics.peakElectric ?? 0, 6);
    const count = first?.profile.x.length ?? 0;
    for (let index = 0; index < count; index += 1) {
      expect(first?.profile.electric[index]).toBeCloseTo(
        second?.profile.electric[count - 1 - index] ?? 0,
        6,
      );
      expect(first?.profile.magnetic[index]).toBeCloseTo(
        second?.profile.magnetic[count - 1 - index] ?? 0,
        12,
      );
    }
  });

  it('gives a symmetric profile for the self mirrored classes', () => {
    const symmetric = representatives.filter((result) => result.selfMirrored);
    expect(symmetric).toHaveLength(4);
    symmetric.forEach((result) => {
      const count = result.profile.x.length;
      for (let index = 0; index < count; index += 1) {
        expect(result.profile.electric[index]).toBeCloseTo(
          result.profile.electric[count - 1 - index] ?? 0,
          6,
        );
      }
    });
  });

  it('orders the far magnetic field like the dipole moment', () => {
    const byMoment = [...representatives].sort((a, b) => a.moments.magnetic - b.moments.magnetic);
    const smallest = byMoment[0];
    const largest = byMoment[byMoment.length - 1];
    expect(smallest?.moments.magnetic).toBeCloseTo(0, 6);
    expect(smallest?.label).toBe('ABC | CBA');
    expect(largest?.label).toBe('ABC | ABC');
    const farFields = byMoment.map((result) => result.metrics.magneticAtDistance);
    expect(farFields[0]).toBe(Math.min(...farFields));
    expect(farFields[farFields.length - 1]).toBe(Math.max(...farFields));
  });

  it('separates the best from the worst peak electric field by a clear margin', () => {
    const peaks = representatives.map((result) => result.metrics.peakElectric);
    expect(Math.max(...peaks) / Math.min(...peaks)).toBeGreaterThan(1.5);
  });

  it('exports the representative list as arrangements', () => {
    expect(classRepresentatives()).toHaveLength(6);
  });
});
