import { useEffect, useRef, useState } from "react";
import { Wifi, Infinity as InfIcon, Router, MonitorCog } from "lucide-react";
import {
  DEFAULT_COLORS,
  loadQosBackend,
  loadQosColors,
  loadQosStates,
  pushQos,
  saveQosBackend,
  saveQosColors,
  saveQosStates,
  type QosBackend,
  type QosColors,
  type QosState,
  type Tier,
} from "@/lib/qos";

const TIERS: { key: Exclude<Tier, "off">; label: string }[] = [
  { key: "500K", label: "500K" },
  { key: "1M", label: "1 Mb" },
  { key: "2M", label: "2 Mb" },
  { key: "UNL", label: "∞" },
];

interface Props {
  machines: string[]; // e.g. ["VIP01","VIP02",...]
}

export function QosLaunch({ machines }: Props) {
  const [states, setStates] = useState<Record<string, QosState>>(() => loadQosStates());
  const [colors, setColors] = useState<QosColors>(() => loadQosColors());
  const [openId, setOpenId] = useState<string | null>(null);
  const [colorEdit, setColorEdit] = useState(false);
  const [backend, setBackend] = useState<QosBackend>(() => loadQosBackend());
  const rootRef = useRef<HTMLDivElement>(null);

  function changeBackend(b: QosBackend) {
    setBackend(b);
    saveQosBackend(b);
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpenId(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function update(machine: string, patch: Partial<QosState>) {
    setStates((prev) => {
      const current: QosState = prev[machine] ?? { enabled: false, tier: "off" };
      const merged: QosState = { ...current, ...patch };
      const next = { ...prev, [machine]: merged };
      saveQosStates(next);
      void pushQos(machine, merged);
      return next;
    });
  }

  function updateColor(k: keyof QosColors, v: string) {
    setColors((prev) => {
      const n = { ...prev, [k]: v };
      saveQosColors(n);
      return n;
    });
  }

  return (
    <div ref={rootRef} className="mb-3 rounded-xl p-3 glass-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          ▸ qos · internet control
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border/60 bg-surface/60 p-0.5 font-mono text-[9px] uppercase tracking-wider">
            <button
              onClick={() => changeBackend("mikrotik")}
              title="Apply QoS via MikroTik simple-queue REST API"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 transition"
              style={{
                background: backend === "mikrotik" ? "oklch(0.85 0.18 200 / 0.15)" : "transparent",
                color: backend === "mikrotik" ? "var(--neon-cyan)" : "var(--muted-foreground, #888)",
                boxShadow: backend === "mikrotik" ? "0 0 6px oklch(0.85 0.18 200 / 0.4)" : "none",
              }}
            >
              <Router size={10} /> mikrotik
            </button>
            <button
              onClick={() => changeBackend("netlimiter")}
              title="Apply QoS via NetLimiter Pro 4 on the target VIP (nlq.exe over PsExec)"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 transition"
              style={{
                background: backend === "netlimiter" ? "oklch(0.7 0.25 320 / 0.18)" : "transparent",
                color: backend === "netlimiter" ? "var(--neon-magenta)" : "var(--muted-foreground, #888)",
                boxShadow: backend === "netlimiter" ? "0 0 6px oklch(0.7 0.25 320 / 0.4)" : "none",
              }}
            >
              <MonitorCog size={10} /> netlimiter
            </button>
          </div>
          <button
            onClick={() => setColorEdit((v) => !v)}
            className="rounded border border-border/60 bg-surface/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition hover:border-cyan-500/50 hover:text-cyan-300"
          >
            {colorEdit ? "done" : "colors"}
          </button>
        </div>
      </div>

      {colorEdit && (
        <div className="mb-2 flex flex-wrap gap-2 rounded-md border border-border/60 bg-surface/40 p-2">
          {(Object.keys(DEFAULT_COLORS) as (keyof QosColors)[]).map((k) => (
            <label key={k} className="flex items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground">
              <span>{k}</span>
              <input
                type="color"
                value={colors[k]}
                onChange={(e) => updateColor(k, e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
              />
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-nowrap items-start gap-1.5 overflow-x-auto">
        {machines.map((m) => {
          const st: QosState = states[m] ?? { enabled: false, tier: "off" };
          const active = st.enabled && st.tier !== "off";
          const activeColor = active && st.tier !== "off" ? colors[st.tier as keyof QosColors] : undefined;
          const isOpen = openId === m;
          return (
            <div key={m} className="flex-1 min-w-[46px]">
              <button
                onClick={() => setOpenId(isOpen ? null : m)}
                title={`${m} — ${active ? st.tier : "off"}`}
                className="flex w-full flex-col items-center gap-0.5 rounded-md border bg-surface/60 px-1 py-1 font-mono text-[9px] font-bold uppercase tracking-wider transition hover:scale-105"
                style={{
                  borderColor: activeColor ? `${activeColor}88` : "oklch(0.85 0.18 200 / 0.4)",
                  color: activeColor ?? "var(--neon-cyan)",
                  background: activeColor ? undefined : "oklch(0.85 0.18 200 / 0.05)",
                  boxShadow: activeColor ? `0 0 8px ${activeColor}44` : "none",
                  outline: isOpen ? "1px solid var(--neon-cyan)" : "none",
                }}
              >
                <Wifi size={12} />
                <span>{m.replace("VIP", "")}</span>
                {active && <span className="text-[8px]">{st.tier}</span>}
              </button>
            </div>
          );
        })}
      </div>

      {/* Inline control panel — expands in flow so no window scroll is needed */}
      {openId &&
        (() => {
          const m = openId;
          const st: QosState = states[m] ?? { enabled: false, tier: "off" };
          return (
            <div className="mt-2 rounded-lg border border-border bg-surface/80 p-2 backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-widest text-glow-cyan">{m}</span>
                <label className="flex items-center gap-1.5 rounded border border-border/50 px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
                  <span>QoS</span>
                  <input
                    type="checkbox"
                    checked={st.enabled}
                    onChange={(e) => update(m, { enabled: e.target.checked })}
                    className="accent-cyan-400"
                  />
                </label>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {TIERS.map((t) => {
                  const on = st.enabled && st.tier === t.key;
                  const c = colors[t.key];
                  return (
                    <button
                      key={t.key}
                      disabled={!st.enabled}
                      onClick={() => update(m, { tier: t.key })}
                      className="flex items-center justify-center gap-1 rounded border px-1 py-1.5 font-mono text-[10px] font-bold uppercase transition disabled:opacity-40"
                      style={{
                        background: on ? `${c}30` : "transparent",
                        borderColor: on ? c : "hsl(var(--border))",
                        color: c,
                        boxShadow: on ? `0 0 6px ${c}66` : "none",
                      }}
                    >
                      {t.key === "UNL" ? <InfIcon size={12} /> : null}
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 text-center font-mono text-[8px] uppercase text-muted-foreground">
                agent → {backend}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
