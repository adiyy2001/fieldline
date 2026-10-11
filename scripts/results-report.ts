import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RESULTS = join('bench', 'results');

interface Environment {
  readonly date: string;
  readonly commit: string;
  readonly node: string;
  readonly os: string;
  readonly cpu: string;
  readonly logicalCpus: number;
}

interface Adapter {
  readonly vendor: string;
  readonly architecture: string;
  readonly description: string;
  readonly software: boolean;
}

interface Provenance {
  readonly environment: Environment;
  readonly runHost?: string;
  readonly browser?: string;
  readonly adapter?: Adapter | null;
}

interface LatencyRow {
  readonly name: string;
  readonly updateMedianMilliseconds: number;
  readonly updateP95Milliseconds: number;
}

interface LatencyFile extends Provenance {
  readonly backend: string;
  readonly summary: readonly LatencyRow[];
}

interface FrameRow {
  readonly view: string;
  readonly frameIntervalMedianMilliseconds: number;
  readonly framesPerSecond: number;
}

interface FrameFile extends Provenance {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly frames: number;
  readonly summary: readonly FrameRow[];
}

interface ParityFile extends Provenance {
  readonly summary: {
    readonly electricMaximum: number;
    readonly magneticMaximum: number;
    readonly mirrorMaximum: number;
  };
}

interface SolveRow {
  readonly tower: string;
  readonly segmentsPerSpan: number;
  readonly unknowns: number;
  readonly totalMilliseconds: number;
}

interface SolveFile extends Provenance {
  readonly rows: readonly SolveRow[];
}

interface ValidationFile extends Provenance {
  readonly report: {
    readonly summary: {
      readonly publishedCases: number;
      readonly fittedCases: number;
      readonly maximumDeviation: number;
      readonly meanDeviation: number;
      readonly maximumEquivalentShift: number;
      readonly rankingViolations: number;
    };
    readonly analytic: readonly {
      readonly id: string;
      readonly relativeError: number;
      readonly passed: boolean;
    }[];
  };
}

interface Ratio {
  readonly electricRatio: number;
  readonly magneticRatio: number;
}

interface ConvergenceFile extends Provenance {
  readonly report: {
    readonly towers: readonly (Ratio & { readonly tower: string })[];
    readonly discretization: {
      readonly segmentsPerSpan: number;
      readonly electric: number;
      readonly magnetic: number;
    };
    readonly spanLength: {
      readonly straight: readonly (Ratio & { readonly value: number })[];
    };
  };
}

interface LighthouseFile {
  readonly generatedAt: string;
  readonly cpu: string;
  readonly browsers: readonly { readonly renderer: string; readonly chromium: string }[];
  readonly results: readonly {
    readonly renderer: string;
    readonly formFactor: string;
    readonly scores: Readonly<Record<string, number | null>>;
  }[];
}

export function adapterLabel(file: Provenance): string {
  const { adapter } = file;
  if (adapter === undefined || adapter === null) {
    return 'none (CPU backend)';
  }
  const name =
    adapter.description === '' ? `${adapter.vendor} ${adapter.architecture}` : adapter.description;
  return adapter.software ? `${name} (software)` : name;
}

export function hostLabel(file: Provenance): string {
  const { environment, runHost, browser } = file;
  const where =
    runHost === undefined || runHost.startsWith('same machine')
      ? `${environment.cpu}, ${environment.os}`
      : `${runHost}, files written from ${environment.cpu}, ${environment.os}`;
  return `${where}, ${browser ?? 'no browser'}, Node ${environment.node}, commit ${environment.commit}, ${environment.date.slice(0, 10)}`;
}

export function scientific(value: number): string {
  return value.toExponential(1);
}

export function milliseconds(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

export function markdownTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(RESULTS, name), 'utf8'));
}

function filesOf(prefix: string): readonly string[] {
  return readdirSync(RESULTS)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .sort();
}

function section(title: string, body: string): void {
  console.log(`\n## ${title}\n\n${body}`);
}

function validationSection(): void {
  const file = readJson('physics-validation.json') as ValidationFile;
  const { summary, analytic } = file.report;
  section(
    'Validation (bench/physics-validation.ts)',
    [
      `Host: ${hostLabel(file)}`,
      '',
      markdownTable(
        ['Analytic check', 'Relative error', 'Passed'],
        analytic.map(({ id, relativeError, passed }) => [
          id,
          scientific(relativeError),
          passed ? 'yes' : 'no',
        ]),
      ),
      '',
      `Published reference: ${String(summary.publishedCases)} cases, ${String(summary.fittedCases)} fitted. Deviation of the limit height: maximum ${summary.maximumDeviation.toFixed(3)} m, mean ${summary.meanDeviation.toFixed(3)} m. Equivalent conductor against subconductors: at most ${summary.maximumEquivalentShift.toFixed(3)} m. Ranking violations: ${String(summary.rankingViolations)}.`,
    ].join('\n'),
  );
}

