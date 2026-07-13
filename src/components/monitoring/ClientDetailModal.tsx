import { useEffect, useState } from "react";
import { Database, Zap, Cloud } from "lucide-react";
import type { ClientStatus } from "@/lib/monitoring-types";
import { MetricBar } from "./MetricBar";
import { PowerControls } from "./PowerControls";
import { GoodSyncPanel } from "./GoodSyncPanel";
import { getMachine, launchVnc, loadVncConfig } from "@/lib/vnc-config";
import { loadSettings, type GaugeSettings } from "@/lib/gauge-settings";
import { ipFromMachine, type ClientCache } from "@/lib/cache-activity";
import { CACHE_EVT } from "./CacheActivityPanel";
import { SendMessageModal } from "./SendMessageModal";

interface Props {
  client: ClientStatus | null;
  onClose: () => void;
}

export function ClientDetailModal({ client, onClose }: Props) {
  const [settings, setSettings] = useState<GaugeSettings>(() => loadSettings());
  const [showSendMessage, setShowSendMessage] = useState(false);
  useEffect(() => {
    const h = () => setSettings(loadSettings());
    window.addEventListener("exir:gauge-settings", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("exir:gauge-settings", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  useEffect(() => {
    if (!client) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [client, onClose]);

  // Subscribe to LanCache activity for this client's IP.
  const [cache, setCache] = useState<ClientCache | null>(null);
  useEffect(() => {
    if (!client) return;
    const ip = ipFromMachine(client.machine);
    if (!ip) return;
    const read = () => {
      const map = (window as unknown as { __exirCache?: Record<string, ClientCache> }).__exirCache;
      setCache(map?.[ip] || null);
    };
    read();
    window.addEventListener(CACHE_EVT, read);
    return () => window.removeEventListener(CACHE_EVT, read);
  }, [client]);

  if (!client) return null;

  const online = client.online !== false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0.05 0.02 260 / 0.55)", backdropFilter: "blur(16px) saturate(140%)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl p-6 glass-panel neon-border-cyan"
      >
        <div className="pointer-events-none absolute inset-0 scanline opacity-20" />

        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full pulse-dot"
                style={{ background: online ? "var(--neon-green)" : "oklch(0.4 0 0)" }}
              />
              <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">client station</span>
            </div>
            <h2 className="mt-1 font-mono text-4xl font-bold tracking-wider text-glow-cyan">{client.machine}</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{client.gpuName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border/60 px-2 py-1 font-mono text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40"
          >
            ESC ✕
          </button>
        </div>

        {online ? (
          <>
            <div className="relative mt-6 grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-3">
              <MetricBar label="GPU Temp" value={client.gpuTemp} unit="°" max={100} bands={settings.gpu} />
              <MetricBar label="CPU Temp" value={client.cpuTemp} unit="°" max={100} bands={settings.cpu} />
              <MetricBar label="RAM Usage" value={client.ram} unit="%" max={100} thresholds={{ warn: 75, crit: 90 }} />
              <MetricBar label="GPU Usage" value={client.gpuUsage} />
              <MetricBar label="CPU Usage" value={client.cpuUsage ?? 0} />
              <div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>FPS</span>
                </div>
                <div className="mt-1 font-mono text-3xl font-bold text-glow-magenta">{client.fps.toFixed(0)}</div>
              </div>
            </div>

            <div className="relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Process" value={client.topProcess} />
              <Stat label="Profile" value={`P${client.profile}`} />
              <Stat label="Thermal" value={`L${client.thermalLevel}`} accent={client.thermalLevel >= 2 ? "red" : "cyan"} />
              <Stat label="Updated" value={new Date(client.timestamp).toLocaleTimeString()} />
            </div>

            <div className="relative mt-6 flex gap-2">
              <button
                onClick={() => {
                  const cfg = loadVncConfig();
                  const m = getMachine(cfg, client.machine);
                  void launchVnc(cfg, client.machine);
                  if (m) {
                    console.info(`[VNC] launching ${client.machine} → ${m.host}:${m.port}`);
                  }
                }}
                title="Downloads a .bat that launches UltraVNC with the mapped IP:PORT. Configure IPs in Settings."
                className="flex-1 rounded-md py-2.5 font-mono text-xs font-bold uppercase tracking-widest neon-border-cyan hover:brightness-125"
              >
                Connect VNC
              </button>
              <button
                onClick={() => setShowSendMessage(true)}
                className="flex-1 rounded-md py-2.5 font-mono text-xs font-bold uppercase tracking-widest neon-border-magenta hover:brightness-125"
              >
                Send Message
              </button>
            </div>
            <LanCacheBox cache={cache} ip={ipFromMachine(client.machine)} />
            <GoodSyncPanel machine={client.machine} />
            <PowerControls machine={client.machine} />
          </>
        ) : (
          <div className="relative mt-10 py-8 text-center">
            <div className="font-mono text-2xl uppercase tracking-widest text-muted-foreground">station offline</div>
            <div className="mt-2 font-mono text-xs text-muted-foreground/70">no JSON heartbeat received</div>
            <PowerControls machine={client.machine} />
          </div>
        )}
      </div>
      {showSendMessage && (
        <SendMessageModal machine={client.machine} onClose={() => setShowSendMessage(false)} />
      )}
    </div>
  );
}

function Stat({ label, value, accent = "cyan" }: { label: string; value: string; accent?: "cyan" | "red" }) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-2.5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className="mt-1 truncate font-mono text-sm font-semibold"
        style={{ color: accent === "red" ? "var(--neon-red)" : "var(--neon-cyan)" }}
      >
        {value}
      </div>
    </div>
  );
}

function LanCacheBox({ cache, ip }: { cache: ClientCache | null; ip: string | null }) {
  const color =
    cache?.mode === "hit" ? "var(--neon-green)"
    : cache?.mode === "miss" ? "var(--neon-red)"
    : cache?.mode === "mixed" ? "var(--neon-amber)"
    : "oklch(0.55 0.02 250)";
  const label =
    cache?.mode === "hit" ? "CACHE HIT"
    : cache?.mode === "miss" ? "INTERNET"
    : cache?.mode === "mixed" ? "MIXED"
    : "IDLE";
  const total = (cache?.hits ?? 0) + (cache?.misses ?? 0);
  const ratio = total ? Math.round(((cache?.hits ?? 0) / total) * 100) : 0;

  return (
    <div
      className="mt-4 rounded-md border p-2.5"
      style={{ borderColor: `${color}55`, background: `${color}0d` }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest" style={{ color }}>
          <Database size={11} /> ▸ lancache · {label}
        </div>
        <span className="font-mono text-[9px] text-muted-foreground">
          {ip ? `ip ${ip}` : "no ip mapping"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <LanStat label="Hits"     value={String(cache?.hits ?? 0)}   icon={<Zap size={11} />}      color="var(--neon-green)" />
        <LanStat label="Misses"   value={String(cache?.misses ?? 0)} icon={<Cloud size={11} />}    color="var(--neon-red)" />
        <LanStat label="Hit %"    value={`${ratio}%`}                icon={<Zap size={11} />}      color="var(--neon-cyan)" />
        <LanStat label="Speed"    value={`${cache?.speedKBs ?? 0} KB/s`} icon={<Database size={11} />} color="var(--neon-magenta)" />
      </div>
      <div className="mt-1.5 font-mono text-[9px] text-muted-foreground">
        last service: <span className="text-foreground/80">{cache?.lastService || "—"}</span>
        {cache?.lastAt ? <> · {new Date(cache.lastAt).toLocaleTimeString()}</> : null}
      </div>
    </div>
  );
}

function LanStat({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded border border-border/60 bg-surface/40 p-1.5">
      <div className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-black leading-none" style={{ color, textShadow: `0 0 5px ${color}55` }}>
        {value}
      </div>
    </div>
  );
}
