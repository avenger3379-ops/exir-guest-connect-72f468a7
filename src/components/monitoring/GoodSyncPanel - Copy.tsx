import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FolderSync, Gamepad2, RefreshCw, Share2, X } from "lucide-react";
import { gsCancel, gsShare, gsStart, gsStatus, jobNamesFor, type GsGame, type GsJobStatus } from "@/lib/goodsync";

export function GoodSyncPanel({ machine }: { machine: string }) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<GsJobStatus[]>([]);
  const [busy, setBusy] = useState<GsGame | "share" | null>(null);
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
    setMsg({ ok: !!r.ok, text: r.ok ? `▶ started ${game} sync` : `failed: ${r.error || "?"}` });
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

  return (
    <div className="mt-4 rounded-md border p-2.5" style={{ borderColor: "oklch(0.7 0.15 175 / 0.35)", background: "oklch(0.7 0.15 175 / 0.05)" }}>
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
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <GsButton
              label="Sync Fortnite"
              sub={fortJobs.join(" + ")}
              icon={<Gamepad2 size={13} />}
              accent="var(--neon-magenta)"
              disabled={busy !== null}
              onClick={() => start("fortnite")}
              spinning={busy === "fortnite"}
            />
            <GsButton
              label="Sync FallGuys"
              sub={fallJobs.join("")}
              icon={<Gamepad2 size={13} />}
              accent="var(--neon-amber)"
              disabled={busy !== null}
              onClick={() => start("fallguys")}
              spinning={busy === "fallguys"}
            />
            <GsButton
              label="Ensure Shares"
              sub="ShareEpicFolders.ps1"
              icon={<Share2 size={13} />}
              accent="var(--neon-cyan)"
              disabled={busy !== null}
              onClick={share}
              spinning={busy === "share"}
            />
          </div>

          {running.length > 0 && (
            <div className="mt-2 space-y-1">
              {running.map((j) => (
                <div key={j.key} className="flex items-center gap-2 rounded border border-border/60 bg-surface/40 px-2 py-1 font-mono text-[10px]">
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
              ))}
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

function GsButton({
  label, sub, icon, accent, onClick, disabled, spinning,
}: {
  label: string; sub: string; icon: React.ReactNode; accent: string;
  onClick: () => void; disabled: boolean; spinning: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-start gap-1 rounded-md border px-2 py-2 text-left transition hover:brightness-125 disabled:opacity-40"
      style={{ borderColor: `${accent}55`, background: `${accent}0d` }}
      title={sub}
    >
      <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>
        {spinning ? <RefreshCw size={11} className="animate-spin" /> : icon}
        {label}
      </div>
      <div className="truncate font-mono text-[8px] text-muted-foreground w-full">{sub}</div>
    </button>
  );
}
