import { crossSectionFromLine } from '../field2d/cross-section';
import { createFieldEvaluator2D } from '../field2d/evaluator';
import { createBasisFieldSource2D } from '../field2d/basis-source';
import { createCrossSectionSolver } from '../field2d/solver';
import type { FieldEvaluator } from '../field-types';
import { referenceSpan } from '../geometry/discretize';
import type { BasisFieldSource } from '../optimizer/basis-field-source';
import { groupExcitation } from '../model/excitation';
import { type LineParameters, lineGeometryFromParameters } from '../model/parameters';
import { gridSpacing } from './layout';
import { FIELD_COMPONENTS, type GridSpec, MICROTESLA_PER_TESLA } from './types';

export const CROSS_SECTION_ROWS = 2;

export interface CrossSectionField {
  readonly evaluator: FieldEvaluator;
  basisSource(): BasisFieldSource;
  gridValues(spec: GridSpec): Float32Array;
}

export function createCrossSectionField(parameters: LineParameters): CrossSectionField {
  const geometry = lineGeometryFromParameters(parameters);
  const section = crossSectionFromLine(geometry, {
    spanIndex: referenceSpan(geometry).index,
    bundleMode: 'equivalent',
  });
  const solver = createCrossSectionSolver(section);
  const excitation = groupExcitation(parameters);
  const evaluator = createFieldEvaluator2D(solver, excitation.voltages, excitation.currents);
  return {
    evaluator,
    basisSource: () => createBasisFieldSource2D(solver),
    gridValues(spec) {
      const { dx } = gridSpacing(spec);
      const values = new Float32Array(spec.nx * spec.nz * FIELD_COMPONENTS);
      for (let ix = 0; ix < spec.nx; ix += 1) {
        const { electric, magnetic } = evaluator({
          x: spec.xMin + ix * dx,
          y: spec.height,
          z: 0,
        });
        const row = [
          electric.x.re,
          electric.y.re,
          electric.z.re,
          electric.x.im,
          electric.y.im,
          electric.z.im,
          magnetic.x.re * MICROTESLA_PER_TESLA,
          magnetic.y.re * MICROTESLA_PER_TESLA,
          magnetic.z.re * MICROTESLA_PER_TESLA,
          magnetic.x.im * MICROTESLA_PER_TESLA,
          magnetic.y.im * MICROTESLA_PER_TESLA,
          magnetic.z.im * MICROTESLA_PER_TESLA,
        ];
        for (let iz = 0; iz < spec.nz; iz += 1) {
          values.set(row, (ix + spec.nx * iz) * FIELD_COMPONENTS);
        }
      }
      return values;
    },
  };
}
