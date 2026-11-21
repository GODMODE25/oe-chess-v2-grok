import { Chess } from "chess.js";
import { getEngine } from "./engine";
import {
  gradeOf,
  infoCp,
  positionLedger,
  REVIEW_DEPTH,
  REVIEW_FORMULAS,
  REVIEW_MOVETIME_MS,
  seatsOf,
  summarizeReview,
  terminalCp,
  winPct,
  type ReviewInput,
} from "./review-math";
import type { EngineInfo, GameReview, ReviewedMove } from "./types";

export type ReviewHooks = {
  onMove?: (index: number, move: ReviewedMove) => void;
  onProgress?: (done: number, total: number) => void;
  onDone?: (review: GameReview) => void;
  onError?: (message: string) => void;
};

export type ReviewHandle = { cancel: () => void };

/** Centipawns the mover gave up, capped so one mate cannot skew the average. */
const LOSS_CAP = 1000;

/**
 * One search per position: it yields both the eval the previous move led to and the
 * engine's choice for the next one, so a game costs N searches, not 2N. Grades stream
 * out as they land; the finished report is handed over once for storage.
 */
export function analyzeGame(game: ReviewInput, hooks: ReviewHooks): ReviewHandle {
  const token = { cancelled: false };
  void run(game, hooks, token);
  return {
    cancel: () => {
      token.cancelled = true;
      getEngine().stop();
    },
  };
}

async function run(game: ReviewInput, hooks: ReviewHooks, token: { cancelled: boolean }) {
  const engine = getEngine();
  const total = game.sans.length;
  try {
    const positions = positionLedger(game.startFen, game.sans);
    const startTurn = positions[0].turn;

    await engine.ready;
    const evals: number[] = [];
    const mates: (number | null)[] = [];
    const bests: { uci: string; san: string; line: string; depth: number; nodes: number; seldepth: number }[] = [];
    const moves: ReviewedMove[] = [];
    let deepest = 0;

    for (let ply = 0; ply <= total; ply++) {
      if (token.cancelled) return;
      const terminal = terminalCp(new Chess(positions[ply].fen));
      if (terminal != null) {
        evals[ply] = terminal;
        mates[ply] = null;
        bests[ply] = { uci: "", san: "", line: "", depth: 0, nodes: 0, seldepth: 0 };
      } else {
        const infos: EngineInfo[] = [];
        const best = await engine.go({
          fen: positions[ply].fen,
          depth: REVIEW_DEPTH,
          movetime: REVIEW_MOVETIME_MS,
          strength: "max",
          onInfo: (info) => {
            infos.push(info);
          },
        });
        if (token.cancelled) return;
        const info: EngineInfo | null = infos.at(-1) ?? null;
        evals[ply] = info ? infoCp(info, positions[ply].turn) : 0;
        mates[ply] = info?.mate ?? null;
        deepest = Math.max(deepest, info?.depth ?? 0);
        const line = sanLine(positions[ply].fen, best ?? "", info?.pvUci ?? []);
        bests[ply] = {
          uci: best ?? "",
          san: line.bestSan,
          line: line.bestLine,
          depth: info?.depth ?? 0,
          nodes: info?.nodes ?? 0,
          seldepth: info?.seldepth ?? 0,
        };
      }
      hooks.onProgress?.(ply, total);
      if (ply === 0) continue;
      const before = positions[ply - 1];
      const sign = before.turn === "w" ? 1 : -1;
      const lossWin = Math.max(0, winPct(sign * evals[ply - 1]) - winPct(sign * evals[ply]));
      const forced = before.legal <= 1;
      // A different move that keeps the same win chance (another mate in one, a dead-equal
      // shuffle) is as good as the engine's first choice, and reads as Best rather than merely Good.
      const asGoodAsBest = forced || before.playedUci === bests[ply - 1].uci || lossWin < 1;
      const move: ReviewedMove = {
        cp: evals[ply],
        mate: mates[ply],
        loss: Math.max(0, Math.min(LOSS_CAP, Math.round(sign * (evals[ply - 1] - evals[ply])))),
        lossWin,
        grade: gradeOf(lossWin, asGoodAsBest),
        bestUci: bests[ply - 1].uci,
        bestSan: bests[ply - 1].san,
        bestLine: bests[ply - 1].line,
        depth: bests[ply - 1].depth,
        forced,
        nodes: bests[ply - 1].nodes,
        seldepth: bests[ply - 1].seldepth,
      };
      moves.push(move);
      hooks.onMove?.(ply - 1, move);
    }
    if (token.cancelled) return;
    const seats = seatsOf(game);
    const sides = summarizeReview(moves, startTurn, seats);
    hooks.onDone?.({
      depth: deepest || REVIEW_DEPTH,
      analyzedAt: Date.now(),
      startCp: evals[0],
      moves,
      w: sides.w,
      b: sides.b,
      engine: engine.identity(),
      formulas: REVIEW_FORMULAS,
      config: { depth: REVIEW_DEPTH, movetimeMs: REVIEW_MOVETIME_MS },
    });
  } catch (error) {
    if (!token.cancelled) hooks.onError?.(error instanceof Error ? error.message : "The review could not be analyzed.");
  }
}

function sanLine(fen: string, bestUci: string, pvUci: string[]): { bestSan: string; bestLine: string } {
  if (!bestUci) return { bestSan: "", bestLine: "" };
  try {
    const chess = new Chess(fen);
    const first = chess.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] as "q" | undefined });
    if (!first) return { bestSan: "", bestLine: "" };
    const sans = [first.san];
    for (const uci of pvUci.slice(1, 6)) {
      const moved = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as "q" | undefined });
      if (!moved) break;
      sans.push(moved.san);
    }
    return { bestSan: first.san, bestLine: sans.join(" ") };
  } catch {
    return { bestSan: "", bestLine: "" };
  }
}
