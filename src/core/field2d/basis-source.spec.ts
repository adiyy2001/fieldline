import { resultantRms } from '../phasor';
import { fixtureFor, evaluatorFor, groupPhasors } from '../testing/fixtures';
import { phaseCurrentPhasors, phaseVoltagePhasors } from '../phasor';
import { BASIS_COMPONENTS, basisOffset } from '../optimizer/basis-field-source';
import { createBasisFieldSource2D } from './basis-source';

describe('2D basis field source', () => {
  const fixture = fixtureFor('double-circuit');
  const source = createBasisFieldSource2D(fixture.solver);
  const points = [
    { x: -12, y: 1, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 9, y: 1.8, z: 0 },
  ];

  it('reports one group per phase position with the centroid of its wires', () => {
    expect(source.groupCount).toBe(6);
    expect(source.groupPositions[0]).toEqual({ x: -6, y: 38 - 10 });
    expect(source.groupPositions[5]).toEqual({ x: 6, y: 24 - 10 });
  });

  it('has a positive vertical charge moment for every conductor', () => {
    expect(source.electricDipolePerVolt.every((moment) => moment > 0)).toBe(true);
  });

  it('lays out six numbers per group and point', () => {
    const fields = source.sample(points);
    expect(fields.pointCount).toBe(3);
    expect(fields.electric).toHaveLength(6 * 3 * BASIS_COMPONENTS);
    expect(basisOffset(fields, 2, 1)).toBe((2 * 3 + 1) * BASIS_COMPONENTS);
  });

  it('recombines into the direct evaluation for any phasing', () => {
    const phasing = [0, 2, 1, 1, 0, 2];
    const direct = evaluatorFor(fixture, phasing);
    const fields = source.sample(points);
    const voltages = groupPhasors(phasing, phaseVoltagePhasors(400e3));
    const currents = groupPhasors(phasing, phaseCurrentPhasors(1000, 0));
    points.forEach((point, pointIndex) => {
      const expected = direct(point);
      let electricSquared = 0;
      let magneticSquared = 0;
      for (let component = 0; component < BASIS_COMPONENTS; component += 2) {
        let eRe = 0;
        let eIm = 0;
        let bRe = 0;
        let bIm = 0;
        voltages.forEach((voltage, group) => {
          const offset = basisOffset(fields, group, pointIndex) + component;
          const re = fields.electric[offset] ?? 0;
          const im = fields.electric[offset + 1] ?? 0;
          eRe += re * voltage.re - im * voltage.im;
          eIm += re * voltage.im + im * voltage.re;
        });
        currents.forEach((current, group) => {
          const offset = basisOffset(fields, group, pointIndex) + component;
          const re = fields.magnetic[offset] ?? 0;
          const im = fields.magnetic[offset + 1] ?? 0;
          bRe += re * current.re - im * current.im;
          bIm += re * current.im + im * current.re;
        });
        electricSquared += eRe * eRe + eIm * eIm;
        magneticSquared += bRe * bRe + bIm * bIm;
      }
      expect(Math.sqrt(electricSquared)).toBeCloseTo(resultantRms(expected.electric), 6);
      expect(Math.sqrt(magneticSquared)).toBeCloseTo(resultantRms(expected.magnetic), 12);
    });
  });
});
