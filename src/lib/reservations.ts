// Seat/console reservation manager — local-only (localStorage).
// Seats: 12 PCs (VIP01..VIP12), 4 PS4 (PS4-1..PS4-4), 1 PS5, 1 Room.

export type SeatKind = "pc" | "ps4" | "ps5" | "room";

export interface Seat {
  id: string;         // "VIP01", "PS4-1", "PS5", "ROOM"
  kind: SeatKind;
  label: string;
}

export interface Reservation {
  seatId: string;
  customer: string;
  startedAt: number;   // epoch ms
  minutes: number;     // total duration
  note?: string;
}

const KEY = "exir.reservations.v1";

export function defaultSeats(): Seat[] {
  const pcs: Seat[] = Array.from({ length: 12 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return { id: `VIP${n}`, kind: "pc", label: `VIP${n}` };
  });
  const ps4: Seat[] = Array.from({ length: 4 }, (_, i) => ({
    id: `PS4-${i + 1}`, kind: "ps4", label: `PS4 #${i + 1}`,
  }));
  return [
    ...pcs,
    ...ps4,
    { id: "PS5", kind: "ps5", label: "PS5" },
    { id: "ROOM", kind: "room", label: "Private Room" },
  ];
}

export function loadReservations(): Record<string, Reservation> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

export function saveReservations(r: Record<string, Reservation>) {
  localStorage.setItem(KEY, JSON.stringify(r));
  window.dispatchEvent(new Event("exir:reservations"));
}

export function reserve(seatId: string, customer: string, minutes: number, note?: string) {
  const all = loadReservations();
  all[seatId] = { seatId, customer, minutes, startedAt: Date.now(), note };
  saveReservations(all);
}

export function release(seatId: string) {
  const all = loadReservations();
  delete all[seatId];
  saveReservations(all);
}

export function remainingMinutes(r: Reservation): number {
  const elapsed = (Date.now() - r.startedAt) / 60000;
  return Math.max(0, r.minutes - elapsed);
}
