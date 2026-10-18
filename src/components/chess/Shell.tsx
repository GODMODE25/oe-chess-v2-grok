import { useEffect } from "react";
import { assetUrl } from "@/lib/chess/asset-url";
import { useOe } from "@/lib/chess/store";
import type { NavId, SyncStatus } from "@/lib/chess/types";
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

export function Shell() {
  const nav = useOe((s) => s.nav);
  const setNav = useOe((s) => s.setNav);
  const sync = useOe((s) => s.sync);
  const bootError = useOe((s) => s.bootError);

  useEffect(() => {
    function onLine() {
      const state = useOe.getState();
      useOe.setState({ sync: { ...state.sync, status: navigator.onLine ? (state.googleToken ? "signed-in" : "signed-out") : "offline", updatedAt: Date.now() } });
    }
    window.addEventListener("online", onLine);
    window.addEventListener("offline", onLine);
    return () => {
      window.removeEventListener("online", onLine);
      window.removeEventListener("offline", onLine);
    };
  }, []);

  return (
    <div className="min-h-screen bg-ink text-ivory">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
          <div className="mb-8 flex items-center gap-3">
            <img src={assetUrl("/favicon.svg")} alt="" className="h-10 w-10" />
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
                className={cn("h-11 rounded-lg px-3 text-left text-sm", nav === item.id ? "bg-brass text-ink" : "text-ivory hover:bg-panel")}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <p className="mt-auto pt-6 text-xs text-mist">{STATUS[sync.status]}</p>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 pb-24 md:px-6 md:pb-8">
          <header className="mb-5 flex items-center justify-between gap-3 md:hidden">
            <div className="flex items-center gap-2">
              <img src={assetUrl("/favicon.svg")} alt="" className="h-8 w-8" />
              <p className="font-display text-xl">OE Chess</p>
            </div>
            <p className="text-xs text-mist">{STATUS[sync.status]}</p>
          </header>
          {bootError && <p className="mb-4 text-sm text-danger">{bootError}</p>}
          {nav === "play" && <PlayView />}
          {nav === "openings" && <OpeningsView />}
          {nav === "endgames" && <EndgamesView />}
          {nav === "library" && <LibraryView />}
          {nav === "stats" && <StatsView />}
          {nav === "settings" && <SettingsView />}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-ink md:hidden">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setNav(item.id)}
            className={cn("h-16 text-xs", nav === item.id ? "text-brass" : "text-mist")}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
