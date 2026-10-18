export type DiagRow = { at: number; level: "info" | "warn" | "error"; message: string };

const KEY = "oe-chess-log";
const rows: DiagRow[] = [];

function restore() {
  if (rows.length || typeof localStorage === "undefined") return;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as DiagRow[];
    if (Array.isArray(parsed)) rows.push(...parsed.slice(-80));
  } catch {
    /* ignore broken log */
  }
}

export function logDiag(level: DiagRow["level"], message: string) {
  restore();
  rows.push({ at: Date.now(), level, message });
  if (rows.length > 200) rows.splice(0, rows.length - 200);
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-80)));
  } catch {
    /* storage full or private mode */
  }
}

export function readDiag(): DiagRow[] {
  restore();
  return rows.slice();
}
