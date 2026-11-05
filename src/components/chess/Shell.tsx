import { useEffect, type CSSProperties } from "react";
import { assetUrl } from "@/lib/chess/asset-url";
import { getEngine } from "@/lib/chess/engine";
import { useEngineBoot } from "@/lib/chess/use-engine-boot";
import { useOe } from "@/lib/chess/store";
import type { NavId, SyncStatus } from "@/lib/chess/types";
import { AboutView } from "./AboutView";
import { EndgamesView } from "./EndgamesView";
import { LibraryView } from "./LibraryView";
import { OpeningsView } from "./OpeningsView";
import { PlayView } from "./PlayView";
import { SettingsView } from "./SettingsView";
import { StatsView } from "./StatsView";
import { cn } from "./ui";

const NAV: { id: NavId; label: string }[] = [
  { id: "play", label: "Play" },
  { id: "openings", label: "Openings" },
  { id: "endgames", label: "Endgames" },
  { id: "library", label: "Library" },
  { id: "stats", label: "Stats" },
  { id: "about", label: "About" },
  { id: "settings", label: "Settings" },
];

const STATUS: Record<SyncStatus, string> = {
  offline: "Offline",
  "signed-out": "Local only",
  "signed-in": "Signed in",
  syncing: "Syncing",
  "up-to-date": "Up to date",
  conflict: "Conflict",
  error: "Sync error",
};

/** Engine readiness keeps climbing after the splash gives up waiting on it. */
function EngineStatus() {
  const engine = useEngineBoot();
  if (!engine.requested) return null;
  if (engine.phase === "ready") return <p className="text-xs text-ok">Stockfish ready</p>;
  if (engine.phase === "failed") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-danger">
        <span>Stockfish didn&apos;t load</span>
        <button
          type="button"
          onClick={() => {
            getEngine().ready.catch(() => {});
          }}
          className="text-brass underline underline-offset-2"
        >
          Retry
        </button>
      </p>
    );
  }
  const detail =
    engine.phase === "downloading"
      ? `Stockfish ${engine.percent}%${engine.etaText ? ` · ${engine.etaText}` : ""}`
      : engine.phase === "compiling"
        ? "Stockfish compiling"
        : engine.phase === "handshake"
          ? "Stockfish starting"
          : "Stockfish loading";
  return <p className="tabular-nums text-xs text-brass">{detail}</p>;
}

export function Shell() {
  const nav = useOe((s) => s.nav);
  const setNav = useOe((s) => s.setNav);
  const sync = useOe((s) => s.sync);
  const bootError = useOe((s) => s.bootError);

  useEffect(() => {
    function onLine() {
      const state = useOe.getState();
      useOe.setState({ sync: { ...state.sync, status: navigator.onLine ? (state.cloudUid ? "signed-in" : "signed-out") : "offline", updatedAt: Date.now() } });
    }
    window.addEventListener("online", onLine);
    window.addEventListener("offline", onLine);
    return () => {
      window.removeEventListener("online", onLine);
      window.removeEventListener("offline", onLine);
    };
  }, []);

  return (
    // --shell-art is only painted by the glass theme; the url is resolved there,
    // so the banner costs nothing to load on the other five.
    <div
      className="app-shell flex h-dvh overflow-hidden bg-canvas text-ivory"
      style={{ "--shell-art": `url(${assetUrl("/banner.jpg")})` } as CSSProperties}
    >
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-3">
          <img src={assetUrl("/logo-king.jpg")} alt="" className="h-12 w-12 rounded-lg object-cover" />
          <div>
            <p className="font-display text-xl leading-none">OE Chess</p>
            <p className="text-xs text-mist">Openings and endgames</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setNav(item.id)}
              className={cn("h-11 rounded-lg px-3 text-left text-sm", nav === item.id ? "bg-brass text-on-accent" : "text-ivory hover:bg-surface-2")}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 pt-6" role="status">
          <EngineStatus />
          <p className="text-xs text-mist">{STATUS[sync.status]}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-20 flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <img src={assetUrl("/logo-king.jpg")} alt="" className="h-9 w-9 rounded-md object-cover" />
            <p className="font-display text-xl">OE Chess</p>
          </div>
          <div className="flex flex-col items-end gap-1" role="status">
            <EngineStatus />
            <p className="text-xs text-mist">{STATUS[sync.status]}</p>
          </div>
        </header>
        <main className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-20 md:px-6 md:pb-6", nav === "openings" && "scrollbar-hidden")}>
          {bootError && <p className="mb-4 text-sm text-danger">{bootError}</p>}
          {nav === "play" && <PlayView />}
          {nav === "openings" && <OpeningsView />}
          {nav === "endgames" && <EndgamesView />}
          {nav === "library" && <LibraryView />}
          {nav === "stats" && <StatsView />}
          {nav === "about" && <AboutView />}
          {nav === "settings" && <SettingsView />}
        </main>
        <footer className="hidden shrink-0 items-center justify-between border-t border-line bg-canvas px-4 py-2 text-xs text-mist md:flex">
          <span>OE Chess · offline on this device</span>
          <span>{STATUS[sync.status]}</span>
        </footer>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-line bg-canvas px-2 md:hidden">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setNav(item.id)}
            className={cn("h-14 shrink-0 px-3 text-xs", nav === item.id ? "text-brass" : "text-mist")}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
