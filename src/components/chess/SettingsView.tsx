import { useState } from "react";
import { readDiag } from "@/lib/chess/diag";
import { exportBackup, useOe } from "@/lib/chess/store";
import { APP_THEME_LABELS, PIECE_SET_LABELS } from "@/lib/chess/types";
import type { AppTheme, BoardTheme, PieceSet } from "@/lib/chess/types";
import { PieceGlyph } from "./pieces";
import { Button, Panel, Pill } from "./ui";

const ELO_FLOOR = 1320;
const ELO_CEILING = 3190;
/** The backdrop rides inside the settings row, which the 1 MB cloud document also carries. */
const ART_MAX_EDGE = 1600;
const ART_CHAR_BUDGET = 200_000;

/** The board either follows the app theme or keeps one of the three fixed woods. */
const BOARD_LABELS: Record<BoardTheme, string> = {
  theme: "Match theme",
  walnut: "Walnut",
  ink: "Ink",
  stone: "Stone",
};

const APP_THEME_HINTS: Record<AppTheme, string> = {
  brass: "Warm near-black with brass.",
  print: "Ivory paper, hairline rules, ink text.",
  graphite: "Cool graphite studio with a lime accent.",
  atelier: "Aubergine and champagne, generous corners.",
  cyber: "Near-black blue, cyan signal, amber second accent.",
  glass: "Default: translucent panels over a cool backdrop.",
};

function strengthWord(elo: number) {
  if (elo < 1500) return "learning the ropes";
  if (elo < 1800) return "club player";
  if (elo < 2100) return "strong club";
  if (elo < 2400) return "expert";
  return "near master";
}

/**
 * Downscales and re-encodes until the data URL fits the byte budget, so a phone
 * photo cannot push the cloud snapshot past Firestore's document limit.
 */
async function toBackdropDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  let edge = Math.min(ART_MAX_EDGE, longest);
  let quality = 0.82;
  let url = "";
  for (let pass = 0; pass < 8; pass++) {
    const ratio = edge / longest;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("This browser could not read that image.");
    }
    // JPEG has no alpha: a transparent PNG would otherwise come out black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= ART_CHAR_BUDGET) break;
    if (quality > 0.52) quality -= 0.14;
    else edge = Math.round(edge * 0.78);
  }
  bitmap.close();
  return url;
}

const SECTIONS = [
  { id: "board", label: "Board" },
  { id: "appearance", label: "Appearance" },
  { id: "engine", label: "Engine" },
  { id: "backups", label: "Backups" },
] as const;

type SettingsSection = (typeof SECTIONS)[number]["id"];

