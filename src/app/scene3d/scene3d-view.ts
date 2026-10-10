import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { formatNumber } from '../../core/exposure/contour-levels';
import { quantityUnit } from '../../core/exposure/levels';
import { LINE_COUNT_RANGE, STEP_COUNT_RANGE } from '../../core/fieldlines/types';
import {
  OPACITY_RANGE,
  THRESHOLD_RANGE,
  TRANSFER_PRESETS,
  type TransferPreset,
  buildTransferTable,
  bandEdges,
} from '../../core/volume/transfer-function';
import {
  describePose,
  dragMotion,
  keyboardMotion,
  pinchZoomFactor,
  wheelZoomFactor,
} from '../../gpu/camera';
import { boxCenter } from '../../gpu/scene-geometry';
import { displayMaximum } from '../../gpu/volume-params';
import { FieldBackends } from '../services/field-backends';
import { HeatmapCapture, type HeatmapPixels } from '../services/heatmap-capture';
import { FieldStore } from '../state/field-store';
import {
  type DrawCommand,
  type Preparation,
  type Scene3dEngine,
  createScene3dEngine,
} from './scene3d-engine';
import {
  type EndCounts,
  type Scene3dView,
  countEnds,
  isoLegend,
  isoLevelsFrom,
  isosurfaceSummary,
  lineGradient,
  linesSummary,
  peakOnGround,
  quantityName,
  scaleTicks,
  transferGradient,
  volumeSummary,
} from './scene3d-model';
import {
  RENDER_SCALE_LEVELS,
  createRenderScaleGovernor,
  effectiveScale,
  scaleLabel,
} from './render-scale';
import { Scene3dState } from './scene3d-state';
import type { FieldFrame } from '../services/field-pipeline';

const MAXIMUM_PIXELS_HARDWARE = 2_400_000;
const MAXIMUM_PIXELS_SOFTWARE = 400_000;
const TITLES: Readonly<Record<Scene3dView, string>> = {
  volume: 'Volume rendering',
  isosurface: 'Isosurfaces',
  lines: 'Field lines',
};

interface Prepared {
  readonly frame: FieldFrame;
  readonly preparation: Preparation;
}

interface Pointer {
  x: number;
  y: number;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function spread(first: Pointer, second: Pointer): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

@Component({
  selector: 'fl-scene3d-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scene3d-view.html',
  styleUrl: './scene3d-view.css',
})
export class Scene3dViewComponent {
  protected readonly store = inject(FieldStore);
  protected readonly scene = inject(Scene3dState);
  private readonly backends = inject(FieldBackends);
  private readonly registry = inject(HeatmapCapture);
  private readonly destroyRef = inject(DestroyRef);

  readonly view = input.required<Scene3dView>();

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly engine = signal<Scene3dEngine | null>(null);
  private readonly prepared = signal<Prepared | null>(null);
  private readonly ends = signal<EndCounts | null>(null);
  private readonly size = signal({ width: 640, height: 400 });
  private readonly pointers = new Map<number, Pointer>();
  private pinchSpread = 0;
  private seconds = 0;
  private drawCount = 0;
  private lastCommand: DrawCommand | null = null;
  private readonly governor = createRenderScaleGovernor();
  private readonly automaticScale = signal(1);

  protected readonly failure = signal<string | null>(null);
  protected readonly preparing = signal(true);
  protected readonly presets = TRANSFER_PRESETS;
  protected readonly opacityRange = OPACITY_RANGE;
  protected readonly thresholdRange = THRESHOLD_RANGE;
  protected readonly lineCountRange = LINE_COUNT_RANGE;
  protected readonly stepCountRange = STEP_COUNT_RANGE;
  protected readonly lineGradient = lineGradient();
  protected readonly scaleLevels = RENDER_SCALE_LEVELS.map((level) => ({
    value: String(level),
    label: scaleLabel(level),
  }));
  protected readonly scaleChoice = computed(() => String(this.scene.renderScale()));
  protected readonly activeScale = computed(() =>
    effectiveScale(this.scene.renderScale(), this.automaticScale()),
  );
  protected readonly scaleNote = computed(() =>
    this.activeScale() < 1 ? `Rendering at ${scaleLabel(this.activeScale())} resolution` : '',
  );

  protected readonly title = computed(() => TITLES[this.view()]);
  protected readonly quantity = computed(() => this.store.settings().quantity);
  protected readonly mode = computed(() => this.store.settings().mode);
  protected readonly unit = computed(() => quantityUnit(this.quantity()));
  protected readonly playing = computed(() => this.store.playing());
  protected readonly pose = computed(() => {
    const prepared = this.prepared();
    const pose = this.scene.pose(this.view());
    return prepared === null ? pose : { ...pose, target: boxCenter(prepared.preparation.box) };
  });
  protected readonly poseText = computed(() => describePose(this.pose()));
  protected readonly stageLabel = computed(
    () =>
      `${this.title()} of the ${quantityName(this.quantity())}. Arrow keys orbit, plus and minus zoom, zero resets the camera, space pauses the animation.`,
  );

