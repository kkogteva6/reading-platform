const DEFAULT_BACKEND_BASE = "https://reading-platform-backend.onrender.com";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getBackendBase(): string {
  const envValue = import.meta.env.VITE_API_BASE?.trim();
  return trimTrailingSlash(envValue || DEFAULT_BACKEND_BASE);
}

export function toBackendUrl(path?: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;

  const base = getBackendBase();
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

