export const RENDER_SCALE_LEVELS: readonly number[] = [1, 0.75, 0.5];
export const AUTOMATIC_SCALE = 'auto';
export type RenderScaleChoice = typeof AUTOMATIC_SCALE | number;
export const TARGET_FRAMES_PER_SECOND = 50;
export const GOVERNOR_WINDOW = 30;
const MILLISECONDS_PER_SECOND = 1000;
const LONGEST_FRAME_MILLISECONDS = 250;

export interface RenderScaleGovernor {
  observe(timestampMilliseconds: number): number;
  reset(): void;
  level(): number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function createRenderScaleGovernor(
  levels: readonly number[] = RENDER_SCALE_LEVELS,
  targetFramesPerSecond = TARGET_FRAMES_PER_SECOND,
  windowSize = GOVERNOR_WINDOW,
): RenderScaleGovernor {
  const budget = MILLISECONDS_PER_SECOND / targetFramesPerSecond;
  let position = 0;
  let lastTimestamp: number | null = null;
  let intervals: number[] = [];

  return {
    observe(timestampMilliseconds) {
      const previous = lastTimestamp;
      lastTimestamp = timestampMilliseconds;
      if (previous === null) {
        return levels[position] ?? 1;
      }
      const interval = timestampMilliseconds - previous;
      if (interval > LONGEST_FRAME_MILLISECONDS) {
        intervals = [];
        return levels[position] ?? 1;
      }
      intervals.push(interval);
      if (intervals.length >= windowSize) {
        if (median(intervals) > budget && position < levels.length - 1) {
          position += 1;
        }
        intervals = [];
      }
      return levels[position] ?? 1;
    },
    reset() {
      lastTimestamp = null;
      intervals = [];
    },
    level() {
      return levels[position] ?? 1;
    },
  };
}

export function effectiveScale(choice: RenderScaleChoice, automatic: number): number {
  return choice === AUTOMATIC_SCALE ? automatic : choice;
}

export function scaleLabel(scale: number): string {
  return `${String(Math.round(scale * 100))} percent`;
}
