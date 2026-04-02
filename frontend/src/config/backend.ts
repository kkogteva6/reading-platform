const DEFAULT_BACKEND_BASE = "https://reading-platform-backend.onrender.com";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getBackendBase(): string {
  const envValue = import.meta.env.VITE_API_BASE?.trim();
  return trimTrailingSlash(envValue || DEFAULT_BACKEND_BASE);
}

export function getCoverBase(): string {
  const envValue = import.meta.env.VITE_COVER_BASE?.trim();
  if (envValue) return trimTrailingSlash(envValue);

  if (typeof window !== "undefined" && /vercel\.app$/i.test(window.location.hostname)) {
    return trimTrailingSlash(window.location.origin);
  }

  return getBackendBase();
}

export function toBackendUrl(path?: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;

  const base = getBackendBase();
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function toCoverUrl(path?: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;

  const base = path.startsWith("/covers/") ? getCoverBase() : getBackendBase();
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}
