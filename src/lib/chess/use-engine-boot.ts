import { useEffect, useState, useSyncExternalStore } from "react";
import {
  formatBytes,
  getEngineBootServerSnapshot,
  getEngineBootSnapshot,
  subscribeEngineBoot,
  type EngineBootSnapshot,
} from "./engine-boot";

export function useEngineBoot(): EngineBootSnapshot {
  return useSyncExternalStore(subscribeEngineBoot, getEngineBootSnapshot, getEngineBootServerSnapshot);
}

/**
 * A worker that reported no byte events at all within this window is either on
 * a warm cache or on a connection that stalls; either way the only honest bar
 * is an uncounted one.
 */
const SILENCE_MS = 300;

export type BootReadout = {
  percent: number;
  indeterminate: boolean;
  label: string;
  detail: string;
};

const DB_BAND = 12;
const DOWNLOAD_SPAN = 73;

/**
 * Bands are real signals only: db open 0-12, wasm bytes 12-85, then compile
 * and handshake, which have no byte counter left and stay indeterminate.
 */
export function composeBootReadout(dbBooted: boolean, boot: EngineBootSnapshot, silent: boolean): BootReadout {
  const downloadFloor = dbBooted ? DB_BAND : 0;
  if (boot.phase === "ready") {
    return { percent: 100, indeterminate: false, label: "Ready", detail: "" };
  }
  if (boot.phase === "failed") {
    return { percent: downloadFloor, indeterminate: false, label: "Engine unavailable", detail: boot.error };
  }
  if (!dbBooted) {
    return { percent: 0, indeterminate: false, label: "Opening local database", detail: "" };
  }
  switch (boot.phase) {
    case "downloading": {
      const percent = Math.round(DB_BAND + (DOWNLOAD_SPAN * boot.percent) / 100);
      const parts = [`${formatBytes(boot.loadedBytes)} / ${formatBytes(boot.totalBytes)}`];
      if (boot.speedText) parts.push(boot.speedText);
      if (boot.etaText) parts.push(`${boot.etaText} left`);
      return { percent, indeterminate: false, label: "Fetching Stockfish 19 lite", detail: parts.join(" · ") };
    }
    case "compiling":
      return { percent: DB_BAND + DOWNLOAD_SPAN, indeterminate: true, label: "Compiling engine", detail: "Downloaded, no byte counter from here" };
    case "handshake":
      return { percent: DB_BAND + DOWNLOAD_SPAN + 6, indeterminate: true, label: "Engine handshake", detail: "uciok received, waiting for readyok" };
    case "idle":
      return silent
        ? { percent: DB_BAND, indeterminate: true, label: "Loading Stockfish", detail: "No byte reports — engine may already be cached" }
        : { percent: DB_BAND, indeterminate: false, label: "Starting engine", detail: "" };
    default:
      return { percent: downloadFloor, indeterminate: false, label: "Preparing engine", detail: "" };
  }
}

export function useEngineBootReadout(dbBooted: boolean): BootReadout {
  const boot = useEngineBoot();
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    setSilent(false);
    if (!boot.requested || boot.phase !== "idle") return;
    const remaining = Math.max(0, SILENCE_MS - (Date.now() - boot.requestedAt));
    const timer = setTimeout(() => setSilent(true), remaining);
    return () => clearTimeout(timer);
  }, [boot.requested, boot.requestedAt, boot.phase]);

  return composeBootReadout(dbBooted, boot, silent);
}
