// LanCache activity — SSH tail of access.log, parsed client-side.
//
// The Node ping-agent exposes POST /cache/tail. It SSHes into the LanCache
// host, runs `tail -n <lines> <path>`, and returns raw text lines. We parse
// them here and derive per-client HIT/MISS/Mixed/Idle status.

export interface CacheSshConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  logPath: string;
  enabled: boolean;
}

export const DEFAULT_CACHE_SSH: CacheSshConfig = {
  host: "192.168.3.100",
  port: 22,
  user: "lancache",
  pass: "",
  logPath: "/cache/logs/access.log",
  enabled: false,
};

const KEY = "exir.cache.ssh.v1";

export function loadCacheSsh(): CacheSshConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_CACHE_SSH, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_CACHE_SSH;
}

export function saveCacheSsh(c: CacheSshConfig) {
  localStorage.setItem(KEY, JSON.stringify(c));
  window.dispatchEvent(new Event("exir:cache-ssh"));
}

export interface CacheLine {
  t: number;         // epoch ms (best-effort parsed)
  ip: string;        // client IP
  status: "HIT" | "MISS" | "-";
  service: string;   // steam / epic / riot / blizzard / origin / ...
  bytes: number;
  url: string;
  raw: string;
}

// LanCache log line uses upstream_cache_status field. Typical Monolithic log:
// [service] ip - - [time] "GET /path HTTP/1.1" 200 12345 "-" "UA" "HIT" "host"
// Also standard nginx: ip - - [time] "GET url" 200 bytes "-" "UA"
export function parseCacheLine(raw: string): CacheLine | null {
  if (!raw || !raw.trim()) return null;
  // service in leading [brackets]
  const svcM = raw.match(/^\[([^\]]+)\]/);
  const service = svcM ? svcM[1] : "unknown";
  const rest = svcM ? raw.slice(svcM[0].length).trimStart() : raw;
  const ipM = rest.match(/^(\d+\.\d+\.\d+\.\d+)/);
  if (!ipM) return null;
  const ip = ipM[1];
  const timeM = rest.match(/\[([^\]]+)\]/);
  let t = Date.now();
  if (timeM) { const d = new Date(timeM[1].replace(":", " ")); if (!Number.isNaN(d.getTime())) t = d.getTime(); }
  const reqM = rest.match(/"[A-Z]+ ([^"]+) HTTP/);
  const url = reqM ? reqM[1] : "";
  const statusM = rest.match(/\b(HIT|MISS|EXPIRED|REVALIDATED|UPDATING|STALE|BYPASS)\b/);
  const s = statusM?.[1] || "-";
  const status: CacheLine["status"] = s === "HIT" || s === "REVALIDATED" ? "HIT"
    : s === "MISS" || s === "EXPIRED" || s === "BYPASS" ? "MISS" : "-";
  const bytesM = rest.match(/"\s(\d{3})\s+(\d+)/);
  const bytes = bytesM ? Number(bytesM[2]) : 0;
  return { t, ip, service, status, bytes, url, raw };
}

export type CacheMode = "hit" | "miss" | "mixed" | "idle";

export interface ClientCache {
  ip: string;
  mode: CacheMode;
  hits: number;
  misses: number;
  bytes: number;      // last window
  speedKBs: number;   // approx over window
  lastService: string;
  lastAt: number;
}

// Aggregate the last N seconds of lines per client-IP.
export function aggregate(lines: CacheLine[], windowMs = 15_000): Record<string, ClientCache> {
  const now = Date.now();
  const acc: Record<string, ClientCache> = {};
  for (const l of lines) {
    if (now - l.t > windowMs) continue;
    const e = acc[l.ip] || (acc[l.ip] = { ip: l.ip, mode: "idle", hits: 0, misses: 0, bytes: 0, speedKBs: 0, lastService: "", lastAt: 0 });
    if (l.status === "HIT") e.hits++;
    else if (l.status === "MISS") e.misses++;
    e.bytes += l.bytes;
    if (l.t >= e.lastAt) { e.lastAt = l.t; e.lastService = l.service; }
  }
  for (const e of Object.values(acc)) {
    const total = e.hits + e.misses;
    e.mode = total === 0 ? "idle"
      : e.hits === total ? "hit"
      : e.misses === total ? "miss"
      : "mixed";
    e.speedKBs = Math.round((e.bytes / 1024) / (windowMs / 1000));
  }
  return acc;
}

export function machineFromIp(ip: string): string | null {
  // 192.168.3.101..112 → VIP01..VIP12
  const m = ip.match(/^192\.168\.3\.(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 101 || n > 112) return null;
  return `VIP${String(n - 100).padStart(2, "0")}`;
}

export function ipFromMachine(machine: string): string | null {
  const m = machine.match(/^VIP(\d+)$/i);
  if (!m) return null;
  return `192.168.3.${100 + Number(m[1])}`;
}

export async function fetchCacheTail(cfg: CacheSshConfig, lines = 400): Promise<{ ok: boolean; lines: string[]; error?: string }> {
  try {
    const r = await fetch("http://localhost:8765/cache/tail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: cfg.host, port: cfg.port, user: cfg.user, pass: cfg.pass, path: cfg.logPath, lines }),
    });
    const j = await r.json();
    return { ok: !!j.ok, lines: j.lines || [], error: j.error };
  } catch (e) {
    return { ok: false, lines: [], error: (e as Error).message };
  }
}
