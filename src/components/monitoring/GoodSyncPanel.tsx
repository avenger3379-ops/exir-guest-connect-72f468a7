import { useEffect, useState } from "react";
import {
  AlertTriangle,
  AppWindow,
  ChevronDown,
  ChevronUp,
  FolderSync,
  Gamepad2,
  LayoutDashboard,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";
import { gsCancel, gsOpenGui, gsShare, gsStart, gsStatus, jobNamesFor, parsePercent, type GsGame, type GsJobStatus } from "@/lib/goodsync";
import { MetricBar } from "@/components/monitoring/MetricBar";

export function GoodSyncPanel({ machine }: { machine: string }) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<GsJobStatus[]>([]);
  const [busy, setBusy] = useState<GsGame | "share" | `gui-${GsGame}` | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      const r = await gsStatus();
      if (!cancelled) setJobs((r.jobs || []).filter((j) => j.machine === machine));
    };
    void tick();
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [open, machine]);

  async function start(game: GsGame) {
    setBusy(game);
    setMsg(null);
    const r = await gsStart(machine, game);
    setBusy(null);
    setMsg({ ok: !!r.ok, text: r.ok ? `▶ سینک ${game} از داشبورد شروع شد` : `شروع ناموفق بود: ${r.error || "?"}` });
    setTimeout(() => setMsg(null), 5000);
  }

  async function openGui(game: GsGame) {
    setBusy(`gui-${game}`);
    setMsg(null);
    const r = await gsOpenGui(machine, game);
    setBusy(null);
    setMsg({
      ok: !!r.ok,
      text: r.ok ? `↗ GoodSync برای ${game} روی ${machine} باز شد` : `باز کردن GoodSync ناموفق بود: ${r.error || "?"}`,
    });
    setTimeout(() => setMsg(null), 5000);
  }

  async function stop(key: string) {
    await gsCancel(key);
  }

  async function share() {
    if (!confirm(`Run ShareEpicFolders.ps1 on ${machine}?`)) return;
    setBusy("share");
    setMsg(null);
    const r = await gsShare(machine);
    setBusy(null);
    setMsg({ ok: !!r.ok, text: r.ok ? `✓ shares ensured on ${machine}${r.note ? ` (${r.note})` : ""}` : `share failed: ${r.error || "?"}` });
    setTimeout(() => setMsg(null), 6000);
  }

  const fortJobs = jobNamesFor(machine, "fortnite");
  const fallJobs = jobNamesFor(machine, "fallguys");
  const running = jobs.filter((j) => j.running);

  // Most recent file/job-level errors across running + recently finished jobs,
  // newest first, so "which file failed and why" is visible in one place.
  const recentFileErrors = jobs
    .flatMap((j) => (j.fileErrors || []).map((fe) => ({ ...fe, game: j.game })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);

  return (
    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "oklch(0.7 0.15 175 / 0.35)", background: "oklch(0.7 0.15 175 / 0.05)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-widest"
        style={{ color: "var(--neon-cyan)" }}
      >
        <span className="flex items-center gap-1.5">
          <FolderSync size={11} /> ▸ goodsync · game deploy
          {running.length > 0 && (
            <span className="ml-2 rounded-full px-1.5 py-[1px] text-[8px] font-bold" style={{ background: "var(--neon-green)", color: "black" }}>
              {running.length} running
            </span>
          )}
          {recentFileErrors.length > 0 && (
            <span
              className="ml-1 flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[8px] font-bold"
              style={{ background: "var(--neon-red)", color: "black" }}
            >
              <AlertTriangle size={8} /> {recentFileErrors.length} خطا
            </span>
          )}
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <>
          {/* ── Section A: silent dashboard sync ─────────────────────── */}
          <div className="mt-3 rounded-lg border p-2.5" style={{ borderColor: "oklch(0.75 0.16 195 / 0.4)", background: "oklch(0.75 0.16 195 / 0.06)" }}>
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--neon-cyan)" }}>
              <LayoutDashboard size={12} />
              آپدیت از داشبورد
              <span className="font-normal normal-case tracking-normal text-muted-foreground">— بی‌صدا، پیشرفت همینجا نشون داده می‌شه</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <DashButton
                label="Sync Fortnite"
                sub={fortJobs.join(" + ")}
                icon={<Gamepad2 size={14} />}
                accent="var(--neon-magenta)"
                disabled={busy !== null}
                onClick={() => start("fortnite")}
                spinning={busy === "fortnite"}
              />
              <DashButton
                label="Sync FallGuys"
                sub={fallJobs.join("")}
                icon={<Gamepad2 size={14} />}
                accent="var(--neon-amber)"
                disabled={busy !== null}
                onClick={() => start("fallguys")}
                spinning={busy === "fallguys"}
              />
              <DashButton
                label="Ensure Shares"
                sub="ShareEpicFolders.ps1"
                icon={<Share2 size={14} />}
                accent="var(--neon-cyan)"
                disabled={busy !== null}
                onClick={share}
                spinning={busy === "share"}
              />
            </div>
          </div>

          {/* visual gap + divider so the two groups can't be confused */}
          <div className="my-2.5 flex items-center gap-2">
            <div className="h-px flex-1 bg-border/50" />
            <span className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60">یا</span>
            <div className="h-px flex-1 bg-border/50" />
          </div>

          {/* ── Section B: open the real GoodSync app ────────────────── */}
          <div className="rounded-lg border p-2.5" style={{ borderColor: "oklch(0.72 0.19 55 / 0.45)", background: "oklch(0.72 0.19 55 / 0.07)" }}>
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--neon-amber)" }}>
              <AppWindow size={12} />
              باز کردن در GoodSync
              <span className="font-normal normal-case tracking-normal text-muted-foreground">— برنامه واقعی رو باز می‌کنه، درصد و خطاها داخل خودش</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <GuiButton
                label="Fortnite در GoodSync"
                sub={fortJobs.join(" + ")}
                accent="var(--neon-magenta)"
                disabled={busy !== null}
                onClick={() => openGui("fortnite")}
                spinning={busy === "gui-fortnite"}
              />
              <GuiButton
                label="FallGuys در GoodSync"
                sub={fallJobs.join("")}
                accent="var(--neon-amber)"
                disabled={busy !== null}
                onClick={() => openGui("fallguys")}
                spinning={busy === "gui-fallguys"}
              />
            </div>
          </div>

          {running.length > 0 && (
            <div className="mt-3 space-y-2">
              {running.map((j) => {
                const overallPct = j.percent ?? parsePercent(j.lastLine) ?? 0;
                return (
                  <div key={j.key} className="rounded-lg border border-border/60 bg-surface/40 px-2.5 py-2">
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      <RefreshCw size={10} className="animate-spin" style={{ color: "var(--neon-green)" }} />
                      <span className="text-foreground/80">{j.game}</span>
                      <span className="text-muted-foreground truncate">{j.lastLine || j.jobs.join(", ")}</span>
                      <button
                        onClick={() => stop(j.key)}
                        className="ml-auto rounded px-1.5 py-0.5 text-[9px] uppercase tracking-widest hover:bg-red-500/20"
                        style={{ color: "var(--neon-red)" }}
                        title="cancel"
                      >
                        <X size={10} />
                      </button>
                    </div>

                    <div className="mt-1.5">
                      <MetricBar label="پیشرفت کل" value={overallPct} unit="%" thresholds={{ warn: 101, crit: 101 }} />
                    </div>

                    {j.jobProgress && Object.keys(j.jobProgress).length > 0 && (
                      <div className="mt-2 space-y-1.5 border-t border-dashed border-border/50 pt-1.5">
                        {Object.entries(j.jobProgress).map(([jobName, pct]) => (
                          <MetricBar key={jobName} label={jobName} value={pct} unit="%" thresholds={{ warn: 101, crit: 101 }} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Per-file error log: which file failed and why ─────────── */}
          {recentFileErrors.length > 0 && (
            <div className="mt-3 rounded-lg border px-2.5 py-2" style={{ borderColor: "oklch(0.6 0.25 25 / 0.4)", background: "oklch(0.6 0.25 25 / 0.06)" }}>
              <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--neon-red)" }}>
                <AlertTriangle size={11} /> فایل‌ها/کارهایی که خطا دادن
              </div>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {recentFileErrors.map((fe, i) => (
                  <div key={`${fe.at}-${i}`} className="flex items-start gap-2 font-mono text-[9px]">
                    <span className="mt-0.5 shrink-0" style={{ color: "var(--neon-red)" }}>✕</span>
                    <span className="shrink-0 text-foreground/70">[{fe.game}/{fe.job}]</span>
                    <span className="truncate text-muted-foreground">{fe.line}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground/60">{new Date(fe.at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {jobs.filter((j) => !j.running).slice(-3).reverse().map((j) => (
            <div key={j.key} className="mt-1 flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
              <span style={{ color: j.ok ? "var(--neon-green)" : "var(--neon-red)" }}>
                {j.ok ? "✓" : "✕"}
              </span>
              <span>{j.game}</span>
              <span className="truncate">{j.error || j.lastLine || `exit ${j.exitCode}`}</span>
              <span className="ml-auto">{j.finishedAt ? new Date(j.finishedAt).toLocaleTimeString() : ""}</span>
            </div>
          ))}

          {msg && (
            <div
              className="mt-2 rounded border px-2 py-1 font-mono text-[10px]"
              style={{
                borderColor: msg.ok ? "var(--neon-green)" : "var(--neon-red)",
                background: msg.ok ? "oklch(0.7 0.2 145 / 0.1)" : "oklch(0.6 0.25 25 / 0.1)",
                color: msg.ok ? "var(--neon-green)" : "var(--neon-red)",
              }}
            >
              {msg.text}
            </div>
          )}

          <div className="mt-2 font-mono text-[9px] text-muted-foreground/70">
            requires goodsync installed on operator PC · configure path via <code>GOODSYNC_PATH</code> in .env
          </div>
        </>
      )}
    </div>
  );
}

// Primary action card for the silent, dashboard-tracked sync.
function DashButton({
  label, sub, icon, accent, onClick, disabled, spinning,
}: {
  label: string; sub: string; icon: React.ReactNode; accent: string;
  onClick: () => void; disabled: boolean; spinning: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-start gap-1.5 rounded-lg border px-3 py-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-40 disabled:hover:translate-y-0"
      style={{ borderColor: `${accent}55`, background: `linear-gradient(160deg, ${accent}14, ${accent}05)` }}
      title={sub}
    >
      <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>
        <span
          className="flex size-5 items-center justify-center rounded-full"
          style={{ background: `${accent}22`, boxShadow: spinning ? `0 0 8px ${accent}` : "none" }}
        >
          {spinning ? <RefreshCw size={11} className="animate-spin" /> : icon}
        </span>
        {label}
      </div>
      <div className="truncate font-mono text-[8px] text-muted-foreground w-full">{sub}</div>
    </button>
  );
}

// Secondary action card that hands the sync off to the real GoodSync GUI.
// Visually distinct (outline-only, amber section, AppWindow-style corner tag)
// so it can't be mistaken for the dashboard button next to it.
function GuiButton({
  label, sub, accent, onClick, disabled, spinning,
}: {
  label: string; sub: string; accent: string;
  onClick: () => void; disabled: boolean; spinning: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative flex flex-col items-start gap-1.5 overflow-hidden rounded-lg border-2 border-dashed px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-solid disabled:opacity-40 disabled:hover:translate-y-0"
      style={{ borderColor: `${accent}66`, background: "oklch(0.2 0.01 250 / 0.35)" }}
      title={sub}
    >
      <span
        className="absolute -right-6 -top-6 flex size-14 rotate-12 items-end justify-start rounded-lg opacity-20"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>
        {spinning ? <RefreshCw size={13} className="animate-spin" /> : <AppWindow size={13} />}
        {label}
      </div>
      <div className="truncate font-mono text-[8px] text-muted-foreground w-full">{sub}</div>
    </button>
  );
}
