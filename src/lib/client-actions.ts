import { getMachine, loadVncConfig } from "./vnc-config";

export interface ClientActionResult {
  ok: boolean;
  method?: string;
  error?: string;
  host?: string;
}

async function postAction(path: "/message" | "/punish", payload: Record<string, unknown>): Promise<ClientActionResult> {
  try {
    const cfg = loadVncConfig();
    const machine = String(payload.machine || "");
    const m = getMachine(cfg, machine);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`http://localhost:8765${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: m?.host, ...payload }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    const json = (await r.json().catch(() => ({}))) as ClientActionResult;
    return { ok: !!json.ok, method: json.method, error: json.error, host: json.host };
  } catch (e) {
    return { ok: false, error: `agent unreachable: ${(e as Error).message}` };
  }
}

export function sendClientMessage(machine: string, message: string, title = "EXIR MESSAGE", seconds = 15) {
  return postAction("/message", { machine, title, message, seconds });
}

export function sendPunishmentWarning(machine: string, message = "لطفاً قوانین سیستم را رعایت کنید", seconds = 15) {
  return postAction("/punish", { machine, message, seconds });
}