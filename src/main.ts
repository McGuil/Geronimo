import './styles.css';
import { icon } from './icons';
import { defaults, loadSettings, persist, type Metric, type Page } from './state';
import { advance, chartPath, hardware, processes, readings, sensors, series, timestamps, runtime, initializeNative, acceptSnapshot, windowedSeries, statistics, type NativeSnapshot } from './telemetry';
import { nativeBridge, sendNative } from './bridge';

if (nativeBridge) initializeNative();

const app = document.querySelector<HTMLDivElement>('#app')!;
const dialog = document.querySelector<HTMLDialogElement>('#customizer')!;
const overlayRoot = document.querySelector<HTMLDivElement>('#overlay-root')!;
let settings = loadSettings();
const pages: Page[] = ['overview', 'hardware', 'processes', 'history', 'overlay'];
let page: Page = pages.includes(location.hash.slice(1) as Page) ? location.hash.slice(1) as Page : 'overview';
let paused = false;
let range = 60;
let activeHardware: Metric = 'cpu';
let customTab = 'appearance';
let processQuery = '';
let sortKey: 'cpu' | 'ram' | 'gpu' = 'cpu';
let sortDirection = -1;
const chartMetrics = new Set<Metric>(['cpu', 'gpu', 'ram']);
let timer: ReturnType<typeof setInterval>;
let toastTimer: ReturnType<typeof setTimeout>;
let lastDialogTrigger: HTMLElement | null = null;
const names: Record<Page, string> = { overview: 'Overview', hardware: 'Hardware', processes: 'Processes', history: 'History', overlay: 'Overlay studio' };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const temperature = (value: number | null) => value === null ? 'Unavailable' : `${Math.round(settings.fahrenheit ? value * 9 / 5 + 32 : value)}°${settings.fahrenheit ? 'F' : 'C'}`;
const usage = (metric: Metric) => readings[metric].usage === null ? '—' : Math.round(readings[metric].usage!);
const ramUsed = () => runtime.native ? runtime.connected ? runtime.usedMemoryGb.toFixed(1) : '—' : (readings.ram.usage! * 32 / 100).toFixed(1);
const action = (label: string, attrs = '', symbol = '') => `<button ${attrs.includes('class=') ? '' : 'class="button"'} ${attrs}>${symbol ? icon(symbol) : ''}${label}</button>`;
const live = (key: string, value: string | number, className = '') => `<span data-live="${key}" class="${className}">${value}</span>`;

