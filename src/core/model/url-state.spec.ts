import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TOWER_KINDS } from '../geometry/tower';
import { type LineParameters, defaultParameters, validateParameters } from './parameters';
import {
  type Configuration,
  EVALUATION_HEIGHTS,
  VIEW_DEFINITIONS,
  defaultConfiguration,
} from './settings';
import { TOWER_FIELD_KEYS, towerFromFieldValues } from './tower-fields';
import { decodeConfiguration, encodeConfiguration } from './url-state';

const gridValue = (min: number, max: number, step: number) =>
  fc.integer({ min: 0, max: Math.floor((max - min) / step + 1e-9) }).map((k) => min + k * step);

const towerArbitrary = fc
  .constantFrom(...TOWER_KINDS)
  .chain((kind) =>
    fc
      .array(gridValue(8, 40, 0.5), { minLength: 5, maxLength: 5 })
      .map((values) => towerFromFieldValues(kind, values.slice(0, TOWER_FIELD_KEYS[kind].length))),
  );

const parametersArbitrary: fc.Arbitrary<LineParameters> = fc
  .record({
    tower: towerArbitrary,
    kv: gridValue(10, 1200, 1),
    amperes: gridValue(0, 5000, 10),
    angle: gridValue(-90, 90, 1),
    spans: fc.array(gridValue(100, 800, 10), { minLength: 2, maxLength: 3 }),
    sag: gridValue(0, 12, 0.5),
    ratio: gridValue(0.5, 1.2, 0.05),
    segments: fc.integer({ min: 4, max: 24 }),
    bundle: fc.integer({ min: 1, max: 4 }),
    spacing: gridValue(0.1, 1, 0.05),
    diameter: gridValue(8, 60, 0.1),
    shield: gridValue(6, 40, 0.1),
    permutations: fc.tuple(
      fc.shuffledSubarray([0, 1, 2], { minLength: 3, maxLength: 3 }),
      fc.shuffledSubarray([0, 1, 2], { minLength: 3, maxLength: 3 }),
    ),
  })
  .map((draw) => ({
    ...defaultParameters(draw.tower.kind),
    tower: draw.tower,
    lineToLineKilovolts: draw.kv,
    currentAmperes: draw.amperes,
    powerFactorAngleDegrees: draw.angle,
    spanLengths: draw.spans,
    phaseSag: draw.sag,
    shieldSagRatio: draw.ratio,
    segmentsPerSpan: draw.segments,
    bundleCount: draw.bundle,
    bundleSpacingMetres: draw.spacing,
    subconductorDiameterMillimetres: draw.diameter,
    shieldDiameterMillimetres: draw.shield,
    phasing:
      draw.tower.kind === 'double-circuit'
        ? [...draw.permutations[0], ...draw.permutations[1]]
        : [...draw.permutations[0]],
  }))
  .filter((parameters) => validateParameters(parameters).length === 0);

const configurationArbitrary: fc.Arbitrary<Configuration> = fc
  .record({
    parameters: parametersArbitrary,
    model: fc.constantFrom('charge-3d' as const, 'cross-section-2d' as const),
    quantity: fc.constantFrom('electric' as const, 'magnetic' as const),
    mode: fc.constantFrom('rms' as const, 'instantaneous' as const),
    phaseDegrees: fc.integer({ min: 0, max: 359 }),
    evaluationHeight: fc.constantFrom(...EVALUATION_HEIGHTS),
    presetId: fc.constantFrom('icnirp-2010', 'icnirp-1998', 'poland-public', 'poland-residential'),
    view: fc.constantFrom(...VIEW_DEFINITIONS.map((definition) => definition.id)),
  })
  .map(({ parameters, ...settings }) => ({ parameters, settings }));

describe('configuration URL codec', () => {
  it('writes only the version for the default configuration', () => {
    expect(encodeConfiguration(defaultConfiguration())).toBe('v=1');
  });

  it('decodes an empty query to the default configuration', () => {
    expect(decodeConfiguration('')).toEqual(defaultConfiguration());
    expect(decodeConfiguration('?')).toEqual(defaultConfiguration());
  });

  it('round trips every valid configuration', () => {
    fc.assert(
      fc.property(configurationArbitrary, (configuration) => {
        expect(decodeConfiguration(encodeConfiguration(configuration))).toEqual(configuration);
      }),
      { numRuns: 300 },
    );
  });

  it('accepts a leading question mark', () => {
    const configuration: Configuration = {
      ...defaultConfiguration(),
      settings: { ...defaultConfiguration().settings, quantity: 'magnetic' },
    };
    expect(decodeConfiguration(`?${encodeConfiguration(configuration)}`)).toEqual(configuration);
  });

  it('falls back to the defaults for an unknown version', () => {
    expect(decodeConfiguration('v=2&kv=500')).toEqual(defaultConfiguration());
    expect(decodeConfiguration('kv=500')).toEqual(defaultConfiguration());
  });

  it('ignores unknown keys', () => {
    expect(decodeConfiguration('v=1&zzz=1&kv=500').parameters.lineToLineKilovolts).toBe(500);
  });

  it.each([
    ['kv=abc'],
    ['kv='],
    ['kv=100000'],
    ['kv=Infinity'],
    ['bn=2.5'],
    ['ph=abca'],
    ['ph=aab'],
    ['sp=300'],
    ['sp=300,x'],
    ['td=1,2'],
    ['w=nowhere'],
    ['m=4d'],
    ['q=x'],
    ['r=x'],
    ['ang=400'],
    ['ht=3'],
    ['lv=none'],
    ['t=zz'],
    ['sag=500'],
  ])('keeps the default for the invalid value %s', (pair) => {
    expect(decodeConfiguration(`v=1&${pair}`)).toEqual(defaultConfiguration());
  });

  it('keeps valid keys next to an invalid one', () => {
    const decoded = decodeConfiguration('v=1&kv=abc&a=1500&q=b');
    expect(decoded.parameters.lineToLineKilovolts).toBe(400);
    expect(decoded.parameters.currentAmperes).toBe(1500);
    expect(decoded.settings.quantity).toBe('magnetic');
  });

  it('switches the tower and keeps the voltage', () => {
    const decoded = decodeConfiguration('v=1&t=dc&kv=500&ph=abccba');
    expect(decoded.parameters.tower.kind).toBe('double-circuit');
    expect(decoded.parameters.lineToLineKilovolts).toBe(500);
    expect(decoded.parameters.phasing).toEqual([0, 1, 2, 2, 1, 0]);
  });

  it('rejects a phasing with the wrong length for the tower', () => {
    expect(decodeConfiguration('v=1&ph=abccba').parameters.phasing).toEqual([0, 1, 2]);
  });

  it('rejects a sag that leaves less than the minimum clearance', () => {
    const decoded = decodeConfiguration('v=1&t=dc&sag=25');
    expect(validateParameters(decoded.parameters)).toEqual([]);
    expect(decoded.parameters.phaseSag).toBe(10);
  });
});
