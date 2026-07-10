// Custom logo stored in IndexedDB (supports up to ~20MB, any file type).
// Returned as an object URL for use in <img src>.

const DB_NAME = "exir-monitor";
const STORE = "branding";
const KEY = "logo";
const DB_VERSION = 2; // bumped from monitoring-source (v1) to add "branding" store

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("handles")) db.createObjectStore("handles");
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface StoredLogo {
  blob: Blob;
  name: string;
  type: string;
  size: number;
}

export async function saveLogo(file: File): Promise<void> {
  const db = await openDB();
  const payload: StoredLogo = {
    blob: file,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(payload, KEY);
    tx.oncomplete = () => {
      window.dispatchEvent(new CustomEvent("exir:logo-changed"));
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadLogo(): Promise<StoredLogo | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as StoredLogo | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearLogo(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => {
      window.dispatchEvent(new CustomEvent("exir:logo-changed"));
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadLogoUrl(): Promise<string | null> {
  const l = await loadLogo();
  if (!l) return null;
  return URL.createObjectURL(l.blob);
}
