export type Permutation = readonly [number, number, number];

export interface Arrangement {
  readonly left: Permutation;
  readonly right: Permutation;
}

export const IDENTITY: Permutation = [0, 1, 2];

export const PERMUTATIONS: readonly Permutation[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

const PHASE_LETTERS = ['A', 'B', 'C'];

export function inversePermutation(permutation: Permutation): Permutation {
  const inverse: [number, number, number] = [0, 0, 0];
  permutation.forEach((value, index) => {
    inverse[value] = index;
  });
  return inverse;
}

export function composePermutations(outer: Permutation, inner: Permutation): Permutation {
  const [first, second, third] = inner;
  return [outer[first] ?? 0, outer[second] ?? 0, outer[third] ?? 0];
}

export function samePermutation(first: Permutation, second: Permutation): boolean {
  return first.every((value, index) => value === second[index]);
}

export function allArrangements(): readonly Arrangement[] {
  return PERMUTATIONS.flatMap((left) => PERMUTATIONS.map((right) => ({ left, right })));
}

export function classOfArrangement(arrangement: Arrangement): Permutation {
  return composePermutations(inversePermutation(arrangement.left), arrangement.right);
}

export function classRepresentatives(): readonly Arrangement[] {
  return PERMUTATIONS.map((right) => ({ left: IDENTITY, right }));
}

export function mirrorArrangement(arrangement: Arrangement): Arrangement {
  return { left: arrangement.right, right: arrangement.left };
}

export function mirrorClass(permutation: Permutation): Permutation {
  return inversePermutation(permutation);
}

export function isSelfMirrored(permutation: Permutation): boolean {
  return samePermutation(permutation, inversePermutation(permutation));
}

export function arrangementPhasing(arrangement: Arrangement): readonly number[] {
  return [...arrangement.left, ...arrangement.right];
}

function permutationLetters(permutation: Permutation): string {
  return permutation.map((phase) => PHASE_LETTERS[phase] ?? '?').join('');
}

export function arrangementLabel(arrangement: Arrangement): string {
  return `${permutationLetters(arrangement.left)} | ${permutationLetters(arrangement.right)}`;
}

export function classKey(permutation: Permutation): string {
  return permutation.join('');
}

export function arrangementFromPhasing(phasing: readonly number[]): Arrangement | undefined {
  const left = phasing.slice(0, 3);
  const right = phasing.slice(3, 6);
  const valid = (values: number[]): boolean => [...values].sort().join('') === '012';
  if (phasing.length !== 6 || !valid(left) || !valid(right)) {
    return undefined;
  }
  return {
    left: [left[0] ?? 0, left[1] ?? 0, left[2] ?? 0],
    right: [right[0] ?? 0, right[1] ?? 0, right[2] ?? 0],
  };
}
