import { createCrossSectionField } from '../../core/backend/cross-section-field';
import {
  DASH_PATTERNS,
  type ContourLevel,
  formatNumber,
  formatQuantity,
} from '../../core/exposure/contour-levels';
import { type FieldQuantity, kilovoltsPerMetre, microtesla } from '../../core/exposure/levels';
import type { FieldEvaluator } from '../../core/field-types';
import { referenceSpan } from '../../core/geometry/discretize';
import type { LineParameters } from '../../core/model/parameters';
import type { ViewSettings } from '../../core/model/settings';
import { type ChartSpec, type LevelLine } from '../../core/plot/chart-model';
import {
  DEFAULT_PROFILE_SPEC,
  type Profile,
  type ProfileSample,
  profilePeak,
  profileValues,
  sampleProfile,
} from '../../core/profile/sampler';
import type { FieldFrame } from '../services/field-pipeline';

export const PROFILE_CHART_WIDTH = 720;
export const PROFILE_CHART_HEIGHT = 300;
export const PROFILE_STEP_METRES = DEFAULT_PROFILE_SPEC.step;
export const DRAFT_PROFILE_STEP_METRES = 1;

export interface SectionPosition {
  readonly z: number;
  readonly spanNumber: number;
  readonly spanCount: number;
  readonly percent: number;
}

export interface ProfileRow {
  readonly x: number;
  readonly electric: number;
  readonly magnetic: number;
  readonly electricTwoD: number | null;
  readonly magneticTwoD: number | null;
}

export interface ProfileReadout {
  readonly x: number;
  readonly text: string;
}

export function sectionPosition(frame: FieldFrame, fraction: number): SectionPosition {
  const span = referenceSpan(frame.geometry);
  return {
    z: span.startZ + fraction * span.length,
    spanNumber: span.index + 1,
    spanCount: frame.geometry.spans.length,
    percent: Math.round(fraction * 100),
  };
}

export function describeSection(position: SectionPosition, model: ViewSettings['model']): string {
  if (model === 'cross-section-2d') {
    return 'infinite parallel conductors at mid-span height';
  }
  return `${String(position.percent)} percent along span ${String(position.spanNumber)} of ${String(position.spanCount)} (z = ${formatNumber(position.z)} m)`;
}

function stepFor(frame: FieldFrame): number {
  return frame.quality === 'draft' ? DRAFT_PROFILE_STEP_METRES : PROFILE_STEP_METRES;
}

export type SectionRequest = Pick<ViewSettings, 'model' | 'sectionFraction' | 'evaluationHeight'>;

export function displayedProfile(frame: FieldFrame, settings: SectionRequest): Profile {
  if (settings.model === 'cross-section-2d') {
    return frame.profile;
  }
  const { z } = sectionPosition(frame, settings.sectionFraction);
  if (Math.abs(z - frame.profile.spec.z) < 1e-9) {
    return frame.profile;
  }
  return sampleProfile(frame.evaluator, {
    ...DEFAULT_PROFILE_SPEC,
    step: stepFor(frame),
    height: settings.evaluationHeight,
    z,
  });
}

export function crossSectionProfile(
  parameters: LineParameters,
  height: number,
  step: number,
): Profile {
  const evaluator: FieldEvaluator = createCrossSectionField(parameters).evaluator;
  return sampleProfile(evaluator, {
    ...DEFAULT_PROFILE_SPEC,
    step,
    height,
    z: 0,
  });
}

function displayScale(quantity: FieldQuantity): (value: number) => number {
  return quantity === 'electric' ? kilovoltsPerMetre : microtesla;
}

export function profileRows(profile: Profile, overlay: Profile | null): readonly ProfileRow[] {
  const convertE = displayScale('electric');
  const convertB = displayScale('magnetic');
  return profile.samples.map((sample, index) => {
    const other: ProfileSample | undefined = overlay?.samples[index];
    return {
      x: sample.x,
      electric: convertE(sample.electricRms),
      magnetic: convertB(sample.magneticRms),
      electricTwoD: other === undefined ? null : convertE(other.electricRms),
      magneticTwoD: other === undefined ? null : convertB(other.magneticRms),
    };
  });
}

