import { useEffect, useState } from "react";
import type { PingTarget } from "@/lib/monitoring-types";
import { colorFor, loadSettings, type GaugeSettings } from "@/lib/gauge-settings";

const AVG_WINDOW_MS = 30_000;

function useGaugeSettings(): GaugeSettings {
  const [s, setS] = useState<GaugeSettings>(() => loadSettings());
  useEffect(() => {
    const h = () => setS(loadSettings());
    window.addEventListener("exir:gauge-settings", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("exir:gauge-settings", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return s;
}

interface Props {
  targets: PingTarget[];
  onEdit: (index: number, next: { label: string; host: string }) => void;
}

export function PingPanel({ targets, onEdit }: Props) {
  const settings = useGaugeSettings();
  const [editing, setEditing] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftHost, setDraftHost] = useState("");

  function startEdit(i: number, t: PingTarget) {
    setEditing(i);
    setDraftLabel(t.label);
    setDraftHost(t.host);
  }
  function commit() {
    if (editing === null) return;
    const host = draftHost.trim();
    const label = draftLabel.trim() || host;
    if (host) onEdit(editing, { label, host });
    setEditing(null);
  }

  const now = Date.now();

  return (
    <div className="rounded-xl p-4 glass-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">network · ping</h3>
        <span className="font-mono text-[10px] text-muted-foreground">avg window: 30s · click to edit</span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {targets.map((t, i) => {
          // 30-second rolling window for avg/loss
          const windowed = t.history.filter((s) => now - s.t <= AVG_WINDOW_MS);
          const valid = windowed.filter((s) => s.v >= 0);
          const avg = valid.length ? valid.reduce((a, b) => a + b.v, 0) / valid.length : 0;
          const loss = windowed.length
            ? Math.round(((windowed.length - valid.length) / windowed.length) * 100)
            : 0;
          const lastSample = t.history[t.history.length - 1];
          const last = lastSample?.v;
          const colorBasis = last !== undefined && last >= 0 ? last : avg;
          const color = loss > 30 ? "#ef4444" : colorFor(settings.ping, colorBasis);
          // last 6 samples for sparkline
          const spark = t.history.slice(-6);
          const isEditing = editing === i;

          return (
            <div
              key={i}
              onClick={() => !isEditing && startEdit(i, t)}
              className="cursor-pointer rounded-md border border-border/60 bg-surface/40 p-2.5 transition hover:border-cyan-500/60 hover:bg-surface/60"
            >
              {isEditing ? (
                <div onClick={(e) => e.stopPropagation()} className="space-y-1.5">
                  <input
                    autoFocus
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    placeholder="label"
                    className="w-full rounded border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-cyan-500"
                  />
                  <input
                    value={draftHost}
                    onChange={(e) => setDraftHost(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    placeholder="host or ip"
                    className="w-full rounded border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-cyan-500"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={commit}
                      className="flex-1 rounded border border-green-500/50 bg-green-500/10 py-1 font-mono text-[10px] uppercase text-green-300 hover:bg-green-500/20"
                    >
                      save
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex-1 rounded border border-border py-1 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
                    >
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="truncate font-mono text-[11px] font-semibold uppercase">{t.label}</span>
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{t.host}</div>

                  <div className="mt-1.5 flex items-baseline gap-1">
                    <span className="font-mono text-lg font-bold leading-none" style={{ color: last !== undefined && last < 0 ? "var(--neon-red)" : color, textShadow: `0 0 8px ${last !== undefined && last < 0 ? "var(--neon-red)" : color}` }}>
                      {last === undefined ? "—" : last < 0 ? "✕" : last}
                    </span>
                    <span className="font-mono text-[9px] uppercase text-muted-foreground">{last !== undefined && last >= 0 ? "ms" : "loss"}</span>
                  </div>

                  <div className="mt-1.5 flex h-7 items-end gap-0.5">
                    {Array.from({ length: 6 }).map((_, idx) => {
                      const s = spark[idx];
                      if (!s) {
                        return <div key={idx} className="flex-1 rounded-sm bg-border/40" style={{ height: 3 }} />;
                      }
                      const v = s.v;
                      return (
                        <div
                          key={idx}
                          title={v < 0 ? "loss" : `${v}ms`}
                          className="flex-1 rounded-sm"
                          style={{
                            height: v < 0 ? 4 : Math.max(4, Math.min(28, v / 5)),
                            background: v < 0 ? "var(--neon-red)" : color,
                            opacity: v < 0 ? 0.7 : 0.9,
                          }}
                        />
                      );
                    })}
                  </div>

                  <div className="mt-1.5 flex justify-between font-mono text-[10px]">
                    <span className="text-muted-foreground">AVG <span style={{ color }}>{valid.length ? avg.toFixed(0) : "—"}{valid.length ? "ms" : ""}</span></span>
                    <span className="text-muted-foreground">LOSS <span style={{ color: loss > 0 ? "var(--neon-red)" : "var(--foreground)" }}>{loss}%</span></span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
