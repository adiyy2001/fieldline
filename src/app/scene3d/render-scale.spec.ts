import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_SCALE,
  GOVERNOR_WINDOW,
  RENDER_SCALE_LEVELS,
  createRenderScaleGovernor,
  effectiveScale,
  scaleLabel,
} from './render-scale';

function feed(
  governor: ReturnType<typeof createRenderScaleGovernor>,
  interval: number,
  count: number,
  start = 0,
) {
  let now = start;
  governor.observe(now);
  for (let index = 0; index < count; index += 1) {
    now += interval;
    governor.observe(now);
  }
  return now;
}

describe('the render scale governor', () => {
  it('stays at full scale while the frames are fast enough', () => {
    const governor = createRenderScaleGovernor();
    feed(governor, 16.7, GOVERNOR_WINDOW * 4);
    expect(governor.level()).toBe(1);
  });

  it('steps down once after a window of slow frames', () => {
    const governor = createRenderScaleGovernor();
    feed(governor, 25, GOVERNOR_WINDOW);
    expect(governor.level()).toBe(RENDER_SCALE_LEVELS[1]);
  });

  it('keeps stepping down while frames stay slow and stops at the lowest level', () => {
    const governor = createRenderScaleGovernor();
    feed(governor, 40, GOVERNOR_WINDOW * 10);
    expect(governor.level()).toBe(RENDER_SCALE_LEVELS.at(-1));
  });

  it('ignores a long pause such as a hidden tab', () => {
    const governor = createRenderScaleGovernor();
    let now = feed(governor, 16.7, 10);
    now += 5000;
    governor.observe(now);
    feed(governor, 16.7, GOVERNOR_WINDOW, now);
    expect(governor.level()).toBe(1);
  });

  it('forgets the previous frame after a reset', () => {
    const governor = createRenderScaleGovernor();
    feed(governor, 25, GOVERNOR_WINDOW - 5);
    governor.reset();
    feed(governor, 25, GOVERNOR_WINDOW - 5);
    expect(governor.level()).toBe(1);
  });

  it('chooses between the manual and the automatic scale', () => {
    expect(effectiveScale(AUTOMATIC_SCALE, 0.75)).toBe(0.75);
    expect(effectiveScale(0.5, 0.75)).toBe(0.5);
    expect(scaleLabel(0.75)).toBe('75 percent');
  });
});
