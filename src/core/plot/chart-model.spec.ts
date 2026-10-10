import { buildChart, dashForIndex, type ChartSpec } from './chart-model';

const spec: ChartSpec = {
  title: 'Electric field',
  description: 'Lateral profile at 1 m',
  x: { label: 'Distance (m)' },
  y: { label: 'E (kV/m)' },
  series: [
    {
      id: 'a',
      label: 'Series A',
      points: [
        { x: -10, y: 0 },
        { x: 0, y: 4 },
        { x: 10, y: 1 },
      ],
    },
    {
      id: 'b',
      label: 'Series B',
      points: [
        { x: -10, y: 1 },
        { x: 0, y: 2 },
        { x: 10, y: Number.NaN },
      ],
    },
  ],
  levelLines: [
    { id: 'l', label: 'Limit 5 kV/m', value: 5 },
    { id: 'far', label: 'Far', value: 500 },
  ],
};

describe('chart model', () => {
  const model = buildChart(spec);

  it('keeps the plot area inside the canvas', () => {
    expect(model.plot.left + model.plot.width).toBeLessThanOrEqual(model.width);
    expect(model.plot.top + model.plot.height).toBeLessThanOrEqual(model.height);
  });

  it('draws one path per series and breaks nothing for finite data', () => {
    expect(model.series).toHaveLength(2);
    expect(model.series[0]?.path.startsWith('M')).toBe(true);
    expect(model.series[0]?.path.match(/L/g)).toHaveLength(2);
  });

  it('drops non finite points', () => {
    expect(model.series[1]?.markerPoints).toHaveLength(2);
  });

  it('differs between series by dash and marker, not only by colour index', () => {
    const [first, second] = model.series;
    expect(first?.dash).not.toBe(second?.dash);
    expect(first?.marker).not.toBe(second?.marker);
    expect(first?.colorIndex).not.toBe(second?.colorIndex);
  });

  it('puts the y domain to include zero and the level line', () => {
    const values = model.yTicks.map((tick) => tick.value);
    expect(Math.min(...values)).toBe(0);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(5);
    expect(model.levelLines).toHaveLength(1);
    expect(model.levelLines[0]?.position).toBeCloseTo(
      model.yTicks.find((tick) => tick.value === 5)?.position ?? Number.NaN,
      6,
    );
  });

  it('describes the chart in text for screen readers', () => {
    expect(model.textAlternative).toContain('Electric field. Lateral profile at 1 m');
    expect(model.textAlternative).toContain(
      'Series A: 3 points, minimum 0 at -10, maximum 4 at 0.',
    );
    expect(model.textAlternative).toContain('Level Limit 5 kV/m at 5.');
  });

  it('respects explicit axis limits, log scales and custom sizes', () => {
    const logModel = buildChart({
      ...spec,
      width: 400,
      height: 300,
      x: { label: 'n', scale: 'log', min: 1, max: 100 },
      y: { label: 'error', scale: 'log' },
      series: [
        {
          id: 'e',
          label: 'error',
          marker: 'none',
          dash: '4 2',
          points: [
            { x: 1, y: 0.1 },
            { x: 10, y: 0.01 },
            { x: 100, y: 0.001 },
          ],
        },
      ],
      levelLines: [],
    });
    expect(logModel.width).toBe(400);
    expect(logModel.xTicks.map((tick) => tick.label)).toEqual(['1', '10', '100']);
    expect(logModel.series[0]?.marker).toBe('none');
    expect(logModel.series[0]?.dash).toBe('4 2');
    expect(logModel.yTicks.length).toBeGreaterThanOrEqual(3);
  });

  it('handles empty data', () => {
    const empty = buildChart({ ...spec, series: [{ id: 'x', label: 'Empty', points: [] }] });
    expect(empty.series[0]?.path).toBe('');
    expect(empty.textAlternative).toContain('Empty: no data.');
  });

  it('uses no markers for long series by default', () => {
    const points = Array.from({ length: 100 }, (_, index) => ({ x: index, y: index * index }));
    const long = buildChart({ ...spec, series: [{ id: 'l', label: 'Long', points }] });
    expect(long.series[0]?.marker).toBe('none');
  });

  it('cycles the dash patterns', () => {
    expect(dashForIndex(0)).toBe('');
    expect(dashForIndex(5)).toBe('');
    expect(dashForIndex(1)).not.toBe('');
  });
});

describe('series without a line', () => {
  const scatter = buildChart({
    title: 'Scatter',
    description: 'Markers only',
    x: { label: 'x' },
    y: { label: 'y' },
    series: [
      {
        id: 'dots',
        label: 'Dots',
        showLine: false,
        points: Array.from({ length: 80 }, (_, index) => ({ x: index, y: index % 7 })),
      },
    ],
  });

  it('keeps the markers and draws no path', () => {
    expect(scatter.series[0]?.path).toBe('');
    expect(scatter.series[0]?.marker).not.toBe('none');
    expect(scatter.series[0]?.markerPoints).toHaveLength(80);
  });
});
