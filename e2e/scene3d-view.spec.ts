import { expect, test, type Page } from '@playwright/test';
import { callAutomation } from './automation.ts';

const CAPTURE = { width: 160, height: 100 };

async function openScene(page: Page, query: string): Promise<void> {
  await page.goto(`/?automation&${query}`);
  await page.waitForFunction(() => 'fieldline' in window);
  await page.evaluate(
    () => (window as unknown as { fieldline: { ready: Promise<void> } }).fieldline.ready,
  );
  await callAutomation(page, 'settle');
  await expect(page.getByTestId('scene-summary')).not.toBeEmpty({ timeout: 60_000 });
}

async function pause(page: Page): Promise<void> {
  const button = page.getByTestId('scene-pause');
  if ((await button.getAttribute('aria-pressed')) === 'false') {
    await button.click();
  }
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

test.describe('the 3D views on a software adapter', () => {
  test('the three tabs are enabled and the volume view describes the field in text', async ({
    page,
  }) => {
    await openScene(page, 'v=1&w=volume');
    for (const name of ['Volume', 'Isosurfaces', 'Field lines']) {
      await expect(page.getByRole('tab', { name: new RegExp(name) })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }
    await expect(page.getByTestId('views3d-notice')).toHaveCount(0);
    const summary = page.getByTestId('scene-summary');
    await expect(summary).toContainText('Volume rendering of the electric field');
    await expect(summary).toContainText('kV/m at x =');
    await expect(page.getByTestId('scene-caption')).toContainText(
      'reduced for the software adapter',
    );
  });

  test('the transfer controls show their values as text and change the summary', async ({
    page,
  }) => {
    await openScene(page, 'v=1&w=volume');
    await expect(page.getByTestId('opacity-value')).toHaveText('55 percent');
    await expect(page.getByTestId('threshold-value')).toHaveText('25 percent');
    await page.getByLabel('Threshold').fill('0.5');
    await expect(page.getByTestId('threshold-value')).toHaveText('50 percent');
    await expect(page.getByTestId('scene-summary')).toContainText('below 50 percent');
    await page.getByLabel('Exposure bands').check();
    await expect(page.getByLabel('Exposure bands')).toBeChecked();
  });

  test('the keyboard moves the camera and the pause control works', async ({ page }) => {
    await openScene(page, 'v=1&w=volume');
    const pose = page.getByTestId('scene-pose');
    await expect(pose).toContainText('azimuth -38 degrees, elevation 24 degrees, distance 430 m');
    await page.getByRole('group', { name: /Arrow keys orbit/ }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('-');
    await expect(pose).toContainText('azimuth -26 degrees, elevation 30 degrees, distance 482 m');
    await page.keyboard.press('0');
    await expect(pose).toContainText('azimuth -38 degrees, elevation 24 degrees, distance 430 m');
    await page.getByTestId('scene-reset').click();
    await pause(page);
    await expect(page.getByTestId('scene-pause')).toHaveText('Play animation');
  });

  test('dragging and the wheel orbit and zoom', async ({ page }) => {
    await openScene(page, 'v=1&w=isosurface');
    const stage = page.getByRole('group', { name: /Arrow keys orbit/ });
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    const centre = {
      x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
    };
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 100, centre.y, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('scene-pose')).not.toContainText('azimuth -38 degrees');
    await page.mouse.wheel(0, -300);
    await expect(page.getByTestId('scene-pose')).not.toContainText('distance 430 m');
  });

  test('isosurfaces list one swatch for each drawn level', async ({ page }) => {
    await openScene(page, 'v=1&w=isosurface');
    await expect(page.getByTestId('scene-summary')).toContainText('at 3 exposure levels');
    await expect(
      page.getByRole('list', { name: 'Isosurface levels' }).locator('.swatch'),
    ).toHaveCount(3);
    await page.keyboard.press('b');
    await expect(page.getByTestId('scene-summary')).toContainText('magnetic flux density');
  });

  test('field lines report their settings and where they end', async ({ page }) => {
    test.setTimeout(150_000);
    await openScene(page, 'v=1&w=lines&ang=30');
    await pause(page);
    await expect(page.getByTestId('line-count-value')).toHaveText('128');
    await expect(page.getByTestId('step-count-value')).toHaveText('192');
    await expect(page.getByTestId('scene-summary')).toContainText('electric field lines');
    await expect(page.getByTestId('scene-summary')).toContainText('end on the ground', {
      timeout: 60_000,
    });
    await page.getByRole('slider', { name: 'Lines', exact: true }).focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('line-count-value')).toHaveText('16');
    await expect(page.getByTestId('scene-summary')).toContainText(
      /(^|\s)\d{1,2} electric field lines/,
      {
        timeout: 60_000,
      },
    );
  });

  test('the field line animation runs and is paused under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openScene(page, 'v=1&w=lines&ang=30');
    await expect(page.getByTestId('scene-pause')).toHaveText('Play animation');
    const before = (await callAutomation(page, 'appState'))?.settings.phaseDegrees;
    await page.waitForTimeout(600);
    expect((await callAutomation(page, 'appState'))?.settings.phaseDegrees).toBe(before);
    await page.getByTestId('scene-pause').click();
    await expect
      .poll(async () => (await callAutomation(page, 'appState'))?.settings.phaseDegrees)
      .not.toBe(before);
  });

  test('the volume view reads back a frame with many distinct colours', async ({ page }) => {
    await openScene(page, 'v=1&w=volume');
    await pause(page);
    await page.waitForTimeout(500);
    const capture = await callAutomation(page, 'captureFrame', CAPTURE);
    expect(capture).not.toBeNull();
    const colours = new Set<number>();
    for (let index = 0; index < (capture?.pixels.length ?? 0); index += 4) {
      colours.add(
        ((capture?.pixels[index] ?? 0) << 16) |
          ((capture?.pixels[index + 1] ?? 0) << 8) |
          (capture?.pixels[index + 2] ?? 0),
      );
    }
    expect(colours.size).toBeGreaterThan(30);
  });

  test('the cross-section model shows the notice instead of a 3D view', async ({ page }) => {
    await openScene(page, 'v=1&w=volume');
    await callAutomation(page, 'setSettings', { model: 'cross-section-2d' });
    await expect(page.getByTestId('scene-unavailable')).toContainText('not available');
    await expect(page.getByTestId('views3d-notice')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Volume/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
