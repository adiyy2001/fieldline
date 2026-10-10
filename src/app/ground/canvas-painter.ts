import type { ContourLevel } from '../../core/exposure/contour-levels';
import { DASH_PATTERNS } from '../../core/exposure/contour-levels';
import type { FieldQuantity } from '../../core/exposure/levels';
import {
  CASING_ALPHA,
  CASING_EXTRA_PIXELS,
  contourLineWidth,
} from '../../core/heatmap/contour-style';
import { chainSegments, contourSegments } from '../../core/heatmap/contours';
import { paintScalarRaster } from '../../core/heatmap/pixels';
import { scalarGrid } from '../../core/heatmap/scalar';
import type { DisplayMode } from '../../core/model/settings';

export type CanvasSurface = Pick<
  CanvasRenderingContext2D,
  | 'createImageData'
  | 'putImageData'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'setLineDash'
  | 'lineWidth'
  | 'lineJoin'
  | 'lineCap'
  | 'strokeStyle'
>;

export interface CanvasPaint {
  readonly values: Float32Array;
  readonly nx: number;
  readonly nz: number;
  readonly quantity: FieldQuantity;
  readonly mode: DisplayMode;
  readonly phaseRadians: number;
  readonly maximum: number;
  readonly levels: readonly ContourLevel[];
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export function paintHeatmap(surface: CanvasSurface, paint: CanvasPaint): Float32Array {
  const scalars = scalarGrid(paint.values, {
    quantity: paint.quantity,
    mode: paint.mode,
    phaseRadians: paint.phaseRadians,
  });
  const image = surface.createImageData(paint.width, paint.height);
  image.data.set(
    paintScalarRaster({
      scalars,
      nx: paint.nx,
      nz: paint.nz,
      width: paint.width,
      height: paint.height,
      maximum: paint.maximum,
    }),
  );
  surface.putImageData(image, 0, 0);
  drawContours(surface, scalars, paint);
  return scalars;
}

function drawContours(surface: CanvasSurface, scalars: Float32Array, paint: CanvasPaint): void {
  const { nx, nz, width, height, pixelRatio } = paint;
  const toPixel = (ix: number, iz: number): [number, number] => [
    (iz / (nz - 1)) * (width - 1),
    (1 - ix / (nx - 1)) * (height - 1),
  ];
  surface.lineJoin = 'round';
  surface.lineCap = 'butt';
  for (const level of paint.levels) {
    const chains = chainSegments(contourSegments(scalars, nx, nz, level.value));
    const dash = (DASH_PATTERNS[level.dashIndex] ?? []).map((length) => length * pixelRatio);
    const strokeWidth = contourLineWidth(level.emphasised) * pixelRatio;
    const passes: readonly (readonly [string, number])[] = [
      [`rgba(0, 0, 0, ${String(CASING_ALPHA)})`, strokeWidth + CASING_EXTRA_PIXELS * pixelRatio],
      ['#ffffff', strokeWidth],
    ];
    for (const [color, lineWidth] of passes) {
      surface.strokeStyle = color;
      surface.lineWidth = lineWidth;
      surface.setLineDash(dash);
      for (const chain of chains) {
        surface.beginPath();
        for (let index = 0; index < chain.length; index += 2) {
          const [x, y] = toPixel(chain[index] ?? 0, chain[index + 1] ?? 0);
          if (index === 0) {
            surface.moveTo(x, y);
          } else {
            surface.lineTo(x, y);
          }
        }
        surface.stroke();
      }
    }
  }
  surface.setLineDash([]);
}
