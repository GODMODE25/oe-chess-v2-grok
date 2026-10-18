import type { EngineInfo } from "./types";

export function parseInfo(line: string): EngineInfo | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;
  if (line.includes(" info currmove") || line.includes(" currmove ")) return null;
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
  const seldepth = Number(line.match(/\bseldepth (\d+)/)?.[1] ?? depth);
  const nodes = Number(line.match(/\bnodes (\d+)/)?.[1] ?? 0);
  const nps = Number(line.match(/\bnps (\d+)/)?.[1] ?? 0);
  const mate = line.match(/\bscore mate (-?\d+)/);
  const cp = line.match(/\bscore cp (-?\d+)/);
  const pvRaw = line.split(" pv ")[1]?.trim() ?? "";
  const pvUci = pvRaw.split(/\s+/).filter(Boolean);
  let score = "0.00";
  if (mate) score = `mate ${mate[1]}`;
  else if (cp) {
    const pawns = Number(cp[1]) / 100;
    score = `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
  }
  return {
    depth,
    seldepth,
    score,
    cp: cp ? Number(cp[1]) : null,
    mate: mate ? Number(mate[1]) : null,
    nodes,
    nps,
    pv: pvUci.slice(0, 10).join(" "),
    pvUci,
  };
}

export function parseBestmove(line: string): { move: string; ponder?: string } | null {
  const match = line.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
  if (!match || match[1] === "(none)") return null;
  return { move: match[1], ponder: match[2] };
}