  private readonly peak = computed(() => {
    const prepared = this.prepared();
    return prepared?.preparation.peaks?.[this.quantity()] ?? null;
  });

  private readonly groundPeak = computed(() => {
    const prepared = this.prepared();
    if (prepared === null) {
      return null;
    }
    const { spec } = prepared.preparation;
    return peakOnGround(prepared.frame.values, prepared.frame.grid, this.quantity(), {
      min: spec.zMin,
      max: spec.zMax,
    });
  });

  protected readonly caption = computed(() => {
    const prepared = this.prepared();
    if (prepared === null) {
      return 'Preparing the scene';
    }
    const { spec } = prepared.preparation;
    switch (this.view()) {
      case 'lines':
        return `${String(this.scene.lineCount())} lines, ${String(this.scene.stepCount())} steps each`;
      default: {
        const grid = `${String(spec.nx)} by ${String(spec.ny)} by ${String(spec.nz)} grid`;
        const adapter =
          this.engine()?.software === true ? ', reduced for the software adapter' : '';
        return `WebGPU, ${grid}${adapter}`;
      }
    }
  });

  protected readonly summary = computed(() => {
    const prepared = this.prepared();
    if (prepared === null) {
      return '';
    }
    const settings = this.store.settings();
    const peak = this.peak();
    switch (this.view()) {
      case 'volume':
        return peak === null
          ? ''
          : volumeSummary({
              quantity: settings.quantity,
              mode: settings.mode,
              phaseDegrees: settings.phaseDegrees,
              peak,
              transfer: this.scene.transfer(),
              height: prepared.preparation.spec.yMax,
            });
      case 'isosurface':
        return peak === null ? '' : isosurfaceSummary(settings.quantity, peak, this.store.levels());
      case 'lines': {
        const ground = this.groundPeak();
        return ground === null
          ? ''
          : linesSummary({
              quantity: settings.quantity,
              phaseDegrees: settings.phaseDegrees,
              lineCount: this.scene.lineCount(),
              peak: ground,
              ends: this.ends(),
            });
      }
    }
  });

  protected readonly volumeScale = computed(() => {
    const peaks = this.prepared()?.preparation.peaks ?? null;
    if (peaks === null) {
      return null;
    }
    const maximum = displayMaximum(this.quantity(), this.mode(), {
      electric: peaks.electric.value,
      magnetic: peaks.magnetic.value,
    });
    const edges = bandEdges(
      this.store.levels().map((level) => level.value),
      maximum,
    );
    return {
      gradient: transferGradient(buildTransferTable(this.scene.transfer(), edges)),
      ticks: scaleTicks(maximum),
    };
  });

  protected readonly surfaceLegend = computed(() => {
    const peak = this.peak();
    return peak === null ? [] : isoLegend(this.store.levels(), peak.value);
  });

