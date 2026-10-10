import { complex } from '../complex';
import { createCrossSectionSolver } from '../field2d/solver';
import { type TowerKind } from '../geometry/tower';
import { defaultParameters } from '../model/parameters';
import { lineCharge } from '../validation/analytic';
import { longHorizontalConductor } from '../testing/segments';
import { collocationResidual, checkPoints, potentialResidual } from './residual';
import { solveLine } from './solve-line';

const solutions = {
  horizontal: solveLine(defaultParameters('horizontal')),
  delta: solveLine(defaultParameters('delta')),
  'double-circuit': solveLine(defaultParameters('double-circuit')),
} satisfies Record<TowerKind, ReturnType<typeof solveLine>>;

const kinds = Object.keys(solutions) as TowerKind[];

describe('the charge system', () => {
  it.each(kinds)('has 210, 210 and 336 unknowns at the default size: %s', (kind) => {
    const expected = { horizontal: 210, delta: 210, 'double-circuit': 336 }[kind];
    expect(solutions[kind].system.set.count).toBe(expected);
    expect(solutions[kind].system.basisCharges).toHaveLength(kind === 'double-circuit' ? 6 : 3);
  });

  it.each(kinds)('reproduces the conductor voltages at the collocation points: %s', (kind) => {
    expect(collocationResidual(solutions[kind].system)).toBeLessThan(1e-9);
  });

  it('holds the shield wires at 0 V while they carry induced charge', () => {
    const { system } = solutions.horizontal;
    const { set, basisCharges } = system;
    const shieldIndices = Array.from({ length: set.count }, (_, index) => index).filter(
      (index) => set.groups[index] === -1,
    );
    expect(shieldIndices).toHaveLength(84);
    const induced = shieldIndices.map((index) => basisCharges[1]?.[index] ?? 0);
    expect(Math.max(...induced.map(Math.abs))).toBeGreaterThan(0);
    expect(induced.every((value) => value < 0)).toBe(true);
    expect(collocationResidual(system)).toBeLessThan(1e-9);
  });

  it('puts positive charge on the conductor at 1 V, more at mid-span than at the tower', () => {
    const { system } = solutions.horizontal;
    const { set } = system;
    const charges = system.basisCharges[1] ?? new Float64Array();
    const own = Array.from({ length: set.count }, (_, index) => index).filter(
      (index) => set.groups[index] === 1,
    );
    expect(own.every((index) => (charges[index] ?? 0) > 0)).toBe(true);
    const inMiddleSpan = own.filter((index) => set.spans[index] === 1);
    expect(charges[inMiddleSpan[6] ?? 0]).toBeGreaterThan(charges[inMiddleSpan[0] ?? 0] ?? 0);
  });

  it('mirrors the basis charges of the outer phases of a symmetric tower', () => {
    const { system } = solutions.horizontal;
    const { set } = system;
    const left = system.basisCharges[0] ?? new Float64Array();
    const right = system.basisCharges[2] ?? new Float64Array();
    const perConductor = set.count / 5;
    for (let offset = 0; offset < perConductor; offset += 1) {
      const leftOwn = left[offset] ?? 0;
      const rightOwn = right[2 * perConductor + offset] ?? 0;
      expect(rightOwn).toBeCloseTo(leftOwn, 12);
      const leftShield = left[3 * perConductor + offset] ?? 0;
      const rightShield = right[4 * perConductor + offset] ?? 0;
      expect(rightShield).toBeCloseTo(leftShield, 12);
    }
  });

  it('combines the basis linearly for complex voltage phasors', () => {
    const { system } = solutions.horizontal;
    const both = system.chargesFor([complex(2, 0), complex(0, 3), complex(-1, 0)]);
    const [first, second, third] = system.basisCharges;
    for (let index = 0; index < system.set.count; index += 1) {
      expect(both.re[index]).toBeCloseTo(2 * (first?.[index] ?? 0) - (third?.[index] ?? 0), 15);
      expect(both.im[index]).toBeCloseTo(3 * (second?.[index] ?? 0), 15);
    }
  });

  it('gives the full phase current to every segment of a phase conductor and none to shield wires', () => {
    const { system } = solutions.horizontal;
    const currents = system.currentsFor([
      complex(1000, 0),
      complex(-500, 866),
      complex(-500, -866),
    ]);
    system.set.groups.forEach((group, index) => {
      const expected = group === 0 ? 1000 : group === 1 ? -500 : group === 2 ? -500 : 0;
      expect(currents.re[index]).toBe(expected);
    });
    expect(currents.im[0]).toBe(0);
  });

  it('agrees with the line charge of a very long single conductor', () => {
    const voltage = 230940;
    const system = longHorizontalConductor(12, 0.015, 40000, 40);
    const charge = (system.basisCharges[0]?.[20] ?? 0) * voltage;
    const reference = lineCharge({ voltage, height: 12, radius: 0.015 });
    expect(Math.abs(charge - reference)).toBeLessThan(2e-3 * reference);
  });

  it('keeps the charge of a long conductor close to the 2D solution as pieces get shorter', () => {
    const wire = { x: 0, y: 12, radius: 0.015, group: 0 };
    const analytic =
      createCrossSectionSolver({ wires: [wire], groupCount: 1 }).basisCharges[0]?.[0] ?? 0;
    const coarse = longHorizontalConductor(12, 0.015, 400, 4).basisCharges[0]?.[2] ?? 0;
    const fine = longHorizontalConductor(12, 0.015, 400, 32).basisCharges[0]?.[16] ?? 0;
    expect(Math.abs(fine - analytic)).toBeLessThan(Math.abs(coarse - analytic));
  });
});

