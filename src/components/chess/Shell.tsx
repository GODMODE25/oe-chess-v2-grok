import { useEffect } from "react";
import { assetUrl } from "@/lib/chess/asset-url";
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
    <div className="flex h-dvh overflow-hidden bg-ink text-ivory">
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
              className={cn("h-11 rounded-lg px-3 text-left text-sm", nav === item.id ? "bg-brass text-ink" : "text-ivory hover:bg-panel")}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className="mt-auto pt-6 text-xs text-mist">{STATUS[sync.status]}</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-20 flex items-center justify-between gap-3 border-b border-line bg-ink px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={assetUrl("/logo-king.jpg")} alt="" className="h-9 w-9 rounded-md object-cover" />
            <p className="font-display text-xl">OE Chess</p>
          </div>
          <p className="text-xs text-mist">{STATUS[sync.status]}</p>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-20 md:px-6 md:pb-6">
          {bootError && <p className="mb-4 text-sm text-danger">{bootError}</p>}
          {nav === "play" && <PlayView />}
          {nav === "openings" && <OpeningsView />}
          {nav === "endgames" && <EndgamesView />}
          {nav === "library" && <LibraryView />}
          {nav === "stats" && <StatsView />}
          {nav === "about" && <AboutView />}
          {nav === "settings" && <SettingsView />}
        </main>
        <footer className="hidden shrink-0 items-center justify-between border-t border-line bg-ink px-4 py-2 text-xs text-mist md:flex">
          <span>OE Chess · offline on this device</span>
          <span>{STATUS[sync.status]}</span>
        </footer>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-line bg-ink px-2 md:hidden">
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
