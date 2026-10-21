import { test, expect } from '@playwright/test';

// Explicit fixtures exercise the WebView2 message contract, not real Windows sensors.
const fixture = () => ({
  type: 'telemetry', timestamp: Date.now(),
  hardware: {
    cpu: { name: 'Intel Core i7-14700K', short: 'Intel Core i7-14700K', detail: '28 logical processors' },
    gpu: { name: 'AMD Radeon RX 7900 XT', short: 'AMD Radeon RX 7900 XT', detail: '2 graphics adapters detected' },
    ram: { name: 'System memory', short: '31.8 GB usable RAM', detail: '12.4 / 31.8 GB in use' },
  },
  readings: {
    cpu: { usage: 23, temperature: 52, clock: 4.7, power: 68, temperatureLabel: 'CPU Package' },
    gpu: { usage: 38, temperature: 57, clock: 2.3, power: 160, temperatureLabel: 'GPU Core' },
    ram: { usage: 39, temperature: null, clock: null, power: null, temperatureLabel: 'Sensor unavailable' },
  },
  sensors: [
    { name: 'CPU Package', detail: 'Intel Core i7-14700K', icon: 'cpu', temperature: 52, min: 37, max: 65, metric: 'cpu' },
    { name: 'GPU Core', detail: 'AMD Radeon RX 7900 XT', icon: 'gpu', temperature: 57, min: 36, max: 71, metric: 'gpu' },
    { name: 'RAM temperature', detail: 'No sensor exposed', icon: 'ram', temperature: null, min: null, max: null, metric: 'ram' },
  ],
  devices: [
    { id: '/intelcpu/0', name: 'Intel Core i7-14700K', kind: 'cpu' },
    { id: '/amdgpu/0', name: 'AMD Radeon RX 7900 XT', kind: 'gpu' },
    { id: '/intelgpu/0', name: 'Intel UHD Graphics 770', kind: 'gpu' },
  ],
  totalMemoryGb: 31.8, usedMemoryGb: 12.4, os: 'Windows 11', statusMessage: 'Fixture sensor provider connected.',
  processes: [{ name: '<script>test</script>', description: 'PID 123', icon: 'windows', cpu: null, ram: 25.5, gpu: null }],
});

async function mockHost(page) {
  await page.addInitScript(() => {
    window.__nativeMessages = [];
    window.chrome ??= {};
    window.chrome.webview = {
      postMessage: message => window.__nativeMessages.push(message),
      addEventListener: (_type, listener) => { window.__deliverSnapshot = data => listener({ data }); },
    };
  });
  await page.goto('/');
}

test('native startup clears all demo hardware and accepts real-source contract with null temperatures', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await mockHost(page);
  await expect(page.getByText('Connecting sensors', { exact: true })).toBeVisible();
  await expect(page.getByText('Ryzen 9 7950X', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-widget="cpu"] [data-live="cpu-usage"]')).toHaveText('—');
  await page.evaluate(data => window.__deliverSnapshot(data), fixture());
  await expect(page.getByText('Intel Core i7-14700K', { exact: true })).toBeVisible();
  await expect(page.locator('[data-widget="ram"] .temperature-pill')).toContainText('Unavailable');
  await expect(page.locator('[data-widget="ram"] .metric-footer')).not.toContainText('6000');
  await expect(page.locator('.demo-status')).toHaveText('Live sensors');
  await page.getByRole('button', { name: 'Inspect GPU sensors' }).click();
  await expect(page.locator('#gpu-device-select option')).toHaveCount(2);
  await page.locator('#gpu-device-select').selectOption('/intelgpu/0');
  expect(await page.evaluate(() => window.__nativeMessages.some(m => m.type === 'select-gpu' && m.id === '/intelgpu/0'))).toBe(true);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.locator('[data-widget="gpu"] [data-live="gpu-usage"]')).toHaveText('—');
  const selected = fixture(); selected.hardware.gpu.name = 'Intel UHD Graphics 770'; selected.hardware.gpu.short = 'Intel UHD Graphics 770'; selected.readings.gpu.usage = 7;
  await page.evaluate(data => window.__deliverSnapshot(data), selected);
  await expect(page.locator('[data-widget="gpu"] [data-live="gpu-usage"]')).toHaveText('7');
  expect(errors).toEqual([]);
});

test('native overlay controls reach host and hotkey state syncs back to the UI', async ({ page }) => {
  await mockHost(page);
  await page.evaluate(data => window.__deliverSnapshot(data), fixture());
  await page.getByRole('link', { name: 'Overlay studio' }).click();
  await page.getByRole('button', { name: 'Show desktop overlay' }).click();
  await page.getByRole('checkbox', { name: 'Click-through' }).check();
  expect(await page.evaluate(() => window.__nativeMessages.some(m => m.type === 'preferences' && m.settings.overlay.visible && m.settings.overlay.clickThrough))).toBe(true);
  await expect(page.getByRole('region', { name: 'Floating overlay preview' })).toHaveCount(0);
  await page.evaluate(() => window.__deliverSnapshot({ type: 'overlay-state', visible: false }));
  await expect(page.getByRole('button', { name: 'Show desktop overlay' })).toBeVisible();
});

test('native processes escape names, preserve missing readings and keep search focused during updates', async ({ page }) => {
  await mockHost(page);
  await page.evaluate(data => window.__deliverSnapshot(data), fixture());
  await page.getByRole('link', { name: 'Processes', exact: true }).click();
  await expect(page.locator('#process-rows')).toContainText('<script>test</script>');
  await expect(page.locator('#process-rows script')).toHaveCount(0);
  const search = page.getByRole('searchbox', { name: 'Find a process' });
  await search.fill('test');
  const update = fixture(); update.timestamp += 2000; update.readings.cpu.usage = 31;
  await page.evaluate(data => window.__deliverSnapshot(data), update);
  await expect(search).toBeFocused();
  await expect(page.locator('#process-rows')).toContainText('—');
});
