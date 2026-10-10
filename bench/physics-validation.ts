import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildValidationReport } from '../src/core/validation/report';
import { validationCharts } from '../src/core/validation/plots';
import { writeCharts } from '../scripts/plots/write-charts';
import { describeEnvironment } from './environment';

const resultsDirectory = join(import.meta.dirname, 'results');
const imageDirectory = join(import.meta.dirname, '..', 'docs', 'img');

function formatMetres(value: number): string {
  return value.toFixed(3).padStart(7);
}

const environment = describeEnvironment();
console.log(`fieldline physics validation, ${environment.date}`);
console.log(
  `node ${environment.node}, ${environment.os}, ${environment.cpu}, commit ${environment.commit}`,
);

const report = buildValidationReport();

console.log('\nAnalytic checks');
for (const entry of report.analytic) {
  const status = entry.passed ? 'pass' : 'FAIL';
  console.log(
    `${status}  ${entry.id.padEnd(20)} relative error ${entry.relativeError.toExponential(2)} (limit ${entry.tolerance.toExponential(0)})  ${entry.description}`,
  );
}

console.log(`\nPublished limit heights, ${report.citation}`);
console.log('case     E pub    E model   dE      B pub    B model   dB     bundle shift E, B');
for (const row of report.published) {
  const fitted = row.fitted ? '  fitted' : '';
  console.log(
    `${row.id.padEnd(8)} ${formatMetres(row.electric.published)} ${formatMetres(row.electric.reproduced)} ${formatMetres(row.electric.deviation)}  ${formatMetres(row.magnetic.published)} ${formatMetres(row.magnetic.reproduced)} ${formatMetres(row.magnetic.deviation)}  ${formatMetres(row.electric.equivalentShift)} ${formatMetres(row.magnetic.equivalentShift)}${fitted}`,
  );
}
console.log(
  `\n${report.summary.publishedCases - report.summary.fittedCases} cases without the fitted Portal tower: maximum deviation ${report.summary.maximumDeviation.toFixed(3)} m, mean ${report.summary.meanDeviation.toFixed(3)} m, tolerance ${report.tolerance} m`,
);
console.log(
  `Largest shift from equivalent conductors: ${report.summary.maximumEquivalentShift.toFixed(3)} m`,
);
for (const entry of report.ranking) {
  console.log(
    `Ranking by peak E at ${entry.clearance} m, ${entry.tower}: ${entry.pairsChecked} pairs checked, ${entry.violations} violations`,
  );
}

console.log('\nExposure presets');
for (const preset of report.exposure) {
  console.log(
    `${preset.id.padEnd(20)} E ${preset.electricKilovoltsPerMetre} kV/m, B ${preset.magneticMicrotesla.toFixed(1)} uT  (${preset.source})`,
  );
}

mkdirSync(resultsDirectory, { recursive: true });
writeFileSync(
  join(resultsDirectory, 'physics-validation.json'),
  `${JSON.stringify({ environment, report }, null, 2)}\n`,
);
const written = writeCharts(validationCharts(report), imageDirectory);
console.log(
  `\nWrote bench/results/physics-validation.json and ${written.length} plots in docs/img`,
);

const ok =
  report.summary.analyticPassed &&
  report.summary.allWithinTolerance &&
  report.summary.rankingViolations === 0;
if (!ok) {
  console.error('Validation failed');
  process.exitCode = 1;
}
