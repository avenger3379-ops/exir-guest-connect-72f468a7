import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Zap, Cloud, Activity } from "lucide-react";
import {
  aggregate,
  fetchCacheTail,
  loadCacheSsh,
  parseCacheLine,
  type CacheLine,
  type CacheSshConfig,
  type ClientCache,
} from "@/lib/cache-activity";

const POLL_MS = 3000;
const WINDOW_MS = 15_000;
const MAX_KEEP = 800;

// Broadcast per-client cache state so ClientCard can subscribe.
export const CACHE_EVT = "exir:cache-clients";

export function CacheActivityPanel() {
  const [cfg, setCfg] = useState<CacheSshConfig>(() => loadCacheSsh());
  const [lines, setLines] = useState<CacheLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = () => setCfg(loadCacheSsh());
    window.addEventListener("exir:cache-ssh", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("exir:cache-ssh", h);
      window.removeEventListener("storage", h);
    };
  }, []);

  useEffect(() => {
    if (!cfg.enabled || !cfg.host || !cfg.user) return;
    let alive = true;
    const seen = new Set<string>();
    async function tick() {
      const r = await fetchCacheTail(cfg, 300);
      if (!alive) return;
      if (!r.ok) { setError(r.error || "ssh error"); return; }
      setError(null);
      const parsed: CacheLine[] = [];
      for (const raw of r.lines) {
        if (seen.has(raw)) continue;
        seen.add(raw);
        const p = parseCacheLine(raw);
        if (p) parsed.push(p);
      }
      if (parsed.length === 0) return;
      setLines((prev) => {
        const next = [...prev, ...parsed].slice(-MAX_KEEP);
        return next;
      });
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [cfg]);

  const perClient = useMemo(() => aggregate(lines, WINDOW_MS), [lines]);

  // Publish for ClientCard.
  useEffect(() => {
    (window as unknown as { __exirCache?: Record<string, ClientCache> }).__exirCache = perClient;
    window.dispatchEvent(new CustomEvent(CACHE_EVT));
  }, [perClient]);

  const summary = useMemo(() => {
    const arr = Object.values(perClient);
    const active = arr.filter((x) => x.mode !== "idle").length;
    const internet = arr.filter((x) => x.misses > 0).length;
    const idle = 12 - active;
    const totalHits = arr.reduce((a, b) => a + b.hits, 0);
    const totalReq = arr.reduce((a, b) => a + b.hits + b.misses, 0);
    const hitRatio = totalReq ? Math.round((totalHits / totalReq) * 100) : 0;
    const speed = arr.reduce((a, b) => a + b.speedKBs, 0);
    return { active, internet, idle: Math.max(0, idle), hitRatio, speed };
  }, [perClient]);

  // Auto-scroll horizontal log
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [lines.length]);

  const disabled = !cfg.enabled || !cfg.host || !cfg.user;

  return (
    <div className="mb-3 rounded-xl p-3 glass-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          <Database size={12} /> ▸ cache activity · lancache
        </h3>
        {error && <span className="font-mono text-[10px]" style={{ color: "var(--neon-red)" }}>ssh: {error}</span>}
        {disabled && <span className="font-mono text-[10px] text-muted-foreground">configure in Settings</span>}
      </div>

      <div className="grid grid-cols-5 gap-2">
        <Metric label="Active"    value={String(summary.active)}    icon={<Activity size={12} />} color="var(--neon-cyan)" />
        <Metric label="Internet"  value={String(summary.internet)}  icon={<Cloud size={12} />}    color="var(--neon-red)" />
        <Metric label="Idle"      value={String(summary.idle)}      icon={<Database size={12} />} color="oklch(0.6 0.02 250)" />
        <Metric label="Hit Ratio" value={`${summary.hitRatio}%`}    icon={<Zap size={12} />}      color="var(--neon-green)" />
        <Metric label="Speed"     value={`${summary.speed} KB/s`}   icon={<Activity size={12} />} color="var(--neon-magenta)" />
      </div>

      <div className="mt-3 rounded-md border border-border/60 bg-black/40 p-1.5">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">▸ live access.log</span>
          <span className="font-mono text-[9px] text-muted-foreground">{lines.length} lines · {POLL_MS / 1000}s poll</span>
        </div>
        <div ref={scrollRef} className="flex gap-1.5 overflow-x-auto whitespace-nowrap py-1 font-mono text-[10px]" style={{ scrollbarWidth: "thin" }}>
          {lines.slice(-120).map((l, i) => {
            const c = l.status === "HIT" ? "var(--neon-green)" : l.status === "MISS" ? "var(--neon-red)" : "oklch(0.6 0.02 250)";
            return (
              <span key={i} className="shrink-0 rounded border px-1.5 py-0.5" style={{ borderColor: `${c}55`, color: c }} title={l.raw}>
                <b>{l.status}</b> · {l.service} · {l.ip.split(".").pop()} · {(l.bytes / 1024).toFixed(0)}KB
              </span>
            );
          })}
          {lines.length === 0 && <span className="px-2 text-muted-foreground">— no data —</span>}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/50 p-2">
      <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div className="mt-0.5 font-mono text-lg font-black leading-none" style={{ color, textShadow: `0 0 6px ${color}55` }}>
        {value}
      </div>
    </div>
  );
}
