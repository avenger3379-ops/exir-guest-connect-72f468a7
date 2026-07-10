import type { ServerStatus } from "@/lib/monitoring-types";
import { MetricBar } from "./MetricBar";

export function ServerCard({ server }: { server: ServerStatus }) {
  const ramPct = (server.ramUsed / server.ramTotal) * 100;

  return (
    <div className="relative overflow-hidden rounded-2xl glass-panel neon-border-magenta">
      <div className="pointer-events-none absolute -left-20 -top-20 size-64 rounded-full opacity-30 blur-3xl" style={{ background: "var(--neon-magenta)" }} />
      <div className="pointer-events-none absolute -right-20 -bottom-20 size-64 rounded-full opacity-20 blur-3xl" style={{ background: "var(--neon-cyan)" }} />
      <div className="pointer-events-none absolute inset-0 scanline opacity-15" />

      <div className="relative flex flex-wrap items-start justify-between gap-6 p-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full pulse-dot" style={{ background: "var(--neon-magenta)", boxShadow: "0 0 10px var(--neon-magenta)" }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
              main server · online
            </span>
          </div>
          <h2 className="mt-2 font-mono text-4xl font-black tracking-wider text-glow-magenta">
            {server.name}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px]">
            <Pill label="UPTIME" value={server.uptime} color="cyan" />
            <Pill label="RAM" value={`${server.ramUsed.toFixed(1)}/${server.ramTotal}GB`} color="magenta" />
            <Pill label="LOAD" value={`${ramPct.toFixed(0)}%`} color={ramPct > 80 ? "red" : "green"} />
          </div>
        </div>

        <div className="grid min-w-[280px] flex-1 grid-cols-2 gap-x-6 gap-y-3">
          <MetricBar label="GPU °C" value={server.gpuTemp} unit="°" max={100} thresholds={{ warn: 70, crit: 80 }} />
          <MetricBar label="CPU °C" value={server.cpuTemp} unit="°" max={100} thresholds={{ warn: 70, crit: 80 }} />
          <MetricBar label="GPU Load" value={server.gpuUsage} />
          <MetricBar label="CPU Load" value={server.cpuUsage} />
          <div className="col-span-2">
            <MetricBar label="RAM" value={ramPct} thresholds={{ warn: 70, crit: 85 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: string; color: "cyan" | "magenta" | "green" | "red" }) {
  const c =
    color === "cyan" ? "var(--neon-cyan)" :
    color === "magenta" ? "var(--neon-magenta)" :
    color === "red" ? "var(--neon-red)" : "var(--neon-green)";
  return (
    <span className="rounded-md border border-border/50 bg-surface/60 px-2.5 py-1">
      <span className="text-muted-foreground">{label} </span>
      <span style={{ color: c }} className="font-bold">{value}</span>
    </span>
  );
}
