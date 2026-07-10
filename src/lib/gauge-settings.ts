// Per-metric color bands for circular gauges + ping panel. Persisted in localStorage.
// Each band: value <= max uses `color`. Bands must be sorted ascending by max.

export interface Band {
  max: number;
  color: string; // hex (#rrggbb) so <input type="color"> works
}

export interface GaugeSettings {
  gpu: Band[];
  cpu: Band[];
  ping: Band[];
}

const STORAGE_KEY = "exir.gauge.settings.v2";

export const DEFAULT_SETTINGS: GaugeSettings = {
  gpu: [
    { max: 60, color: "#22d3ee" },
    { max: 75, color: "#facc15" },
    { max: 100, color: "#ef4444" },
  ],
  cpu: [
    { max: 60, color: "#22d3ee" },
    { max: 75, color: "#facc15" },
    { max: 100, color: "#ef4444" },
  ],
  ping: [
    { max: 30, color: "#22c55e" },  // green
    { max: 80, color: "#facc15" },  // amber
    { max: 300, color: "#ef4444" }, // red
  ],
};

export function loadSettings(): GaugeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<GaugeSettings>;
      return {
        gpu: Array.isArray(p.gpu) && p.gpu.length === 3 ? p.gpu : DEFAULT_SETTINGS.gpu,
        cpu: Array.isArray(p.cpu) && p.cpu.length === 3 ? p.cpu : DEFAULT_SETTINGS.cpu,
        ping: Array.isArray(p.ping) && p.ping.length === 3 ? p.ping : DEFAULT_SETTINGS.ping,
      };
    }
    // migrate old v1 (no ping)
    const oldRaw = localStorage.getItem("exir.gauge.settings.v1");
    if (oldRaw) {
      const p = JSON.parse(oldRaw) as Partial<GaugeSettings>;
      return {
        gpu: Array.isArray(p.gpu) && p.gpu.length === 3 ? p.gpu : DEFAULT_SETTINGS.gpu,
        cpu: Array.isArray(p.cpu) && p.cpu.length === 3 ? p.cpu : DEFAULT_SETTINGS.cpu,
        ping: DEFAULT_SETTINGS.ping,
      };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: GaugeSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent("exir:gauge-settings"));
  } catch {
    /* ignore */
  }
}

export function colorFor(bands: Band[], value: number): string {
  const sorted = [...bands].sort((a, b) => a.max - b.max);
  for (const b of sorted) if (value <= b.max) return b.color;
  return sorted[sorted.length - 1]?.color ?? "#22d3ee";
}
