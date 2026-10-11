import { expect, test, type Page } from '@playwright/test';
import { callAutomation } from './automation.ts';

async function openOptimizer(page: Page, query = 't=dc'): Promise<void> {
  await page.goto(`/?automation&v=1&w=optimizer&${query}`);
  await page.waitForFunction(() => 'fieldline' in window);
  await page.evaluate(
    () => (window as unknown as { fieldline: { ready: Promise<void> } }).fieldline.ready,
  );
  await callAutomation(page, 'settle');
  await expect(page.getByRole('heading', { name: 'Phasing optimizer' })).toBeVisible();
}

const rows = (page: Page) => page.locator('[data-testid="optimizer-table"] tbody tr');

test.describe('the phasing optimizer view', () => {
  test('ranks six arrangements and marks the best, the worst and the current one', async ({
    page,
  }) => {
    await openOptimizer(page);
    await expect(rows(page)).toHaveCount(6);
    await expect(rows(page).first()).toContainText('best');
    await expect(page.locator('tr.worst')).toContainText('worst');
    await expect(page.locator('tr.current')).toContainText('ABC | ABC');
  });

  test('applying the best arrangement lowers the peak electric field', async ({ page }) => {
    await openOptimizer(page, 't=dc&coarse-grid');
    const peak = async () => {
      const state = await callAutomation(page, 'appState');
      return state?.maxima?.electric ?? Number.NaN;
    };
    const before = await peak();
    await rows(page).first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('optimizer-announcement')).toContainText('Applied');
    await callAutomation(page, 'settle');
    const after = await peak();
    expect(after).toBeLessThan(before * 0.8);
    await expect(page.locator('tr.current')).toHaveClass(/best/);
    const state = await callAutomation(page, 'appState');
    expect(state?.parameters.phasing).not.toEqual([0, 1, 2, 0, 1, 2]);
  });

  test('the table is operable from the keyboard and sortable', async ({ page }) => {
    await openOptimizer(page);
    await rows(page).first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows(page).nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(rows(page).nth(5)).toBeFocused();
    const header = page.getByRole('button', { name: 'Peak E (kV/m)' });
    await header.click();
    await header.click();
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Peak E');
    const peaks = await page
      .locator('[data-testid="optimizer-table"] tbody tr td:nth-of-type(2)')
      .allTextContents();
    const values = peaks.map(Number);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  test('another criterion changes the ranking and the explanation', async ({ page }) => {
    await openOptimizer(page);
    const before = await page.getByTestId('optimizer-summary').textContent();
    await page.getByLabel('Rank by').selectOption('peak-magnetic');
    await expect(page.getByTestId('optimizer-summary')).not.toHaveText(before ?? '');
    await expect(page.getByTestId('optimizer-explanation')).toContainText(
      'lowest peak magnetic flux density',
    );
  });

  test('a single circuit tower gets an explanation instead of a table', async ({ page }) => {
    await openOptimizer(page, 't=h');
    await expect(page.getByTestId('optimizer-unsupported')).toBeVisible();
    await page.getByRole('button', { name: 'Switch to a double circuit tower' }).click();
    await expect(rows(page)).toHaveCount(6, { timeout: 20_000 });
  });
});
