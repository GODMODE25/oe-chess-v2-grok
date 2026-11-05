import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/chess/Shell";
import { Meter } from "@/components/chess/ui";
import { assetUrl } from "@/lib/chess/asset-url";
import { useAppThemeSync } from "@/lib/chess/use-app-theme";
import { useEngineBoot, useEngineBootReadout } from "@/lib/chess/use-engine-boot";
import { getEngine } from "@/lib/chess/engine";
import { bootStore, useOe } from "@/lib/chess/store";

export const Route = createFileRoute("/")({ component: Home });

/**
 * The wasm is re-fetched on any cold cache and there is no service worker, so
 * waiting on the engine is capped: the trainer's own data needs no engine, and
 * PlayView already renders engine errors inline.
 */
const SPLASH_DEADLINE_MS = 3000;

function Home() {
  const booted = useOe((s) => s.booted);
  const engine = useEngineBoot();
  const readout = useEngineBootReadout(booted);
  useAppThemeSync();
  const [mounted, setMounted] = useState(false);
  const [pastDeadline, setPastDeadline] = useState(false);

  useEffect(() => {
    setMounted(true);
    void bootStore();
    getEngine().ready.catch(() => {
      /* readiness and the retry live in the shell's engine status */
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setPastDeadline(true), SPLASH_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, []);

  const engineSettled = engine.phase === "ready" || engine.phase === "failed";
  if (!mounted || !booted || (!engineSettled && !pastDeadline)) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-canvas px-6 text-ivory">
        <img src={assetUrl("/banner.jpg")} alt="" className="banner-art pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-b from-scrim/60 via-scrim/80 to-scrim" aria-hidden />
        <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-4">
          <img src={assetUrl("/favicon.svg")} alt="" className="h-16 w-16" />
          <h1 className="font-display text-4xl">OE Chess</h1>
          <Meter value={readout.percent} label={readout.label} detail={readout.detail} indeterminate={readout.indeterminate} />
          {!booted && pastDeadline && (
            <p className="text-xs text-mist">The local database is slow to open — if another OE Chess tab is still open, close it and reload.</p>
          )}
        </div>
      </main>
    );
  }
  return <Shell />;
}
