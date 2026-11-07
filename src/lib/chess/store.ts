import { create } from "zustand";
import { ENDGAMES } from "@/lib/data/endgames";
import { OPENINGS } from "@/lib/data/openings";
import { readCloudSnapshot, writeCloudSnapshot } from "./cloud-sync";
import { DEFAULT_CAROUSEL, catalogLines } from "./courses";
import { loadSnapshot, saveSnapshot, type LocalSnapshot } from "./db";
import { logDiag } from "./diag";
import {
  authReady,
  onAuthChange,
  registerWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutCloud as cloudSignOut,
} from "./firebase";
import { REPLAY_TARGET, applyGrade, blankReview, nextStreak, reviewId } from "./srs";
import { mergeEnvelopes } from "./sync-merge";
import { APP_THEME_LABELS, PIECE_SET_LABELS } from "./types";
import type {
  EndgameAttempt,
  EndgamePos,
  FavoriteSet,
  Grade,
  NavId,
  OpeningLine,
  Prefs,
  Profile,
  Repertoire,
  Review,
  SavedGame,
  Settings,
  Side,
  SyncEnvelope,
  SyncQueueItem,
  SyncState,
  TagSet,
} from "./types";

const WHITE_STARTERS = [
  "Italian Game",
  "Ruy Lopez",
  "Scotch Game",
  "Queen's Gambit",
  "London System",
  "English Opening",
  "Catalan Opening",
  "Vienna Game",
  "King's Indian Attack",
];
const BLACK_STARTERS = [
  "Sicilian Najdorf",
  "French Defense",
  "Caro-Kann Defense",
  "Berlin Defense",
  "King's Indian Defense",
  "Slav Defense",
  "Queen's Gambit Declined",
  "Nimzo-Indian Defense",
  "Grunfeld Defense",
];

export function defaultSettings(now = Date.now()): Settings {
  return {
    id: "main",
    updatedAt: now,
    coordinates: true,
    sound: true,
    boardTheme: "theme",
    appTheme: "brass",
    playStrength: 2000,
    endgameMaximum: true,
    playThinkMs: 900,
    endgameThinkMs: 1600,
    analysisDepth: 14,
    pieceSet: "standard",
  };
}

function defaultProfile(now = Date.now()): Profile {
  return {
    id: "main",
    name: "Player",
    deviceId: crypto.randomUUID(),
    createdAt: now,
    streak: 0,
    bestStreak: 0,
    lastSuccessDay: null,
    updatedAt: now,
  };
}

function defaultSync(now = Date.now()): SyncState {
  return {
    id: "main",
    status: typeof navigator !== "undefined" && navigator.onLine ? "signed-out" : "offline",
    lastSyncedAt: null,
    lastError: "",
    notes: [],
    dirty: false,
    updatedAt: now,
  };
}

function starterRepertoire(now = Date.now()): Repertoire {
  const ids = (names: string[]) => OPENINGS.filter((line) => names.includes(line.name)).map((line) => line.id);
  return { id: "main", w: ids(WHITE_STARTERS), b: ids(BLACK_STARTERS), seeded: true, updatedAt: now };
}

