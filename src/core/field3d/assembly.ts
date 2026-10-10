import { segmentMidpoint, type SegmentSet } from './segment-set';
import { createTerms, segmentPotentialWithImage } from './segment-kernel';

export function assemblePotentialMatrix(set: SegmentSet): Float64Array {
  const size = set.count;
  const matrix = new Float64Array(size * size);
  const terms = createTerms();
  for (let row = 0; row < size; row += 1) {
    const point = segmentMidpoint(set, row);
    for (let column = 0; column < size; column += 1) {
      matrix[row * size + column] = segmentPotentialWithImage(
        set.data,
        column,
        point.x,
        point.y,
        point.z,
        terms,
      );
    }
  }
  return matrix;
}
