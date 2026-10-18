import { useState } from "react";
import { readDiag } from "@/lib/chess/diag";
import { exportBackup, useOe } from "@/lib/chess/store";
import type { BoardTheme, SyncStatus } from "@/lib/chess/types";
import { Button, Field, Panel, Pill, TextInput } from "./ui";

const STATUS: Record<SyncStatus, string> = {
  offline: "Offline",
  "signed-out": "Signed out",
  "signed-in": "Signed in",
  syncing: "Syncing",
  "up-to-date": "Up to date",
  conflict: "Conflict",
  error: "Error",
};

export function SettingsView() {
  const settings = useOe((s) => s.settings);
  const profile = useOe((s) => s.profile);
  const sync = useOe((s) => s.sync);
  const patchSettings = useOe((s) => s.patchSettings);
  const setProfileName = useOe((s) => s.setProfileName);
  const signInGoogle = useOe((s) => s.signInGoogle);
  const signOutGoogle = useOe((s) => s.signOutGoogle);
  const syncNow = useOe((s) => s.syncNow);
  const restoreCloud = useOe((s) => s.restoreCloud);
  const importEnvelope = useOe((s) => s.importEnvelope);
  const dismissNotes = useOe((s) => s.dismissNotes);
  const googleToken = useOe((s) => s.googleToken);
  const [importNote, setImportNote] = useState("");

  async function onBackup(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      setImportNote(importEnvelope(parsed, "merge") || "Backup merged.");
    } catch {
      setImportNote("Could not read that backup.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <h2 className="text-2xl">Profile</h2>
        <div className="mt-3 grid gap-3">
          <Field label="Name">
            <TextInput value={profile.name} onChange={(event) => setProfileName(event.target.value)} />
          </Field>
          <p className="text-xs text-mist">This device id stays local: {profile.deviceId.slice(0, 8)}</p>
        </div>
      </Panel>
      <Panel>
        <h2 className="text-2xl">Board</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["walnut", "ink", "stone"] as BoardTheme[]).map((theme) => (
            <Button key={theme} variant={settings.boardTheme === theme ? "primary" : "quiet"} onClick={() => patchSettings({ boardTheme: theme })}>
              {theme}
            </Button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={settings.coordinates ? "primary" : "quiet"} onClick={() => patchSettings({ coordinates: !settings.coordinates })}>Coordinates</Button>
          <Button variant={settings.sound ? "primary" : "quiet"} onClick={() => patchSettings({ sound: !settings.sound })}>Sound</Button>
        </div>
      </Panel>
      <Panel>
        <h2 className="text-2xl">Engine</h2>
        <p className="mt-2 text-sm text-mist">Play strength {settings.playStrength === "max" ? "maximum" : settings.playStrength}. Endgames use maximum strength unless you turn that off.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[1400, 1800, 2200, "max" as const].map((value) => (
            <Button key={String(value)} variant={settings.playStrength === value ? "primary" : "quiet"} onClick={() => patchSettings({ playStrength: value })}>
              {value === "max" ? "Maximum" : value}
            </Button>
          ))}
        </div>
        <div className="mt-3">
          <Button variant={settings.endgameMaximum ? "primary" : "quiet"} onClick={() => patchSettings({ endgameMaximum: !settings.endgameMaximum })}>
            {settings.endgameMaximum ? "Endgames at full strength" : "Endgames use play strength"}
          </Button>
        </div>
      </Panel>
      <Panel>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-2xl">Sync</h2>
          <Pill tone={sync.status === "error" || sync.status === "conflict" ? "danger" : sync.status === "up-to-date" ? "ok" : "brass"}>
            {STATUS[sync.status]}
          </Pill>
        </div>
        <p className="mt-2 text-sm text-mist">
          Progress is stored on this device first. Google Drive sync is optional and writes only to your Drive app-data folder. Nothing is sent to an OE Chess server.
        </p>
        <div className="mt-3 grid gap-2">
          <Field label="Google OAuth web client id">
            <TextInput value={settings.googleClientId} placeholder="apps.googleusercontent.com" onChange={(event) => patchSettings({ googleClientId: event.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {googleToken ? <Button variant="quiet" onClick={signOutGoogle}>Sign out</Button> : <Button onClick={() => void signInGoogle()}>Sign in with Google</Button>}
            <Button variant="quiet" onClick={() => void syncNow()}>Sync now</Button>
            <Button variant="quiet" onClick={() => void restoreCloud()}>Restore from cloud</Button>
          </div>
          {sync.lastError && <p className="text-sm text-danger">{sync.lastError}</p>}
          {sync.notes.length > 0 && (
            <div className="text-sm">
              {sync.notes.map((note) => <p key={note}>{note}</p>)}
              <Button variant="ghost" onClick={dismissNotes}>Dismiss</Button>
            </div>
          )}
        </div>
      </Panel>
      <Panel className="lg:col-span-2">
        <h2 className="text-2xl">Backups</h2>
        <p className="mt-2 text-sm text-mist">A local backup is written automatically before a database upgrade. Export one whenever you want a copy you can move by hand.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={exportBackup}>Export local backup</Button>
          <label className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-4 text-sm">
            Merge a backup
            <input className="sr-only" type="file" accept="application/json" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onBackup(file);
            }} />
          </label>
          <Button
            variant="quiet"
            onClick={() => {
              const blob = new Blob([JSON.stringify({ at: new Date().toISOString(), log: readDiag() }, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "oe-chess-diagnostics.json";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export diagnostics
          </Button>
        </div>
        {importNote && <p className="mt-3 text-sm">{importNote}</p>}
      </Panel>
      <Panel className="lg:col-span-2">
        <h2 className="text-2xl">How to train</h2>
        <div className="mt-3 grid gap-3 text-sm text-mist md:grid-cols-3">
          <p><strong className="text-ivory">Openings.</strong> Put lines in a White or Black repertoire, then drill them. A miss or a slow answer comes back sooner. Blind drill hides the book move until you ask.</p>
          <p><strong className="text-ivory">Endgames.</strong> You play the assigned side against Stockfish. Mate, promote, or hold, depending on the card. Hints show the engine move. Retry starts the same position again.</p>
          <p><strong className="text-ivory">Offline.</strong> The board, the openings, and the endgames work with no network. Sign-in is only for copying progress into your own Google Drive.</p>
        </div>
      </Panel>
    </div>
  );
}
