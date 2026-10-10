import { expect, test } from '@playwright/test';

test.describe('WebGPU in the production build', () => {
  test('the browser offers an adapter', async ({ page }) => {
    await page.goto('/');
    const architecture = await page.evaluate(async () => {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter?.info.architecture ?? null;
    });
    expect(architecture).not.toBeNull();
  });

  test('the shell reports a ready device and a correct compute kernel', async ({ page }) => {
    await page.goto('/');
    const status = page.getByRole('status');
    await expect(status).toHaveAttribute('data-state', 'ready');
    await expect(status).toContainText('WebGPU is ready.');
    await expect(status).toContainText('Compute check: 1000 of 1000 values correct.');
  });

  test('the shell lists the adapter that ran the kernel', async ({ page }) => {
    await page.goto('/');
    const adapter = page.getByRole('status').locator('.adapter');
    await expect(adapter.getByText('Vendor')).toBeVisible();
    await expect(adapter.getByText('Architecture')).toBeVisible();
    await expect(adapter.getByText('Software (CPU emulation)')).toBeVisible();
  });

  test('the production build loads without console errors', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        problems.push(message.text());
      }
    });
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('status')).toContainText('Compute check: 1000 of 1000');
    expect(problems).toEqual([]);
  });
});
