// Power control client — talks to the local ping-agent (:8765).
// Wake-on-LAN, Shutdown, Restart, Logoff. All actions no-op silently when
// the agent is unreachable (returns { ok:false }).

import { getMachine, loadVncConfig } from "./vnc-config";

export type PowerAction = "wol" | "shutdown" | "restart" | "logoff";

export interface PowerCreds {
  user?: string;
  pass?: string;
}

const CREDS_KEY = "exir.power.creds.v1";

export function loadPowerCreds(): PowerCreds {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

export function savePowerCreds(c: PowerCreds) {
  localStorage.setItem(CREDS_KEY, JSON.stringify(c));
}

export async function sendPower(
  action: PowerAction,
  machine: string,
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const cfg = loadVncConfig();
  const m = getMachine(cfg, machine);
  if (!m) return { ok: false, error: `Unknown machine ${machine}` };
  const creds = loadPowerCreds();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch("http://localhost:8765/power", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        machine,
        host: m.host,
        mac: m.mac || "",
        user: creds.user,
        pass: creds.pass,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    const json = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: string };
    return { ok: !!json.ok, error: json.error, note: json.note };
  } catch (e) {
    return { ok: false, error: `agent unreachable: ${(e as Error).message}` };
  }
}
