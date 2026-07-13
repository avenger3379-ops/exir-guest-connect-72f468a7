import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, Save, Download, Monitor, Upload, Trash2, Image as ImageIcon, Database } from "lucide-react";
import { loadCacheSsh, saveCacheSsh, DEFAULT_CACHE_SSH, type CacheSshConfig } from "@/lib/cache-activity";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Band,
  type GaugeSettings,
} from "@/lib/gauge-settings";
import {
  DEFAULT_VIEWER_PATH,
  defaultConfig,
  downloadVncBat,
  loadVncConfig,
  saveVncConfig,
  type VncConfig,
} from "@/lib/vnc-config";
import { loadPowerCreds, savePowerCreds } from "@/lib/power";
import { CircularGauge } from "@/components/monitoring/CircularGauge";
import { clearLogo, loadLogo, saveLogo, type StoredLogo } from "@/lib/branding";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Exir Gamenet Monitoring" }] }),
  component: SettingsPage,
});

const PRESET_SWATCHES = [
  "#22d3ee", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#facc15", "#f97316", "#ef4444", "#10b981", "#84cc16",
  "#76b900", "#ed1c24", "#00c7fd", "#ffffff", "#94a3b8",
];

function SettingsPage() {
  const [s, setS] = useState<GaugeSettings>(() => loadSettings());
  const [saved, setSaved] = useState(false);

  function updateBand(metric: "gpu" | "cpu" | "ping", idx: number, patch: Partial<Band>) {
    setS((prev) => {
      const bands = prev[metric].map((b, i) => (i === idx ? { ...b, ...patch } : b));
      return { ...prev, [metric]: bands };
    });
    setSaved(false);
  }

  function persist() {
    saveSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function reset() {
    setS(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
  }

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 -z-10" style={{ background: "linear-gradient(180deg, oklch(0.1 0.02 260), oklch(0.07 0.02 260))" }} />
      <div className="fixed inset-0 -z-10 grid-bg opacity-30" />

      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface/60 px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> back
          </Link>
          <h1 className="font-mono text-2xl font-black uppercase tracking-[0.25em] text-glow-cyan">
            gauge settings
          </h1>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface/60 px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <RotateCcw size={14} /> reset
            </button>
            <button
              onClick={persist}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/15 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-cyan-300 hover:bg-cyan-500/25"
            >
              <Save size={14} /> {saved ? "saved!" : "save"}
            </button>
          </div>
        </header>

        <p className="mb-6 font-mono text-xs text-muted-foreground">
          Configure temperature color bands for GPU and CPU gauges. Each band defines the maximum value
          (°C) below which the color applies. Pick from 16M colors with the native color picker.
        </p>

        <LogoEditor />

        <div className="grid gap-6 md:grid-cols-2">
          <MetricEditor
            title="GPU Temperature"
            unit="°C"
            maxCap={120}
            bands={s.gpu}
            onChange={(i, patch) => updateBand("gpu", i, patch)}
          />
          <MetricEditor
            title="CPU Temperature"
            unit="°C"
            maxCap={120}
            bands={s.cpu}
            onChange={(i, patch) => updateBand("cpu", i, patch)}
          />
        </div>

        <div className="mt-6">
          <MetricEditor
            title="Ping (ms)"
            unit="ms"
            maxCap={2000}
            labels={["Good", "Slow", "Bad"]}
            bands={s.ping}
            onChange={(i, patch) => updateBand("ping", i, patch)}
          />
        </div>

        <div className="mt-8 rounded-xl p-5 glass-panel">
          <div className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            live preview
          </div>
          <div className="flex items-center justify-around">
            {[30, 55, 70, 82, 95].map((v) => (
              <div key={v} className="flex flex-col items-center gap-2">
                <CircularGauge label={`${v}°`} value={v} size={70} bands={s.gpu} />
                <span className="font-mono text-[10px] uppercase text-muted-foreground">GPU @ {v}°</span>
              </div>
            ))}
          </div>
        </div>

        <PowerCredsEditor />
        <CacheSshEditor />
        <VncEditor />
      </div>
    </div>
  );
}

function MetricEditor({
  title,
  bands,
  onChange,
  unit = "°C",
  maxCap = 120,
  labels = ["Cool", "Warm", "Critical"],
}: {
  title: string;
  bands: Band[];
  onChange: (idx: number, patch: Partial<Band>) => void;
  unit?: string;
  maxCap?: number;
  labels?: string[];
}) {
  return (
    <div className="rounded-xl p-5 glass-panel">
      <h2 className="mb-4 font-mono text-sm font-bold uppercase tracking-[0.2em] text-glow-cyan">{title}</h2>
      <div className="space-y-4">
        {bands.map((b, i) => (
          <div key={i} className="rounded-lg border border-border/60 bg-surface/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider" style={{ color: b.color }}>
                ▸ {labels[i] ?? `Band ${i + 1}`}
              </span>
              <span className="rounded px-2 py-0.5 font-mono text-[10px]" style={{ background: `${b.color}22`, color: b.color, border: `1px solid ${b.color}66` }}>
                ≤ {b.max}
                {unit}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <label className="font-mono text-[10px] uppercase text-muted-foreground">max ({unit})</label>
                <input
                  type="number"
                  min={0}
                  max={maxCap}
                  value={b.max}
                  onChange={(e) => onChange(i, { max: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-sm outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase text-muted-foreground">color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={b.color}
                    onChange={(e) => onChange(i, { color: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <input
                    type="text"
                    value={b.color}
                    onChange={(e) => onChange(i, { color: e.target.value })}
                    className="w-24 rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {PRESET_SWATCHES.map((sw) => (
                <button
                  key={sw}
                  onClick={() => onChange(i, { color: sw })}
                  className="size-5 rounded border border-border/60 transition hover:scale-110"
                  style={{ background: sw, boxShadow: b.color.toLowerCase() === sw ? `0 0 0 2px ${sw}` : "none" }}
                  title={sw}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogoEditor() {
  const [meta, setMeta] = useState<StoredLogo | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadLogo().then((l) => {
      if (!alive) return;
      setMeta(l);
      if (l) setUrl(URL.createObjectURL(l.blob));
    });
    return () => {
      alive = false;
    };
  }, []);

  async function onPick(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      alert("File larger than 20MB");
      return;
    }
    await saveLogo(file);
    const l = await loadLogo();
    setMeta(l);
    if (url) URL.revokeObjectURL(url);
    setUrl(l ? URL.createObjectURL(l.blob) : null);
  }

  async function onClear() {
    await clearLogo();
    setMeta(null);
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
  }

  return (
    <div className="mb-6 rounded-xl p-5 glass-panel">
      <h2 className="mb-4 font-mono text-sm font-bold uppercase tracking-[0.2em] text-glow-cyan">
        <ImageIcon className="mr-2 inline size-4" /> Brand Logo (shown top-left, fallback: “E”)
      </h2>
      <div className="flex items-center gap-4">
        <div className="flex size-20 items-center justify-center rounded-lg border border-border bg-surface/70 overflow-hidden">
          {url ? (
            <img src={url} alt="logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="font-mono text-4xl font-black text-glow-cyan">E</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md border border-cyan-500/60 bg-cyan-500/10 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-cyan-300 transition hover:bg-cyan-500/20"
            >
              <Upload className="size-3.5" /> Upload logo (up to 20MB, any format)
            </button>
            {meta && (
              <button
                onClick={onClear}
                className="inline-flex items-center gap-2 rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-rose-300 transition hover:bg-rose-500/20"
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
            )}
          </div>
          {meta && (
            <div className="font-mono text-[11px] text-muted-foreground">
              {meta.name} — {(meta.size / 1024).toFixed(1)} KB — {meta.type || "unknown"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function VncEditor() {
  const [cfg, setCfg] = useState<VncConfig>(() => loadVncConfig());
  const [saved, setSaved] = useState(false);

  function persist(next: VncConfig) {
    setCfg(next);
    saveVncConfig(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function updateMachine(i: number, patch: Partial<{ host: string; port: number; mac: string }>) {
    persist({
      ...cfg,
      machines: cfg.machines.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    });
  }

  return (
    <div className="mt-8 rounded-xl p-5 glass-panel">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-glow-magenta">
          ▸ VNC Launcher
        </h2>
        <span className="font-mono text-[10px] uppercase text-muted-foreground">
          {saved ? "saved ✓" : "click Connect → downloads VNC-XX.bat → run it"}
        </span>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[2fr_1fr]">
        <div>
          <label className="font-mono text-[10px] uppercase text-muted-foreground">
            UltraVNC viewer path
          </label>
          <input
            type="text"
            value={cfg.viewerPath}
            onChange={(e) => persist({ ...cfg, viewerPath: e.target.value })}
            placeholder={DEFAULT_VIEWER_PATH}
            className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase text-muted-foreground">
            Password (optional)
          </label>
          <input
            type="text"
            value={cfg.password}
            onChange={(e) => persist({ ...cfg, password: e.target.value })}
            placeholder="empty = prompt in viewer"
            className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          machine → host:port
        </span>
        <button
          onClick={() => persist(defaultConfig())}
          className="flex items-center gap-1 rounded border border-border/60 px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
        >
          <RotateCcw size={11} /> reset defaults
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {cfg.machines.map((m, i) => (
          <div key={m.machine} className="rounded-lg border border-border/60 bg-surface/40 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-glow-cyan">{m.machine}</span>
              <button
                onClick={() => downloadVncBat(cfg, m.machine)}
                title="test — download & run the .bat"
                className="flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-cyan-300 hover:bg-cyan-500/20"
              >
                <Download size={10} /> test
              </button>
            </div>
            <div className="flex gap-1">
              <input
                type="text"
                value={m.host}
                onChange={(e) => updateMachine(i, { host: e.target.value })}
                placeholder="ip / host"
                className="min-w-0 flex-1 rounded border border-border bg-background/60 px-2 py-1 font-mono text-[11px] outline-none focus:border-cyan-500"
              />
              <input
                type="number"
                min={1}
                max={65535}
                value={m.port}
                onChange={(e) => updateMachine(i, { port: Number(e.target.value) })}
                className="w-16 rounded border border-border bg-background/60 px-2 py-1 font-mono text-[11px] outline-none focus:border-cyan-500"
              />
            </div>
            <input
              type="text"
              value={m.mac || ""}
              onChange={(e) => updateMachine(i, { mac: e.target.value })}
              placeholder="MAC (AA:BB:CC:DD:EE:FF) — for Wake-on-LAN"
              className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1 font-mono text-[10px] outline-none focus:border-emerald-500"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 font-mono text-[11px] leading-relaxed text-emerald-100/90">
        <div className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wider">
          <Monitor size={12} /> one-click launch (via local agent)
        </div>
        Click "Connect VNC" or any of the 12 icons up top → the local agent
        (<span className="font-bold">ping-agent.mjs</span>, auto-started with
        <span className="font-bold"> npm run dev</span>) spawns UltraVNC directly against the
        IP:PORT you set here. No download, no double-click.
        <div className="mt-1 opacity-80">
          If the agent isn't running, the app falls back to downloading a <span className="font-bold">VNC-VIPxx.bat</span> file
          you can run manually. To start the agent by itself: <span className="font-bold">npm run agent</span>.
        </div>
      </div>
    </div>
  );
}


function PowerCredsEditor() {
  const [creds, setCreds] = useState(() => loadPowerCreds());
  function update(patch: Partial<{ user: string; pass: string }>) {
    const next = { ...creds, ...patch };
    setCreds(next);
    savePowerCreds(next);
  }
  return (
    <div className="mt-8 rounded-xl p-5 glass-panel">
      <h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-[0.2em] text-glow-magenta">
        ▸ Remote Power Credentials (Windows shutdown /m)
      </h2>
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        Used by Shutdown / Restart / Logoff. WoL only needs MAC (set per machine above).
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="font-mono text-[10px] uppercase text-muted-foreground">admin user (e.g. DOMAIN\Admin)</label>
          <input value={creds.user || ""} onChange={(e) => update({ user: e.target.value })}
            className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500" />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase text-muted-foreground">password</label>
          <input type="password" value={creds.pass || ""} onChange={(e) => update({ pass: e.target.value })}
            className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500" />
        </div>
      </div>
    </div>
  );
}

function CacheSshEditor() {
  const [cfg, setCfg] = useState<CacheSshConfig>(() => loadCacheSsh());
  function update(patch: Partial<CacheSshConfig>) {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveCacheSsh(next);
  }
  return (
    <div className="mt-8 rounded-xl p-5 glass-panel">
      <h2 className="mb-3 flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-[0.2em] text-glow-cyan">
        <Database size={14} /> ▸ LanCache SSH (access.log tail)
      </h2>
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        The local agent SSHes into your LanCache host and tails
        <span className="font-bold"> {DEFAULT_CACHE_SSH.logPath}</span> plus DNS queries when enabled. Per-client
        HIT/MISS/DNS-only status appears on every VIP card and in Discovery.
      </p>
      <div className="mb-3 flex items-center gap-2">
        <input
          id="cache-enabled"
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        <label htmlFor="cache-enabled" className="font-mono text-xs uppercase tracking-wider">
          enable cache polling
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="host / ip">
          <input value={cfg.host} onChange={(e) => update({ host: e.target.value })}
            className="w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500" />
        </Field>
        <Field label="ssh port">
          <input type="number" min={1} max={65535} value={cfg.port}
            onChange={(e) => update({ port: Number(e.target.value) || 22 })}
            className="w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500" />
        </Field>
        <Field label="user">
          <input value={cfg.user} onChange={(e) => update({ user: e.target.value })}
            className="w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500" />
        </Field>
        <Field label="password">
          <input type="password" value={cfg.pass} onChange={(e) => update({ pass: e.target.value })}
            className="w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500" />
        </Field>
        <div className="md:col-span-2">
          <Field label="log path">
            <input value={cfg.logPath} onChange={(e) => update({ logPath: e.target.value })}
              className="w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500" />
          </Field>
        </div>
        <div className="md:col-span-2 rounded-lg border border-border/60 bg-surface/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <input
              id="cache-query-enabled"
              type="checkbox"
              checked={cfg.queryEnabled}
              onChange={(e) => update({ queryEnabled: e.target.checked })}
            />
            <label htmlFor="cache-query-enabled" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              enable DNS queries.log discovery source
            </label>
          </div>
          <Field label="queries.log path">
            <input value={cfg.queryLogPath} onChange={(e) => update({ queryLogPath: e.target.value })}
              className="w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