export function levelLines(levels: readonly ContourLevel[]): readonly LevelLine[] {
  return levels.map((level) => ({
    id: `level-${String(level.value)}`,
    label: `${level.text}, ${level.sources[0] ?? ''}`.replace(/, $/, ''),
    value: level.value,
    dash: (DASH_PATTERNS[level.dashIndex] ?? []).join(' '),
  }));
}

const QUANTITY_TITLES: Readonly<Record<FieldQuantity, string>> = {
  electric: 'Electric field E',
  magnetic: 'Magnetic flux density B',
};

const QUANTITY_AXIS: Readonly<Record<FieldQuantity, string>> = {
  electric: 'E (kV/m)',
  magnetic: 'B (µT)',
};

export interface ChartInput {
  readonly quantity: FieldQuantity;
  readonly profile: Profile;
  readonly overlay: Profile | null;
  readonly levels: readonly ContourLevel[];
  readonly modelLabel: string;
  readonly otherLabel: string;
  readonly context: string;
}

export function profileChartSpec(input: ChartInput): ChartSpec {
  const { quantity, profile, overlay, levels } = input;
  const convert = displayScale(quantity);
  const pointsOf = (source: Profile) => {
    const values = profileValues(source, quantity);
    return source.samples.map((sample, index) => ({ x: sample.x, y: convert(values[index] ?? 0) }));
  };
  const peak = profilePeak(profile, quantity);
  const peakValue = convert(peak.value);
  return {
    title: QUANTITY_TITLES[quantity],
    description: `Resultant rms value ${formatNumber(profile.spec.height)} m above ground, ${input.context}.`,
    x: { label: 'Lateral distance x (m)', min: profile.spec.xMin, max: profile.spec.xMax },
    y: { label: QUANTITY_AXIS[quantity] },
    width: PROFILE_CHART_WIDTH,
    height: PROFILE_CHART_HEIGHT,
    series: [
      { id: 'main', label: input.modelLabel, points: pointsOf(profile), colorIndex: 0, dash: '' },
      ...(overlay === null
        ? []
        : [
            {
              id: 'overlay',
              label: input.otherLabel,
              points: pointsOf(overlay),
              colorIndex: 1,
              dash: '8 4',
            },
          ]),
      {
        id: 'peak',
        label: `Peak ${formatQuantity(peakValue, quantity)} at x = ${formatNumber(peak.x)} m`,
        points: [{ x: peak.x, y: peakValue }],
        showLine: false,
        marker: 'diamond',
        colorIndex: 6,
      },
    ],
    levelLines: levelLines(levels),
  };
}

export function readoutAt(
  profile: Profile,
  overlay: Profile | null,
  x: number,
): ProfileReadout | null {
  let index = -1;
  let distance = Number.POSITIVE_INFINITY;
  profile.samples.forEach((sample, position) => {
    const gap = Math.abs(sample.x - x);
    if (gap < distance) {
      distance = gap;
      index = position;
    }
  });
  const sample = profile.samples[index];
  if (sample === undefined) {
    return null;
  }
  const other = overlay?.samples[index];
  const electric = formatQuantity(kilovoltsPerMetre(sample.electricRms), 'electric');
  const magnetic = formatQuantity(microtesla(sample.magneticRms), 'magnetic');
  const twoD =
    other === undefined
      ? ''
      : `, 2D model E ${formatQuantity(kilovoltsPerMetre(other.electricRms), 'electric')}, B ${formatQuantity(microtesla(other.magneticRms), 'magnetic')}`;
  return {
    x: sample.x,
    text: `x = ${formatNumber(sample.x)} m: E ${electric}, B ${magnetic}${twoD}`,
  };
}

export function profileSummaryText(
  profile: Profile,
  settings: ViewSettings,
  section: string,
): string {
  const electric = profilePeak(profile, 'electric');
  const magnetic = profilePeak(profile, 'magnetic');
  return `Lateral profile ${formatNumber(settings.evaluationHeight)} m above ground, ${section}: peak E ${formatQuantity(kilovoltsPerMetre(electric.value), 'electric')} at x = ${formatNumber(electric.x)} m, peak B ${formatQuantity(microtesla(magnetic.value), 'magnetic')} at x = ${formatNumber(magnetic.x)} m.`;
}
