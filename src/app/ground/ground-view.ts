import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { quantityUnit } from '../../core/exposure/levels';
import {
  axisTicks,
  createProjection,
  footprint,
  legendMaximum,
  legendTicks,
  plotBox,
  probeFromPixel,
} from '../../core/heatmap/ground-layout';
import { paintScalarRaster } from '../../core/heatmap/pixels';
import { scalarGrid } from '../../core/heatmap/scalar';
import { formatNumber } from '../../core/exposure/contour-levels';
import type { HeatmapUniforms } from '../../gpu/heatmap-params';
import { type HeatmapRenderer, createHeatmapRenderer } from '../../gpu/heatmap-renderer';
import { FieldBackends } from '../services/field-backends';
import type { FieldFrame } from '../services/field-pipeline';
import {
  HeatmapCapture,
  type HeatmapCaptureRequest,
  type HeatmapPixels,
} from '../services/heatmap-capture';
import { FieldStore } from '../state/field-store';
import { paintHeatmap } from './canvas-painter';
import {
  extentOf,
  groundSummary,
  legendEntries,
  legendGradient,
  levelLabels,
  readProbe,
} from './ground-model';

const MAXIMUM_CPU_CANVAS_WIDTH = 900;
const MAXIMUM_GPU_CANVAS_WIDTH = 2400;
const PROBE_KEY_STEPS = 64;
const PROBE_KEY_FAST_FACTOR = 4;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Component({
  selector: 'fl-ground-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ground-view.html',
  styleUrl: './ground-view.css',
})
export class GroundView {
  protected readonly store = inject(FieldStore);
  protected readonly backends = inject(FieldBackends);
  private readonly registry = inject(HeatmapCapture);
  private readonly destroyRef = inject(DestroyRef);

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly gpuCanvas = viewChild<ElementRef<HTMLCanvasElement>>('gpuCanvas');
  private readonly cpuCanvas = viewChild<ElementRef<HTMLCanvasElement>>('cpuCanvas');
  private readonly renderer = signal<HeatmapRenderer | null>(null);
  private uploaded: { renderer: HeatmapRenderer; frame: FieldFrame } | null = null;

  protected readonly size = signal({ width: 900, height: 380 });
  protected readonly plot = computed(() => plotBox(this.size().width, this.size().height));
  protected readonly gradient = legendGradient();

  protected readonly quantity = computed(() => this.store.settings().quantity);
  protected readonly mode = computed(() => this.store.settings().mode);
  protected readonly unit = computed(() => quantityUnit(this.quantity()));
  protected readonly extent = computed(() => {
    const frame = this.store.frame();
    return frame === null ? null : extentOf(frame);
  });
  protected readonly projection = computed(() => {
    const extent = this.extent();
    return extent === null ? null : createProjection(extent, this.plot());
  });
  protected readonly legendMax = computed(() => {
    const frame = this.store.frame();
    return frame === null ? 1 : legendMaximum(frame.maxima[this.quantity()], this.mode());
  });
  protected readonly legendTickList = computed(() => legendTicks(this.legendMax()));
  protected readonly legend = computed(() => legendEntries(this.store.levels()));
  protected readonly axes = computed(() => {
    const extent = this.extent();
    return extent === null ? null : axisTicks(extent, this.plot());
  });
  protected readonly marks = computed(() => {
    const frame = this.store.frame();
    const projection = this.projection();
    if (frame === null || projection === null) {
      return null;
    }
    const layout = footprint(frame.geometry);
    return {
      lines: layout.lines.map((line) => ({
        y: projection.xToPixel(line.x),
        x1: projection.zToPixel(line.zStart),
        x2: projection.zToPixel(line.zEnd),
        role: line.role,
      })),
      towers: layout.towers.map((tower) => {
        const ends = [projection.xToPixel(tower.xStart), projection.xToPixel(tower.xEnd)];
        return {
          x: projection.zToPixel(tower.z),
          y1: Math.min(...ends),
          y2: Math.max(...ends),
        };
      }),
    };
  });
  protected readonly summary = computed(() => {
    const frame = this.store.frame();
    return frame === null ? null : groundSummary(frame, this.store.settings(), this.store.levels());
  });
  protected readonly labels = computed(() => {
    const frame = this.store.frame();
    const projection = this.projection();
    const summary = this.summary();
    if (frame === null || projection === null || summary === null || this.mode() !== 'rms') {
      return [];
    }
    return levelLabels(summary.summary, extentOf(frame), frame.referenceMidZ).map((label) => ({
      text: label.text,
      x: projection.zToPixel(label.z) + 6,
      y: projection.xToPixel(label.x) - 4,
    }));
  });
  protected readonly probe = computed(() => {
    const frame = this.store.frame();
    return frame === null ? null : readProbe(frame, this.store.settings(), this.store.probe());
  });
  protected readonly probeMarker = computed(() => {
    const projection = this.projection();
    const probe = this.probe();
    return projection === null || probe === null
      ? null
      : { x: projection.zToPixel(probe.z), y: projection.xToPixel(probe.x) };
  });
  protected readonly caption = computed(() => {
    const frame = this.store.frame();
    if (frame === null) {
      return 'Solving the line';
    }
    const engine =
      frame.backend === 'gpu'
        ? 'WebGPU'
        : frame.backend === 'cross-section'
          ? '2D cross-section on the CPU'
          : 'CPU fallback';
    const quality = frame.quality === 'draft' ? ', draft quality' : '';
    return `${engine}, ${String(frame.grid.nx)} by ${String(frame.grid.nz)} grid at ${formatNumber(frame.grid.height)} m, ${formatNumber(frame.timings.totalMilliseconds)} ms${quality}`;
  });
  protected readonly scaleLabel = computed(
    () =>
      `${this.quantity() === 'electric' ? 'Electric field' : 'Magnetic flux density'}, ${this.mode() === 'rms' ? 'rms' : 'instantaneous'}, in ${this.unit()}`,
  );

