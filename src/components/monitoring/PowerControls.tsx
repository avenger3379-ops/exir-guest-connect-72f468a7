import { useState } from "react";
import { Power, RotateCw, LogOut, Zap } from "lucide-react";
import { sendPower, type PowerAction } from "@/lib/power";

const ACTIONS: { key: PowerAction; label: string; icon: React.ReactNode; accent: string; confirm?: boolean }[] = [
  { key: "wol",      label: "Wake-on-LAN", icon: <Zap size={13} />,     accent: "var(--neon-green)" },
  { key: "shutdown", label: "Shutdown",    icon: <Power size={13} />,   accent: "var(--neon-red)",     confirm: true },
  { key: "restart",  label: "Restart",     icon: <RotateCw size={13} />, accent: "var(--neon-amber)",  confirm: true },
  { key: "logoff",   label: "Logoff",      icon: <LogOut size={13} />,  accent: "var(--neon-cyan)" },
];

export function PowerControls({ machine }: { machine: string }) {
  const [busy, setBusy] = useState<PowerAction | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(a: (typeof ACTIONS)[number]) {
    if (a.confirm && !confirm(`${a.label} ${machine}?`)) return;
    setBusy(a.key);
    setMsg(null);
    const r = await sendPower(a.key, machine);
    setBusy(null);
    setMsg(r.ok ? `${a.label} → sent` : `${a.label} failed: ${r.error || "?"}`);
    setTimeout(() => setMsg(null), 3500);
  }

  return (
    <div className="mt-4">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        ▸ power control
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
      {msg && (
        <div className="mt-2 rounded border border-border/60 bg-surface/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {msg}
        </div>
      )}
    </div>
  );
}
