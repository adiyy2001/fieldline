import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LINE_COUNT_RANGE, STEP_COUNT_RANGE } from '../../core/fieldlines/types';
import {
  DEFAULT_TRANSFER,
  OPACITY_RANGE,
  THRESHOLD_RANGE,
} from '../../core/volume/transfer-function';
import { CAMERA_LIMITS, keyboardMotion } from '../../gpu/camera';
import { DEFAULT_ORBITS, Scene3dState, clampToRange, moveOrbit } from './scene3d-state';

function service(): Scene3dState {
  TestBed.configureTestingModule({});
  return TestBed.inject(Scene3dState);
}

describe('the 3D settings', () => {
  it('snaps a value to the range step and clamps it', () => {
    expect(clampToRange(0.52, OPACITY_RANGE)).toBeCloseTo(0.5, 6);
    expect(clampToRange(5, OPACITY_RANGE)).toBe(OPACITY_RANGE.max);
    expect(clampToRange(-1, THRESHOLD_RANGE)).toBe(THRESHOLD_RANGE.min);
    expect(clampToRange(Number.NaN, LINE_COUNT_RANGE)).toBe(LINE_COUNT_RANGE.min);
    expect(clampToRange(130, LINE_COUNT_RANGE)).toBe(128);
  });

  it('starts with the documented defaults', () => {
    const state = service();
    expect(state.transfer()).toEqual(DEFAULT_TRANSFER);
    expect(state.lineCount()).toBe(128);
    expect(state.stepCount()).toBe(192);
  });

  it('keeps every setting inside its range', () => {
    const state = service();
    state.setPreset('bands');
    state.setOpacity(9);
    state.setThreshold(-3);
    state.setLineCount(1000);
    state.setStepCount(1);
    expect(state.transfer()).toEqual({ preset: 'bands', opacity: OPACITY_RANGE.max, threshold: 0 });
    expect(state.lineCount()).toBe(LINE_COUNT_RANGE.max);
    expect(state.stepCount()).toBe(STEP_COUNT_RANGE.min);
  });

  it('chooses the render scale automatically until a level is picked', () => {
    const state = service();
    expect(state.renderScale()).toBe('auto');
    state.setRenderScale('0.75');
    expect(state.renderScale()).toBe(0.75);
    state.setRenderScale('nonsense');
    expect(state.renderScale()).toBe('auto');
  });

  it('keeps one camera per view', () => {
    const state = service();
    state.move('volume', { deltaYaw: 0.5, deltaPitch: 0, zoomFactor: 1, reset: false });
    expect(state.orbit('volume').yaw).toBeCloseTo(DEFAULT_ORBITS.volume.yaw + 0.5, 9);
    expect(state.orbit('lines')).toEqual(DEFAULT_ORBITS.lines);
    expect(state.orbit('isosurface')).toEqual(DEFAULT_ORBITS.isosurface);
  });

  it('zooms inside the camera limits and resets one view', () => {
    const state = service();
    state.zoom('lines', 1000);
    expect(state.orbit('lines').distance).toBe(CAMERA_LIMITS.maximumDistance);
    state.zoom('lines', 1e-6);
    expect(state.orbit('lines').distance).toBe(CAMERA_LIMITS.minimumDistance);
    state.move('volume', { deltaYaw: 1, deltaPitch: 0, zoomFactor: 1, reset: false });
    state.resetCamera('lines');
    expect(state.orbit('lines')).toEqual(DEFAULT_ORBITS.lines);
    expect(state.orbit('volume')).not.toEqual(DEFAULT_ORBITS.volume);
    expect(state.pose('lines').distance).toBe(DEFAULT_ORBITS.lines.distance);
  });

  it('resets to the view default through the reset key', () => {
    const state = service();
    state.move('lines', { deltaYaw: 1, deltaPitch: 0.2, zoomFactor: 2, reset: false });
    const reset = keyboardMotion('0', false);
    expect(reset).not.toBeNull();
    if (reset !== null) {
      state.move('lines', reset);
    }
    expect(state.orbit('lines')).toEqual(DEFAULT_ORBITS.lines);
  });

  it('sets the camera from outside and keeps it inside the limits', () => {
    const state = service();
    state.setOrbit('volume', { yaw: 0, pitch: 0.3, distance: 50 });
    expect(state.orbit('volume')).toEqual({ yaw: 0, pitch: 0.3, distance: 50 });
    state.setOrbit('volume', { distance: 1e6 });
    expect(state.orbit('volume').distance).toBe(CAMERA_LIMITS.maximumDistance);
    expect(state.orbit('volume').yaw).toBe(0);
    expect(state.orbit('lines')).toEqual(DEFAULT_ORBITS.lines);
  });

  it('turns by the key step', () => {
    const motion = keyboardMotion('ArrowRight', false);
    expect(motion).not.toBeNull();
    if (motion !== null) {
      const moved = moveOrbit(DEFAULT_ORBITS.volume, motion, DEFAULT_ORBITS.volume);
      expect(moved.yaw).toBeGreaterThan(DEFAULT_ORBITS.volume.yaw);
    }
  });
});
