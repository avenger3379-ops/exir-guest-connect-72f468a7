// Phase 6 UI — Network tools panel embedded in ClientDetailModal.
//   ▸ Flush DNS button
//   ▸ Disable proxy button (keeps DNS + IP untouched)
//   ▸ IP settings form (IP / mask / gateway / DNS1 / DNS2)
//   ▸ Open Share button (opens \\<ip>\<share> in Explorer on operator PC)

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wifi, ShieldOff, Save, FolderOpen, Check, X, RefreshCw } from "lucide-react";
import {
  DEFAULT_SHARES,
  disableProxy,
  flushDns,
  getLiveIpInfo,
  loadIpSettings,
  openShare,
  saveIpSettings,
  setIpSettings,
  type IpSettings,
} from "@/lib/client-network";
import { getMachine, loadVncConfig } from "@/lib/vnc-config";

interface Props { machine: string }

type ActionState = { key: string; ok: boolean; msg: string } | null;

export function NetworkPanel({ machine }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionState>(null);

  const clientIp = getMachine(loadVncConfig(), machine)?.host || "";
  const [ip, setIp] = useState("");
  const [mask, setMask] = useState("");
  const [gateway, setGateway] = useState("");
  const [dns1, setDns1] = useState("");
  const [dns2, setDns2] = useState("");
  const [share, setShare] = useState("Drive H");
  // True once we've populated the fields at least once (from cache or live),
  // so the live fetch's success handler knows whether it's safe to write "".
  const [live, setLive] = useState(false);

  // ip settings: show whatever's already known (last-saved / mapped VNC ip)
  // immediately so the boxes are never empty just because the client-agent
  // is unreachable or running an older build without /net/info yet. If the
  // live fetch below succeeds, it overwrites these with the client's actual
  // current values (which may legitimately be blank).
  const [ipLoading, setIpLoading] = useState(false);
  const [ipLoadError, setIpLoadError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadIpSettings(machine);
    setIp(saved.ip || clientIp);
    setMask(saved.mask || "");
    setGateway(saved.gateway || "");
    setDns1(saved.dns1 || "");
    setDns2(saved.dns2 || "");
    setLive(false);
  }, [machine, clientIp]);

  const refreshLiveIp = useCallback(async () => {
    setIpLoading(true);
    setIpLoadError(null);
    const r = await getLiveIpInfo(machine);
    setIpLoading(false);
    if (!r.ok) {
      // Agent unreachable, or an older build without /net/info (404) — keep
      // whatever was already showing (cached/mapped values) instead of
      // clearing the form.
      setIpLoadError(
        r.error ||
          "دریافت تنظیمات واقعی از کلاینت ناموفق بود — نسخه‌ی client-agent روی این سیستم رو با آخرین نسخه (فایل exir-client-agent.mjs) آپدیت کن.",
      );
      return;
    }
    setLive(true);
    setIp(r.ip);
    setMask(r.mask);
    setGateway(r.gateway);
    setDns1(r.dns1);
    setDns2(r.dns2);
  }, [machine]);

  useEffect(() => {
    void refreshLiveIp();
  }, [refreshLiveIp]);


  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; output?: string; path?: string }>) {
    setBusy(key);
    setStatus(null);
    const r = await fn();
    setBusy(null);
    setStatus({ key, ok: r.ok, msg: r.ok ? (r.output || r.path || "انجام شد") : (r.error || "خطا") });
    setTimeout(() => setStatus((s) => (s && s.key === key ? null : s)), 5000);
  }

  function Btn({ k, icon, label, danger, onClick }: { k: string; icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }) {
    const isBusy = busy === k;
    const done = status?.key === k;
    const color = danger ? "var(--neon-red)" : "var(--neon-cyan)";
    return (
      <button
        onClick={onClick}
        disabled={!!busy}
        className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition hover:brightness-125 disabled:opacity-50"
        style={{
          borderColor: `${color}66`,
          background: `${color}12`,
          color: color,
          boxShadow: done && status?.ok ? `0 0 8px ${color}66` : undefined,
        }}
      >
        {isBusy ? <Loader2 size={12} className="animate-spin" /> : done ? (status?.ok ? <Check size={12} /> : <X size={12} />) : icon}
        {label}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-cyan-500/30 bg-cyan-500/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-cyan-300">
          <Wifi size={12} /> ▸ network tools
        </div>
        <span className="font-mono text-[9px] text-muted-foreground">agent: {clientIp}:8766</span>
      </div>

      {/* Quick action row */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Btn k="flush" icon={<Wifi size={12} />} label="Flush DNS" onClick={() => run("flush", () => flushDns(machine))} />
        <Btn k="proxy" icon={<ShieldOff size={12} />} label="Disable Proxy" onClick={() => run("proxy", () => disableProxy(machine))} />
        <Btn k="share" icon={<FolderOpen size={12} />} label={`Open \\\\${clientIp}\\${share}`} onClick={() => run("share", () => openShare(machine, share))} />
        <select
          value={share}
          onChange={(e) => setShare(e.target.value)}
          className="rounded-md border border-border/60 bg-background/60 px-2 py-2 font-mono text-[10px] uppercase text-foreground outline-none focus:border-cyan-500"
        >
          {DEFAULT_SHARES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* IP settings — shows the client's real live IPv4 config once the
          client-agent (/net/info) answers; until then (or if it's an older
          agent build without that route) it falls back to the last-known
          values instead of going blank. */}
      <div className="mt-3 rounded-md border border-border/60 bg-background/30 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            ip settings
            <button
              onClick={() => void refreshLiveIp()}
              disabled={ipLoading}
              title="دریافت مجدد تنظیمات واقعی از کلاینت"
              className="rounded border border-border/60 p-0.5 text-muted-foreground transition hover:border-cyan-500/60 hover:text-cyan-300 disabled:opacity-50"
            >
              <RefreshCw size={10} className={ipLoading ? "animate-spin" : ""} />
            </button>
            {!ipLoading && (
              <span
                className="font-fa rounded px-1 py-0.5 text-[8px] normal-case tracking-normal"
                lang="fa"
                style={
                  live
                    ? { color: "var(--neon-green)", background: "var(--neon-green)15" }
                    : { color: "var(--neon-amber)", background: "var(--neon-amber)15" }
                }
              >
                {live ? "زنده از کلاینت" : "آخرین مقدار ذخیره‌شده"}
              </span>
            )}
          </div>
          {clientIp && (
            <div className="flex items-center gap-1.5 font-mono text-[9px]">
              <span className="font-fa text-muted-foreground" lang="fa">آدرس اتصال (VNC):</span>
              <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300" dir="ltr">{clientIp}</span>
            </div>
          )}
        </div>
        {ipLoading && (
          <div className="font-fa mb-1.5 flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground" lang="fa">
            <Loader2 size={10} className="animate-spin" /> در حال دریافت تنظیمات واقعی از کلاینت…
          </div>
        )}
        {ipLoadError && !ipLoading && (
          <div className="font-fa mb-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[9px] text-amber-300" lang="fa">
            {ipLoadError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Field label="IP" value={ip} onChange={setIp} />
          <Field label="Mask"    value={mask}    onChange={setMask} />
          <Field label="Gateway" value={gateway} onChange={setGateway} />
          <Field label="DNS 1"   value={dns1}    onChange={setDns1} />
          <Field label="DNS 2"   value={dns2}    onChange={setDns2} />
        </div>
        <div className="mt-2 flex justify-end">
          <Btn
            k="setip"
            icon={<Save size={12} />}
            label="Apply IP + DNS on client"
            danger
            onClick={() => {
              const s: IpSettings = { ip, mask, gateway, dns1, dns2: dns2 || undefined };
              saveIpSettings(machine, s);
              return run("setip", () => setIpSettings(machine, s));
            }}
          />
        </div>
      </div>

      {status && (
        <div
          className="font-fa mt-2 rounded border px-2 py-1 font-mono text-[10px]"
          style={{
            borderColor: status.ok ? "var(--neon-green)55" : "var(--neon-red)55",
            background: status.ok ? "var(--neon-green)0d" : "var(--neon-red)0d",
            color: status.ok ? "var(--neon-green)" : "var(--neon-red)",
          }}
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        className="mt-0.5 w-full rounded border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-cyan-500"
      />
      {hint && <span className="mt-0.5 block font-mono text-[8px] text-amber-400/80">{hint}</span>}
    </label>
  );
}
