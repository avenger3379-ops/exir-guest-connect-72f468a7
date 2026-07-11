// Persistent CDN host database (localStorage-backed "SQLite-like" store).
// Auto-populated from LanCache access.log lines.

export interface HostRow {
  hostname: string;
  launcher: string;      // steam / epic / origin / blizzard / riot / ...
  firstSeen: number;
  lastSeen: number;
  timesSeen: number;
  hits: number;
  misses: number;
  vips: string[];        // client machines observed
  games: string[];       // heuristic game names from URLs
  cached: boolean;       // hits > 0
  resolvedIp?: string;
}

const KEY = "exir.cdn.hosts.v1";
export const CDN_EVT = "exir:cdn-hosts";

export function loadHosts(): Record<string, HostRow> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

export function saveHosts(map: Record<string, HostRow>) {
  localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(CDN_EVT));
}

export function classifyLauncher(service: string, host: string): string {
  const s = (service || "").toLowerCase();
  const h = (host || "").toLowerCase();
  if (s.includes("epic") || h.includes("epicgames") || h.includes("unrealengine") || h.includes("fastly-download.epicgames")) return "Epic";
  if (s.includes("steam") || h.includes("steamcontent") || h.includes("steampowered") || h.includes("steamstatic") || h.includes("steamserver")) return "Steam";
  if (s.includes("blizzard") || h.includes("blizzard") || h.includes("battle.net")) return "Blizzard";
  if (s.includes("origin") || s.includes("ea") || h.includes("ea.com") || h.includes("dm.origin")) return "EA";
  if (s.includes("riot") || h.includes("riotgames") || h.includes("leagueoflegends")) return "Riot";
  if (s.includes("wsus") || h.includes("windowsupdate") || h.includes("microsoft")) return "Windows";
  if (s.includes("rockstar") || h.includes("rockstargames")) return "Rockstar";
  if (s.includes("uplay") || s.includes("ubisoft") || h.includes("ubisoft") || h.includes("ubi.com")) return "Ubisoft";
  if (s === "unknown" || !s) return "Unknown";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Heuristic game name guessing from URL path.
export function guessGame(url: string): string | null {
  const u = (url || "").toLowerCase();
  if (u.includes("fortnite")) return "Fortnite";
  if (u.includes("fallguys") || u.includes("fall-guys") || u.includes("fall_guys")) return "Fall Guys";
  if (u.includes("rocketleague") || u.includes("rocket-league")) return "Rocket League";
  if (u.includes("cs2") || u.includes("csgo") || u.includes("counterstrike")) return "Counter-Strike";
  if (u.includes("dota")) return "Dota 2";
  if (u.includes("valorant")) return "Valorant";
  if (u.includes("league")) return "League of Legends";
  if (u.includes("apex")) return "Apex Legends";
  if (u.includes("gta")) return "GTA";
  return null;
}

export function ingest(
  map: Record<string, HostRow>,
  line: {
    host: string;
    service: string;
    ip: string;
    url: string;
    status: "HIT" | "MISS" | "-";
    t: number;
  },
  vipFromIp: (ip: string) => string | null,
): Record<string, HostRow> {
  if (!line.host) return map;
  const host = line.host.toLowerCase();
  const row = map[host] || {
    hostname: host,
    launcher: classifyLauncher(line.service, host),
    firstSeen: line.t,
    lastSeen: line.t,
    timesSeen: 0,
    hits: 0,
    misses: 0,
    vips: [],
    games: [],
    cached: false,
  };
  row.lastSeen = Math.max(row.lastSeen, line.t);
  row.timesSeen += 1;
  if (line.status === "HIT") row.hits += 1;
  else if (line.status === "MISS") row.misses += 1;
  row.cached = row.hits > 0;
  // upgrade launcher if newly identifiable
  if (row.launcher === "Unknown") row.launcher = classifyLauncher(line.service, host);
  const vip = vipFromIp(line.ip);
  if (vip && !row.vips.includes(vip)) row.vips.push(vip);
  const g = guessGame(line.url);
  if (g && !row.games.includes(g)) row.games.push(g);
  map[host] = row;
  return map;
}
