// QoS state per client + editable tier colors, persisted to localStorage.
export type Tier = "off" | "500K" | "1M" | "2M" | "UNL";

export interface QosState {
  enabled: boolean;
  tier: Tier;
}

export interface QosColors {
  "500K": string;
  "1M": string;
  "2M": string;
  UNL: string;
}

const STATE_KEY = "exir.qos.state.v1";
const COLOR_KEY = "exir.qos.colors.v1";

export const DEFAULT_COLORS: QosColors = {
  "500K": "#22c55e",
  "1M": "#fb923c",
  "2M": "#38bdf8",
  UNL: "#ef4444",
};

export function loadQosStates(): Record<string, QosState> {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

export function saveQosStates(s: Record<string, QosState>) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
}

export function loadQosColors(): QosColors {
  try {
    const raw = localStorage.getItem(COLOR_KEY);
    if (raw) return { ...DEFAULT_COLORS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_COLORS;
}

export function saveQosColors(c: QosColors) {
  localStorage.setItem(COLOR_KEY, JSON.stringify(c));
}

// Try to push change to local agent (which will SSH/API-call Mikrotik).
// Silently no-ops if agent not running.
export async function pushQos(machine: string, state: QosState): Promise<boolean> {
  try {
    const r = await fetch("http://localhost:8765/qos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ machine, ...state }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
