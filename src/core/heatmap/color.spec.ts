import { describe, expect, it } from 'vitest';
import { COLOR_STEPS, viridisAt, viridisBytes, viridisTable } from './color';

describe('viridis colour mapping', () => {
  it('starts dark purple and ends yellow', () => {
    expect(viridisBytes(0)).toEqual([68, 1, 84]);
    expect(viridisBytes(1)).toEqual([253, 231, 37]);
  });

  it('clamps and tolerates non-finite input', () => {
    expect(viridisAt(-3)).toEqual(viridisAt(0));
    expect(viridisAt(7)).toEqual(viridisAt(1));
    expect(viridisAt(Number.NaN)).toEqual(viridisAt(0));
  });

  it('interpolates between table entries', () => {
    const middle = viridisAt(0.5 / (COLOR_STEPS - 1));
    const first = viridisAt(0);
    const second = viridisAt(1 / (COLOR_STEPS - 1));
    expect(middle[1]).toBeCloseTo((first[1] + second[1]) / 2, 9);
  });

  it('gains lightness along the map', () => {
    const lightness = (fraction: number): number => {
      const [red, green, blue] = viridisAt(fraction);
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    for (let step = 1; step <= 20; step += 1) {
      expect(lightness(step / 20)).toBeGreaterThan(lightness((step - 1) / 20));
    }
  });

  it('packs the table as RGBA floats for the shader', () => {
    const table = viridisTable();
    expect(table).toHaveLength(COLOR_STEPS * 4);
    expect(table[3]).toBe(1);
    expect(table[(COLOR_STEPS - 1) * 4]).toBeCloseTo(0.993248, 6);
  });
});
