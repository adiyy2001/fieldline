export type TowerKind = 'horizontal' | 'delta' | 'double-circuit';

export interface HorizontalTower {
  readonly kind: 'horizontal';
  readonly phaseHeight: number;
  readonly phaseSpacing: number;
  readonly shieldRise: number;
  readonly shieldHalfSpacing: number;
}

export interface DeltaTower {
  readonly kind: 'delta';
  readonly lowerHeight: number;
  readonly lowerSpacing: number;
  readonly apexRise: number;
  readonly shieldRise: number;
  readonly shieldHalfSpacing: number;
}

export interface DoubleCircuitTower {
  readonly kind: 'double-circuit';
  readonly bottomHeight: number;
  readonly levelSpacing: number;
  readonly circuitHalfSpacing: number;
  readonly shieldRise: number;
  readonly shieldHalfSpacing: number;
}

export type TowerDimensions = HorizontalTower | DeltaTower | DoubleCircuitTower;

export type ConductorRole = 'phase' | 'shield';

export interface Attachment {
  readonly role: ConductorRole;
  readonly index: number;
  readonly x: number;
  readonly height: number;
}

export const TOWER_KINDS: readonly TowerKind[] = ['horizontal', 'delta', 'double-circuit'];

export const TOWER_LABELS: Readonly<Record<TowerKind, string>> = {
  horizontal: 'Single circuit, horizontal',
  delta: 'Single circuit, delta',
  'double-circuit': 'Double circuit, stacked',
};

export const DEFAULT_TOWERS: Readonly<Record<TowerKind, TowerDimensions>> = {
  horizontal: {
    kind: 'horizontal',
    phaseHeight: 30,
    phaseSpacing: 10,
    shieldRise: 7,
    shieldHalfSpacing: 5,
  },
  delta: {
    kind: 'delta',
    lowerHeight: 26,
    lowerSpacing: 9,
    apexRise: 6,
    shieldRise: 5,
    shieldHalfSpacing: 3,
  },
  'double-circuit': {
    kind: 'double-circuit',
    bottomHeight: 24,
    levelSpacing: 7,
    circuitHalfSpacing: 6,
    shieldRise: 6,
    shieldHalfSpacing: 4,
  },
};

export function phasePositionCount(kind: TowerKind): number {
  return kind === 'double-circuit' ? 6 : 3;
}

function shieldAttachments(
  topHeight: number,
  rise: number,
  halfSpacing: number,
): readonly Attachment[] {
  return [-halfSpacing, halfSpacing].map((x, index) => ({
    role: 'shield',
    index,
    x,
    height: topHeight + rise,
  }));
}

function phaseAttachment(index: number, x: number, height: number): Attachment {
  return { role: 'phase', index, x, height };
}

function horizontalAttachments(tower: HorizontalTower): readonly Attachment[] {
  return [
    phaseAttachment(0, -tower.phaseSpacing, tower.phaseHeight),
    phaseAttachment(1, 0, tower.phaseHeight),
    phaseAttachment(2, tower.phaseSpacing, tower.phaseHeight),
    ...shieldAttachments(tower.phaseHeight, tower.shieldRise, tower.shieldHalfSpacing),
  ];
}

function deltaAttachments(tower: DeltaTower): readonly Attachment[] {
  const apexHeight = tower.lowerHeight + tower.apexRise;
  return [
    phaseAttachment(0, -tower.lowerSpacing / 2, tower.lowerHeight),
    phaseAttachment(1, tower.lowerSpacing / 2, tower.lowerHeight),
    phaseAttachment(2, 0, apexHeight),
    ...shieldAttachments(apexHeight, tower.shieldRise, tower.shieldHalfSpacing),
  ];
}

function doubleCircuitAttachments(tower: DoubleCircuitTower): readonly Attachment[] {
  const topHeight = tower.bottomHeight + 2 * tower.levelSpacing;
  const heightsTopDown = [topHeight, tower.bottomHeight + tower.levelSpacing, tower.bottomHeight];
  const left = heightsTopDown.map((height, level) =>
    phaseAttachment(level, -tower.circuitHalfSpacing, height),
  );
  const right = heightsTopDown.map((height, level) =>
    phaseAttachment(level + 3, tower.circuitHalfSpacing, height),
  );
  return [
    ...left,
    ...right,
    ...shieldAttachments(topHeight, tower.shieldRise, tower.shieldHalfSpacing),
  ];
}

export function towerAttachments(tower: TowerDimensions): readonly Attachment[] {
  switch (tower.kind) {
    case 'horizontal':
      return horizontalAttachments(tower);
    case 'delta':
      return deltaAttachments(tower);
    case 'double-circuit':
      return doubleCircuitAttachments(tower);
  }
}

export function lowestPhaseHeight(tower: TowerDimensions): number {
  return Math.min(
    ...towerAttachments(tower)
      .filter((attachment) => attachment.role === 'phase')
      .map((attachment) => attachment.height),
  );
}
