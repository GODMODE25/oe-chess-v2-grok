import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * The `memorize-digits` Firebase project backs both trainers, so OE Chess progress
 * lives beside digit profiles. A web `apiKey` is a public client identifier, not a
 * secret — access is decided by the project's Firestore rules.
 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC6eescr3i1ANAvuYHayhmzBDpGHVigLs0",
  authDomain: "memorize-digits.firebaseapp.com",
  projectId: "memorize-digits",
  storageBucket: "memorize-digits.firebasestorage.app",
  messagingSenderId: "193821240349",
  appId: "1:193821240349:web:9df3699a835fa88f88aaf4",
};

let app: FirebaseApp | null = null;

/**
 * Lazily created because routes render on the server too; `getAuth` only belongs in
 * the browser, and every call site here is a user gesture or a client-only listener.
 */
function firebaseApp(): FirebaseApp {
  if (!app) app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  return app;
}

export function firestoreDb() {
  return getFirestore(firebaseApp());
}

const authClient = () => getAuth(firebaseApp());

/** Plain sentences for the codes people actually hit. */
function readable(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "Sign-in was cancelled.";
  if (code === "auth/popup-blocked") return "Your browser blocked the sign-in window. Allow pop-ups for this site.";
  if (code === "auth/unauthorized-domain") return "This site's address is not in the Firebase project's authorized domains.";
  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "That email and password do not match an account.";
  }
  if (code === "auth/email-already-in-use") return "That email already has an account. Sign in instead.";
  if (code === "auth/weak-password") return "Pick a password of at least six characters.";
  if (code === "auth/invalid-email") return "That email address is not valid.";
  if (code === "permission-denied") return "The Firebase project's rules rejected the write. Its rules must allow this app's path.";
  if (code === "unavailable") return "Could not reach the cloud. Your progress is safe on this device.";
  return error instanceof Error ? error.message : "Cloud sign-in failed.";
}

/**
 * `currentUser` stays null for a moment after a reload while Firebase reads its stored
 * session, so anything that needs the uid on first click waits here instead of wrongly
 * reporting that nobody is signed in.
 */
export function authReady(): Promise<User | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const client = authClient();
  if (client.currentUser) return Promise.resolve(client.currentUser);
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(client, (user) => {
      stop();
      resolve(user);
    });
  });
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(authClient(), callback);
}

export async function signInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(authClient(), new GoogleAuthProvider());
    return result.user;
  } catch (error) {
    throw new Error(readable(error));
  }
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  try {
    const result = await signInWithEmailAndPassword(authClient(), email.trim(), password);
    return result.user;
  } catch (error) {
    throw new Error(readable(error));
  }
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  try {
    const result = await createUserWithEmailAndPassword(authClient(), email.trim(), password);
    return result.user;
  } catch (error) {
    throw new Error(readable(error));
  }
}

export async function signOutCloud(): Promise<void> {
  await signOut(authClient());
}
