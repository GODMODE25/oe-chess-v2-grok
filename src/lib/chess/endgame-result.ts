import { Chess } from "chess.js";
import type { Objective, Side } from "./types";

export type JudgeState = "playing" | "solved" | "failed";

export type Judgement = {
  state: JudgeState;
  reason: string;
  userMoves: number;
};

export function drawReason(chess: Chess): string {
  if (chess.isStalemate()) return "stalemate";
  if (chess.isInsufficientMaterial()) return "insufficient material";
  if (chess.isThreefoldRepetition()) return "threefold repetition";
  if (chess.isDrawByFiftyMoves()) return "the fifty-move rule";
  return "a draw";
}

export function judgeEndgame(
  chess: Chess,
  spec: {
    userSide: Side;
    objective: Objective;
    maxMoves: number | null;
    holdMoves: number | null;
  },
): Judgement {
  const history = chess.history({ verbose: true });
  const userMoves = history.filter((m) => m.color === spec.userSide).length;
  const promoted = history.some((m) => Boolean(m.promotion) && m.color === spec.userSide);

  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "b" : "w";
    if (winner === spec.userSide) return { state: "solved", reason: "Checkmate.", userMoves };
    return { state: "failed", reason: "You were checkmated.", userMoves };
  }

  if (chess.isDraw()) {
    const why = drawReason(chess);
    if (spec.objective === "draw") return { state: "solved", reason: `Drawn by ${why}.`, userMoves };
    return { state: "failed", reason: `The position was drawn by ${why}.`, userMoves };
  }

  if (spec.objective === "promote" && promoted) {
    return { state: "solved", reason: "Pawn promoted.", userMoves };
  }

  if (spec.objective === "draw" && spec.holdMoves != null && userMoves >= spec.holdMoves) {
    return { state: "solved", reason: "You held the defensive task.", userMoves };
  }

  if (spec.objective !== "draw" && spec.maxMoves != null && userMoves > spec.maxMoves) {
    return { state: "failed", reason: "Move budget used up before the goal.", userMoves };
  }

  return { state: "playing", reason: "", userMoves };
}

/** Placeholder for Syzygy WDL/DTZ. Returns null until tablebase files are installed. */
export async function probeTablebase(_fen: string): Promise<null> {
  return null;
}
