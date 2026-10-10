import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { FRAME_SOURCE, FRAME_VIEWPORT, FRAME_VIEW_SPECS, summarizeFrames } from './frame-measure';

describe('the frame time views', () => {
  it('measure every canvas view at full high definition', () => {
    expect(FRAME_VIEWPORT).toEqual({ width: 1920, height: 1080 });
    const views = new Set(FRAME_VIEW_SPECS.map((spec) => spec.settings['view']));
    expect(views).toEqual(new Set(['ground', 'volume', 'isosurface', 'lines']));
    expect(new Set(FRAME_VIEW_SPECS.map((spec) => spec.name)).size).toBe(FRAME_VIEW_SPECS.length);
  });

  it('ship an in-page script that parses', () => {
    expect(() => new Script(`(${FRAME_SOURCE})`)).not.toThrow();
  });
});

describe('summarizeFrames', () => {
  it('turns intervals into a median, a tail and a rate', () => {
    const intervals = Array.from({ length: 100 }, (_, index) => (index < 95 ? 16 : 40));
    const summary = summarizeFrames({
      name: 'view',
      driver: 'phase',
      readyMilliseconds: 123.456,
      frameIntervals: intervals,
    });
    expect(summary).toMatchObject({
      view: 'view',
      frames: 100,
      readyMilliseconds: 123.46,
      frameIntervalMedianMilliseconds: 16,
      frameIntervalP95Milliseconds: 40,
      frameIntervalMaximumMilliseconds: 40,
      framesPerSecond: 62.5,
      sixtyFramesPerSecond: true,
    });
  });

  it('does not claim 60 frames per second for a slow view', () => {
    const summary = summarizeFrames({
      name: 'slow',
      driver: 'orbit',
      readyMilliseconds: 1,
      frameIntervals: Array.from({ length: 10 }, () => 24),
    });
    expect(summary.sixtyFramesPerSecond).toBe(false);
    expect(summary.framesPerSecond).toBe(41.67);
  });
});
