import type { ClientStatus, ServerStatus, PingTarget } from "./monitoring-types";

const PROCESSES = ["dota2", "valorant", "cs2", "fortnite", "lol", "pubg", "apex", "warzone", "fifa24", "gta5"];
const GPUS = ["NVIDIA GeForce GTX 1080", "NVIDIA RTX 3060", "NVIDIA RTX 4070", "NVIDIA GTX 1660"];

function rand(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

export function generateMockClients(): ClientStatus[] {
  return Array.from({ length: 12 }, (_, i) => {
    const id = String(i + 1).padStart(2, "0");
    const online = Math.random() > 0.12;
    if (!online) {
      return {
        machine: `VIP${id}`,
        gpuTemp: 0,
        gpuUsage: 0,
        cpuTemp: 0,
        ram: 0,
        fps: 0,
        gpuName: GPUS[i % GPUS.length],
        topProcess: "—",
        thermalLevel: 0,
        profile: 0,
        timestamp: new Date().toISOString(),
        online: false,
      };
    }
    return {
      machine: `VIP${id}`,
      gpuTemp: rand(38, 82),
      gpuUsage: rand(15, 99),
      cpuTemp: rand(40, 78),
      cpuUsage: rand(10, 90),
      ram: rand(6, 30),
      fps: rand(48, 240),
      gpuName: GPUS[i % GPUS.length],
      topProcess: PROCESSES[Math.floor(Math.random() * PROCESSES.length)],
      thermalLevel: Math.random() > 0.8 ? 2 : 1,
      profile: 1,
      timestamp: new Date().toISOString(),
      online: true,
    };
  });
}

export function generateMockServer(): ServerStatus {
  return {
    name: "EXIR-SERVER",
    gpuTemp: rand(52, 68),
    gpuUsage: rand(20, 60),
    cpuTemp: rand(48, 65),
    cpuUsage: rand(15, 55),
    ramUsed: rand(18, 42),
    ramTotal: 64,
    fps: 0,
    uptime: "14d 06h 22m",
    timestamp: new Date().toISOString(),
  };
}

export function generateMockPings(): PingTarget[] {
  const targets = [
    { label: "Gateway", host: "192.168.3.1" },
    { label: "DNS Shecan", host: "178.22.122.100" },
    { label: "Google", host: "8.8.8.8" },
    { label: "Cloudflare", host: "1.1.1.1" },
    { label: "Steam", host: "steamcommunity.com" },
    { label: "Riot", host: "riotgames.com" },
  ];
  const now = Date.now();
  return targets.map((t) => ({
    ...t,
    history: Array.from({ length: 6 }, (_, i) => ({
      t: now - (6 - i) * 2000,
      v: Math.random() > 0.05 ? Math.round(rand(8, 120)) : -1,
    })),
  }));

}
