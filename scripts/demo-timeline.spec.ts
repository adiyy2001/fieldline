import { describe, expect, it } from 'vitest';
import {
  CYCLE_FRAME_COUNT,
  DEMO_SCENE_NAMES,
  PHASING_FRAME_COUNT,
  SAG_RAMP_METRES,
  VOLTAGE_RAMP_KILOVOLTS,
} from '../src/app/automation/demo-scenes';
import {
  DEMO_SEGMENTS,
  concatList,
  frameDurations,
  totalSeconds,
  type DemoSegment,
} from './demo-timeline';

const segment: DemoSegment = {
  scene: 'lines-cycle',
  caption: 'Test',
  secondsPerFrame: 0.5,
  lastFrameHoldSeconds: 1,
};

describe('demo timeline', () => {
  it('covers every demo scene of the automation hook in order', () => {
    expect(DEMO_SEGMENTS.map(({ scene }) => scene)).toEqual([...DEMO_SCENE_NAMES]);
  });

  it('gives every segment a caption', () => {
    for (const item of DEMO_SEGMENTS) {
      expect(item.caption.length).toBeGreaterThan(10);
    }
  });

  it('holds the last frame of a segment longer', () => {
    expect(frameDurations(segment, 3)).toEqual([0.5, 0.5, 1.5]);
  });

  it('writes the concat list with the last file repeated so its duration counts', () => {
    const frames = [
      { path: 'a.png', seconds: 0.5 },
      { path: 'b.png', seconds: 1.5 },
    ];
    expect(concatList(frames)).toBe(
      "file 'a.png'\nduration 0.500\nfile 'b.png'\nduration 1.500\nfile 'b.png'\n",
    );
    expect(totalSeconds(frames)).toBe(2);
  });

  it('keeps the whole recording short enough for a README', () => {
    const counts = [
      CYCLE_FRAME_COUNT,
      VOLTAGE_RAMP_KILOVOLTS.length,
      PHASING_FRAME_COUNT,
      SAG_RAMP_METRES.length,
    ];
    const seconds = DEMO_SEGMENTS.reduce(
      (sum, item, index) =>
        sum + frameDurations(item, counts[index] ?? 0).reduce((total, value) => total + value, 0),
      0,
    );
    expect(seconds).toBeLessThan(30);
  });
});
