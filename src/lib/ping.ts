import type { PingTarget, PingSample } from "./monitoring-types";

const STORAGE_KEY = "exir.ping.targets.v1";
const HISTORY_LEN = 60; // keep up to ~2 minutes at 2s interval; UI uses last 6 and last 30s
const TIMEOUT_MS = 1500;

// Local ping agent (ping-agent.mjs) that does REAL ICMP pings. It starts
// automatically with the project. When reachable, we use it for accurate LAN
// latency; otherwise we fall back to the browser fetch heuristic below.
const AGENT_URL = "http://localhost:8765";
let agentAvailable: boolean | null = null; // null = unknown, re-checked periodically
let agentCheckedAt = 0;

async function pingViaAgent(hosts: string[]): Promise<number[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS + 800);
    const res = await fetch(`${AGENT_URL}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hosts }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: number[] };
    if (Array.isArray(json.results) && json.results.length === hosts.length) {
      agentAvailable = true;
      return json.results.map((v) => (typeof v === "number" ? v : -1));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Ping every host once. Prefers the local ICMP agent (accurate, works for LAN
 * IPs and DNS servers); falls back to the per-host browser fetch heuristic.
 */
export async function pingAll(hosts: string[]): Promise<number[]> {
  const now = Date.now();
  // Try the agent if it was available, unknown, or it's been >10s since a recheck.
  if (agentAvailable !== false || now - agentCheckedAt > 10_000) {
    agentCheckedAt = now;
    const viaAgent = await pingViaAgent(hosts);
    if (viaAgent) return viaAgent;
    agentAvailable = false;
  }
  // Fallback: browser fetch heuristic (cannot reach LAN-only / non-HTTP hosts).
  return Promise.all(hosts.map((h) => pingHost(h)));
}

const DEFAULTS: { label: string; host: string }[] = [
  { label: "Gateway", host: "192.168.3.1" },
  { label: "DNS Shecan", host: "178.22.122.100" },
  { label: "Google", host: "8.8.8.8" },
  { label: "Cloudflare", host: "1.1.1.1" },
  { label: "Steam", host: "store.steampowered.com" },
  { label: "Riot", host: "riotgames.com" },
];

export function getDefaultTargets(): PingTarget[] {
  return DEFAULTS.map((t) => ({ ...t, history: [] }));
}

export function loadTargets(): PingTarget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { label: string; host: string }[];
      if (Array.isArray(parsed) && parsed.length === 6) {
        return parsed.map((t) => ({ ...t, history: [] }));
      }
    }
  } catch {
    /* ignore */
  }
  return getDefaultTargets();
}

export function saveTargets(targets: PingTarget[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(targets.map(({ label, host }) => ({ label, host }))),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Browser-friendly "ping" via fetch HEAD with no-cors + AbortController.
 * Measures TCP+TLS round-trip; browsers cannot send raw ICMP, so the absolute
 * number will be higher than `ping` from the OS but the trend is comparable.
 * Returns ms latency or -1 on timeout/loss.
 */
export async function pingHost(host: string): Promise<number> {
  const looksLikeUrl = /^https?:\/\//i.test(host);
  // Try https first for domain names (better connectivity in most browsers),
  // http for raw IPs (avoids cert errors that block timing).
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const url = looksLikeUrl
    ? host
    : `${isIp ? "http" : "https"}://${host}/favicon.ico?_=${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = performance.now();
  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: ctrl.signal,
      // redirect MUST be "follow" when mode is "no-cors"; using "manual" made
      // every fetch throw a TypeError instantly, so no host was ever reached.
      redirect: "follow",
    });
    return Math.round(performance.now() - start);
  } catch {
    // A no-cors fetch RESOLVES (opaque response) for any reachable host that
    // returns an HTTP response. A rejection means the connection failed
    // (DNS error, refused, offline, timeout) → this is real packet loss.
    // The previous version returned the (~0ms) elapsed time here, which made
    // unreachable hosts look like a healthy "0 ms" reply. Treat as loss.
    return -1;
  } finally {
    clearTimeout(timer);
  }
}

export function pushHistory(prev: PingSample[], value: number): PingSample[] {
  const next = [...prev, { t: Date.now(), v: value }];
  if (next.length > HISTORY_LEN) next.shift();
  return next;
}
