// Background poller that pings every online VIP's LAN IP + (if a game is
// detected from topProcess) the game's server host. Mounted once in the
// Dashboard route — renders nothing.

import { useEffect, useRef } from "react";
import type { ClientStatus } from "@/lib/monitoring-types";
import { ipFromMachine } from "@/lib/cache-activity";
import { detectGame, pingHosts, publishClientPing, type ClientPing } from "@/lib/client-ping";
import { getMachine, loadVncConfig } from "@/lib/vnc-config";
import { isComposing } from "@/lib/compose-lock";

const POLL_MS = 3000;
const HISTORY = 20;

interface Props { clients: ClientStatus[] }

export function ClientPingProbe({ clients }: Props) {
  const clientsRef = useRef<ClientStatus[]>(clients);
  useEffect(() => { clientsRef.current = clients; }, [clients]);

  useEffect(() => {
    const state: Record<string, ClientPing> = {};
    let alive = true;

    async function tick() {
      if (isComposing()) return;
      const cfg = loadVncConfig();
      const list = clientsRef.current.filter((c) => c.online !== false);
      if (!list.length) return;

      // Build one flat list of hosts to ping in a single agent call.
      const jobs: { machine: string; ip: string; gameHost: string | null; gameName: string | null }[] = [];
      const hosts: string[] = [];
      for (const c of list) {
        const mapped = getMachine(cfg, c.machine);
        const ip = mapped?.host || ipFromMachine(c.machine) || "";
        if (!ip) continue;
        const g = detectGame(c.topProcess || "");
        jobs.push({ machine: c.machine, ip, gameHost: g?.host || null, gameName: g?.name || null });
        hosts.push(ip);
        if (g) hosts.push(g.host);
      }
      if (!hosts.length) return;

      const results = await pingHosts(hosts);
      if (!alive) return;
      let idx = 0;
      for (const j of jobs) {
        const lanMs = results[idx++] ?? -1;
        const gameMs = j.gameHost ? (results[idx++] ?? -1) : null;
        const prev = state[j.machine];
        const history = [...(prev?.history || []), lanMs].slice(-HISTORY);
        state[j.machine] = {
          machine: j.machine,
          ip: j.ip,
          lanMs,
          gameName: j.gameName,
          gameHost: j.gameHost,
          gameMs,
          history,
          updatedAt: Date.now(),
        };
      }
      publishClientPing({ ...state });
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return null;
}
