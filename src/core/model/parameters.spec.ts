import { TOWER_KINDS } from '../geometry/tower';
import { phaseConductors } from '../geometry/line-geometry';
import {
  bundleFromParameters,
  defaultParameters,
  defaultPhasing,
  lineGeometryFromParameters,
  validateParameters,
} from './parameters';

describe('line parameters', () => {
  it('has valid defaults for every tower kind', () => {
    for (const kind of TOWER_KINDS) {
      expect(validateParameters(defaultParameters(kind))).toEqual([]);
    }
  });

  it('follows the agreed defaults', () => {
    const parameters = defaultParameters();
    expect(parameters.lineToLineKilovolts).toBe(400);
    expect(parameters.currentAmperes).toBe(1000);
    expect(parameters.spanLengths).toEqual([300, 300, 300]);
    expect(parameters.phaseSag).toBe(10);
    expect(parameters.bundleCount).toBe(3);
    expect(parameters.bundleSpacingMetres).toBe(0.4);
    expect(parameters.subconductorDiameterMillimetres).toBe(30);
    expect(parameters.shieldDiameterMillimetres).toBe(19);
    expect(defaultPhasing('double-circuit')).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('builds the bundle in metres and the geometry from the parameters', () => {
    const parameters = defaultParameters();
    expect(bundleFromParameters(parameters)).toEqual({
      count: 3,
      spacing: 0.4,
      subconductorDiameter: 0.03,
    });
    expect(phaseConductors(lineGeometryFromParameters(parameters))).toHaveLength(3);
  });

  it('reports values outside their range with the field name', () => {
    const issues = validateParameters({ ...defaultParameters(), lineToLineKilovolts: 5 });
    expect(issues.map((issue) => issue.field)).toContain('lineToLineKilovolts');
    expect(issues[0]?.message).toContain('Line voltage');
  });

  it('reports a tower dimension outside its range', () => {
    const base = defaultParameters();
    const issues = validateParameters({
      ...base,
      tower: {
        kind: 'horizontal',
        phaseHeight: 3,
        phaseSpacing: 10,
        shieldRise: 7,
        shieldHalfSpacing: 5,
      },
    });
    expect(issues.map((issue) => issue.field)).toContain('tower.phaseHeight');
  });

  it('rejects a phasing that repeats a phase within a circuit', () => {
    const issues = validateParameters({ ...defaultParameters(), phasing: [0, 0, 2] });
    expect(issues.map((issue) => issue.field)).toContain('phasing');
    const double = validateParameters({
      ...defaultParameters('double-circuit'),
      phasing: [0, 1, 2, 1, 1, 2],
    });
    expect(double.map((issue) => issue.field)).toContain('phasing');
  });

  it('accepts only two or three spans of allowed length', () => {
    const one = validateParameters({ ...defaultParameters(), spanLengths: [300] });
    expect(one.map((issue) => issue.field)).toContain('spanLengths');
    const short = validateParameters({ ...defaultParameters(), spanLengths: [300, 20, 300] });
    expect(short.map((issue) => issue.field)).toContain('spanLengths.1');
  });

  it('rejects a sag above a quarter of the shortest span', () => {
    const issues = validateParameters({
      ...defaultParameters(),
      spanLengths: [100, 100],
      phaseSag: 30,
    });
    expect(issues.map((issue) => issue.field)).toContain('phaseSag');
  });

  it('rejects a frequency other than 50 or 60 Hz', () => {
    const issues = validateParameters({ ...defaultParameters(), frequencyHz: 55 });
    expect(issues.some((issue) => issue.field === 'frequencyHz')).toBe(true);
    expect(validateParameters({ ...defaultParameters(), frequencyHz: 60 })).toEqual([]);
  });

  it('rejects a line that hangs too close to the ground at mid-span', () => {
    const base = defaultParameters();
    const issues = validateParameters({
      ...base,
      tower: {
        kind: 'horizontal',
        phaseHeight: 11,
        phaseSpacing: 10,
        shieldRise: 7,
        shieldHalfSpacing: 5,
      },
      phaseSag: 10,
    });
    expect(issues.map((issue) => issue.message).join(' ')).toContain('above ground');
  });
});
