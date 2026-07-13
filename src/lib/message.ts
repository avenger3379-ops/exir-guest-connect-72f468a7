// Send Message — talks to the local ping-agent (:8765), same as power.ts.
// The agent copies a self-contained .hta file to the client PC (admin share)
// and launches it with mshta.exe in the user's interactive session, so a
// styled window pops up right on the client's screen.

import { getMachine, loadVncConfig } from "./vnc-config";
import { loadPowerCreds } from "./power";
import { loadLogo } from "./branding";
import { buildMessageHtml, type MessageButtonOpt } from "./message-template";

export interface SendMessageOptions {
  text: string;
  theme: "dark" | "light";
  imageDataUrl?: string;
  countdownSeconds?: number;
  countdownLabel?: string;
  autoCloseSeconds?: number;
  soundOn?: boolean;
  buttons: MessageButtonOpt[];
}

// ── Font embedding ──────────────────────────────────────────────────────
// Optional: drop Vazirmatn-Regular.woff2 / Vazirmatn-Bold.woff2 into
// /public/fonts to get the real Vazirmatn typeface baked into every popup.
// Without them, the popup still looks great and reads Persian perfectly —
// it just falls back to Tahoma/Segoe UI (both fully support Farsi).
let fontCache: { regular?: string; bold?: string } | null = null;

async function fetchAsBase64(url: string): Promise<string | undefined> {
  try {
    const r = await fetch(url);
    if (!r.ok) return undefined;
    const buf = await r.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch {
    return undefined;
  }
}

async function loadFonts(): Promise<{ regular?: string; bold?: string }> {
  if (fontCache) return fontCache;
  const [regular, bold] = await Promise.all([
    fetchAsBase64("/fonts/Vazirmatn-Regular.woff2"),
    fetchAsBase64("/fonts/Vazirmatn-Bold.woff2"),
  ]);
  fontCache = { regular, bold };
  return fontCache;
}

// ── Logo embedding ──────────────────────────────────────────────────────
async function loadLogoDataUrl(): Promise<string | undefined> {
  try {
    const l = await loadLogo();
    if (!l) return undefined;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(l.blob);
    });
  } catch {
    return undefined;
  }
}

/** Builds the final popup HTML (used for both live preview and real send). */
export async function buildFullMessageHtml(machine: string, opts: SendMessageOptions): Promise<string> {
  const [fonts, logoDataUrl] = await Promise.all([loadFonts(), loadLogoDataUrl()]);
  return buildMessageHtml({
    text: opts.text,
    theme: opts.theme,
    machineLabel: machine,
    imageDataUrl: opts.imageDataUrl,
    logoDataUrl,
    countdownSeconds: opts.countdownSeconds,
    countdownLabel: opts.countdownLabel,
    autoCloseSeconds: opts.autoCloseSeconds,
    soundOn: opts.soundOn,
    buttons: opts.buttons,
    fontRegularBase64: fonts.regular,
    fontBoldBase64: fonts.bold,
  });
}

/** Posts an already-built HTA/HTML payload to one client through the ping-agent's
 * /message route — the exact same delivery pipe sendMessage() uses (mshta on the
 * client, PsExec/WMIC fallback inside the agent only, nothing new to install).
 * Shared by sendMessage() and by punish.ts's sendPunish(). */
export async function postHtmlToClient(
  machine: string,
  html: string,
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const cfg = loadVncConfig();
  const m = getMachine(cfg, machine);
  if (!m) return { ok: false, error: `Unknown machine ${machine}` };
  const creds = loadPowerCreds();
  if (!creds.user || !creds.pass) {
    return { ok: false, error: "admin user/pass needed — set them in Power Control first" };
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    const r = await fetch("http://localhost:8765/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machine,
        host: m.host,
        user: creds.user,
        pass: creds.pass,
        html,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    const json = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: string };
    return { ok: !!json.ok, error: json.error, note: json.note };
  } catch (e) {
    return { ok: false, error: `agent unreachable: ${(e as Error).message}` };
  }
}

export async function sendMessage(
  machine: string,
  opts: SendMessageOptions,
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const html = await buildFullMessageHtml(machine, opts);
  return postHtmlToClient(machine, html);
}
