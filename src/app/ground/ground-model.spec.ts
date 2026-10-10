import { describe, expect, it } from 'vitest';
import { contourLevels } from '../../core/exposure/contour-levels';
import { defaultConfiguration } from '../../core/model/settings';
import { createFieldPipeline, type FieldFrame } from '../services/field-pipeline';
import { FakeBackends, inlineSolver } from '../testing/doubles';
import {
  extentOf,
  groundSummary,
  legendEntries,
  legendGradient,
  levelLabels,
  readProbe,
} from './ground-model';

async function frameOf(): Promise<FieldFrame> {
  const pipeline = createFieldPipeline({
    solver: inlineSolver(),
    backends: new FakeBackends(),
    clock: () => 0,
  });
  const outcome = await pipeline.run({ configuration: defaultConfiguration(), quality: 'full' });
  if (outcome.status !== 'frame') {
    throw new Error('no frame');
  }
  return outcome.frame;
}

const settings = defaultConfiguration().settings;

describe('the ground view model', () => {
  it('reads the probe from the float64 evaluator at the grid height', async () => {
    const frame = await frameOf();
    const centre = readProbe(frame, settings, { lateral: 0.5, along: 0.5 });
    expect(centre.x).toBe(0);
    expect(centre.z).toBe(450);
    expect(centre.electric).toBeGreaterThan(0.5);
    expect(centre.magnetic).toBeGreaterThan(1);
    expect(centre.text).toContain('x = 0 m, z = 450 m, 1 m above ground (rms)');
    const far = readProbe(frame, settings, { lateral: 1, along: 0.5 });
    expect(far.electric).toBeLessThan(centre.electric);
  });

  it('follows the phase in the instantaneous mode', async () => {
    const frame = await frameOf();
    const at = (degrees: number) =>
      readProbe(
        frame,
        { ...settings, mode: 'instantaneous', phaseDegrees: degrees },
        {
          lateral: 0.5,
          along: 0.5,
        },
      ).electric;
    expect(at(0)).not.toBeCloseTo(at(90), 3);
    expect(at(0)).toBeCloseTo(at(180), 6);
  });

  it('builds a viridis gradient from the dark end to the light end', () => {
    const gradient = legendGradient();
    expect(gradient.startsWith('linear-gradient(to right, rgb(68 1 84) 0%')).toBe(true);
    expect(gradient.endsWith('100%)')).toBe(true);
  });

  it('describes every contour level with its dash name', () => {
    const entries = legendEntries(contourLevels('electric', 'icnirp-2010'));
    expect(entries.map((entry) => entry.dashName)).toEqual([
      'solid',
      'long dashes',
      'short dashes',
    ]);
    expect(entries.filter((entry) => entry.emphasised)).toHaveLength(1);
    expect(entries[0]?.text).toBe('1 kV/m');
  });

  it('summarises the profile and places labels at the crossings', async () => {
    const frame = await frameOf();
    const levels = contourLevels('electric', 'icnirp-2010');
    const { summary, text } = groundSummary(frame, settings, levels);
    expect(text).toContain('Mid-span, 1 m above ground');
    const labels = levelLabels(summary, extentOf(frame), frame.referenceMidZ);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(Math.abs(label.x)).toBeLessThan(60);
      expect(label.z).toBe(450);
    }
  });

  it('labels only the outermost crossing on each side', () => {
    const summary = {
      peakElectric: { x: 0, value: 1 },
      peakMagnetic: { x: 0, value: 1 },
      reports: [
        {
          level: contourLevels('electric', 'icnirp-2010')[0] ?? ({} as never),
          reached: true,
          intervals: [
            { from: -30, to: -3 },
            { from: 3, to: 30 },
          ],
        },
      ],
    };
    const labels = levelLabels(summary, { xMin: -60, xMax: 60, zMin: 0, zMax: 1 }, 0.5);
    expect(labels.map((label) => label.x)).toEqual([-30, 30]);
  });

  it('drops labels that sit on the border of the grid', () => {
    const summary = {
      peakElectric: { x: 0, value: 1 },
      peakMagnetic: { x: 0, value: 1 },
      reports: [
        {
          level: contourLevels('electric', 'icnirp-2010')[0] ?? ({} as never),
          reached: true,
          intervals: [{ from: -60, to: 8 }],
        },
      ],
    };
    const labels = levelLabels(summary, { xMin: -60, xMax: 60, zMin: 0, zMax: 1 }, 0.5);
    expect(labels.map((label) => label.x)).toEqual([8]);
  });
});
