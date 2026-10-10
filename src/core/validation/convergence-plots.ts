import type { ChartSeries, ChartSpec } from '../plot/chart-model';
import type { ConvergenceCurves, ConvergenceReport, ConvergenceSample } from './convergence';
import type { NamedChart } from './plots';

const ELECTRIC_COLOR = 1;
const MAGNETIC_COLOR = 2;

function series(
  id: string,
  label: string,
  samples: readonly ConvergenceSample[],
  pick: (sample: ConvergenceSample) => number,
  options: Pick<ChartSeries, 'colorIndex' | 'dash' | 'marker'>,
): ChartSeries {
  return {
    id,
    label,
    points: samples.map((sample) => ({ x: sample.value, y: pick(sample) })),
    ...options,
  };
}

function pairedSeries(curves: ConvergenceCurves): readonly ChartSeries[] {
  return [
    series('electric-catenary', 'E, sag 10 m', curves.catenary, (s) => s.electricRatio, {
      colorIndex: ELECTRIC_COLOR,
      marker: 'circle',
    }),
    series('magnetic-catenary', 'B, sag 10 m', curves.catenary, (s) => s.magneticRatio, {
      colorIndex: MAGNETIC_COLOR,
      marker: 'square',
    }),
    series('electric-straight', 'E, sag 0', curves.straight, (s) => s.electricRatio, {
      colorIndex: ELECTRIC_COLOR,
      dash: '8 4',
      marker: 'none',
    }),
    series('magnetic-straight', 'B, sag 0', curves.straight, (s) => s.magneticRatio, {
      colorIndex: MAGNETIC_COLOR,
      dash: '8 4',
      marker: 'none',
    }),
  ];
}

const RATIO_CEILING = 1.002;

function ratioFloor(samples: readonly ConvergenceSample[]): number {
  const lowest = Math.min(...samples.flatMap((s) => [s.electricRatio, s.magneticRatio]));
  return Math.floor((lowest - 0.005) * 50) / 50;
}

function curveSamples(curves: ConvergenceCurves): readonly ConvergenceSample[] {
  return [...curves.catenary, ...curves.straight];
}

function segmentsChart(report: ConvergenceReport): NamedChart {
  const spec: ChartSpec = {
    title: 'Convergence with the number of segments per span',
    description:
      'Peak field of the 3D charge simulation at mid-span divided by the peak field of the 2D cross-section, against the number of segments per span, for the default horizontal tower with a 10 m sag and with no sag. The 2D model uses the mid-span heights.',
    x: { label: 'Segments per span' },
    y: {
      label: 'Peak 3D over peak 2D',
      min: ratioFloor(curveSamples(report.segments)),
      max: RATIO_CEILING,
    },
    series: pairedSeries(report.segments),
  };
  return { fileName: 'convergence-segments.svg', spec };
}

function spanChart(report: ConvergenceReport): NamedChart {
  const spec: ChartSpec = {
    title: 'Convergence to the 2D model as the span grows',
    description:
      'Peak field of the 3D charge simulation at mid-span divided by the peak field of the 2D cross-section, against the span length, with three equal spans, 12 segments per span, a 10 m sag and no sag.',
    x: { label: 'Span length (m)', scale: 'log' },
    y: {
      label: 'Peak 3D over peak 2D',
      min: ratioFloor(curveSamples(report.spanLength)),
      max: RATIO_CEILING,
    },
    series: pairedSeries(report.spanLength),
  };
  return { fileName: 'convergence-span-length.svg', spec };
}

function sagChart(report: ConvergenceReport): NamedChart {
  const spec: ChartSpec = {
    title: 'Convergence to the 2D model as the sag goes to zero',
    description:
      'Peak field of the 3D charge simulation at mid-span divided by the peak field of the 2D cross-section, against the sag, for three spans of 300 m and 12 segments per span.',
    x: { label: 'Sag (m)' },
    y: { label: 'Peak 3D over peak 2D', min: ratioFloor(report.sag), max: RATIO_CEILING },
    series: [
      series('electric', 'E', report.sag, (s) => s.electricRatio, {
        colorIndex: ELECTRIC_COLOR,
        marker: 'circle',
      }),
      series('magnetic', 'B', report.sag, (s) => s.magneticRatio, {
        colorIndex: MAGNETIC_COLOR,
        marker: 'square',
      }),
    ],
  };
  return { fileName: 'convergence-sag.svg', spec };
}

export function convergenceCharts(report: ConvergenceReport): readonly NamedChart[] {
  return [segmentsChart(report), spanChart(report), sagChart(report)];
}
