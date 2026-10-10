import fc from 'fast-check';
import {
  buildTicks,
  createScale,
  formatTick,
  linearTickValues,
  logTickValues,
  niceDomain,
  niceStep,
} from './scale';

describe('scales', () => {
  it('maps a linear domain onto a range, also reversed', () => {
    const scale = createScale('linear', [0, 10], [100, 200]);
    expect(scale.map(0)).toBe(100);
    expect(scale.map(5)).toBe(150);
    expect(createScale('linear', [0, 10], [200, 100]).map(2.5)).toBe(175);
  });

  it('maps a log domain by decades', () => {
    const scale = createScale('log', [1, 1000], [0, 300]);
    expect(scale.map(10)).toBeCloseTo(100, 9);
    expect(scale.map(100)).toBeCloseTo(200, 9);
  });

  it('does not divide by zero for an empty domain', () => {
    expect(Number.isFinite(createScale('linear', [3, 3], [0, 100]).map(3))).toBe(true);
  });
});

describe('nice numbers', () => {
  it('picks steps of 1, 2, 5 or 10 times a power of ten', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(100, 10)).toBe(10);
    expect(niceStep(7, 7)).toBe(1);
    expect(niceStep(0.34, 4)).toBeCloseTo(0.1, 12);
    expect(niceStep(40, 5)).toBe(10);
  });

  it('widens a domain to nice bounds and pads a constant one', () => {
    expect(niceDomain(0.3, 9.4, 5)).toEqual([0, 10]);
    const [low, high] = niceDomain(5, 5, 5);
    expect(low).toBeLessThan(5);
    expect(high).toBeGreaterThan(5);
    const [zeroLow, zeroHigh] = niceDomain(0, 0, 5);
    expect(zeroLow).toBeLessThan(0);
    expect(zeroHigh).toBeGreaterThan(0);
  });

  it('produces ticks inside the domain that include nice multiples', () => {
    expect(linearTickValues([0, 10], 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(linearTickValues([-60, 60], 8)).toEqual([-60, -40, -20, 0, 20, 40, 60]);
    expect(logTickValues([1, 1000])).toEqual([1, 10, 100, 1000]);
    expect(logTickValues([2, 5])).toEqual([]);
  });

  it('keeps every tick inside the domain for any domain', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 1000, noNaN: true }),
        (low, span) => {
          const domain = niceDomain(low, low + span, 6);
          const ticks = linearTickValues(domain, 6);
          expect(ticks.length).toBeGreaterThan(1);
          ticks.forEach((tick) => {
            expect(tick).toBeGreaterThanOrEqual(domain[0] - 1e-9);
            expect(tick).toBeLessThanOrEqual(domain[1] + 1e-9);
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('formats ticks with the decimals of the step', () => {
    expect(formatTick(0, 1)).toBe('0');
    expect(formatTick(20, 10)).toBe('20');
    expect(formatTick(0.5, 0.1)).toBe('0.5');
    expect(formatTick(0.25, 0.05)).toBe('0.25');
    expect(formatTick(1e6, 1)).toBe('1e6');
    expect(formatTick(1e-4, 1)).toBe('1e-4');
  });

  it('builds positioned ticks with labels', () => {
    const ticks = buildTicks(createScale('linear', [0, 10], [0, 100]), 5);
    expect(ticks.map((tick) => tick.label)).toEqual(['0', '2', '4', '6', '8', '10']);
    expect(ticks[1]?.position).toBe(20);
    const logTicks = buildTicks(createScale('log', [1, 100], [0, 200]), 5);
    expect(logTicks.map((tick) => tick.label)).toEqual(['1', '10', '100']);
  });
});