export function SettingsView() {
  const [section, setSection] = useState<SettingsSection>("board");
  const settings = useOe((s) => s.settings);
  const patchSettings = useOe((s) => s.patchSettings);
  const importEnvelope = useOe((s) => s.importEnvelope);
  const [importNote, setImportNote] = useState("");
  const [artBusy, setArtBusy] = useState(false);
  const [artNote, setArtNote] = useState("");
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

  async function onBackdrop(file: File) {
    if (!file.type.startsWith("image/")) {
      setArtNote("That file is not an image.");
      return;
    }
    setArtBusy(true);
    setArtNote("");
    try {
      patchSettings({ shellArt: await toBackdropDataUrl(file) });
    } catch {
      setArtNote("Could not read that image. Try a JPEG or PNG.");
    } finally {
      setArtBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h2 className="text-3xl">Settings</h2>
        <p className="mt-1 text-sm text-mist">
          Choose one area to adjust your board, appearance, engine, or backups.
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-2 md:grid-cols-4 lg:sticky lg:top-0 lg:flex lg:flex-col"
        >
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={section === item.id}
              onClick={() => setSection(item.id)}
              className={`h-10 rounded-lg px-3 text-sm transition ${section === item.id ? "bg-brass text-on-accent" : "text-mist hover:bg-surface-2 hover:text-ivory"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {section === "board" && (
            <Panel>
              <h2 className="text-2xl">Board</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {(Object.entries(BOARD_LABELS) as Array<[BoardTheme, string]>).map(
                  ([theme, label]) => (
                    <Button
                      key={theme}
                      variant={settings.boardTheme === theme ? "primary" : "quiet"}
                      onClick={() => patchSettings({ boardTheme: theme })}
                    >
                      {label}
                    </Button>
                  ),
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(Object.entries(PIECE_SET_LABELS) as Array<[PieceSet, string]>).map(
                  ([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => patchSettings({ pieceSet: id })}
                      aria-pressed={
                        settings.pieceSet === id || (!settings.pieceSet && id === "standard")
                      }
                      className={`rounded-xl border p-3 text-left ${settings.pieceSet === id || (!settings.pieceSet && id === "standard") ? "border-brass" : "border-line"}`}
                    >
                      <span className="text-sm">{label}</span>
                      <span className="mt-2 flex h-16 gap-1">
                        {["k", "q", "n", "p"].map((type) => (
                          <PieceGlyph
                            key={type}
                            type={type}
                            color="w"
                            set={id}
                            className="h-16 w-12 object-contain"
                          />
                        ))}
                      </span>
                    </button>
                  ),
                )}
              </div>
              <p className="mt-3 text-xs text-mist">
                All five sets come from Lichess. Merida and Standard are GPL; Alpha, Staunty and
                Maestro are non-commercial. Each folder keeps its own licence note.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant={settings.coordinates ? "primary" : "quiet"}
                  onClick={() => patchSettings({ coordinates: !settings.coordinates })}
                >
                  Coordinates
                </Button>
                <Button
                  variant={settings.sound ? "primary" : "quiet"}
                  onClick={() => patchSettings({ sound: !settings.sound })}
                >
                  Sound
                </Button>
                <Button
                  variant={(settings.animations ?? true) ? "primary" : "quiet"}
                  onClick={() => patchSettings({ animations: !(settings.animations ?? true) })}
                >
                  Animations
                </Button>
              </div>
            </Panel>
          )}
          {section === "appearance" && (
            <Panel>
              <h2 className="text-2xl">Appearance</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(Object.entries(APP_THEME_LABELS) as Array<[AppTheme, string]>).map(
                  ([id, label]) => {
                    const active = (settings.appTheme ?? "glass") === id;
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
                        <span
                          className="mt-2 flex h-12 gap-1 overflow-hidden rounded-md border border-line"
                          data-app-theme={id}
                          aria-hidden="true"
                        >
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
                  },
                )}
              </div>
              <p className="mt-3 text-xs text-mist">
                Each theme repaints the app and the splash. Choose Match theme for the board and the
                squares follow too.
              </p>
              <div className="mt-4 border-t border-line pt-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm">Background image</h3>
                  <span className="text-xs text-mist">
                    {settings.shellArt ? "Your image" : "None"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-mist">
                  One upload sits behind all six themes, veiled in each theme&apos;s own colour so
                  panels and text stay readable. It travels with your settings when you sync.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span
                    className="h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2"
                    aria-hidden="true"
                  >
                    {settings.shellArt ? (
                      <img src={settings.shellArt} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] text-mist">
                        No image
                      </span>
                    )}
                  </span>
                  <label
                    className={`inline-flex h-11 items-center rounded-lg border border-line bg-surface-2 px-4 text-sm ${artBusy ? "opacity-60" : "cursor-pointer"}`}
                  >
                    {artBusy ? "Reading…" : settings.shellArt ? "Replace image" : "Upload image"}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      disabled={artBusy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void onBackdrop(file);
                      }}
                    />
                  </label>
                  {settings.shellArt && (
                    <Button
                      variant="quiet"
                      onClick={() => {
                        patchSettings({ shellArt: undefined });
                        setArtNote("");
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                {artNote && <p className="mt-2 text-xs text-danger">{artNote}</p>}
                <div className="mt-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-mist">Background strength</span>
                    <span className="text-sm tabular-nums">{settings.shellArtStrength ?? 38}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.shellArtStrength ?? 38}
                    disabled={!settings.shellArt}
                    aria-label="Background image strength"
                    className="mt-2 w-full accent-brass disabled:opacity-40"
                    onChange={(event) =>
                      patchSettings({ shellArtStrength: Number(event.target.value) })
                    }
                  />
                  <div className="mt-1 flex justify-between text-xs text-mist">
                    <span>Theme colour</span>
                    <span>Full image</span>
                  </div>
                </div>
              </div>
            </Panel>
          )}
          {section === "engine" && (
            <Panel>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-2xl">Engine</h2>
                <Pill tone={atFullStrength ? "brass" : "mist"}>
                  {atFullStrength ? "Maximum" : strengthWord(sliderValue)}
                </Pill>
              </div>
              <p className="mt-2 text-sm text-mist">
                Stockfish's rating scale starts around {ELO_FLOOR} and the top of the slider runs it
                uncut. Endgames use maximum strength unless you turn that off.
              </p>
              <div className="mt-3 grid gap-3">
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-mist">Play strength</span>
                    <span className="text-sm tabular-nums">
                      {atFullStrength ? "Maximum" : `${sliderValue} Elo`}
                    </span>
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
                  <Button
                    variant={settings.endgameMaximum ? "primary" : "quiet"}
                    onClick={() => patchSettings({ endgameMaximum: !settings.endgameMaximum })}
                  >
                    {settings.endgameMaximum
                      ? "Endgames at full strength"
                      : "Endgames use play strength"}
                  </Button>
                </div>
              </div>
            </Panel>
          )}
          {section === "backups" && (
            <Panel>
              <h2 className="text-2xl">Backups</h2>
              <p className="mt-2 text-sm text-mist">
                A local backup is written automatically before a database upgrade. Export one
                whenever you want a copy you can move by hand.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={exportBackup}>Export local backup</Button>
                <label className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-surface-2 px-4 text-sm">
                  Merge a backup
                  <input
                    className="sr-only"
                    type="file"
                    accept="application/json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void onBackup(file);
                    }}
                  />
                </label>
                <Button
                  variant="quiet"
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify({ at: new Date().toISOString(), log: readDiag() }, null, 2)],
                      { type: "application/json" },
                    );
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
          )}
        </div>
      </div>
    </div>
  );
}
