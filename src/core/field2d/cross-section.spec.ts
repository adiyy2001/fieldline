import { SHIELD_GROUP, crossSectionFromLine, wiresInGroup } from './cross-section';
import { fixtureFor } from '../testing/fixtures';

describe('cross section from a line', () => {
  it('has one equivalent wire per conductor with groups for the phases and -1 for shields', () => {
    const { section } = fixtureFor('horizontal');
    expect(section.wires).toHaveLength(5);
    expect(section.groupCount).toBe(3);
    expect(section.wires.map((wire) => wire.group)).toEqual([0, 1, 2, SHIELD_GROUP, SHIELD_GROUP]);
  });

  it('uses the mid-span height of each conductor', () => {
    const { section } = fixtureFor('horizontal');
    expect(section.wires[0]?.y).toBeCloseTo(20, 9);
    expect(section.wires[3]?.y).toBeCloseTo(37 - 9, 9);
  });

  it('places explicit subconductors around the bundle centre', () => {
    const { section } = fixtureFor('horizontal', {}, 'explicit');
    expect(section.wires).toHaveLength(3 * 3 + 2);
    expect(wiresInGroup(section, 0)).toBe(3);
    expect(wiresInGroup(section, SHIELD_GROUP)).toBe(2);
    expect(section.wires[0]?.radius).toBe(0.015);
  });

  it('keeps single conductors as one wire in explicit mode', () => {
    const { section } = fixtureFor('horizontal', { bundleCount: 1 }, 'explicit');
    expect(section.wires).toHaveLength(5);
  });

  it('builds six groups for the double circuit', () => {
    const { section } = fixtureFor('double-circuit');
    expect(section.groupCount).toBe(6);
    expect(section.wires).toHaveLength(8);
  });

  it('rejects a span that does not exist', () => {
    const { geometry } = fixtureFor('horizontal');
    expect(() =>
      crossSectionFromLine(geometry, { spanIndex: 7, bundleMode: 'equivalent' }),
    ).toThrow(RangeError);
  });
});
