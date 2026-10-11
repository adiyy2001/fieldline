import { describe, expect, it } from 'vitest';
import {
  adapterLabel,
  hostLabel,
  linesByLayer,
  markdownTable,
  missingFromReadme,
  milliseconds,
  scientific,
} from './results-report';

const environment = {
  date: '2026-10-11T00:04:01.005Z',
  commit: 'abc1234',
  node: 'v24.21.0',
  os: 'linux',
  cpu: 'Test CPU',
  logicalCpus: 4,
};

describe('results report helpers', () => {
  it('names a software adapter as software', () => {
    expect(
      adapterLabel({
        environment,
        adapter: { vendor: 'google', architecture: 'swiftshader', description: '', software: true },
      }),
    ).toBe('google swiftshader (software)');
  });

  it('prefers the adapter description and says when there is no adapter', () => {
    expect(
      adapterLabel({
        environment,
        adapter: { vendor: 'nvidia', architecture: 'ampere', description: 'RTX', software: false },
      }),
    ).toBe('RTX');
    expect(adapterLabel({ environment })).toBe('none (CPU backend)');
  });

  it('prints the host, the browser, the commit and the date', () => {
    expect(hostLabel({ environment, browser: 'chromium 156' })).toBe(
      'Test CPU, linux, chromium 156, Node v24.21.0, commit abc1234, 2026-10-11',
    );
  });

  it('separates the machine that wrote the file from the machine that ran it', () => {
    expect(hostLabel({ environment, runHost: 'Windows host', browser: 'chrome 154' })).toContain(
      'Windows host, files written from Test CPU',
    );
  });

  it('formats numbers and tables', () => {
    expect(scientific(0.000648)).toBe('6.5e-4');
    expect(milliseconds(42.14)).toBe('42.1');
    expect(milliseconds(1137.4)).toBe('1137');
    expect(markdownTable(['a', 'b'], [['1', '2']])).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |');
  });

  it('counts covered lines per source layer in a clover report', () => {
    const clover = [
      '<file name="a.ts" path="/x/src/core/a.ts">',
      '<line num="1" count="2" type="stmt"/><line num="2" count="0" type="stmt"/>',
      '</file>',
      '<file name="b.ts" path="/x/src/core/b.ts"><line num="1" count="1" type="stmt"/></file>',
      '<file name="c.ts" path="/x/src/app/c.ts"><line num="4" count="0" type="stmt"/></file>',
    ].join('\n');
    const layers = linesByLayer(clover);
    expect(layers.get('core')).toEqual({ covered: 2, total: 3 });
    expect(layers.get('app')).toEqual({ covered: 0, total: 1 });
  });
});

describe('the README drift check', () => {
  const readme = '| src/app (all)           | 1642 of 2004  | 81.9    |\n| 210 | 10.0 |';

  it('ignores the padding prettier adds to table cells', () => {
    expect(missingFromReadme(readme, ['| 1642 of 2004 | 81.9 |', '| 210 | 10.0 |'])).toEqual([]);
  });

  it('lists every fragment the README does not contain', () => {
    expect(missingFromReadme(readme, ['| 1640 of 2000 | 82.0 |', '| 210 | 10.0 |'])).toEqual([
      '| 1640 of 2000 | 82.0 |',
    ]);
  });
});
