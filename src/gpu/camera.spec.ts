import { describe, expect, it } from 'vitest';
import { vec4 } from 'wgpu-matrix';
import {
  CAMERA_LIMITS,
  DEFAULT_CAMERA_POSE,
  applyMotion,
  cameraMatrices,
  cameraPosition,
  clampPose,
  describePose,
  dragMotion,
  keyboardMotion,
  orbitPose,
  pinchZoomFactor,
  viewMatrix,
  wheelZoomFactor,
  zoomPose,
} from './camera';

describe('the orbit camera', () => {
  it('keeps the pitch inside its limits and wraps the yaw', () => {
    const steep = orbitPose(DEFAULT_CAMERA_POSE, 0, 10);
    expect(steep.pitch).toBe(CAMERA_LIMITS.maximumPitch);
    const flat = orbitPose(DEFAULT_CAMERA_POSE, 0, -10);
    expect(flat.pitch).toBe(CAMERA_LIMITS.minimumPitch);
    const turned = orbitPose(DEFAULT_CAMERA_POSE, 2 * Math.PI + 0.25, 0);
    expect(turned.yaw).toBeCloseTo(DEFAULT_CAMERA_POSE.yaw + 0.25, 9);
    expect(Math.abs(clampPose({ ...DEFAULT_CAMERA_POSE, yaw: -7 }).yaw)).toBeLessThanOrEqual(
      Math.PI,
    );
  });

  it('keeps the distance inside its limits', () => {
    expect(zoomPose(DEFAULT_CAMERA_POSE, 100).distance).toBe(CAMERA_LIMITS.maximumDistance);
    expect(zoomPose(DEFAULT_CAMERA_POSE, 0.001).distance).toBe(CAMERA_LIMITS.minimumDistance);
    expect(zoomPose(DEFAULT_CAMERA_POSE, 0.5).distance).toBeCloseTo(
      DEFAULT_CAMERA_POSE.distance / 2,
      9,
    );
  });

  it('places the eye at the given distance from the target', () => {
    for (const yaw of [-3, -1, 0, 0.7, 2.5]) {
      const pose = { ...DEFAULT_CAMERA_POSE, yaw, pitch: 0.6, distance: 123 };
      const eye = cameraPosition(pose);
      const offset = Math.hypot(
        eye.x - pose.target.x,
        eye.y - pose.target.y,
        eye.z - pose.target.z,
      );
      expect(offset).toBeCloseTo(123, 9);
      expect(eye.y).toBeGreaterThan(pose.target.y);
    }
  });

  it('maps the target to the centre of the view in front of the camera', () => {
    const view = viewMatrix(DEFAULT_CAMERA_POSE);
    const target = DEFAULT_CAMERA_POSE.target;
    const transformed = vec4.transformMat4(vec4.create(target.x, target.y, target.z, 1), view);
    expect(transformed[0] ?? 0).toBeCloseTo(0, 4);
    expect(transformed[1] ?? 0).toBeCloseTo(0, 4);
    expect(transformed[2] ?? 0).toBeCloseTo(-DEFAULT_CAMERA_POSE.distance, 3);
  });

  it('projects the target into the middle of the clip volume with a depth in zero to one', () => {
    const { viewProjection } = cameraMatrices(DEFAULT_CAMERA_POSE, 1.6);
    const target = DEFAULT_CAMERA_POSE.target;
    const clip = vec4.transformMat4(vec4.create(target.x, target.y, target.z, 1), viewProjection);
    expect((clip[0] ?? 0) / (clip[3] ?? 0)).toBeCloseTo(0, 4);
    expect((clip[1] ?? 0) / (clip[3] ?? 0)).toBeCloseTo(0, 4);
    const depth = (clip[2] ?? 0) / (clip[3] ?? 0);
    expect(depth).toBeGreaterThan(0);
    expect(depth).toBeLessThan(1);
  });

  it('unprojects the centre of the screen onto the line from the eye to the target', () => {
    const { inverseViewProjection, position } = cameraMatrices(DEFAULT_CAMERA_POSE, 1.3);
    const near = vec4.transformMat4(vec4.create(0, 0, 0, 1), inverseViewProjection);
    const far = vec4.transformMat4(vec4.create(0, 0, 1, 1), inverseViewProjection);
    const nearPoint = [0, 1, 2].map((axis) => (near[axis] ?? 0) / (near[3] ?? 1));
    const farPoint = [0, 1, 2].map((axis) => (far[axis] ?? 0) / (far[3] ?? 1));
    const toTarget = [
      DEFAULT_CAMERA_POSE.target.x - position.x,
      DEFAULT_CAMERA_POSE.target.y - position.y,
      DEFAULT_CAMERA_POSE.target.z - position.z,
    ];
    const ray = [0, 1, 2].map((axis) => (farPoint[axis] ?? 0) - (nearPoint[axis] ?? 0));
    const rayLength = Math.hypot(...ray);
    const targetLength = Math.hypot(...toTarget);
    const alignment =
      ray.reduce((sum, value, axis) => sum + value * (toTarget[axis] ?? 0), 0) /
      (rayLength * targetLength);
    expect(alignment).toBeGreaterThan(0.99999);
  });

  it('maps keys to motions and ignores the others', () => {
    expect(keyboardMotion('ArrowLeft', false)?.deltaYaw).toBeLessThan(0);
    expect(keyboardMotion('ArrowRight', false)?.deltaYaw).toBeGreaterThan(0);
    expect(keyboardMotion('ArrowUp', false)?.deltaPitch).toBeGreaterThan(0);
    expect(keyboardMotion('ArrowDown', false)?.deltaPitch).toBeLessThan(0);
    expect(keyboardMotion('+', false)?.zoomFactor).toBeLessThan(1);
    expect(keyboardMotion('-', false)?.zoomFactor).toBeGreaterThan(1);
    expect(keyboardMotion('0', false)?.reset).toBe(true);
    expect(keyboardMotion('x', false)).toBeNull();
    expect(Math.abs(keyboardMotion('ArrowRight', true)?.deltaYaw ?? 0)).toBeGreaterThan(
      Math.abs(keyboardMotion('ArrowRight', false)?.deltaYaw ?? 0),
    );
  });

  it('applies a motion and resets to the default pose', () => {
    const moved = applyMotion(
      DEFAULT_CAMERA_POSE,
      keyboardMotion('ArrowRight', false) ?? dragMotion(0, 0),
    );
    expect(moved.yaw).toBeGreaterThan(DEFAULT_CAMERA_POSE.yaw);
    expect(applyMotion(moved, { deltaYaw: 0, deltaPitch: 0, zoomFactor: 1, reset: true })).toEqual(
      DEFAULT_CAMERA_POSE,
    );
  });

  it('turns drag, wheel and pinch gestures into motion', () => {
    expect(dragMotion(100, 0).deltaYaw).toBeLessThan(0);
    expect(dragMotion(0, 100).deltaPitch).toBeGreaterThan(0);
    expect(wheelZoomFactor(100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-100)).toBeLessThan(1);
    expect(pinchZoomFactor(100, 200)).toBeCloseTo(0.5, 12);
    expect(pinchZoomFactor(0, 200)).toBe(1);
  });

  it('describes the pose in words', () => {
    expect(describePose(DEFAULT_CAMERA_POSE)).toBe(
      'azimuth -38 degrees, elevation 24 degrees, distance 300 m',
    );
  });
});