export type OeState = {
  booted: boolean;
  bootError: string;
  nav: NavId;
  profile: Profile;
  settings: Settings;
  games: SavedGame[];
  openings: OpeningLine[];
  reviews: Review[];
  endgames: EndgamePos[];
  attempts: EndgameAttempt[];
  repertoire: Repertoire;
  favorites: FavoriteSet;
  extraTags: TagSet;
  sync: SyncState;
  queue: SyncQueueItem[];
  /** Firebase keeps its own session; only the uid is mirrored here for the UI. */
  cloudUid: string;
  launch: { startFen: string; sans: string[]; player: Side } | null;
  setNav: (nav: NavId) => void;
  setLaunch: (launch: { startFen: string; sans: string[]; player: Side } | null) => void;
  patchSettings: (patch: Partial<Settings>) => void;
  patchPrefs: (patch: Partial<Prefs>) => void;
  setProfileName: (name: string) => void;
  saveGame: (game: SavedGame) => void;
  deleteGame: (id: string) => void;
  saveOpening: (line: OpeningLine) => void;
  deleteOpening: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setExtraTags: (id: string, tags: string[]) => void;
  setRepertoire: (side: Side, ids: string[]) => void;
  setCarousel: (side: Side, ids: string[]) => void;
  gradeLine: (lineId: string, side: Side, grade: Grade, elapsedMs: number) => void;
  recordReplayAttempt: (lineId: string, side: Side, perfect: boolean, grade: Grade, elapsedMs: number) => { logged: boolean; runsToGo: number };
  breakStreak: (lineId: string, side: Side) => void;
  saveAttempt: (attempt: EndgameAttempt) => void;
  saveEndgame: (pos: EndgamePos) => void;
  deleteEndgame: (id: string) => void;
  noteSuccess: () => void;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string, register: boolean) => Promise<void>;
  signOutCloud: () => Promise<void>;
  syncNow: () => Promise<void>;
  restoreCloud: () => Promise<void>;
  importEnvelope: (raw: unknown, mode: "merge" | "replace") => string;
  dismissNotes: () => void;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistChain: Promise<void> = Promise.resolve();

function envelopeOf(state: OeState): SyncEnvelope {
  return {
    version: 1,
    deviceId: state.profile.deviceId,
    exportedAt: Date.now(),
    profile: state.profile,
    settings: state.settings,
    games: state.games,
    openings: state.openings,
    reviews: state.reviews,
    endgames: state.endgames,
    attempts: state.attempts,
    repertoire: state.repertoire,
    favorites: state.favorites,
    extraTags: state.extraTags,
    queue: state.queue,
  };
}

function snapshotOf(state: OeState): LocalSnapshot {
  return {
    profile: state.profile,
    settings: state.settings,
    games: state.games,
    openings: state.openings,
    reviews: state.reviews,
    endgames: state.endgames,
    attempts: state.attempts,
    sync: state.sync,
    queue: state.queue,
    favorites: state.favorites,
    extraTags: state.extraTags,
    repertoire: state.repertoire,
  };
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const state = useOe.getState();
    persistChain = persistChain
      .then(() => saveSnapshot(snapshotOf(state)))
      .catch((error) => {
        logDiag("error", error instanceof Error ? error.message : "Could not save locally");
      });
  }, 180);
}

function touchSync(state: OeState, kind: string, summary: string): Pick<OeState, "queue" | "sync"> {
  const item: SyncQueueItem = { id: crypto.randomUUID(), at: Date.now(), kind, summary };
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  let status = state.sync.status;
  if (offline) status = "offline";
  else if (status === "up-to-date") status = state.cloudUid ? "signed-in" : "signed-out";
  return {
    queue: [...state.queue, item].slice(-200),
    sync: { ...state.sync, status, dirty: true, updatedAt: Date.now(), lastError: offline ? state.sync.lastError : "" },
  };
}

function isEnvelope(value: unknown): value is SyncEnvelope {
  if (!value || typeof value !== "object") return false;
  const row = value as SyncEnvelope;
  return row.version === 1 && Array.isArray(row.games) && Array.isArray(row.openings) && !!row.profile;
}

function applySnapshot(base: OeState, env: SyncEnvelope): Partial<OeState> {
  return {
    profile: { ...env.profile, deviceId: base.profile.deviceId },
    settings: env.settings,
    games: env.games,
    openings: env.openings,
    reviews: env.reviews,
    endgames: env.endgames,
    attempts: env.attempts,
    repertoire: env.repertoire,
    favorites: env.favorites,
    extraTags: env.extraTags,
    queue: env.queue,
  };
}

/** A signed-in account mirrors its uid here; Firebase holds the session itself. */
function authSettled(state: OeState, user: { uid: string } | null): Pick<OeState, "cloudUid" | "sync"> {
  return {
    cloudUid: user?.uid ?? "",
    sync: { ...state.sync, status: user ? "signed-in" : "signed-out", lastError: "", updatedAt: Date.now() },
  };
}

