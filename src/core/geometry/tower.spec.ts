import {
  DEFAULT_TOWERS,
  TOWER_KINDS,
  TOWER_LABELS,
  lowestPhaseHeight,
  mirrorPhasing,
  mirrorPositions,
  phasePositionCount,
  towerAttachments,
} from './tower';

describe('tower presets', () => {
  it('has three phases and two shield wires on the horizontal preset', () => {
    const attachments = towerAttachments(DEFAULT_TOWERS.horizontal);
    const phases = attachments.filter((attachment) => attachment.role === 'phase');
    expect(phases.map((phase) => [phase.x, phase.height])).toEqual([
      [-10, 30],
      [0, 30],
      [10, 30],
    ]);
    const shields = attachments.filter((attachment) => attachment.role === 'shield');
    expect(shields.map((shield) => [shield.x, shield.height])).toEqual([
      [-5, 37],
      [5, 37],
    ]);
  });

  it('puts the delta apex above the two lower phases', () => {
    const attachments = towerAttachments(DEFAULT_TOWERS.delta);
    const phases = attachments.filter((attachment) => attachment.role === 'phase');
    expect(phases.map((phase) => [phase.x, phase.height])).toEqual([
      [-4.5, 26],
      [4.5, 26],
      [0, 32],
    ]);
    expect(Math.min(...attachments.filter((a) => a.role === 'shield').map((a) => a.height))).toBe(
      37,
    );
  });

  it('stacks six positions on the double circuit, left circuit first and top to bottom', () => {
    const phases = towerAttachments(DEFAULT_TOWERS['double-circuit']).filter(
      (attachment) => attachment.role === 'phase',
    );
    expect(phases.map((phase) => phase.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(phases.map((phase) => phase.height)).toEqual([38, 31, 24, 38, 31, 24]);
    expect(phases.map((phase) => phase.x)).toEqual([-6, -6, -6, 6, 6, 6]);
  });

  it('keeps every shield wire above every phase', () => {
    for (const kind of TOWER_KINDS) {
      const attachments = towerAttachments(DEFAULT_TOWERS[kind]);
      const highestPhase = Math.max(
        ...attachments.filter((a) => a.role === 'phase').map((a) => a.height),
      );
      const lowestShield = Math.min(
        ...attachments.filter((a) => a.role === 'shield').map((a) => a.height),
      );
      expect(lowestShield).toBeGreaterThan(highestPhase);
    }
  });

  it('reports position counts, labels and the lowest phase height', () => {
    expect(TOWER_KINDS.map(phasePositionCount)).toEqual([3, 3, 6]);
    expect(TOWER_KINDS.map((kind) => TOWER_LABELS[kind].length > 0)).toEqual([true, true, true]);
    expect(lowestPhaseHeight(DEFAULT_TOWERS['double-circuit'])).toBe(24);
    expect(lowestPhaseHeight(DEFAULT_TOWERS.delta)).toBe(26);
  });
});

describe('mirrored phasing', () => {
  it('swaps the outer positions of the horizontal tower and keeps the middle', () => {
    expect(mirrorPhasing('horizontal', [0, 1, 2])).toEqual([2, 1, 0]);
  });

  it('swaps the two lower positions of the delta tower and keeps the apex', () => {
    expect(mirrorPhasing('delta', [0, 1, 2])).toEqual([1, 0, 2]);
  });

  it('swaps the two circuits of the double circuit tower', () => {
    expect(mirrorPhasing('double-circuit', [0, 1, 2, 2, 1, 0])).toEqual([2, 1, 0, 0, 1, 2]);
  });

  it('maps every position to the position at the opposite x and the same height', () => {
    for (const kind of TOWER_KINDS) {
      const attachments = towerAttachments(DEFAULT_TOWERS[kind]).filter(
        (attachment) => attachment.role === 'phase',
      );
      mirrorPositions(kind).forEach((target, position) => {
        const source = attachments.find((attachment) => attachment.index === position);
        const mirrored = attachments.find((attachment) => attachment.index === target);
        expect(mirrored?.x).toBeCloseTo(-(source?.x ?? 0), 12);
        expect(mirrored?.height).toBeCloseTo(source?.height ?? 0, 12);
      });
    }
  });

  it('is an involution', () => {
    for (const kind of TOWER_KINDS) {
      const phasing = [0, 1, 2, 1, 2, 0].slice(0, phasePositionCount(kind));
      expect(mirrorPhasing(kind, mirrorPhasing(kind, phasing))).toEqual(phasing);
    }
  });
});
