import { logDiag } from "./diag";

const FILE_NAME = "oe-chess-sync.json";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";

type TokenClient = { requestAccessToken: (opts?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google sign-in is only available in the browser"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not reach Google. Check your connection."));
    document.head.appendChild(script);
  });
}

export function requestGoogleToken(clientId: string): Promise<{ token: string; expiresAt: number }> {
  return loadScript().then(
    () =>
      new Promise((resolve, reject) => {
        const google = window.google;
        if (!google) {
          reject(new Error("Google sign-in did not start."));
          return;
        }
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (response) => {
            if (!response.access_token) {
              reject(new Error(response.error || "Google did not return a token."));
              return;
            }
            const expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000 - 60_000;
            logDiag("info", "Signed in to Google Drive");
            resolve({ token: response.access_token, expiresAt });
          },
        });
        client.requestAccessToken({ prompt: "consent" });
      }),
  );
}

async function driveFetch(token: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Drive ${response.status}: ${text.slice(0, 180)}`);
  }
  return response;
}

export async function findSyncFile(token: string): Promise<string | null> {
  const url =
    "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)&q=" +
    encodeURIComponent(`name='${FILE_NAME}'`);
  const response = await driveFetch(token, url);
  const body = (await response.json()) as { files?: { id: string }[] };
  return body.files?.[0]?.id ?? null;
}

export async function downloadSyncFile(token: string, fileId: string): Promise<unknown> {
  const response = await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return response.json();
}

export async function uploadSyncFile(token: string, fileId: string | null, payload: unknown): Promise<string> {
  const bytes = JSON.stringify(payload);
  if (!fileId) {
    const boundary = "oe_chess_boundary";
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] }) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      bytes +
      `\r\n--${boundary}--`;
    const response = await driveFetch(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const created = (await response.json()) as { id: string };
    return created.id;
  }
  await driveFetch(token, `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: bytes,
  });
  return fileId;
}