function authFailed(state: OeState, message: string): Pick<OeState, "sync"> {
  logDiag("error", message);
  return { sync: { ...state.sync, status: "error", lastError: message, updatedAt: Date.now() } };
}

const now = Date.now();

export const useOe = create<OeState>((set, get) => ({
  booted: false,
  bootError: "",
  nav: "play",
  profile: defaultProfile(now),
  settings: defaultSettings(now),
  games: [],
  openings: [],
  reviews: [],
  endgames: [],
  attempts: [],
  repertoire: starterRepertoire(now),
  favorites: { id: "main", ids: [], updatedAt: now },
  extraTags: { id: "main", map: {}, updatedAt: now },
  sync: defaultSync(now),
  queue: [],
  cloudUid: "",
  launch: null,
  setNav: (nav) => set({ nav }),
  setLaunch: (launch) => set({ launch, nav: launch ? "play" : get().nav }),
  patchSettings: (patch) => {
    const state = get();
    const settings = { ...state.settings, ...patch, updatedAt: Date.now() };
    set({ settings, ...touchSync({ ...state, settings }, "settings", "Settings updated") });
    schedulePersist();
  },
  patchPrefs: (patch) => {
    get().patchSettings({ prefs: { ...get().settings.prefs, ...patch } });
  },
  setProfileName: (name) => {
    const state = get();
    const profile = { ...state.profile, name: name.trim() || "Player", updatedAt: Date.now() };
    set({ profile, ...touchSync(state, "profile", "Profile renamed") });
    schedulePersist();
  },
  saveGame: (game) => {
    const state = get();
    const games = [game, ...state.games.filter((row) => row.id !== game.id)];
    set({ games, ...touchSync(state, "game", `Saved ${game.event || "game"}`) });
    schedulePersist();
  },
  deleteGame: (id) => {
    const state = get();
    const games = state.games.map((row) => (row.id === id ? { ...row, deleted: true, updatedAt: Date.now() } : row));
    set({ games, ...touchSync(state, "game", "Deleted a saved game") });
    schedulePersist();
  },
  saveOpening: (line) => {
    const state = get();
    const openings = [line, ...state.openings.filter((row) => row.id !== line.id)];
    set({ openings, ...touchSync(state, "opening", line.name) });
    schedulePersist();
  },
  deleteOpening: (id) => {
    const state = get();
    const openings = state.openings.map((row) => (row.id === id ? { ...row, deleted: true, updatedAt: Date.now() } : row));
    set({ openings, ...touchSync(state, "opening", "Deleted a custom opening") });
    schedulePersist();
  },
  toggleFavorite: (id) => {
    const state = get();
    const has = state.favorites.ids.includes(id);
    const favorites: FavoriteSet = {
      id: "main",
      ids: has ? state.favorites.ids.filter((row) => row !== id) : [...state.favorites.ids, id],
      updatedAt: Date.now(),
    };
    set({ favorites, ...touchSync(state, "favorite", has ? "Removed a favorite" : "Added a favorite") });
    schedulePersist();
  },
  setExtraTags: (id, tags) => {
    const state = get();
    const extraTags: TagSet = {
      id: "main",
      map: { ...state.extraTags.map, [id]: tags },
      updatedAt: Date.now(),
    };
    set({ extraTags, ...touchSync(state, "tags", "Updated tags") });
    schedulePersist();
  },
  setRepertoire: (side, ids) => {
    const state = get();
    const repertoire = { ...state.repertoire, [side]: ids, updatedAt: Date.now() };
    set({ repertoire, ...touchSync(state, "repertoire", `Updated ${side === "w" ? "White" : "Black"} repertoire`) });
    schedulePersist();
  },
  setCarousel: (side, ids) => {
    const state = get();
    const carousel = {
      w: state.repertoire.carousel?.w ?? DEFAULT_CAROUSEL.w,
      b: state.repertoire.carousel?.b ?? DEFAULT_CAROUSEL.b,
      [side]: ids,
    };
    const repertoire = { ...state.repertoire, carousel, updatedAt: Date.now() };
    set({ repertoire, ...touchSync(state, "repertoire", `Updated the ${side === "w" ? "White" : "Black"} shelf`) });
    schedulePersist();
  },
  gradeLine: (lineId, side, grade, elapsedMs) => {
    const state = get();
    const current = state.reviews.find((row) => row.id === reviewId(lineId, side)) ?? blankReview(lineId, side, Date.now());
    const next = applyGrade(current, grade, Date.now(), elapsedMs);
    const reviews = [next, ...state.reviews.filter((row) => row.id !== next.id)];
    set({ reviews, ...touchSync(state, "review", `Graded a line (${grade})`) });
    schedulePersist();
  },
  recordReplayAttempt: (lineId, side, perfect, grade, elapsedMs) => {
    const state = get();
    const current = state.reviews.find((row) => row.id === reviewId(lineId, side));
    const now = Date.now();
    if (!perfect) {
      if (current && (current.perfectStreak ?? 0) > 0) {
        const reviews = [{ ...current, perfectStreak: 0, updatedAt: now }, ...state.reviews.filter((row) => row.id !== current.id)];
        set({ reviews, ...touchSync(state, "review", "Streak reset") });
        schedulePersist();
      }
      return { logged: false, runsToGo: REPLAY_TARGET };
    }
    const streak = nextStreak(current?.perfectStreak ?? 0, true);
    if (streak < REPLAY_TARGET) {
      const base = current ?? blankReview(lineId, side, now);
      const reviews = [{ ...base, perfectStreak: streak, updatedAt: now }, ...state.reviews.filter((row) => row.id !== base.id)];
      set({ reviews, ...touchSync(state, "review", "Clean replay") });
      schedulePersist();
      return { logged: false, runsToGo: REPLAY_TARGET - streak };
    }
    // Third consecutive clean run: this is the only path that touches SM-2.
    const base = current ?? blankReview(lineId, side, now);
    const next = { ...applyGrade(base, grade, now, elapsedMs), perfectStreak: 0 };
    const reviews = [next, ...state.reviews.filter((row) => row.id !== next.id)];
    set({ reviews, ...touchSync(state, "review", `Banked a line (${grade})`) });
    schedulePersist();
    return { logged: true, runsToGo: 0 };
  },
  breakStreak: (lineId, side) => {
    const state = get();
    const current = state.reviews.find((row) => row.id === reviewId(lineId, side));
    if (!current || !(current.perfectStreak ?? 0)) return;
    const reviews = [{ ...current, perfectStreak: 0, updatedAt: Date.now() }, ...state.reviews.filter((row) => row.id !== current.id)];
    set({ reviews, ...touchSync(state, "review", "Streak reset") });
    schedulePersist();
  },
  saveAttempt: (attempt) => {
    const state = get();
    const attempts = [attempt, ...state.attempts.filter((row) => row.id !== attempt.id)];
    set({ attempts, ...touchSync(state, "attempt", "Endgame attempt") });
    schedulePersist();
  },
  saveEndgame: (pos) => {
    const state = get();
    const endgames = [pos, ...state.endgames.filter((row) => row.id !== pos.id)];
    set({ endgames, ...touchSync(state, "endgame", pos.title) });
    schedulePersist();
  },
  deleteEndgame: (id) => {
    const state = get();
    const endgames = state.endgames.map((row) => (row.id === id ? { ...row, deleted: true, updatedAt: Date.now() } : row));
    set({ endgames, ...touchSync(state, "endgame", "Deleted a custom position") });
    schedulePersist();
  },
  noteSuccess: () => {
    const state = get();
    const day = new Date().toISOString().slice(0, 10);
    if (state.profile.lastSuccessDay === day) return;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const streak = state.profile.lastSuccessDay === yesterday ? state.profile.streak + 1 : 1;
    const profile = {
      ...state.profile,
      streak,
      bestStreak: Math.max(state.profile.bestStreak, streak),
      lastSuccessDay: day,
      updatedAt: Date.now(),
    };
    set({ profile, ...touchSync(state, "profile", "Training streak") });
    schedulePersist();
  },
  signInGoogle: async () => {
    const state = get();
    if (!navigator.onLine) {
      set({ sync: { ...state.sync, status: "offline", updatedAt: Date.now() } });
      return;
    }
    set({ sync: { ...state.sync, status: "syncing", lastError: "", updatedAt: Date.now() } });
    try {
      set(authSettled(get(), await signInWithGoogle()));
      schedulePersist();
    } catch (error) {
      set(authFailed(get(), error instanceof Error ? error.message : "Cloud sign-in failed."));
    }
  },
  signInEmail: async (email, password, register) => {
    const state = get();
    if (!email.trim() || !password) {
      set(authFailed(state, "Enter an email and a password."));
      return;
    }
    if (!navigator.onLine) {
      set({ sync: { ...state.sync, status: "offline", updatedAt: Date.now() } });
      return;
    }
    set({ sync: { ...state.sync, status: "syncing", lastError: "", updatedAt: Date.now() } });
    try {
      const user = register ? await registerWithEmail(email, password) : await signInWithEmail(email, password);
      set(authSettled(get(), user));
      schedulePersist();
      logDiag("info", register ? "Cloud account created" : "Signed in to the cloud");
    } catch (error) {
      set(authFailed(get(), error instanceof Error ? error.message : "Cloud sign-in failed."));
    }
  },
  signOutCloud: async () => {
    await cloudSignOut().catch(() => undefined);
    set(authSettled(get(), null));
    schedulePersist();
  },
  syncNow: async () => {
    const state = get();
    if (!navigator.onLine) {
      set({ sync: { ...state.sync, status: "offline", updatedAt: Date.now() } });
      return;
    }
    const uid = state.cloudUid || (await authReady())?.uid || "";
    if (!uid) {
      set({
        sync: {
          ...state.sync,
          status: "signed-out",
          lastError: "Sign in before syncing.",
          updatedAt: Date.now(),
        },
      });
      return;
    }
    set({ sync: { ...state.sync, status: "syncing", lastError: "", updatedAt: Date.now() } });
    try {
      const remoteRaw = await readCloudSnapshot(uid);
      let merged = envelopeOf(get());
      let notes: string[] = [];
      let hadConflict = false;
      if (remoteRaw !== null) {
        if (!isEnvelope(remoteRaw)) throw new Error("The cloud copy is not an OE Chess sync manifest.");
        const result = mergeEnvelopes(envelopeOf(get()), remoteRaw);
        merged = result.merged;
        notes = result.notes;
        hadConflict = result.hadConflict;
      }
      merged.exportedAt = Date.now();
      await writeCloudSnapshot(uid, merged);
      set({
        ...applySnapshot(get(), merged),
        sync: {
          ...get().sync,
          status: hadConflict ? "conflict" : "up-to-date",
          lastSyncedAt: Date.now(),
          lastError: "",
          notes,
          dirty: false,
          updatedAt: Date.now(),
        },
      });
      schedulePersist();
      logDiag("info", hadConflict ? "Synced with conflicts resolved" : "Sync up to date");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      logDiag("error", message);
      set({ sync: { ...get().sync, status: "error", lastError: message, updatedAt: Date.now() } });
    }
  },
  restoreCloud: async () => {
    const state = get();
    const uid = state.cloudUid || (await authReady())?.uid || "";
    if (!uid) {
      set({ sync: { ...state.sync, status: "signed-out", lastError: "Sign in before restoring.", updatedAt: Date.now() } });
      return;
    }
    set({ sync: { ...state.sync, status: "syncing", updatedAt: Date.now() } });
    try {
      const remoteRaw = await readCloudSnapshot(uid);
      if (remoteRaw === null) throw new Error("No cloud copy for this account yet.");
      if (!isEnvelope(remoteRaw)) throw new Error("The cloud copy is not an OE Chess sync manifest.");
      const backup = envelopeOf(get());
      downloadText(JSON.stringify(backup, null, 2), "oe-chess-backup-before-restore.json");
      set({
        ...applySnapshot(get(), remoteRaw),
        sync: {
          ...get().sync,
          status: "up-to-date",
          lastSyncedAt: Date.now(),
          lastError: "",
          notes: ["Restored the cloud copy. A local backup was downloaded first."],
          dirty: false,
          updatedAt: Date.now(),
        },
      });
      schedulePersist();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Restore failed";
      set({ sync: { ...get().sync, status: "error", lastError: message, updatedAt: Date.now() } });
    }
  },
  importEnvelope: (raw, mode) => {
    if (!isEnvelope(raw)) return "That file is not an OE Chess backup.";
    const state = get();
    if (mode === "replace") {
      set({
        ...applySnapshot(state, raw),
        sync: { ...state.sync, dirty: true, notes: ["Imported a backup over this device."], status: state.cloudUid ? "signed-in" : state.sync.status, updatedAt: Date.now() },
      });
    } else {
      const result = mergeEnvelopes(envelopeOf(state), raw);
      set({
        ...applySnapshot(state, result.merged),
        sync: {
          ...state.sync,
          dirty: true,
          notes: result.notes.length ? result.notes : ["Merged the backup into this device."],
          status: result.hadConflict ? "conflict" : state.cloudUid ? "signed-in" : state.sync.status,
          updatedAt: Date.now(),
        },
      });
    }
    schedulePersist();
    return "";
  },
  dismissNotes: () => {
    const state = get();
    set({
      sync: {
        ...state.sync,
        notes: [],
        status: state.sync.status === "conflict" ? (state.cloudUid ? "up-to-date" : "signed-out") : state.sync.status,
      },
    });
    schedulePersist();
  },
}));

