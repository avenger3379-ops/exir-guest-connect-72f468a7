// Rolling in-memory today-tallies for the daily report.
// Not persisted across reloads — daily rollover happens automatically at
// 03:00 local (yesterday snapshot is stored in localStorage under DAILY_KEY).

const DAILY_KEY = "exir.daily.snapshot.v1";

export interface DailySnapshot {
  date: string;          // "2026-07-04"
  wan1Uptime: number;    // %
  wan2Uptime: number;    // %
  steamDownMinutes: number;
  topConsumer: string;   // e.g. "VIP06"
}

interface Counters {
  startedAt: number;
  wan1Ok: number; wan1Total: number;
  wan2Ok: number; wan2Total: number;
  steamDown: number;
  perMachine: Record<string, number>; // arbitrary usage score
}

let counters: Counters = fresh();

function fresh(): Counters {
  return {
    startedAt: Date.now(),
    wan1Ok: 0, wan1Total: 0,
    wan2Ok: 0, wan2Total: 0,
    steamDown: 0,
    perMachine: {},
  };
}

export function recordPing(target: "wan1" | "wan2", ok: boolean) {
  if (target === "wan1") { counters.wan1Total++; if (ok) counters.wan1Ok++; }
  else { counters.wan2Total++; if (ok) counters.wan2Ok++; }
}

export function recordSteamDown(seconds: number) {
  counters.steamDown += seconds;
}

export function recordUsage(machine: string, score: number) {
  counters.perMachine[machine] = (counters.perMachine[machine] || 0) + score;
}

export function computeToday(): DailySnapshot {
  const top = Object.entries(counters.perMachine).sort((a, b) => b[1] - a[1])[0];
  return {
    date: new Date().toISOString().slice(0, 10),
    wan1Uptime: counters.wan1Total ? (counters.wan1Ok / counters.wan1Total) * 100 : 0,
    wan2Uptime: counters.wan2Total ? (counters.wan2Ok / counters.wan2Total) * 100 : 0,
    steamDownMinutes: Math.round(counters.steamDown / 60),
    topConsumer: top?.[0] ?? "—",
  };
}

export function loadYesterday(): DailySnapshot | null {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

export function rollover() {
  const snap = computeToday();
  localStorage.setItem(DAILY_KEY, JSON.stringify(snap));
  counters = fresh();
}

// Schedule a rollover for 03:00 tomorrow, then every 24h after.
export function startDailyScheduler() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(3, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();
  setTimeout(() => {
    rollover();
    setInterval(rollover, 24 * 60 * 60 * 1000);
  }, delay);
}
