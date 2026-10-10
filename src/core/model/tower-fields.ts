import {
  type DeltaTower,
  type DoubleCircuitTower,
  type HorizontalTower,
  DEFAULT_TOWERS,
  type TowerDimensions,
  type TowerKind,
} from '../geometry/tower';

export const TOWER_FIELD_KEYS: Readonly<Record<TowerKind, readonly string[]>> = {
  horizontal: ['phaseHeight', 'phaseSpacing', 'shieldRise', 'shieldHalfSpacing'],
  delta: ['lowerHeight', 'lowerSpacing', 'apexRise', 'shieldRise', 'shieldHalfSpacing'],
  'double-circuit': [
    'bottomHeight',
    'levelSpacing',
    'circuitHalfSpacing',
    'shieldRise',
    'shieldHalfSpacing',
  ],
};

export function towerFieldValues(tower: TowerDimensions): readonly number[] {
  switch (tower.kind) {
    case 'horizontal':
      return [tower.phaseHeight, tower.phaseSpacing, tower.shieldRise, tower.shieldHalfSpacing];
    case 'delta':
      return [
        tower.lowerHeight,
        tower.lowerSpacing,
        tower.apexRise,
        tower.shieldRise,
        tower.shieldHalfSpacing,
      ];
    case 'double-circuit':
      return [
        tower.bottomHeight,
        tower.levelSpacing,
        tower.circuitHalfSpacing,
        tower.shieldRise,
        tower.shieldHalfSpacing,
      ];
  }
}

export function towerFromFieldValues(kind: TowerKind, values: readonly number[]): TowerDimensions {
  const fallback = towerFieldValues(DEFAULT_TOWERS[kind]);
  const at = (index: number): number => values[index] ?? fallback[index] ?? 0;
  switch (kind) {
    case 'horizontal':
      return {
        kind,
        phaseHeight: at(0),
        phaseSpacing: at(1),
        shieldRise: at(2),
        shieldHalfSpacing: at(3),
      } satisfies HorizontalTower;
    case 'delta':
      return {
        kind,
        lowerHeight: at(0),
        lowerSpacing: at(1),
        apexRise: at(2),
        shieldRise: at(3),
        shieldHalfSpacing: at(4),
      } satisfies DeltaTower;
    case 'double-circuit':
      return {
        kind,
        bottomHeight: at(0),
        levelSpacing: at(1),
        circuitHalfSpacing: at(2),
        shieldRise: at(3),
        shieldHalfSpacing: at(4),
      } satisfies DoubleCircuitTower;
  }
}

export function withTowerField(
  tower: TowerDimensions,
  key: string,
  value: number,
): TowerDimensions {
  const index = TOWER_FIELD_KEYS[tower.kind].indexOf(key);
  if (index < 0) {
    return tower;
  }
  const values = towerFieldValues(tower).map((current, position) =>
    position === index ? value : current,
  );
  return towerFromFieldValues(tower.kind, values);
}
