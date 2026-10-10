export interface ContourSegments {
  readonly level: number;
  readonly coordinates: Float32Array;
}

function crossing(a: number, b: number, level: number): number {
  const span = b - a;
  return span === 0 ? 0.5 : (level - a) / span;
}

export function contourSegments(
  scalars: Float32Array,
  nx: number,
  nz: number,
  level: number,
): ContourSegments {
  const output: number[] = [];
  const at = (ix: number, iz: number): number => scalars[ix + nx * iz] ?? 0;
  for (let iz = 0; iz < nz - 1; iz += 1) {
    for (let ix = 0; ix < nx - 1; ix += 1) {
      const v00 = at(ix, iz);
      const v10 = at(ix + 1, iz);
      const v11 = at(ix + 1, iz + 1);
      const v01 = at(ix, iz + 1);
      const code =
        (v00 >= level ? 1 : 0) |
        (v10 >= level ? 2 : 0) |
        (v11 >= level ? 4 : 0) |
        (v01 >= level ? 8 : 0);
      if (code === 0 || code === 15) {
        continue;
      }
      const south: [number, number] = [ix + crossing(v00, v10, level), iz];
      const east: [number, number] = [ix + 1, iz + crossing(v10, v11, level)];
      const north: [number, number] = [ix + crossing(v01, v11, level), iz + 1];
      const west: [number, number] = [ix, iz + crossing(v00, v01, level)];
      const centerHigh = (v00 + v10 + v11 + v01) / 4 >= level;
      const pairs = segmentPairs(code, centerHigh, { south, east, north, west });
      for (const [from, to] of pairs) {
        output.push(from[0], from[1], to[0], to[1]);
      }
    }
  }
  return { level, coordinates: Float32Array.from(output) };
}

type Point = [number, number];

interface CellEdges {
  readonly south: Point;
  readonly east: Point;
  readonly north: Point;
  readonly west: Point;
}

function segmentPairs(code: number, centerHigh: boolean, edges: CellEdges): [Point, Point][] {
  const { south, east, north, west } = edges;
  switch (code) {
    case 1:
    case 14:
      return [[west, south]];
    case 2:
    case 13:
      return [[south, east]];
    case 3:
    case 12:
      return [[west, east]];
    case 4:
    case 11:
      return [[east, north]];
    case 6:
    case 9:
      return [[south, north]];
    case 7:
    case 8:
      return [[north, west]];
    case 5:
      return centerHigh
        ? [
            [west, north],
            [south, east],
          ]
        : [
            [west, south],
            [east, north],
          ];
    case 10:
      return centerHigh
        ? [
            [west, south],
            [east, north],
          ]
        : [
            [west, north],
            [south, east],
          ];
    default:
      return [];
  }
}

export function segmentCount(contour: ContourSegments): number {
  return contour.coordinates.length / 4;
}
