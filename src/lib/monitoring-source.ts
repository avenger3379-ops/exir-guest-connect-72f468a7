import type { ClientStatus, ServerStatus } from "./monitoring-types";

// ---------- Persistent directory handle in IndexedDB ----------

const DB_NAME = "exir-monitor";
const STORE = "handles";
const KEY = "statusDir";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains("branding")) db.createObjectStore("branding");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDirHandle(handle: FileSystemDirectoryHandle) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearDirHandle() {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Permission helpers ----------

export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  // @ts-expect-error - queryPermission isn't in default lib
  const q = await handle.queryPermission?.({ mode: "read" });
  if (q === "granted") return true;
  // @ts-expect-error - requestPermission isn't in default lib
  const r = await handle.requestPermission?.({ mode: "read" });
  return r === "granted";
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickStatusDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    // @ts-expect-error - showDirectoryPicker isn't in default lib
    const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
      id: "exir-status",
      mode: "read",
      startIn: "documents",
    });
    await saveDirHandle(handle);
    return handle;
  } catch {
    return null; // user cancelled
  }
}

// ---------- Reading JSON files ----------

async function readJsonFile(dir: FileSystemDirectoryHandle, name: string): Promise<unknown | null> {
  try {
    // try both as-given and uppercase/lowercase extension
    const candidates = [name, name.replace(/\.json$/i, ".JSON"), name.replace(/\.JSON$/i, ".json")];
    for (const candidate of candidates) {
      try {
        const fileHandle = await dir.getFileHandle(candidate);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
      } catch {
        /* try next */
      }
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeClient(raw: Record<string, unknown>, fallbackMachine: string): ClientStatus {
  const num = (v: unknown, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
  return {
    machine: typeof raw.machine === "string" ? raw.machine : fallbackMachine,
    gpuTemp: num(raw.gpuTemp),
    gpuUsage: num(raw.gpuUsage),
    cpuTemp: num(raw.cpuTemp),
    cpuUsage: typeof raw.cpuUsage === "number" ? raw.cpuUsage : undefined,
    ram: num(raw.ram),
    fps: num(raw.fps),
    gpuName: typeof raw.gpuName === "string" ? raw.gpuName : "Unknown GPU",
    topProcess: typeof raw.topProcess === "string" ? raw.topProcess : "—",
    thermalLevel: num(raw.thermalLevel, 1),
    profile: num(raw.profile, 1),
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : new Date().toISOString(),
    online: true,
  };
}




export async function readAllClients(dir: FileSystemDirectoryHandle): Promise<ClientStatus[]> {
  const STALE_MS = 30_000;
  const now = Date.now();
  const results = await Promise.all(
    Array.from({ length: 12 }, async (_, i) => {
      const id = String(i + 1).padStart(2, "0");
      const machine = `VIP${id}`;
      const data = await readJsonFile(dir, `${machine}.json`);
      if (!data || typeof data !== "object") return null; // file missing → hide from grid
      const c = normalizeClient(data as Record<string, unknown>, machine);
      // VIP08 is always shown online (user override — clock skew on that box).
      if (machine === "VIP08") {
        c.online = true;
        return c;
      }
      const ts = Date.parse(c.timestamp);
      if (isFinite(ts) && now - ts > STALE_MS) c.online = false;
      return c;
    }),
  );
  return results.filter((c): c is ClientStatus => c !== null);
}

export async function readServer(dir: FileSystemDirectoryHandle): Promise<ServerStatus | null> {
  try {
    const serverDir = await dir.getDirectoryHandle("Server").catch(() => dir.getDirectoryHandle("server"));
    const data = await readJsonFile(serverDir, "Exir-Server.json");
    if (!data || typeof data !== "object") return null;
    const raw = data as Record<string, unknown>;
    const num = (v: unknown, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
    return {
      name: typeof raw.name === "string" ? raw.name : (typeof raw.machine === "string" ? raw.machine : "EXIR-SERVER"),
      gpuTemp: num(raw.gpuTemp),
      gpuUsage: num(raw.gpuUsage),
      cpuTemp: num(raw.cpuTemp),
      cpuUsage: num(raw.cpuUsage ?? raw.cpuLoad),
      ramUsed: num(raw.ramUsed ?? raw.ram),
      ramTotal: num(raw.ramTotal, 64),
      fps: num(raw.fps),
      uptime: typeof raw.uptime === "string" ? raw.uptime : "—",
      timestamp: typeof raw.timestamp === "string" ? raw.timestamp : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
