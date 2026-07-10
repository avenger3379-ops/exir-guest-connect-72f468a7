// VNC connection configuration — per-machine IP/port + path to viewer exe.
// Persisted in localStorage so the user configures once.

export interface VncMachine {
  machine: string; // e.g. "VIP01"
  host: string; // ip or hostname
  port: number; // default 5900
  mac?: string; // MAC for Wake-on-LAN (e.g. "AA:BB:CC:DD:EE:FF")
}

export interface VncConfig {
  viewerPath: string; // full path to vncviewer.exe
  password: string; // optional; injected into .bat with -password
  machines: VncMachine[]; // 12 entries
}

const STORAGE_KEY = "exir.vnc.config.v1";

export const DEFAULT_VIEWER_PATH =
  "C:\\Program Files\\uvnc bvba\\UltraVNC\\vncviewer.exe";

// Reasonable default: VIP01 → 192.168.3.101 … VIP12 → 192.168.3.112
export function defaultMachines(): VncMachine[] {
  return Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return {
      machine: `VIP${n.toString().padStart(2, "0")}`,
      host: `192.168.3.${100 + n}`,
      port: 5900,
    };
  });
}

export function defaultConfig(): VncConfig {
  return {
    viewerPath: DEFAULT_VIEWER_PATH,
    password: "",
    machines: defaultMachines(),
  };
}

export function loadVncConfig(): VncConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw) as Partial<VncConfig>;
    const base = defaultConfig();
    return {
      viewerPath: parsed.viewerPath || base.viewerPath,
      password: parsed.password ?? "",
      machines:
        Array.isArray(parsed.machines) && parsed.machines.length === 12
          ? parsed.machines.map((m, i) => ({
              machine: m.machine || base.machines[i].machine,
              host: m.host || base.machines[i].host,
              port: Number(m.port) || 5900,
              mac: m.mac || "",
            }))
          : base.machines,
    };
  } catch {
    return defaultConfig();
  }
}

export function saveVncConfig(cfg: VncConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function getMachine(cfg: VncConfig, machine: string): VncMachine | undefined {
  return cfg.machines.find((m) => m.machine.toUpperCase() === machine.toUpperCase());
}

/**
 * Build a Windows .bat file that launches UltraVNC directly with IP:PORT.
 * Downloaded and (once) run by the user; every subsequent click just
 * downloads and runs a tiny script — no protocol registration needed.
 */
export function buildVncBat(cfg: VncConfig, machine: string): string {
  const m = getMachine(cfg, machine);
  if (!m) return `@echo off\r\necho Unknown machine ${machine}\r\npause\r\n`;
  const pwdArg = cfg.password ? ` -password ${cfg.password}` : "";
  return (
    `@echo off\r\n` +
    `start "" "${cfg.viewerPath}" -connect ${m.host}:${m.port}${pwdArg}\r\n`
  );
}

export function downloadVncBat(cfg: VncConfig, machine: string) {
  const content = buildVncBat(cfg, machine);
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `VNC-${machine}.bat`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Preferred launcher: asks the local agent (ping-agent.mjs on :8765) to spawn
 * UltraVNC directly — no download, no double-click. Falls back to the .bat
 * download only if the agent is unreachable (agent not running).
 */
export async function launchVnc(cfg: VncConfig, machine: string): Promise<
  { ok: true; via: "agent" } | { ok: true; via: "bat" } | { ok: false; error: string }
> {
  const m = getMachine(cfg, machine);
  if (!m) return { ok: false, error: `Unknown machine ${machine}` };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch("http://localhost:8765/vnc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        viewerPath: cfg.viewerPath,
        host: m.host,
        port: m.port,
        password: cfg.password || undefined,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (res.ok && json.ok) return { ok: true, via: "agent" };
    if (json?.error) return { ok: false, error: json.error };
  } catch {
    /* agent unreachable — fall back below */
  }
  // Fallback: download the .bat as before.
  downloadVncBat(cfg, machine);
  return { ok: true, via: "bat" };
}
