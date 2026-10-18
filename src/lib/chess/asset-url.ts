import { previewPathPrefix } from "@/lib/preview-path-prefix";

/** Public asset URL that keeps working under a path-prefixed preview host. */
export function assetUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (typeof window === "undefined") return normalized;
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
  return `${prefix}${normalized}`;
}
