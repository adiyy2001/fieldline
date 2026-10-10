import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_LINE_COUNT,
  DEFAULT_STEP_COUNT,
  LINE_COUNT_RANGE,
  STEP_COUNT_RANGE,
} from '../../core/fieldlines/types';
import {
  DEFAULT_TRANSFER,
  OPACITY_RANGE,
  THRESHOLD_RANGE,
  type TransferPreset,
  type TransferSettings,
} from '../../core/volume/transfer-function';
import type { Scene3dView } from './scene3d-model';
import {
  type CameraMotion,
  type CameraPose,
  DEFAULT_CAMERA_POSE,
  applyMotion,
  clampPose,
} from '../../gpu/camera';

export interface Orbit {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
}

export function clampToRange(
  value: number,
  range: { readonly min: number; readonly max: number; readonly step: number },
): number {
  if (!Number.isFinite(value)) {
    return range.min;
  }
  const snapped = range.min + Math.round((value - range.min) / range.step) * range.step;
  const clamped = Math.min(range.max, Math.max(range.min, snapped));
  return Number(clamped.toFixed(6));
}

function definedOnly(orbit: Partial<Orbit>): Partial<Orbit> {
  return {
    ...(orbit.yaw === undefined ? {} : { yaw: orbit.yaw }),
    ...(orbit.pitch === undefined ? {} : { pitch: orbit.pitch }),
    ...(orbit.distance === undefined ? {} : { distance: orbit.distance }),
  };
}

export function orbitOf(pose: CameraPose): Orbit {
  return { yaw: pose.yaw, pitch: pose.pitch, distance: pose.distance };
}

export const DEFAULT_ORBITS: Readonly<Record<Scene3dView, Orbit>> = {
  volume: { yaw: (-38 * Math.PI) / 180, pitch: (24 * Math.PI) / 180, distance: 430 },
  isosurface: { yaw: (-38 * Math.PI) / 180, pitch: (24 * Math.PI) / 180, distance: 430 },
  lines: { yaw: (-28 * Math.PI) / 180, pitch: (20 * Math.PI) / 180, distance: 150 },
};

export function moveOrbit(orbit: Orbit, motion: CameraMotion, fallback: Orbit): Orbit {
  return motion.reset
    ? fallback
    : orbitOf(applyMotion({ ...DEFAULT_CAMERA_POSE, ...orbit }, motion));
}

@Injectable({ providedIn: 'root' })
export class Scene3dState {
  private readonly transferState = signal<TransferSettings>(DEFAULT_TRANSFER);
  private readonly lineCountState = signal(DEFAULT_LINE_COUNT);
  private readonly stepCountState = signal(DEFAULT_STEP_COUNT);
  private readonly orbitState = signal<Readonly<Record<Scene3dView, Orbit>>>(DEFAULT_ORBITS);

  readonly transfer = this.transferState.asReadonly();
  readonly lineCount = this.lineCountState.asReadonly();
  readonly stepCount = this.stepCountState.asReadonly();

  orbit(view: Scene3dView): Orbit {
    return this.orbitState()[view];
  }

  pose(view: Scene3dView): CameraPose {
    return { ...DEFAULT_CAMERA_POSE, ...this.orbit(view) };
  }

  setPreset(preset: TransferPreset): void {
    this.transferState.update((current) => ({ ...current, preset }));
  }

  setOpacity(value: number): void {
    this.transferState.update((current) => ({
      ...current,
      opacity: clampToRange(value, OPACITY_RANGE),
    }));
  }

  setThreshold(value: number): void {
    this.transferState.update((current) => ({
      ...current,
      threshold: clampToRange(value, THRESHOLD_RANGE),
    }));
  }

  setLineCount(value: number): void {
    this.lineCountState.set(clampToRange(value, LINE_COUNT_RANGE));
  }

  setStepCount(value: number): void {
    this.stepCountState.set(clampToRange(value, STEP_COUNT_RANGE));
  }

  move(view: Scene3dView, motion: CameraMotion): void {
    this.orbitState.update((current) => ({
      ...current,
      [view]: moveOrbit(current[view], motion, DEFAULT_ORBITS[view]),
    }));
  }

  zoom(view: Scene3dView, factor: number): void {
    this.move(view, { deltaYaw: 0, deltaPitch: 0, zoomFactor: factor, reset: false });
  }

  setOrbit(view: Scene3dView, orbit: Partial<Orbit>): void {
    this.orbitState.update((current) => ({
      ...current,
      [view]: orbitOf(
        clampPose({ ...DEFAULT_CAMERA_POSE, ...current[view], ...definedOnly(orbit) }),
      ),
    }));
  }

  resetCamera(view: Scene3dView): void {
    this.orbitState.update((current) => ({ ...current, [view]: DEFAULT_ORBITS[view] }));
  }
}
