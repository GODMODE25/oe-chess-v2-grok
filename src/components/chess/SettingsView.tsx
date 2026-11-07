import { useState } from "react";
import { readDiag } from "@/lib/chess/diag";
import { exportBackup, useOe } from "@/lib/chess/store";
import { APP_THEME_LABELS, PIECE_SET_LABELS } from "@/lib/chess/types";
import type { AppTheme, BoardTheme, PieceSet, SyncStatus } from "@/lib/chess/types";
import { PieceGlyph } from "./pieces";
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

const ELO_FLOOR = 1320;
const ELO_CEILING = 3190;

/** The board either follows the app theme or keeps one of the three fixed woods. */
const BOARD_LABELS: Record<BoardTheme, string> = {
  theme: "Match theme",
  walnut: "Walnut",
  ink: "Ink",
  stone: "Stone",
};

const APP_THEME_HINTS: Record<AppTheme, string> = {
  brass: "Default: warm near-black with brass.",
  print: "Ivory paper, hairline rules, ink text.",
  graphite: "Cool graphite studio with a lime accent.",
  atelier: "Aubergine and champagne, generous corners.",
  cyber: "Near-black blue, cyan signal, amber second accent.",
  glass: "Translucent panels — the splash is where it shows best.",
};

function strengthWord(elo: number) {
  if (elo < 1500) return "learning the ropes";
  if (elo < 1800) return "club player";
  if (elo < 2100) return "strong club";
  if (elo < 2400) return "expert";
  return "near master";
}