function save(): void {
  if (!persist(settings)) toast('Preferences work for this session. Browser storage is unavailable.');
  sendNative({ type: 'preferences', settings });
}
function toast(message: string): void {
  const target = document.querySelector<HTMLDivElement>('#toast')!;
  target.textContent = message;
  target.classList.add('shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => target.classList.remove('shown'), 3500);
}
function applyAppearance(): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.accent = settings.accent;
  root.dataset.density = settings.density;
  root.dataset.motion = settings.reducedMotion ? 'reduced' : 'normal';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'light' ? '#f4f5f3' : '#111314');
}
function sparkline(metric: Metric): string {
  const d = chartPath(series[metric].slice(-40), 300, 65);
  return `<svg class="sparkline" viewBox="0 0 300 65" preserveAspectRatio="none" aria-label="Simulated ${metric.toUpperCase()} usage trend" role="img"><defs><linearGradient id="fade-${metric}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${hardware[metric].color}" stop-opacity=".18"/><stop offset="100%" stop-color="${hardware[metric].color}" stop-opacity="0"/></linearGradient></defs><path data-spark-fill="${metric}" d="${d} L300,65 L0,65 Z" fill="url(#fade-${metric})"/><path data-spark="${metric}" d="${d}" fill="none" stroke="${hardware[metric].color}" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
}
function metricCard(metric: Metric): string {
  const h = hardware[metric];
  return `<article class="metric-card ${metric}" data-widget="${metric}">
    <div class="metric-heading"><span class="component-icon">${icon(metric)}</span><span class="metric-name">${metric.toUpperCase()}<small>${escape(h.short)}</small></span><button class="icon-button card-link" data-hardware="${metric}" aria-label="Inspect ${metric.toUpperCase()} sensors">${icon('external')}</button></div>
    <div class="metric-numbers"><div><strong>${live(`${metric}-usage`, usage(metric))}</strong><span class="metric-unit">%</span><span class="metric-caption">${metric === 'ram' ? `${live('ram-used', ramUsed())} / ${runtime.native ? runtime.totalMemoryGb.toFixed(1) : 32} GB` : 'Utilization'}</span></div><div class="temperature-pill">${icon('temp')}${live(`${metric}-temperature`, temperature(readings[metric].temperature))}<small>${runtime.native ? escape(readings[metric].temperatureLabel ?? 'Unavailable') : metric === 'ram' ? 'DIMM A2' : metric === 'cpu' ? 'Package' : 'Core'}</small></div></div>
    ${sparkline(metric)}
    <div class="metric-footer"><span>${metric === 'ram' ? runtime.native ? 'System memory' : '6000 <small>MT/s</small>' : `${live(`${metric}-clock`, readings[metric].clock?.toFixed(2) ?? '—')} <small>GHz</small>`}</span><span>${metric === 'ram' ? runtime.native ? 'Read only' : 'Dual channel' : `${live(`${metric}-power`, readings[metric].power?.toFixed(0) ?? '—')} <small>W</small>`}</span><span class="tiny-dot">${runtime.native ? 'Live' : metric === 'ram' ? 'DDR5' : 'Demo'}</span></div>
  </article>`;
}
function graph(): string {
  return `<div class="graph-area"><div class="y-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div class="plot"><svg class="performance-chart" viewBox="0 0 600 155" preserveAspectRatio="none" role="img" aria-label="${runtime.native ? 'Live' : 'Simulated'} utilization over the last ${range} seconds">${(['cpu', 'gpu', 'ram'] as Metric[]).map(m => `<path data-chart="${m}" d="${chartPath(windowedSeries(m, range), 600, 155)}" stroke="${hardware[m].color}" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" ${chartMetrics.has(m) ? '' : 'visibility="hidden"'}/>`).join('')}</svg><div class="x-axis"><span>-${range < 120 ? `${range}s` : `${range / 60}m`}</span><span>-${Math.round(range / 2)}s</span><span>Now</span></div></div></div>`;
}
function performancePanel(history = false): string {
  return `<section class="panel performance-panel ${history ? 'history-chart' : ''}"><div class="panel-heading"><div><h2>${history ? 'Recorded utilization' : 'Performance'}</h2><p>CPU, graphics & memory utilization</p></div><div class="segmented" aria-label="Chart time range">${[60, 300, 900].map(n => `<button data-range="${n}" aria-pressed="${range === n}" class="${range === n ? 'active' : ''}">${n === 60 ? '1m' : n === 300 ? '5m' : '15m'}</button>`).join('')}</div></div>${graph()}<div class="chart-legend">${(['cpu', 'gpu', 'ram'] as Metric[]).map(m => `<button class="legend-item ${chartMetrics.has(m) ? '' : 'muted'}" data-series="${m}" aria-pressed="${chartMetrics.has(m)}"><i style="background:${hardware[m].color}"></i>${m.toUpperCase()} ${live(`${m}-usage`, usage(m))}%</button>`).join('')}<span class="chart-note">${icon('activity')} ${runtime.native ? 'Local sensor stream' : 'Simulated telemetry'}</span></div></section>`;
}
function thermalPanel(): string {
  return `<section class="panel thermal-panel"><div class="panel-heading"><div><h2>Temperatures</h2><p>The essentials, at a glance</p></div><span class="heading-icon">${icon('temp')}</span></div><div class="thermal-bars">${(['cpu', 'gpu', 'ram'] as Metric[]).map(m => `<div class="thermal-row"><div><span><i style="background:${hardware[m].color}"></i>${m.toUpperCase()}<small>${runtime.native ? escape(readings[m].temperatureLabel ?? 'Unavailable') : m === 'ram' ? 'DIMM A2' : m === 'cpu' ? 'Package' : 'Core'}</small></span>${live(`${m}-temperature`, temperature(readings[m].temperature), 'thermal-value')}</div><div class="thermal-track"><span data-thermal="${m}" style="width:${readings[m].temperature ?? 0}%;background:${hardware[m].color}"></span></div></div>`).join('')}</div><div class="subtle-note">${icon('info')} Available sensors vary by hardware.</div></section>`;
}
function sensorTable(metric?: Metric, all = false): string {
  const entries = sensors().map((s, index) => ({ ...s, index })).filter(s => metric ? s.metric === metric : all ? true : !s.metric || s.name === 'DIMM B2');
  return `<div class="table-scroll"><table class="sensor-table"><thead><tr><th>Sensor</th><th>Current</th><th>Min</th><th>Max</th></tr></thead><tbody>${entries.map(s => `<tr data-sensor-index="${s.index}"><td><span class="sensor-icon">${icon(s.icon)}</span><span class="sensor-name">${escape(s.name)}<small>${escape(s.detail)}</small></span></td><td data-sensor-value class="${s.temperature === null ? 'unavailable' : ''}">${temperature(s.temperature)}</td><td data-sensor-min>${s.min === null ? '—' : temperature(s.min)}</td><td data-sensor-max>${s.max === null ? '—' : temperature(s.max)}</td></tr>`).join('')}</tbody></table></div>`;
}
function miniOverlay(): string {
  return `<div class="mini-overlay"><div class="mini-brand"><span class="brand-dot"></span> GERONIMO <span>${runtime.native ? 'LIVE' : 'DEMO'}</span></div>${(['cpu', 'gpu', 'ram'] as Metric[]).map(m => `<div><span style="color:${hardware[m].color}">${m.toUpperCase()}</span><b>${live(`${m}-usage`, usage(m))}<small>%</small></b>${live(`${m}-temperature`, temperature(readings[m].temperature))}<i><span style="width:${readings[m].usage ?? 0}%;background:${hardware[m].color}"></span></i></div>`).join('')}</div>`;
}
function overview(): string {
  const visible = settings.order.filter(m => !settings.hidden.includes(m));
  return `${title('System overview', 'A little clarity. A lot of control.', `<span class="status-pill"><span class="status-dot"></span> ${runtime.native ? runtime.connected ? 'Live session' : 'Connecting sensors' : 'Sample session'}</span>${action('Customize', 'data-customize="appearance"', 'sliders')}`)}
    <div class="system-strip"><span>${icon('monitor')}<strong>${runtime.native ? 'This PC' : 'Demo workstation'}</strong><span class="strip-divider"></span>${escape(runtime.os)}</span><span class="system-strip-note">${icon('cpu')} ${runtime.native ? `${runtime.devices.filter(d => d.kind === 'cpu').length} CPU <span>+</span> ${runtime.devices.filter(d => d.kind === 'gpu').length} GPU <span>·</span> ${runtime.totalMemoryGb.toFixed(1)} GB RAM` : 'AMD CPU <span>+</span> NVIDIA GPU <span>·</span> 32 GB RAM'}</span><span class="demo-label">${runtime.native ? 'AUTO DETECTED' : 'EXAMPLE HARDWARE'}</span></div>
    <div class="metric-grid" style="--columns:${Math.max(1, visible.length)}">${visible.length ? visible.map(metricCard).join('') : `<div class="panel empty-state">${icon('grid')}<h2>Your workspace, your way.</h2><p>Add a widget to start building your dashboard.</p>${action('Choose widgets', 'data-customize="widgets"', 'sliders')}</div>`}</div>
    <div class="dashboard-row">${performancePanel()}${thermalPanel()}</div>
    <div class="dashboard-row bottom-row"><section class="panel"><div class="panel-heading"><div><h2>More from your system</h2><p>Additional temperatures & sensor availability</p></div><button class="text-button" data-page="hardware">All sensors ${icon('arrow')}</button></div>${sensorTable()}</section><section class="panel overlay-teaser"><div class="panel-heading"><div><span class="eyebrow">STAY IN THE FLOW</span><h2>Small window.<br>Full picture.</h2></div><span class="heading-icon">${icon('overlay')}</span></div><p>Your favorite metrics, right where<br>you want them.</p><div class="overlay-illustration"><div class="illustration-grid"></div>${miniOverlay()}</div><button class="overlay-cta" data-page="overlay">Build your overlay ${icon('arrow')}</button></section></div>
    <div class="workspace-footer"><span>${icon('shield')} Local preferences. No accounts. No telemetry uploads.</span><span>${runtime.native ? 'Local Windows sensors' : 'Windows sensor connection comes next'} ${icon('arrow')}</span></div>`;
}
function title(heading: string, description: string, controls = ''): string {
  return `<div class="page-title"><div><div class="eyebrow page-eyebrow">YOUR PERSONAL COMMAND CENTER</div><h1>${heading}</h1><p>${description}</p></div><div class="page-controls">${controls}</div></div>`;
}
function hardwarePage(): string {
  const h = hardware[activeHardware];
  return `${title('Know your hardware', 'Every component. Every available sensor.', `<span class="status-pill neutral">${runtime.native ? 'Automatically detected' : 'Example configuration'}</span>`)}
  <div class="info-banner">${icon('info')}<span>${runtime.native ? escape(runtime.statusMessage || 'Connecting to local hardware sensors…') : 'This is sample hardware. Open the Windows application for automatic Intel, AMD & NVIDIA detection.'}</span></div>
  <div class="hardware-tabs">${(['cpu', 'gpu', 'ram'] as Metric[]).map(m => `<button class="hardware-tab ${m === activeHardware ? 'selected' : ''}" data-hardware-tab="${m}">${icon(m)}<span>${m.toUpperCase()}<small>${escape(hardware[m].short)}</small></span>${icon('chevron')}</button>`).join('')}</div>
  ${runtime.native && activeHardware === 'gpu' && runtime.devices.filter(d => d.kind === 'gpu').length > 1 ? `<label class="gpu-selector">Graphics adapter<select id="gpu-device-select">${runtime.devices.filter(d => d.kind === 'gpu').map(d => `<option value="${escape(d.id)}" ${runtime.selectedGpu === d.id ? 'selected' : ''}>${escape(d.name)}</option>`).join('')}</select></label>` : ''}
  <section class="panel hardware-details"><div class="hardware-hero"><span class="large-component ${activeHardware}">${icon(activeHardware)}</span><div><span class="eyebrow">${h.category}</span><h2>${escape(h.name)}</h2><p>${escape(h.detail)}</p></div><div class="hardware-live"><strong>${live(`${activeHardware}-usage`, usage(activeHardware))}<small>%</small></strong><span>${runtime.native ? 'Live utilization' : 'Simulated utilization'}</span></div></div><div class="hardware-specs">${(runtime.native ? [['Provider', 'LibreHardwareMonitor'], ['Source', escape(runtime.os)], ['Access', 'Read only'], ['Temperature sensors', String(sensors().filter(s => s.metric === activeHardware && s.temperature !== null).length)]] : activeHardware === 'cpu' ? [['Architecture', 'Zen 4'], ['Cores / threads', '16 / 32'], ['Clock', '4.80 GHz'], ['Socket', 'AM5']] : activeHardware === 'gpu' ? [['Architecture', 'Ada Lovelace'], ['Memory', '16 GB GDDR6X'], ['Clock', '2.50 GHz'], ['Interface', 'PCIe 4.0 x16']] : [['Capacity', '32 GB'], ['Configuration', '2 × 16 GB'], ['Data rate', '6000 MT/s'], ['Channels', runtime.native ? 'Read only' : 'Dual channel']]).map(([k, v]) => `<div><small>${k}</small><strong>${v}</strong></div>`).join('')}</div></section>
  <section class="panel hardware-sensors"><div class="panel-heading"><div><h2>${activeHardware.toUpperCase()} temperatures</h2><p>Readings are shown only when a sensor is exposed</p></div><span class="tag">${runtime.native ? 'WINDOWS SENSORS' : 'DEMO DATA'}</span></div>${sensorTable(activeHardware)}</section>
  <section class="panel hardware-sensors"><div class="panel-heading"><div><h2>Complete sensor inventory</h2><p>Core, hotspot, memory, storage, motherboard & power delivery</p></div><span class="tag">${sensors().length} SENSORS</span></div>${sensorTable(undefined, true)}</section>`;
}
function processRows(): string {
  const rows = processes.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(processQuery.toLowerCase())).sort((a, b) => ((a[sortKey] ?? -1) - (b[sortKey] ?? -1)) * sortDirection);
  return rows.length ? rows.map(p => `<tr><td><span class="app-icon app-${p.icon}">${p.icon === 'geronimo' ? 'G' : p.icon === 'code' ? '⌘' : p.icon === 'chrome' ? '◉' : p.icon === 'spotify' ? '≋' : p.icon === 'windows' ? '⊞' : p.name.slice(0, 1)}</span><span class="sensor-name">${escape(p.name)}<small>${escape(p.description)}</small></span></td><td><span class="process-meter" style="--meter:${(p.cpu ?? 0) * 8}%">${p.cpu === null ? '—' : `${p.cpu.toFixed(1)}%`}</span></td><td>${Math.round(p.ram).toLocaleString()} MB</td><td>${p.gpu === null ? '—' : `${p.gpu.toFixed(1)}%`}</td></tr>`).join('') : `<tr><td colspan="4" class="empty-table">${runtime.native ? 'No accessible processes match your search.' : 'No sample processes match your search.'}</td></tr>`;
}
function processesPage(): string {
  return `${title('Behind the numbers', 'See which apps are using your resources.', `<span class="status-pill neutral" data-process-count>${runtime.native ? `${processes.length} accessible processes` : '8 sample processes'}</span>`)}
  <div class="process-summary">${(['cpu', 'gpu', 'ram'] as Metric[]).map(m => `<div class="panel"><span style="color:${hardware[m].color}">${icon(m)} ${m.toUpperCase()}</span><strong>${live(`${m}-usage`, usage(m))}<small>%</small></strong><small>${runtime.native ? 'Live utilization' : 'Simulated utilization'}</small></div>`).join('')}</div>
  <section class="panel"><div class="panel-heading"><div><h2>Processes</h2><p>${runtime.native ? 'Accessible Windows processes · click a column to sort' : 'Sample process list · click a column to sort'}</p></div><label class="search-field">${icon('search')}<input id="process-search" type="search" placeholder="Find a process…" aria-label="Find a process" value="${escape(processQuery)}" /></label></div><div class="table-scroll"><table class="process-table"><thead><tr><th>Application</th>${(['cpu', 'ram', 'gpu'] as const).map(k => `<th aria-sort="${sortKey === k ? sortDirection === -1 ? 'descending' : 'ascending' : 'none'}"><button data-sort="${k}">${k === 'ram' ? 'Memory' : k.toUpperCase()} ${icon(sortKey === k && sortDirection === 1 ? 'up' : 'down')}</button></th>`).join('')}</tr></thead><tbody id="process-rows">${processRows()}</tbody></table></div><div class="table-footnote">${icon('info')} ${runtime.native ? 'Read-only process information. Protected processes can be inaccessible; per-process GPU usage is unavailable.' : 'Illustrative process values. No real applications are accessed or controlled.'}</div></section>`;
}
function historyPage(): string {
  return `${title('A little perspective', runtime.native ? 'Your current monitoring session, one moment at a time.' : 'Explore the simulated session, one moment at a time.', action(runtime.native ? 'Export session CSV' : 'Export demo CSV', 'data-action="export"', 'download'))}<div class="info-banner">${icon('clock')}<span>${runtime.native ? 'Current-session history is held locally in memory (up to 1,800 samples). Export CSV to retain it before closing the app.' : 'Preloaded sample history, with new simulated readings while playback runs. Open the Windows app to record your PC.'}</span></div>${performancePanel(true)}<div class="history-stat-grid">${(['cpu', 'gpu', 'ram'] as Metric[]).map(m => `<section class="panel history-stat"><span class="component-icon ${m}">${icon(m)}</span><h2>${m.toUpperCase()} utilization</h2><div><span>Session average<strong>${statistics(m).average}<small>%</small></strong></span><span>Session peak<strong>${statistics(m).peak}<small>%</small></strong></span></div><small>${runtime.native ? 'Current local session' : 'Sample data · not your PC’s history'}</small></section>`).join('')}</div>`;
}
function overlayControls(): string {
  return `<div class="control-block"><div class="control-label"><span>Layout</span><small>Choose your footprint</small></div><div class="layout-options">${['stacked', 'inline'].map(layout => `<button class="layout-option ${settings.overlay.layout === layout ? 'selected' : ''}" data-overlay-layout="${layout}">${icon(layout === 'stacked' ? 'activity' : 'overlay')}<span>${layout === 'stacked' ? 'Stacked' : 'Horizontal'}</span>${settings.overlay.layout === layout ? icon('check') : ''}</button>`).join('')}</div></div>
  <div class="control-block"><label class="slider-label" for="overlay-opacity">${runtime.native ? 'Window opacity' : 'Background opacity'} <output id="opacity-value">${settings.overlay.opacity}%</output></label><input id="overlay-opacity" data-overlay-slider="opacity" type="range" min="35" max="100" value="${settings.overlay.opacity}"/><div class="range-labels"><span>Subtle</span><span>Solid</span></div></div>
  <div class="control-block"><label class="slider-label" for="overlay-scale">Scale <output id="scale-value">${settings.overlay.scale}%</output></label><input id="overlay-scale" data-overlay-slider="scale" type="range" min="75" max="140" value="${settings.overlay.scale}"/><div class="range-labels"><span>Compact</span><span>Large</span></div></div>
  <div class="control-block"><div class="control-label"><span>Visible metrics</span><small>Keep just what matters</small></div>${(['cpu', 'gpu', 'ram'] as Metric[]).map(m => `<label class="switch-row"><span>${icon(m)} ${m.toUpperCase()}</span><input type="checkbox" class="switch" data-overlay-metric="${m}" ${settings.overlay.metrics.includes(m) ? 'checked' : ''}/></label>`).join('')}</div>`;
}
function overlayPage(): string {
  return `${title('Stay in your element', 'Your metrics. Your space. Your overlay.', action(settings.overlay.visible ? runtime.native ? 'Hide desktop overlay' : 'Hide floating preview' : runtime.native ? 'Show desktop overlay' : 'Launch floating preview', 'data-action="overlay-toggle" class="button primary"', 'overlay'))}
  <div class="overlay-studio"><section class="panel studio-preview"><div class="panel-heading"><h2>Overlay studio</h2><span class="tag">INTERACTIVE PREVIEW</span></div><div class="preview-scene"><div class="scene-noise"></div><div class="mountain mountain-back"></div><div class="mountain mountain-front"></div><div class="scene-crosshair">+</div><div class="scene-label">A little less distraction.<br><strong>A lot more immersion.</strong></div><div id="studio-overlay">${overlayMarkup(false)}</div><div class="scene-bottom"><span>DEMO BACKGROUND</span><span>${icon('monitor')} Preview canvas</span></div></div><div class="studio-footnote">${icon('info')} ${runtime.native ? 'Desktop overlay · Ctrl+Shift+O toggles visibility. Works with desktop and windowed/borderless apps. Exclusive-fullscreen games may cover it.' : 'Floating preview moves inside this app. Open the Windows app for a desktop overlay.'}</div></section><aside class="panel studio-controls"><div class="panel-heading"><div><h2>Make it yours</h2><p>Changes save automatically</p></div>${icon('sliders')}</div>${overlayControls()}${runtime.native ? `<label class="switch-row"><span>Click-through<small>Ctrl+Shift+O toggles overlay visibility</small></span><input class="switch" type="checkbox" id="overlay-click-through" ${settings.overlay.clickThrough ? 'checked' : ''}/></label>` : ''}<button class="button full-width" data-action="overlay-reset">${icon('reset')} Reset position</button></aside></div>`;
}
function renderMain(): void {
  const target = document.querySelector<HTMLElement>('#main-content');
  if (!target) return;
  target.innerHTML = page === 'overview' ? overview() : page === 'hardware' ? hardwarePage() : page === 'processes' ? processesPage() : page === 'history' ? historyPage() : overlayPage();
  document.querySelectorAll('[data-nav]').forEach(el => { el.classList.toggle('active', el.getAttribute('data-nav') === page); if (el.getAttribute('data-nav') === page) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  document.querySelector('#breadcrumb-page')!.textContent = names[page];
  document.title = `${names[page]} — Geronimo`;
  updateNativeChrome();
  sendNative({ type: 'page', page });
}
function updateNativeChrome(): void {
  if (!runtime.native) return;
  const status = document.querySelector('.demo-status');
  if (status) status.innerHTML = `<i></i>${paused ? 'Monitoring paused' : runtime.connected ? 'Live sensors' : 'Connecting…'}`;
  const agent = document.querySelector('.agent-status small');
  if (agent) agent.textContent = runtime.connected ? 'Local sensors connected' : 'Connecting to sensors…';
  const pause = document.querySelector('.pause-button');
  pause?.setAttribute('aria-label', paused ? 'Resume monitoring' : 'Pause monitoring');
  pause?.setAttribute('title', paused ? 'Resume monitoring' : 'Pause monitoring');
  document.querySelector('.sidebar-version span:last-child')!.textContent = 'WINDOWS APP 0.1';
  document.querySelector('#notifications p')!.textContent = 'Temperature alert rules are not configured.';
  document.querySelector('#notifications small')!.textContent = 'This release provides read-only monitoring and a desktop overlay.';
}
function renderShell(): void {
  app.innerHTML = `<a class="skip-link" href="#main-content">Skip to dashboard</a><aside class="sidebar"><a class="brand" href="#overview" aria-label="Geronimo overview"><span class="brand-mark">G<span></span></span><span>geronimo<small>YOUR PC, IN PERSPECTIVE.</small></span></a><div class="nav-section-label">WORKSPACE</div><nav aria-label="Main navigation">${([['overview', 'grid'], ['hardware', 'cpu'], ['processes', 'activity'], ['history', 'chart']] as [Page, string][]).map(([p, i]) => `<a href="#${p}" data-nav="${p}" class="nav-item ${page === p ? 'active' : ''}">${icon(i)}<span>${names[p]}</span>${p === 'overview' ? '<span class="nav-active-dot"></span>' : ''}</a>`).join('')}</nav><div class="nav-section-label tools-label">MAKE IT YOURS</div><nav aria-label="Customization"><a href="#overlay" data-nav="overlay" class="nav-item">${icon('overlay')}<span>Overlay studio</span><span class="nav-new">NEW</span></a><button class="nav-item" data-customize="appearance">${icon('sliders')}<span>Appearance</span></button><button class="nav-item" data-customize="preferences">${icon('settings')}<span>Preferences</span></button></nav><div class="sidebar-bottom"><div class="local-card">${icon('shield')}<span>Designed to stay local<small>Your PC. Your data.</small></span></div><div class="agent-status"><span class="agent-icon">${icon('monitor')}</span><span>Windows app<small><i></i> Sensor agent not connected</small></span>${icon('chevron')}</div><div class="sidebar-version"><span>GERONIMO</span><span>UI PREVIEW 0.1</span></div></div></aside><div class="app-body"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="Toggle navigation">${icon('menu')}</button>${icon('grid')}<span>Workspace</span>${icon('chevron')}<strong id="breadcrumb-page">${names[page]}</strong></div><div class="topbar-actions"><span class="demo-status"><i></i>Demo data</span><button class="icon-button pause-button" data-action="pause" aria-label="Pause simulation" title="Pause simulation">${icon('pause')}</button><span class="toolbar-divider"></span><button class="icon-button" data-action="search" aria-label="Search processes" title="Search processes (Ctrl+K)">${icon('search')}</button><button class="icon-button" popovertarget="notifications" aria-label="Notifications">${icon('bell')}</button><button class="avatar" data-customize="appearance" aria-label="Open appearance settings">G</button></div></header><main id="main-content" tabindex="-1"></main></div><div id="notifications" popover><h3>All quiet here.</h3><p>No alerts in this simulated session.</p><small>Hardware alerts connect with the Windows sensor agent.</small></div>`;
  renderMain();
}
function openCustomizer(tab: string): void {
  customTab = tab;
  if (!dialog.open) lastDialogTrigger = document.activeElement as HTMLElement;
  renderCustomizer();
  if (!dialog.open) dialog.showModal();
}
function appearanceControls(): string {
  return `<div class="control-block"><div class="control-label"><span>Color theme</span><small>A workspace that feels like you.</small></div><div class="theme-options">${(['graphite', 'midnight', 'light'] as const).map(theme => `<button class="theme-option ${settings.theme === theme ? 'selected' : ''}" data-theme-choice="${theme}" aria-pressed="${settings.theme === theme}"><span class="theme-swatch swatch-${theme}"><i></i><i></i><i></i>${settings.theme === theme ? `<b>${icon('check')}</b>` : ''}</span><span>${theme[0].toUpperCase() + theme.slice(1)}</span></button>`).join('')}</div></div><div class="control-block"><div class="control-label"><span>Accent color</span><small>Small details. A different mood.</small></div><div class="accent-options">${(['mint', 'violet', 'blue', 'amber'] as const).map(accent => `<button class="accent-choice accent-${accent} ${settings.accent === accent ? 'selected' : ''}" data-accent-choice="${accent}" aria-label="${accent[0].toUpperCase() + accent.slice(1)} accent" aria-pressed="${settings.accent === accent}">${settings.accent === accent ? icon('check') : ''}</button>`).join('')}</div></div><div class="control-block"><div class="control-label"><span>Interface density</span><small>Give your information room to breathe.</small></div><div class="segmented wide">${['comfortable', 'compact'].map(d => `<button data-density="${d}" class="${settings.density === d ? 'active' : ''}" aria-pressed="${settings.density === d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div></div><label class="switch-row"><span>Reduce motion<small>Keep transitions to a minimum</small></span><input class="switch" type="checkbox" data-preference="reducedMotion" ${settings.reducedMotion ? 'checked' : ''}/></label>`;
}
function widgetControls(): string {
  return `<div class="control-block"><div class="control-label"><span>Your dashboard</span><small>Show, hide, and reorder your main widgets.</small></div><div class="widget-list">${settings.order.map((m, i) => `<div class="widget-setting"><span class="widget-setting-icon ${m}">${icon(m)}</span><span><strong>${m.toUpperCase()}</strong><small>${escape(hardware[m].short)}</small></span><div class="reorder-buttons"><button class="icon-button" data-move-widget="${m}" data-direction="-1" aria-label="Move ${m.toUpperCase()} up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="icon-button" data-move-widget="${m}" data-direction="1" aria-label="Move ${m.toUpperCase()} down" ${i === settings.order.length - 1 ? 'disabled' : ''}>${icon('down')}</button></div><input class="switch" type="checkbox" data-widget-toggle="${m}" aria-label="Show ${m.toUpperCase()} widget" ${settings.hidden.includes(m) ? '' : 'checked'}/></div>`).join('')}</div></div><div class="info-banner compact-banner">${icon('info')}<span>Hiding a widget changes your dashboard layout. All sensors remain available under Hardware.</span></div>`;
}
function preferenceControls(): string {
  return `<div class="control-block"><div class="control-label"><span>Temperature unit</span><small>Used across your dashboard and overlay.</small></div><div class="segmented wide"><button data-unit="c" class="${settings.fahrenheit ? '' : 'active'}" aria-pressed="${!settings.fahrenheit}">Celsius · °C</button><button data-unit="f" class="${settings.fahrenheit ? 'active' : ''}" aria-pressed="${settings.fahrenheit}">Fahrenheit · °F</button></div></div><div class="control-block"><label class="control-label" for="refresh-rate"><span>${runtime.native ? 'Sensor refresh interval' : 'Simulation refresh interval'}</span><small>A slower refresh performs fewer updates.</small></label><select id="refresh-rate">${[1000, 2000, 5000].map(ms => `<option value="${ms}" ${settings.refresh === ms ? 'selected' : ''}>${ms / 1000} second${ms === 1000 ? '' : 's'}${ms === 2000 ? ' · balanced' : ms === 5000 ? ' · power saver' : ' · responsive'}</option>`).join('')}</select></div><div class="privacy-note">${icon('shield')}<h3>Personal by design.</h3><p>${runtime.native ? 'Your preferences and window positions stay in your Windows profile. Readings remain on your PC. Process enumeration runs only while the Processes view is open.' : 'Your preferences stay in this browser. This preview sends no monitoring data anywhere and pauses simulation when the tab is hidden.'}</p></div><button class="button full-width" data-action="reset-settings">${icon('reset')} Restore default settings</button>`;
}
function renderCustomizer(): void {
  dialog.innerHTML = `<div class="drawer-heading"><div><span class="eyebrow">MAKE IT YOURS</span><h2 id="customizer-title">Your workspace.</h2><p>A few small changes. All yours.</p></div><button class="icon-button" data-action="close-customizer" aria-label="Close customization">${icon('x')}</button></div><div class="drawer-tabs" role="tablist" aria-label="Customization section">${[['appearance', 'Appearance'], ['widgets', 'Widgets'], ['preferences', 'Preferences']].map(([key, name]) => `<button role="tab" id="tab-${key}" aria-controls="customization-content" aria-selected="${customTab === key}" tabindex="${customTab === key ? 0 : -1}" data-custom-tab="${key}" class="${customTab === key ? 'active' : ''}">${name}</button>`).join('')}</div><div class="drawer-content" id="customization-content" role="tabpanel" aria-labelledby="tab-${customTab}">${customTab === 'appearance' ? appearanceControls() : customTab === 'widgets' ? widgetControls() : preferenceControls()}</div><div class="drawer-footer">${icon('check')} Changes saved automatically on this device</div>`;
}
function overlayMarkup(floating: boolean): string {
  return `<div class="telemetry-overlay ${settings.overlay.layout}" ${floating ? 'id="floating-overlay" role="region" aria-label="Floating overlay preview"' : ''} style="--overlay-opacity:${settings.overlay.opacity / 100};--overlay-scale:${settings.overlay.scale / 100}"><div class="overlay-head"><span class="mini-brand"><span class="brand-dot"></span> GERONIMO <span>${runtime.native ? 'LIVE' : 'DEMO'}</span></span>${floating ? `<button class="overlay-move" aria-label="Move overlay" title="Drag to move; use arrow keys when focused">${icon('grip')}</button><button class="overlay-close" data-action="overlay-close" aria-label="Close floating overlay">${icon('x')}</button>` : `<span class="overlay-dots">•••</span>`}</div><div class="overlay-metrics">${settings.overlay.metrics.map(m => `<div class="overlay-metric"><span class="overlay-metric-name" style="color:${hardware[m].color}">${m.toUpperCase()}</span><strong>${live(`${m}-usage`, usage(m))}<small>%</small></strong><span>${live(`${m}-temperature`, temperature(readings[m].temperature))}</span><div class="overlay-meter"><i style="width:${readings[m].usage ?? 0}%;background:${hardware[m].color}" data-overlay-bar="${m}"></i></div></div>`).join('') || '<p class="overlay-empty">Choose a metric to display.</p>'}</div></div>`;
}
function renderOverlay(): void {
  overlayRoot.innerHTML = settings.overlay.visible && !runtime.native ? overlayMarkup(true) : '';
  const studio = document.querySelector('#studio-overlay');
  if (studio) studio.innerHTML = overlayMarkup(false);
  const floating = document.querySelector<HTMLElement>('#floating-overlay');
  if (floating) {
    const p = settings.overlay.position;
    positionOverlay(p?.x ?? window.innerWidth - 280, p?.y ?? 100, false);
    const handle = floating.querySelector<HTMLElement>('.overlay-move')!;
    handle.addEventListener('pointerdown', startOverlayDrag);
    handle.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const rect = floating.getBoundingClientRect();
      positionOverlay(rect.x + (e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0), rect.y + (e.key === 'ArrowUp' ? -10 : e.key === 'ArrowDown' ? 10 : 0), true);
    });
  }
}
function positionOverlay(x: number, y: number, store: boolean): void {
  const target = document.querySelector<HTMLElement>('#floating-overlay');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const position = { x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) };
  target.style.left = `${position.x}px`;
  target.style.top = `${position.y}px`;
  if (store) { settings.overlay.position = position; save(); }
}
function startOverlayDrag(e: PointerEvent): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const handle = e.currentTarget as HTMLElement;
  const target = document.querySelector<HTMLElement>('#floating-overlay')!;
  const rect = target.getBoundingClientRect();
  const offset = { x: e.clientX - rect.x, y: e.clientY - rect.y };
  handle.setPointerCapture(e.pointerId);
  const move = (event: PointerEvent) => positionOverlay(event.clientX - offset.x, event.clientY - offset.y, false);
  const end = () => { const r = target.getBoundingClientRect(); positionOverlay(r.x, r.y, true); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end); };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}
