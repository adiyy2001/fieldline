import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeCharts } from '../scripts/plots/write-charts';
import { buildConvergenceReport } from '../src/core/validation/convergence';
import { convergenceCharts } from '../src/core/validation/convergence-plots';
import { describeEnvironment } from './environment';

const resultsDirectory = join(import.meta.dirname, 'results');
const imageDirectory = join(import.meta.dirname, '..', 'docs', 'img');

function ratio(value: number): string {
  return value.toFixed(6).padStart(9);
}

const environment = describeEnvironment();
console.log(`fieldline 3D to 2D convergence, ${environment.date}`);
console.log(
  `node ${environment.node}, ${environment.os}, ${environment.cpu}, commit ${environment.commit}`,
);

const report = buildConvergenceReport();

function printCurve(title: string, unit: string, samples: typeof report.sag): void {
  console.log(`\n${title}`);
  console.log(`${unit.padEnd(10)}   E ratio   B ratio  unknowns`);
  for (const sample of samples) {
    console.log(
      `${String(sample.value).padEnd(10)}${ratio(sample.electricRatio)}${ratio(sample.magneticRatio)}  ${sample.segmentCount}`,
    );
  }
}

printCurve('Segments per span, sag 10 m', 'segments', report.segments.catenary);
printCurve('Segments per span, no sag', 'segments', report.segments.straight);
printCurve('Span length, sag 10 m', 'span (m)', report.spanLength.catenary);
printCurve('Span length, no sag', 'span (m)', report.spanLength.straight);
printCurve('Sag, spans of 300 m', 'sag (m)', report.sag);

console.log(
  `\nRun-outs removed: peak E changes by ${report.runOuts.electricChange.toExponential(2)}, peak B by ${report.runOuts.magneticChange.toExponential(2)} (relative)`,
);
console.log(
  `Discretization: ${report.discretization.segmentsPerSpan} against ${report.discretization.referenceSegments} segments per span differ by ${report.discretization.electric.toExponential(2)} (E) and ${report.discretization.magnetic.toExponential(2)} (B)`,
);
for (const tower of report.towers) {
  console.log(
    `${tower.tower.padEnd(30)} 3D over 2D at the default geometry: E ${ratio(tower.electricRatio)}, B ${ratio(tower.magneticRatio)}`,
  );
}

mkdirSync(resultsDirectory, { recursive: true });
writeFileSync(
  join(resultsDirectory, 'convergence.json'),
  `${JSON.stringify({ environment, report }, null, 2)}\n`,
);
const written = writeCharts(convergenceCharts(report), imageDirectory);
console.log(`\nWrote bench/results/convergence.json and ${written.length} plots in docs/img`);
