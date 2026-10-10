import type { Point2 } from '../geometry/bundle';
import { subconductorPositions } from '../geometry/bundle';
import {
  type ConductorGeometry,
  type LineGeometry,
  type SpanSpec,
  SHIELD_GROUP,
  midSpanHeight,
} from '../geometry/line-geometry';

export { SHIELD_GROUP };

export interface Wire {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly group: number;
}

export interface CrossSection {
  readonly wires: readonly Wire[];
  readonly groupCount: number;
}

export type BundleMode = 'equivalent' | 'explicit';

export interface CrossSectionOptions {
  readonly spanIndex: number;
  readonly bundleMode: BundleMode;
}

function wiresOfConductor(
  conductor: ConductorGeometry,
  span: SpanSpec,
  bundleMode: BundleMode,
): readonly Wire[] {
  const group = conductor.role === 'phase' ? conductor.index : SHIELD_GROUP;
  const center: Point2 = { x: conductor.x, y: midSpanHeight(conductor, span) };
  if (bundleMode === 'equivalent' || conductor.bundle.count < 2) {
    return [{ x: center.x, y: center.y, radius: conductor.equivalentRadius, group }];
  }
  return subconductorPositions(center, conductor.bundle).map((position) => ({
    x: position.x,
    y: position.y,
    radius: conductor.subconductorRadius,
    group,
  }));
}

export function crossSectionFromLine(
  geometry: LineGeometry,
  options: CrossSectionOptions,
): CrossSection {
  const span = geometry.spans[options.spanIndex];
  if (span === undefined) {
    throw new RangeError(`The line has no span ${options.spanIndex}`);
  }
  const wires = geometry.conductors.flatMap((conductor) =>
    wiresOfConductor(conductor, span, options.bundleMode),
  );
  const groupCount = geometry.conductors.filter((conductor) => conductor.role === 'phase').length;
  return { wires, groupCount };
}

export function wiresInGroup(section: CrossSection, group: number): number {
  return section.wires.filter((wire) => wire.group === group).length;
}
