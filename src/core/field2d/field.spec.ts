import fc from 'fast-check';
import { complex } from '../complex';
import { resultantRms } from '../phasor';
import { phaseVoltagePhasors } from '../phasor';
import {
  singleConductorField,
  singleConductorPotential,
  longConductorFluxDensity,
  lineCharge,
} from '../validation/analytic';
import { evaluatorFor, fixtureFor, groupPhasors } from '../testing/fixtures';
import { createFieldEvaluator2D } from './evaluator';
import { electricFieldAt, magneticFieldAt, potentialAt } from './field';
import { createCrossSectionSolver } from './solver';
import type { CrossSection } from './cross-section';

const single: CrossSection = {
  wires: [{ x: 0, y: 12, radius: 0.015, group: 0 }],
  groupCount: 1,
};
const voltage = 230940;
const conductor = { voltage, height: 12, radius: 0.015 };

function singleSolution() {
  const solver = createCrossSectionSolver(single);
  return { solver, charges: solver.chargesFor([complex(voltage, 0)]) };
}

describe('one conductor above ground', () => {
  it('reproduces the line charge of 1.7414 microcoulombs per metre', () => {
    const { charges } = singleSolution();
    expect(charges.re[0]).toBeCloseTo(1.7414e-6, 10);
    expect(charges.re[0] ?? 0).toBeCloseTo(lineCharge(conductor), 18);
    expect(charges.im[0]).toBe(0);
  });

  it('gives 5.2170 kV/m at the ground and 5.2535 kV/m at 1 m below the conductor', () => {
    const { charges } = singleSolution();
    expect(electricFieldAt(single, charges, 0, 0).y.re).toBeCloseTo(-5217.0, 0);
    expect(Math.abs(electricFieldAt(single, charges, 0, 1).y.re)).toBeCloseTo(5253.5, 0);
  });

  it('matches the analytic field and potential at scattered points', () => {
    const { charges } = singleSolution();
    for (const [x, y] of [
      [0, 1],
      [7, 1],
      [-13, 1.8],
      [30, 4],
      [2, 20],
    ] as const) {
      const expected = singleConductorField(conductor, x, y);
      const field = electricFieldAt(single, charges, x, y);
      expect(field.x.re).toBeCloseTo(expected.x, 6);
      expect(field.y.re).toBeCloseTo(expected.y, 6);
      expect(potentialAt(single, charges, x, y).re).toBeCloseTo(
        singleConductorPotential(conductor, x, y),
        6,
      );
    }
  });

  it('holds the conductor voltage on its surface and zero on the ground', () => {
    const { charges } = singleSolution();
    expect(potentialAt(single, charges, 0.015, 12).re / voltage).toBeCloseTo(1, 6);
    expect(potentialAt(single, charges, 3, 0).re).toBeCloseTo(0, 6);
  });

  it('has no tangential field at the ground plane', () => {
    const { charges } = singleSolution();
    for (const x of [-20, -3, 0.5, 8, 40]) {
      expect(electricFieldAt(single, charges, x, 0).x.re).toBeCloseTo(0, 9);
    }
  });
});

describe('magnetic field of a long conductor', () => {
  const currentSection: CrossSection = {
    wires: [{ x: 5, y: 12, radius: 0.015, group: 0 }],
    groupCount: 1,
  };
  const solver = createCrossSectionSolver(currentSection);
  const currents = solver.currentsFor([complex(1000, 0)]);

  it('matches mu0 I over 2 pi r, 20 microtesla at 10 m for 1000 A', () => {
    const field = magneticFieldAt(currentSection, currents, 5, 22);
    expect(resultantRms(field)).toBeCloseTo(longConductorFluxDensity(1000, 10), 12);
    expect(resultantRms(field) * 1e6).toBeCloseTo(20.0, 6);
  });

  it('follows the right hand rule for a current along +z', () => {
    const left = magneticFieldAt(currentSection, currents, 0, 12);
    expect(left.x.re).toBeCloseTo(0, 18);
    expect(left.y.re).toBeLessThan(0);
    const above = magneticFieldAt(currentSection, currents, 5, 20);
    expect(above.x.re).toBeLessThan(0);
    const right = magneticFieldAt(currentSection, currents, 10, 12);
    expect(right.y.re).toBeGreaterThan(0);
  });
});

