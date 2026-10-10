import { describe, expect, it } from 'vitest';
import {
  DASH_PATTERNS,
  MAXIMUM_CONTOUR_LEVELS,
  contourLevels,
  levelEntries,
  dashDescription,
  formatNumber,
  formatQuantity,
} from './contour-levels';

describe('contour levels', () => {
  const national = { quantity: 'electric' as const, value: 3, label: 'National' };

  it('lists the distinct electric levels in ascending order with their sources', () => {
    const levels = contourLevels('electric', 'icnirp-2010');
    expect(levels.map((level) => level.value)).toEqual([1, 5, 10]);
    expect(levels[1]?.sources).toEqual(['ICNIRP 2010', 'ICNIRP 1998']);
    expect(levels[1]?.text).toBe('5 kV/m');
  });

  it('merges the equal Polish magnetic levels', () => {
    const levels = contourLevels('magnetic', 'poland-public');
    expect(levels.map((level) => level.value)).toEqual([75.4, 100, 200]);
    expect(levels[0]?.sources).toEqual(['Poland public', 'Poland residential']);
    expect(levels[0]?.unit).toBe('µT');
  });

  it('emphasises the levels of the selected preset only', () => {
    const levels = contourLevels('electric', 'poland-residential');
    expect(levels.map((level) => level.emphasised)).toEqual([true, false, false]);
  });

  it('emphasises nothing for an unknown preset', () => {
    expect(contourLevels('electric', 'none').every((level) => !level.emphasised)).toBe(true);
  });

  it('gives each level its own dash pattern and a name', () => {
    const levels = contourLevels('electric', 'icnirp-2010');
    expect(new Set(levels.map((level) => level.dashIndex)).size).toBe(levels.length);
    expect(levels.length).toBeLessThanOrEqual(MAXIMUM_CONTOUR_LEVELS);
    expect(DASH_PATTERNS.length).toBeGreaterThanOrEqual(MAXIMUM_CONTOUR_LEVELS);
    const first = levels[0];
    expect(first === undefined ? '' : dashDescription(first)).toBe('solid');
  });

  it('formats numbers compactly', () => {
    expect(formatNumber(1234.5)).toBe('1235');
    expect(formatNumber(75.398)).toBe('75.4');
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(4.6)).toBe('4.6');
    expect(formatNumber(0.05)).toBe('0.05');
    expect(formatNumber(-7.5)).toBe('-7.5');
    expect(formatQuantity(3.456, 'electric')).toBe('3.46 kV/m');
  });

  it('adds a custom level in ascending order and renumbers the dashes', () => {
    const levels = contourLevels('electric', 'icnirp-2010', {
      customLevels: [national],
      hiddenLevels: [],
    });
    expect(levels.map((level) => level.value)).toEqual([1, 3, 5, 10]);
    expect(levels.map((level) => level.dashIndex)).toEqual([0, 1, 2, 3]);
    expect(levels[1]?.sources).toEqual(['National']);
    expect(levels[1]?.emphasised).toBe(false);
  });

  it('hides a reference level', () => {
    const levels = contourLevels('electric', 'icnirp-2010', {
      customLevels: [],
      hiddenLevels: ['e:10'],
    });
    expect(levels.map((level) => level.value)).toEqual([1, 5]);
  });

  it('keeps only the levels of the requested quantity', () => {
    const levels = contourLevels('magnetic', 'icnirp-2010', {
      customLevels: [national],
      hiddenLevels: ['e:10'],
    });
    expect(levels.map((level) => level.value)).toEqual([75.4, 100, 200]);
  });

  it('merges a custom level with a reference level of the same value', () => {
    const levels = contourLevels('electric', 'icnirp-2010', {
      customLevels: [{ ...national, value: 5 }],
      hiddenLevels: [],
    });
    expect(levels.map((level) => level.value)).toEqual([1, 5, 10]);
    expect(levels[1]?.sources).toEqual(['ICNIRP 2010', 'ICNIRP 1998', 'National']);
  });

  it('describes the entries for the editor', () => {
    const entries = levelEntries('electric', 'poland-residential', {
      customLevels: [national],
      hiddenLevels: [],
    });
    expect(entries.map((entry) => entry.key)).toEqual([
      'reference:e:1',
      'custom:e:3',
      'reference:e:5',
      'reference:e:10',
    ]);
    expect(entries.map((entry) => entry.custom)).toEqual([false, true, false, false]);
    expect(entries[0]?.emphasised).toBe(true);
    expect(entries[1]?.name).toBe('National');
  });

  it('never returns more contours than there are dash patterns', () => {
    const many = [1, 2, 3, 4].map((value) => ({ ...national, value }));
    const levels = contourLevels('electric', 'icnirp-2010', {
      customLevels: many,
      hiddenLevels: [],
    });
    expect(levels).toHaveLength(MAXIMUM_CONTOUR_LEVELS);
  });
});
