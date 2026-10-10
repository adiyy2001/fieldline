import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assemblePotentialMatrix } from '../src/core/field3d/assembly';
import { solveBasisCharges } from '../src/core/field3d/charge-system';
import { potentialResidual } from '../src/core/field3d/residual';
import { packSegments } from '../src/core/field3d/segment-set';
import { solveLine } from '../src/core/field3d/solve-line';
import {
  defaultDiscretization,
  discretizeLine,
  referenceSpan,
} from '../src/core/geometry/discretize';
import { factorLu, solveLu } from '../src/core/linear/lu';
import { defaultParameters, lineGeometryFromParameters } from '../src/core/model/parameters';
import { describeEnvironment } from './environment';

const resultsDirectory = join(import.meta.dirname, 'results');
const REPEATS = 7;

interface TimingRow {
  readonly tower: string;
  readonly segmentsPerSpan: number;
  readonly unknowns: number;
  readonly assemblyMilliseconds: number;
  readonly factorizationMilliseconds: number;
  readonly solveMilliseconds: number;
  readonly totalMilliseconds: number;
  readonly interiorResidual: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function timed<T>(action: () => T): { value: T; milliseconds: number } {
  const started = performance.now();
  const value = action();
  return { value, milliseconds: performance.now() - started };
}

function measure(tower: 'horizontal' | 'double-circuit', segmentsPerSpan: number): TimingRow {
  const parameters = { ...defaultParameters(tower), segmentsPerSpan };
  const geometry = lineGeometryFromParameters(parameters);
  const set = packSegments(discretizeLine(geometry, defaultDiscretization(segmentsPerSpan)));
  const groupCount = tower === 'double-circuit' ? 6 : 3;
  const assembly: number[] = [];
  const factorization: number[] = [];
  const substitution: number[] = [];
  const total: number[] = [];
  for (let repeat = 0; repeat < REPEATS + 1; repeat += 1) {
    const matrix = timed(() => assemblePotentialMatrix(set));
    const factors = timed(() => factorLu(matrix.value, set.count));
    const rhs = new Float64Array(set.count * groupCount);
    for (let row = 0; row < set.count; row += 1) {
      const group = set.groups[row] ?? -1;
      if (group >= 0) {
        rhs[row * groupCount + group] = 1;
      }
    }
    const solved = timed(() => solveLu(factors.value, rhs, groupCount));
    const whole = timed(() => solveBasisCharges(set, groupCount));
    if (repeat > 0) {
      assembly.push(matrix.milliseconds);
      factorization.push(factors.milliseconds);
      substitution.push(solved.milliseconds);
      total.push(whole.milliseconds);
    }
  }
  const { system } = solveLine(parameters);
  return {
    tower,
    segmentsPerSpan,
    unknowns: set.count,
    assemblyMilliseconds: median(assembly),
    factorizationMilliseconds: median(factorization),
    solveMilliseconds: median(substitution),
    totalMilliseconds: median(total),
    interiorResidual: potentialResidual(system).interiorMaximum,
  };
}

const environment = describeEnvironment();
console.log(`fieldline charge solve timing, ${environment.date}`);
console.log(
  `node ${environment.node}, ${environment.os}, ${environment.cpu}, ${environment.logicalCpus} logical CPUs, commit ${environment.commit}`,
);
console.log(`Median of ${REPEATS} runs after one warm-up run, float64, dense real LU`);
console.log(
  'tower            seg/span unknowns  assembly  factor  solve   total  interior residual',
);

const rows: TimingRow[] = [];
for (const [tower, counts] of [
  ['horizontal', [4, 6, 8, 12, 16, 24]],
  ['double-circuit', [4, 6, 8, 12, 16, 24]],
] as const) {
  for (const count of counts) {
    const row = measure(tower, count);
    rows.push(row);
    console.log(
      `${row.tower.padEnd(16)} ${String(row.segmentsPerSpan).padStart(8)} ${String(row.unknowns).padStart(8)} ${row.assemblyMilliseconds.toFixed(1).padStart(8)} ${row.factorizationMilliseconds.toFixed(1).padStart(7)} ${row.solveMilliseconds.toFixed(1).padStart(6)} ${row.totalMilliseconds.toFixed(1).padStart(7)}   ${row.interiorResidual.toExponential(2)}`,
    );
  }
}

const reference = referenceSpan(lineGeometryFromParameters(defaultParameters()));
mkdirSync(resultsDirectory, { recursive: true });
writeFileSync(
  join(resultsDirectory, 'solve-timing.json'),
  `${JSON.stringify({ environment, repeats: REPEATS, referenceSpan: reference, rows }, null, 2)}\n`,
);
console.log('\nWrote bench/results/solve-timing.json');
