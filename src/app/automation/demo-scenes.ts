import { defaultParameters, type LineParameters } from '../../core/model/parameters';
import { type ViewSettings, defaultSettings } from '../../core/model/settings';

export const DEMO_SCENE_NAMES = [
  'lines-cycle',
  'heatmap-contours',
  'phasing-change',
  'profile-chart',
] as const;

export type DemoSceneName = (typeof DEMO_SCENE_NAMES)[number];

export interface DemoSceneFrame {
  readonly parameters?: Partial<LineParameters>;
  readonly phaseDegrees?: number;
}

export interface DemoScenePlan {
  readonly name: DemoSceneName;
  readonly parameters: LineParameters;
  readonly settings: ViewSettings;
  readonly frames: readonly DemoSceneFrame[];
}

export interface DemoSceneContext {
  readonly phasingsBestFirst: readonly (readonly number[])[] | null;
}

export const CYCLE_FRAME_COUNT = 24;
export const VOLTAGE_RAMP_KILOVOLTS: readonly number[] = [250, 300, 350, 400, 450, 500, 525];
export const SAG_RAMP_METRES: readonly number[] = [6, 8, 10, 12, 14, 16];
export const PHASING_FRAME_COUNT = 4;
const FULL_CYCLE = 360;

export function isDemoSceneName(value: string): value is DemoSceneName {
  return DEMO_SCENE_NAMES.some((name) => name === value);
}

function evenlySpacedIndices(length: number, count: number): readonly number[] {
  if (length <= 1) {
    return [0];
  }
  const picked = Array.from({ length: count }, (_, index) =>
    Math.round((index * (length - 1)) / (count - 1)),
  );
  return picked.filter((value, index) => picked.indexOf(value) === index);
}

function phasingFrames(context: DemoSceneContext): readonly DemoSceneFrame[] {
  const ranked = context.phasingsBestFirst ?? [];
  const worstFirst = [...ranked].reverse();
  return evenlySpacedIndices(worstFirst.length, PHASING_FRAME_COUNT).flatMap((index) => {
    const phasing = worstFirst[index];
    return phasing === undefined ? [] : [{ parameters: { phasing } }];
  });
}

export function planDemoScene(name: DemoSceneName, context: DemoSceneContext): DemoScenePlan {
  const settings = defaultSettings();
  switch (name) {
    case 'lines-cycle':
      return {
        name,
        parameters: defaultParameters('horizontal'),
        settings: { ...settings, view: 'lines', quantity: 'electric', mode: 'instantaneous' },
        frames: Array.from({ length: CYCLE_FRAME_COUNT }, (_, index) => ({
          phaseDegrees: (index * FULL_CYCLE) / CYCLE_FRAME_COUNT,
        })),
      };
    case 'heatmap-contours':
      return {
        name,
        parameters: defaultParameters('horizontal'),
        settings: { ...settings, view: 'ground', quantity: 'electric', mode: 'rms' },
        frames: VOLTAGE_RAMP_KILOVOLTS.map((lineToLineKilovolts) => ({
          parameters: { lineToLineKilovolts },
        })),
      };
    case 'phasing-change':
      return {
        name,
        parameters: defaultParameters('double-circuit'),
        settings: { ...settings, view: 'ground', quantity: 'electric', mode: 'rms' },
        frames: phasingFrames(context),
      };
    case 'profile-chart':
      return {
        name,
        parameters: defaultParameters('horizontal'),
        settings: { ...settings, view: 'profile', quantity: 'electric', mode: 'rms' },
        frames: SAG_RAMP_METRES.map((phaseSag) => ({ parameters: { phaseSag } })),
      };
  }
}
