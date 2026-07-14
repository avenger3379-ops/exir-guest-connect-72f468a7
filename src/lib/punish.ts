export interface SendPunishOptions {
  reason?: string;
  seconds?: number;
}

/** Tells the local ping-agent to send a full-screen warning to exactly one
 * VIP client. The agent forwards this to WarningServer.exe's own command
 * port, which only reaches the client identified by `machine` — every other
 * connected client is untouched. */
export async function sendPunish(
  machine: string,
  opts: SendPunishOptions = {},
): Promise<{ ok: boolean; error?: string; note?: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch("http://localhost:8765/punish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machine,
        reason: opts.reason,
        seconds: opts.seconds ?? 15,
      }),
    }).finally(() => clearTimeout(t));
    const json = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: string };
    return { ok: !!json.ok, error: json.error, note: json.note };
  } catch (e) {
    return { ok: false, error: `agent unreachable: ${(e as Error).message}` };
  }
}