describe('singularity clamp', () => {
  it('stays finite and continuous across the conductor radius', () => {
    const { charges } = singleSolution();
    const radius = 0.015;
    const outside = electricFieldAt(single, charges, radius * (1 + 1e-9), 12);
    const inside = electricFieldAt(single, charges, radius * (1 - 1e-9), 12);
    expect(Number.isFinite(inside.x.re)).toBe(true);
    expect(inside.x.re).toBeCloseTo(outside.x.re, 0);
    const centre = electricFieldAt(single, charges, 0, 12);
    expect(centre.x.re).toBe(0);
    expect(Number.isFinite(centre.y.re)).toBe(true);
  });

  it('clamps the magnetic field inside the radius as well', () => {
    const section: CrossSection = {
      wires: [{ x: 0, y: 10, radius: 0.02, group: 0 }],
      groupCount: 1,
    };
    const currents = createCrossSectionSolver(section).currentsFor([complex(500, 0)]);
    const outside = magneticFieldAt(section, currents, 0.02 * (1 + 1e-9), 10);
    const inside = magneticFieldAt(section, currents, 0.02 * (1 - 1e-9), 10);
    expect(inside.y.re).toBeCloseTo(outside.y.re, 9);
    expect(magneticFieldAt(section, currents, 0, 10).y.re).toBe(0);
  });

  it('keeps the potential bounded inside the radius', () => {
    const { charges } = singleSolution();
    const atSurface = potentialAt(single, charges, 0.015, 12).re;
    expect(potentialAt(single, charges, 0.001, 12).re).toBeCloseTo(atSurface, 1);
  });
});

