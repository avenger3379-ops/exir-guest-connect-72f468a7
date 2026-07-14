import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, LayoutTemplate, Loader2, MessageSquareText, Moon, Sun, Timer, Volume2, VolumeX, X } from "lucide-react";
import { sendMessage, buildFullMessageHtml } from "@/lib/message";
import type { MessageButtonOpt } from "@/lib/message-template";
import { MESSAGE_PRESETS } from "@/lib/message-presets";

interface Props {
  machine: string;
  onClose: () => void;
}

export function SendMessageModal({ machine, onClose }: Props) {
  const [text, setText] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [countdownOn, setCountdownOn] = useState(false);
  const [countdownMin, setCountdownMin] = useState(5);
  const [countdownLabel, setCountdownLabel] = useState("تا خاموش شدن سیستم");
  const [btn1, setBtn1] = useState("باشه");
  const [secondBtnOn, setSecondBtnOn] = useState(true);
  const [btn2, setBtn2] = useState("بعداً یادآوری کن");
  const [soundOn, setSoundOn] = useState(true);
  const [autoCloseOn, setAutoCloseOn] = useState(false);
  const [autoCloseSec, setAutoCloseSec] = useState(10);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const [previewHtml, setPreviewHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const buttons: MessageButtonOpt[] = useMemo(() => {
    const list = [{ label: btn1 || "باشه" }];
    if (secondBtnOn && btn2.trim()) list.push({ label: btn2 });
    return list;
  }, [btn1, secondBtnOn, btn2]);

  // Debounced live preview — regenerates the exact HTML that would be sent.
  // Long debounce (900ms) + only-when-idle so the iframe doesn't rebuild on
  // every keystroke (that was stealing focus / making it feel like the whole
  // panel was refreshing while typing).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void buildFullMessageHtml(machine, {
        text: text || "متن پیام شما اینجا نمایش داده می‌شود…",
        theme,
        imageDataUrl,
        countdownSeconds: countdownOn ? countdownMin * 60 : undefined,
        countdownLabel,
        autoCloseSeconds: autoCloseOn ? autoCloseSec : undefined,
        soundOn,
        buttons,
      }).then((html) => {
        if (!cancelled) setPreviewHtml(html);
      });
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [machine, text, theme, imageDataUrl, countdownOn, countdownMin, countdownLabel, autoCloseOn, autoCloseSec, soundOn, buttons]);

  function applyPreset(id: string) {
    const p = MESSAGE_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setActivePreset(id);
    setText(p.text);
    setCountdownOn(p.countdownOn);
    setCountdownMin(p.countdownMin);
    setCountdownLabel(p.countdownLabel);
    setAutoCloseOn(p.autoCloseOn);
    setAutoCloseSec(p.autoCloseSec);
    setBtn1(p.btn1);
    setSecondBtnOn(p.secondBtnOn);
    setBtn2(p.btn2);
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setImageDataUrl(dataUrl);
  }

  async function onSend() {
    if (!text.trim() && !imageDataUrl) {
      setMsg("یک متن یا تصویر برای ارسال وارد کن");
      setMsgOk(false);
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await sendMessage(machine, {
      text,
      theme,
      imageDataUrl,
      countdownSeconds: countdownOn ? countdownMin * 60 : undefined,
      countdownLabel,
      autoCloseSeconds: autoCloseOn ? autoCloseSec : undefined,
      soundOn,
      buttons,
    });
    setBusy(false);
    setMsgOk(!!r.ok);
    setMsg(r.ok ? `پیام ارسال شد${r.note ? ` (${r.note})` : ""}` : `ارسال ناموفق: ${r.error || "؟"}`);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "oklch(0.05 0.02 260 / 0.65)", backdropFilter: "blur(16px) saturate(140%)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        className="relative grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-2xl glass-panel neon-border-magenta md:grid-cols-2"
      >
        {/* ── Form ─────────────────────────────────────────────────── */}
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareText size={16} className="text-fuchsia-400" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-glow-magenta">
                ارسال پیام به {machine}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-md border border-border/60 p-1 text-muted-foreground hover:text-foreground hover:border-foreground/40"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-5">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <LayoutTemplate size={12} /> قالب‌های آماده
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MESSAGE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className="rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                  style={{
                    borderColor: activePreset === p.id ? "var(--neon-magenta)" : "var(--border)",
                    color: activePreset === p.id ? "var(--neon-magenta)" : undefined,
                    background: activePreset === p.id ? "var(--neon-magenta)15" : "transparent",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-4 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            متن پیام
          </label>
          <textarea
            dir="rtl"
            autoFocus
            rows={4}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setActivePreset(null);
            }}
            placeholder="مثلاً: لطفاً تا ۵ دقیقه دیگر سیستم را ذخیره و ترک کنید."
            className="mt-1.5 w-full resize-none rounded-md border border-border bg-background/60 p-2.5 text-sm leading-7 outline-none focus:border-fuchsia-500"
            style={{ fontFamily: "inherit" }}
          />

          {/* Theme */}
          <div className="mt-4 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">تم پنجره</span>
            <div className="flex overflow-hidden rounded-md border border-border/60">
              <button
                onClick={() => setTheme("dark")}
                className="flex items-center gap-1 px-3 py-1.5 text-xs"
                style={{
                  background: theme === "dark" ? "var(--neon-magenta)25" : "transparent",
                  color: theme === "dark" ? "var(--neon-magenta)" : undefined,
                }}
              >
                <Moon size={12} /> تیره
              </button>
              <button
                onClick={() => setTheme("light")}
                className="flex items-center gap-1 border-r border-border/60 px-3 py-1.5 text-xs"
                style={{
                  background: theme === "light" ? "var(--neon-magenta)25" : "transparent",
                  color: theme === "light" ? "var(--neon-magenta)" : undefined,
                }}
              >
                <Sun size={12} /> روشن
              </button>
            </div>
            <button
              onClick={() => setSoundOn((s) => !s)}
              title="پخش صدای اعلان هنگام باز شدن پیام"
              className="mr-auto flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs"
              style={{ color: soundOn ? "var(--neon-magenta)" : undefined }}
            >
              {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {soundOn ? "صدای اعلان روشن" : "بی‌صدا"}
            </button>
          </div>

          {/* Image */}
          <div className="mt-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">تصویر (اختیاری)</span>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ImagePlus size={13} /> انتخاب عکس
              </button>
              {imageDataUrl && (
                <>
                  <img src={imageDataUrl} alt="" className="h-9 w-9 rounded object-cover" />
                  <button
                    onClick={() => setImageDataUrl(undefined)}
                    className="text-xs text-muted-foreground hover:text-red-400"
                  >
                    حذف
                  </button>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            </div>
          </div>

          {/* Countdown */}
          <div className="mt-4 rounded-md border border-border/60 p-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" checked={countdownOn} onChange={(e) => setCountdownOn(e.target.checked)} />
              <Timer size={13} /> نمایش شمارش معکوس
            </label>
            {countdownOn && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">دقیقه</span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={countdownMin}
                    onChange={(e) => setCountdownMin(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1 text-xs outline-none focus:border-fuchsia-500"
                  />
                </div>
                <div className="col-span-2">
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">برچسب</span>
                  <input
                    dir="rtl"
                    value={countdownLabel}
                    onChange={(e) => setCountdownLabel(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1 text-xs outline-none focus:border-fuchsia-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Auto-close (toast style, like Discord/Steam notifications) */}
          <div className="mt-3 rounded-md border border-border/60 p-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" checked={autoCloseOn} onChange={(e) => setAutoCloseOn(e.target.checked)} />
              بسته شدن خودکار پیام (مثل اعلان‌های دیسکورد/استیم)
            </label>
            {autoCloseOn && (
              <div className="mt-2">
                <span className="font-mono text-[9px] uppercase text-muted-foreground">ثانیه تا بسته شدن</span>
                <input
                  type="number"
                  min={3}
                  max={120}
                  value={autoCloseSec}
                  onChange={(e) => setAutoCloseSec(Math.max(3, Number(e.target.value) || 3))}
                  className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1 text-xs outline-none focus:border-fuchsia-500"
                />
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="mt-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">دکمه‌ها</span>
            <div className="mt-1.5 space-y-2">
              <input
                dir="rtl"
                value={btn1}
                onChange={(e) => setBtn1(e.target.value)}
                placeholder="دکمه اول"
                className="w-full rounded border border-border bg-background/60 px-2 py-1.5 text-xs outline-none focus:border-fuchsia-500"
              />
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={secondBtnOn} onChange={(e) => setSecondBtnOn(e.target.checked)} />
                دکمه دوم
              </label>
              {secondBtnOn && (
                <input
                  dir="rtl"
                  value={btn2}
                  onChange={(e) => setBtn2(e.target.value)}
                  placeholder="دکمه دوم"
                  className="w-full rounded border border-border bg-background/60 px-2 py-1.5 text-xs outline-none focus:border-fuchsia-500"
                />
              )}
            </div>
          </div>

          {msg && (
            <div
              className="mt-4 rounded border px-2.5 py-1.5 text-xs"
              style={{
                borderColor: msgOk ? "var(--neon-green)55" : "var(--neon-red)55",
                color: msgOk ? "var(--neon-green)" : "var(--neon-red)",
                background: msgOk ? "var(--neon-green)10" : "var(--neon-red)10",
              }}
            >
              {msg}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-md border border-border/60 py-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              انصراف
            </button>
            <button
              onClick={onSend}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-bold uppercase tracking-widest neon-border-magenta hover:brightness-125 disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : null}
              {busy ? "در حال ارسال…" : "ارسال پیام"}
            </button>
          </div>
        </div>

        {/* ── Live preview ─────────────────────────────────────────── */}
        <div className="flex items-center justify-center bg-black/30 p-6">
          <div className="w-full">
            <div className="mb-2 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              پیش‌نمایش دقیقاً همانی که روی صفحه‌ی کاربر نشان داده می‌شود
            </div>
            <div className="overflow-hidden rounded-xl border border-border/60" style={{ height: 560 }}>
              <iframe title="preview" srcDoc={previewHtml} className="h-full w-full border-0" sandbox="allow-scripts" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
