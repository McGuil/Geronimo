export type Metric = 'cpu' | 'gpu' | 'ram';
export type Theme = 'graphite' | 'midnight' | 'light';
export type Page = 'overview' | 'hardware' | 'processes' | 'history' | 'overlay';
export interface Settings {
  theme: Theme;
  accent: 'mint' | 'violet' | 'blue' | 'amber';
  density: 'comfortable' | 'compact';
  refresh: number;
  fahrenheit: boolean;
  reducedMotion: boolean;
  order: Metric[];
  hidden: Metric[];
  overlay: {
    visible: boolean;
    opacity: number;
    scale: number;
    layout: 'stacked' | 'inline';
    metrics: Metric[];
    position: { x: number; y: number } | null;
    clickThrough: boolean;
  };
}
export const STORAGE_KEY = 'geronimo.preferences.v1';
export const defaults = (): Settings => ({
  theme: 'graphite', accent: 'mint', density: 'comfortable', refresh: 2000,
  fahrenheit: false, reducedMotion: false,
  order: ['cpu', 'gpu', 'ram'], hidden: [],
  overlay: { visible: false, opacity: 90, scale: 100, layout: 'stacked', metrics: ['cpu', 'gpu', 'ram'], position: null, clickThrough: false },
});
export function loadSettings(): Settings {
  const result = defaults();
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return result;
    if (['graphite', 'midnight', 'light'].includes(value.theme)) result.theme = value.theme;
    if (['mint', 'violet', 'blue', 'amber'].includes(value.accent)) result.accent = value.accent;
    if (['comfortable', 'compact'].includes(value.density)) result.density = value.density;
    if ([1000, 2000, 5000].includes(value.refresh)) result.refresh = value.refresh;
    for (const key of ['fahrenheit', 'reducedMotion'] as const) if (typeof value[key] === 'boolean') result[key] = value[key];
    if (Array.isArray(value.order) && value.order.length === 3 && new Set(value.order).size === 3 && value.order.every((m: string) => ['cpu', 'gpu', 'ram'].includes(m))) result.order = value.order;
    if (Array.isArray(value.hidden)) result.hidden = ['cpu', 'gpu', 'ram'].filter(m => value.hidden.includes(m)) as Metric[];
    if (value.overlay && typeof value.overlay === 'object') {
      const overlay = value.overlay;
      if (typeof overlay.visible === 'boolean') result.overlay.visible = overlay.visible;
      if (typeof overlay.clickThrough === 'boolean') result.overlay.clickThrough = overlay.clickThrough;
      if (Number.isFinite(overlay.opacity)) result.overlay.opacity = Math.max(35, Math.min(100, overlay.opacity));
      if (Number.isFinite(overlay.scale)) result.overlay.scale = Math.max(75, Math.min(140, overlay.scale));
      if (['stacked', 'inline'].includes(overlay.layout)) result.overlay.layout = overlay.layout;
      if (Array.isArray(overlay.metrics)) result.overlay.metrics = ['cpu', 'gpu', 'ram'].filter(m => overlay.metrics.includes(m)) as Metric[];
      if (overlay.position && Number.isFinite(overlay.position.x) && Number.isFinite(overlay.position.y)) result.overlay.position = overlay.position;
    }
  } catch { /* An unavailable or corrupt local store must not prevent startup. */ }
  return result;
}
export function persist(settings: Settings): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}
