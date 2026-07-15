import { useEffect, useState } from "react";
import { CalendarClock, User, X, Plus } from "lucide-react";
import {
  defaultSeats,
  loadReservations,
  reserve,
  release,
  remainingMinutes,
  type Reservation,
  type SeatKind,
} from "@/lib/reservations";
import { isComposing } from "@/lib/compose-lock";

const KIND_COLOR: Record<SeatKind, string> = {
  pc:   "var(--neon-cyan)",
  ps4:  "var(--neon-magenta)",
  ps5:  "var(--neon-amber)",
  room: "var(--neon-green)",
};

export function ReservationBoard() {
  const seats = defaultSeats();
  const [res, setRes] = useState<Record<string, Reservation>>(() => loadReservations());
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const h = () => setRes(loadReservations());
    window.addEventListener("exir:reservations", h);
    window.addEventListener("storage", h);
    const id = setInterval(() => {
      if (isComposing()) return;
      setRes(loadReservations());
    }, 30_000);
    return () => {
      window.removeEventListener("exir:reservations", h);
      window.removeEventListener("storage", h);
      clearInterval(id);
    };
  }, []);

  return (
    <div className="mb-3 rounded-xl p-3 glass-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          <CalendarClock size={12} /> ▸ رزرو صندلی · seat reservation
        </h3>
        <span className="font-mono text-[9px] text-muted-foreground">
          {Object.keys(res).length} / {seats.length} reserved
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9">
        {seats.map((s) => {
          const r = res[s.id];
          const rem = r ? remainingMinutes(r) : 0;
          const busy = !!r && rem > 0;
          const accent = KIND_COLOR[s.kind];
          return (
            <div
              key={s.id}
              className="relative rounded-lg border p-2 text-center transition"
              style={{
                borderColor: busy ? accent : "oklch(0.3 0.02 260 / 0.6)",
                background: busy ? `${accent}18` : "oklch(0.14 0.02 260 / 0.5)",
                boxShadow: busy ? `0 0 12px ${accent}55` : undefined,
              }}
            >
              <div className="font-mono text-[11px] font-bold" style={{ color: accent }}>{s.label}</div>
              {busy ? (
                <>
                  <div className="mt-0.5 flex items-center justify-center gap-1 font-mono text-[10px] text-foreground/90">
                    <User size={9} /> {r.customer}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {Math.floor(rem / 60)}:{String(Math.floor(rem % 60)).padStart(2, "0")} Left
                  </div>
                  <button
                    onClick={() => release(s.id)}
                    title="release"
                    className="absolute -top-1.5 -right-1.5 rounded-full border border-border/60 bg-background p-0.5 text-muted-foreground hover:text-rose-300"
                  >
                    <X size={9} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(s.id)}
                  className="mt-1 inline-flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground hover:text-foreground"
                >
                  <Plus size={9} /> reserve
                </button>
              )}
            </div>
          );
        })}
      </div>
      {editing && <ReserveModal seatId={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ReserveModal({ seatId, onClose }: { seatId: string; onClose: () => void }) {
  const [customer, setCustomer] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [note, setNote] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0.05 0.02 260 / 0.6)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-5 glass-panel neon-border-cyan"
      >
        <div className="mb-3 font-mono text-lg font-bold text-glow-cyan">Reserve {seatId}</div>
        <label className="block font-mono text-[10px] uppercase text-muted-foreground">customer name</label>
        <input
          autoFocus
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-sm outline-none focus:border-cyan-500"
        />
        <label className="mt-3 block font-mono text-[10px] uppercase text-muted-foreground">duration (minutes)</label>
        <input
          type="number"
          min={5}
          max={720}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-sm outline-none focus:border-cyan-500"
        />
        <label className="mt-3 block font-mono text-[10px] uppercase text-muted-foreground">note (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-background/60 px-2 py-1.5 font-mono text-sm outline-none focus:border-cyan-500"
        />
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded border border-border/60 py-2 font-mono text-xs uppercase text-muted-foreground hover:text-foreground"
          >
            cancel
          </button>
          <button
            disabled={!customer.trim()}
            onClick={() => { reserve(seatId, customer.trim(), minutes, note.trim() || undefined); onClose(); }}
            className="flex-1 rounded border border-cyan-500/60 bg-cyan-500/15 py-2 font-mono text-xs font-bold uppercase text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40"
          >
            reserve
          </button>
        </div>
      </div>
    </div>
  );
}
