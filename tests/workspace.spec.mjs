import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('dashboard is explicit about demo hardware and unavailable sensors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'System overview' })).toBeVisible();
  await expect(page.locator('[data-widget]')).toHaveCount(3);
  await expect(page.getByText('EXAMPLE HARDWARE')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect RAM sensors' }).click();
  await expect(page.getByRole('heading', { name: 'RAM temperatures' })).toBeVisible();
  await expect(page.locator('.hardware-sensors').first().getByRole('row').filter({ hasText: 'DIMM B2' })).toContainText('Unavailable');
  await expect(page.locator('.hardware-sensors').last().getByRole('row')).toHaveCount(11);
  expect(errors).toEqual([]);
});

test('theme, accent, density and unit preferences survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Violet accent' }).click();
  await page.getByRole('button', { name: 'Compact', exact: true }).click();
  await page.getByRole('tab', { name: 'Preferences' }).click();
  await page.getByRole('button', { name: 'Fahrenheit' }).click();
  await page.getByLabel('Simulation refresh interval').selectOption('5000');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.locator('[data-widget="cpu"] .temperature-pill')).toContainText('°F');
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await expect(page.getByLabel('Simulation refresh interval')).toHaveValue('5000');
  await page.getByRole('button', { name: 'Restore default settings' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite');
});

test('widget order and visibility persist without removing hardware sensors', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.getByRole('tab', { name: 'Widgets' }).click();
  await page.getByRole('button', { name: 'Move RAM up' }).click();
  await page.getByRole('button', { name: 'Move RAM up' }).click();
  await page.getByRole('checkbox', { name: 'Show GPU widget' }).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-widget]').first()).toHaveAttribute('data-widget', 'ram');
  await expect(page.locator('[data-widget="gpu"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-widget]').first()).toHaveAttribute('data-widget', 'ram');
  await expect(page.locator('[data-widget]')).toHaveCount(2);
  await page.getByRole('link', { name: 'Hardware', exact: true }).click();
  await page.locator('[data-hardware-tab="gpu"]').click();
  await expect(page.getByRole('heading', { name: 'GPU temperatures' })).toBeVisible();
  await expect(page.locator('.hardware-sensors').first().getByRole('row')).toHaveCount(4);
});

test('overlay customization, drag, keyboard movement and closing work', async ({ page }) => {
  await page.goto('/#overlay');
  await page.getByRole('button', { name: 'Launch floating preview' }).click();
  const overlay = page.getByRole('region', { name: 'Floating overlay preview' });
  await expect(overlay).toBeVisible();
  await page.getByRole('button', { name: 'Horizontal' }).click();
  await expect(overlay).toHaveClass(/inline/);
  await page.getByLabel('Background opacity').fill('65');
  await page.getByRole('slider', { name: /^Scale/ }).fill('110');
  await page.getByRole('checkbox', { name: 'GPU', exact: true }).uncheck();
  await expect(overlay.locator('.overlay-metric')).toHaveCount(2);
  await expect(overlay).toHaveCSS('background-color', 'rgba(15, 21, 19, 0.65)');
  const before = await overlay.boundingBox();
  const handle = page.getByRole('button', { name: 'Move overlay', exact: true });
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 150, handleBox.y + 170, { steps: 8 });
  await page.mouse.up();
  const dragged = await overlay.boundingBox();
  expect(dragged.x).toBeLessThan(before.x - 100);
  expect(dragged.y).toBeGreaterThan(before.y + 100);
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  expect((await overlay.boundingBox()).x).toBeCloseTo(dragged.x - 10, 0);
  const position = await overlay.boundingBox();
  await page.reload();
  await expect(overlay).toBeVisible();
  expect((await overlay.boundingBox()).x).toBeCloseTo(position.x, 0);
  await page.getByRole('button', { name: 'Close floating overlay' }).click();
  await expect(overlay).not.toBeVisible();
});

test('process search and sorting operate on the visible list', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const input = page.getByRole('searchbox', { name: 'Find a process' });
  await expect(input).toBeFocused();
  await input.fill('chrome');
  await expect(page.locator('#process-rows tr')).toHaveCount(1);
  await expect(page.locator('#process-rows')).toContainText('Google Chrome');
  await input.fill('no such process');
  await expect(page.locator('#process-rows')).toContainText('No sample processes');
  await input.fill('');
  await page.getByRole('button', { name: 'Memory', exact: true }).click();
  await expect(page.locator('#process-rows tr').first()).toContainText('Google Chrome');
  await page.getByRole('button', { name: 'Memory', exact: true }).click();
  await expect(page.locator('#process-rows tr').first()).toContainText('Geronimo UI');
});

test('chart controls work and pause freezes playback', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause simulation' }).click();
  const path = await page.locator('[data-chart="cpu"]').getAttribute('d');
  await page.waitForTimeout(2200);
  await expect(page.locator('[data-chart="cpu"]')).toHaveAttribute('d', path);
  await page.getByRole('button', { name: '5m', exact: true }).click();
  expect(await page.locator('[data-chart="cpu"]').getAttribute('d')).not.toBe(path);
  await page.locator('[data-series="gpu"]').click();
  await expect(page.locator('[data-chart="gpu"]')).toHaveAttribute('visibility', 'hidden');
  await page.getByRole('button', { name: 'Resume simulation' }).click();
  const resumed = await page.locator('[data-chart="cpu"]').getAttribute('d');
  await expect.poll(() => page.locator('[data-chart="cpu"]').getAttribute('d')).not.toBe(resumed);
});

test('export produces a complete CSV clearly labeled as simulated', async ({ page }) => {
  await page.goto('/#history');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export demo CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('geronimo-demo-session.csv');
  const content = await readFile(await download.path(), 'utf8');
  const rows = content.split('\r\n');
  expect(rows).toHaveLength(451);
  expect(rows[0]).toBe('source,timestamp,cpu_utilization_percent,gpu_utilization_percent,ram_utilization_percent');
  expect(rows.slice(1).every(row => row.startsWith('simulated,'))).toBe(true);
});

test('mobile navigation and overlay remain inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('link', { name: 'Overlay studio' }).click();
  await page.getByRole('button', { name: 'Horizontal' }).click();
  await page.getByRole('slider', { name: /^Scale/ }).fill('140');
  await page.getByRole('button', { name: 'Launch floating preview' }).click();
  const box = await page.getByRole('region', { name: 'Floating overlay preview' }).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('malformed stored preferences do not break startup', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('geronimo.preferences.v1', JSON.stringify({ theme: 'unknown', order: ['cpu', 'cpu', 'x'], overlay: { metrics: null, opacity: -100, scale: 'bad', position: { x: 'bad' } } })));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'System overview' })).toBeVisible();
  await expect(page.locator('[data-widget]')).toHaveCount(3);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite');
});