function navigate(next: Page): void {
  if (location.hash !== `#${next}`) location.hash = next;
  else { page = next; renderMain(); }
  document.body.classList.remove('menu-open');
}
function updateTelemetry(): void {
  const values: Record<string, string | number> = { 'ram-used': ramUsed() };
  for (const m of ['cpu', 'gpu', 'ram'] as Metric[]) { values[`${m}-usage`] = usage(m); values[`${m}-temperature`] = temperature(readings[m].temperature); values[`${m}-clock`] = readings[m].clock?.toFixed(2) ?? '—'; values[`${m}-power`] = readings[m].power?.toFixed(0) ?? '—'; }
  document.querySelectorAll<HTMLElement>('[data-live]').forEach(el => { const value = values[el.dataset.live!]; if (value !== undefined) el.textContent = String(value); });
  for (const m of ['cpu', 'gpu', 'ram'] as Metric[]) {
    const path = chartPath(series[m].slice(-40), 300, 65);
    document.querySelector(`[data-spark="${m}"]`)?.setAttribute('d', path);
    document.querySelector(`[data-spark-fill="${m}"]`)?.setAttribute('d', `${path} L300,65 L0,65 Z`);
    document.querySelector(`[data-chart="${m}"]`)?.setAttribute('d', chartPath(windowedSeries(m, range), 600, 155));
    document.querySelectorAll<HTMLElement>(`[data-thermal="${m}"]`).forEach(el => el.style.width = `${readings[m].temperature ?? 0}%`);
    document.querySelectorAll<HTMLElement>(`[data-overlay-bar="${m}"]`).forEach(el => el.style.width = `${readings[m].usage ?? 0}%`);
  }
  const currentSensors = sensors();
  document.querySelectorAll<HTMLElement>('[data-sensor-index]').forEach(el => {
    const sensor = currentSensors[Number(el.dataset.sensorIndex)];
    if (!sensor) return;
    el.querySelector('[data-sensor-value]')!.textContent = temperature(sensor.temperature);
    el.querySelector('[data-sensor-value]')!.classList.toggle('unavailable', sensor.temperature === null);
    el.querySelector('[data-sensor-min]')!.textContent = sensor.min === null ? '—' : temperature(sensor.min);
    el.querySelector('[data-sensor-max]')!.textContent = sensor.max === null ? '—' : temperature(sensor.max);
  });
  if (runtime.native && page === 'processes') {
    document.querySelector('#process-rows')!.innerHTML = processRows();
    document.querySelector('[data-process-count]')!.textContent = `${processes.length} accessible processes`;
  }
}
function startTimer(): void {
  clearInterval(timer);
  timer = setInterval(() => { if (!runtime.native && !paused && !document.hidden) { advance(); updateTelemetry(); } }, settings.refresh);
}
function exportCSV(): void {
  const rows = ['source,timestamp,cpu_utilization_percent,gpu_utilization_percent,ram_utilization_percent'];
  for (let i = 0; i < series.cpu.length; i++) rows.push(`${runtime.native ? 'windows-sensors' : 'simulated'},${new Date(timestamps[i]).toISOString()},${series.cpu[i] ?? ''},${series.gpu[i] ?? ''},${series.ram[i] ?? ''}`);
  const url = URL.createObjectURL(new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = runtime.native ? 'geronimo-session.csv' : 'geronimo-demo-session.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(runtime.native ? 'Local session exported.' : 'Simulated session exported.');
}

document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('button, a[data-page]');
  if (!target) return;
  const data = target.dataset;
  if (data.page) navigate(data.page as Page);
  if (data.customize) openCustomizer(data.customize);
  if (data.hardware) { activeHardware = data.hardware as Metric; navigate('hardware'); }
  if (data.hardwareTab) { activeHardware = data.hardwareTab as Metric; renderMain(); }
  if (data.range) { range = Number(data.range); renderMain(); }
  if (data.series) { const m = data.series as Metric; if (chartMetrics.has(m)) chartMetrics.delete(m); else chartMetrics.add(m); renderMain(); }
  if (data.customTab) { customTab = data.customTab; renderCustomizer(); dialog.querySelector<HTMLElement>(`[data-custom-tab="${customTab}"]`)?.focus(); }
  if (data.themeChoice) { settings.theme = data.themeChoice as typeof settings.theme; applyAppearance(); save(); renderCustomizer(); dialog.querySelector<HTMLElement>(`[data-theme-choice="${settings.theme}"]`)?.focus(); }
  if (data.accentChoice) { settings.accent = data.accentChoice as typeof settings.accent; applyAppearance(); save(); renderCustomizer(); dialog.querySelector<HTMLElement>(`[data-accent-choice="${settings.accent}"]`)?.focus(); }
  if (data.density) { settings.density = data.density as typeof settings.density; applyAppearance(); save(); renderCustomizer(); dialog.querySelector<HTMLElement>(`[data-density="${settings.density}"]`)?.focus(); }
  if (data.moveWidget) { const m = data.moveWidget as Metric; const i = settings.order.indexOf(m); const next = i + Number(data.direction); if (next >= 0 && next < settings.order.length) { [settings.order[i], settings.order[next]] = [settings.order[next], settings.order[i]]; save(); renderMain(); renderCustomizer(); } }
  if (data.unit) { settings.fahrenheit = data.unit === 'f'; save(); renderMain(); renderOverlay(); renderCustomizer(); dialog.querySelector<HTMLElement>(`[data-unit="${data.unit}"]`)?.focus(); }
  if (data.overlayLayout) { settings.overlay.layout = data.overlayLayout as 'stacked' | 'inline'; save(); renderMain(); renderOverlay(); }
  if (data.sort) { const key = data.sort as typeof sortKey; sortDirection = sortKey === key ? -sortDirection : -1; sortKey = key; renderMain(); }
  switch (data.action) {
    case 'close-customizer': dialog.close(); break;
    case 'pause': paused = !paused; target.innerHTML = icon(paused ? 'play' : 'pause'); target.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation'); target.title = paused ? 'Resume simulation' : 'Pause simulation'; document.querySelector('.demo-status')!.innerHTML = `<i class="${paused ? 'paused' : ''}"></i>${paused ? 'Demo paused' : 'Demo data'}`; sendNative({ type: 'pause', paused }); updateNativeChrome(); break;
    case 'menu': document.body.classList.toggle('menu-open'); break;
    case 'search': navigate('processes'); setTimeout(() => document.querySelector<HTMLInputElement>('#process-search')?.focus(), 30); break;
    case 'overlay-toggle': settings.overlay.visible = !settings.overlay.visible; save(); renderMain(); renderOverlay(); break;
    case 'overlay-close': settings.overlay.visible = false; save(); renderOverlay(); if (page === 'overlay') renderMain(); break;
    case 'overlay-reset': settings.overlay.position = null; save(); sendNative({ type: 'reset-overlay-position' }); renderOverlay(); toast('Overlay position reset.'); break;
    case 'reset-settings': settings = defaults(); applyAppearance(); save(); startTimer(); renderMain(); renderOverlay(); renderCustomizer(); toast('Default settings restored.'); break;
    case 'export': exportCSV(); break;
  }
});
document.addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.id === 'process-search') { processQuery = target.value; document.querySelector('#process-rows')!.innerHTML = processRows(); }
  if (target.dataset.overlaySlider) {
    const key = target.dataset.overlaySlider as 'opacity' | 'scale';
    settings.overlay[key] = Number(target.value);
    document.querySelector(`#${key === 'opacity' ? 'opacity' : 'scale'}-value`)!.textContent = `${target.value}%`;
    document.querySelectorAll<HTMLElement>('.telemetry-overlay').forEach(el => el.style.setProperty(`--overlay-${key}`, String(Number(target.value) / 100)));
    const floating = document.querySelector<HTMLElement>('#floating-overlay');
    if (floating) { const r = floating.getBoundingClientRect(); positionOverlay(r.x, r.y, false); }
    save();
  }
});
document.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.dataset.widgetToggle) { const m = target.dataset.widgetToggle as Metric; settings.hidden = target.checked ? settings.hidden.filter(k => k !== m) : [...settings.hidden, m]; save(); renderMain(); }
  if (target.dataset.overlayMetric) { const m = target.dataset.overlayMetric as Metric; settings.overlay.metrics = target.checked ? [...new Set([...settings.overlay.metrics, m])] : settings.overlay.metrics.filter(k => k !== m); save(); renderOverlay(); }
  if (target.dataset.preference) { settings.reducedMotion = target.checked; applyAppearance(); save(); }
  if (target.id === 'refresh-rate') { settings.refresh = Number(target.value); save(); startTimer(); }
  if (target.id === 'overlay-click-through') { settings.overlay.clickThrough = target.checked; save(); }
  if (target.id === 'gpu-device-select') {
    runtime.selectedGpu = target.value;
    series.gpu.fill(null);
    readings.gpu = { usage: null, temperature: null, clock: null, power: null };
    updateTelemetry();
    sendNative({ type: 'select-gpu', id: target.value });
  }
});
dialog.addEventListener('close', () => lastDialogTrigger?.focus());
dialog.addEventListener('click', e => { if (e.target === dialog && e.clientX < dialog.getBoundingClientRect().left) dialog.close(); });
dialog.addEventListener('keydown', e => {
  if (!(e.target as HTMLElement).matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const tabs = ['appearance', 'widgets', 'preferences'];
  customTab = tabs[e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (tabs.indexOf(customTab) + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
  renderCustomizer(); dialog.querySelector<HTMLElement>(`[data-custom-tab="${customTab}"]`)?.focus();
});
window.addEventListener('hashchange', () => { if (location.hash === '#main-content') return; const next = location.hash.slice(1) as Page; page = pages.includes(next) ? next : 'overview'; renderMain(); window.scrollTo({ top: 0 }); document.body.classList.remove('menu-open'); });
window.addEventListener('resize', () => { const floating = document.querySelector<HTMLElement>('#floating-overlay'); if (floating) { const r = floating.getBoundingClientRect(); positionOverlay(r.x, r.y, false); } });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); navigate('processes'); setTimeout(() => document.querySelector<HTMLInputElement>('#process-search')?.focus(), 30); } if (e.key === 'Escape') document.body.classList.remove('menu-open'); });
applyAppearance();
renderShell();
renderOverlay();
startTimer();
nativeBridge?.addEventListener('message', event => {
  if (event.data?.type === 'telemetry') {
    const changed = acceptSnapshot(event.data as NativeSnapshot);
    if (changed && page !== 'processes') renderMain();
    updateTelemetry(); updateNativeChrome();
    if (page === 'overlay') renderOverlay();
  } else if (event.data?.type === 'overlay-state') {
    settings.overlay.visible = event.data.visible === true;
    save(); if (page === 'overlay') renderMain();
  } else if (event.data?.type === 'sensor-error') {
    toast('A sensor update failed. Retrying on the next refresh.');
  }
});
sendNative({ type: 'ready' });
sendNative({ type: 'preferences', settings });
sendNative({ type: 'page', page });
