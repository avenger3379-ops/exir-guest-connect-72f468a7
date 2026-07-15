import { useEffect, useState } from "react";
import { Gamepad2, Zap } from "lucide-react";
import { isComposing } from "@/lib/compose-lock";

type Level = "ok" | "warn" | "down" | "unknown";

interface Service {
  name: string;
  level: Level;
  note?: string;
}

interface Bundle {
  steam: Service[];
  epic: Service[];
  updated: number;
}

const REFRESH_MS = 30_000;

// SteamStatus provides a CORS-enabled snapshot JSON for all Steam services.
// If it fails we degrade to "unknown". No API key required.
const STEAM_URL = "https://crowbar.steamstat.us/Barney";
// Epic Games status via Statuspage.io — CORS-enabled.
const EPIC_URL = "https://status.epicgames.com/api/v2/summary.json";

// keys we care about inside Barney.services (steamstat.us schema: [status, label])
const STEAM_KEYS: Array<{ key: string; name: string }> = [
  { key: "cms", name: "Connection Managers" },
  { key: "community", name: "Community" },
  { key: "store", name: "Store" },
  { key: "webapi", name: "Web API" },
  { key: "csgo", name: "CS2 Sessions" },
  { key: "csgo_mm", name: "CS2 Matchmaking" },
  { key: "dota2_gc", name: "Dota GC" },
];

function normSteam(raw: unknown): Service[] {
  const services = (raw as { services?: Record<string, [string, string]> } | undefined)?.services;
  if (!services) return [];
  const out: Service[] = [];
  for (const { key, name } of STEAM_KEYS) {
    const entry = services[key];
    if (!entry) continue;
    const [status, label] = entry;
    let level: Level = "unknown";
    if (status === "good") level = "ok";
    else if (status === "minor" || status === "slow" || status === "surveying") level = "warn";
    else if (status === "major" || status === "critical" || status === "offline" || status === "no_data")
      level = "down";
    out.push({ name, level, note: label });
  }
  return out;
}

function normEpic(raw: unknown): Service[] {
  const components = (raw as { components?: Array<{ name: string; status: string }> } | undefined)
    ?.components;
  if (!Array.isArray(components)) return [];
  const wanted = ["Epic Games Launcher", "Login", "Store"];
  return wanted
    .map((w) => components.find((c) => c.name.toLowerCase().includes(w.toLowerCase())))
    .filter(Boolean)
    .map((c) => {
      const s = (c as { status: string }).status;
      let level: Level = "unknown";
      if (s === "operational") level = "ok";
      else if (s === "degraded_performance" || s === "partial_outage") level = "warn";
      else if (s === "major_outage" || s === "under_maintenance") level = "down";
      return { name: (c as { name: string }).name, level };
    });
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function loadBundle(): Promise<Bundle> {
  // Steam's status endpoint sends no CORS headers, so a direct browser fetch
  // always fails (→ gray "unknown"). The local ping-agent proxies it for us.
  const [s, e] = await Promise.all([
    fetchJson("http://localhost:8765/steam").then((r) => r ?? fetchJson(STEAM_URL)),
    fetchJson(EPIC_URL),
  ]);
  return {
    steam: s ? normSteam(s) : [{ name: "Steam", level: "unknown" }],
    epic: e ? normEpic(e) : [{ name: "Epic Games", level: "unknown" }],
    updated: Date.now(),
  };
}

function levelColor(l: Level) {
  return l === "ok"
    ? "var(--neon-green)"
    : l === "warn"
      ? "var(--neon-amber)"
      : l === "down"
        ? "var(--neon-red)"
        : "oklch(0.6 0.02 250)";
}

function Dot({ level }: { level: Level }) {
  const c = levelColor(level);
  return (
    <span
      className="inline-block size-2 rounded-full"
      style={{ background: c, boxShadow: `0 0 6px ${c}` }}
    />
  );
}

function Column({
  title,
  icon,
  accent,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  items: Service[];
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/50 p-2.5">
      <div
        className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest"
        style={{ color: accent, textShadow: `0 0 6px ${accent}55` }}
      >
        {icon}
        <span>{title}</span>
      </div>
      <ul className="space-y-0.5">
        {items.length === 0 ? (
          <li className="font-mono text-[10px] text-muted-foreground">no data</li>
        ) : (
          items.map((s) => (
            <li
              key={s.name}
              className="flex items-center justify-between gap-2 font-mono text-[11px] leading-tight"
              title={s.note ?? s.level}
            >
              <span className="flex items-center gap-1.5 truncate">
                <Dot level={s.level} />
                <span className="truncate text-foreground/90">{s.name}</span>
              </span>
              <span className="text-[9px] uppercase tracking-wider" style={{ color: levelColor(s.level) }}>
                {s.level}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function SteamEpicStatus() {
  const [b, setB] = useState<Bundle | null>(null);
  useEffect(() => {
    let alive = true;
    async function tick() {
      if (isComposing()) return;
      const bundle = await loadBundle();
      if (alive) setB(bundle);
    }
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const updated = b ? new Date(b.updated).toLocaleTimeString() : "…";
  return (
    <div className="mb-3 rounded-xl p-3 glass-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          ▸ launcher status
        </h3>
        <span className="font-mono text-[9px] text-muted-foreground">refresh 30s · {updated}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Column
          title="Steam (CS2 · Dota)"
          icon={<Gamepad2 size={12} />}
          accent="var(--neon-cyan)"
          items={b?.steam ?? []}
        />
        <Column
          title="Epic Games"
          icon={<Zap size={12} />}
          accent="var(--neon-magenta)"
          items={b?.epic ?? []}
        />
      </div>
    </div>
  );
}
