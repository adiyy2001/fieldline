import { defaultParameters, lineGeometryFromParameters } from '../model/parameters';
import {
  RUN_OUT_SPAN_INDEX,
  defaultDiscretization,
  discretizeConductor,
  discretizeLine,
  referenceSpan,
  towerPositions,
} from './discretize';
import { conductorHeightAt, midSpanHeight } from './line-geometry';

const geometry = lineGeometryFromParameters(defaultParameters('horizontal'));
const options = defaultDiscretization(12);

describe('discretization of a line', () => {
  it('cuts every conductor into 12 segments per span plus three run-outs per side', () => {
    const segments = discretizeLine(geometry, options);
    expect(segments).toHaveLength(5 * (3 * 12 + 6));
    const perConductor = new Map<number, number>();
    segments.forEach((segment) =>
      perConductor.set(segment.conductor, (perConductor.get(segment.conductor) ?? 0) + 1),
    );
    expect([...perConductor.values()]).toEqual([42, 42, 42, 42, 42]);
  });

  it('gives the double circuit tower 336 unknowns at the default size', () => {
    const tower = lineGeometryFromParameters(defaultParameters('double-circuit'));
    expect(discretizeLine(tower, options)).toHaveLength(336);
  });

  it('leaves out the run-outs when asked', () => {
    const segments = discretizeLine(geometry, { segmentsPerSpan: 6, runOuts: false });
    expect(segments).toHaveLength(5 * 18);
    expect(segments.every((segment) => segment.spanIndex >= 0)).toBe(true);
  });

  it('joins the segments of a conductor end to start in the direction of +z', () => {
    for (let conductor = 0; conductor < geometry.conductors.length; conductor += 1) {
      const segments = discretizeConductor(geometry, conductor, options);
      segments.forEach((segment, index) => {
        expect(segment.end.z).toBeGreaterThan(segment.start.z);
        const next = segments[index + 1];
        if (next !== undefined) {
          expect(next.start).toEqual(segment.end);
        }
      });
    }
  });

  it('puts the end points on the catenary and the attachments at the tower height', () => {
    const conductor = geometry.conductors[0];
    const span = geometry.spans[1];
    if (conductor === undefined || span === undefined) {
      throw new Error('missing geometry');
    }
    const segments = discretizeConductor(geometry, 0, options).filter(
      (segment) => segment.spanIndex === 1,
    );
    expect(segments[0]?.start.y).toBeCloseTo(conductor.attachmentHeight, 12);
    expect(segments.at(-1)?.end.y).toBeCloseTo(conductor.attachmentHeight, 12);
    segments.forEach((segment) => {
      const local = segment.start.z - 300;
      expect(segment.start.y).toBeCloseTo(conductorHeightAt(conductor, span, local), 12);
    });
    expect(segments[6]?.start.y).toBeCloseTo(midSpanHeight(conductor, span), 12);
  });

  it('continues with horizontal run-outs of 0.5, 1 and 2 spans at the attachment height', () => {
    const conductor = geometry.conductors[1];
    const segments = discretizeConductor(geometry, 1, options);
    const before = segments.slice(0, 3);
    const after = segments.slice(-3);
    expect(before.map((s) => s.end.z - s.start.z)).toEqual([600, 300, 150]);
    expect(after.map((s) => s.end.z - s.start.z)).toEqual([150, 300, 600]);
    expect(before[0]?.start.z).toBe(-1050);
    expect(after[2]?.end.z).toBe(1950);
    [...before, ...after].forEach((segment) => {
      expect(segment.start.y).toBe(conductor?.attachmentHeight);
      expect(segment.end.y).toBe(conductor?.attachmentHeight);
      expect(segment.spanIndex).toBe(RUN_OUT_SPAN_INDEX);
    });
  });

  it('scales the run-outs with the adjacent span', () => {
    const uneven = lineGeometryFromParameters({
      ...defaultParameters('horizontal'),
      spanLengths: [200, 300, 400],
    });
    const segments = discretizeConductor(uneven, 0, options);
    expect(segments[0]?.start.z).toBe(-700);
    expect(segments.at(-1)?.end.z).toBe(900 + 1400);
  });

  it('labels phase conductors with their index and shield wires with the shield group', () => {
    const groups = discretizeLine(geometry, options).map((segment) => segment.group);
    expect(new Set(groups)).toEqual(new Set([0, 1, 2, -1]));
  });

  it('uses the equivalent bundle radius as the segment radius', () => {
    const segment = discretizeConductor(geometry, 0, options)[20];
    expect(segment?.radius).toBeCloseTo(0.1342, 3);
  });

  it('rejects a segment count that is not a positive integer', () => {
    expect(() => discretizeLine(geometry, { segmentsPerSpan: 0, runOuts: true })).toThrow(
      RangeError,
    );
    expect(() => discretizeLine(geometry, { segmentsPerSpan: 2.5, runOuts: true })).toThrow(
      RangeError,
    );
    expect(() => discretizeConductor(geometry, 9, options)).toThrow('no conductor 9');
  });
});

describe('spans and the reference span', () => {
  it('places the towers at the cumulative span lengths', () => {
    expect(towerPositions(geometry)).toEqual([0, 300, 600, 900]);
  });

  it('takes the middle span of three as the reference', () => {
    expect(referenceSpan(geometry)).toEqual({ index: 1, startZ: 300, length: 300, midZ: 450 });
  });

  it('takes the first span of two', () => {
    const two = lineGeometryFromParameters({
      ...defaultParameters('horizontal'),
      spanLengths: [250, 350],
    });
    expect(referenceSpan(two)).toEqual({ index: 0, startZ: 0, length: 250, midZ: 125 });
  });
});
