import { Monitor } from "lucide-react";
import { launchVnc, loadVncConfig } from "@/lib/vnc-config";

interface Props {
  total?: number;
  onlineMachines?: Set<string>;
}

/**
 * Quick-launch VNC row: 12 small icons that fit on a single line, responsive.
 * Click → launches `vnc://VIPnn` via the OS protocol handler (UltraVNC etc.).
 */
export function VncQuickLaunch({ total = 12, onlineMachines }: Props) {
  return (
    <div className="mb-3 rounded-xl p-2 glass-panel">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          ▸ vnc quick connect
        </span>
        <span className="font-mono text-[9px] text-muted-foreground/70">click to launch ultravnc</span>
      </div>
      <div className="flex w-full gap-1">
        {Array.from({ length: total }).map((_, i) => {
          const n = i + 1;
          const machine = `VIP${n.toString().padStart(2, "0")}`;
          const online = onlineMachines ? onlineMachines.has(machine) : true;
          return (
            <button
              key={machine}
              title={`Connect VNC to ${machine}`}
              onClick={() => {
                void launchVnc(loadVncConfig(), machine);
              }}
              className={`group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1.5 transition hover:scale-110 ${
                online
                  ? "border-cyan-500/40 bg-cyan-500/5 hover:border-cyan-400 hover:bg-cyan-500/15"
                  : "border-border/40 bg-surface/20 opacity-60 hover:opacity-100"
              }`}
            >
              <Monitor
                size={14}
                style={{
                  color: online ? "var(--neon-cyan)" : "oklch(0.55 0.02 250)",
                  filter: online ? "drop-shadow(0 0 4px var(--neon-cyan))" : "none",
                }}
              />
              <span
                className="font-mono text-[9px] font-bold leading-none tracking-tight"
                style={{ color: online ? "var(--neon-cyan)" : "oklch(0.55 0.02 250)" }}
              >
                {n.toString().padStart(2, "0")}
              </span>
              <span
                className={`absolute right-0.5 top-0.5 size-1 rounded-full ${online ? "pulse-dot" : ""}`}
                style={{
                  background: online ? "var(--neon-green)" : "oklch(0.4 0 0)",
                  boxShadow: online ? "0 0 4px var(--neon-green)" : "none",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
