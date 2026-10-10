import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  type ChartSpec,
  buildChart,
  nearestPoint,
  pixelToX,
  snapToStep,
  xToPixel,
} from '../../core/plot/chart-model';

const FALLBACK_WIDTH = 720;
const NARROW_WIDTH = 520;
const WIDE_HEIGHT = 300;
const NARROW_HEIGHT = 260;
const FAST_STEPS = 10;

let nextChartId = 0;

export function nextCursor(
  key: string,
  shift: boolean,
  current: number,
  domain: readonly [number, number],
  step: number,
): number | null {
  const stride = shift ? FAST_STEPS * step : step;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return Math.min(domain[1], current + stride);
    case 'ArrowLeft':
    case 'ArrowDown':
      return Math.max(domain[0], current - stride);
    case 'PageUp':
      return Math.min(domain[1], current + FAST_STEPS * step);
    case 'PageDown':
      return Math.max(domain[0], current - FAST_STEPS * step);
    case 'Home':
      return domain[0];
    case 'End':
      return domain[1];
    default:
      return null;
  }
}

@Component({
  selector: 'fl-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './line-chart.html',
  styleUrl: './line-chart.css',
})
export class LineChart {
  readonly spec = input.required<ChartSpec>();
  readonly cursor = input<number | null>(null);
  readonly cursorStep = input(0.5);
  readonly cursorLabel = input('');
  readonly cursorText = input('');
  readonly focusable = input(false);
  readonly cursorChange = output<number>();

  private readonly serial = nextChartId++;
  protected readonly titleId = `fl-chart-title-${String(this.serial)}`;
  protected readonly descriptionId = `fl-chart-description-${String(this.serial)}`;
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private readonly width = signal(FALLBACK_WIDTH);

  protected readonly model = computed(() => {
    const width = this.width();
    return buildChart({
      ...this.spec(),
      width,
      height: width < NARROW_WIDTH ? NARROW_HEIGHT : WIDE_HEIGHT,
      legend: false,
    });
  });

  protected readonly cursorPixel = computed(() => {
    const cursor = this.cursor();
    return cursor === null ? null : xToPixel(this.model(), cursor);
  });

  protected readonly cursorDots = computed(() => {
    const pixel = this.cursorPixel();
    if (pixel === null) {
      return [];
    }
    return this.model().series.flatMap((series) => {
      const point = series.markerPoints.length > 1 ? nearestPoint(series, pixel) : null;
      return point === null ? [] : [{ id: series.id, colorIndex: series.colorIndex, ...point }];
    });
  });

  protected readonly controlBox = computed(() => {
    const { plot, width, height } = this.model();
    return {
      left: (plot.left / width) * 100,
      top: (plot.top / height) * 100,
      width: (plot.width / width) * 100,
      height: (plot.height / height) * 100,
    };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.frame().nativeElement;
      const measure = (): void => {
        const measured = Math.floor(element.getBoundingClientRect().width);
        if (measured > 0) {
          this.width.set(measured);
        }
      };
      measure();
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      destroyRef.onDestroy(() => {
        observer.disconnect();
      });
    });
  }

  protected pointerMoved(event: PointerEvent): void {
    const rect = this.frame().nativeElement.getBoundingClientRect();
    const model = this.model();
    const raw = pixelToX(model, event.clientX - rect.left);
    this.cursorChange.emit(snapToStep(raw, model.xDomain[0], this.cursorStep()));
  }

  protected keyPressed(event: KeyboardEvent): void {
    const model = this.model();
    const current = this.cursor() ?? (model.xDomain[0] + model.xDomain[1]) / 2;
    const next = nextCursor(event.key, event.shiftKey, current, model.xDomain, this.cursorStep());
    if (next !== null) {
      event.preventDefault();
      this.cursorChange.emit(next);
    }
  }
}