describe('the potential residual at check points on the conductor surface', () => {
  it.each(kinds)('stays below 0.6 percent inside the spans at the default size: %s', (kind) => {
    const residual = potentialResidual(solutions[kind].system);
    expect(residual.interiorMaximum).toBeLessThan(6e-3);
  });

  it.each(kinds)('stays below 2.5 percent at the towers and the run-outs: %s', (kind) => {
    const residual = potentialResidual(solutions[kind].system);
    expect(residual.towerMaximum).toBeLessThan(2.5e-2);
    expect(residual.runOutMaximum).toBeLessThan(2.5e-2);
    expect(residual.maximum).toBe(
      Math.max(residual.interiorMaximum, residual.towerMaximum, residual.runOutMaximum),
    );
    expect(residual.mean).toBeLessThan(residual.maximum);
  });

  it('places one check point at every joint of a conductor, on its surface', () => {
    const { system } = solutions.horizontal;
    const points = checkPoints(system);
    expect(points).toHaveLength(5 * 41);
    expect(points.filter((point) => point.kind === 'tower')).toHaveLength(5 * 4);
    expect(points.filter((point) => point.kind === 'run-out')).toHaveLength(5 * 4);
    expect(points.filter((point) => point.kind === 'interior')).toHaveLength(5 * 3 * 11);
    const first = points[0];
    expect(Math.abs((first?.x ?? 0) - -10)).toBeCloseTo(0.1342, 3);
  });

  it('does not worsen when segments are refined inside the spans', () => {
    const coarse = potentialResidual(solveLine(defaultParameters(), { segmentsPerSpan: 6 }).system);
    const fine = potentialResidual(solveLine(defaultParameters(), { segmentsPerSpan: 24 }).system);
    expect(fine.interiorMaximum).toBeLessThan(coarse.interiorMaximum);
  });
});

describe('the cost of a solve', () => {
  it('assembles and factors the default system in under 300 ms even on a loaded machine', () => {
    const parameters = defaultParameters('horizontal');
    solveLine(parameters);
    const times = Array.from({ length: 5 }, () => {
      const started = performance.now();
      solveLine(parameters);
      return performance.now() - started;
    });
    expect(Math.min(...times)).toBeLessThan(300);
  });
});