  constructor() {
    afterNextRender(() => {
      const element = this.stage().nativeElement;
      const measure = (width: number, height: number): void => {
        this.size.set({ width: Math.round(width), height: Math.round(height) });
      };
      measure(element.clientWidth, element.clientHeight);
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry !== undefined) {
          measure(entry.contentRect.width, entry.contentRect.height);
        }
      });
      observer.observe(element);
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
      });
    });

    effect((onCleanup) => {
      const canvas = this.gpuCanvas()?.nativeElement;
      if (canvas === undefined) {
        return;
      }
      let disposed = false;
      let created: HeatmapRenderer | null = null;
      void this.backends.device().then((ready) => {
        if (disposed || ready === null) {
          return;
        }
        try {
          created = createHeatmapRenderer(ready, canvas);
          this.renderer.set(created);
        } catch (error) {
          this.backends.demote(describeError(error));
        }
      });
      onCleanup(() => {
        disposed = true;
        this.renderer.set(null);
        created?.dispose();
      });
    });

    effect(() => {
      const renderer = this.renderer();
      const canvas = this.gpuCanvas()?.nativeElement;
      const frame = this.store.frame();
      const settings = this.store.settings();
      const levels = this.store.levels();
      const maximum = this.legendMax();
      const plot = this.plot();
      if (renderer === null || canvas === undefined || frame === null) {
        return;
      }
      try {
        const width = Math.min(
          MAXIMUM_GPU_CANVAS_WIDTH,
          Math.round(plot.width * window.devicePixelRatio),
        );
        const height = Math.round((plot.height / plot.width) * width);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        if (this.uploaded?.renderer !== renderer || this.uploaded.frame !== frame) {
          renderer.setField(frame.source);
          this.uploaded = { renderer, frame };
        }
        renderer.draw({
          nx: frame.grid.nx,
          nz: frame.grid.nz,
          quantity: settings.quantity,
          mode: settings.mode,
          phaseRadians: (settings.phaseDegrees * Math.PI) / 180,
          maximum,
          width,
          height,
          levels,
        });
      } catch (error) {
        this.backends.demote(describeError(error));
      }
    });

    effect(() => {
      const canvas = this.cpuCanvas()?.nativeElement;
      const frame = this.store.frame();
      const settings = this.store.settings();
      const levels = this.store.levels();
      const maximum = this.legendMax();
      const plot = this.plot();
      if (canvas === undefined || frame === null) {
        return;
      }
      const context = canvas.getContext('2d');
      if (context === null) {
        return;
      }
      const width = Math.min(
        MAXIMUM_CPU_CANVAS_WIDTH,
        Math.round(plot.width * window.devicePixelRatio),
      );
      const height = Math.round((plot.height / plot.width) * width);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      paintHeatmap(context, {
        values: frame.values,
        nx: frame.grid.nx,
        nz: frame.grid.nz,
        quantity: settings.quantity,
        mode: settings.mode,
        phaseRadians: (settings.phaseDegrees * Math.PI) / 180,
        maximum,
        levels,
        width,
        height,
        pixelRatio: width / plot.width,
      });
    });

    const unregister = this.registry.register((request) => this.captureNow(request));
    this.destroyRef.onDestroy(unregister);
  }

  protected moveProbeFromPointer(event: PointerEvent): void {
    const projection = this.projection();
    const extent = this.extent();
    const target = event.currentTarget;
    if (projection === null || extent === null || !(target instanceof Element)) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const plot = this.plot();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const inside =
      x >= plot.left && x <= plot.left + plot.width && y >= plot.top && y <= plot.top + plot.height;
    if (inside) {
      this.store.setProbe(probeFromPixel(projection, extent, x, y));
    }
  }

  protected moveProbeFromKey(event: KeyboardEvent): void {
    const step = (event.shiftKey ? PROBE_KEY_FAST_FACTOR : 1) / PROBE_KEY_STEPS;
    const moves: Readonly<Record<string, readonly [number, number]>> = {
      ArrowUp: [step, 0],
      ArrowDown: [-step, 0],
      ArrowRight: [0, step],
      ArrowLeft: [0, -step],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      this.store.moveProbe(move[0], move[1]);
    }
  }

  private async captureNow(request: HeatmapCaptureRequest): Promise<HeatmapPixels> {
    const frame = this.store.frame();
    if (frame === null) {
      throw new Error('There is no field to capture');
    }
    const settings = this.store.settings();
    const phaseRadians = (settings.phaseDegrees * Math.PI) / 180;
    const maximum = this.legendMax();
    const renderer = this.renderer();
    if (renderer !== null && this.uploaded?.frame === frame) {
      const uniforms: HeatmapUniforms = {
        nx: frame.grid.nx,
        nz: frame.grid.nz,
        quantity: settings.quantity,
        mode: settings.mode,
        phaseRadians,
        maximum,
        width: request.width,
        height: request.height,
        levels: request.contours === true ? this.store.levels() : [],
      };
      const pixels = await renderer.capture(uniforms, request.width, request.height);
      return { width: request.width, height: request.height, pixels };
    }
    const scalars = scalarGrid(frame.values, {
      quantity: settings.quantity,
      mode: settings.mode,
      phaseRadians,
    });
    const painted = paintScalarRaster({
      scalars,
      nx: frame.grid.nx,
      nz: frame.grid.nz,
      width: request.width,
      height: request.height,
      maximum,
    });
    return {
      width: request.width,
      height: request.height,
      pixels: new Uint8Array(painted.buffer, painted.byteOffset, painted.byteLength),
    };
  }
}
