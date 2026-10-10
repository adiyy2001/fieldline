import {
  IDENTITY,
  PERMUTATIONS,
  allArrangements,
  arrangementFromPhasing,
  arrangementLabel,
  arrangementPhasing,
  classKey,
  classOfArrangement,
  classRepresentatives,
  composePermutations,
  inversePermutation,
  isSelfMirrored,
  mirrorArrangement,
  mirrorClass,
  samePermutation,
} from './arrangements';

describe('arrangements', () => {
  it('has six orderings per circuit and 36 arrangements', () => {
    expect(PERMUTATIONS).toHaveLength(6);
    expect(new Set(PERMUTATIONS.map((p) => p.join(''))).size).toBe(6);
    expect(allArrangements()).toHaveLength(36);
  });

  it('falls into six classes of six members each', () => {
    const counts = new Map<string, number>();
    allArrangements().forEach((arrangement) => {
      const key = classKey(classOfArrangement(arrangement));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    expect([...counts.values()]).toEqual([6, 6, 6, 6, 6, 6]);
  });

  it('keeps the class under a relabeling of the phases on both circuits', () => {
    allArrangements().forEach((arrangement) => {
      PERMUTATIONS.forEach((relabeling) => {
        const relabeled = {
          left: composePermutations(relabeling, arrangement.left),
          right: composePermutations(relabeling, arrangement.right),
        };
        expect(
          samePermutation(classOfArrangement(relabeled), classOfArrangement(arrangement)),
        ).toBe(true);
      });
    });
  });

  it('has representatives with the left circuit in the order A, B, C', () => {
    const representatives = classRepresentatives();
    expect(representatives).toHaveLength(6);
    representatives.forEach((arrangement) => {
      expect(arrangement.left).toEqual(IDENTITY);
      expect(samePermutation(classOfArrangement(arrangement), arrangement.right)).toBe(true);
    });
  });

  it('maps the mirror image to the inverse permutation', () => {
    allArrangements().forEach((arrangement) => {
      const mirrored = mirrorArrangement(arrangement);
      expect(
        samePermutation(classOfArrangement(mirrored), mirrorClass(classOfArrangement(arrangement))),
      ).toBe(true);
    });
  });

  it('has two mirror classes built from the cyclic permutations and four self mirrored ones', () => {
    const selfMirrored = PERMUTATIONS.filter(isSelfMirrored);
    expect(selfMirrored).toHaveLength(4);
    expect(samePermutation(inversePermutation([1, 2, 0]), [2, 0, 1])).toBe(true);
    expect(isSelfMirrored([1, 2, 0])).toBe(false);
  });

  it('writes labels with letters and the phasing as six indices', () => {
    const arrangement = { left: [0, 1, 2], right: [2, 1, 0] } as const;
    expect(arrangementLabel(arrangement)).toBe('ABC | CBA');
    expect(arrangementPhasing(arrangement)).toEqual([0, 1, 2, 2, 1, 0]);
    expect(classKey([1, 2, 0])).toBe('120');
  });

  it('parses a phasing and rejects invalid ones', () => {
    expect(arrangementFromPhasing([0, 1, 2, 2, 1, 0])).toEqual({
      left: [0, 1, 2],
      right: [2, 1, 0],
    });
    expect(arrangementFromPhasing([0, 0, 2, 2, 1, 0])).toBeUndefined();
    expect(arrangementFromPhasing([0, 1, 2])).toBeUndefined();
  });
});
