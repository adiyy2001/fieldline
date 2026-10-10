import { effect, inject, signal, untracked } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { computed } from '@angular/core';
import { concat, debounce, defer, from, pipe, switchMap, tap, timer } from 'rxjs';
import { contourLevels } from '../../core/exposure/contour-levels';
import type { TowerKind } from '../../core/geometry/tower';
import {
  type LineParameters,
  type ValidationIssue,
  defaultParameters,
} from '../../core/model/parameters';
import {
  DEFAULT_CYCLE_SECONDS,
  FULL_CYCLE_DEGREES,
  type Configuration,
  type ViewId,
  type ViewSettings,
  stepPhase,
  wrapPhase,
} from '../../core/model/settings';
import { withTowerField } from '../../core/model/tower-fields';
import { encodeConfiguration } from '../../core/model/url-state';
import { FieldBackends } from '../services/field-backends';
import {
  type FieldFrame,
  type PipelineOutcome,
  type Quality,
  createFieldPipeline,
} from '../services/field-pipeline';
import { PREFERS_REDUCED_MOTION, SOLVER_CLIENT } from '../services/tokens';
import { UrlSync } from '../services/url-sync';
import { VIEW_AVAILABILITY } from './views';

export type FieldStatus = 'solving' | 'ready' | 'invalid' | 'failed';

export interface Probe {
  readonly lateral: number;
  readonly along: number;
}

export interface EditOptions {
  readonly interactive?: boolean;
}

interface EvaluationRequest {
  readonly interactive: boolean;
  readonly sequence: number;
}

interface FieldState {
  parameters: LineParameters;
  settings: ViewSettings;
  playing: boolean;
  probe: Probe;
  status: FieldStatus;
  issues: readonly ValidationIssue[];
  message: string | null;
  displayedQuality: Quality;
  interactive: boolean;
  sequence: number;
}

export const INTERACTIVE_DELAY_MILLISECONDS = 25;
export const FULL_QUALITY_DELAY_MILLISECONDS = 150;
export const PROBE_STEPS = 64;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function swapPhasing(
  phasing: readonly number[],
  position: number,
  phase: number,
): readonly number[] {
  const circuitStart = position < 3 ? 0 : 3;
  const circuitEnd = circuitStart + 3;
  const next = [...phasing];
  const holder = next.findIndex(
    (value, index) => index >= circuitStart && index < circuitEnd && value === phase,
  );
  const previous = next[position];
  if (holder >= 0 && previous !== undefined) {
    next[holder] = previous;
  }
  next[position] = phase;
  return next;
}

