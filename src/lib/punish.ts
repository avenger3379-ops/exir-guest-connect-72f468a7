import { postHtmlToClient } from "./message";
import { buildPunishHtml, type BuildPunishOptions } from "./punish-template";

export type SendPunishOptions = Omit<BuildPunishOptions, "machineLabel">;

/** Sends the full-screen "time-out" overlay to one client. Same delivery
 * path as sendMessage() — no extra PsExec usage, no agent changes. */
export async function sendPunish(
  machine: string,
  opts: SendPunishOptions = {},
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const html = buildPunishHtml({ ...opts, machineLabel: machine, seconds: opts.seconds ?? 15 });
  return postHtmlToClient(machine, html);
}
