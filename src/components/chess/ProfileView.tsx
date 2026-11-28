import { useState } from "react";
import { assetUrl } from "@/lib/chess/asset-url";
import { useOe } from "@/lib/chess/store";
import type { SyncStatus } from "@/lib/chess/types";
import { LibraryView } from "./LibraryView";
import { StatsView } from "./StatsView";
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

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "stats", label: "Stats" },
  { id: "games", label: "Game history" },
  { id: "sync", label: "Sync" },
] as const;

type ProfileSection = (typeof SECTIONS)[number]["id"];

async function toSquareDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  return canvas.toDataURL("image/png");
}

export function ProfileView() {
  const prefs = useOe((s) => s.settings.prefs);
  const patchPrefs = useOe((s) => s.patchPrefs);
  const [section, setSection] = useState<ProfileSection>(prefs?.profileSection ?? "profile");
  const profile = useOe((s) => s.profile);
  const sync = useOe((s) => s.sync);
  const setProfileName = useOe((s) => s.setProfileName);
  const setProfileAvatar = useOe((s) => s.setProfileAvatar);
  const signInGoogle = useOe((s) => s.signInGoogle);
  const signInEmail = useOe((s) => s.signInEmail);
  const signOutCloud = useOe((s) => s.signOutCloud);
  const syncNow = useOe((s) => s.syncNow);
  const restoreCloud = useOe((s) => s.restoreCloud);
  const dismissNotes = useOe((s) => s.dismissNotes);
  const cloudUid = useOe((s) => s.cloudUid);
  const cloudEmail = useOe((s) => s.cloudEmail);
  const [avatarNote, setAvatarNote] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onAvatar(file: File) {
    if (!file.type.startsWith("image/")) {
      setAvatarNote("That file is not an image.");
      return;
    }
    try {
      setProfileAvatar(await toSquareDataUrl(file));
      setAvatarNote("");
    } catch {
      setAvatarNote("Could not read that image.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h2 className="text-3xl">Profile</h2>
        <p className="mt-1 text-sm text-mist">
          Your player details, training statistics, game history, and optional cloud sync.
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <nav
          aria-label="Profile sections"
          className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-2 sm:grid-cols-4 lg:sticky lg:top-0 lg:flex lg:flex-col"
        >
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={section === item.id}
              onClick={() => {
                setSection(item.id);
                patchPrefs({ profileSection: item.id });
              }}
              className={`h-10 rounded-lg px-3 text-sm transition ${section === item.id ? "bg-brass text-on-accent" : "text-mist hover:bg-surface-2 hover:text-ivory"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {section === "profile" && (
            <Panel>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-2xl">Player details</h3>
                <Pill tone="brass">{profile.deviceId.slice(0, 8)}</Pill>
              </div>
              <p className="mt-2 text-sm text-mist">
                Your name travels with the progress you back up or sync. The code in the corner
                marks this device and stays on it.
              </p>
              <div className="mt-4 grid gap-3">
                <Field label="Name">
                  <TextInput
                    value={profile.name}
                    onChange={(event) => setProfileName(event.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                  <img
                    src={profile.avatar || assetUrl("/player-avatar.webp")}
                    alt="Your avatar"
                    className="h-14 w-14 rounded-full border border-line bg-surface object-cover"
                  />
                  <label className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-surface-2 px-4 text-sm">
                    Upload an image
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void onAvatar(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {profile.avatar && (
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setProfileAvatar(null);
                        setAvatarNote("");
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                {avatarNote && <p className="text-sm text-danger">{avatarNote}</p>}
              </div>
            </Panel>
          )}
          {section === "stats" && <StatsView />}
          {section === "games" && <LibraryView />}
          {section === "sync" && (
            <Panel>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-2xl">Cloud sync</h3>
                <Pill
                  tone={
                    sync.status === "error" || sync.status === "conflict"
                      ? "danger"
                      : sync.status === "up-to-date"
                        ? "ok"
                        : "brass"
                  }
                >
                  {STATUS[sync.status]}
                </Pill>
              </div>
              <p className="mt-2 text-sm text-mist">
                Progress is stored on this device first. Cloud sync is optional and keeps one copy
                per account, so two devices meet in the middle when you sync. Nothing is sent to an
                OE Chess server.
              </p>
              <div className="mt-4 grid gap-3">
                {cloudUid ? (
                  <div className="grid gap-2">
                    <p className="text-sm text-ivory">
                      {cloudEmail ? (
                        <>
                          Signed in as <span className="font-medium">{cloudEmail}</span>
                        </>
                      ) : (
                        "Signed in, but this account has no email address."
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="quiet" onClick={() => void signOutCloud()}>
                        Sign out
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
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
                        <TextInput
                          type="email"
                          autoComplete="email"
                          value={email}
                          placeholder="you@example.com"
                          onChange={(event) => setEmail(event.target.value)}
                        />
                      </Field>
                      <Field label="Password">
                        <TextInput
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          placeholder="At least six characters"
                          onChange={(event) => setPassword(event.target.value)}
                        />
                      </Field>
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <Button variant="quiet" type="submit">
                          Sign in with email
                        </Button>
                        <Button
                          variant="quiet"
                          type="button"
                          onClick={() => {
                            void signInEmail(email, password, true);
                            setPassword("");
                          }}
                        >
                          Create account
                        </Button>
                      </div>
                    </form>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="quiet" onClick={() => void syncNow()}>
                    Sync now
                  </Button>
                  <Button variant="quiet" onClick={() => void restoreCloud()}>
                    Restore from cloud
                  </Button>
                </div>
                {sync.lastError && <p className="text-sm text-danger">{sync.lastError}</p>}
                {sync.notes.length > 0 && (
                  <div className="text-sm">
                    {sync.notes.map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                    <Button variant="ghost" onClick={dismissNotes}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
