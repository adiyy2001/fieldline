export interface SceneViewSpec {
  readonly name: string;
  readonly settings: Record<string, string | number>;
  readonly animated: boolean;
}

export interface SceneViewRow {
  readonly name: string;
  readonly readyMilliseconds: number;
  readonly captureMilliseconds: readonly number[];
  readonly frameIntervals: readonly number[] | null;
}

export const SCENE_VIEW_SPECS: readonly SceneViewSpec[] = [
  {
    name: 'volume-rms',
    settings: { view: 'volume', quantity: 'electric', mode: 'rms' },
    animated: false,
  },
  {
    name: 'volume-instantaneous',
    settings: { view: 'volume', quantity: 'electric', mode: 'instantaneous' },
    animated: true,
  },
  {
    name: 'volume-magnetic',
    settings: { view: 'volume', quantity: 'magnetic', mode: 'rms' },
    animated: false,
  },
  {
    name: 'isosurface-electric',
    settings: { view: 'isosurface', quantity: 'electric', mode: 'rms' },
    animated: false,
  },
  {
    name: 'isosurface-magnetic',
    settings: { view: 'isosurface', quantity: 'magnetic', mode: 'rms' },
    animated: false,
  },
  {
    name: 'lines-electric',
    settings: { view: 'lines', quantity: 'electric', mode: 'rms' },
    animated: true,
  },
  {
    name: 'lines-magnetic',
    settings: { view: 'lines', quantity: 'magnetic', mode: 'rms' },
    animated: true,
  },
];

export const CAPTURE_REPEATS = 7;
export const FRAME_SAMPLES = 90;

export const MEASURE_SOURCE = `async (input) => {
  const api = window.fieldline;
  const summary = () => document.querySelector('[data-testid="scene-summary"]');
  const pauseButton = () => document.querySelector('[data-testid="scene-pause"]');
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
    const button = pauseButton();
    if (button !== null && (button.getAttribute('aria-pressed') === 'true') === wanted) {
      button.click();
    }
    await nextFrame();
  };
  const rows = [];
  for (const spec of input.specs) {
    await api.setView('ground');
    await waitFor(() => summary() === null);
    const started = performance.now();
    await api.setSettings(spec.settings);
    await waitFor(() => {
      const element = summary();
      return element !== null && element.textContent.trim().length > 0;
    });
    await nextFrame();
    const readyMilliseconds = performance.now() - started;
    await setPlaying(false);
    const captureMilliseconds = [];
    for (let index = 0; index < input.repeats; index += 1) {
      const begin = performance.now();
      await api.captureFrame({ width: 800, height: 500 });
      captureMilliseconds.push(performance.now() - begin);
    }
    let frameIntervals = null;
    if (spec.animated) {
      await setPlaying(true);
      await nextFrame();
      frameIntervals = [];
      let last = await new Promise((resolve) => requestAnimationFrame(resolve));
      for (let index = 0; index < input.frames; index += 1) {
        const now = await new Promise((resolve) => requestAnimationFrame(resolve));
        frameIntervals.push(now - last);
        last = now;
      }
      await setPlaying(false);
    }
    rows.push({ name: spec.name, readyMilliseconds, captureMilliseconds, frameIntervals });
  }
  return rows;
}`;
