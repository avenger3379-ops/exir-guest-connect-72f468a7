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
const BACKEND_KEY = "exir.qos.backend.v1";

export type QosBackend = "mikrotik" | "netlimiter";

export function loadQosBackend(): QosBackend {
  try {
    const v = localStorage.getItem(BACKEND_KEY);
    if (v === "netlimiter" || v === "mikrotik") return v;
  } catch { /* ignore */ }
  return "mikrotik";
}

export function saveQosBackend(b: QosBackend) {
  localStorage.setItem(BACKEND_KEY, b);
  window.dispatchEvent(new Event("exir:qos-backend"));
}

export const DEFAULT_COLORS: QosColors = {
  "500K": "#22c55e",
  "1M": "#06b6d4",
  "2M": "#fb923c",
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

export interface QosPushResult {
  ok: boolean;
  error?: string;
  via?: string; // "client-agent" | "psexec" | mikrotik path, when applicable
}

// Two rapid UI actions on the same machine (e.g. flipping the "enabled"
// checkbox and then immediately clicking a tier) previously fired two
// overlapping requests to the same VIP — NetLimiter's optimistic-concurrency
// check would then reject the second UpdateRule with "already newer
// revision of the rule". Serializing per-machine (queueing the next push
// behind the previous one's response) removes the race at the source
// instead of just retrying around it.
const inFlight = new Map<string, Promise<unknown>>();

async function doPushQos(machine: string, state: QosState): Promise<QosPushResult> {
  try {
    const backend = loadQosBackend();
    const r = await fetch("http://localhost:8765/qos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ machine, backend, ...state }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; via?: string };
    if (!r.ok || !j.ok) {
      return { ok: false, error: j.error || `agent HTTP ${r.status}` };
    }
    return { ok: true, via: j.via };
  } catch (e) {
    return { ok: false, error: `agent unreachable: ${String((e as Error)?.message || e)}` };
  }
}

// Try to push change to local agent (which will apply via MikroTik REST or
// NetLimiter on the target VIP). Returns the *actual* backend result — the
// HTTP call succeeding just means the agent responded, not that the tier
// was really applied on the client, so callers must check `.ok`.
export async function pushQos(machine: string, state: QosState): Promise<QosPushResult> {
  const prev = inFlight.get(machine) ?? Promise.resolve();
  const chained = prev.catch(() => {}).then(() => doPushQos(machine, state));
  // Store a promise that always settles (never rejects) so later callers'
  // chaining doesn't break if this particular push fails.
  inFlight.set(machine, chained.catch(() => {}));
  return chained;
}
