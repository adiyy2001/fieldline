import {
  compareSmokeValues,
  expectedSmokeValues,
  smokeElementCount,
  smokeWorkgroupSize,
  workgroupCount,
} from './smoke-expectation';

describe('workgroupCount', () => {
  it('rounds up to whole workgroups', () => {
    expect(workgroupCount(1000, 64)).toBe(16);
    expect(workgroupCount(1024, 64)).toBe(16);
    expect(workgroupCount(1025, 64)).toBe(17);
    expect(workgroupCount(1, 64)).toBe(1);
    expect(workgroupCount(0, 64)).toBe(0);
  });

  it('covers the smoke element count with the smoke workgroup size', () => {
    expect(
      workgroupCount(smokeElementCount, smokeWorkgroupSize) * smokeWorkgroupSize,
    ).toBeGreaterThanOrEqual(smokeElementCount);
  });
});

describe('expectedSmokeValues', () => {
  it('computes index squared plus seven in unsigned 32 bit arithmetic', () => {
    const values = expectedSmokeValues(4);
    expect([...values]).toEqual([7, 8, 11, 16]);
    expect(values).toBeInstanceOf(Uint32Array);
  });

  it('stays below the 32 bit range for the smoke element count', () => {
    const values = expectedSmokeValues(smokeElementCount);
    expect(values[smokeElementCount - 1]).toBe(999 * 999 + 7);
  });
});

describe('compareSmokeValues', () => {
  it('counts every matching value', () => {
    const expected = expectedSmokeValues(8);
    expect(compareSmokeValues(expected, expected)).toEqual({ correct: 8, total: 8 });
  });

  it('counts only the values that match', () => {
    const expected = expectedSmokeValues(8);
    const actual = Uint32Array.from(expected);
    actual[2] = 0;
    actual[5] = 99;
    expect(compareSmokeValues(actual, expected)).toEqual({ correct: 6, total: 8 });
  });

  it('counts a missing value as wrong', () => {
    expect(compareSmokeValues([7, 8], [7, 8, 11])).toEqual({ correct: 2, total: 3 });
  });
});
