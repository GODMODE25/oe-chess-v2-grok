import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firestoreDb } from "./firebase";

/**
 * One document per account, under its own subcollection so it can never be read as a
 * Memorize Digits profile. `users/{uid}/profiles/*` stays exactly as that app left it.
 */
function snapshotRef(uid: string) {
  return doc(firestoreDb(), "users", uid, "oeChess", "snapshot");
}

const SYNC_TIMEOUT_MS = 6_000;
/** Firestore caps a document at 1,048,576 bytes; field names and encoding take the rest. */
const DOC_BYTE_LIMIT = 950_000;

/** A JSON round trip drops the `undefined` keys that Firestore refuses to store. */
function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

async function withinTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out. The cloud did not answer in a few seconds.`)), SYNC_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readCloudSnapshot(uid: string): Promise<unknown | null> {
  const found = await withinTimeout(getDoc(snapshotRef(uid)), "Cloud read");
  if (!found.exists()) return null;
  const data = found.data() as Record<string, unknown>;
  delete data.lastSyncedAt;
  return data;
}

export async function writeCloudSnapshot(uid: string, envelope: unknown): Promise<void> {
  const payload = jsonSafe(envelope);
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes > DOC_BYTE_LIMIT) {
    throw new Error(
      `The cloud copy is ${(bytes / 1_048_576).toFixed(1)} MB and Firestore allows 1 MB per document. Delete saved games you no longer need, then sync again.`,
    );
  }
  await withinTimeout(
    setDoc(snapshotRef(uid), { ...(payload as Record<string, unknown>), lastSyncedAt: serverTimestamp() }, { merge: true }),
    "Cloud write",
  );
}
