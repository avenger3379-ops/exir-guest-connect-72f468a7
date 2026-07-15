import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Cpu, MemoryStick, Thermometer, TriangleAlert, Loader2, Check, X, Monitor, Wifi } from "lucide-react";
import type { ClientStatus } from "@/lib/monitoring-types";
import { CircularGauge } from "./CircularGauge";
import { loadSettings, colorFor, type GaugeSettings } from "@/lib/gauge-settings";
import { ipFromMachine, type ClientCache } from "@/lib/cache-activity";
import { CACHE_EVT } from "./CacheActivityPanel";
import { CLIENT_PING_EVT, type ClientPing } from "@/lib/client-ping";
import { sendPunish } from "@/lib/punish";
import { launchVnc, loadVncConfig } from "@/lib/vnc-config";

interface Props {
  client: ClientStatus;
  onClick: () => void;
}

function gpuBrand(name: string): "nvidia" | "amd" | "intel" | "other" {
  const n = name.toLowerCase();
  if (n.includes("nvidia") || n.includes("geforce") || n.includes("rtx") || n.includes("gtx"))
    return "nvidia";
  if (n.includes("amd") || n.includes("radeon")) return "amd";
  if (n.includes("intel") || n.includes("arc")) return "intel";
  return "other";
}

const BRAND_COLOR: Record<string, string> = {
  nvidia: "var(--neon-green)",
  amd: "var(--neon-red)",
  intel: "var(--neon-cyan)",
  other: "oklch(0.7 0.02 250)",
};

