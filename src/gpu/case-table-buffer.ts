import { CUBE_EDGES, CASE_COUNT, caseTable } from '../core/isosurface/case-table';

export interface GpuCaseTable {
  readonly data: Int32Array;
  readonly caseOffset: number;
  readonly caseStride: number;
}

export function gpuCaseTable(): GpuCaseTable {
  const table = caseTable();
  const caseOffset = CUBE_EDGES.length * 2;
  const caseStride = 1 + table.maxTriangles * 3;
  const data = new Int32Array(caseOffset + CASE_COUNT * caseStride);
  CUBE_EDGES.forEach((edge, index) => {
    data[index * 2] = edge.from;
    data[index * 2 + 1] = edge.to;
  });
  for (let mask = 0; mask < CASE_COUNT; mask += 1) {
    const entry = caseOffset + mask * caseStride;
    data[entry] = table.triangleCounts[mask] ?? 0;
    for (let slot = 0; slot < table.maxTriangles * 3; slot += 1) {
      data[entry + 1 + slot] = table.edgeTriples[mask * table.maxTriangles * 3 + slot] ?? -1;
    }
  }
  return { data, caseOffset, caseStride };
}
