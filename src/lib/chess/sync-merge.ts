import type { SyncEnvelope, SyncQueueItem } from "./types";

type Identified = { id: string; updatedAt: number; deleted?: boolean };

export type MergeOutcome = {
  merged: SyncEnvelope;
  notes: string[];
  hadConflict: boolean;
};

function pickNewer<T extends Identified>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt > b.updatedAt) return a;
  if (b.updatedAt > a.updatedAt) return b;
  if (a.deleted && !b.deleted) return b;
  if (b.deleted && !a.deleted) return a;
  return a;
}

export function mergeById<T extends Identified>(
  local: T[],
  remote: T[],
  label: string,
  notes: string[],
): { records: T[]; conflict: boolean } {
  const map = new Map<string, T>();
  let conflict = false;
  for (const row of local) map.set(row.id, row);
  for (const row of remote) {
    const prev = map.get(row.id);
    if (prev && prev.updatedAt !== row.updatedAt) {
      conflict = true;
      const winner = pickNewer(prev, row);
      if (winner) {
        const kept = winner.updatedAt === prev.updatedAt ? "this device" : "the cloud copy";
        if (prev.deleted !== row.deleted || winner !== prev) {
          notes.push(`${label} “${row.id}”: kept ${kept}.`);
        }
        map.set(row.id, winner);
      }
    } else if (!prev) {
      map.set(row.id, row);
    }
  }
  for (const row of local) {
    if (!remote.some((r) => r.id === row.id)) map.set(row.id, row);
  }
  return { records: [...map.values()], conflict };
}

function pickField<T extends { updatedAt: number }>(
  local: T,
  remote: T,
  label: string,
  notes: string[],
): { value: T; conflict: boolean } {
  if (local.updatedAt === remote.updatedAt) return { value: local, conflict: false };
  const localWins = local.updatedAt > remote.updatedAt;
  notes.push(`${label}: kept the newer edit from ${localWins ? "this device" : "the cloud"}.`);
  return { value: localWins ? local : remote, conflict: true };
}

function mergeQueue(local: SyncQueueItem[], remote: SyncQueueItem[]): SyncQueueItem[] {
  const map = new Map<string, SyncQueueItem>();
  for (const row of [...remote, ...local]) {
    const prev = map.get(row.id);
    if (!prev || row.at >= prev.at) map.set(row.id, row);
  }
  return [...map.values()].sort((a, b) => a.at - b.at).slice(-200);
}

export function mergeEnvelopes(local: SyncEnvelope, remote: SyncEnvelope): MergeOutcome {
  const notes: string[] = [];
  let hadConflict = false;
  const profile = pickField(local.profile, remote.profile, "Profile", notes);
  const settings = pickField(local.settings, remote.settings, "Settings", notes);
  const repertoire = pickField(local.repertoire, remote.repertoire, "Repertoire", notes);
  const favorites = pickField(local.favorites, remote.favorites, "Favorites", notes);
  const extraTags = pickField(local.extraTags, remote.extraTags, "Tags", notes);
  hadConflict ||= profile.conflict || settings.conflict || repertoire.conflict || favorites.conflict || extraTags.conflict;

  const games = mergeById(local.games, remote.games, "Game", notes);
  const openings = mergeById(local.openings, remote.openings, "Opening", notes);
  const reviews = mergeById(local.reviews, remote.reviews, "Review", notes);
  const endgames = mergeById(local.endgames, remote.endgames, "Endgame", notes);
  const attempts = mergeById(local.attempts, remote.attempts, "Attempt", notes);
  const queue = mergeQueue(local.queue, remote.queue);
  hadConflict ||=
    games.conflict || openings.conflict || reviews.conflict || endgames.conflict || attempts.conflict;

  const merged: SyncEnvelope = {
    version: 1,
    deviceId: local.deviceId,
    exportedAt: Math.max(local.exportedAt, remote.exportedAt),
    profile: profile.value,
    settings: settings.value,
    games: games.records,
    openings: openings.records,
    reviews: reviews.records,
    endgames: endgames.records,
    attempts: attempts.records,
    repertoire: repertoire.value,
    favorites: favorites.value,
    extraTags: extraTags.value,
    queue,
  };
  return { merged, notes: notes.slice(0, 24), hadConflict };
}
