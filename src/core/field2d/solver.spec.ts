import { complex } from '../complex';
import { fixtureFor } from '../testing/fixtures';
import {
  createCrossSectionSolver,
  mutualPotentialCoefficient,
  potentialMatrix,
  selfPotentialCoefficient,
} from './solver';

describe('potential coefficients', () => {
  const wire = { x: 0, y: 12, radius: 0.015, group: 0 };
  const other = { x: 8, y: 14, radius: 0.02, group: 1 };

  it('uses ln(2h/r) for the self term', () => {
    expect(selfPotentialCoefficient(wire)).toBeCloseTo(
      Math.log(24 / 0.015) / (2 * Math.PI * 8.8541878188e-12),
      -2,
    );
  });

  it('uses ln(D prime over D) for the mutual term and is symmetric', () => {
    const expected =
      Math.log(Math.hypot(8, 26) / Math.hypot(8, 2)) / (2 * Math.PI * 8.8541878188e-12);
    expect(mutualPotentialCoefficient(wire, other)).toBeCloseTo(expected, -2);
    expect(mutualPotentialCoefficient(other, wire)).toBeCloseTo(
      mutualPotentialCoefficient(wire, other),
      6,
    );
  });

  it('clamps the distance of overlapping wires to the larger radius', () => {
    const overlapping = { x: 0.001, y: 12, radius: 0.015, group: 1 };
    const value = mutualPotentialCoefficient(wire, overlapping);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeCloseTo(selfPotentialCoefficient(wire), -3);
  });

  it('assembles a symmetric matrix with positive entries', () => {
    const { section } = fixtureFor('double-circuit');
    const count = section.wires.length;
    const matrix = potentialMatrix(section);
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        expect(matrix[row * count + column]).toBeCloseTo(matrix[column * count + row] ?? 0, 3);
        expect(matrix[row * count + column] ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

describe('cross section solver', () => {
  const fixture = fixtureFor('horizontal', {}, 'explicit');
  const { solver, section } = fixture;

  it('stores one basis charge vector per phase group', () => {
    expect(solver.basisCharges).toHaveLength(3);
    expect(solver.basisCharges[0]).toHaveLength(section.wires.length);
  });

  it('gives all subconductors of a bundle the same charge by symmetry of the voltage', () => {
    const charges = solver.chargesFor([complex(1, 0), complex(0, 0), complex(0, 0)]);
    const first = section.wires.findIndex((wire) => wire.group === 0);
    const total = [0, 1, 2].reduce((sum, offset) => sum + (charges.re[first + offset] ?? 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(charges.re[first]).toBeGreaterThan(0);
  });

  it('combines basis charges linearly into complex charges', () => {
    const a = solver.chargesFor([complex(1, 0), complex(0, 0), complex(0, 0)]);
    const b = solver.chargesFor([complex(0, 0), complex(0, 1), complex(0, 0)]);
    const both = solver.chargesFor([complex(1, 0), complex(0, 1), complex(0, 0)]);
    for (let index = 0; index < section.wires.length; index += 1) {
      expect(both.re[index]).toBeCloseTo(a.re[index] ?? 0, 18);
      expect(both.im[index]).toBeCloseTo(b.im[index] ?? 0, 18);
    }
  });

  it('splits the phase current equally between the subconductors and gives shields none', () => {
    const currents = solver.currentsFor([complex(300, 0), complex(0, 600), complex(0, 0)]);
    section.wires.forEach((wire, index) => {
      if (wire.group === 0) {
        expect(currents.re[index]).toBeCloseTo(100, 12);
      } else if (wire.group === 1) {
        expect(currents.im[index]).toBeCloseTo(200, 12);
      } else if (wire.group < 0) {
        expect(currents.re[index]).toBe(0);
        expect(currents.im[index]).toBe(0);
      }
    });
  });

  it('ignores missing group weights', () => {
    const charges = solver.chargesFor([complex(1, 0)]);
    expect(charges.re.every(Number.isFinite)).toBe(true);
  });

  it('keeps the total charge of a group consistent with the single conductor limit', () => {
    const single = createCrossSectionSolver({
      wires: [{ x: 0, y: 12, radius: 0.015, group: 0 }],
      groupCount: 1,
    });
    expect(single.basisCharges[0]?.[0]).toBeCloseTo(1.7414e-6 / 230940, 14);
  });
});
