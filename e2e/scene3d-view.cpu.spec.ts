import { expect, test } from '@playwright/test';
import { callAutomation } from './automation.ts';

test.describe('the 3D views without a graphics adapter', () => {
  test('the tabs are disabled and the notice explains why', async ({ page }) => {
    await page.goto('/?automation');
    await page.waitForFunction(() => 'fieldline' in window);
    await callAutomation(page, 'settle');
    await expect(page.getByTestId('views3d-notice')).toContainText('need WebGPU');
    for (const name of ['Volume', 'Isosurfaces', 'Field lines']) {
      const tab = page.getByRole('tab', { name: new RegExp(name) });
      await expect(tab).toHaveAttribute('aria-disabled', 'true');
      await expect(tab).toHaveAttribute('aria-describedby', 'fl-views3d-notice');
    }
    await page.getByRole('tab', { name: /Volume/ }).click({ force: true });
    await expect(page.getByRole('tab', { name: /Ground/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('4');
    await expect(page.getByRole('tab', { name: /Ground/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('a link to a 3D view shows the notice instead of a canvas', async ({ page }) => {
    await page.goto('/?automation&v=1&w=lines');
    await page.waitForFunction(() => 'fieldline' in window);
    await callAutomation(page, 'settle');
    await expect(page.getByTestId('scene-unavailable')).toBeVisible();
    await expect(page.locator('fl-scene3d-view')).toHaveCount(0);
  });
});
