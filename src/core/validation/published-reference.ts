import type { BundleSpec } from '../geometry/bundle';

export type PublishedTower = 'barrel' | 'danube' | 'cat' | 'portal';

export interface PublishedPhaseConductor {
  readonly x: number;
  readonly dy: number;
  readonly phase: number;
}

export interface PublishedShield {
  readonly x: number;
  readonly dy: number;
}

export interface PublishedCase {
  readonly id: string;
  readonly tower: PublishedTower;
  readonly electricLimitHeight: number;
  readonly magneticLimitHeight: number;
  readonly fitted: boolean;
  readonly phaseConductors: readonly PublishedPhaseConductor[];
  readonly shields: readonly PublishedShield[];
}

export type PublishedBundleMode = 'explicit' | 'equivalent';

export const PUBLISHED_CITATION =
  'Bendík, Cenký, Eleschová, Determination of Ground Clearance for EHV 400 kV Overhead Power Lines Based on Electromagnetic Field Limits, Electricity 2026, 7(2), 39, https://doi.org/10.3390/electricity7020039, CC BY 4.0';

export const PUBLISHED_LINE_TO_LINE_VOLTS = 420e3;
export const PUBLISHED_CURRENT_AMPERES = 2715;
export const PUBLISHED_EVALUATION_HEIGHT = 1.8;
export const PUBLISHED_LATERAL_LIMIT = 45;
export const PUBLISHED_ELECTRIC_LIMIT = 5000;
export const PUBLISHED_MAGNETIC_LIMIT = 100e-6;
export const PUBLISHED_TOLERANCE = 0.05;
export const PUBLISHED_BUNDLE: BundleSpec = {
  count: 3,
  spacing: 0.4,
  subconductorDiameter: 0.0302,
};
export const PUBLISHED_SHIELD_RADIUS = 0.009525;
export const PUBLISHED_BUNDLE_ROTATION_DEGREES = -90;

const R = 0;
const B = 1;
const K = 2;

type Pair = readonly [number, number];

interface BarrelRow {
  readonly dy: number;
  readonly offset: number;
}

const BARREL_ROWS: readonly BarrelRow[] = [
  { dy: 0, offset: 7.5 },
  { dy: 9, offset: 9.1 },
  { dy: 18, offset: 7.1 },
];

function barrelConductors(rows: readonly [Pair, Pair, Pair]): readonly PublishedPhaseConductor[] {
  return BARREL_ROWS.flatMap((row, level) => {
    const [left, right] = rows[level] ?? [0, 0];
    return [
      { x: -row.offset, dy: row.dy, phase: left },
      { x: row.offset, dy: row.dy, phase: right },
    ];
  });
}

const DANUBE_BOTTOM_X = [-13.6, -7.3, 7.3, 13.6] as const;

function danubeConductors(
  top: Pair,
  bottom: readonly [number, number, number, number],
): readonly PublishedPhaseConductor[] {
  return [
    { x: -9.6, dy: 11.21, phase: top[0] },
    { x: 9.6, dy: 11.21, phase: top[1] },
    ...DANUBE_BOTTOM_X.map((x, index) => ({ x, dy: 0, phase: bottom[index] ?? 0 })),
  ];
}

function shieldPair(x: number, dy: number): readonly PublishedShield[] {
  return [
    { x: -x, dy },
    { x, dy },
  ];
}

const BARREL_SHIELDS = shieldPair(5.2, 26.6);
const DANUBE_SHIELDS = shieldPair(12.1, 18.21);

export const PUBLISHED_CASES: readonly PublishedCase[] = [
  barrel('BR-A', 16.68, 5.62, [
    [K, K],
    [R, R],
    [B, B],
  ]),
  barrel('BR-B', 13.12, 5.82, [
    [K, R],
    [R, K],
    [B, B],
  ]),
  barrel('BR-C', 11.97, 6.04, [
    [K, B],
    [R, R],
    [B, K],
  ]),
  barrel('BR-D', 16.39, 5.65, [
    [K, K],
    [R, B],
    [B, R],
  ]),
  barrel('BR-E', 12.53, 5.96, [
    [B, K],
    [K, R],
    [R, B],
  ]),
  barrel('BR-F', 12.53, 5.96, [
    [K, B],
    [R, K],
    [B, R],
  ]),
  danube('DN-A', 11.59, 6.15, [B, B], [K, R, K, R]),
  danube('DN-B', 11.05, 6.41, [B, R], [K, R, B, K]),
  danube('DN-C', 13.58, 6.94, [B, K], [K, R, R, B]),
  danube('DN-D', 11.75, 6.65, [B, R], [K, R, K, B]),
  danube('DN-E', 13.72, 6.53, [B, B], [K, R, R, K]),
  danube('DN-F', 11.75, 6.65, [B, K], [K, R, B, R]),
  {
    id: 'Cat',
    tower: 'cat',
    electricLimitHeight: 12.68,
    magneticLimitHeight: 6.45,
    fitted: false,
    phaseConductors: [
      { x: -6.8, dy: 0, phase: R },
      { x: 6.8, dy: 0, phase: K },
      { x: 0, dy: 8.8, phase: B },
    ],
    shields: shieldPair(3.5, 13.7),
  },
  {
    id: 'Portal',
    tower: 'portal',
    electricLimitHeight: 14.79,
    magneticLimitHeight: 7.22,
    fitted: true,
    phaseConductors: [
      { x: -18, dy: 0, phase: R },
      { x: 0, dy: 0, phase: B },
      { x: 18, dy: 0, phase: K },
    ],
    shields: shieldPair(6, 12.15),
  },
];

function barrel(
  id: string,
  electricLimitHeight: number,
  magneticLimitHeight: number,
  rows: readonly [Pair, Pair, Pair],
): PublishedCase {
  return {
    id,
    tower: 'barrel',
    electricLimitHeight,
    magneticLimitHeight,
    fitted: false,
    phaseConductors: barrelConductors(rows),
    shields: BARREL_SHIELDS,
  };
}

function danube(
  id: string,
  electricLimitHeight: number,
  magneticLimitHeight: number,
  top: Pair,
  bottom: readonly [number, number, number, number],
): PublishedCase {
  return {
    id,
    tower: 'danube',
    electricLimitHeight,
    magneticLimitHeight,
    fitted: false,
    phaseConductors: danubeConductors(top, bottom),
    shields: DANUBE_SHIELDS,
  };
}
