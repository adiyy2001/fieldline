import { describe, expect, it } from 'vitest';
import type { ContourLevel } from '../../core/exposure/contour-levels';
import { type CanvasPaint, type CanvasSurface, paintHeatmap } from './canvas-painter';

interface Recorded {
  readonly image: { data: Uint8ClampedArray; width: number; height: number } | null;
  readonly strokes: { color: string; width: number; dash: number[]; points: number }[];
}

function recorder(): { surface: CanvasSurface; recorded: Recorded } {
  const strokes: Recorded['strokes'] = [];
  let image: Recorded['image'] = null;
  let points = 0;
  let dash: number[] = [];
  const state = { strokeStyle: '' };
  const surface = {
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value;
    },
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: (data: Recorded['image']) => {
      image = data;
    },
    beginPath: () => {
      points = 0;
    },
    moveTo: () => {
      points += 1;
    },
    lineTo: () => {
      points += 1;
    },
    setLineDash: (segments: number[]) => {
      dash = segments;
    },
    stroke: () => {
      strokes.push({
        color: state.strokeStyle,
        width: surface.lineWidth,
        dash,
        points,
      });
    },
  } as unknown as CanvasSurface;
  return {
    surface,
    recorded: {
      get image() {
        return image;
      },
      strokes,
    },
  };
}

function point(electric: number): number[] {
  return [electric, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

function level(value: number, dashIndex: number, emphasised = false): ContourLevel {
  return {
    value,
    unit: 'kV/m',
    sources: ['test'],
    emphasised,
    dashIndex,
    text: `${String(value)} kV/m`,
  };
}

function paint(overrides: Partial<CanvasPaint> = {}): CanvasPaint {
  const nx = 5;
  const nz = 4;
  const values = Float32Array.from(
    Array.from({ length: nx * nz }, (_, index) => point(((index % nx) * 2000) / 1)).flat(),
  );
  return {
    values,
    nx,
    nz,
    quantity: 'electric',
    mode: 'rms',
    phaseRadians: 0,
    maximum: 8,
    levels: [],
    width: 40,
    height: 20,
    pixelRatio: 1,
    ...overrides,
  };
}

describe('the canvas heatmap painter', () => {
  it('fills every pixel opaque through the viridis table', () => {
    const { surface, recorded } = recorder();
    paintHeatmap(surface, paint());
    const data = recorded.image?.data ?? new Uint8ClampedArray(0);
    expect(data).toHaveLength(40 * 20 * 4);
    expect(data.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
    expect(recorded.strokes).toHaveLength(0);
  });

  it('puts low values at the bottom and high values at the top', () => {
    const { surface, recorded } = recorder();
    paintHeatmap(surface, paint());
    const data = recorded.image?.data ?? new Uint8ClampedArray(0);
    const top = data.slice(0, 3);
    const bottom = data.slice(19 * 40 * 4, 19 * 40 * 4 + 3);
    expect(Array.from(bottom)).not.toEqual(Array.from(top));
    expect(bottom[0] ?? 0).toBeLessThan(top[0] ?? 0);
  });

  it('strokes a casing and a white line for every contour chain', () => {
    const { surface, recorded } = recorder();
    paintHeatmap(surface, paint({ levels: [level(3, 0)] }));
    expect(recorded.strokes).toHaveLength(2);
    expect(recorded.strokes[0]?.color).toContain('rgba(0, 0, 0');
    expect(recorded.strokes[1]?.color).toBe('#ffffff');
    expect(recorded.strokes[0]?.width ?? 0).toBeGreaterThan(recorded.strokes[1]?.width ?? 0);
    expect(recorded.strokes[1]?.points).toBe(4);
  });

  it('uses the dash pattern of the level scaled by the pixel ratio', () => {
    const { surface, recorded } = recorder();
    paintHeatmap(surface, paint({ levels: [level(3, 1)], pixelRatio: 2 }));
    expect(recorded.strokes[1]?.dash).toEqual([28, 12]);
  });

  it('draws an emphasised level wider', () => {
    const { surface, recorded } = recorder();
    paintHeatmap(surface, paint({ levels: [level(3, 0), level(5, 0, true)] }));
    const whites = recorded.strokes.filter((stroke) => stroke.color === '#ffffff');
    expect(whites[1]?.width ?? 0).toBeGreaterThan(whites[0]?.width ?? 0);
  });

  it('draws nothing for a level outside the data range', () => {
    const { surface, recorded } = recorder();
    paintHeatmap(surface, paint({ levels: [level(500, 0)] }));
    expect(recorded.strokes).toHaveLength(0);
  });

  it('returns the scalar grid it painted', () => {
    const { surface } = recorder();
    const scalars = paintHeatmap(surface, paint());
    expect(scalars).toHaveLength(20);
    expect(scalars[1]).toBeCloseTo(2, 6);
  });
});
