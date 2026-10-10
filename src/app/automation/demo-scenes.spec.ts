import { describe, expect, it } from 'vitest';
import { validateParameters } from '../../core/model/parameters';
import {
  CYCLE_FRAME_COUNT,
  DEMO_SCENE_NAMES,
  PHASING_FRAME_COUNT,
  isDemoSceneName,
  planDemoScene,
} from './demo-scenes';

const ranked = [
  [0, 1, 2, 0, 1, 2],
  [0, 1, 2, 2, 1, 0],
  [0, 2, 1, 0, 2, 1],
  [0, 2, 1, 1, 2, 0],
  [1, 0, 2, 0, 1, 2],
  [2, 1, 0, 0, 1, 2],
];

describe('demo scenes', () => {
  it('recognises exactly the four scene names', () => {
    expect(DEMO_SCENE_NAMES.every(isDemoSceneName)).toBe(true);
    expect(isDemoSceneName('anything-else')).toBe(false);
  });

  it('steps the field lines through a whole cycle in equal phase steps', () => {
    const plan = planDemoScene('lines-cycle', { phasingsBestFirst: null });
    expect(plan.settings).toMatchObject({ view: 'lines', mode: 'instantaneous' });
    expect(plan.frames).toHaveLength(CYCLE_FRAME_COUNT);
    expect(plan.frames[0]?.phaseDegrees).toBe(0);
    expect(plan.frames[1]?.phaseDegrees).toBe(360 / CYCLE_FRAME_COUNT);
    expect(plan.frames.at(-1)?.phaseDegrees).toBeLessThan(360);
  });

  it('raises the voltage across the heatmap frames', () => {
    const plan = planDemoScene('heatmap-contours', { phasingsBestFirst: null });
    const volts = plan.frames.map((frame) => frame.parameters?.lineToLineKilovolts ?? 0);
    expect(plan.settings.view).toBe('ground');
    expect(volts).toEqual([...volts].sort((a, b) => a - b));
    expect(new Set(volts).size).toBe(volts.length);
  });

  it('goes from the worst to the best phasing on a double circuit', () => {
    const plan = planDemoScene('phasing-change', { phasingsBestFirst: ranked });
    expect(plan.parameters.tower.kind).toBe('double-circuit');
    expect(plan.frames).toHaveLength(PHASING_FRAME_COUNT);
    expect(plan.frames[0]?.parameters?.phasing).toEqual(ranked.at(-1));
    expect(plan.frames.at(-1)?.parameters?.phasing).toEqual(ranked[0]);
  });

  it('has no phasing frames before the ranking exists', () => {
    expect(planDemoScene('phasing-change', { phasingsBestFirst: null }).frames).toEqual([]);
    expect(
      planDemoScene('phasing-change', { phasingsBestFirst: [ranked[0] ?? []] }).frames,
    ).toHaveLength(1);
  });

  it('keeps every frame of every scene valid', () => {
    for (const name of DEMO_SCENE_NAMES) {
      const plan = planDemoScene(name, { phasingsBestFirst: ranked });
      for (const frame of plan.frames) {
        expect(validateParameters({ ...plan.parameters, ...frame.parameters })).toEqual([]);
      }
    }
  });

  it('shows the profile chart while the sag grows', () => {
    const plan = planDemoScene('profile-chart', { phasingsBestFirst: null });
    expect(plan.settings.view).toBe('profile');
    const sags = plan.frames.map((frame) => frame.parameters?.phaseSag ?? 0);
    expect(sags).toEqual([...sags].sort((a, b) => a - b));
  });
});
