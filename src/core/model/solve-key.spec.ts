import { describe, expect, it } from 'vitest';
import { defaultParameters } from './parameters';
import { solveKey } from './solve-key';

const full = { draft: false, withResidual: false };

describe('solveKey', () => {
  const base = defaultParameters('horizontal');

  it('ignores everything that only changes the excitation', () => {
    const changed = {
      ...base,
      lineToLineKilovolts: base.lineToLineKilovolts + 100,
      currentAmperes: base.currentAmperes + 500,
      powerFactorAngleDegrees: 25,
      frequencyHz: 60,
      phasing: [...base.phasing].reverse(),
    };
    expect(solveKey(changed, full)).toBe(solveKey(base, full));
  });

  it('changes with every geometric parameter', () => {
    const geometric = [
      { phaseSag: base.phaseSag + 1 },
      { shieldSagRatio: base.shieldSagRatio - 0.1 },
      { segmentsPerSpan: base.segmentsPerSpan + 2 },
      { bundleCount: base.bundleCount + 1 },
      { bundleSpacingMetres: base.bundleSpacingMetres + 0.1 },
      { subconductorDiameterMillimetres: base.subconductorDiameterMillimetres + 1 },
      { shieldDiameterMillimetres: base.shieldDiameterMillimetres + 1 },
      { spanLengths: [...base.spanLengths, 300] },
      { tower: defaultParameters('delta').tower },
    ];
    const keys = new Set([solveKey(base, full)]);
    for (const patch of geometric) {
      keys.add(solveKey({ ...base, ...patch }, full));
    }
    expect(keys.size).toBe(geometric.length + 1);
  });

  it('separates draft and residual requests', () => {
    const keys = new Set([
      solveKey(base, full),
      solveKey(base, { draft: true, withResidual: false }),
      solveKey(base, { draft: false, withResidual: true }),
    ]);
    expect(keys.size).toBe(3);
  });
});
