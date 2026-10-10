import { buildChart } from './chart-model';
import { LIGHT_THEME, escapeXml, renderChartSvg } from './svg';

const model = buildChart({
  title: 'Profile <E> & B',
  description: 'Lateral profile',
  x: { label: 'Distance (m)' },
  y: { label: 'Field' },
  series: ['circle', 'square', 'triangle', 'diamond', 'none'].map((marker, index) => ({
    id: `s${index}`,
    label: `Series ${index}`,
    marker: marker as 'circle' | 'square' | 'triangle' | 'diamond' | 'none',
    points: [
      { x: 0, y: index },
      { x: 1, y: index + 1 },
    ],
  })),
  levelLines: [{ id: 'l', label: 'Limit', value: 2 }],
});

describe('SVG output', () => {
  const svg = renderChartSvg(model);

  it('produces a standalone accessible image', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title id="chart-title">Profile &lt;E&gt; &amp; B</title>');
    expect(svg).toContain('<desc id="chart-description">');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('draws every series, marker shape and the level line', () => {
    expect(svg.match(/<path /g)).toHaveLength(5);
    expect(svg).toContain('<circle ');
    expect(svg).toContain('<rect ');
    expect(svg).toContain('<polygon ');
    expect(svg).toContain('>Limit</text>');
  });

  it('uses the theme palette and dash patterns', () => {
    expect(svg).toContain(`stroke="${LIGHT_THEME.palette[0]}"`);
    expect(svg).toContain('stroke-dasharray="8 4"');
  });

  it('contains no dashes of the long kind and no unescaped angle brackets in text', () => {
    expect(new RegExp(String.fromCharCode(91, 0x2013, 0x2014, 93)).test(svg)).toBe(false);
    expect(svg).not.toContain('<E>');
  });

  it('escapes the five XML characters it needs', () => {
    expect(escapeXml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });
});

describe('SVG output without lines', () => {
  it('draws markers and a legend entry without a line sample', () => {
    const scatter = renderChartSvg(
      buildChart({
        title: 'Scatter',
        description: 'Markers only',
        x: { label: 'x' },
        y: { label: 'y' },
        series: [
          {
            id: 'dots',
            label: 'Dots',
            showLine: false,
            points: [
              { x: 0, y: 1 },
              { x: 1, y: 2 },
            ],
          },
        ],
      }),
    );
    expect(scatter).not.toContain('<path');
    expect(scatter).toContain('<circle');
  });
});
