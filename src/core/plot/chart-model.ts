import {
  type Scale,
  type ScaleKind,
  type Tick,
  buildTicks,
  createScale,
  niceDomain,
} from './scale';

export type MarkerShape = 'none' | 'circle' | 'square' | 'triangle' | 'diamond';

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

export interface ChartSeries {
  readonly id: string;
  readonly label: string;
  readonly points: readonly ChartPoint[];
  readonly dash?: string;
  readonly marker?: MarkerShape;
  readonly showLine?: boolean;
  readonly colorIndex?: number;
}

export interface LevelLine {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly dash?: string;
}

export interface AxisSpec {
  readonly label: string;
  readonly scale?: ScaleKind;
  readonly min?: number;
  readonly max?: number;
}

export interface ChartSpec {
  readonly title: string;
  readonly description: string;
  readonly x: AxisSpec;
  readonly y: AxisSpec;
  readonly series: readonly ChartSeries[];
  readonly levelLines?: readonly LevelLine[];
  readonly width?: number;
  readonly height?: number;
  readonly legend?: boolean;
}

export interface PlotArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ModelSeries {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly dash: string;
  readonly marker: MarkerShape;
  readonly colorIndex: number;
  readonly markerPoints: readonly ChartPoint[];
}

export interface ModelLevelLine {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly position: number;
  readonly dash: string;
}

export interface ChartModel {
  readonly width: number;
  readonly height: number;
  readonly plot: PlotArea;
  readonly title: string;
  readonly description: string;
  readonly xLabel: string;
  readonly yLabel: string;
  readonly xDomain: readonly [number, number];
  readonly yDomain: readonly [number, number];
  readonly xTicks: readonly Tick[];
  readonly yTicks: readonly Tick[];
  readonly series: readonly ModelSeries[];
  readonly levelLines: readonly ModelLevelLine[];
  readonly textAlternative: string;
}

export const DEFAULT_CHART_WIDTH = 720;
export const DEFAULT_CHART_HEIGHT = 420;
const MARGIN = { left: 76, right: 24, top: 56, bottom: 76 } as const;
const MARGIN_WITHOUT_LEGEND_BOTTOM = 54;
const MARGIN_WITHOUT_LEGEND_TOP = 20;
const MARKER_POINT_LIMIT = 40;
const DASH_PATTERNS = ['', '8 4', '2 3', '10 3 2 3', '4 4'] as const;
const MARKER_SHAPES: readonly MarkerShape[] = ['circle', 'square', 'triangle', 'diamond'];

export function dashForIndex(index: number): string {
  return DASH_PATTERNS[index % DASH_PATTERNS.length] ?? '';
}

