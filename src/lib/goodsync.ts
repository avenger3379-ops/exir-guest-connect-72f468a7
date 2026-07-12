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
}

export function vipNN(machine: string): string {
  return String(machine || "").replace(/\D/g, "").padStart(2, "0");
}

export function jobNamesFor(machine: string, game: GsGame): string[] {
  const nn = vipNN(machine);
  if (game === "fortnite") return [`${nn}_Fort`, `${nn}_Fort_local`, `${nn}_Fort_ProgramData`];
  return [`${nn}_FallGuys_local`];
}

export async function gsStart(machine: string, game: GsGame): Promise<{ ok: boolean; key?: string; error?: string }> {
  try {
    const r = await fetch(`${BASE}/goodsync/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machine, game }),
    });
    return await r.json();
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
    return await r.json();
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

export async function gsStatus(): Promise<{ ok: boolean; jobs: GsJobStatus[] }> {
  try {
    const r = await fetch(`${BASE}/goodsync/status`);
    return await r.json();
  } catch {
    return { ok: false, jobs: [] };
  }
}

export async function gsShare(machine: string): Promise<{ ok: boolean; note?: string; error?: string }> {
  try {
    const r = await fetch(`${BASE}/goodsync/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machine }),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}
