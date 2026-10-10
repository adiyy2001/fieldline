import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { levelEntries } from '../../core/exposure/contour-levels';
import { defaultSettings } from '../../core/model/settings';
import { FieldStore } from '../state/field-store';
import { until } from '../testing/doubles';
import { storeProviders } from '../testing/store-providers';
import {
  crossSectionProfile,
  describeSection,
  displayedProfile,
  levelLines,
  profileChartSpec,
  profileRows,
  profileSummaryText,
  readoutAt,
  sectionPosition,
} from './profile-model';

async function readyFrame(search = '') {
  TestBed.configureTestingModule({ providers: storeProviders({ search }) });
  const store = TestBed.inject(FieldStore);
  await until(() => store.status() === 'ready');
  const frame = store.frame();
  if (frame === null) {
    throw new Error('no frame');
  }
  return { store, frame };
}

describe('profile model', () => {
  it('places the section as a fraction of the reference span', async () => {
    const { frame } = await readyFrame();
    const middle = sectionPosition(frame, 0.5);
    expect(middle.percent).toBe(50);
    expect(middle.spanCount).toBe(3);
    expect(middle.spanNumber).toBe(2);
    expect(sectionPosition(frame, 0).z).toBeLessThan(middle.z);
    expect(sectionPosition(frame, 1).z).toBeGreaterThan(middle.z);
  });

  it('describes the section for both models', async () => {
    const { frame } = await readyFrame();
    const position = sectionPosition(frame, 0.25);
    expect(describeSection(position, 'charge-3d')).toMatch(/25 percent along span 2 of 3/);
    expect(describeSection(position, 'cross-section-2d')).toMatch(/infinite parallel/);
  });

  it('reuses the frame profile at mid-span and resamples elsewhere', async () => {
    const { store, frame } = await readyFrame();
    const settings = store.settings();
    expect(displayedProfile(frame, settings)).toBe(frame.profile);
    const moved = displayedProfile(frame, { ...settings, sectionFraction: 0.1 });
    expect(moved).not.toBe(frame.profile);
    expect(moved.spec.z).toBeCloseTo(sectionPosition(frame, 0.1).z, 9);
    expect(moved.samples).toHaveLength(frame.profile.samples.length);
  });

  it('ignores the section position in the 2D model', async () => {
    const { store, frame } = await readyFrame();
    const settings = { ...store.settings(), model: 'cross-section-2d' as const };
    expect(displayedProfile(frame, { ...settings, sectionFraction: 0.1 })).toBe(frame.profile);
  });

  it('builds table rows with display units and optional 2D columns', async () => {
    const { store, frame } = await readyFrame();
    const overlay = crossSectionProfile(store.parameters(), 1, 1);
    const plain = profileRows(frame.profile, null);
    expect(plain).toHaveLength(frame.profile.samples.length);
    expect(plain[0]?.electricTwoD).toBeNull();
    const first = frame.profile.samples[0];
    expect(plain[0]?.electric).toBeCloseTo((first?.electricRms ?? 0) / 1000, 9);
    expect(plain[0]?.magnetic).toBeCloseTo((first?.magneticRms ?? 0) * 1e6, 9);
    const crossed = profileRows(frame.profile, overlay);
    expect(crossed[0]?.electricTwoD).not.toBeNull();
  });

  it('turns levels into dashed chart lines', () => {
    const entries = levelEntries('electric', defaultSettings().presetId);
    const lines = levelLines(entries);
    expect(lines).toHaveLength(entries.length);
    expect(lines.map((line) => line.value)).toEqual(entries.map((entry) => entry.value));
    expect(new Set(lines.map((line) => line.dash)).size).toBe(lines.length);
  });

  it('describes the chart with the peak marker and optional overlay', async () => {
    const { store, frame } = await readyFrame();
    const overlay = crossSectionProfile(store.parameters(), 1, 1);
    const base = {
      quantity: 'electric' as const,
      profile: frame.profile,
      levels: levelEntries('electric', defaultSettings().presetId),
      modelLabel: 'A',
      otherLabel: 'B',
      context: 'here',
    };
    const without = profileChartSpec({ ...base, overlay: null });
    expect(without.series.map((series) => series.id)).toEqual(['main', 'peak']);
    const withOverlay = profileChartSpec({ ...base, overlay });
    expect(withOverlay.series.map((series) => series.id)).toEqual(['main', 'overlay', 'peak']);
    expect(withOverlay.series[1]?.dash).not.toBe('');
    expect(without.series[1]?.label).toMatch(/^Peak .* kV\/m at x = /);
  });

  it('reads the nearest sample at the cursor and appends the 2D values', async () => {
    const { store, frame } = await readyFrame();
    const overlay = crossSectionProfile(store.parameters(), 1, 0.5);
    const reading = readoutAt(frame.profile, null, 0.2);
    expect(reading?.x).toBe(0);
    expect(reading?.text).toMatch(/^x = 0 m: E .* B /);
    expect(reading?.text).not.toMatch(/2D/);
    expect(readoutAt(frame.profile, overlay, 0)?.text).toMatch(/2D model E/);
    expect(readoutAt({ ...frame.profile, samples: [] }, null, 0)).toBeNull();
  });

  it('summarises both peaks in one sentence', async () => {
    const { store, frame } = await readyFrame();
    const text = profileSummaryText(frame.profile, store.settings(), 'mid-span');
    expect(text).toMatch(/peak E .* kV\/m at x = .* m, peak B .* µT at x = .* m\.$/);
  });
});
