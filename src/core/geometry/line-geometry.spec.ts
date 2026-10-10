import { DEFAULT_TOWERS } from './tower';
import {
  buildLineGeometry,
  conductorCatenary,
  conductorHeightAt,
  midSpanHeight,
  phaseConductors,
  shieldConductors,
} from './line-geometry';

const input = {
  tower: DEFAULT_TOWERS.horizontal,
  spans: [
    { length: 300, sag: 10 },
    { length: 300, sag: 10 },
    { length: 300, sag: 10 },
  ],
  phaseBundle: { count: 3, spacing: 0.4, subconductorDiameter: 0.03 },
  shieldDiameter: 0.019,
  shieldSagRatio: 0.9,
};

describe('line geometry', () => {
  const geometry = buildLineGeometry(input);

  it('splits conductors into three phases and two shield wires', () => {
    expect(phaseConductors(geometry)).toHaveLength(3);
    expect(shieldConductors(geometry)).toHaveLength(2);
  });

  it('gives bundles an equivalent radius and shield wires their own radius', () => {
    const phase = phaseConductors(geometry)[0];
    const shield = shieldConductors(geometry)[0];
    expect(phase?.equivalentRadius).toBeCloseTo(0.1334, 3);
    expect(phase?.subconductorRadius).toBe(0.015);
    expect(shield?.equivalentRadius).toBe(0.0095);
  });

  it('hangs phases one sag and shield wires 0.9 sag below the attachment at mid-span', () => {
    const span = geometry.spans[0];
    const phase = phaseConductors(geometry)[1];
    const shield = shieldConductors(geometry)[0];
    if (span === undefined || phase === undefined || shield === undefined) {
      throw new Error('missing geometry');
    }
    expect(midSpanHeight(phase, span)).toBeCloseTo(20, 9);
    expect(midSpanHeight(shield, span)).toBeCloseTo(37 - 9, 9);
    expect(conductorHeightAt(phase, span, 0)).toBeCloseTo(30, 9);
    expect(conductorCatenary(shield, span).sag).toBeCloseTo(9, 12);
  });

  it('rejects a line without spans and a line with more than three', () => {
    expect(() => buildLineGeometry({ ...input, spans: [] })).toThrow(RangeError);
    expect(() =>
      buildLineGeometry({ ...input, spans: [...input.spans, { length: 300, sag: 10 }] }),
    ).toThrow(RangeError);
  });
});
