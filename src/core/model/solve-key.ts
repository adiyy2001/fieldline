import type { LineParameters } from './parameters';

export interface SolveKeyOptions {
  readonly draft: boolean;
  readonly withResidual: boolean;
}

export function solveKey(parameters: LineParameters, options: SolveKeyOptions): string {
  return JSON.stringify([
    parameters.tower,
    parameters.spanLengths,
    parameters.phaseSag,
    parameters.shieldSagRatio,
    parameters.segmentsPerSpan,
    parameters.bundleCount,
    parameters.bundleSpacingMetres,
    parameters.subconductorDiameterMillimetres,
    parameters.shieldDiameterMillimetres,
    options.draft,
    options.withResidual,
  ]);
}
