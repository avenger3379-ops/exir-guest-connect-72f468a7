import { useEffect, useState, type ReactNode } from "react";
import { FileClock } from "lucide-react";
import { computeToday, loadYesterday, startDailyScheduler, type DailySnapshot } from "@/lib/daily-report";
import { isComposing } from "@/lib/compose-lock";

let scheduled = false;

export function DailyReport() {
  const [today, setToday] = useState<DailySnapshot>(() => computeToday());
  const [yesterday, setYesterday] = useState<DailySnapshot | null>(() => loadYesterday());

  useEffect(() => {
    if (!scheduled) { startDailyScheduler(); scheduled = true; }
    const id = setInterval(() => {
      if (isComposing()) return;
      setToday(computeToday());
      setYesterday(loadYesterday());
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mb-3 rounded-xl p-3 glass-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          <FileClock size={12} /> ▸ <span className="font-fa" lang="fa">گزارش</span> · daily report (rollover 03:00)
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card title={<><span className="font-fa" lang="fa">امروز</span> · today</>} snap={today} />
        <Card
          title={
            yesterday ? (
              <><span className="font-fa" lang="fa">دیروز</span> · {yesterday.date}</>
            ) : (
              <span className="font-fa" lang="fa">دیروز</span>
            )
          }
          snap={yesterday}
          muted
        />
      </div>
    </div>
  );
}

function Card({ title, snap, muted }: { title: ReactNode; snap: DailySnapshot | null; muted?: boolean }) {
  return (
    <div className={`rounded-lg border border-border/60 bg-surface/40 p-2.5 ${muted ? "opacity-70" : ""}`}>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      {snap ? (
        <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
          <Row k="WAN1" v={`${snap.wan1Uptime.toFixed(2)}%`} c="var(--neon-cyan)" />
          <Row k="WAN2" v={`${snap.wan2Uptime.toFixed(2)}%`} c="var(--neon-magenta)" />
          <Row k="Steam Down" v={<>{snap.steamDownMinutes} <span className="font-fa" lang="fa">دقیقه</span></>} c="var(--neon-amber)" />
          <Row k={<span className="font-fa" lang="fa">بیشترین مصرف</span>} v={snap.topConsumer} c="var(--neon-green)" />
        </div>
      ) : (
        <div className="font-mono text-[10px] text-muted-foreground">no data yet</div>
      )}
    </div>
  );
}

function Row({ k, v, c }: { k: ReactNode; v: ReactNode; c: string }) {
  return (
    <>
      <div className="text-muted-foreground">{k}:</div>
      <div className="text-right font-bold" style={{ color: c }}>{v}</div>
    </>
  );
}
