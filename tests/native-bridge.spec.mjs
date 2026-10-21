import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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

test('Ryzen zero temperature is unavailable and driver setup is actionable', async ({ page }) => {
  await mockHost(page);
  const data = fixture();
  data.hardware.cpu = { name: 'AMD Ryzen 7 5700X', short: 'AMD Ryzen 7 5700X', detail: '16 logical processors' };
  data.readings.cpu.temperature = 0;
  data.readings.cpu.temperatureLabel = 'Core (Tctl/Tdie)';
  data.diagnostics = { driverInstalled: false, driverVersion: null, elevated: false,
    cpu: 'CPU temperature needs PawnIO 2.0 or later.', ram: 'Install PawnIO before checking RAM sensor support.' };
  await page.evaluate(data => window.__deliverSnapshot(data), data);
  await expect(page.locator('[data-widget="cpu"] .temperature-pill')).toContainText('Unavailable');
  await page.getByRole('button', { name: 'Install sensor driver' }).click();
  await page.getByRole('button', { name: 'Restart as administrator' }).click();
  expect(await page.evaluate(() => window.__nativeMessages.some(m => m.type === 'install-driver'))).toBe(true);
  expect(await page.evaluate(() => window.__nativeMessages.some(m => m.type === 'restart-admin'))).toBe(true);
});

test('overlay selects process, uses measured performance, reorders fields and keeps individual DIMM sensors', async ({ page }) => {
  await mockHost(page);
  const data = fixture();
  data.processes = [{ id: 456, name: 'Example game', description: 'PID 456', icon: 'windows', cpu: 12, ram: 1000, gpu: null }];
  data.sensors.push({ id: '/memory/dimm/0/temperature/0', name: 'DIMM #0', detail: 'G.Skill F4-3600C18-8GTZR', icon: 'ram', temperature: 42.8, min: 40, max: 44, metric: 'ram' });
  data.sensors.push({ id: '/memory/dimm/1/temperature/0', name: 'DIMM #1', detail: 'G.Skill F4-3600C18-8GTZR', icon: 'ram', temperature: 42.3, min: 40, max: 43, metric: 'ram' });
  data.performance = { processId: null, processName: null, processCpu: null, processRam: null, fps: null, frameTime: null, ping: null, pingHost: '1.1.1.1', captureStatus: 'Choose a process.', pingStatus: 'Ping disabled.' };
  await page.evaluate(data => window.__deliverSnapshot(data), data);
  await page.getByRole('link', { name: 'Overlay studio' }).click();
  await page.getByRole('checkbox', { name: 'FPS', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Frame time', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Network ping', exact: true }).check();
  await expect(page.locator('[data-live="overlay:fps"]')).toHaveText('Unavailable');
  await page.getByLabel('Game or process').selectOption('456');
  expect(await page.evaluate(() => window.__nativeMessages.some(m => m.type === 'select-process' && m.id === 456))).toBe(true);
  data.performance = { processId: 456, processName: 'Example game', processCpu: 12, processRam: 1000, fps: 144, frameTime: 6.94, ping: 23, pingHost: '1.1.1.1', captureStatus: 'Live PresentMon present rate.', pingStatus: 'ICMP round-trip time.' };
  await page.evaluate(data => window.__deliverSnapshot(data), data);
  await expect(page.locator('[data-live="overlay:fps"]')).toHaveText('144');
  await expect(page.locator('[data-live="overlay:frametime"]')).toHaveText('6.9 ms');
  await expect(page.locator('[data-live="overlay:ping"]')).toHaveText('23 ms');
  await page.getByLabel('Ping host').fill('example.com');
  await page.getByLabel('Ping host').press('Tab');
  expect(await page.evaluate(() => window.__nativeMessages.some(m => m.type === 'preferences' && m.settings.overlay.pingHost === 'example.com'))).toBe(true);
  await page.getByRole('button', { name: 'Move FPS up', exact: true }).click();
  await page.getByText('Individual temperature sensors', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'DIMM #0 · G.Skill F4-3600C18-8GTZR', exact: true }).check();
  await page.getByRole('checkbox', { name: 'DIMM #1 · G.Skill F4-3600C18-8GTZR', exact: true }).check();
  await expect(page.locator('#studio-overlay .overlay-metric')).toHaveCount(8);
  await expect(page.locator('[data-live="overlay:sensor:/memory/dimm/0/temperature/0"]')).toHaveText('43°C');
  await page.reload();
  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('geronimo.preferences.v1')));
  expect(preferences.overlay.metrics.slice(0, 4)).toEqual(['cpu', 'gpu', 'fps', 'ram']);
  expect(preferences.overlay.metrics).toContain('sensor:/memory/dimm/1/temperature/0');
});

test('background preferences persist and the background button reaches the native host', async ({ page }) => {
  await mockHost(page);
  await page.evaluate(data => window.__deliverSnapshot(data), fixture());
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Minimize to tray', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Close to tray', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Minimize to tray', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Close to tray', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Run in background', exact: true }).click();
  expect(await page.evaluate(() => window.__nativeMessages.some(m => m.type === 'run-in-background'))).toBe(true);
  expect(await page.evaluate(() => window.__nativeMessages.some(m => m.type === 'preferences' && m.settings.minimizeToTray === false && m.settings.closeToTray === false))).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Minimize to tray', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Close to tray', exact: true })).not.toBeChecked();
});

test('restoring background history preserves samples, missing readings, timestamps and tray pause state', async ({ page }) => {
  await mockHost(page);
  const data = fixture();
  await page.evaluate(data => window.__deliverSnapshot(data), data);
  await page.evaluate(() => window.__deliverSnapshot({ type: 'monitoring-state', paused: true }));
  await expect(page.getByRole('button', { name: 'Resume monitoring', exact: true })).toBeVisible();
  await page.evaluate(() => window.__deliverSnapshot({ type: 'monitoring-state', paused: false }));
  await expect(page.getByRole('button', { name: 'Pause monitoring', exact: true })).toBeVisible();
  const samples = [
    { timestamp: data.timestamp - 4000, cpu: 10, gpu: 20, ram: 30 },
    { timestamp: data.timestamp - 2000, cpu: null, gpu: 21, ram: 31 },
    { timestamp: data.timestamp, cpu: 12, gpu: 22, ram: 32 },
  ];
  await page.evaluate(samples => window.__deliverSnapshot({ type: 'history-sync', samples }), samples);
  data.timestamp += 2000;
  await page.evaluate(data => window.__deliverSnapshot(data), data);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export session CSV', exact: true }).click();
  const download = await pending;
  const rows = (await readFile(await download.path(), 'utf8')).split('\r\n');
  expect(rows).toHaveLength(5);
  expect(rows[1]).toBe(`windows-sensors,${new Date(samples[0].timestamp).toISOString()},10,20,30`);
  expect(rows[2]).toBe(`windows-sensors,${new Date(samples[1].timestamp).toISOString()},,21,31`);
  expect(rows[4]).toBe(`windows-sensors,${new Date(data.timestamp).toISOString()},23,38,39`);
});
