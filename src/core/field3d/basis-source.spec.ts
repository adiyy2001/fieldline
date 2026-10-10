import { createBasisFieldSource2D } from '../field2d/basis-source';
import { crossSectionFromLine } from '../field2d/cross-section';
import { createCrossSectionSolver } from '../field2d/solver';
import { defaultParameters, lineGeometryFromParameters } from '../model/parameters';
import {
  allArrangements,
  classKey,
  classOfArrangement,
  classRepresentatives,
  arrangementPhasing,
} from '../optimizer/arrangements';
import { type OptimizerSettings, evaluateArrangements } from '../optimizer/evaluate';
import { rankArrangements } from '../optimizer/ranking';
import { DEFAULT_PROFILE_SPEC } from '../profile/sampler';
import { groupExcitation } from '../model/excitation';
import { createBasisFieldSource3D } from './basis-source';
import { createFieldEvaluator3D } from './evaluate';
import { solveLine } from './solve-line';
import { resultantRms } from '../phasor';

function settingsFor(midZ: number): OptimizerSettings {
  return {
    lineToLineVolts: 400e3,
    currentAmperes: 1000,
    powerFactorAngleDegrees: 0,
    profile: { ...DEFAULT_PROFILE_SPEC, z: midZ },
    distance: 30,
  };
}

function sources(overrides: Partial<ReturnType<typeof defaultParameters>> = {}) {
  const parameters = { ...defaultParameters('double-circuit'), ...overrides };
  const { system } = solveLine(parameters);
  const section = crossSectionFromLine(lineGeometryFromParameters(parameters), {
    spanIndex: system.reference.index,
    bundleMode: 'equivalent',
  });
  return {
    parameters,
    system,
    three: createBasisFieldSource3D(system),
    two: createBasisFieldSource2D(createCrossSectionSolver(section)),
    settings: settingsFor(system.reference.midZ),
  };
}

describe('the 3D basis field source', () => {
  const { parameters, system, three, settings } = sources();

  it('has one group per phase position with real electric and magnetic basis fields', () => {
    expect(three.groupCount).toBe(6);
    const fields = three.sample([{ x: 5, y: 1, z: system.reference.midZ }]);
    expect(fields.pointCount).toBe(1);
    expect(fields.electric).toHaveLength(36);
    for (let index = 1; index < 36; index += 2) {
      expect(fields.electric[index]).toBe(0);
      expect(fields.magnetic[index]).toBe(0);
    }
  });

  it('reproduces the field of the direct evaluation for the optimizer arrangements', () => {
    const results = evaluateArrangements(three, settings);
    const representative = results[3];
    if (representative === undefined) {
      throw new Error('missing result');
    }
    const phasing = arrangementPhasing(representative.arrangement);
    const excitation = groupExcitation(parameters, phasing);
    const direct = createFieldEvaluator3D(system, excitation.voltages, excitation.currents);
    representative.profile.x.forEach((x, index) => {
      if (index % 20 !== 0) {
        return;
      }
      const field = direct({ x, y: 1, z: system.reference.midZ });
      expect(representative.profile.electric[index]).toBeCloseTo(resultantRms(field.electric), 6);
      expect(representative.profile.magnetic[index]).toBeCloseTo(resultantRms(field.magnetic), 12);
    });
  });

  it('gives the same metrics to all members of a symmetry class', () => {
    const everything = evaluateArrangements(three, settings, allArrangements());
    const byClass = new Map<string, typeof everything>();
    everything.forEach((result) => {
      const key = classKey(classOfArrangement(result.arrangement));
      byClass.set(key, [...(byClass.get(key) ?? []), result]);
    });
    expect(byClass.size).toBe(6);
    byClass.forEach((members) => {
      const first = members[0];
      members.forEach((member) => {
        expect(member.metrics.peakElectric).toBeCloseTo(first?.metrics.peakElectric ?? 0, 5);
        expect(member.metrics.peakMagnetic).toBeCloseTo(first?.metrics.peakMagnetic ?? 0, 12);
        expect(member.moments.magnetic).toBeCloseTo(first?.moments.magnetic ?? 0, 6);
      });
    });
  });

  it('puts each group at the centroid of its conductor in the reference span', () => {
    const positions = three.groupPositions;
    expect(positions[0]?.x).toBeCloseTo(-6, 9);
    expect(positions[3]?.x).toBeCloseTo(6, 9);
    expect(positions[0]?.y).toBeGreaterThan(positions[2]?.y ?? 0);
  });
});

describe('the 3D ranking of arrangements against the 2D ranking', () => {
  it('agrees on a straight line with long spans', () => {
    const { three, two, settings } = sources({ phaseSag: 0, spanLengths: [400, 400, 400] });
    const labels = (source: typeof three) =>
      rankArrangements(evaluateArrangements(source, settings), 'peak-electric').map(
        (entry) => entry.result.label,
      );
    expect(labels(three)).toEqual(labels(two));
    const magneticLabels = (source: typeof three) =>
      rankArrangements(evaluateArrangements(source, settings), 'peak-magnetic').map(
        (entry) => entry.result.label,
      );
    expect(magneticLabels(three)).toEqual(magneticLabels(two));
  });

  it('agrees on the default catenary line', () => {
    const { three, two, settings } = sources();
    const labels = (source: typeof three) =>
      rankArrangements(evaluateArrangements(source, settings), 'peak-electric').map(
        (entry) => entry.result.label,
      );
    expect(labels(three)).toEqual(labels(two));
  });

  it('agrees on the peak values to within a few thousandths on a straight line', () => {
    const { three, two, settings } = sources({ phaseSag: 0, spanLengths: [400, 400, 400] });
    const threeResults = evaluateArrangements(three, settings, classRepresentatives());
    const twoResults = evaluateArrangements(two, settings, classRepresentatives());
    threeResults.forEach((result, index) => {
      const reference = twoResults[index]?.metrics;
      expect(result.metrics.peakElectric / (reference?.peakElectric ?? 1)).toBeCloseTo(1, 3);
      expect(result.metrics.peakMagnetic / (reference?.peakMagnetic ?? 1)).toBeCloseTo(1, 2);
    });
  });

  it('agrees on the dipole per volt and the group positions on a straight line', () => {
    const { three, two } = sources({ phaseSag: 0, spanLengths: [400, 400, 400] });
    three.electricDipolePerVolt.forEach((value, group) => {
      const reference = two.electricDipolePerVolt[group] ?? 1;
      expect(Math.abs(value / reference - 1)).toBeLessThan(2e-3);
    });
    three.groupPositions.forEach((position, group) => {
      expect(position.x).toBeCloseTo(two.groupPositions[group]?.x ?? 0, 9);
      expect(position.y).toBeCloseTo(two.groupPositions[group]?.y ?? 0, 9);
    });
  });
});
