// GoodSync helper — talks to the local ping-agent to run GoodSync CLI jobs
// on a specific VIP. Jobs are pre-imported into GoodSync from the shipped
// FortniteFallGuys-Combined.tix file. Naming convention:
//   NN_Fort              → H:\Epic Games            (main game data)
//   NN_Fort_local        → C:\Users\...\AppData\Local\EpicGamesLauncher + FortniteGame
//   NN_Fort_ProgramData  → C:\ProgramData\Epic
//   NN_FallGuys_local    → local FallGuys install
// where NN is the two-digit VIP number (01..12).

const BASE = "http://localhost:8765";

export type GsGame = "fortnite" | "fallguys";

export interface GsJobStatus {
  key: string;
  machine: string;
  game: GsGame;
  jobs: string[];
  startedAt: number;
  finishedAt?: number;
  running: boolean;
  ok?: boolean;
  exitCode?: number | null;
  lastLine?: string;
  error?: string;
  // Overall progress for the whole game sync (0-100), reported by the agent
  // if it parses GoodSync's own progress output.
  percent?: number;
  // Optional per-job breakdown, e.g. { "01_Fort": 42, "01_Fort_local": 100 }
  // so each file/job (H:\Epic Games, AppData, ProgramData, ...) can show its
  // own bar instead of a single combined number.
  jobProgress?: Record<string, number>;
  // Individual file/job failures scraped from the CLI output as they happen,
  // e.g. { job: "01_Fort", line: "Copy Denied: FortniteGame\\..\\x.pak", at }
  // — so "which file failed and why" is visible, not just a final exit code.
  fileErrors?: { job: string; line: string; at: number }[];
}

// Fallback for agents that haven't been updated yet to send a dedicated
// `percent`/`jobProgress` field: GoodSync's CLI output usually includes a
// "NN%" token in its progress lines, so we scrape it out of lastLine.
export function parsePercent(line?: string): number | undefined {
  if (!line) return undefined;
  const m = line.match(/(\d{1,3})\s?%/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (Number.isNaN(n)) return undefined;
  return Math.max(0, Math.min(100, n));
}

export function vipNN(machine: string): string {
  return String(machine || "").replace(/\D/g, "").padStart(2, "0");
}

export function jobNamesFor(machine: string, game: GsGame): string[] {
  const nn = vipNN(machine);
  if (game === "fortnite") return [`${nn}_Fort`, `${nn}_Fort_local`, `${nn}_Fort_ProgramData`];
  return [`${nn}_FallGuys_local`];
}

// A 404/empty body from the agent (most commonly: the agent process is still
// running an older version of ping-agent.mjs that doesn't have this route
// yet, so it needs a restart) makes r.json() throw a cryptic
// "Unexpected end of JSON input". This turns that into a message that
// actually tells the operator what to do.
async function safeJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  if (!text) {
    throw new Error(
      r.status === 404
        ? "agent این مسیر رو نمی‌شناسه — ping-agent.mjs رو ری‌استارت کن (نسخه‌ی جدیدترش رو جایگزین کردی ولی سرویس قدیمی هنوز اجراست)"
        : `agent پاسخ خالی داد (status ${r.status})`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`agent پاسخ نامعتبر داد: ${text.slice(0, 120)}`);
  }
}

export async function gsStart(machine: string, game: GsGame): Promise<{ ok: boolean; key?: string; error?: string }> {
  try {
    const r = await fetch(`${BASE}/goodsync/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machine, game }),
    });
    return await safeJson(r);
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

export async function gsCancel(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${BASE}/goodsync/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    return await safeJson(r);
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

export async function gsStatus(): Promise<{ ok: boolean; jobs: GsJobStatus[] }> {
  try {
    const r = await fetch(`${BASE}/goodsync/status`);
    return await safeJson(r);
  } catch {
    return { ok: false, jobs: [] };
  }
}

// Instead of running the job silently through the ping-agent (CLI, background),
// this asks the agent to bring the actual GoodSync desktop app to the foreground
// and start the job from inside it — so the operator watches GoodSync's own
// progress bar / % / error log rather than the dashboard's polled status line.
export async function gsOpenGui(machine: string, game: GsGame): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${BASE}/goodsync/open-gui`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machine, game, jobs: jobNamesFor(machine, game) }),
    });
    return await safeJson(r);
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

export async function gsShare(machine: string): Promise<{ ok: boolean; note?: string; error?: string }> {
  try {
    const r = await fetch(`${BASE}/goodsync/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machine }),
    });
    return await safeJson(r);
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}