function convergenceSection(): void {
  const file = readJson('convergence.json') as ConvergenceFile;
  const { towers, discretization, spanLength } = file.report;
  const longest = spanLength.straight[spanLength.straight.length - 1];
  section(
    'Convergence (bench/convergence.ts)',
    [
      `Host: ${hostLabel(file)}`,
      '',
      markdownTable(
        ['Tower', 'E, 3D over 2D', 'B, 3D over 2D'],
        towers.map((row) => [
          row.tower,
          row.electricRatio.toFixed(4),
          row.magneticRatio.toFixed(4),
        ]),
      ),
      '',
      `Straight line, longest span ${String(longest?.value ?? 0)} m: E ratio ${(longest?.electricRatio ?? 0).toFixed(6)}, B ratio ${(longest?.magneticRatio ?? 0).toFixed(6)}.`,
      `${String(discretization.segmentsPerSpan)} against 48 segments per span: ${(discretization.electric * 100).toFixed(2)} percent in E, ${(discretization.magnetic * 100).toFixed(2)} percent in B.`,
    ].join('\n'),
  );
}

function solveSection(): void {
  const file = readJson('solve-timing.json') as SolveFile;
  const rows = file.rows.filter(({ segmentsPerSpan }) => segmentsPerSpan === 12);
  section(
    'Charge solve in Node (bench/solve-timing.ts)',
    [
      `Host: ${hostLabel(file)}`,
      '',
      markdownTable(
        ['Tower', 'Segments per span', 'Unknowns', 'Assembly, factorization and solve (ms)'],
        rows.map((row) => [
          row.tower,
          String(row.segmentsPerSpan),
          String(row.unknowns),
          milliseconds(row.totalMilliseconds),
        ]),
      ),
    ].join('\n'),
  );
}

function parityRows(): readonly (readonly string[])[] {
  return filesOf('gpu-parity-').map((name) => {
    const file = readJson(name) as ParityFile;
    return [
      adapterLabel(file),
      scientific(file.summary.electricMaximum),
      scientific(file.summary.magneticMaximum),
      scientific(file.summary.mirrorMaximum),
    ];
  });
}

function paritySection(): void {
  section(
    'GPU against float64 (bench/gpu-bench.ts)',
    markdownTable(['Adapter', 'Max error E', 'Max error B', 'Max mirror difference'], parityRows()),
  );
}

function latencySection(): void {
  const files = filesOf('latency-').map((name) => readJson(name) as LatencyFile);
  const cases = files[0]?.summary.map(({ name }) => name) ?? [];
  const header = ['Case', ...files.map((file) => adapterLabel(file))];
  const rows = cases.map((name) => [
    name,
    ...files.map((file) => {
      const row = file.summary.find((candidate) => candidate.name === name);
      return row === undefined
        ? 'n/a'
        : `${milliseconds(row.updateMedianMilliseconds)} / ${milliseconds(row.updateP95Milliseconds)}`;
    }),
  ]);
  const hosts = files.map((file) => `- ${adapterLabel(file)}: ${hostLabel(file)}`);
  section(
    'Update latency, median / p95 in ms (bench/latency.ts)',
    [markdownTable(header, rows), '', ...hosts].join('\n'),
  );
}

function frameSection(): void {
  const files = filesOf('frame-times-').map((name) => readJson(name) as FrameFile);
  const views = files[0]?.summary.map(({ view }) => view) ?? [];
  const header = ['View', ...files.map((file) => adapterLabel(file))];
  const rows = views.map((view) => [
    view,
    ...files.map((file) => {
      const row = file.summary.find((candidate) => candidate.view === view);
      return row === undefined
        ? 'n/a'
        : `${row.framesPerSecond.toFixed(1)} fps (${milliseconds(row.frameIntervalMedianMilliseconds)} ms)`;
    }),
  ]);
  const hosts = files.map(
    (file) =>
      `- ${adapterLabel(file)}: ${String(file.viewport.width)} by ${String(file.viewport.height)}, ${String(file.frames)} frames, ${hostLabel(file)}`,
  );
  section(
    'Frame times (bench/frame-times.ts)',
    [markdownTable(header, rows), '', ...hosts].join('\n'),
  );
}

