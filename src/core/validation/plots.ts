import { complex } from '../complex';
import { kilovoltsPerMetre } from '../exposure/levels';
import { electricFieldAt } from '../field2d/field';
import { createCrossSectionSolver } from '../field2d/solver';
import { type ChartSpec } from '../plot/chart-model';
import { singleConductorField } from './analytic';
import { type ValidationReport } from './report';

const SINGLE = { voltage: 230940, height: 12, radius: 0.015 } as const;

export interface NamedChart {
  readonly fileName: string;
  readonly spec: ChartSpec;
}

function singleConductorChart(): NamedChart {
  const section = {
    wires: [{ x: 0, y: SINGLE.height, radius: SINGLE.radius, group: 0 }],
    groupCount: 1,
  };
  const charges = createCrossSectionSolver(section).chargesFor([complex(SINGLE.voltage, 0)]);
  const positions = Array.from({ length: 121 }, (_, index) => -30 + index * 0.5);
  const rms = (x: number): number => {
    const field = electricFieldAt(section, charges, x, 1);
    return kilovoltsPerMetre(Math.hypot(field.x.re, field.y.re));
  };
  const model = positions.map((x) => ({ x, y: rms(x) }));
  const analytic = positions
    .filter((_, index) => index % 6 === 0)
    .map((x) => {
      const field = singleConductorField(SINGLE, x, 1);
      return { x, y: kilovoltsPerMetre(Math.hypot(field.x, field.y)) };
    });
  return {
    fileName: 'validation-single-conductor.svg',
    spec: {
      title: 'One conductor above ground: model against the analytic solution',
      description:
        'Electric field at 1 m above ground for a 230.94 kV conductor at 12 m with a 15 mm radius. The model curve is the line charge solution, the markers are the closed form.',
      x: { label: 'Lateral distance (m)' },
      y: { label: 'E, rms (kV/m)' },
      series: [
        { id: 'model', label: 'Model', points: model, marker: 'none' },
        { id: 'analytic', label: 'Analytic', points: analytic, marker: 'circle', showLine: false },
      ],
    },
  };
}

function publishedChart(report: ValidationReport): NamedChart {
  const rows = report.published.filter((row) => !row.fitted);
  const points = (
    pick: (row: (typeof rows)[number]) => { published: number; reproduced: number },
  ) => rows.map((row) => ({ x: pick(row).published, y: pick(row).reproduced }));
  const identity = [
    { x: 5, y: 5 },
    { x: 18, y: 18 },
  ];
  return {
    fileName: 'validation-published-limit-heights.svg',
    spec: {
      title: 'Limit heights: reproduced against published',
      description:
        'Lowest clearance at which E stays below 5 kV/m or B below 100 microtesla at 1.8 m, for 13 tower and phasing cases of a 420 kV line. The Portal tower is fitted and left out.',
      x: { label: 'Published limit height (m)', min: 5, max: 18 },
      y: { label: 'Reproduced limit height (m)', min: 5, max: 18 },
      series: [
        { id: 'identity', label: 'Equal', points: identity, marker: 'none', dash: '4 4' },
        {
          id: 'electric',
          label: 'E limit height',
          points: points((row) => row.electric),
          marker: 'circle',
          showLine: false,
        },
        {
          id: 'magnetic',
          label: 'B limit height',
          points: points((row) => row.magnetic),
          marker: 'square',
          showLine: false,
        },
      ],
      height: 460,
    },
  };
}

function bundleChart(report: ValidationReport): NamedChart {
  const rows = report.published;
  return {
    fileName: 'validation-bundle-equivalent.svg',
    spec: {
      title: 'Equivalent conductor against explicit subconductors',
      description:
        'Change of the limit height in metres when each three-conductor bundle is replaced by its equivalent conductor, for the 14 cases.',
      x: { label: 'Limit height with explicit subconductors (m)' },
      y: { label: 'Shift with equivalent conductor (m)' },
      series: [
        {
          id: 'electric',
          label: 'E limit height',
          colorIndex: 1,
          points: rows.map((row) => ({
            x: row.electric.reproduced,
            y: row.electric.equivalentShift,
          })),
          marker: 'circle',
          showLine: false,
        },
        {
          id: 'magnetic',
          label: 'B limit height',
          colorIndex: 2,
          points: rows.map((row) => ({
            x: row.magnetic.reproduced,
            y: row.magnetic.equivalentShift,
          })),
          marker: 'square',
          showLine: false,
        },
      ],
    },
  };
}

export function validationCharts(report: ValidationReport): readonly NamedChart[] {
  return [singleConductorChart(), publishedChart(report), bundleChart(report)];
}
