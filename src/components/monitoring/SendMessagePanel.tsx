import { useMemo, useState } from "react";
import { AlertTriangle, Clock3, Image as ImageIcon, Send, TimerReset } from "lucide-react";
import { sendClientMessage, sendPunishmentWarning } from "@/lib/client-actions";

const TEMPLATES = [
  { title: "Time Warning", message: "زمان شما رو به پایان است. لطفاً برای تمدید به کانتر مراجعه کنید.", accent: "var(--neon-amber)" },
  { title: "Rule Warning", message: "لطفاً قوانین گیم‌نت را رعایت کنید. در صورت تکرار سیستم قفل می‌شود.", accent: "var(--neon-red)" },
  { title: "Payment", message: "لطفاً جهت تسویه یا شارژ حساب به کانتر مراجعه کنید.", accent: "var(--neon-cyan)" },
];

export function SendMessagePanel({ machine }: { machine: string }) {
  const [title, setTitle] = useState("EXIR MESSAGE");
  const [message, setMessage] = useState("زمان شما رو به پایان است. لطفاً برای تمدید به کانتر مراجعه کنید.");
  const [seconds, setSeconds] = useState(15);
  const [busy, setBusy] = useState<"message" | "punish" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const progress = useMemo(() => Math.max(0, Math.min(100, (seconds / 60) * 100)), [seconds]);

  async function send(kind: "message" | "punish") {
    setBusy(kind);
    setResult(null);
    const r = kind === "punish"
      ? await sendPunishmentWarning(machine, message, seconds)
      : await sendClientMessage(machine, message, title, seconds);
    setBusy(null);
    setResult({ ok: r.ok, text: r.ok ? `sent via ${r.method || "agent"}` : r.error || "failed" });
    setTimeout(() => setResult(null), 5000);
  }

  return (
    <div className="relative mt-3 rounded-md border p-3" style={{ borderColor: "var(--neon-magenta)55", background: "var(--neon-magenta)0d" }}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--neon-magenta)" }}>
          <Send size={12} /> ▸ send message · {machine}
        </div>
        <div className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground">
          <Clock3 size={10} /> {seconds}s
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_220px]">
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            {TEMPLATES.map((t) => (
              <button
                key={t.title}
                onClick={() => { setTitle(t.title); setMessage(t.message); }}
                className="rounded border px-2 py-1 text-left font-mono text-[9px] uppercase tracking-wider transition hover:brightness-125"
                style={{ borderColor: `${t.accent}55`, color: t.accent, background: `${t.accent}0d` }}
              >
                {t.title}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-border bg-background/70 px-2 py-1.5 font-mono text-[11px] outline-none focus:border-cyan-500"
            placeholder="title"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="w-full resize-none rounded border border-border bg-background/70 px-2 py-1.5 font-mono text-[11px] outline-none focus:border-cyan-500"
            placeholder="message text"
          />
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <TimerReset size={12} className="text-muted-foreground" />
            <input type="range" min={5} max={60} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
            <span className="w-10 text-right font-mono text-[10px] text-muted-foreground">{seconds}s</span>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-black/35 p-2">
          <div className="mb-1 flex items-center gap-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
            <ImageIcon size={10} /> preview
          </div>
          <div className="rounded-md border p-3 text-center" style={{ borderColor: "var(--neon-red)55", background: "oklch(0.05 0.02 260 / 0.75)" }}>
            <AlertTriangle className="mx-auto size-10 pulse-dot" style={{ color: "var(--neon-red)", filter: "drop-shadow(0 0 12px var(--neon-red))" }} />
            <div className="mt-1 font-mono text-sm font-black uppercase text-foreground">{title || "EXIR MESSAGE"}</div>
            <div className="mt-1 line-clamp-3 min-h-10 font-mono text-[10px] text-muted-foreground">{message || "—"}</div>
            <div className="mt-2 font-mono text-2xl font-black" style={{ color: "var(--neon-cyan)" }}>{seconds}</div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "var(--neon-red)" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          disabled={busy !== null || !message.trim()}
          onClick={() => send("message")}
          className="flex-1 rounded-md border py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition hover:brightness-125 disabled:opacity-40"
          style={{ borderColor: "var(--neon-cyan)55", color: "var(--neon-cyan)", background: "var(--neon-cyan)0d" }}
        >
          {busy === "message" ? "sending…" : "send message"}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => send("punish")}
          className="flex-1 rounded-md border py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition hover:brightness-125 disabled:opacity-40"
          style={{ borderColor: "var(--neon-red)55", color: "var(--neon-red)", background: "var(--neon-red)0d" }}
        >
          {busy === "punish" ? "warning…" : "15s warning"}
        </button>
      </div>

      {result && (
        <div className="mt-2 rounded border px-2 py-1 font-mono text-[10px]" style={{ borderColor: result.ok ? "var(--neon-green)55" : "var(--neon-red)55", color: result.ok ? "var(--neon-green)" : "var(--neon-red)", background: result.ok ? "var(--neon-green)10" : "var(--neon-red)10" }}>
          {result.text}
        </div>
      )}
    </div>
  );
}