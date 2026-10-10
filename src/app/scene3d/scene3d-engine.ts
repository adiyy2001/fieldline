import { defaultVolumeSpec } from '../../core/backend/regions';
import type { FieldBuffer, FieldSource, VolumeSpec } from '../../core/backend/types';
import type { FieldQuantity } from '../../core/exposure/levels';
import type { FieldEvaluator } from '../../core/field-types';
import { placeSeeds } from '../../core/fieldlines/seeds';
import type { LineSeed } from '../../core/fieldlines/types';
import { referenceSpan } from '../../core/geometry/discretize';
import type { LineGeometry } from '../../core/geometry/line-geometry';
import type { DisplayMode } from '../../core/model/settings';
import {
  type TransferSettings,
  bandEdges,
  buildTransferTable,
} from '../../core/volume/transfer-function';
import type { CameraPose } from '../../gpu/camera';
import type { ReadyDevice } from '../../gpu/device';
import { createGpuFieldBackend, type GpuFieldBackend } from '../../gpu/field-evaluator';
import { type FieldLinesLayer, createFieldLinesLayer } from '../../gpu/field-lines';
import { type IsosurfaceLayer, createIsosurfaceLayer } from '../../gpu/isosurface-layer';
import { type SceneRenderer, createSceneRenderer } from '../../gpu/scene-renderer';
import { buildBackdrop, type BoxBounds } from '../../gpu/scene-geometry';
import type { ReadLine } from '../../gpu/trace-params';
import { splitTracedLines } from '../../gpu/trace-params';
import { type VolumeField, createVolumeField } from '../../gpu/volume-field';
import { type VolumeLayer, createVolumeLayer } from '../../gpu/volume-layer';
import { displayMaximum } from '../../gpu/volume-params';
import {
  type FieldPeak,
  type Scene3dView,
  lineScaleMaximum,
  peakOfVolume,
  volumeSizeFor,
} from './scene3d-model';

export interface SceneInput {
  readonly source: FieldSource;
  readonly geometry: LineGeometry;
  readonly evaluator: FieldEvaluator;
}

export type VolumePeaks = Readonly<Record<FieldQuantity, FieldPeak>>;

export interface Preparation {
  readonly box: BoxBounds;
  readonly spec: VolumeSpec;
  readonly peaks: VolumePeaks | null;
}

export interface DrawCommand {
  readonly view: Scene3dView;
  readonly quantity: FieldQuantity;
  readonly mode: DisplayMode;
  readonly phaseRadians: number;
  readonly pose: CameraPose;
  readonly seconds: number;
  readonly transfer: TransferSettings;
  readonly exposureLevels: readonly number[];
  readonly isoLevels: readonly number[];
  readonly lineCount: number;
  readonly stepCount: number;
}

export interface Scene3dEngine {
  readonly software: boolean;
  prepare(input: SceneInput, wantVolume: boolean): Promise<Preparation | null>;
  draw(command: DrawCommand): void;
  capture(command: DrawCommand, width: number, height: number): Promise<Uint8Array>;
  readLines(): Promise<readonly ReadLine[]>;
  dispose(): void;
}

interface VolumeState {
  readonly key: string;
  readonly field: VolumeField;
  volume: VolumeLayer | null;
  surfaces: IsosurfaceLayer | null;
  buffer: FieldBuffer | null;
  peaks: VolumePeaks | null;
}

function hasDeviceBuffer(buffer: FieldBuffer): buffer is FieldBuffer & { buffer: GPUBuffer } {
  return 'buffer' in buffer;
}

function specKey(spec: VolumeSpec): string {
  return [
    spec.xMin,
    spec.xMax,
    spec.yMin,
    spec.yMax,
    spec.zMin,
    spec.zMax,
    spec.nx,
    spec.ny,
    spec.nz,
  ].join(',');
}