function finitePoints(points: readonly ChartPoint[]): readonly ChartPoint[] {
  return points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function extent(values: readonly number[]): readonly [number, number] {
  if (values.length === 0) {
    return [0, 1];
  }
  return [Math.min(...values), Math.max(...values)];
}

function resolveDomain(
  axis: AxisSpec,
  values: readonly number[],
  includeZero: boolean,
): readonly [number, number] {
  const [dataMin, dataMax] = extent(values);
  const low = axis.min ?? (includeZero ? Math.min(dataMin, 0) : dataMin);
  const high = axis.max ?? dataMax;
  if (axis.scale === 'log') {
    const positive = values.filter((value) => value > 0);
    const [positiveMin, positiveMax] = extent(positive);
    return [
      axis.min ?? Math.pow(10, Math.floor(Math.log10(positiveMin))),
      axis.max ?? Math.pow(10, Math.ceil(Math.log10(positiveMax))),
    ];
  }
  const nice = niceDomain(low, high, 6);
  return [axis.min ?? nice[0], axis.max ?? nice[1]];
}

const LEVEL_REACH_FACTOR = 3;

function nearbyLevelLines(
  levels: readonly LevelLine[],
  dataValues: readonly number[],
): readonly LevelLine[] {
  const dataMax = dataValues.length > 0 ? Math.max(...dataValues) : 0;
  return levels.filter(
    (line) => dataMax <= 0 || (line.value > 0 && line.value <= LEVEL_REACH_FACTOR * dataMax),
  );
}

function pathFor(points: readonly ChartPoint[], xScale: Scale, yScale: Scale): string {
  let drawing = false;
  return points
    .map((point) => {
      const command = drawing ? 'L' : 'M';
      drawing = true;
      return `${command}${xScale.map(point.x).toFixed(2)} ${yScale.map(point.y).toFixed(2)}`;
    })
    .join('');
}

function describeSeries(series: ChartSeries): string {
  const points = finitePoints(series.points);
  if (points.length === 0) {
    return `${series.label}: no data.`;
  }
  const lowest = points.reduce((best, point) => (point.y < best.y ? point : best));
  const highest = points.reduce((best, point) => (point.y > best.y ? point : best));
  return `${series.label}: ${points.length} points, minimum ${Number(lowest.y.toPrecision(4))} at ${Number(lowest.x.toPrecision(4))}, maximum ${Number(highest.y.toPrecision(4))} at ${Number(highest.x.toPrecision(4))}.`;
}

function describeChart(spec: ChartSpec, xDomain: readonly number[], yDomain: readonly number[]) {
  const levels = (spec.levelLines ?? []).map(
    (line) => `Level ${line.label} at ${Number(line.value.toPrecision(4))}.`,
  );
  return [
    `${spec.title}. ${spec.description}`,
    `${spec.x.label} runs from ${xDomain.join(' to ')}. ${spec.y.label} runs from ${yDomain.join(' to ')}.`,
    ...spec.series.map(describeSeries),
    ...levels,
  ].join(' ');
}

export function buildChart(spec: ChartSpec): ChartModel {
  const width = spec.width ?? DEFAULT_CHART_WIDTH;
  const height = spec.height ?? DEFAULT_CHART_HEIGHT;
  const withLegend = spec.legend ?? true;
  const top = withLegend ? MARGIN.top : MARGIN_WITHOUT_LEGEND_TOP;
  const bottom = withLegend ? MARGIN.bottom : MARGIN_WITHOUT_LEGEND_BOTTOM;
  const plot: PlotArea = {
    left: MARGIN.left,
    top,
    width: width - MARGIN.left - MARGIN.right,
    height: height - top - bottom,
  };
  const cleaned = spec.series.map((series) => ({ series, points: finitePoints(series.points) }));
  const xValues = cleaned.flatMap(({ points }) => points.map((point) => point.x));
  const dataValues = cleaned.flatMap(({ points }) => points.map((point) => point.y));
  const levels = nearbyLevelLines(spec.levelLines ?? [], dataValues);
  const yValues = [...dataValues, ...levels.map((line) => line.value)];
  const xDomain = resolveDomain(spec.x, xValues, false);
  const yDomain = resolveDomain(spec.y, yValues, spec.y.scale !== 'log');
  const xScale = createScale(spec.x.scale ?? 'linear', xDomain, [
    plot.left,
    plot.left + plot.width,
  ]);
  const yScale = createScale(spec.y.scale ?? 'linear', yDomain, [plot.top + plot.height, plot.top]);
  return {
    width,
    height,
    plot,
    title: spec.title,
    description: spec.description,
    xLabel: spec.x.label,
    yLabel: spec.y.label,
    xDomain,
    yDomain,
    xTicks: buildTicks(xScale, 8),
    yTicks: buildTicks(yScale, 6),
    series: cleaned.map(({ series, points }, index) => ({
      id: series.id,
      label: series.label,
      path: series.showLine === false ? '' : pathFor(points, xScale, yScale),
      dash: series.dash ?? dashForIndex(index),
      marker:
        series.marker ??
        (points.length <= MARKER_POINT_LIMIT || series.showLine === false
          ? (MARKER_SHAPES[index % MARKER_SHAPES.length] ?? 'circle')
          : 'none'),
      colorIndex: series.colorIndex ?? index,
      markerPoints: points.map((point) => ({
        x: xScale.map(point.x),
        y: yScale.map(point.y),
      })),
    })),
    levelLines: levels.map((line, index) => ({
      id: line.id,
      label: line.label,
      value: line.value,
      position: yScale.map(line.value),
      dash: line.dash ?? dashForIndex(index + 1),
    })),
    textAlternative: describeChart(spec, xDomain, yDomain),
  };
}

export function xToPixel(model: ChartModel, x: number): number {
  const [low, high] = model.xDomain;
  const span = high - low || 1;
  return model.plot.left + ((x - low) / span) * model.plot.width;
}

export function pixelToX(model: ChartModel, pixel: number): number {
  const [low, high] = model.xDomain;
  const fraction = (pixel - model.plot.left) / model.plot.width;
  return low + Math.min(1, Math.max(0, fraction)) * (high - low);
}

export function snapToStep(value: number, origin: number, step: number): number {
  return origin + Math.round((value - origin) / step) * step;
}

export function nearestPoint(
  series: ModelSeries,
  pixel: number,
): { readonly x: number; readonly y: number } | null {
  let best: { readonly x: number; readonly y: number } | null = null;
  for (const point of series.markerPoints) {
    if (best === null || Math.abs(point.x - pixel) < Math.abs(best.x - pixel)) {
      best = point;
    }
  }
  return best;
}
