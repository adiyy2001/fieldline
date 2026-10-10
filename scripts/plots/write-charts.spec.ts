import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeCharts } from './write-charts';

const directories: string[] = [];

afterEach(() => {
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

describe('writeCharts', () => {
  it('writes one standalone SVG file per chart and creates the directory', () => {
    const base = mkdtempSync(join(tmpdir(), 'fieldline-charts-'));
    directories.push(base);
    const target = join(base, 'nested', 'img');
    const paths = writeCharts(
      [
        {
          fileName: 'a.svg',
          spec: {
            title: 'A',
            description: 'First',
            x: { label: 'x' },
            y: { label: 'y' },
            series: [
              {
                id: 's',
                label: 'S',
                points: [
                  { x: 0, y: 0 },
                  { x: 1, y: 1 },
                ],
              },
            ],
          },
        },
      ],
      target,
    );
    expect(paths).toEqual([join(target, 'a.svg')]);
    const content = readFileSync(join(target, 'a.svg'), 'utf8');
    expect(content.startsWith('<svg')).toBe(true);
    expect(content.endsWith('</svg>\n')).toBe(true);
  });
});