export function SettingsView() {
  const settings = useOe((s) => s.settings);
  const profile = useOe((s) => s.profile);
  const sync = useOe((s) => s.sync);
  const patchSettings = useOe((s) => s.patchSettings);
  const setProfileName = useOe((s) => s.setProfileName);
  const signInGoogle = useOe((s) => s.signInGoogle);
  const signInEmail = useOe((s) => s.signInEmail);
  const signOutCloud = useOe((s) => s.signOutCloud);
  const syncNow = useOe((s) => s.syncNow);
  const restoreCloud = useOe((s) => s.restoreCloud);
  const importEnvelope = useOe((s) => s.importEnvelope);
  const dismissNotes = useOe((s) => s.dismissNotes);
  const cloudUid = useOe((s) => s.cloudUid);
  const [importNote, setImportNote] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const sliderValue = settings.playStrength === "max" ? ELO_CEILING : settings.playStrength;
  const atFullStrength = sliderValue >= ELO_CEILING;

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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-2xl">Profile</h2>
          <Pill tone="brass">{profile.deviceId.slice(0, 8)}</Pill>
        </div>
        <p className="mt-2 text-sm text-mist">
          Your name travels with the progress you back up or sync. The code in the corner marks this device and stays on it.
        </p>
        <div className="mt-3 grid gap-3">
          <Field label="Name">
            <TextInput value={profile.name} onChange={(event) => setProfileName(event.target.value)} />
          </Field>
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
          Progress is stored on this device first. Cloud sync is optional and keeps one copy per account, so two devices meet in the middle when you sync. Nothing is sent to an OE Chess server.
        </p>
        <div className="mt-3 grid gap-2">
          {cloudUid ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="quiet" onClick={() => void signOutCloud()}>Sign out</Button>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void signInGoogle()}>Sign in with Google</Button>
              </div>
              <form
                className="grid gap-2 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void signInEmail(email, password, false);
                  setPassword("");
                }}
              >
                <Field label="Email">
                  <TextInput type="email" autoComplete="email" value={email} placeholder="you@example.com" onChange={(event) => setEmail(event.target.value)} />
                </Field>
                <Field label="Password">
                  <TextInput type="password" autoComplete="current-password" value={password} placeholder="At least six characters" onChange={(event) => setPassword(event.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button variant="quiet" type="submit">Sign in with email</Button>
                  <Button variant="quiet" type="button" onClick={() => { void signInEmail(email, password, true); setPassword(""); }}>Create account</Button>
                </div>
              </form>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
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
      <Panel>
        <h2 className="text-2xl">Board</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.entries(BOARD_LABELS) as Array<[BoardTheme, string]>).map(([theme, label]) => (
            <Button key={theme} variant={settings.boardTheme === theme ? "primary" : "quiet"} onClick={() => patchSettings({ boardTheme: theme })}>
              {label}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(Object.entries(PIECE_SET_LABELS) as Array<[PieceSet, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => patchSettings({ pieceSet: id })}
              aria-pressed={settings.pieceSet === id || (!settings.pieceSet && id === "standard")}
              className={`rounded-xl border p-3 text-left ${settings.pieceSet === id || (!settings.pieceSet && id === "standard") ? "border-brass" : "border-line"}`}
            >
              <span className="text-sm">{label}</span>
              <span className="mt-2 flex h-16 gap-1">
                {["k", "q", "n", "p"].map((type) => (
                  <PieceGlyph key={type} type={type} color="w" set={id} className="h-16 w-12 object-contain" />
                ))}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-mist">
          All five sets come from Lichess. Merida and Standard are GPL; Alpha, Staunty and Maestro are non-commercial. Each folder keeps its own licence note.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={settings.coordinates ? "primary" : "quiet"} onClick={() => patchSettings({ coordinates: !settings.coordinates })}>Coordinates</Button>
          <Button variant={settings.sound ? "primary" : "quiet"} onClick={() => patchSettings({ sound: !settings.sound })}>Sound</Button>
        </div>
      </Panel>
      <Panel>
        <h2 className="text-2xl">Appearance</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(Object.entries(APP_THEME_LABELS) as Array<[AppTheme, string]>).map(([id, label]) => {
            const active = (settings.appTheme ?? "brass") === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => patchSettings({ appTheme: id })}
                aria-pressed={active}
                className={`rounded-xl border p-3 text-left ${active ? "border-brass" : "border-line"}`}
              >
                <span className="text-sm">{label}</span>
                {/* Previewed in place: this wrapper carries the attribute, so the swatches
                    below resolve against the theme on show rather than the one in use. */}
                <span className="mt-2 flex h-12 gap-1 overflow-hidden rounded-md border border-line" data-app-theme={id} aria-hidden="true">
                  <span className="grid flex-1 grid-cols-2 grid-rows-2">
                    <span className="bg-board-light" />
                    <span className="bg-board-dark" />
                    <span className="bg-board-dark" />
                    <span className="bg-board-light" />
                  </span>
                  <span className="flex w-6 flex-col">
                    <span className="h-1/2 bg-surface-2" />
                    <span className="h-1/2 bg-brass" />
                  </span>
                  <span className="w-6 bg-canvas" />
                </span>
                <span className="mt-2 block text-xs text-mist">{APP_THEME_HINTS[id]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-mist">
          Each theme repaints the app and the splash. Choose Match theme for the board and the squares follow too.
        </p>
      </Panel>
      <Panel>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-2xl">Engine</h2>
          <Pill tone={atFullStrength ? "brass" : "mist"}>{atFullStrength ? "Maximum" : strengthWord(sliderValue)}</Pill>
        </div>
        <p className="mt-2 text-sm text-mist">
          Stockfish's rating scale starts around {ELO_FLOOR} and the top of the slider runs it uncut. Endgames use maximum strength unless you turn that off.
        </p>
        <div className="mt-3 grid gap-3">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-mist">Play strength</span>
              <span className="text-sm tabular-nums">{atFullStrength ? "Maximum" : `${sliderValue} Elo`}</span>
            </div>
            <input
              type="range"
              min={ELO_FLOOR}
              max={ELO_CEILING}
              step={10}
              value={sliderValue}
              aria-label="Engine playing strength"
              className="mt-2 w-full accent-brass"
              onChange={(event) => {
                const next = Number(event.target.value);
                patchSettings({ playStrength: next >= ELO_CEILING ? "max" : next });
              }}
            />
            <div className="mt-1 flex justify-between text-xs text-mist">
              <span>{ELO_FLOOR}</span>
              <span>{ELO_CEILING}</span>
            </div>
          </div>
          <div>
            <Button variant={settings.endgameMaximum ? "primary" : "quiet"} onClick={() => patchSettings({ endgameMaximum: !settings.endgameMaximum })}>
              {settings.endgameMaximum ? "Endgames at full strength" : "Endgames use play strength"}
            </Button>
          </div>
        </div>
      </Panel>
      <Panel>
        <h2 className="text-2xl">Backups</h2>
        <p className="mt-2 text-sm text-mist">A local backup is written automatically before a database upgrade. Export one whenever you want a copy you can move by hand.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={exportBackup}>Export local backup</Button>
          <label className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-surface-2 px-4 text-sm">
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
          <p><strong className="text-ivory">Offline.</strong> The board, the openings, and the endgames work with no network. Sign-in is only for keeping a cloud copy of your progress.</p>
        </div>
      </Panel>
    </div>
  );
}
