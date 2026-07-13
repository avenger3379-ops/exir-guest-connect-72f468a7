import { useEffect, useMemo, useState } from "react";
import { Radar, Cloud, Zap, Download, Database, AlertTriangle } from "lucide-react";
import { machineFromIp, type CacheLine } from "@/lib/cache-activity";
import { CACHE_LINES_EVT } from "./CacheActivityPanel";
import {
  CDN_EVT,
  classifyLauncher,
  guessGame,
  ingest,
  loadHosts,
  saveHosts,
  type HostRow,
} from "@/lib/cdn-discovery";

// Recommendation threshold: hosts seen more than this without cache = suggest add.
const RECOMMEND_THRESHOLD = 50;
// Live window for "currently downloading" table.
const LIVE_WINDOW_MS = 30_000;

type Tab = "live" | "discovery" | "database" | "stats";

export function EpicCdnDiscovery() {
  const [lines, setLines] = useState<CacheLine[]>([]);
  const [hosts, setHosts] = useState<Record<string, HostRow>>(() => loadHosts());
  const [tab, setTab] = useState<Tab>("live");
  const [launcherFilter, setLauncherFilter] = useState<string>("All");

  // Subscribe to raw cache lines from CacheActivityPanel.
  useEffect(() => {
    const read = () => {
      const arr = (window as unknown as { __exirCacheLines?: CacheLine[] }).__exirCacheLines || [];
      setLines(arr);
    };
    read();
    window.addEventListener(CACHE_LINES_EVT, read);
    return () => window.removeEventListener(CACHE_LINES_EVT, read);
  }, []);

  // Auto-ingest into persistent DB whenever new lines arrive.
  useEffect(() => {
    if (lines.length === 0) return;
    setHosts((prev) => {
      const next = { ...prev };
      for (const l of lines) {
        ingest(next, l, machineFromIp);
      }
      saveHosts(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length]);

  // Cross-tab sync.
  useEffect(() => {
    const h = () => setHosts(loadHosts());
    window.addEventListener(CDN_EVT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(CDN_EVT, h);
      window.removeEventListener("storage", h);
    };
  }, []);

  const hostArr = useMemo(() => Object.values(hosts), [hosts]);

  // Phase 1 — Live monitor: group live lines by VIP+launcher+host with speed.
  const live = useMemo(() => {
    const now = Date.now();
    type Row = {
      vip: string;
      launcher: string;
      host: string;
      ip: string;
      status: "HIT" | "MISS" | "MIXED" | "DNS";
      hits: number;
      misses: number;
      bytes: number;
      lastAt: number;
    };
    const map = new Map<string, Row>();
    for (const l of lines) {
      if (now - l.t > LIVE_WINDOW_MS) continue;
      if (!l.host) continue;
      const vip = machineFromIp(l.ip) || l.ip;
      const launcher = classifyLauncher(l.service, l.host);
      const key = `${vip}|${launcher}|${l.host}`;
      const r = map.get(key) || { vip, launcher, host: l.host, ip: l.ip, status: "MIXED" as const, hits: 0, misses: 0, bytes: 0, lastAt: 0 };
      if (l.status === "HIT") r.hits++;
      else if (l.status === "MISS") r.misses++;
      r.bytes += l.bytes;
      r.lastAt = Math.max(r.lastAt, l.t);
      map.set(key, r);
    }
    return Array.from(map.values())
      .map((r) => {
        const total = r.hits + r.misses;
        r.status = total === 0 ? "DNS" : r.hits === total ? "HIT" : r.misses === total ? "MISS" : "MIXED";
        return {
          ...r,
          speedKBs: Math.round((r.bytes / 1024) / (LIVE_WINDOW_MS / 1000)),
        };
      })
      .sort((a, b) => b.lastAt - a.lastAt);
  }, [lines]);

  // Phase 2 — Discovery: brand-new hosts seen in the last hour.
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const newlyDiscovered = useMemo(
    () => hostArr.filter((h) => h.firstSeen > oneHourAgo).sort((a, b) => b.firstSeen - a.firstSeen),
    [hostArr, oneHourAgo],
  );

  // Phase 4 — Recommendations
  const recommendations = useMemo(
    () => hostArr.filter((h) => !h.cached && h.status !== "DNS Only" && h.timesSeen > RECOMMEND_THRESHOLD).sort((a, b) => b.timesSeen - a.timesSeen),
    [hostArr],
  );

  // Phase 8 — Stats
  const stats = useMemo(() => {
    const byL: Record<string, { known: number; cached: number; unknown: number; needReview: number }> = {};
    for (const h of hostArr) {
      const l = h.launcher || "Unknown";
      if (!byL[l]) byL[l] = { known: 0, cached: 0, unknown: 0, needReview: 0 };
      byL[l].known++;
      if (h.cached) byL[l].cached++;
      else byL[l].unknown++;
      if (!h.cached && h.status !== "DNS Only") byL[l].needReview++;
    }
    return byL;
  }, [hostArr]);

  const launchers = useMemo(() => ["All", ...Array.from(new Set(hostArr.map((h) => h.launcher || "Unknown"))).sort()], [hostArr]);
  const filteredDb = useMemo(() => {
    const arr = launcherFilter === "All" ? hostArr : hostArr.filter((h) => h.launcher === launcherFilter);
    return arr.sort((a, b) => b.timesSeen - a.timesSeen);
  }, [hostArr, launcherFilter]);

  // Phase 5 — download unknown hosts as .txt per launcher.
  function downloadExtras(launcher: string) {
    const rows = hostArr.filter((h) => h.launcher === launcher && !h.cached);
    if (rows.length === 0) { alert(`no uncached ${launcher} hosts`); return; }
    const body = rows.map((r) => r.hostname).join("\n") + "\n";
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${launcher.toLowerCase()}-extra.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function clearDb() {
    if (!confirm("Clear the entire CDN host database? This cannot be undone.")) return;
    saveHosts({});
    setHosts({});
  }

  return (
    <div className="mb-3 rounded-xl p-3 glass-panel neon-border-magenta">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: "var(--neon-magenta)" }}>
          <Radar size={13} /> ▸ epic cdn discovery
        </h3>
        <div className="flex items-center gap-1">
          {(["live", "discovery", "database", "stats"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition"
              style={{
                borderColor: tab === t ? "var(--neon-magenta)" : "oklch(0.3 0.02 260)",
                background: tab === t ? "var(--neon-magenta)15" : "transparent",
                color: tab === t ? "var(--neon-magenta)" : "oklch(0.65 0.02 250)",
              }}
            >
              {t}
              {t === "discovery" && newlyDiscovered.length > 0 ? ` (${newlyDiscovered.length})` : ""}
              {t === "database" ? ` (${hostArr.length})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendations banner (phase 4) — always shown when we have any */}
      {recommendations.length > 0 && (
        <div className="mb-2 rounded-md border p-2" style={{ borderColor: "var(--neon-amber)55", background: "var(--neon-amber)0d" }}>
          <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--neon-amber)" }}>
            <AlertTriangle size={11} /> smart recommendations · {recommendations.length}
          </div>
          <div className="space-y-1">
            {recommendations.slice(0, 3).map((r) => (
              <div key={r.hostname} className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-foreground/80">
                  <b style={{ color: "var(--neon-amber)" }}>{r.hostname}</b> · seen {r.timesSeen}× · not cached
                </span>
                <span className="text-muted-foreground">→ add to {r.launcher} cache</span>
              </div>
            ))}
            {recommendations.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Array.from(new Set(recommendations.map((r) => r.launcher))).map((l) => (
                  <button
                    key={l}
                    onClick={() => downloadExtras(l)}
                    className="flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider hover:brightness-125"
                    style={{ borderColor: "var(--neon-amber)66", color: "var(--neon-amber)" }}
                  >
                    <Download size={10} /> {l.toLowerCase()}-extra.txt
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "live" && (
        <div className="rounded-md border border-border/60 bg-black/40">
          <TableHead cols={["VIP", "Launcher", "Host", "IP", "Status", "Speed", "Last"]} />
          <div className="max-h-64 overflow-y-auto">
            {live.length === 0 && <Empty text="no downloads in the last 30s" />}
            {live.map((r) => {
              const color = r.status === "HIT" ? "var(--neon-green)" : r.status === "MISS" ? "var(--neon-red)" : r.status === "DNS" ? "var(--neon-cyan)" : "var(--neon-amber)";
              const dot = r.status === "HIT" ? "🟢" : r.status === "MISS" ? "🔴" : r.status === "DNS" ? "🔵" : "🟡";
              return (
                <Row key={`${r.vip}-${r.host}`}>
                  <Cell><b className="text-glow-cyan">{r.vip}</b></Cell>
                  <Cell>{r.launcher}</Cell>
                  <Cell className="truncate max-w-[260px]" title={r.host}>{r.host}</Cell>
                  <Cell className="text-muted-foreground">{r.ip}</Cell>
                  <Cell style={{ color }}>{dot} {r.status === "HIT" ? "Cached" : r.status === "MISS" ? "Internet" : r.status === "DNS" ? "DNS Only" : "Mixed"}</Cell>
                  <Cell style={{ color: "var(--neon-magenta)" }}>{r.speedKBs} KB/s</Cell>
                  <Cell className="text-muted-foreground">{timeAgo(r.lastAt)}</Cell>
                </Row>
              );
            })}
          </div>
        </div>
      )}

      {tab === "discovery" && (
        <div className="rounded-md border border-border/60 bg-black/40">
          <TableHead cols={["New Host", "Launcher", "First Seen", "VIP", "Game", "Status"]} />
          <div className="max-h-64 overflow-y-auto">
            {newlyDiscovered.length === 0 && <Empty text="no new hosts in the last hour" />}
            {newlyDiscovered.map((h) => (
              <Row key={h.hostname}>
                <Cell><b style={{ color: "var(--neon-cyan)" }}>{h.hostname}</b></Cell>
                <Cell>{h.launcher}</Cell>
                <Cell className="text-muted-foreground">{new Date(h.firstSeen).toLocaleString()}</Cell>
                <Cell>{h.vips.join(", ") || "—"}</Cell>
                <Cell>{h.games.join(", ") || guessGame(h.hostname) || "—"}</Cell>
                <Cell style={{ color: statusColor(h.status || (h.cached ? "Cached" : "Unknown")) }}>
                  {h.status || (h.cached ? "Cached" : "Unknown")}
                </Cell>
              </Row>
            ))}
          </div>
        </div>
      )}

      {tab === "database" && (
        <div className="rounded-md border border-border/60 bg-black/40">
          <div className="flex items-center justify-between border-b border-border/60 px-2 py-1">
            <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              <Database size={10} /> hosts · {filteredDb.length}
            </div>
            <div className="flex items-center gap-1">
              <select
                value={launcherFilter}
                onChange={(e) => setLauncherFilter(e.target.value)}
                className="rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[9px] uppercase"
              >
                {launchers.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <button
                onClick={clearDb}
                className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-red-300 hover:bg-red-500/20"
              >clear</button>
            </div>
          </div>
          <TableHead cols={["Host", "Launcher", "Status", "Seen", "Hits", "Miss", "DNS", "Last Seen"]} />
          <div className="max-h-72 overflow-y-auto">
            {filteredDb.length === 0 && <Empty text="no hosts recorded yet" />}
            {filteredDb.map((h) => (
              <Row key={h.hostname}>
                <Cell className="truncate max-w-[280px]" title={h.hostname}>{h.hostname}</Cell>
                <Cell>{h.launcher}</Cell>
                <Cell style={{ color: statusColor(h.status || (h.cached ? "Cached" : "Unknown")) }}>{h.status || (h.cached ? "Cached" : "Unknown")}</Cell>
                <Cell>{h.timesSeen}</Cell>
                <Cell style={{ color: "var(--neon-green)" }}>{h.hits}</Cell>
                <Cell style={{ color: "var(--neon-red)" }}>{h.misses}</Cell>
                <Cell style={{ color: "var(--neon-cyan)" }}>{h.dnsOnly || 0}</Cell>
                <Cell className="text-muted-foreground">{timeAgo(h.lastSeen)}</Cell>
              </Row>
            ))}
          </div>
        </div>
      )}

      {tab === "stats" && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {Object.entries(stats).length === 0 && <Empty text="no data — waiting for lancache activity" />}
          {Object.entries(stats).map(([launcher, s]) => (
            <div key={launcher} className="rounded-md border border-border/60 bg-surface/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/80">{launcher}</div>
                <button
                  onClick={() => downloadExtras(launcher)}
                  title={`Export uncached ${launcher} hosts`}
                  className="flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[8px] uppercase text-muted-foreground hover:text-foreground"
                >
                  <Download size={9} /> .txt
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 font-mono text-[10px]">
                <Mini icon={<Database size={10} />} label="Known"  value={String(s.known)}   color="var(--neon-cyan)" />
                <Mini icon={<Zap size={10} />}      label="Cached" value={String(s.cached)}  color="var(--neon-green)" />
                <Mini icon={<Cloud size={10} />}    label="Unknown" value={String(s.unknown)} color="var(--neon-red)" />
                <Mini icon={<AlertTriangle size={10} />} label="Review" value={String(s.needReview)} color="var(--neon-amber)" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <div className="grid gap-2 border-b border-border/60 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground"
      style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
      {cols.map((c) => <div key={c}>{c}</div>)}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  const count = Array.isArray(children) ? children.length : 1;
  return (
    <div className="grid gap-2 border-b border-border/40 px-2 py-1 font-mono text-[10px] hover:bg-white/[0.02]"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {children}
    </div>
  );
}
function Cell({ children, className = "", style, title }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; title?: string }) {
  return <div className={`truncate ${className}`} style={style} title={title}>{children}</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="px-2 py-4 text-center font-mono text-[10px] text-muted-foreground">— {text} —</div>;
}
function Mini({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded border border-border/60 bg-black/30 p-1">
      <div className="flex items-center gap-1 text-[8px] uppercase tracking-widest text-muted-foreground">
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div className="font-black leading-none" style={{ color, textShadow: `0 0 5px ${color}55` }}>{value}</div>
    </div>
  );
}
function statusColor(status: string): string {
  if (status === "Cached") return "var(--neon-green)";
  if (status === "Miss") return "var(--neon-red)";
  if (status === "DNS Only") return "var(--neon-cyan)";
  if (status === "New") return "var(--neon-amber)";
  return "oklch(0.65 0.02 250)";
}
function timeAgo(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
