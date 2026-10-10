import {
  ELECTRIC_CONSTANT,
  LINE_CHARGE_FIELD_CONSTANT,
  LINE_CURRENT_FIELD_CONSTANT,
  MAGNETIC_CONSTANT,
  TWO_PI,
  VACUUM_PERMEABILITY,
  VACUUM_PERMITTIVITY,
} from './constants';

describe('constants', () => {
  it('uses the CODATA 2022 values', () => {
    expect(VACUUM_PERMITTIVITY).toBe(8.8541878188e-12);
    expect(VACUUM_PERMEABILITY).toBe(1.25663706127e-6);
  });

  it('gives the Coulomb constant of 8987.55 volt metres per microcoulomb', () => {
    expect(ELECTRIC_CONSTANT * 1e-6).toBeCloseTo(8987.55, 1);
  });

  it('gives mu0 over four pi of 9.99999999868e-8', () => {
    expect(MAGNETIC_CONSTANT / 9.99999999868e-8).toBeCloseTo(1, 11);
  });

  it('keeps c squared equal to one over mu0 epsilon0', () => {
    expect(1 / Math.sqrt(VACUUM_PERMEABILITY * VACUUM_PERMITTIVITY)).toBeCloseTo(299792458, -1);
  });

  it('derives the line constants from the base values', () => {
    expect(LINE_CHARGE_FIELD_CONSTANT).toBe(1 / (TWO_PI * VACUUM_PERMITTIVITY));
    expect(LINE_CURRENT_FIELD_CONSTANT).toBe(VACUUM_PERMEABILITY / TWO_PI);
  });
});
