// Custom dashboard logo, persisted in localStorage as a data URL.
// When empty, the dashboard falls back to the "E" mark.

const STORAGE_KEY = "exir.logo.v1";
export const LOGO_EVENT = "exir:logo";

export function loadLogo(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveLogo(dataUrl: string) {
  try {
    localStorage.setItem(STORAGE_KEY, dataUrl);
    window.dispatchEvent(new CustomEvent(LOGO_EVENT));
  } catch {
    /* ignore (quota) */
  }
}

export function clearLogo() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(LOGO_EVENT));
  } catch {
    /* ignore */
  }
}

/** Read a File as a data URL (used by the settings uploader). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
