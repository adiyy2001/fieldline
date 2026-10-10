import type { ChartModel, MarkerShape } from './chart-model';

export interface SvgTheme {
  readonly background: string;
  readonly text: string;
  readonly grid: string;
  readonly axis: string;
  readonly palette: readonly string[];
}

export const LIGHT_THEME: SvgTheme = {
  background: '#ffffff',
  text: '#1f2933',
  grid: '#d9dee3',
  axis: '#52606d',
  palette: ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000'],
};

const MARKER_SIZE = 4.5;

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function number(value: number): string {
  return value.toFixed(2);
}

function markerElement(shape: MarkerShape, x: number, y: number, color: string): string {
  const size = MARKER_SIZE;
  switch (shape) {
    case 'none':
      return '';
    case 'circle':
      return `<circle cx="${number(x)}" cy="${number(y)}" r="${size}" fill="${color}"/>`;
    case 'square':
      return `<rect x="${number(x - size)}" y="${number(y - size)}" width="${size * 2}" height="${size * 2}" fill="${color}"/>`;
    case 'triangle':
      return `<polygon points="${number(x)},${number(y - size - 1)} ${number(x - size - 1)},${number(y + size)} ${number(x + size + 1)},${number(y + size)}" fill="${color}"/>`;
    case 'diamond':
      return `<polygon points="${number(x)},${number(y - size - 1)} ${number(x + size + 1)},${number(y)} ${number(x)},${number(y + size + 1)} ${number(x - size - 1)},${number(y)}" fill="${color}"/>`;
  }
}

function gridAndAxes(model: ChartModel, theme: SvgTheme): string {
  const { plot } = model;
  const bottom = plot.top + plot.height;
  const verticalGrid = model.xTicks.map(
    (tick) =>
      `<line x1="${number(tick.position)}" y1="${plot.top}" x2="${number(tick.position)}" y2="${bottom}" stroke="${theme.grid}" stroke-width="1"/>`,
  );
  const horizontalGrid = model.yTicks.map(
    (tick) =>
      `<line x1="${plot.left}" y1="${number(tick.position)}" x2="${plot.left + plot.width}" y2="${number(tick.position)}" stroke="${theme.grid}" stroke-width="1"/>`,
  );
  const xLabels = model.xTicks.map(
    (tick) =>
      `<text x="${number(tick.position)}" y="${bottom + 20}" text-anchor="middle" fill="${theme.text}" font-size="12">${escapeXml(tick.label)}</text>`,
  );
  const yLabels = model.yTicks.map(
    (tick) =>
      `<text x="${plot.left - 8}" y="${number(tick.position + 4)}" text-anchor="end" fill="${theme.text}" font-size="12">${escapeXml(tick.label)}</text>`,
  );
  const frame = `<rect x="${plot.left}" y="${plot.top}" width="${plot.width}" height="${plot.height}" fill="none" stroke="${theme.axis}" stroke-width="1.5"/>`;
  return [...verticalGrid, ...horizontalGrid, frame, ...xLabels, ...yLabels].join('');
}

function axisTitles(model: ChartModel, theme: SvgTheme): string {
  const { plot } = model;
  const centerX = plot.left + plot.width / 2;
  const centerY = plot.top + plot.height / 2;
  return [
    `<text x="${number(centerX)}" y="${plot.top + plot.height + 44}" text-anchor="middle" fill="${theme.text}" font-size="13">${escapeXml(model.xLabel)}</text>`,
    `<text transform="translate(18 ${number(centerY)}) rotate(-90)" text-anchor="middle" fill="${theme.text}" font-size="13">${escapeXml(model.yLabel)}</text>`,
    `<text x="${plot.left}" y="24" fill="${theme.text}" font-size="16" font-weight="600">${escapeXml(model.title)}</text>`,
  ].join('');
}

function levelLines(model: ChartModel, theme: SvgTheme): string {
  const { plot } = model;
  return model.levelLines
    .map(
      (line) =>
        `<line x1="${plot.left}" y1="${number(line.position)}" x2="${plot.left + plot.width}" y2="${number(line.position)}" stroke="${theme.text}" stroke-width="1.5" stroke-dasharray="${line.dash || '1 0'}"/>` +
        `<text x="${plot.left + plot.width - 4}" y="${number(line.position - 5)}" text-anchor="end" fill="${theme.text}" font-size="12">${escapeXml(line.label)}</text>`,
    )
    .join('');
}

function seriesElements(model: ChartModel, theme: SvgTheme): string {
  return model.series
    .map((series) => {
      const color = theme.palette[series.colorIndex % theme.palette.length] ?? theme.text;
      const dash = series.dash ? ` stroke-dasharray="${series.dash}"` : '';
      const markers = series.markerPoints
        .map((point) => markerElement(series.marker, point.x, point.y, color))
        .join('');
      const line =
        series.path === ''
          ? ''
          : `<path d="${series.path}" fill="none" stroke="${color}" stroke-width="2.25"${dash} stroke-linejoin="round"/>`;
      return `${line}${markers}`;
    })
    .join('');
}

function legend(model: ChartModel, theme: SvgTheme): string {
  const { plot } = model;
  const top = plot.top + plot.height + 58;
  let x = plot.left;
  return model.series
    .map((series) => {
      const color = theme.palette[series.colorIndex % theme.palette.length] ?? theme.text;
      const dash = series.dash ? ` stroke-dasharray="${series.dash}"` : '';
      const entry =
        (series.path === ''
          ? ''
          : `<line x1="${x}" y1="${top}" x2="${x + 28}" y2="${top}" stroke="${color}" stroke-width="2.25"${dash}/>`) +
        markerElement(series.marker, x + 14, top, color) +
        `<text x="${x + 34}" y="${top + 4}" fill="${theme.text}" font-size="12">${escapeXml(series.label)}</text>`;
      x += 48 + series.label.length * 6.6;
      return entry;
    })
    .join('');
}

export function renderChartSvg(model: ChartModel, theme: SvgTheme = LIGHT_THEME): string {
  const titleId = 'chart-title';
  const descriptionId = 'chart-description';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${model.width} ${model.height}" width="${model.width}" height="${model.height}" role="img" aria-labelledby="${titleId} ${descriptionId}" font-family="system-ui, sans-serif">`,
    `<title id="${titleId}">${escapeXml(model.title)}</title>`,
    `<desc id="${descriptionId}">${escapeXml(model.textAlternative)}</desc>`,
    `<rect width="${model.width}" height="${model.height}" fill="${theme.background}"/>`,
    gridAndAxes(model, theme),
    levelLines(model, theme),
    seriesElements(model, theme),
    axisTitles(model, theme),
    legend(model, theme),
    '</svg>',
  ].join('\n');
}
