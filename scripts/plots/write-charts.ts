import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildChart } from '../../src/core/plot/chart-model';
import { renderChartSvg } from '../../src/core/plot/svg';
import type { NamedChart } from '../../src/core/validation/plots';

export function writeCharts(charts: readonly NamedChart[], directory: string): readonly string[] {
  mkdirSync(directory, { recursive: true });
  return charts.map((chart) => {
    const path = join(directory, chart.fileName);
    writeFileSync(path, `${renderChartSvg(buildChart(chart.spec))}\n`);
    return path;
  });
}
