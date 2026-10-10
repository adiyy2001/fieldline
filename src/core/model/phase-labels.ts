import type { TowerKind } from '../geometry/tower';

export const PHASE_NAMES: readonly string[] = ['A', 'B', 'C'];

const POSITION_LABELS: Readonly<Record<TowerKind, readonly string[]>> = {
  horizontal: ['Left conductor', 'Centre conductor', 'Right conductor'],
  delta: ['Lower left conductor', 'Lower right conductor', 'Top conductor'],
  'double-circuit': [
    'Left circuit, top',
    'Left circuit, middle',
    'Left circuit, bottom',
    'Right circuit, top',
    'Right circuit, middle',
    'Right circuit, bottom',
  ],
};

export function phasePositionLabels(kind: TowerKind): readonly string[] {
  return POSITION_LABELS[kind];
}

export function phaseName(phase: number): string {
  return PHASE_NAMES[phase] ?? '?';
}

export function describePhasing(phasing: readonly number[]): string {
  return phasing.map(phaseName).join('');
}
