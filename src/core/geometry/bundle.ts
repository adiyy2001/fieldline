import { DEGREES_TO_RADIANS } from '../constants';

export interface BundleSpec {
  readonly count: number;
  readonly spacing: number;
  readonly subconductorDiameter: number;
}

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export function bundleCircleRadius(count: number, spacing: number): number {
  if (count < 2) {
    return 0;
  }
  return spacing / (2 * Math.sin(Math.PI / count));
}

export function equivalentRadius(bundle: BundleSpec): number {
  const subconductorRadius = bundle.subconductorDiameter / 2;
  if (bundle.count < 2) {
    return subconductorRadius;
  }
  const circleRadius = bundleCircleRadius(bundle.count, bundle.spacing);
  return Math.pow(
    bundle.count * subconductorRadius * Math.pow(circleRadius, bundle.count - 1),
    1 / bundle.count,
  );
}

export function defaultBundleRotationDegrees(count: number): number {
  if (count === 2) {
    return 0;
  }
  if (count === 3) {
    return 90;
  }
  return 45;
}

export function subconductorPositions(
  center: Point2,
  bundle: BundleSpec,
  rotationDegrees = defaultBundleRotationDegrees(bundle.count),
): readonly Point2[] {
  if (bundle.count < 2) {
    return [center];
  }
  const circleRadius = bundleCircleRadius(bundle.count, bundle.spacing);
  return Array.from({ length: bundle.count }, (_, index) => {
    const angle = (rotationDegrees + (360 * index) / bundle.count) * DEGREES_TO_RADIANS;
    return {
      x: center.x + circleRadius * Math.cos(angle),
      y: center.y + circleRadius * Math.sin(angle),
    };
  });
}
