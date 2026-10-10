export const CONTOUR_HALF_WIDTH_PIXELS = 1.1;
export const CONTOUR_EMPHASIS_GAIN = 0.5;
export const CONTOUR_BASE_GAIN = 0.6;
export const CASING_ALPHA = 0.6;
export const CASING_EXTRA_PIXELS = 1.5;

export function contourLineWidth(emphasised: boolean): number {
  const gain = CONTOUR_BASE_GAIN + (emphasised ? CONTOUR_EMPHASIS_GAIN : 0);
  return 2 * CONTOUR_HALF_WIDTH_PIXELS * gain;
}
