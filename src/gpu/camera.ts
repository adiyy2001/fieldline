import { type Mat4, mat4, vec3 } from 'wgpu-matrix';
import type { Point3 } from '../core/field-types';

export interface CameraPose {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly target: Point3;
}

export interface CameraLimits {
  readonly minimumPitch: number;
  readonly maximumPitch: number;
  readonly minimumDistance: number;
  readonly maximumDistance: number;
}

export const CAMERA_LIMITS: CameraLimits = {
  minimumPitch: (2 * Math.PI) / 180,
  maximumPitch: (88 * Math.PI) / 180,
  minimumDistance: 30,
  maximumDistance: 900,
};

export const DEFAULT_CAMERA_POSE: CameraPose = {
  yaw: (-38 * Math.PI) / 180,
  pitch: (24 * Math.PI) / 180,
  distance: 300,
  target: { x: 0, y: 24, z: 0 },
};

export const FIELD_OF_VIEW = (40 * Math.PI) / 180;
export const NEAR_PLANE = 1;
export const FAR_PLANE = 2500;
export const KEY_ROTATION_STEP = (6 * Math.PI) / 180;
export const KEY_ZOOM_FACTOR = 1.12;
export const POINTER_ROTATION_PER_PIXEL = 0.006;
export const WHEEL_ZOOM_PER_UNIT = 0.0012;

const FULL_TURN = 2 * Math.PI;

export function clampPose(pose: CameraPose, limits: CameraLimits = CAMERA_LIMITS): CameraPose {
  const wrapped = ((((pose.yaw + Math.PI) % FULL_TURN) + FULL_TURN) % FULL_TURN) - Math.PI;
  return {
    ...pose,
    yaw: wrapped,
    pitch: Math.min(limits.maximumPitch, Math.max(limits.minimumPitch, pose.pitch)),
    distance: Math.min(limits.maximumDistance, Math.max(limits.minimumDistance, pose.distance)),
  };
}

export function orbitPose(pose: CameraPose, deltaYaw: number, deltaPitch: number): CameraPose {
  return clampPose({ ...pose, yaw: pose.yaw + deltaYaw, pitch: pose.pitch + deltaPitch });
}

export function zoomPose(pose: CameraPose, factor: number): CameraPose {
  return clampPose({ ...pose, distance: pose.distance * factor });
}

export function cameraPosition(pose: CameraPose): Point3 {
  const horizontal = pose.distance * Math.cos(pose.pitch);
  return {
    x: pose.target.x + horizontal * Math.sin(pose.yaw),
    y: pose.target.y + pose.distance * Math.sin(pose.pitch),
    z: pose.target.z + horizontal * Math.cos(pose.yaw),
  };
}

export function viewMatrix(pose: CameraPose): Mat4 {
  const eye = cameraPosition(pose);
  return mat4.lookAt(
    vec3.create(eye.x, eye.y, eye.z),
    vec3.create(pose.target.x, pose.target.y, pose.target.z),
    vec3.create(0, 1, 0),
  );
}

export function projectionMatrix(aspect: number): Mat4 {
  return mat4.perspective(FIELD_OF_VIEW, Math.max(1e-3, aspect), NEAR_PLANE, FAR_PLANE);
}

export interface CameraMatrices {
  readonly viewProjection: Float32Array;
  readonly inverseViewProjection: Float32Array;
  readonly position: Point3;
}

export function cameraMatrices(pose: CameraPose, aspect: number): CameraMatrices {
  const combined = mat4.multiply(projectionMatrix(aspect), viewMatrix(pose));
  return {
    viewProjection: Float32Array.from(combined),
    inverseViewProjection: Float32Array.from(mat4.inverse(combined)),
    position: cameraPosition(pose),
  };
}

export interface CameraMotion {
  readonly deltaYaw: number;
  readonly deltaPitch: number;
  readonly zoomFactor: number;
  readonly reset: boolean;
}

const NO_MOTION: CameraMotion = { deltaYaw: 0, deltaPitch: 0, zoomFactor: 1, reset: false };

export function keyboardMotion(key: string, fast: boolean): CameraMotion | null {
  const step = fast ? 3 * KEY_ROTATION_STEP : KEY_ROTATION_STEP;
  const zoom = fast ? KEY_ZOOM_FACTOR ** 3 : KEY_ZOOM_FACTOR;
  switch (key) {
    case 'ArrowLeft':
      return { ...NO_MOTION, deltaYaw: -step };
    case 'ArrowRight':
      return { ...NO_MOTION, deltaYaw: step };
    case 'ArrowUp':
      return { ...NO_MOTION, deltaPitch: step };
    case 'ArrowDown':
      return { ...NO_MOTION, deltaPitch: -step };
    case '+':
    case '=':
      return { ...NO_MOTION, zoomFactor: 1 / zoom };
    case '-':
    case '_':
      return { ...NO_MOTION, zoomFactor: zoom };
    case '0':
    case 'Home':
      return { ...NO_MOTION, reset: true };
    default:
      return null;
  }
}

export function applyMotion(pose: CameraPose, motion: CameraMotion): CameraPose {
  if (motion.reset) {
    return DEFAULT_CAMERA_POSE;
  }
  return zoomPose(orbitPose(pose, motion.deltaYaw, motion.deltaPitch), motion.zoomFactor);
}

export function dragMotion(deltaX: number, deltaY: number): CameraMotion {
  return {
    ...NO_MOTION,
    deltaYaw: -deltaX * POINTER_ROTATION_PER_PIXEL,
    deltaPitch: deltaY * POINTER_ROTATION_PER_PIXEL,
  };
}

export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(deltaY * WHEEL_ZOOM_PER_UNIT);
}

export function pinchZoomFactor(previousSpread: number, nextSpread: number): number {
  return previousSpread > 0 && nextSpread > 0 ? previousSpread / nextSpread : 1;
}

export function describePose(pose: CameraPose): string {
  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
  return `azimuth ${String(degrees(pose.yaw))} degrees, elevation ${String(degrees(pose.pitch))} degrees, distance ${String(Math.round(pose.distance))} m`;
}
