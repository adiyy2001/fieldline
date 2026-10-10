export type FrameDriver = 'phase' | 'orbit';

export interface FrameViewSpec {
  readonly name: string;
  readonly settings: Record<string, string | number>;
  readonly driver: FrameDriver;
}

export interface FrameViewRow {
  readonly name: string;
  readonly driver: FrameDriver;
  readonly readyMilliseconds: number;
  readonly frameIntervals: readonly number[];
}

export interface FrameInput {
  readonly specs: readonly FrameViewSpec[];
  readonly frames: number;
  readonly warmupFrames: number;
}

export const FRAME_COUNT = 300;
export const SOFTWARE_FRAME_COUNT = 30;
export const WARMUP_FRAMES = 30;
export const SOFTWARE_WARMUP_FRAMES = 3;
export const FRAME_VIEWPORT = { width: 1920, height: 1080 };
export const SIXTY_FPS_FRAME_MILLISECONDS = 1000 / 60;

export const FRAME_VIEW_SPECS: readonly FrameViewSpec[] = [
  {
    name: 'ground-instantaneous',
    settings: { view: 'ground', quantity: 'electric', mode: 'instantaneous' },
    driver: 'phase',
  },
  {
    name: 'volume-instantaneous',
    settings: { view: 'volume', quantity: 'electric', mode: 'instantaneous' },
    driver: 'phase',
  },
  {
    name: 'volume-rms-orbit',
    settings: { view: 'volume', quantity: 'electric', mode: 'rms' },
    driver: 'orbit',
  },
  {
    name: 'isosurface-electric-orbit',
    settings: { view: 'isosurface', quantity: 'electric', mode: 'rms' },
    driver: 'orbit',
  },
  {
    name: 'isosurface-magnetic-orbit',
    settings: { view: 'isosurface', quantity: 'magnetic', mode: 'rms' },
    driver: 'orbit',
  },
  {
    name: 'lines-electric',
    settings: { view: 'lines', quantity: 'electric', mode: 'rms' },
    driver: 'phase',
  },
  {
    name: 'lines-magnetic',
    settings: { view: 'lines', quantity: 'magnetic', mode: 'rms' },
    driver: 'phase',
  },
];

export const FRAME_SOURCE = `async (input) => {
  const api = window.fieldline;
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const waitFor = async (condition) => {
    const deadline = performance.now() + 240000;
    while (!condition()) {
      if (performance.now() > deadline) {
        throw new Error('timeout');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  const setPlaying = async (wanted) => {
    const state = api.appState();
    if (state !== null && state.playing !== wanted) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await nextFrame();
    }
  };
  const stageElement = () => document.querySelector('.stage');
  const orbitStep = (index) => {
    const stage = stageElement();
    if (stage !== null) {
      stage.dispatchEvent(
        new KeyboardEvent('keydown', { key: index % 40 < 20 ? 'ArrowRight' : 'ArrowLeft', bubbles: true }),
      );
    }
  };
  const rows = [];
  for (const spec of input.specs) {
    await api.setView('ground');
    const started = performance.now();
    await api.setSettings(spec.settings);
    if (spec.settings.view !== 'ground') {
      await waitFor(() => {
        const summary = document.querySelector('[data-testid="scene-summary"]');
        return summary !== null && summary.textContent.trim().length > 0;
      });
    }
    await nextFrame();
    const readyMilliseconds = performance.now() - started;
    await setPlaying(spec.driver === 'phase');
    const total = input.warmupFrames + input.frames;
    const frameIntervals = [];
    let last = await nextFrame();
    for (let index = 0; index < total; index += 1) {
      if (spec.driver === 'orbit') {
        orbitStep(index);
      }
      const now = await nextFrame();
      if (index >= input.warmupFrames) {
        frameIntervals.push(now - last);
      }
      last = now;
    }
    await setPlaying(false);
    rows.push({ name: spec.name, driver: spec.driver, readyMilliseconds, frameIntervals });
  }
  return rows;
}`;

export interface FrameSummary {
  readonly view: string;
  readonly driver: FrameDriver;
  readonly frames: number;
  readonly readyMilliseconds: number;
  readonly frameIntervalMedianMilliseconds: number;
  readonly frameIntervalP95Milliseconds: number;
  readonly frameIntervalMaximumMilliseconds: number;
  readonly framesPerSecond: number;
  readonly sixtyFramesPerSecond: boolean;
}

function quantile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

function roundTo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function summarizeFrames(row: FrameViewRow): FrameSummary {
  const median = quantile(row.frameIntervals, 0.5);
  const slowest = row.frameIntervals.reduce((a, b) => Math.max(a, b), 0);
  return {
    view: row.name,
    driver: row.driver,
    frames: row.frameIntervals.length,
    readyMilliseconds: roundTo(row.readyMilliseconds),
    frameIntervalMedianMilliseconds: roundTo(median),
    frameIntervalP95Milliseconds: roundTo(quantile(row.frameIntervals, 0.95)),
    frameIntervalMaximumMilliseconds: roundTo(slowest),
    framesPerSecond: median > 0 ? roundTo(1000 / median) : 0,
    sixtyFramesPerSecond: median > 0 && median <= SIXTY_FPS_FRAME_MILLISECONDS * 1.05,
  };
}

export function frameInputFor(software: boolean): FrameInput {
  return {
    specs: FRAME_VIEW_SPECS,
    frames: software ? SOFTWARE_FRAME_COUNT : FRAME_COUNT,
    warmupFrames: software ? SOFTWARE_WARMUP_FRAMES : WARMUP_FRAMES,
  };
}