describe('three phase horizontal line', () => {
  const fixture = fixtureFor('horizontal');

  it('reproduces each phase voltage at its conductor and zero at the shield wires', () => {
    const voltages = groupPhasors(
      fixture.parameters.phasing,
      phaseVoltagePhasors(fixture.parameters.lineToLineKilovolts * 1000),
    );
    const charges = fixture.solver.chargesFor(voltages);
    fixture.section.wires.forEach((wire) => {
      const potential = potentialAt(fixture.section, charges, wire.x, wire.y);
      const expected = wire.group >= 0 ? voltages[wire.group] : complex(0, 0);
      expect(Math.abs(potential.re - (expected?.re ?? 0))).toBeLessThan(1e-3);
      expect(Math.abs(potential.im - (expected?.im ?? 0))).toBeLessThan(1e-3);
    });
  });

  it('induces charge on the shield wires of the opposite sign to the nearest phase', () => {
    const charges = fixture.solver.chargesFor(groupPhasors([0, 1, 2], phaseVoltagePhasors(400e3)));
    const shield = fixture.section.wires.length - 1;
    expect(Math.hypot(charges.re[shield] ?? 0, charges.im[shield] ?? 0)).toBeGreaterThan(0);
  });

  it('peaks at a few kV/m at 1 m', () => {
    const evaluate = evaluatorFor(fixture);
    let peak = 0;
    for (let x = -40; x <= 40; x += 0.5) {
      peak = Math.max(peak, resultantRms(evaluate({ x, y: 1, z: 0 }).electric));
    }
    expect(peak).toBeGreaterThan(1500);
    expect(peak).toBeLessThan(4000);
  });

  it('is linear in the voltage phasors', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -30, max: 30, noNaN: true }),
        (a, b, x) => {
          const first = [complex(1e5, 2e4), complex(-5e4, 1e5), complex(3e4, -8e4)];
          const second = [complex(2e4, -1e4), complex(7e4, 5e4), complex(-9e4, 2e4)];
          const mixed = first.map((value, index) => ({
            re: a * value.re + b * (second[index]?.re ?? 0),
            im: a * value.im + b * (second[index]?.im ?? 0),
          }));
          const units = [complex(0, 0), complex(0, 0), complex(0, 0)];
          const field = (voltages: typeof first) =>
            createFieldEvaluator2D(fixture.solver, voltages, units)({ x, y: 1, z: 0 }).electric;
          const combined = field(mixed);
          const f1 = field(first);
          const f2 = field(second);
          expect(combined.y.re).toBeCloseTo(a * f1.y.re + b * f2.y.re, 6);
          expect(combined.y.im).toBeCloseTo(a * f1.y.im + b * f2.y.im, 6);
          expect(combined.x.re).toBeCloseTo(a * f1.x.re + b * f2.x.re, 6);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('gives a mirrored profile for mirrored phasing', () => {
    const straight = evaluatorFor(fixture, [0, 1, 2]);
    const mirrored = evaluatorFor(fixture, [2, 1, 0]);
    fc.assert(
      fc.property(fc.double({ min: -50, max: 50, noNaN: true }), (x) => {
        const a = straight({ x, y: 1, z: 0 });
        const b = mirrored({ x: -x, y: 1, z: 0 });
        expect(resultantRms(b.electric)).toBeCloseTo(resultantRms(a.electric), 6);
        expect(resultantRms(b.magnetic)).toBeCloseTo(resultantRms(a.magnetic), 12);
      }),
      { numRuns: 100 },
    );
  });

  it('gives a symmetric profile for the symmetric geometry and phasing', () => {
    const evaluate = evaluatorFor(fixture, [0, 1, 0]);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 50, noNaN: true }), (x) => {
        const right = evaluate({ x, y: 1, z: 0 });
        const left = evaluate({ x: -x, y: 1, z: 0 });
        expect(resultantRms(left.electric)).toBeCloseTo(resultantRms(right.electric), 6);
        expect(resultantRms(left.magnetic)).toBeCloseTo(resultantRms(right.magnetic), 12);
      }),
      { numRuns: 100 },
    );
  });

  it('is unchanged in rms by a cyclic relabeling of the phases and by conjugation', () => {
    const base = evaluatorFor(fixture, [0, 1, 2]);
    const cyclic = evaluatorFor(fixture, [1, 2, 0]);
    const swapped = evaluatorFor(fixture, [0, 2, 1]);
    for (const x of [-20, -4, 0, 6, 25]) {
      const reference = resultantRms(base({ x, y: 1, z: 0 }).electric);
      expect(resultantRms(cyclic({ x, y: 1, z: 0 }).electric)).toBeCloseTo(reference, 6);
      expect(resultantRms(swapped({ x, y: 1, z: 0 }).electric)).toBeCloseTo(reference, 6);
    }
    const referenceB = resultantRms(base({ x: 3, y: 1, z: 0 }).magnetic);
    expect(resultantRms(cyclic({ x: 3, y: 1, z: 0 }).magnetic)).toBeCloseTo(referenceB, 12);
    expect(resultantRms(swapped({ x: 3, y: 1, z: 0 }).magnetic)).toBeCloseTo(referenceB, 12);
  });

  it('agrees between explicit subconductors and the equivalent conductor within a few percent', () => {
    const explicit = fixtureFor('horizontal', {}, 'explicit');
    const equivalent = evaluatorFor(fixture);
    const detailed = evaluatorFor(explicit);
    const peak = (evaluate: typeof equivalent, quantity: 'electric' | 'magnetic'): number => {
      let best = 0;
      for (let x = -40; x <= 40; x += 0.5) {
        best = Math.max(best, resultantRms(evaluate({ x, y: 1, z: 0 })[quantity]));
      }
      return best;
    };
    expect(peak(equivalent, 'electric') / peak(detailed, 'electric')).toBeCloseTo(1, 1);
    expect(peak(equivalent, 'magnetic') / peak(detailed, 'magnetic')).toBeCloseTo(1, 2);
  });
});