function BrandBadge({ brand }: { brand: "nvidia" | "amd" | "intel" | "other" }) {
  if (brand === "other") return null;
  const cfg = {
    nvidia: {
      text: "NVIDIA",
      color: "#76b900",
      glow: "#76b900",
      bg: "linear-gradient(135deg, oklch(0.25 0.12 145 / 0.85), oklch(0.18 0.08 145 / 0.7))",
    },
    amd: {
      text: "AMD",
      color: "#ed1c24",
      glow: "#ed1c24",
      bg: "linear-gradient(135deg, oklch(0.28 0.18 25 / 0.85), oklch(0.18 0.1 25 / 0.7))",
    },
    intel: {
      text: "INTEL",
      color: "#00c7fd",
      glow: "#00c7fd",
      bg: "linear-gradient(135deg, oklch(0.28 0.14 220 / 0.85), oklch(0.18 0.08 220 / 0.7))",
    },
  }[brand];
  return (
    <span
      className="relative inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black italic tracking-[0.15em]"
      style={{
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}`,
        boxShadow: `0 0 8px ${cfg.glow}66, inset 0 0 6px ${cfg.glow}33`,
        textShadow: `0 0 6px ${cfg.glow}`,
      }}
    >
      <span
        className="size-1 rounded-full"
        style={{ background: cfg.color, boxShadow: `0 0 4px ${cfg.color}` }}
      />
      {cfg.text}
    </span>
  );
}

type VncState = "idle" | "launching" | "ok" | "error";

/** Small monitor-icon button next to the punish trigger. Click → launches
 * `vnc://<machine>` the same way the top "vnc quick connect" row does. */
function VncButton({ machine }: { machine: string }) {
  const [state, setState] = useState<VncState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  function fire(e: ReactMouseEvent) {
    e.stopPropagation();
    if (state === "launching") return;
    setState("launching");
    void launchVnc(loadVncConfig(), machine).then((res) => {
      setState(res.ok ? "ok" : "error");
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setState("idle"), res.ok ? 1500 : 2500);
    });
  }

  const label =
    state === "launching"
      ? "در حال اتصال…"
      : state === "ok"
        ? "لانچ شد"
        : state === "error"
          ? "خطا در اتصال VNC"
          : `اتصال VNC به ${machine}`;

  return (
    <button
      type="button"
      onClick={fire}
      title={label}
      className={`relative inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-all ${
        state === "error"
          ? "border-[var(--neon-red)] bg-[var(--neon-red)]/15"
          : state === "ok"
            ? "border-[var(--neon-green)] bg-[var(--neon-green)]/15"
            : "border-cyan-500/40 bg-cyan-500/10 hover:border-cyan-400 hover:bg-cyan-500/20"
      }`}
      style={{ boxShadow: state === "idle" ? undefined : "0 0 8px var(--neon-cyan)66" }}
    >
      {state === "launching" ? (
        <Loader2 className="size-3.5 animate-spin" style={{ color: "var(--neon-cyan)" }} />
      ) : state === "ok" ? (
        <Check className="size-3.5" style={{ color: "var(--neon-green)" }} />
      ) : state === "error" ? (
        <X className="size-3.5" style={{ color: "var(--neon-red)" }} />
      ) : (
        <Monitor
          className="size-3.5"
          style={{ color: "var(--neon-cyan)", filter: "drop-shadow(0 0 3px var(--neon-cyan))" }}
        />
      )}
    </button>
  );
}

type PunishState = "idle" | "confirm" | "sending" | "ok" | "error";

/** Small warning-triangle button next to the game/process pill. First click
 * arms a 3s confirm window (no accidental punishments from a stray click),
 * second click actually fires the full-screen timeout overlay at the client. */
function PunishButton({ machine }: { machine: string }) {
  const [state, setState] = useState<PunishState>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  function armOrFire(e: ReactMouseEvent) {
    e.stopPropagation();
    if (state === "sending" || state === "ok") return;

    if (state !== "confirm") {
      setState("confirm");
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setState("idle"), 3000);
      return;
    }

    if (resetTimer.current) clearTimeout(resetTimer.current);
    setState("sending");
    setErrMsg(null);
    void sendPunish(machine).then((res) => {
      if (res.ok) {
        setState("ok");
        resetTimer.current = setTimeout(() => setState("idle"), 2000);
      } else {
        setErrMsg(res.error || "خطا در ارسال");
        setState("error");
        resetTimer.current = setTimeout(() => setState("idle"), 2500);
      }
    });
  }

  const label =
    state === "confirm"
      ? "مطمئنی؟ دوباره بزن"
      : state === "sending"
        ? "در حال ارسال…"
        : state === "ok"
          ? "ارسال شد"
          : state === "error"
            ? errMsg || "خطا"
            : "تنبیه — نمایش صفحه هشدار روی این کلاینت";

  return (
    <button
      type="button"
      onClick={armOrFire}
      title={label}
      className={`relative inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-all ${
        state === "confirm"
          ? "animate-pulse border-[var(--neon-red)] bg-[var(--neon-red)]/25"
          : state === "error"
            ? "border-[var(--neon-red)] bg-[var(--neon-red)]/15"
            : state === "ok"
              ? "border-[var(--neon-green)] bg-[var(--neon-green)]/15"
              : "border-[var(--neon-red)]/40 bg-[var(--neon-red)]/10 hover:border-[var(--neon-red)] hover:bg-[var(--neon-red)]/20"
      }`}
      style={{ boxShadow: state === "idle" ? undefined : "0 0 8px var(--neon-red)66" }}
    >
      {state === "sending" ? (
        <Loader2 className="size-3.5 animate-spin" style={{ color: "var(--neon-red)" }} />
      ) : state === "ok" ? (
        <Check className="size-3.5" style={{ color: "var(--neon-green)" }} />
      ) : state === "error" ? (
        <X className="size-3.5" style={{ color: "var(--neon-red)" }} />
      ) : (
        <TriangleAlert className="size-3.5" style={{ color: "var(--neon-red)" }} />
      )}
    </button>
  );
}

export function ClientCard({ client, onClick }: Props) {
  const online = client.online !== false;
  const overheat = client.gpuTemp >= 80 || client.cpuTemp >= 78;
  const brand = gpuBrand(client.gpuName);
  const brandColor = BRAND_COLOR[brand];

  const [settings, setSettings] = useState<GaugeSettings>(() => loadSettings());
  useEffect(() => {
    const h = () => setSettings(loadSettings());
    window.addEventListener("exir:gauge-settings", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("exir:gauge-settings", h);
      window.removeEventListener("storage", h);
    };
  }, []);

  // Subscribe to cache activity for this machine's IP.
  const [cache, setCache] = useState<ClientCache | null>(null);
  useEffect(() => {
    const ip = ipFromMachine(client.machine);
    if (!ip) return;
    const read = () => {
      const map = (window as unknown as { __exirCache?: Record<string, ClientCache> }).__exirCache;
      setCache(map?.[ip] || null);
    };
    read();
    window.addEventListener(CACHE_EVT, read);
    return () => window.removeEventListener(CACHE_EVT, read);
  }, [client.machine]);
  const cacheColor =
    cache?.mode === "hit"
      ? "var(--neon-green)"
      : cache?.mode === "miss"
        ? "var(--neon-red)"
        : cache?.mode === "mixed"
          ? "var(--neon-amber)"
          : "oklch(0.5 0.02 250)";

  // ── Live ping subscription (replaces the old "IDLE" pill) ──────────────
  const [ping, setPing] = useState<ClientPing | null>(null);
  useEffect(() => {
    const read = () => {
      const map = window.__exirClientPing;
      setPing(map?.[client.machine] || null);
    };
    read();
    window.addEventListener(CLIENT_PING_EVT, read);
    return () => window.removeEventListener(CLIENT_PING_EVT, read);
  }, [client.machine]);

  const lanMs = ping?.lanMs ?? null;
  const lanLoss = lanMs === -1;
  const lanColor = lanMs === null || lanLoss
    ? "var(--neon-red)"
    : colorFor(settings.ping, lanMs);
  // Blink red if the highest ping band was exceeded in the last ~20s window.
  const highBand = [...settings.ping].sort((a, b) => a.max - b.max);
  const critMax = highBand[highBand.length - 2]?.max ?? 80;
  const recentHigh = (ping?.history || []).slice(-10).some((v) => v > critMax || v === -1);
  const shouldBlink = recentHigh || lanLoss;

  const gameMs = ping?.gameMs ?? null;
  const gameColor = gameMs === null
    ? "oklch(0.5 0.02 250)"
    : gameMs < 0
      ? "var(--neon-red)"
      : colorFor(settings.ping, gameMs);


  // short gpu model: "NVIDIA GeForce RTX 3070" -> "RTX 3070"
  const shortGpu =
    client.gpuName
      .replace(/NVIDIA|GeForce|AMD|Radeon|Intel|Arc/gi, "")
      .replace(/\s+/g, " ")
      .trim() || client.gpuName;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group relative w-full cursor-pointer overflow-hidden rounded-xl p-3 text-left transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] glass-panel ${
        !online ? "opacity-50" : overheat ? "neon-border-red" : "neon-border-cyan"
      }`}
    >
      {/* corner accent */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-20 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-60"
        style={{
          background: !online ? "transparent" : overheat ? "var(--neon-red)" : "var(--neon-cyan)",
        }}
      />

      {/* sweep line */}
      {online && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
          <div
            className="h-full w-1/3 sweep"
            style={{
              background: "linear-gradient(90deg, transparent, var(--neon-cyan), transparent)",
            }}
          />
        </div>
      )}

      {/* Header */}
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-block size-2 shrink-0 rounded-full ${online ? "pulse-dot" : ""}`}
            style={{
              background: online
                ? overheat
                  ? "var(--neon-red)"
                  : "var(--neon-green)"
                : "oklch(0.4 0 0)",
              boxShadow: online
                ? `0 0 8px ${overheat ? "var(--neon-red)" : "var(--neon-green)"}`
                : "none",
            }}
          />
          <span className="font-mono text-lg font-black tracking-wider text-glow-cyan">
            {client.machine}
          </span>
        </div>
        {online && (
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="truncate font-mono text-[10px] font-bold uppercase"
              style={{ color: brandColor, textShadow: `0 0 5px ${brandColor}55` }}
              title={client.gpuName}
            >
              {shortGpu}
            </span>
            <BrandBadge brand={brand} />
          </div>
        )}
      </div>

      {online ? (
        <>
          {/* Gauges row: GPU / AVG / CPU */}
          <div className="relative mt-3 flex items-center justify-around">
            <CircularGauge
              label="GPU"
              icon={MemoryStick}
              value={client.gpuTemp}
              size={54}
              bands={settings.gpu}
            />
            <CircularGauge
              label="AVG"
              icon={Thermometer}
              value={Math.round((client.gpuTemp + client.cpuTemp) / 2)}
              size={62}
              bands={settings.gpu}
            />
            <CircularGauge
              label="CPU"
              icon={Cpu}
              value={client.cpuTemp}
              size={54}
              bands={settings.cpu}
            />
          </div>

          {/* Bottom stats */}
          <div className="relative mt-2 grid grid-cols-3 gap-1 rounded-md bg-secondary/40 p-2">
            <Stat label="GPU%" value={client.gpuUsage.toFixed(0)} />
            <Stat label="RAM%" value={client.ram.toFixed(0)} />
            <Stat label="FPS" value={client.fps.toFixed(0)} accent="magenta" />
          </div>

          {/* Cache status pill */}
          <div
            className="relative mt-2 flex items-center justify-between rounded-md border px-2 py-1 font-mono text-[9px] uppercase tracking-widest"
            style={{ borderColor: `${cacheColor}55`, background: `${cacheColor}0d` }}
          >
            <span className="flex items-center gap-1" style={{ color: cacheColor }}>
              <span
                className="size-1.5 rounded-full"
                style={{ background: cacheColor, boxShadow: `0 0 5px ${cacheColor}` }}
              />
              {cacheLabel}
            </span>
            <span className="text-muted-foreground">
              {cache ? `${cache.speedKBs} KB/s · ${cache.lastService.slice(0, 8)}` : "—"}
            </span>
          </div>

          {/* Process pill + punish trigger (warning icon sits to its left) */}
          <div className="relative mt-2 flex items-center justify-center gap-1.5">
            <PunishButton machine={client.machine} />
            <span className="rounded-full border border-border/60 bg-surface/70 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider">
              <span className="text-muted-foreground">▶ </span>
              <span className="text-foreground">{client.topProcess}</span>
            </span>
            <VncButton machine={client.machine} />
          </div>
        </>
      ) : (
        <div className="relative mt-6 flex flex-col items-center justify-center py-8 text-center">
          <div className="size-10 rounded-full border border-muted-foreground/30" />
          <div className="mt-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            offline
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground/60">no signal</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "magenta" }) {
  const color = accent === "magenta" ? "var(--neon-magenta)" : "var(--foreground)";
  const glow = accent === "magenta" ? "text-glow-magenta" : "";
  return (
    <div className="text-center">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`font-mono text-base font-black leading-tight ${glow}`} style={{ color }}>
        {value}
      </div>
    </div>
  );
}
