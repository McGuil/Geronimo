import type { Metric } from './state';

export const hardware = {
  cpu: { name: 'AMD Ryzen 9 7950X', short: 'Ryzen 9 7950X', category: 'Processor', detail: '16 cores · 32 threads', unit: '%', color: 'var(--cpu)' },
  gpu: { name: 'NVIDIA GeForce RTX 4080', short: 'GeForce RTX 4080', category: 'Graphics card', detail: '16 GB GDDR6X', unit: '%', color: 'var(--gpu)' },
  ram: { name: 'Kingston FURY DDR5', short: '32 GB DDR5', category: 'Memory', detail: '2 × 16 GB · 6000 MT/s', unit: '%', color: 'var(--ram)' },
};
export interface Reading { usage: number | null; temperature: number | null; clock: number | null; power: number | null; temperatureLabel?: string }
let tick = 450;
export const series: Record<Metric, (number | null)[]> = { cpu: [], gpu: [], ram: [] };
export const timestamps: number[] = [];
export const runtime = { native: false, connected: false, totalMemoryGb: 32, usedMemoryGb: 0, os: 'Windows 11', statusMessage: '', devices: [] as { id: string; name: string; kind: string }[], selectedGpu: '' };
let nativeSensors: Sensor[] = [];
function sample(t: number, kind: Metric): number {
  if (kind === 'cpu') return Math.round(26 + Math.sin(t * .14) * 8 + Math.sin(t * .71) * 5 + Math.cos(t * .31) * 3);
  if (kind === 'gpu') return Math.round(40 + Math.sin(t * .12 + 2) * 12 + Math.cos(t * .51) * 6);
  return Math.round(43 + Math.sin(t * .025) * 4 + Math.cos(t * .11) * 1.5);
}
for (let t = 1; t <= tick; t++) { timestamps.push(Date.now() - (tick - t) * 2000); for (const key of ['cpu', 'gpu', 'ram'] as const) series[key].push(sample(t, key)); }
export const readings: Record<Metric, Reading> = {
  cpu: { usage: 0, temperature: 0, clock: 4.8, power: 82 },
  gpu: { usage: 0, temperature: 0, clock: 2.5, power: 146 },
  ram: { usage: 0, temperature: 0, clock: 6000, power: 8 },
};
function sync(): void {
  for (const key of ['cpu', 'gpu', 'ram'] as const) readings[key].usage = series[key].at(-1)!;
  readings.cpu.temperature = Math.round(45 + readings.cpu.usage! * .37);
  readings.gpu.temperature = Math.round(38 + readings.gpu.usage! * .4);
  readings.ram.temperature = 41 + Math.round(Math.sin(tick * .03) * 2);
}
sync();
export function advance(): void {
  tick++;
  timestamps.push(Date.now()); timestamps.shift();
  for (const key of ['cpu', 'gpu', 'ram'] as const) { series[key].push(sample(tick, key)); series[key].shift(); }
  sync();
}
export interface Sensor { name: string; detail: string; icon: string; temperature: number | null; min: number | null; max: number | null; metric?: Metric }
export function sensors(): Sensor[] {
  if (runtime.native) return nativeSensors;
  return [
    { name: 'CPU package', detail: hardware.cpu.short, icon: 'cpu', temperature: readings.cpu.temperature, min: 42, max: 73, metric: 'cpu' },
    { name: 'GPU core', detail: hardware.gpu.short, icon: 'gpu', temperature: readings.gpu.temperature, min: 39, max: 68, metric: 'gpu' },
    { name: 'GPU hotspot', detail: 'Graphics sensor', icon: 'gpu', temperature: readings.gpu.temperature! + 13, min: 51, max: 82, metric: 'gpu' },
    { name: 'GPU memory junction', detail: 'GDDR6X', icon: 'gpu', temperature: readings.gpu.temperature! + 9, min: 48, max: 78, metric: 'gpu' },
    { name: 'DIMM A2', detail: 'Kingston FURY · 16 GB', icon: 'ram', temperature: readings.ram.temperature, min: 37, max: 46, metric: 'ram' },
    { name: 'DIMM B2', detail: 'Temperature sensor not exposed', icon: 'ram', temperature: null, min: null, max: null, metric: 'ram' },
    { name: 'Samsung 990 PRO', detail: 'NVMe SSD · 1 TB', icon: 'disk', temperature: 38, min: 32, max: 45 },
    { name: 'Motherboard', detail: 'System sensor', icon: 'cpu', temperature: 35, min: 30, max: 39 },
    { name: 'VRM', detail: 'Power delivery', icon: 'bolt', temperature: 43, min: 34, max: 51 },
    { name: 'Chipset', detail: 'Platform sensor', icon: 'cpu', temperature: 47, min: 39, max: 54 },
  ];
}
export function chartPath(values: (number | null)[], width = 600, height = 150): string {
  return values.map((v, i) => v === null ? '' : `${i && values[i - 1] !== null ? 'L' : 'M'}${(i / Math.max(1, values.length - 1) * width).toFixed(1)},${(height - v / 100 * (height - 12) - 6).toFixed(1)}`).join(' ');
}
export function windowedSeries(metric: Metric, seconds: number): (number | null)[] {
  const cutoff = (timestamps.at(-1) ?? Date.now()) - seconds * 1000;
  const start = timestamps.findIndex(time => time >= cutoff);
  return series[metric].slice(Math.max(0, start));
}
export function statistics(metric: Metric): { average: string; peak: string } {
  const values = series[metric].filter((v): v is number => v !== null);
  return { average: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length).toString() : '—', peak: values.length ? Math.round(Math.max(...values)).toString() : '—' };
}
export interface ProcessInfo { name: string; description: string; icon: string; cpu: number | null; ram: number; gpu: number | null }
export let processes: ProcessInfo[] = [
  { name: 'Google Chrome', description: 'Browser · 12 processes', icon: 'chrome', cpu: 8.4, ram: 1842, gpu: 3.2 },
  { name: 'Visual Studio Code', description: 'Code editor · 8 processes', icon: 'code', cpu: 5.2, ram: 1126, gpu: 1.1 },
  { name: 'Discord', description: 'Communication · 6 processes', icon: 'discord', cpu: 2.1, ram: 458, gpu: 0.8 },
  { name: 'Spotify', description: 'Music · 4 processes', icon: 'spotify', cpu: 1.3, ram: 312, gpu: 0.2 },
  { name: 'Windows Explorer', description: 'System · 3 processes', icon: 'windows', cpu: 0.8, ram: 186, gpu: 0.1 },
  { name: 'Desktop Window Manager', description: 'System · 1 process', icon: 'windows', cpu: 0.6, ram: 94, gpu: 2.6 },
  { name: 'Steam', description: 'Gaming · 5 processes', icon: 'steam', cpu: 0.4, ram: 285, gpu: 0.0 },
  { name: 'Geronimo UI', description: 'Illustrative demo process', icon: 'geronimo', cpu: 0.2, ram: 26, gpu: 0.0 },
];
export interface NativeSnapshot {
  type: 'telemetry'; timestamp: number;
  hardware: Record<Metric, { name: string; short: string; detail: string }>;
  readings: Record<Metric, Reading>; sensors: Sensor[];
  devices: { id: string; name: string; kind: string }[];
  totalMemoryGb: number; usedMemoryGb: number; os: string; statusMessage: string;
  processes: ProcessInfo[] | null;
}
export function initializeNative(): void {
  runtime.native = true;
  for (const m of ['cpu', 'gpu', 'ram'] as Metric[]) {
    readings[m] = { usage: null, temperature: null, clock: null, power: null };
    hardware[m].name = `Detecting ${m.toUpperCase()}…`; hardware[m].short = hardware[m].name; hardware[m].detail = 'Waiting for hardware sensors';
    series[m] = [];
  }
  timestamps.length = 0;
  processes = [];
  runtime.totalMemoryGb = 0;
}
export function acceptSnapshot(snapshot: NativeSnapshot): boolean {
  const signature = () => JSON.stringify([Object.values(hardware).map(h => [h.name, h.short]), Object.values(readings).map(r => r.temperatureLabel), nativeSensors.map(s => [s.name, s.detail]), runtime.devices]);
  const before = signature();
  runtime.connected = true;
  runtime.totalMemoryGb = snapshot.totalMemoryGb; runtime.usedMemoryGb = snapshot.usedMemoryGb;
  runtime.os = snapshot.os; runtime.devices = snapshot.devices; runtime.statusMessage = snapshot.statusMessage;
  if (!snapshot.devices.some(d => d.kind === 'gpu' && d.id === runtime.selectedGpu)) runtime.selectedGpu = snapshot.devices.find(d => d.kind === 'gpu')?.id ?? '';
  for (const m of ['cpu', 'gpu', 'ram'] as Metric[]) {
    Object.assign(hardware[m], snapshot.hardware[m]);
    readings[m] = snapshot.readings[m];
    series[m].push(snapshot.readings[m].usage); if (series[m].length > 1800) series[m].shift();
  }
  timestamps.push(snapshot.timestamp); if (timestamps.length > 1800) timestamps.shift();
  nativeSensors = snapshot.sensors;
  if (snapshot.processes !== null) processes = snapshot.processes;
  return before !== signature();
}
