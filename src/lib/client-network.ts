// Phase 6 — talks to the exir-client-agent (port 8766) on a specific VIP for
// network-tools operations, and to the operator-side ping-agent (port 8765)
// for open-share (which must run on THIS PC, not the client).

import { getMachine, loadVncConfig } from "./vnc-config";

export interface NetOpResult {
  ok: boolean;
  error?: string;
  output?: string;
  path?: string;
}

async function postClient(machine: string, path: string, body: unknown = {}, timeoutMs = 15000): Promise<NetOpResult> {
  const cfg = loadVncConfig();
  const m = getMachine(cfg, machine);
  if (!m) return { ok: false, error: `unknown machine ${machine}` };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`http://${m.host}:8766${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    const j = (await r.json().catch(() => ({}))) as NetOpResult;
    return { ok: !!j.ok, error: j.error, output: j.output };
  } catch (e) {
    return { ok: false, error: `client-agent unreachable: ${(e as Error).message}` };
  }
}

export function flushDns(machine: string) {
  return postClient(machine, "/net/flush-dns");
}

export function disableProxy(machine: string) {
  return postClient(machine, "/net/disable-proxy");
}

export interface IpSettings {
  ip: string;
  mask: string;
  gateway: string;
  dns1: string;
  dns2?: string;
}

export function setIpSettings(machine: string, s: IpSettings) {
  return postClient(machine, "/net/set-ip", s, 20000);
}

/** Opens a UNC share on the OPERATOR's PC. `share` example: "Drive H" or "C$". */
export async function openShare(machine: string, share: string): Promise<NetOpResult> {
  const cfg = loadVncConfig();
  const m = getMachine(cfg, machine);
  if (!m) return { ok: false, error: `unknown machine ${machine}` };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch("http://localhost:8765/net/open-share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: m.host, share }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    const j = (await r.json().catch(() => ({}))) as NetOpResult;
    return { ok: !!j.ok, error: j.error, path: j.path };
  } catch (e) {
    return { ok: false, error: `ping-agent unreachable: ${(e as Error).message}` };
  }
}

// Persist last IP settings per machine in localStorage so operator doesn't
// re-type every time.
const KEY = (m: string) => `exir.net.ip.${m}`;
export function loadIpSettings(machine: string): Partial<IpSettings> {
  try {
    const raw = localStorage.getItem(KEY(machine));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}
export function saveIpSettings(machine: string, s: IpSettings) {
  try { localStorage.setItem(KEY(machine), JSON.stringify(s)); } catch { /* ignore */ }
}

// Default share names — operator can pick from these quickly.
export const DEFAULT_SHARES = ["Drive H", "C$", "D$", "IPC$"];