function boxOf(spec: VolumeSpec): BoxBounds {
  return {
    min: { x: spec.xMin, y: spec.yMin, z: spec.zMin },
    max: { x: spec.xMax, y: spec.yMax, z: spec.zMax },
  };
}

export function createScene3dEngine(
  ready: ReadyDevice,
  canvas: HTMLCanvasElement | null,
): Scene3dEngine {
  const software = ready.adapter.software;
  const renderer: SceneRenderer = createSceneRenderer(ready, canvas);
  const backend: GpuFieldBackend = createGpuFieldBackend(ready);
  let input: SceneInput | null = null;
  let preparation: Preparation | null = null;
  let volumeSource: FieldSource | null = null;
  let volume: VolumeState | null = null;
  let lines: FieldLinesLayer | null = null;
  let seeds: readonly LineSeed[] = [];
  let lineMaximum = 1;
  let generation = 0;
  let latest = 0;
  let tail: Promise<unknown> = Promise.resolve();
  let packedKey = '';
  let extractedKey = '';
  let transferKey = '';
  let loadedLinesKey = '';
  let tracedKey = '';
  let disposed = false;

  function disposeVolume(): void {
    if (volume === null) {
      return;
    }
    volume.volume?.dispose();
    volume.surfaces?.dispose();
    volume.field.dispose();
    volume.buffer?.release();
    volume = null;
  }

  async function run(next: SceneInput, wantVolume: boolean): Promise<Preparation> {
    const spec = defaultVolumeSpec(
      next.geometry,
      next.source.system.reference.index,
      volumeSizeFor(software),
    );
    const key = specKey(spec);
    const sameSource = input?.source === next.source;
    const volumeCurrent = volume !== null && volumeSource === next.source;
    if (sameSource && preparation !== null && (!wantVolume || volumeCurrent)) {
      input = next;
      return preparation;
    }
    input = next;
    generation += 1;
    packedKey = '';
    extractedKey = '';
    tracedKey = '';
    loadedLinesKey = '';
    if (volume !== null && volume.key !== key) {
      disposeVolume();
      volumeSource = null;
    }
    renderer.setBackdrop(buildBackdrop(next.source.system.set, next.geometry, boxOf(spec)));
    let peaks: VolumePeaks | null = null;
    if (wantVolume) {
      backend.load(next.source);
      const buffer = await backend.evaluateVolume(spec);
      if (!hasDeviceBuffer(buffer)) {
        buffer.release();
        throw new Error('The GPU backend returned a host buffer');
      }
      volume ??= {
        key,
        field: createVolumeField(ready, spec),
        volume: null,
        surfaces: null,
        buffer: null,
        peaks: null,
      };
      volume.field.setField(buffer.buffer);
      volume.buffer?.release();
      volume.buffer = buffer;
      const electric = await readPeak(volume.field, spec, 'electric');
      const magnetic = await readPeak(volume.field, spec, 'magnetic');
      peaks = { electric, magnetic };
      volume.peaks = peaks;
      volumeSource = next.source;
    } else if (volumeCurrent) {
      peaks = volume?.peaks ?? null;
    }
    preparation = { box: boxOf(spec), spec, peaks };
    return preparation;
  }

  async function readPeak(
    field: VolumeField,
    spec: VolumeSpec,
    quantity: FieldQuantity,
  ): Promise<FieldPeak> {
    field.pack({ quantity, mode: 'rms', phaseRadians: 0 });
    return peakOfVolume(await field.readMagnitudes(), spec);
  }

  function requirePrepared(): { input: SceneInput; preparation: Preparation } {
    if (input === null || preparation === null) {
      throw new Error('The scene has no field, call prepare first');
    }
    return { input, preparation };
  }

  function requireVolume(): { state: VolumeState; peaks: VolumePeaks } {
    const peaks = volume?.peaks ?? null;
    if (volume === null || peaks === null || volumeSource !== input?.source) {
      throw new Error('The volume was not prepared');
    }
    return { state: volume, peaks };
  }

  function packIfNeeded(
    state: VolumeState,
    quantity: FieldQuantity,
    mode: DisplayMode,
    phaseRadians: number,
  ): boolean {
    const key = `${String(generation)}|${quantity}|${mode}|${mode === 'rms' ? 0 : phaseRadians}`;
    if (key === packedKey) {
      return false;
    }
    state.field.pack({ quantity, mode, phaseRadians });
    packedKey = key;
    extractedKey = '';
    return true;
  }

  function configure(command: DrawCommand): void {
    const prepared = requirePrepared();
    switch (command.view) {
      case 'volume': {
        const { state, peaks } = requireVolume();
        packIfNeeded(state, command.quantity, command.mode, command.phaseRadians);
        state.volume ??= createVolumeLayer(ready, state.field, prepared.preparation.box);
        const maximum = displayMaximum(command.quantity, command.mode, {
          electric: peaks.electric.value,
          magnetic: peaks.magnetic.value,
        });
        const edges = bandEdges(command.exposureLevels, maximum);
        const nextTransferKey = `${command.transfer.preset}|${String(command.transfer.opacity)}|${String(command.transfer.threshold)}|${edges.join(',')}`;
        if (nextTransferKey !== transferKey) {
          state.volume.setTransfer(buildTransferTable(command.transfer, edges));
          transferKey = nextTransferKey;
        }
        state.volume.setMaximum(maximum);
        renderer.setLayers([state.volume]);
        return;
      }
      case 'isosurface': {
        const { state } = requireVolume();
        packIfNeeded(state, command.quantity, 'rms', 0);
        state.surfaces ??= createIsosurfaceLayer(ready, state.field);
        const key = `${packedKey}|${command.isoLevels.join(',')}`;
        if (key !== extractedKey) {
          state.surfaces.extract(command.isoLevels);
          extractedKey = key;
        }
        renderer.setLayers([state.surfaces]);
        return;
      }
      case 'lines': {
        lines ??= createFieldLinesLayer(ready);
        const key = `${String(generation)}|${command.quantity}|${String(command.lineCount)}|${String(command.stepCount)}`;
        if (key !== loadedLinesKey) {
          const { source, geometry, evaluator } = prepared.input;
          seeds = placeSeeds(source.system.set, referenceSpan(geometry), {
            kind: command.quantity,
            lineCount: command.lineCount,
          });
          lines.load({
            source,
            seeds,
            box: prepared.preparation.box,
            groundHeight: 0,
            stepCount: command.stepCount,
          });
          lineMaximum = lineScaleMaximum(seeds, evaluator, command.quantity);
          loadedLinesKey = key;
          tracedKey = '';
        }
        const traceKey = `${key}|${String(command.phaseRadians)}`;
        if (traceKey !== tracedKey) {
          lines.trace({ quantity: command.quantity, phaseRadians: command.phaseRadians });
          tracedKey = traceKey;
        }
        lines.setMaximum(lineMaximum);
        renderer.setLayers([lines]);
        return;
      }
    }
  }

  return {
    software,
    prepare(next, wantVolume) {
      latest += 1;
      const mine = latest;
      const result = tail.then(() => (mine === latest && !disposed ? run(next, wantVolume) : null));
      tail = result.catch(() => null);
      return result;
    },
    draw(command) {
      configure(command);
      renderer.render({ pose: command.pose, seconds: command.seconds });
    },
    capture(command, width, height) {
      configure(command);
      return renderer.capture({ pose: command.pose, seconds: command.seconds }, width, height);
    },
    async readLines() {
      if (lines === null) {
        return [];
      }
      return splitTracedLines(await lines.read());
    },
    dispose() {
      disposed = true;
      disposeVolume();
      lines?.dispose();
      lines = null;
      renderer.dispose();
      backend.dispose();
    },
  };
}
