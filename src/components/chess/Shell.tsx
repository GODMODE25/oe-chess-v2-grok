import { Menu, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
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
  const shellArt = useOe((s) => s.settings.shellArt);
  const shellArtStrength = useOe((s) => s.settings.shellArtStrength ?? 38);
  const customArt = shellArt?.startsWith("data:image/") ? shellArt : "";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    // The shipped banner is only painted by the glass theme, so it costs nothing to
    // load on the other five. An uploaded backdrop is painted by all six, veiled in
    // the theme's own canvas colour so panels and text keep their contrast.
    <div
      className="app-shell flex h-dvh overflow-hidden bg-canvas text-ivory"
      data-shell-art={customArt ? "custom" : "shipped"}
      style={
        {
          "--shell-art": `url("${customArt || assetUrl("/banner.jpg")}")`,
          "--shell-scrim": `color-mix(in oklab, var(--color-canvas) ${100 - shellArtStrength}%, transparent)`,
        } as CSSProperties
      }
    >
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-3">
          <img src={assetUrl("/logo-piece.svg")} alt="" className="h-12 w-12" />
          <div>
            <p className="font-display text-xl leading-none">OE Chess</p>
            <p className="text-xs text-mist">Openings and Endgames</p>
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
        <header className="relative z-30 flex shrink-0 items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-2 md:hidden">
          <div className="relative z-20 flex items-center gap-2">
            <img src={assetUrl("/logo-piece.svg")} alt="" className="h-9 w-9" />
            <p className="font-display text-xl leading-none">OE Chess</p>
          </div>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="relative z-20 grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface-2 text-ivory hover:border-brass"
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                tabIndex={-1}
                className="fixed inset-0 z-0 cursor-default bg-canvas/60"
                onClick={() => setMenuOpen(false)}
              />
              <nav
                id="mobile-menu"
                className="absolute inset-x-3 top-full z-10 mt-1 grid gap-1 rounded-xl border border-line bg-surface p-2 shadow-2xl"
              >
                {NAV.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={nav === item.id ? "page" : undefined}
                    onClick={() => {
                      setNav(item.id);
                      setMenuOpen(false);
                    }}
                    className={cn(
                      "h-11 rounded-lg px-3 text-left text-sm",
                      nav === item.id ? "bg-brass text-on-accent" : "text-ivory hover:bg-surface-2",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </>
          )}
        </header>
        {/* `relative` matters: an `sr-only` file input is absolutely positioned, and
            without a positioned ancestor it anchors to the document, where the shell's
            overflow cannot clip it — the window then grows a second scrollbar. */}
        <main className={cn("relative min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6", nav === "openings" && "scrollbar-hidden")}>
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
    </div>
  );
}