function lighthouseSection(): void {
  const file = readJson('lighthouse.json') as LighthouseFile;
  const rows = file.results.map(({ renderer, formFactor, scores }) => [
    renderer,
    formFactor,
    ...['accessibility', 'best-practices', 'seo', 'performance'].map((id) =>
      String(scores[id] ?? 'n/a'),
    ),
  ]);
  const browsers = file.browsers.map(({ chromium }) => chromium).join(', ');
  section(
    'Lighthouse (scripts/lighthouse.ts)',
    [
      `Host: ${file.cpu}, Chromium ${browsers}, ${file.generatedAt.slice(0, 10)}`,
      '',
      markdownTable(
        ['Renderer', 'Form factor', 'Accessibility', 'Best practices', 'SEO', 'Performance'],
        rows,
      ),
    ].join('\n'),
  );
}

export interface LineCounts {
  readonly covered: number;
  readonly total: number;
}

export function linesByLayer(clover: string): ReadonlyMap<string, LineCounts> {
  const layers = new Map<string, LineCounts>();
  const files = clover.split('<file ').slice(1);
  for (const block of files) {
    const layer = /\/src\/([a-z0-9]+)\//.exec(block)?.[1];
    if (layer === undefined) {
      continue;
    }
    const lines = [...block.matchAll(/<line num="(\d+)" count="(\d+)"/g)];
    const previous = layers.get(layer) ?? { covered: 0, total: 0 };
    layers.set(layer, {
      covered: previous.covered + lines.filter((line) => Number(line[2]) > 0).length,
      total: previous.total + lines.length,
    });
  }
  return layers;
}

function coverageSection(): void {
  const layers = linesByLayer(readFileSync(join('coverage', 'fieldline', 'clover.xml'), 'utf8'));
  const rows = [...layers.entries()].map(([layer, { covered, total }]) => [
    `src/${layer}`,
    `${String(covered)} of ${String(total)}`,
    ((covered / total) * 100).toFixed(1),
  ]);
  section(
    'Line coverage (pnpm test:coverage)',
    markdownTable(['Layer', 'Lines covered', 'Percent'], rows),
  );
}

function collapseSpaces(text: string): string {
  return text.replace(/[ \t]+/g, ' ');
}

export function missingFromReadme(readme: string, fragments: readonly string[]): string[] {
  const normalized = collapseSpaces(readme);
  return fragments.filter((fragment) => !normalized.includes(collapseSpaces(fragment)));
}

function coverageFragments(): readonly string[] {
  const layers = linesByLayer(readFileSync(join('coverage', 'fieldline', 'clover.xml'), 'utf8'));
  const percent = (name: string): string => {
    const counts = layers.get(name);
    return counts === undefined ? 'n/a' : ((counts.covered / counts.total) * 100).toFixed(1);
  };
  const rows = [...layers.entries()].map(
    ([layer, { covered, total }]) =>
      `| ${String(covered)} of ${String(total)} | ${percent(layer)} |`,
  );
  return [
    ...rows,
    `core line coverage ${percent('core')} percent`,
    `app line coverage ${percent('app')} percent`,
  ];
}

function solveFragments(): readonly string[] {
  const file = readJson('solve-timing.json') as SolveFile;
  return file.rows
    .filter(({ segmentsPerSpan }) => segmentsPerSpan === 12)
    .map((row) => `| ${String(row.unknowns)} | ${milliseconds(row.totalMilliseconds)} |`);
}

function parityFragments(): readonly string[] {
  return filesOf('gpu-parity-').map((name) => {
    const { summary } = readJson(name) as ParityFile;
    return `| ${scientific(summary.electricMaximum)} | ${scientific(summary.magneticMaximum)} | ${scientific(summary.mirrorMaximum)} |`;
  });
}

function checkReadme(): void {
  const readme = readFileSync('README.md', 'utf8');
  const missing = missingFromReadme(readme, [
    ...coverageFragments(),
    ...solveFragments(),
    ...parityFragments(),
  ]);
  if (missing.length > 0) {
    console.error(`README.md differs from the stored results. Missing:\n${missing.join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log('README.md matches the coverage, solve and parity results');
}

if (process.argv[1]?.endsWith('results-report.ts') === true && process.argv.includes('--check')) {
  checkReadme();
} else if (process.argv[1]?.endsWith('results-report.ts') === true) {
  coverageSection();
  validationSection();
  convergenceSection();
  solveSection();
  paritySection();
  latencySection();
  frameSection();
  lighthouseSection();
}
