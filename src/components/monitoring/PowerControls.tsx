import { useState } from "react";
import { Power, RotateCw, LogOut, Zap, KeyRound, ChevronDown, ChevronUp } from "lucide-react";
import { sendPower, loadPowerCreds, savePowerCreds, type PowerAction } from "@/lib/power";

const ACTIONS: { key: PowerAction; label: string; icon: React.ReactNode; accent: string; confirm?: boolean }[] = [
  { key: "wol",      label: "Wake-on-LAN", icon: <Zap size={13} />,     accent: "var(--neon-green)" },
  { key: "shutdown", label: "Shutdown",    icon: <Power size={13} />,   accent: "var(--neon-red)",     confirm: true },
  { key: "restart",  label: "Restart",     icon: <RotateCw size={13} />, accent: "var(--neon-amber)",  confirm: true },
  { key: "logoff",   label: "Logoff",      icon: <LogOut size={13} />,  accent: "var(--neon-cyan)" },
];

export function PowerControls({ machine }: { machine: string }) {
  const [busy, setBusy] = useState<PowerAction | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [open, setOpen] = useState(false);
  const [creds, setCreds] = useState(() => loadPowerCreds());

  async function run(a: (typeof ACTIONS)[number]) {
    if (a.confirm && !confirm(`${a.label} ${machine}?`)) return;
    // If creds are missing for a remote action, nudge the user first.
    if (a.key !== "wol" && (!creds.user || !creds.pass)) {
      setMsg("admin user/pass needed — click the key icon");
      setMsgOk(false);
      setShowCreds(true);
      return;
    }
    setBusy(a.key);
    setMsg(null);
    const r = await sendPower(a.key, machine);
    setBusy(null);
    setMsgOk(!!r.ok);
    setMsg(r.ok ? `${a.label} → sent${r.note ? ` (${r.note})` : ""}` : `${a.label} failed: ${r.error || "?"}`);
    setTimeout(() => setMsg(null), 5000);
  }

  function saveAndClose() {
    savePowerCreds(creds);
    setShowCreds(false);
    setMsg("credentials saved");
    setMsgOk(true);
    setTimeout(() => setMsg(null), 2000);
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-border/60 bg-surface/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition hover:border-cyan-500/60 hover:text-cyan-300"
      >
        <span className="flex items-center gap-1.5">
          <Power size={11} /> ▸ power control
        </span>
        <span className="flex items-center gap-1 text-[9px]">
          {open ? "hide" : "show"} {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>

      {!open ? null : (
      <>
      <div className="mb-1.5 mt-2 flex items-center justify-end">
        <button
          onClick={() => setShowCreds((s) => !s)}
          title="Admin credentials (needed to bypass 'Access is denied 5')"
          className="flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground hover:text-foreground"
        >
          <KeyRound size={10} />
          {creds.user ? `as ${creds.user}` : "set creds"}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            disabled={busy !== null}
            onClick={() => run(a)}
            className="flex flex-col items-center gap-1 rounded-md border border-border/60 bg-surface/50 py-2 font-mono text-[10px] uppercase tracking-wider transition hover:brightness-125 disabled:opacity-50"
            style={{ color: a.accent, borderColor: `${a.accent}55` }}
            title={a.label}
          >
            <span style={{ filter: `drop-shadow(0 0 6px ${a.accent})` }}>{a.icon}</span>
            <span>{busy === a.key ? "…" : a.label.split("-")[0]}</span>
          </button>
        ))}
      </div>

      {showCreds && (
        <div className="mt-2 rounded-md border border-border/60 bg-surface/40 p-2">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            admin credentials (used for shutdown/restart/logoff via net use + shutdown/psexec/wmic)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              autoFocus
              placeholder="user (e.g. Administrator)"
              value={creds.user || ""}
              onChange={(e) => setCreds({ ...creds, user: e.target.value })}
              className="rounded border border-border bg-background/60 px-2 py-1 font-mono text-[11px] outline-none focus:border-cyan-500"
            />
            <input
              type="password"
              placeholder="password"
              value={creds.pass || ""}
              onChange={(e) => setCreds({ ...creds, pass: e.target.value })}
              className="rounded border border-border bg-background/60 px-2 py-1 font-mono text-[11px] outline-none focus:border-cyan-500"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setShowCreds(false)}
              className="rounded border border-border/60 px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
            >
              cancel
            </button>
            <button
              onClick={saveAndClose}
              className="rounded border border-cyan-500/60 bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-cyan-300 hover:bg-cyan-500/25"
            >
              save
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div
          className="mt-2 rounded border px-2 py-1 font-mono text-[10px]"
          style={{
            borderColor: msgOk ? "var(--neon-green)55" : "var(--neon-red)55",
            color: msgOk ? "var(--neon-green)" : "var(--neon-red)",
            background: msgOk ? "var(--neon-green)10" : "var(--neon-red)10",
          }}
        >
          {msg}
        </div>
      )}
      </>
      )}
    </div>
  );
}
