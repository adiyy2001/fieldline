export const CORNER_COUNT = 8;
export const EDGE_COUNT = 12;
export const CASE_COUNT = 256;

export interface CubeEdge {
  readonly from: number;
  readonly to: number;
  readonly axis: number;
}

export interface CubeFace {
  readonly axis: number;
  readonly side: 0 | 1;
  readonly corners: readonly number[];
  readonly edges: readonly number[];
}

export interface CaseTable {
  readonly maxTriangles: number;
  readonly triangleCounts: Uint8Array;
  readonly edgeTriples: Int8Array;
}

export function cornerOffset(corner: number): readonly [number, number, number] {
  return [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
}

function buildEdges(): readonly CubeEdge[] {
  const edges: CubeEdge[] = [];
  for (let corner = 0; corner < CORNER_COUNT; corner += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      if (((corner >> axis) & 1) === 0) {
        edges.push({ from: corner, to: corner | (1 << axis), axis });
      }
    }
  }
  return edges;
}

export const CUBE_EDGES: readonly CubeEdge[] = buildEdges();

function buildFaces(): readonly CubeFace[] {
  const faces: CubeFace[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    for (const side of [0, 1] as const) {
      const corners: number[] = [];
      for (let corner = 0; corner < CORNER_COUNT; corner += 1) {
        if (((corner >> axis) & 1) === side) {
          corners.push(corner);
        }
      }
      const edges = CUBE_EDGES.flatMap((edge, index) =>
        corners.includes(edge.from) && corners.includes(edge.to) ? [index] : [],
      );
      faces.push({ axis, side, corners, edges });
    }
  }
  return faces;
}

export const CUBE_FACES: readonly CubeFace[] = buildFaces();

interface FaceSegment {
  readonly from: number;
  readonly to: number;
}

function facePlaneCoordinates(face: CubeFace, corner: number): readonly [number, number] {
  const offset = cornerOffset(corner);
  return [offset[(face.axis + 1) % 3] ?? 0, offset[(face.axis + 2) % 3] ?? 0];
}

function edgeMidpointOnFace(face: CubeFace, edgeIndex: number): readonly [number, number] {
  const edge = CUBE_EDGES[edgeIndex];
  if (edge === undefined) {
    return [0, 0];
  }
  const a = facePlaneCoordinates(face, edge.from);
  const b = facePlaneCoordinates(face, edge.to);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function isInside(mask: number, corner: number): boolean {
  return ((mask >> corner) & 1) === 1;
}

function crossedEdgesOfFace(face: CubeFace, mask: number): readonly number[] {
  return face.edges.filter((edgeIndex) => {
    const edge = CUBE_EDGES[edgeIndex];
    return edge !== undefined && isInside(mask, edge.from) !== isInside(mask, edge.to);
  });
}

function insideReference(
  face: CubeFace,
  mask: number,
  first: number,
  second: number,
): readonly [number, number] {
  const firstEdge = CUBE_EDGES[first];
  const secondEdge = CUBE_EDGES[second];
  const insideCorners = face.corners.filter((corner) => isInside(mask, corner));
  if (firstEdge === undefined || secondEdge === undefined) {
    return [0, 0];
  }
  const shared = [firstEdge.from, firstEdge.to].filter(
    (corner) => (corner === secondEdge.from || corner === secondEdge.to) && isInside(mask, corner),
  );
  const chosen =
    insideCorners.length === 2 && crossedEdgesOfFace(face, mask).length === 4
      ? shared
      : insideCorners;
  const points = chosen.map((corner) => facePlaneCoordinates(face, corner));
  const sum = points.reduce<[number, number]>(
    (total, point) => [total[0] + point[0], total[1] + point[1]],
    [0, 0],
  );
  return [sum[0] / Math.max(1, points.length), sum[1] / Math.max(1, points.length)];
}

function orientSegment(face: CubeFace, mask: number, first: number, second: number): FaceSegment {
  const start = edgeMidpointOnFace(face, first);
  const end = edgeMidpointOnFace(face, second);
  const inside = insideReference(face, mask, first, second);
  const cross =
    (end[0] - start[0]) * (inside[1] - start[1]) - (end[1] - start[1]) * (inside[0] - start[0]);
  const insideOnLeft = face.side === 1 ? cross < 0 : cross > 0;
  return insideOnLeft ? { from: first, to: second } : { from: second, to: first };
}

export function faceSegments(face: CubeFace, mask: number): readonly FaceSegment[] {
  const crossed = crossedEdgesOfFace(face, mask);
  if (crossed.length === 2) {
    const [first, second] = crossed;
    return first === undefined || second === undefined
      ? []
      : [orientSegment(face, mask, first, second)];
  }
  if (crossed.length === 4) {
    const segments: FaceSegment[] = [];
    for (const corner of face.corners.filter((candidate) => isInside(mask, candidate))) {
      const adjacent = crossed.filter((edgeIndex) => {
        const edge = CUBE_EDGES[edgeIndex];
        return edge !== undefined && (edge.from === corner || edge.to === corner);
      });
      const [first, second] = adjacent;
      if (first !== undefined && second !== undefined) {
        segments.push(orientSegment(face, mask, first, second));
      }
    }
    return segments;
  }
  return [];
}

export function surfaceCycles(mask: number): readonly (readonly number[])[] {
  const next = new Map<number, number>();
  for (const face of CUBE_FACES) {
    for (const segment of faceSegments(face, mask)) {
      next.set(segment.from, segment.to);
    }
  }
  const visited = new Set<number>();
  const cycles: number[][] = [];
  for (const start of [...next.keys()].sort((a, b) => a - b)) {
    if (visited.has(start)) {
      continue;
    }
    const cycle: number[] = [];
    let current: number | undefined = start;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      cycle.push(current);
      current = next.get(current);
    }
    cycles.push(cycle);
  }
  return cycles;
}

export function triangulateCycle(
  cycle: readonly number[],
): readonly (readonly [number, number, number])[] {
  const [anchor, ...rest] = cycle;
  if (anchor === undefined) {
    return [];
  }
  const triangles: [number, number, number][] = [];
  for (let index = 0; index + 1 < rest.length; index += 1) {
    const second = rest[index];
    const third = rest[index + 1];
    if (second !== undefined && third !== undefined) {
      triangles.push([anchor, second, third]);
    }
  }
  return triangles;
}

export function trianglesOfCase(mask: number): readonly (readonly [number, number, number])[] {
  return surfaceCycles(mask).flatMap((cycle) => triangulateCycle(cycle));
}

export function crossedEdgesOfCase(mask: number): readonly number[] {
  return CUBE_EDGES.flatMap((edge, index) =>
    isInside(mask, edge.from) !== isInside(mask, edge.to) ? [index] : [],
  );
}

let cachedTable: CaseTable | null = null;

export function buildCaseTable(): CaseTable {
  const perCase = Array.from({ length: CASE_COUNT }, (_, mask) => trianglesOfCase(mask));
  const maxTriangles = perCase.reduce((best, triangles) => Math.max(best, triangles.length), 0);
  const triangleCounts = new Uint8Array(CASE_COUNT);
  const edgeTriples = new Int8Array(CASE_COUNT * maxTriangles * 3).fill(-1);
  perCase.forEach((triangles, mask) => {
    triangleCounts[mask] = triangles.length;
    triangles.forEach((triangle, index) => {
      edgeTriples.set(triangle, (mask * maxTriangles + index) * 3);
    });
  });
  return { maxTriangles, triangleCounts, edgeTriples };
}

export function caseTable(): CaseTable {
  cachedTable ??= buildCaseTable();
  return cachedTable;
}
