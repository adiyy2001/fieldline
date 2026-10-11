import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { callAutomation } from './automation.ts';

async function openProfile(page: Page, query = ''): Promise<void> {
  await page.goto(`/?automation&v=1&w=profile${query === '' ? '' : `&${query}`}`);
  await page.waitForFunction(() => 'fieldline' in window);
  await page.evaluate(
    () => (window as unknown as { fieldline: { ready: Promise<void> } }).fieldline.ready,
  );
  await callAutomation(page, 'settle');
  await expect(page.getByRole('heading', { name: 'Lateral profile' })).toBeVisible();
}

async function tableRows(page: Page): Promise<number[][]> {
  await page.getByRole('button', { name: 'Data table' }).click();
  const tableRowsLocator = page.locator('[data-testid="profile-table"] tbody tr');
  await expect(tableRowsLocator).not.toHaveCount(0);
  const cells = await tableRowsLocator.evaluateAll((rows) =>
    rows.map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent)),
  );
  return cells.map((row) => row.map((cell) => Number(cell)));
}

test.describe('the profile view', () => {
  test('the data table holds the same numbers the chart draws', async ({ page }) => {
    await openProfile(page);
    const slider = page.getByRole('slider', { name: 'Position along both profiles' });
    const pathPoints = await page
      .locator('fl-line-chart')
      .first()
      .locator('path.series')
      .first()
      .getAttribute('d');
    expect(pathPoints?.match(/[ML]/g)).toHaveLength(241);

    await slider.focus();
    await page.keyboard.press('Home');
    const readout = page.getByTestId('profile-readout');
    await expect(readout).toContainText('x = -60 m');
    const first = (await readout.textContent()) ?? '';
    await page.keyboard.press('End');
    await expect(readout).toContainText('x = 60 m');
    const last = (await readout.textContent()) ?? '';

    const rows = await tableRows(page);
    expect(rows).toHaveLength(241);
    const parse = (text: string) => {
      const match = /E ([\d.]+) kV\/m, B ([\d.]+) µT/.exec(text);
      return [Number(match?.[1]), Number(match?.[2])];
    };
    const [firstE, firstB] = parse(first);
    const [lastE, lastB] = parse(last);
    expect(rows[0]?.[1]).toBeCloseTo(firstE ?? 0, 1);
    expect(rows[0]?.[2]).toBeCloseTo(firstB ?? 0, 1);
    expect(rows[240]?.[1]).toBeCloseTo(lastE ?? 0, 1);
    expect(rows[240]?.[2]).toBeCloseTo(lastB ?? 0, 1);
  });

  test('the chart description names the peak the table contains', async ({ page }) => {
    await openProfile(page);
    const summary = (await page.getByTestId('profile-summary').textContent()) ?? '';
    const peakE = Number(/peak E ([\d.]+) kV\/m/.exec(summary)?.[1]);
    const rows = await tableRows(page);
    const maxE = Math.max(...rows.map((row) => row[1] ?? 0));
    expect(maxE).toBeCloseTo(peakE, 1);
  });

  test('the CSV download matches the table and the default line', async ({ page }) => {
    await openProfile(page);
    const rows = await tableRows(page);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('fieldline-profile.csv');
    const path = await download.path();
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines[0]).toBe('distance_m,E_kV_per_m,B_uT');
    expect(lines).toHaveLength(242);
    const parsed = lines.slice(1).map((line) => line.split(',').map(Number));
    parsed.forEach((values, index) => {
      expect(values[0]).toBeCloseTo(rows[index]?.[0] ?? Number.NaN, 3);
      expect(values[1]).toBeCloseTo(rows[index]?.[1] ?? Number.NaN, 4);
      expect(values[2]).toBeCloseTo(rows[index]?.[2] ?? Number.NaN, 4);
    });
    const centre = parsed.find((values) => values[0] === 0);
    expect(centre?.[1]).toBeCloseTo(0.76, 2);
    expect(centre?.[2]).toBeCloseTo(7.75, 2);
  });

  test('the 3D result and the 2D overlay agree on a long straight line', async ({ page }) => {
    await openProfile(page, 'o2=1');
    await callAutomation(page, 'setParameters', {
      spanLengths: [800, 800, 800],
      phaseSag: 0,
    });
    await callAutomation(page, 'settle');
    await expect(page.getByText('Overlay the 2D cross-section')).toBeVisible();
    const rows = await tableRows(page);
    const centre = rows.find((row) => row[0] === 0);
    const side = rows.find((row) => row[0] === 30);
    for (const row of [centre, side]) {
      expect(row?.[3]).toBeGreaterThan(0);
      expect(Math.abs((row?.[1] ?? 0) / (row?.[3] ?? 1) - 1)).toBeLessThan(0.03);
      expect(Math.abs((row?.[2] ?? 0) / (row?.[4] ?? 1) - 1)).toBeLessThan(0.03);
    }
  });

  test('the section slider moves the profile along the span', async ({ page }) => {
    await openProfile(page);
    const before = await page.getByTestId('profile-summary').textContent();
    await page.getByLabel('Section along the span').fill('0');
    await expect(page.getByTestId('profile-caption')).toContainText('0 percent along span 2 of 3');
    await expect(page.getByTestId('profile-summary')).not.toHaveText(before ?? '');
  });

  test('every control works from the keyboard', async ({ page }) => {
    await openProfile(page);
    await page.getByRole('button', { name: 'Charts' }).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('profile-table')).toBeVisible();
    await page.getByRole('button', { name: 'Charts' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('slider', { name: 'Position along both profiles' })).toBeVisible();
    const section = page.getByLabel('Section along the span');
    await section.focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('profile-caption')).toContainText('100 percent');
    await page.getByLabel('Overlay the 2D cross-section').focus();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Overlay the 2D cross-section')).toBeChecked();
    const slider = page.getByRole('slider', { name: 'Position along both profiles' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('profile-readout')).toContainText('2D model');
  });

  test('levels can be added, listed with their crossings and removed', async ({ page }) => {
    await openProfile(page);
    await page.getByLabel('Level', { exact: true }).fill('2');
    await page.getByLabel('Name').fill('Site limit');
    await page.getByRole('button', { name: 'Add level' }).click();
    await expect(page.getByTestId('level-message')).toContainText('Added 2 kV/m');
    const crossings = page.getByTestId('profile-crossings');
    await expect(crossings).toContainText('Site limit');
    await expect(crossings.locator('tr', { hasText: 'Site limit' })).toContainText('left -');
    await expect(page).toHaveURL(/cl=e/);
    await page.getByRole('button', { name: 'Remove 2 kV/m' }).click();
    await expect(crossings).not.toContainText('Site limit');
  });
});
