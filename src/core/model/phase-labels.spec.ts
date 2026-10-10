import { describe, expect, it } from 'vitest';
import { phasePositionCount } from '../geometry/tower';
import { describePhasing, phaseName, phasePositionLabels } from './phase-labels';

describe('phase labels', () => {
  it('names one position per phase position of every tower kind', () => {
    for (const kind of ['horizontal', 'delta', 'double-circuit'] as const) {
      expect(phasePositionLabels(kind)).toHaveLength(phasePositionCount(kind));
    }
  });

  it('names phases with letters', () => {
    expect([0, 1, 2].map(phaseName)).toEqual(['A', 'B', 'C']);
    expect(phaseName(7)).toBe('?');
    expect(describePhasing([0, 2, 1])).toBe('ACB');
  });
});
