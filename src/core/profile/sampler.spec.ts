import { evaluatorFor, fixtureFor } from '../testing/fixtures';
import { profileToCsv, PROFILE_CSV_HEADER } from './csv';
import {
  DEFAULT_PROFILE_SPEC,
  profilePeak,
  profilePositions,
  profileValues,
  sampleProfile,
} from './sampler';

describe('profile sampling', () => {
  const evaluate = evaluatorFor(fixtureFor('horizontal'));

  it('uses 241 positions from -60 m to 60 m in 0.5 m steps by default', () => {
    const positions = profilePositions(DEFAULT_PROFILE_SPEC);
    expect(positions).toHaveLength(241);
    expect(positions[0]).toBe(-60);
    expect(positions[240]).toBe(60);
  });

  it('rejects a non positive step and a reversed range', () => {
    expect(() => profilePositions({ ...DEFAULT_PROFILE_SPEC, step: 0 })).toThrow(RangeError);
    expect(() => profilePositions({ ...DEFAULT_PROFILE_SPEC, xMin: 5, xMax: -5 })).toThrow(
      RangeError,
    );
  });

  it('samples E and B at the chosen height', () => {
    const profile = sampleProfile(evaluate, DEFAULT_PROFILE_SPEC);
    expect(profile.samples).toHaveLength(241);
    expect(profile.samples.every((sample) => sample.electricRms > 0)).toBe(true);
    const direct = evaluate({ x: 7, y: 1, z: 0 });
    const sample = profile.samples.find((entry) => entry.x === 7);
    expect(sample?.electric).toEqual(direct.electric);
  });

  it('finds the peak and exposes the value series', () => {
    const profile = sampleProfile(evaluate, DEFAULT_PROFILE_SPEC);
    const peak = profilePeak(profile, 'electric');
    expect(peak.value).toBe(Math.max(...profileValues(profile, 'electric')));
    expect(Math.abs(peak.x)).toBeGreaterThan(0);
    expect(profilePeak(profile, 'magnetic').value).toBe(
      Math.max(...profileValues(profile, 'magnetic')),
    );
  });
});

describe('profile CSV', () => {
  const evaluate = evaluatorFor(fixtureFor('horizontal'));
  const profile = sampleProfile(evaluate, {
    ...DEFAULT_PROFILE_SPEC,
    xMin: -1,
    xMax: 1,
    step: 0.5,
  });
  const lines = profileToCsv(profile).split('\n');

  it('starts with a header that names the units', () => {
    expect(lines[0]).toBe(PROFILE_CSV_HEADER);
    expect(PROFILE_CSV_HEADER).toBe('distance_m,E_kV_per_m,B_uT');
  });

  it('writes one row per sample with dots as decimal separators and a trailing newline', () => {
    expect(lines).toHaveLength(1 + 5 + 1);
    expect(lines[6]).toBe('');
    expect(lines[1]).toMatch(/^-1\.000,\d+\.\d{4},\d+\.\d{4}$/);
    expect(profileToCsv(profile)).not.toContain(';');
  });

  it('converts to kV per metre and microtesla', () => {
    const [, e, b] = (lines[3] ?? '').split(',').map(Number);
    const sample = profile.samples[2];
    expect(e).toBeCloseTo((sample?.electricRms ?? 0) / 1000, 4);
    expect(b).toBeCloseTo((sample?.magneticRms ?? 0) * 1e6, 4);
  });
});
