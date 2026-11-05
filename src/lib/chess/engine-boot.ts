/**
 * Engine boot state, held at module level so it survives the EngineClient
 * singleton being torn down and rebuilt. Nothing here constructs a Worker —
 * readers only observe.
 */

export type EngineBootPhase =
  | "pending"
  | "idle"
  | "downloading"
  | "compiling"
  | "handshake"
  | "ready"
  | "failed";

export type EngineBootSnapshot = {
  phase: EngineBootPhase;
  /** True once a worker has actually been asked for. */
  requested: boolean;
  /** Wasm bytes, 0-100. Stays 0 when the worker never reported a chunk. */
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  speedText: string;
  etaText: string;
  error: string;
  requestedAt: number;
};

const EMPTY: EngineBootSnapshot = {
  phase: "pending",
  requested: false,
  percent: 0,
  loadedBytes: 0,
  totalBytes: 0,
  speedText: "",
  etaText: "",
  error: "",
  requestedAt: 0,
};

/** Published state — the only value getSnapshot() may return. */
let snapshot: EngineBootSnapshot = EMPTY;
/** Most recent intended state; coalescing reads from here, never from snapshot. */
let latest: EngineBootSnapshot = EMPTY;
let frame: number | null = null;
let timeout: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function same(a: EngineBootSnapshot, b: EngineBootSnapshot) {
  return (
    a.phase === b.phase &&
    a.requested === b.requested &&
    a.percent === b.percent &&
    a.loadedBytes === b.loadedBytes &&
    a.totalBytes === b.totalBytes &&
    a.speedText === b.speedText &&
    a.etaText === b.etaText &&
    a.error === b.error &&
    a.requestedAt === b.requestedAt
  );
}

function publish(next: EngineBootSnapshot) {
  if (same(next, latest)) return;
  latest = next;
  if (frame != null || timeout != null) return;
  // One notification per animation frame at most; a hidden tab never fires rAF,
  // so it falls back to a timeout instead of stranding the queue.
  if (typeof requestAnimationFrame === "function" && document.visibilityState === "visible") {
    frame = requestAnimationFrame(flush);
  } else {
    timeout = setTimeout(flush, 60);
  }
}

function flush() {
  if (frame != null) {
    cancelAnimationFrame(frame);
    frame = null;
  }
  if (timeout != null) {
    clearTimeout(timeout);
    timeout = null;
  }
  if (latest === snapshot) return;
  snapshot = latest;
  for (const fn of [...listeners]) fn();
}

function patch(partial: Partial<EngineBootSnapshot>) {
  publish({ ...latest, ...partial });
}

export function beginEngineBoot() {
  publish({ ...EMPTY, phase: "idle", requested: true, requestedAt: Date.now() });
}

type ByteEvent = {
  percent?: unknown;
  loaded?: unknown;
  total?: unknown;
  speedText?: unknown;
  etaText?: unknown;
};

/**
 * The vendored worker streams {percent, loaded, total, speedText, etaText} on
 * the port we hand it, and closes that port itself at percent >= 1 — after that
 * there is no byte counter left, only compilation.
 */
export function reportEngineBytes(data: unknown) {
  if (!data || typeof data !== "object") return;
  const event = data as ByteEvent;
  const loaded = typeof event.loaded === "number" ? event.loaded : 0;
  const total = typeof event.total === "number" ? event.total : 0;
  if (total <= 0) return;
  const ratio = typeof event.percent === "number" ? event.percent : loaded / total;
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const finished = ratio >= 1 || percent >= 100;
  patch({
    phase: finished ? "compiling" : "downloading",
    percent: finished ? 100 : percent,
    loadedBytes: finished ? total : loaded,
    totalBytes: total,
    speedText: finished ? "" : typeof event.speedText === "string" ? event.speedText : "",
    etaText: finished ? "" : typeof event.etaText === "string" ? event.etaText : "",
  });
}

export function markEngineCompiling() {
  if (latest.phase === "idle" || latest.phase === "downloading") patch({ phase: "compiling" });
}

export function markEngineHandshake() {
  if (latest.phase !== "ready" && latest.phase !== "failed") patch({ phase: "handshake" });
}

export function markEngineReady() {
  if (latest.phase === "failed") return;
  patch({
    phase: "ready",
    percent: 100,
    loadedBytes: latest.totalBytes,
    speedText: "",
    etaText: "",
    error: "",
  });
}

export function markEngineFailed(message: string) {
  patch({ phase: "failed", error: message, speedText: "", etaText: "" });
}

export function subscribeEngineBoot(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getEngineBootSnapshot(): EngineBootSnapshot {
  return snapshot;
}

/** Server render never has a worker, so it must not see client boot state. */
export function getEngineBootServerSnapshot(): EngineBootSnapshot {
  return EMPTY;
}

export function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
