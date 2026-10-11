export interface DemoSegment {
  readonly scene: string;
  readonly caption: string;
  readonly secondsPerFrame: number;
  readonly lastFrameHoldSeconds: number;
}

export const DEMO_SEGMENTS: readonly DemoSegment[] = [
  {
    scene: 'lines-cycle',
    caption: 'Electric field lines over one 50 Hz cycle',
    secondsPerFrame: 0.12,
    lastFrameHoldSeconds: 0.4,
  },
  {
    scene: 'heatmap-contours',
    caption: 'Ground field with exposure contours, line voltage from 250 to 525 kV',
    secondsPerFrame: 0.45,
    lastFrameHoldSeconds: 1.2,
  },
  {
    scene: 'phasing-change',
    caption: 'Double circuit: phase arrangements from the worst to the best',
    secondsPerFrame: 1.4,
    lastFrameHoldSeconds: 1.8,
  },
  {
    scene: 'profile-chart',
    caption: 'Lateral profile at 1 m, sag from 6 to 16 m',
    secondsPerFrame: 0.6,
    lastFrameHoldSeconds: 1.6,
  },
];

export interface RecordedFrame {
  readonly path: string;
  readonly seconds: number;
}

export function frameDurations(segment: DemoSegment, frameCount: number): readonly number[] {
  return Array.from({ length: frameCount }, (_, index) =>
    index === frameCount - 1
      ? segment.secondsPerFrame + segment.lastFrameHoldSeconds
      : segment.secondsPerFrame,
  );
}

export function concatList(frames: readonly RecordedFrame[]): string {
  const last = frames[frames.length - 1];
  const entries = frames.map(
    ({ path, seconds }) => `file '${path}'\nduration ${seconds.toFixed(3)}`,
  );
  return `${entries.join('\n')}${last === undefined ? '' : `\nfile '${last.path}'`}\n`;
}

export function totalSeconds(frames: readonly RecordedFrame[]): number {
  return frames.reduce((sum, { seconds }) => sum + seconds, 0);
}
