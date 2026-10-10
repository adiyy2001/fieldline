import type { LineGeometry } from '../geometry/line-geometry';
import {
  type DiscretizationOptions,
  defaultDiscretization,
  discretizeLine,
  referenceSpan,
} from '../geometry/discretize';
import { type LineParameters, lineGeometryFromParameters } from '../model/parameters';
import { phasePositionCount } from '../geometry/tower';
import { type ChargeSystem, createChargeSystem } from './charge-system';
import { packSegments } from './segment-set';

export interface LineSolution {
  readonly geometry: LineGeometry;
  readonly system: ChargeSystem;
}

export function solveLine(
  parameters: LineParameters,
  overrides: Partial<DiscretizationOptions> = {},
): LineSolution {
  const geometry = lineGeometryFromParameters(parameters);
  const options = {
    ...defaultDiscretization(parameters.segmentsPerSpan),
    ...overrides,
  };
  const segments = discretizeLine(geometry, options);
  const system = createChargeSystem(
    packSegments(segments),
    phasePositionCount(parameters.tower.kind),
    referenceSpan(geometry),
  );
  return { geometry, system };
}
