import { describe, expect, it } from 'vitest';
import {
  type CustomLevel,
  MAXIMUM_LEVELS_PER_QUANTITY,
  NO_LEVEL_EDITS,
  addCustomLevel,
  cleanLabel,
  customLevelIssue,
  decodeCustomLevels,
  decodeHiddenLevels,
  encodeCustomLevels,
  encodeHiddenLevels,
  hasLevelEdits,
  hideReferenceLevel,
  levelEditsAreValid,
  normalizeCustomLevel,
  referenceKey,
  removeCustomLevel,
} from './level-edits';

const national: CustomLevel = { quantity: 'electric', value: 3, label: 'National' };

describe('custom level validation', () => {
  it('accepts a level inside the limits', () => {
    expect(customLevelIssue(national)).toBeNull();
  });

  it.each([
    [{ ...national, value: 0 }],
    [{ ...national, value: -1 }],
    [{ ...national, value: 101 }],
    [{ ...national, value: Number.NaN }],
    [{ quantity: 'magnetic' as const, value: 20000, label: 'Large' }],
    [{ ...national, label: '' }],
    [{ ...national, label: ' padded ' }],
  ])('rejects %j', (level) => {
    expect(customLevelIssue(level)).not.toBeNull();
  });

  it('names the unit of the quantity in the range message', () => {
    expect(customLevelIssue({ ...national, value: 0 })).toContain('kV/m');
    expect(customLevelIssue({ quantity: 'magnetic', value: 0, label: 'x' })).toContain('µT');
  });

  it('cleans a label', () => {
    expect(cleanLabel('  two   words ')).toBe('two words');
    expect(cleanLabel('x'.repeat(40))).toHaveLength(24);
  });

  it('falls back to a default label', () => {
    expect(normalizeCustomLevel({ ...national, label: '   ' }).label).toBe('Custom');
  });
});

describe('adding and removing levels', () => {
  it('adds a normalised level', () => {
    const result = addCustomLevel(NO_LEVEL_EDITS, { ...national, label: ' National  limit ' }, [5]);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.edits.customLevels).toEqual([{ ...national, label: 'National limit' }]);
    }
  });

  it('rejects a duplicate of a listed value', () => {
    const result = addCustomLevel(NO_LEVEL_EDITS, national, [1, 3, 5]);
    expect(result).toEqual({ status: 'rejected', issue: 'This level is already listed' });
  });

  it('rejects a level beyond the limit per quantity', () => {
    const visible = Array.from({ length: MAXIMUM_LEVELS_PER_QUANTITY }, (_, index) => index + 10);
    const result = addCustomLevel(NO_LEVEL_EDITS, national, visible);
    expect(result.status).toBe('rejected');
  });

  it('rejects an invalid level with the validation message', () => {
    const result = addCustomLevel(NO_LEVEL_EDITS, { ...national, value: 0 }, []);
    expect(result.status).toBe('rejected');
  });

  it('removes a custom level by quantity and value', () => {
    const edits = { customLevels: [national], hiddenLevels: [] };
    expect(removeCustomLevel(edits, national).customLevels).toEqual([]);
    expect(removeCustomLevel(edits, { ...national, quantity: 'magnetic' }).customLevels).toEqual([
      national,
    ]);
  });

  it('hides a reference level once', () => {
    const once = hideReferenceLevel(NO_LEVEL_EDITS, 'electric', 5);
    expect(once.hiddenLevels).toEqual(['e:5']);
    expect(hideReferenceLevel(once, 'electric', 5)).toBe(once);
  });

  it('reports whether anything was edited', () => {
    expect(hasLevelEdits(NO_LEVEL_EDITS)).toBe(false);
    expect(hasLevelEdits({ customLevels: [national], hiddenLevels: [] })).toBe(true);
    expect(hasLevelEdits({ customLevels: [], hiddenLevels: ['e:5'] })).toBe(true);
  });

  it('keys reference levels by quantity and value', () => {
    expect(referenceKey('magnetic', 75.4)).toBe('b:75.4');
  });
});

describe('level edit codec', () => {
  it('round trips custom levels with reserved characters', () => {
    const levels: CustomLevel[] = [
      national,
      { quantity: 'magnetic', value: 12.5, label: 'a;b:c,d' },
    ];
    expect(decodeCustomLevels(encodeCustomLevels(levels))).toEqual(levels);
  });

  it('decodes an empty string to no levels', () => {
    expect(decodeCustomLevels('')).toEqual([]);
    expect(decodeHiddenLevels('')).toEqual([]);
  });

  it.each([['e:5'], ['x:5:L'], ['e:0:L'], ['e::L'], ['e:5:L:extra'], ['e:5:%E0%A4%A']])(
    'rejects the custom level text %s',
    (text) => {
      expect(decodeCustomLevels(text)).toBeUndefined();
    },
  );

  it('round trips hidden reference keys', () => {
    expect(decodeHiddenLevels(encodeHiddenLevels(['e:5', 'b:75.4']))).toEqual(['e:5', 'b:75.4']);
  });

  it.each([['e5'], ['q:5'], ['e:'], ['e:5,'], ['e:-5']])('rejects the hidden text %s', (text) => {
    expect(decodeHiddenLevels(text)).toBeUndefined();
  });

  it('checks the number of custom levels per quantity', () => {
    const four: CustomLevel[] = [1, 2, 3, 4].map((value) => ({
      quantity: 'electric',
      value,
      label: 'x',
    }));
    expect(levelEditsAreValid({ customLevels: four, hiddenLevels: [] })).toBe(false);
    expect(levelEditsAreValid({ customLevels: four.slice(0, 3), hiddenLevels: [] })).toBe(true);
  });
});