  constructor() {
    afterNextRender(() => {
      const element = this.stage().nativeElement;
      const measure = (width: number, height: number): void => {
        this.size.set({
          width: Math.max(1, Math.round(width)),
          height: Math.max(1, Math.round(height)),
        });
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
      const canvas = this.canvas()?.nativeElement;
      if (canvas === undefined) {
        return;
      }
      let disposed = false;
      let created: Scene3dEngine | null = null;
      void this.backends.device().then((ready) => {
        if (disposed || ready === null) {
          return;
        }
        try {
          created = createScene3dEngine(ready, canvas);
          this.engine.set(created);
        } catch (error) {
          this.backends.demote(describeError(error));
        }
      });
      onCleanup(() => {
        disposed = true;
        this.engine.set(null);
        this.prepared.set(null);
        created?.dispose();
      });
    });

    effect((onCleanup) => {
      const engine = this.engine();
      const frame = this.store.frame();
      const wantVolume = this.view() !== 'lines';
      if (engine === null || frame === null) {
        return;
      }
      const { fieldSource } = frame;
      if (fieldSource === null) {
        return;
      }
      let stale = false;
      untracked(() => {
        this.preparing.set(true);
      });
      engine
        .prepare(
          { source: fieldSource, geometry: frame.geometry, evaluator: frame.evaluator },
          wantVolume,
        )
        .then((preparation) => {
          if (stale || preparation === null) {
            return;
          }
          this.prepared.set({ frame, preparation });
          this.failure.set(null);
          this.preparing.set(false);
        })
        .catch((error: unknown) => {
          if (!stale) {
            this.failure.set(describeError(error));
            this.preparing.set(false);
          }
        });
      onCleanup(() => {
        stale = true;
      });
    });

    effect(() => {
      const engine = this.engine();
      const prepared = this.prepared();
      const view = this.view();
      const settings = this.store.settings();
      const transfer = this.scene.transfer();
      const lineCount = this.scene.lineCount();
      const stepCount = this.scene.stepCount();
      const pose = this.pose();
      const levels = this.store.levels();
      const size = this.size();
      const animating = this.store.animating();
      const peak = this.peak();
      const canvas = this.canvas()?.nativeElement;
      if (engine === null || prepared === null || canvas === undefined) {
        return;
      }
      if (view !== 'lines' && prepared.preparation.peaks === null) {
        return;
      }
      if (animating) {
        this.seconds = performance.now() / 1000;
      }
      const command: DrawCommand = {
        view,
        quantity: settings.quantity,
        mode: settings.mode,
        phaseRadians: (settings.phaseDegrees * Math.PI) / 180,
        pose,
        seconds: this.seconds,
        transfer,
        exposureLevels: levels.map((level) => level.value),
        isoLevels: isoLevelsFrom(levels, peak?.value ?? 0).map((level) => level.value),
        lineCount,
        stepCount,
      };
      const limit = engine.software ? MAXIMUM_PIXELS_SOFTWARE : MAXIMUM_PIXELS_HARDWARE;
      const ratio = engine.software ? 1 : window.devicePixelRatio;
      const choice = this.scene.renderScale();
      const automatic = untracked(() => this.automaticScale());
      const resolutionFactor = effectiveScale(choice, automatic);
      const scale =
        Math.min(ratio, Math.sqrt(limit / (size.width * size.height))) * resolutionFactor;
      const width = Math.max(1, Math.round(size.width * scale));
      const height = Math.max(1, Math.round(size.height * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      try {
        engine.draw(command);
        this.adaptScale(choice, animating);
        this.lastCommand = command;
        this.drawCount += 1;
        this.failure.set(null);
        if (view === 'lines') {
          this.refreshEnds(engine, animating);
        }
      } catch (error) {
        this.failure.set(describeError(error));
      }
    });

    const unregister = this.registry.register((request) => this.captureNow(request));
    this.destroyRef.onDestroy(unregister);
  }

  protected selectPreset(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.checked) {
      this.scene.setPreset(target.value as TransferPreset);
    }
  }

  protected readNumber(event: Event): number {
    const target = event.target;
    return target instanceof HTMLInputElement ? target.valueAsNumber : Number.NaN;
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const motion = keyboardMotion(event.key, event.shiftKey);
    if (motion !== null) {
      event.preventDefault();
      this.scene.move(this.view(), motion);
    }
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.scene.zoom(this.view(), wheelZoomFactor(event.deltaY));
  }

  protected onPointerDown(event: PointerEvent): void {
    const target = event.currentTarget;
    if (target instanceof Element) {
      target.setPointerCapture(event.pointerId);
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.pinchSpread = this.currentSpread();
  }

  protected onPointerMove(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (previous === undefined) {
      return;
    }
    const next = { x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, next);
    if (this.pointers.size >= 2) {
      const nextSpread = this.currentSpread();
      this.scene.zoom(this.view(), pinchZoomFactor(this.pinchSpread, nextSpread));
      this.pinchSpread = nextSpread;
      return;
    }
    this.scene.move(this.view(), dragMotion(next.x - previous.x, next.y - previous.y));
  }

  protected onPointerEnd(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    this.pinchSpread = this.currentSpread();
  }

  protected resetCamera(): void {
    this.scene.resetCamera(this.view());
  }

  protected formatPercent(value: number): string {
    return `${formatNumber(value * 100)} percent`;
  }

  private adaptScale(choice: string | number, animating: boolean): void {
    if (choice !== 'auto' || !animating) {
      this.governor.reset();
      return;
    }
    const next = this.governor.observe(performance.now());
    untracked(() => {
      if (next !== this.automaticScale()) {
        this.automaticScale.set(next);
      }
    });
  }

  protected selectScale(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      this.scene.setRenderScale(target.value);
    }
  }

  private currentSpread(): number {
    const [first, second] = [...this.pointers.values()];
    return first === undefined || second === undefined ? 0 : spread(first, second);
  }

  private refreshEnds(engine: Scene3dEngine, animating: boolean): void {
    if (animating) {
      this.ends.set(null);
      return;
    }
    const mine = this.drawCount;
    void engine.readLines().then((lines) => {
      if (mine === this.drawCount) {
        this.ends.set(countEnds(lines));
      }
    });
  }

  private async captureNow(request: { width: number; height: number }): Promise<HeatmapPixels> {
    const engine = this.engine();
    const command = this.lastCommand;
    if (engine === null || command === null) {
      throw new Error('There is no 3D scene to capture');
    }
    const pixels = await engine.capture(command, request.width, request.height);
    return { width: request.width, height: request.height, pixels };
  }
}