export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportBackup() {
  downloadText(JSON.stringify(envelopeOf(useOe.getState()), null, 2), `oe-chess-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

let bootPromise: Promise<void> | null = null;

export function bootStore(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      try {
        const snap = await loadSnapshot();
        const base = useOe.getState();
        const loaded = snap.settings ?? base.settings;
        useOe.setState({
          booted: true,
          profile: snap.profile ?? base.profile,
          settings: {
            ...base.settings,
            ...loaded,
            // Old snapshots can still name sets that no longer ship.
            pieceSet: loaded.pieceSet && loaded.pieceSet in PIECE_SET_LABELS ? loaded.pieceSet : "standard",
            appTheme: loaded.appTheme && loaded.appTheme in APP_THEME_LABELS ? loaded.appTheme : "brass",
          },
          games: snap.games.length ? snap.games : base.games,
          openings: snap.openings,
          reviews: snap.reviews,
          endgames: snap.endgames,
          attempts: snap.attempts,
          repertoire: snap.repertoire?.seeded ? snap.repertoire : base.repertoire,
          favorites: snap.favorites ?? base.favorites,
          extraTags: snap.extraTags ?? base.extraTags,
          sync: snap.sync
            ? { ...snap.sync, status: navigator.onLine ? (snap.sync.status === "syncing" ? "signed-out" : snap.sync.status) : "offline" }
            : { ...base.sync, status: navigator.onLine ? "signed-out" : "offline" },
          queue: snap.queue,
        });
        if (!snap.profile) schedulePersist();
        logDiag("info", "Local database ready");
        // The first callback reports the session Firebase already restored, so a reload
        // returns to the same signed-in state without another popup.
        onAuthChange((user) => {
          const state = useOe.getState();
          useOe.setState({
            cloudUid: user?.uid ?? "",
            sync: { ...state.sync, status: user && state.sync.status === "signed-out" ? "signed-in" : state.sync.status },
          });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not open the local database";
        logDiag("error", message);
        useOe.setState({ booted: true, bootError: message });
      }
    })();
  }
  return bootPromise;
}

export function allOpenings(custom: OpeningLine[]): OpeningLine[] {
  const seen = new Set<string>();
  const rows = [...custom.filter((line) => !line.deleted), ...catalogLines()];
  return rows.filter((line) => {
    if (seen.has(line.id)) return false;
    seen.add(line.id);
    return true;
  });
}

export function allEndgames(custom: EndgamePos[]): EndgamePos[] {
  return [...custom.filter((row) => !row.deleted), ...ENDGAMES];
}

export { ENDGAMES, OPENINGS };
