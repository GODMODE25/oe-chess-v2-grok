import { Chess } from "chess.js";
import type { EngineInfo, MoveGrade, ReviewedMove, SavedGame, Side, SideReview } from "./types";

/** Deep enough to trust the grades, capped in time so a long game still finishes while you watch. */
export const REVIEW_DEPTH = 16;
export const REVIEW_MOVETIME_MS = 1000;
/**
 * The arithmetic a report was produced with. Naming the version matters because the
 * bands below decide what counts as a blunder: a stored report stays readable even if
 * this file changes later.
 */
export const REVIEW_FORMULAS = "lichess win% + accuracy curves, bands 10/20/30 win points, forced moves skipped (v1)";

const HUMAN_ANCHOR = 1500;

export const GRADE_LABEL: Record<MoveGrade, string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

export const GRADE_MARK: Record<MoveGrade, string> = {
  best: "!",
  good: "",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

/** Lichess's win-chance curve: centipawns to the percentage of games won from here. */
export function winPct(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** A forced mate saturates the curve instead of pretending to be a pawn count. */
export function mateCp(mate: number, stm: Side): number {
  const sign = (stm === "w" ? 1 : -1) * (mate > 0 ? 1 : -1);
  return sign * (10000 - Math.min(50, Math.abs(mate)) * 10);
}

export function infoCp(info: EngineInfo, stm: Side): number {
  if (info.mate != null) return mateCp(info.mate, stm);
  return info.cp ?? 0;
}

export function gradeOf(lossWin: number, playedBest: boolean): MoveGrade {
  if (playedBest) return "best";
  if (lossWin >= 30) return "blunder";
  if (lossWin >= 20) return "mistake";
  if (lossWin >= 10) return "inaccuracy";
  return "good";
}

/** Lichess's per-move accuracy curve, in win-chance points lost. */
export function moveAccuracy(lossWin: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, lossWin)) - 3.1669));
}

export function terminalCp(chess: Chess): number | null {
  if (chess.isCheckmate()) return chess.turn() === "w" ? -10000 : 10000;
  if (chess.isGameOver()) return 0;
  return null;
}

/** Which side the move at this index belongs to, given the colour that opened the game. */
export function ownerOf(index: number, startTurn: Side): Side {
  return (index % 2 === 0) === (startTurn === "w") ? "w" : "b";
}

export type ReviewSeat = { engine: boolean; strength: number };

export type ReviewInput = Pick<SavedGame, "startFen" | "sans" | "playerColor" | "engineElo">;

export function seatsOf(game: Pick<SavedGame, "playerColor" | "engineElo">): Record<Side, ReviewSeat> {
  const strength = game.engineElo === "max" ? 3190 : (game.engineElo ?? 2000);
  const engine = (side: Side) => game.playerColor !== "either" && game.playerColor !== side;
  return {
    w: { engine: engine("w"), strength },
    b: { engine: engine("b"), strength },
  };
}

/**
 * The estimate is a heuristic, not an official Elo: accuracy is read against the
 * opponent's strength the way a performance rating reads a score against a field.
 * Every seat is estimated this way — the engine included, so a capped engine is
 * graded on the game it actually played, not on the level it was set to. A human
 * anchors at the engine's set strength; the engine anchors at the human's estimate,
 * which keeps the two ratings inside one coherent range.
 * Forced moves are skipped the way Lichess skips them — with one legal reply there is
 * no choice to be wrong about, and counting it would only inflate the average.
 */
export function summarizeReview(moves: ReviewedMove[], startTurn: Side, seats: Record<Side, ReviewSeat>): { w: SideReview; b: SideReview } {
  const metrics = (s: Side) => {
    const rows = moves.filter((_, index) => ownerOf(index, startTurn) === s);
    const counts: Record<MoveGrade, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    for (const row of rows) counts[row.grade] += 1;
    const scored = rows.filter((row) => !row.forced);
    const basis = scored.length ? scored : rows;
    const accuracy = basis.length ? basis.reduce((sum, row) => sum + moveAccuracy(row.lossWin), 0) / basis.length : 0;
    const acpl = basis.length ? basis.reduce((sum, row) => sum + row.loss, 0) / basis.length : 0;
    return { accuracy, acpl, counts, forced: rows.length - scored.length };
  };
  const w = metrics("w");
  const b = metrics("b");
  const estimate = (accuracy: number, anchor: number) => Math.max(400, Math.min(3500, Math.round(anchor + (accuracy - 50) * 8)));
  const ratingOf = (s: Side): number => {
    const other: Side = s === "w" ? "b" : "w";
    const own = s === "w" ? w : b;
    const otherMetrics = other === "w" ? w : b;
    if (!seats[s].engine) return estimate(own.accuracy, seats[other].engine ? seats[other].strength : HUMAN_ANCHOR);
    if (seats[other].engine) return estimate(own.accuracy, seats[other].strength);
    return estimate(own.accuracy, estimate(otherMetrics.accuracy, seats[s].strength));
  };
  const side = (s: Side): SideReview => ({ ...(s === "w" ? w : b), rating: ratingOf(s), estimated: true });
  return { w: side("w"), b: side("b") };
}

/** One position in the ledger: what was on the board, who was to move, and what they chose. */
export type LedgerPosition = {
  fen: string;
  turn: Side;
  /** The move played FROM this position, UCI; empty for the final position. */
  playedUci: string;
  /** How many legal moves this position offered; one means the mover had no choice. */
  legal: number;
};

/**
 * The position BEFORE each move, plus the move played from it, so a review costs one
 * search per position: each search yields the eval that graded the previous move and the
 * choice that is the alternative to it. The last entry is the final position with no move.
 */
export function positionLedger(startFen: string | undefined, sans: string[]): LedgerPosition[] {
  const setup = new Chess();
  if (startFen) setup.load(startFen);
  const rows: LedgerPosition[] = [];
  for (let ply = 0; ply <= sans.length; ply++) {
    const turn = setup.turn();
    const fen = setup.fen();
    const legal = setup.moves().length;
    let playedUci = "";
    if (ply < sans.length) {
      const moved = playSan(setup, sans[ply]);
      if (!moved) throw new Error(`Move ${ply + 1} (${sans[ply]}) is not legal in this game.`);
      playedUci = moved.from + moved.to + (moved.promotion ?? "");
    }
    rows.push({ fen, turn, playedUci, legal });
  }
  return rows;
}

/** chess.js throws on a move it cannot parse; the review wants one error naming the move. */
function playSan(chess: Chess, san: string) {
  try {
    return chess.move(san);
  } catch {
    return null;
  }
}
