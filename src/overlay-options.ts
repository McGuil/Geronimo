export const overlayFields = {
  cpu: 'CPU', gpu: 'GPU', ram: 'RAM',
  'cpu-usage': 'CPU usage', 'cpu-temp': 'CPU temperature', 'cpu-clock': 'CPU clock', 'cpu-power': 'CPU power',
  'gpu-usage': 'GPU usage', 'gpu-temp': 'GPU temperature', 'gpu-clock': 'GPU clock', 'gpu-power': 'GPU power',
  'ram-usage': 'RAM usage', 'ram-temp': 'RAM temperature', 'ram-used': 'RAM used',
  fps: 'FPS', frametime: 'Frame time', process: 'Process name', 'process-cpu': 'Process CPU', 'process-ram': 'Process RAM', ping: 'Network ping',
} as const;
export type OverlayMetric = keyof typeof overlayFields | `sensor:${string}`;
export const isOverlayMetric = (value: unknown): value is OverlayMetric => typeof value === 'string'
  && (Object.hasOwn(overlayFields, value) || value.startsWith('sensor:'));
