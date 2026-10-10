import { buildChart } from '../plot/chart-model';
import { renderChartSvg } from '../plot/svg';
import { validationCharts } from './plots';
import { buildValidationReport } from './report';

describe('validation charts', () => {
  const charts = validationCharts(buildValidationReport());

  it('produces three named charts with distinct file names', () => {
    expect(charts.map((chart) => chart.fileName)).toEqual([
      'validation-single-conductor.svg',
      'validation-published-limit-heights.svg',
      'validation-bundle-equivalent.svg',
    ]);
  });

  it('keeps the model curve on the analytic markers', () => {
    const [single] = charts;
    const model = single?.spec.series[0]?.points ?? [];
    const analytic = single?.spec.series[1]?.points ?? [];
    expect(analytic.length).toBeGreaterThan(10);
    analytic.forEach((marker) => {
      const match = model.find((point) => point.x === marker.x);
      expect(match?.y).toBeCloseTo(marker.y, 9);
    });
  });

  it('excludes the fitted Portal tower from the agreement chart', () => {
    const published = charts[1]?.spec.series.find((entry) => entry.id === 'electric');
    expect(published?.points).toHaveLength(13);
  });

  it('renders every chart to SVG without dashes', () => {
    charts.forEach((chart) => {
      const svg = renderChartSvg(buildChart(chart.spec));
      expect(svg.length).toBeGreaterThan(1000);
      expect(new RegExp(String.fromCharCode(91, 0x2013, 0x2014, 93)).test(svg)).toBe(false);
    });
  });
});
