import {
  DEFAULT_TOWERS,
  TOWER_KINDS,
  TOWER_LABELS,
  lowestPhaseHeight,
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
