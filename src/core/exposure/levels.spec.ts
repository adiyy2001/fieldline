import {
  DEFAULT_PRESET_ID,
  EXPOSURE_PRESETS,
  createCustomLevel,
  defaultPreset,
  displayValue,
  findPreset,
  formatLevel,
  kilovoltsPerMetre,
  microtesla,
  presetLevelList,
  quantityUnit,
  teslaFromAmperePerMetre,
} from './levels';

describe('exposure presets', () => {
  it('pins the ICNIRP 2010 general public levels as the default', () => {
    expect(DEFAULT_PRESET_ID).toBe('icnirp-2010');
    const preset = defaultPreset();
    expect(preset.electric.value).toBe(5000);
    expect(microtesla(preset.magnetic.value)).toBeCloseTo(200, 9);
    expect(preset.source).toContain('Health Physics 99(6):818-836');
  });

  it('pins the 1998 and national presets', () => {
    const icnirp1998 = findPreset('icnirp-1998');
    expect(icnirp1998?.electric.value).toBe(5000);
    expect(microtesla(icnirp1998?.magnetic.value ?? 0)).toBeCloseTo(100, 9);
    const poland = findPreset('poland-public');
    expect(poland?.electric.value).toBe(10000);
    expect(microtesla(poland?.magnetic.value ?? 0)).toBeCloseTo(75.398, 3);
    const residential = findPreset('poland-residential');
    expect(residential?.electric.value).toBe(1000);
    expect(microtesla(residential?.magnetic.value ?? 0)).toBeCloseTo(75.398, 3);
  });

  it('converts a field strength to a flux density with mu0', () => {
    expect(teslaFromAmperePerMetre(60)).toBeCloseTo(60 * 1.25663706127e-6, 15);
    expect(teslaFromAmperePerMetre(160) * 1e6).toBeCloseTo(201.06, 2);
  });

  it('gives every level a unique id and a source', () => {
    const ids = EXPOSURE_PRESETS.flatMap((preset) => presetLevelList(preset).map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    EXPOSURE_PRESETS.forEach((preset) => {
      expect(preset.source.length).toBeGreaterThan(10);
    });
  });

  it('finds no preset for an unknown id', () => {
    expect(findPreset('none')).toBeUndefined();
  });
});

describe('levels', () => {
  it('converts display units', () => {
    expect(kilovoltsPerMetre(5000)).toBe(5);
    expect(microtesla(1e-4)).toBeCloseTo(100, 9);
    expect(quantityUnit('electric')).toBe('kV/m');
    expect(quantityUnit('magnetic')).toBe('µT');
  });

  it('creates custom levels in SI from displayed units', () => {
    const electric = createCustomLevel('custom-e', 'electric', 3, 'Custom E');
    const magnetic = createCustomLevel('custom-b', 'magnetic', 40, 'Custom B');
    expect(electric.value).toBe(3000);
    expect(magnetic.value).toBeCloseTo(40e-6, 15);
    expect(displayValue(electric)).toBe(3);
    expect(displayValue(magnetic)).toBeCloseTo(40, 9);
    expect(formatLevel(magnetic)).toBe('Custom B 40 µT');
  });

  it('refuses zero, negative and non finite levels', () => {
    expect(() => createCustomLevel('x', 'electric', 0, 'x')).toThrow(RangeError);
    expect(() => createCustomLevel('x', 'magnetic', -1, 'x')).toThrow(RangeError);
    expect(() => createCustomLevel('x', 'magnetic', Number.NaN, 'x')).toThrow(RangeError);
  });
});
