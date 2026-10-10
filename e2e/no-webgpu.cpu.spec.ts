import { expect, test } from '@playwright/test';

test.describe('a browser without a usable WebGPU adapter', () => {
  test('the shell says that no adapter is available', async ({ page }) => {
    await page.goto('/');
    const status = page.getByRole('status');
    await expect(status).toHaveAttribute('data-state', 'unsupported');
    await expect(status).toContainText('WebGPU is present but no graphics adapter is available.');
    await expect(status).toContainText('requestAdapter returned null');
  });

  test('the shell shows no adapter list and no compute check', async ({ page }) => {
    await page.goto('/');
    const status = page.getByRole('status');
    await expect(status).toHaveAttribute('data-state', 'unsupported');
    await expect(status.locator('.adapter')).toHaveCount(0);
    await expect(status.locator('.kernel')).toHaveCount(0);
  });

  test('the shell says so when the browser has no WebGPU API at all', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    });
    await page.goto('/');
    const status = page.getByRole('status');
    await expect(status).toHaveAttribute('data-state', 'unsupported');
    await expect(status).toContainText('This browser does not expose WebGPU.');
  });
});
