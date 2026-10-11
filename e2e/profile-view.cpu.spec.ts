import { expect, test, type Page } from '@playwright/test';
import { callAutomation } from './automation.ts';

async function openProfile(page: Page, query = ''): Promise<void> {
  await page.goto(`/?automation&v=1&w=profile${query === '' ? '' : `&${query}`}`);
  await page.waitForFunction(() => 'fieldline' in window);
  await page.evaluate(
    () => (window as unknown as { fieldline: { ready: Promise<void> } }).fieldline.ready,
  );
  await callAutomation(page, 'settle');
}

test.describe('the profile view without a graphics adapter', () => {
  test('draws both charts, the levels and the summary from the CPU frame', async ({ page }) => {
    await openProfile(page);
    await expect(page.getByTestId('fallback-notice')).toContainText('computed on the CPU');
    await expect(page.locator('fl-line-chart')).toHaveCount(2);
    await expect(page.getByTestId('profile-summary')).toContainText('peak E 2.26 kV/m');
    await expect(page.getByTestId('profile-summary')).toContainText('peak B 7.75 µT');
    await expect(page.getByTestId('profile-crossings')).toContainText('left -34.3 m, right 34.3 m');
  });

  test('the 2D model shows the profile without a section', async ({ page }) => {
    await openProfile(page, 'm=cross-section-2d');
    await expect(page.getByLabel('Section along the span')).toBeDisabled();
    await expect(page.getByLabel('Overlay the 2D cross-section')).toBeDisabled();
    await expect(page.getByTestId('profile-caption')).toContainText('infinite parallel conductors');
  });

  test('the phone layout keeps the page free of horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openProfile(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the parameter panel starts collapsed on a phone and opens on demand', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openProfile(page);
    const voltage = page.getByLabel('Line voltage', { exact: true });
    await expect(voltage).toBeHidden();
    await page.getByText('Parameters', { exact: true }).click();
    await expect(voltage).toBeVisible();
  });

  test('the parameter panel is open on a wide screen without a toggle', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openProfile(page);
    await expect(page.getByLabel('Line voltage', { exact: true })).toBeVisible();
    await expect(page.getByText('Parameters', { exact: true })).toBeHidden();
  });
});
