import { expect, test } from '@playwright/test';
import { DEMO_SCENE_NAMES } from '../src/app/automation/demo-scenes.ts';
import { callAutomation, openAutomation } from './automation.ts';

const RENDERER_CYCLES = 20;

test.describe('the demo scenes of the automation hook', () => {
  test.describe.configure({ timeout: 480_000 });

  for (const name of DEMO_SCENE_NAMES) {
    test(`${name} steps through every frame and leaves a settled page`, async ({ page }) => {
      await openAutomation(page, 'coarse-grid');
      const run = await callAutomation(page, 'scene', name);
      expect(run.name).toBe(name);
      expect(run.frameCount).toBeGreaterThan(1);
      const phases = new Set<number>();
      const sags = new Set<number>();
      const phasings = new Set<string>();
      for (let index = 0; index < run.frameCount; index += 1) {
        await callAutomation(page, 'sceneFrame', index);
        await callAutomation(page, 'settle');
        const state = await callAutomation(page, 'appState');
        expect(state?.status).toBe('ready');
        expect(state?.settings.view).toBe(run.view);
        phases.add(state?.settings.phaseDegrees ?? Number.NaN);
        sags.add(state?.parameters.phaseSag ?? Number.NaN);
        phasings.add(String(state?.parameters.phasing));
      }
      if (name === 'lines-cycle') {
        expect(phases.size).toBe(run.frameCount);
      }
      if (name === 'profile-chart') {
        expect(sags.size).toBeGreaterThan(1);
      }
      if (name === 'phasing-change') {
        expect(phasings.size).toBeGreaterThan(1);
      }
    });
  }
});

test.describe('renderer resources', () => {
  test('creates and destroys the renderer twenty times without a lost device', async ({ page }) => {
    test.setTimeout(240_000);
    await openAutomation(page);
    const run = await callAutomation(page, 'runRendererCycles', { cycles: RENDERER_CYCLES });
    expect(run.cycles).toBe(RENDERER_CYCLES);
    expect(run.deviceLost).toBe(false);
    expect(run.validationError).toBeNull();
  });

  test('a device lost during use shows the fallback and keeps computing', async ({ page }) => {
    await openAutomation(page);
    await callAutomation(page, 'settle');
    expect((await callAutomation(page, 'appState'))?.backend).toBe('gpu');
    await callAutomation(page, 'loseDevice');
    await expect(page.getByTestId('fallback-notice')).toBeVisible();
    await callAutomation(page, 'setParameters', { lineToLineKilovolts: 220 });
    const state = await callAutomation(page, 'appState');
    expect(state?.status).toBe('ready');
    expect(state?.backend).toBe('cpu');
    expect(state?.maxima?.electric).toBeGreaterThan(0);
  });
});
