export interface ClientStatus {
  machine: string;
  gpuTemp: number;
  gpuUsage: number;
  cpuTemp: number;
  cpuUsage?: number;
  ram: number;
  fps: number;
  gpuName: string;
  topProcess: string;
  thermalLevel: number;
  profile: number;
  timestamp: string;
  online?: boolean;
}

export interface ServerStatus {
  name: string;
  gpuTemp: number;
  gpuUsage: number;
  cpuTemp: number;
  cpuUsage: number;
  ramUsed: number;
  ramTotal: number;
  fps: number;
  uptime: string;
  timestamp: string;
}

export interface PingSample {
  t: number; // epoch ms
  v: number; // ms latency, -1 = loss
}

export interface PingTarget {
  label: string;
  host: string;
  history: PingSample[];
}
