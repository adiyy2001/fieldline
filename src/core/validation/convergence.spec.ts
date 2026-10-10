import { defaultParameters } from '../model/parameters';
import { buildChart } from '../plot/chart-model';
import { renderChartSvg } from '../plot/svg';
import {
  type ConvergenceGrid,
  buildConvergenceReport,
  compareAtMidSpan,
  ratioVersusSag,
  ratioVersusSegments,
  ratioVersusSpanLength,
} from './convergence';
import { convergenceCharts } from './convergence-plots';

const base = defaultParameters('horizontal');
const straight = { ...base, phaseSag: 0 };

function increasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > (values[index - 1] ?? 0));
}

describe('convergence of the 3D model to the 2D cross-section', () => {
  it('matches the 2D peak E within 2e-4 for a straight line with 100 m spans', () => {
    const comparison = compareAtMidSpan({ ...straight, spanLengths: [100, 100, 100] });
    expect(Math.abs(comparison.electricRatio - 1)).toBeLessThan(2e-4);
    expect(Math.abs(comparison.magneticRatio - 1)).toBeLessThan(3e-3);
  });

  it('matches the 2D peak E within 2e-5 and peak B within 5e-4 for a straight line with 300 m spans', () => {
    const comparison = compareAtMidSpan(straight);
    expect(Math.abs(comparison.electricRatio - 1)).toBeLessThan(2e-5);
    expect(Math.abs(comparison.magneticRatio - 1)).toBeLessThan(5e-4);
  });

  it('converges to 1 from below as the span grows, at fixed sag', () => {
    const spans = [100, 200, 300, 400, 600, 800];
    const withSag = ratioVersusSpanLength(base, spans);
    expect(increasing(withSag.map((sample) => sample.electricRatio))).toBe(true);
    expect(increasing(withSag.map((sample) => sample.magneticRatio))).toBe(true);
    expect(withSag.every((sample) => sample.electricRatio < 1)).toBe(true);
    const withoutSag = ratioVersusSpanLength(straight, spans);
    expect(increasing(withoutSag.map((sample) => sample.magneticRatio))).toBe(true);
    expect(withoutSag.at(-1)?.magneticRatio).toBeGreaterThan(0.9999);
  });

  it('converges to 1 from below as the sag goes to zero', () => {
    const samples = ratioVersusSag(base, [20, 10, 5, 2, 0]);
    expect(increasing(samples.map((sample) => sample.electricRatio))).toBe(true);
    expect(increasing(samples.map((sample) => sample.magneticRatio))).toBe(true);
    expect(samples[0]?.electricRatio).toBeLessThan(0.99);
    expect(Math.abs((samples.at(-1)?.electricRatio ?? 0) - 1)).toBeLessThan(2e-5);
  });

  it('approaches its limit from below as the segments get shorter', () => {
    const samples = ratioVersusSegments(base, [4, 6, 8, 12, 16, 24]);
    expect(increasing(samples.map((sample) => sample.electricRatio))).toBe(true);
    expect(increasing(samples.map((sample) => sample.magneticRatio))).toBe(true);
    const finest = samples.at(-1);
    const twelve = samples[3];
    expect(Math.abs((finest?.electricRatio ?? 0) - (twelve?.electricRatio ?? 0))).toBeLessThan(
      4e-3,
    );
  });

  it('does not depend on the segment count when the line is straight', () => {
    const samples = ratioVersusSegments(straight, [4, 12, 24]);
    const first = samples[0]?.electricRatio ?? 0;
    samples.forEach((sample) => {
      expect(sample.electricRatio).toBeCloseTo(first, 7);
    });
  });

  it('changes the mid-span value by less than 1e-4 for E and 2e-3 for B when the run-outs go', () => {
    const withRunOuts = compareAtMidSpan(base);
    const without = compareAtMidSpan(base, { runOuts: false });
    expect(Math.abs(without.electricRatio / withRunOuts.electricRatio - 1)).toBeLessThan(1e-4);
    expect(Math.abs(without.magneticRatio / withRunOuts.magneticRatio - 1)).toBeLessThan(2e-3);
  });

  it('reports the number of unknowns and both peaks of each model', () => {
    const comparison = compareAtMidSpan(base);
    expect(comparison.segmentCount).toBe(210);
    expect(comparison.threeDimensional.electric).toBeCloseTo(
      comparison.electricRatio * comparison.twoDimensional.electric,
      9,
    );
    expect(comparison.twoDimensional.magnetic).toBeGreaterThan(0);
  });
});

describe('the convergence report', () => {
  const grid: ConvergenceGrid = {
    segmentCounts: [6, 12],
    spanLengths: [100, 300],
    sags: [0, 10],
    referenceSegments: 24,
  };
  const report = buildConvergenceReport(grid);

  it('holds a curve for every sweep and the single numbers', () => {
    expect(report.segments.catenary).toHaveLength(2);
    expect(report.spanLength.straight).toHaveLength(2);
    expect(report.sag).toHaveLength(2);
    expect(report.towers).toHaveLength(3);
    expect(report.discretization.electric).toBeLessThan(6e-3);
    expect(report.discretization.magnetic).toBeLessThan(1.2e-2);
    expect(report.runOuts.electricChange).toBeLessThan(1e-4);
  });

  it('draws three charts that render to SVG', () => {
    const charts = convergenceCharts(report);
    expect(charts.map((chart) => chart.fileName)).toEqual([
      'convergence-segments.svg',
      'convergence-span-length.svg',
      'convergence-sag.svg',
    ]);
    charts.forEach((chart) => {
      const svg = renderChartSvg(buildChart(chart.spec));
      expect(svg).toContain('<svg');
      expect(svg).toContain('Peak 3D over peak 2D');
    });
  });
});
