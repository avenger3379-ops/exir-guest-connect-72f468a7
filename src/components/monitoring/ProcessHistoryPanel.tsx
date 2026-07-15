// Phase 7 — clicking the "Process" stat in ClientDetailModal opens this: a
// chronological log of every app/game that ran on that station, with start
// time and duration, plus a per-app total. The underlying log (src/lib/
// process-history.ts) zeroes itself out the instant the station goes
// offline, so this always reflects "since it last came online".

import { memo, useEffect, useState } from "react";
import { Activity, Clock, X } from "lucide-react";
import { getHistory, subscribeProcessHistory, totalsByProcess, type ProcessLogEntry } from "@/lib/process-history";

interface Props {
  machine: string;
  onClose: () => void;
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} ساعت ${m} دقیقه`;
  if (m > 0) return `${m} دقیقه ${sec} ثانیه`;
  return `${sec} ثانیه`;
}

export const ProcessHistoryPanel = memo(function ProcessHistoryPanel({ machine, onClose }: Props) {
  const [entries, setEntries] = useState<ProcessLogEntry[]>(() => getHistory(machine));
  // Bump this every second just to re-render the live duration of whatever
  // is currently running — no data actually changes, so it's a cheap tick.
  const [, forceTick] = useState(0);

  useEffect(() => {
    const refresh = () => setEntries(getHistory(machine));
    refresh();
    const unsub = subscribeProcessHistory(machine, refresh);
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [machine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totals = totalsByProcess(machine);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "oklch(0.05 0.02 260 / 0.65)", backdropFilter: "blur(16px) saturate(140%)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl glass-panel neon-border-cyan"
      >
        <div className="flex items-center justify-between border-b border-border/50 p-4">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-cyan-400" />
            <h2 className="font-fa font-mono text-sm font-bold uppercase tracking-widest text-glow-cyan">
              تاریخچه اجرا · {machine}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border/60 p-1 text-muted-foreground hover:text-foreground hover:border-foreground/40"
          >
            <X size={14} />
          </button>
        </div>

        {totals.length > 0 && (
          <div className="border-b border-border/50 p-3">
            <div className="font-fa mb-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              جمع زمان هر برنامه (از زمان آنلاین شدن)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {totals.map((t) => (
                <span
                  key={t.process}
                  className="font-fa rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 font-bold font-mono text-[12px] text-cyan-300"
                >
                  {t.process} · {fmtDuration(t.ms)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {entries.length === 0 ? (
            <div className="font-fa py-10 text-center font-mono text-xs text-muted-foreground">
              هنوز برنامه‌ای ثبت نشده — یا کلاینت آفلاینه یا تازه آنلاین شده
            </div>
          ) : (
            <div className="space-y-1.5">
              {entries.map((e, i) => {
                const running = e.endedAt === null;
                const dur = (running ? Date.now() : e.endedAt!) - e.startedAt;
                return (
                  <div
                    key={`${e.startedAt}-${i}`}
                    className="flex items-center justify-between rounded-md border px-2.5 py-2"
                    style={{
                      borderColor: running ? "var(--neon-green)55" : "var(--border)",
                      background: running ? "var(--neon-green)0d" : "transparent",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-foreground">{e.process}</span>
                      {running && (
                        <span
                          className="font-fa rounded-full px-1.5 py-[1px] font-mono text-[8px] font-bold uppercase"
                          style={{ background: "var(--neon-green)", color: "black" }}
                        >
                          در حال اجرا
                        </span>
                      )}
                    </div>
                    <div className="font-fa flex items-center gap-2 font-bold text-[13px] text-muted-foreground" lang="fa">
                      <span className="flex items-center gap-1">
                        <Clock size={10} /> {new Date(e.startedAt).toLocaleTimeString("fa-IR")}
                      </span>
                      <span>{fmtDuration(dur)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="font-fa border-t border-border/50 p-2.5 text-center text-[14px] text-muted-foreground/70" lang="fa">
          این لاگ فقط از زمان آخرین آنلاین‌شدن کلاینت نگه‌داری می‌شه و با آفلاین شدن صفر می‌شه
        </div>
      </div>
    </div>
  );
});
