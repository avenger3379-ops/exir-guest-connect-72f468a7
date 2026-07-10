import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { loadPlatforms, type PlatformStatus, LATENCY_TARGETS } from "@/lib/game-platforms";

const REFRESH_MS = 30_000;

function color(l: PlatformStatus["level"]) {
  return l === "ok" ? "var(--neon-green)"
    : l === "warn" ? "var(--neon-amber)"
    : l === "down" ? "var(--neon-red)"
    : "oklch(0.6 0.02 250)";
}

export function GamePlatformsPanel() {
  const [items, setItems] = useState<PlatformStatus[]>([]);
  const [pings, setPings] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    let alive = true;
    async function tick() {
      const s = await loadPlatforms();
      if (alive) setItems(s);
    }
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let alive = true;
    async function tickLat() {
      const flat: { plat: string; region: string; host: string }[] = [];
      for (const [plat, arr] of Object.entries(LATENCY_TARGETS)) {
        for (const t of arr) flat.push({ plat, ...t });
      }
      try {
        const r = await fetch("http://localhost:8765/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hosts: flat.map((f) => f.host) }),
        });
        const json = (await r.json()) as { results?: number[] };
        if (!alive) return;
        const next: Record<string, Record<string, number>> = {};
        flat.forEach((f, i) => {
          next[f.plat] = next[f.plat] || {};
          next[f.plat][f.region] = json.results?.[i] ?? -1;
        });
        setPings(next);
      } catch { /* agent offline */ }
    }
    tickLat();
    const id = setInterval(tickLat, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const down = items.find((x) => x.level === "down");

  return (
    <div className="mb-3 rounded-xl p-3 glass-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          <Gamepad2 size={12} /> ▸ game platforms
        </h3>
        {down && (
          <span className="font-mono text-[10px] uppercase" style={{ color: "var(--neon-red)" }}>
            {down.name} مشکل دارد
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((p) => (
          <div key={p.key} className="rounded-lg border border-border/60 bg-surface/50 p-2 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: color(p.level), boxShadow: `0 0 6px ${color(p.level)}` }} />
              <span className="font-mono text-[11px] font-bold" style={{ color: color(p.level) }}>{p.name}</span>
            </div>
            <div className="mt-0.5 font-mono text-[9px] uppercase text-muted-foreground">{p.level}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        {Object.entries(LATENCY_TARGETS).map(([plat, targets]) => (
          <div key={plat} className="rounded-lg border border-border/60 bg-surface/40 p-2">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-glow-cyan">{plat} latency</div>
            <div className="space-y-0.5">
              {targets.map((t) => {
                const v = pings[plat]?.[t.region];
                const c = v === undefined ? "text-muted-foreground" : v < 0 ? "text-rose-400" : v < 60 ? "text-emerald-300" : v < 120 ? "text-amber-300" : "text-rose-400";
                return (
                  <div key={t.region} className="flex justify-between font-mono text-[11px]">
                    <span className="text-muted-foreground">{t.region}</span>
                    <span className={c}>{v === undefined ? "…" : v < 0 ? "—" : `${v}ms`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