export const FieldStore = signalStore(
  { providedIn: 'root' },
  withState<FieldState>(() => {
    const { parameters, settings } = inject(UrlSync).read();
    return {
      parameters,
      settings,
      playing: !inject(PREFERS_REDUCED_MOTION)(),
      probe: { lateral: 0.5, along: 0.5 },
      status: 'solving',
      issues: [],
      message: null,
      displayedQuality: 'full',
      interactive: false,
      sequence: 0,
    };
  }),
  withProps(() => ({
    frame: signal<FieldFrame | null>(null),
  })),
  withComputed((store) => {
    return {
      view: computed(() => store.settings().view),
      configuration: computed<Configuration>(() => ({
        parameters: store.parameters(),
        settings: store.settings(),
      })),
      levels: computed(() => contourLevels(store.settings().quantity, store.settings().presetId)),
      animating: computed(
        () =>
          store.playing() &&
          store.settings().mode === 'instantaneous' &&
          store.settings().view === 'ground',
      ),
      request: computed<EvaluationRequest>(() => ({
        interactive: store.interactive(),
        sequence: store.sequence(),
      })),
    };
  }),
  withMethods((store) => {
    const backends = inject(FieldBackends);
    const solver = inject(SOLVER_CLIENT);
    const sync = inject(UrlSync);
    const pipeline = createFieldPipeline({
      solver,
      backends,
      clock: () => performance.now(),
    });

    function publish(outcome: PipelineOutcome, quality: Quality): void {
      switch (outcome.status) {
        case 'frame': {
          const previous = store.frame();
          store.frame.set(outcome.frame);
          previous?.release();
          patchState(store, {
            status: 'ready',
            issues: [],
            message: null,
            displayedQuality: quality,
          });
          return;
        }
        case 'invalid':
          patchState(store, { status: 'invalid', issues: outcome.issues });
          return;
        case 'failed':
          patchState(store, { status: 'failed', message: outcome.message });
          return;
        case 'stale':
          return;
      }
    }

    function evaluateOnce(quality: Quality) {
      return defer(() => {
        const configuration: Configuration = {
          parameters: store.parameters(),
          settings: store.settings(),
        };
        return from(pipeline.run({ configuration, quality }));
      }).pipe(
        tap((outcome) => {
          publish(outcome, quality);
        }),
      );
    }

    const evaluate = rxMethod<EvaluationRequest>(
      pipe(
        debounce((request) => timer(request.interactive ? INTERACTIVE_DELAY_MILLISECONDS : 0)),
        switchMap((request) =>
          request.interactive
            ? concat(
                evaluateOnce('draft'),
                timer(FULL_QUALITY_DELAY_MILLISECONDS).pipe(switchMap(() => evaluateOnce('full'))),
              )
            : evaluateOnce('full'),
        ),
      ),
    );

    function touch(options: EditOptions | undefined): Partial<FieldState> {
      return {
        interactive: options?.interactive ?? false,
        sequence: store.sequence() + 1,
        status: 'solving',
      };
    }

    return {
      _evaluate: evaluate,
      _syncUrl(): void {
        sync.write(
          encodeConfiguration({ parameters: store.parameters(), settings: store.settings() }),
        );
      },
      setParameters(patch: Partial<LineParameters>, options?: EditOptions): void {
        patchState(store, { parameters: { ...store.parameters(), ...patch }, ...touch(options) });
      },
      setTowerKind(kind: TowerKind): void {
        const current = store.parameters();
        patchState(store, {
          parameters: {
            ...defaultParameters(kind),
            lineToLineKilovolts: current.lineToLineKilovolts,
            currentAmperes: current.currentAmperes,
            powerFactorAngleDegrees: current.powerFactorAngleDegrees,
            frequencyHz: current.frequencyHz,
          },
          ...touch(undefined),
        });
      },
      setTowerField(key: string, value: number, options?: EditOptions): void {
        const parameters = store.parameters();
        patchState(store, {
          parameters: { ...parameters, tower: withTowerField(parameters.tower, key, value) },
          ...touch(options),
        });
      },
      setSpanLength(index: number, value: number, options?: EditOptions): void {
        const spanLengths = store
          .parameters()
          .spanLengths.map((length, position) => (position === index ? value : length));
        patchState(store, {
          parameters: { ...store.parameters(), spanLengths },
          ...touch(options),
        });
      },
      setSpanCount(count: number): void {
        const current = store.parameters().spanLengths;
        const last = current[current.length - 1] ?? 300;
        const spanLengths = Array.from({ length: count }, (_, index) => current[index] ?? last);
        patchState(store, {
          parameters: { ...store.parameters(), spanLengths },
          ...touch(undefined),
        });
      },
      setPhaseAssignment(position: number, phase: number): void {
        patchState(store, {
          parameters: {
            ...store.parameters(),
            phasing: swapPhasing(store.parameters().phasing, position, phase),
          },
          ...touch(undefined),
        });
      },
      setSettings(patch: Partial<ViewSettings>): void {
        const current = store.settings();
        const next = { ...current, ...patch };
        const available = VIEW_AVAILABILITY.some((entry) => entry.id === next.view);
        const reevaluate =
          next.model !== current.model || next.evaluationHeight !== current.evaluationHeight;
        patchState(store, {
          settings: available ? next : { ...next, view: 'ground' },
          ...(reevaluate ? touch(undefined) : {}),
        });
      },
      _watchBackends(): void {
        effect(() => {
          const kind = backends.kind();
          untracked(() => {
            if (kind === 'cpu' && store.frame()?.backend === 'gpu') {
              patchState(store, touch(undefined));
            }
          });
        });
      },
      setView(view: ViewId): void {
        if (VIEW_AVAILABILITY.some((entry) => entry.id === view)) {
          patchState(store, { settings: { ...store.settings(), view } });
        }
      },
      setPhase(degrees: number): void {
        patchState(store, { settings: { ...store.settings(), phaseDegrees: wrapPhase(degrees) } });
      },
      stepPhase(steps: number): void {
        patchState(store, {
          settings: {
            ...store.settings(),
            phaseDegrees: stepPhase(store.settings().phaseDegrees, steps),
            mode: 'instantaneous',
          },
          playing: false,
        });
      },
      advancePhase(milliseconds: number): void {
        const step = (FULL_CYCLE_DEGREES * milliseconds) / (DEFAULT_CYCLE_SECONDS * 1000);
        patchState(store, {
          settings: {
            ...store.settings(),
            phaseDegrees: wrapPhase(store.settings().phaseDegrees + step),
          },
        });
      },
      setPlaying(playing: boolean): void {
        patchState(store, { playing });
      },
      togglePlaying(): void {
        patchState(store, { playing: !store.playing() });
      },
      moveProbe(lateral: number, along: number): void {
        const probe = store.probe();
        patchState(store, {
          probe: { lateral: clamp01(probe.lateral + lateral), along: clamp01(probe.along + along) },
        });
      },
      setProbe(probe: Probe): void {
        patchState(store, {
          probe: { lateral: clamp01(probe.lateral), along: clamp01(probe.along) },
        });
      },
      settled(): boolean {
        return store.status() !== 'solving';
      },
    };
  }),
  withHooks({
    onInit(store) {
      store._evaluate(store.request);
      store._watchBackends();
      effect(() => {
        store.configuration();
        if (!store.animating()) {
          store._syncUrl();
        }
      });
    },
  }),
);

export type FieldStoreInstance = InstanceType<typeof FieldStore>;
