import { logDiag } from "./diag";
import type {
  EndgameAttempt,
  EndgamePos,
  FavoriteSet,
  OpeningLine,
  Profile,
  Repertoire,
  Review,
  SavedGame,
  Settings,
  SyncQueueItem,
  SyncState,
  TagSet,
} from "./types";

export const DB_NAME = "oe-chess";
export const DB_VERSION = 1;

const STORES = [
  "profile",
  "settings",
  "games",
  "openings",
  "opening_reviews",
  "endgames",
  "endgame_attempts",
  "sync_state",
  "sync_queue",
  "favorites",
  "tags",
  "repertoire",
] as const;

export type LocalSnapshot = {
  profile: Profile | null;
  settings: Settings | null;
  games: SavedGame[];
  openings: OpeningLine[];
  reviews: Review[];
  endgames: EndgamePos[];
  attempts: EndgameAttempt[];
  sync: SyncState | null;
  queue: SyncQueueItem[];
  favorites: FavoriteSet | null;
  extraTags: TagSet | null;
  repertoire: Repertoire | null;
};

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function openUntyped(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dump(db: IDBDatabase): Promise<string> {
  const tx = db.transaction(
    STORES.filter((name) => db.objectStoreNames.contains(name)),
    "readonly",
  );
  const all: Record<string, unknown> = {};
  for (const name of STORES) {
    if (!db.objectStoreNames.contains(name)) continue;
    all[name] = await request(tx.objectStore(name).getAll());
  }
  await txDone(tx);
  return JSON.stringify({ backupAt: Date.now(), db: DB_NAME, all });
}

export async function openDatabase(): Promise<IDBDatabase> {
  const probe = await openUntyped();
  const current = probe.version;
  if (current < DB_VERSION) {
    try {
      const json = await dump(probe);
      localStorage.setItem(`oe-chess-premigration-${current}`, json);
      logDiag("info", `Saved a local backup before database upgrade from v${current}`);
    } catch (error) {
      logDiag("warn", `Could not back up before migration: ${error instanceof Error ? error.message : "unknown"}`);
    }
    probe.close();
    return openUntyped(DB_VERSION);
  }
  if (current > DB_VERSION) {
    probe.close();
    return openUntyped(DB_VERSION);
  }
  return probe;
}

async function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  if (!db.objectStoreNames.contains(store)) return [];
  const tx = db.transaction(store, "readonly");
  const rows = await request(tx.objectStore(store).getAll() as IDBRequest<T[]>);
  await txDone(tx);
  return rows;
}

export async function loadSnapshot(): Promise<LocalSnapshot> {
  const db = await openDatabase();
  const [profile, settings, games, openings, reviews, endgames, attempts, sync, queue, favorites, extraTags, repertoire] =
    await Promise.all([
      readAll<Profile>(db, "profile"),
      readAll<Settings>(db, "settings"),
      readAll<SavedGame>(db, "games"),
      readAll<OpeningLine>(db, "openings"),
      readAll<Review>(db, "opening_reviews"),
      readAll<EndgamePos>(db, "endgames"),
      readAll<EndgameAttempt>(db, "endgame_attempts"),
      readAll<SyncState>(db, "sync_state"),
      readAll<SyncQueueItem>(db, "sync_queue"),
      readAll<FavoriteSet>(db, "favorites"),
      readAll<TagSet>(db, "tags"),
      readAll<Repertoire>(db, "repertoire"),
    ]);
  db.close();
  return {
    profile: profile[0] ?? null,
    settings: settings[0] ?? null,
    games,
    openings,
    reviews,
    endgames,
    attempts,
    sync: sync[0] ?? null,
    queue,
    favorites: favorites[0] ?? null,
    extraTags: extraTags[0] ?? null,
    repertoire: repertoire[0] ?? null,
  };
}

export async function saveSnapshot(snapshot: LocalSnapshot): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([...STORES], "readwrite");
  const putAll = (store: string, rows: { id: string }[]) => {
    const objectStore = tx.objectStore(store);
    objectStore.clear();
    for (const row of rows) objectStore.put(row);
  };
  if (snapshot.profile) putAll("profile", [snapshot.profile]);
  else tx.objectStore("profile").clear();
  if (snapshot.settings) putAll("settings", [snapshot.settings]);
  if (snapshot.favorites) putAll("favorites", [snapshot.favorites]);
  if (snapshot.extraTags) putAll("tags", [snapshot.extraTags]);
  if (snapshot.repertoire) putAll("repertoire", [snapshot.repertoire]);
  if (snapshot.sync) putAll("sync_state", [snapshot.sync]);
  putAll("games", snapshot.games);
  putAll("openings", snapshot.openings);
  putAll("opening_reviews", snapshot.reviews);
  putAll("endgames", snapshot.endgames);
  putAll("endgame_attempts", snapshot.attempts);
  putAll("sync_queue", snapshot.queue);
  await txDone(tx);
  db.close();
}
