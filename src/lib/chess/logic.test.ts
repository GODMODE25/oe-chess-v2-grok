import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { judgeEndgame } from "./endgame-result.ts";
import { dequeuePremove, dropAnsweredPremove, enqueuePremove, premoveLabel, premoveProjection, premoveSan, premoveTargets, type QueuedMove } from "./premove.ts";
import { capturedPieces, materialBalance, materialLead, parsePgn, replay, START_FEN, statusOf } from "./rules.ts";
import { REPLAY_TARGET, applyGrade, blankReview, gradeFromDrill, nextStreak } from "./srs.ts";
import { mergeEnvelopes } from "./sync-merge.ts";
import type { SyncEnvelope } from "./types.ts";
import { parseBestmove, parseInfo } from "./uci.ts";

describe("chess rules", () => {
  it("castles, captures en passant, and promotes", () => {
    const castled = replay("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"]);
    assert.equal(castled.chess.get("g1")?.type, "k");
    const ep = replay(undefined as unknown as string, ["e4", "a6", "e5", "d5", "exd6"]);
    assert.equal(ep.chess.get("d6")?.type, "p");
    const promo = replay("8/P7/8/8/8/8/k7/7K w - - 0 1", ["a8=Q"]);
    assert.equal(promo.chess.get("a8")?.type, "q");
  });

  it("detects stalemate, insufficient material, repetition, and the fifty-move rule", () => {
    const stale = new Chess("k7/8/1Q6/8/8/8/8/7K b - - 0 1");
    assert.equal(stale.isStalemate(), true);
    assert.equal(statusOf(stale).result, "1/2-1/2");
    const bare = new Chess("8/8/8/8/8/8/k7/7K w - - 0 1");
    assert.equal(bare.isInsufficientMaterial(), true);
    const repeat = replay("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [
      "Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8",
    ]);
    assert.equal(repeat.chess.isThreefoldRepetition(), true);
    const fifty = new Chess("8/8/8/4k3/8/8/8/4K2N w - - 99 80");
    fifty.move("Nf2");
    assert.equal(fifty.isDrawByFiftyMoves(), true);
  });

  it("round-trips a PGN with a comment", () => {
    const parsed = parsePgn("1. e4 {King pawn} e5 *");
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.sans, ["e4", "e5"]);
    assert.equal(parsed.comments[0]?.comment, "King pawn");
  });
});

describe("material", () => {
  it("starts level", () => {
    const start = replay(START_FEN, []);
    assert.equal(materialBalance(start.chess), 0);
    assert.deepEqual(capturedPieces(start.chess), { w: [], b: [] });
    assert.equal(materialLead(start.chess, "w"), 0);
  });

  it("counts captures, lists them heaviest first, and names who is up", () => {
    const game = replay(START_FEN, ["e4", "e5", "Bc4", "Nf6", "Nf3", "Nxe4", "Bxf7+", "Kxf7"]);
    assert.deepEqual(capturedPieces(game.chess).w, ["b", "p"]);
    assert.deepEqual(capturedPieces(game.chess).b, ["p"]);
    assert.equal(materialBalance(game.chess), -3);
    assert.equal(materialLead(game.chess, "b"), 3);
    assert.equal(materialLead(game.chess, "w"), 0);
  });

  it("counts an en passant capture as a pawn", () => {
    const ep = replay(START_FEN, ["e4", "a6", "e5", "d5", "exd6"]);
    assert.deepEqual(capturedPieces(ep.chess).b, ["p"]);
    assert.equal(materialLead(ep.chess, "w"), 1);
  });

  it("reads a promoted piece from the board, not from the captures", () => {
    const promoted = replay("8/P7/8/8/8/8/k7/7K w - - 0 1", ["a8=Q"]);
    assert.deepEqual(capturedPieces(promoted.chess), { w: [], b: [] });
    assert.equal(materialBalance(promoted.chess), 9);
  });
});

describe("spaced repetition", () => {
  it("fails come back soon and clean reps become mastered", () => {
    const now = 1_700_000_000_000;
    let review = blankReview("line", "w", now);
    review = applyGrade(review, "fail", now, 1000);
    assert.equal(review.status, "learning");
    assert.ok(review.dueAt > now);
    assert.ok(review.dueAt < now + 86_400_000);
    for (let i = 0; i < 6; i++) review = applyGrade(review, "perfect", now + i, 1000);
    assert.equal(review.status, "mastered");
    assert.equal(gradeFromDrill({ mistakes: 1, hints: 0, elapsedMs: 1000, studentMoves: 3 }), "fail");
    assert.equal(gradeFromDrill({ mistakes: 0, hints: 0, elapsedMs: 3000, studentMoves: 2 }), "perfect");
  });

  it("only counts a run toward the target when it was clean", () => {
    assert.equal(REPLAY_TARGET, 3);
    assert.equal(nextStreak(0, true), 1);
    assert.equal(nextStreak(2, true), 3);
    assert.equal(nextStreak(2, false), 0);
  });
});

describe("endgame completion", () => {
  it("solves a mate and fails a stalemate for the attacker", () => {
    const mate = new Chess("7k/8/6K1/8/8/8/8/7Q w - - 0 1");
    mate.move("Qh7#");
    const won = judgeEndgame(mate, { userSide: "w", objective: "checkmate", maxMoves: 4, holdMoves: null });
    assert.equal(won.state, "solved");
    const stale = new Chess("k7/8/1Q6/8/8/8/8/7K b - - 0 1");
    const drawn = judgeEndgame(stale, { userSide: "w", objective: "checkmate", maxMoves: 10, holdMoves: null });
    assert.equal(drawn.state, "failed");
  });

  it("treats a hold as a successful draw task", () => {
    const chess = new Chess("8/8/8/8/8/4k3/4p3/4K3 b - - 0 1");
    chess.move("Kd3");
    const held = judgeEndgame(chess, { userSide: "b", objective: "draw", maxMoves: null, holdMoves: 1 });
    assert.equal(held.state, "solved");
  });
});

describe("sync merge", () => {
  it("keeps the newer edit and never drops a newer local line for an older delete", () => {
    const local = envelope({
      openings: [line("a", 20, false), line("b", 5, false)],
      settingsAt: 50,
    });
    const remote = envelope({
      openings: [line("a", 10, true), line("c", 8, false)],
      settingsAt: 40,
    });
    const { merged, hadConflict } = mergeEnvelopes(local, remote);
    assert.equal(hadConflict, true);
    const a = merged.openings.find((row) => row.id === "a");
    assert.equal(a?.deleted, false);
    assert.equal(merged.openings.some((row) => row.id === "c"), true);
    assert.equal(merged.openings.some((row) => row.id === "b"), true);
    assert.equal(merged.settings.updatedAt, 50);
  });
});

describe("uci parse", () => {
  it("reads score, depth, and bestmove", () => {
    const info = parseInfo("info depth 12 seldepth 18 score cp 34 nodes 1200 nps 40000 pv e2e4 e7e5");
    assert.equal(info?.depth, 12);
    assert.equal(info?.score, "+0.34");
    assert.equal(parseBestmove("bestmove e2e4 ponder e7e5")?.move, "e2e4");
  });
});

function line(id: string, updatedAt: number, deleted: boolean) {
  return {
    id,
    eco: "C50",
    name: id,
    family: "Custom",
    popularity: 1,
    tags: [],
    note: "",
    moves: ["e4"],
    source: "user" as const,
    updatedAt,
    deleted,
  };
}

function envelope(input: { openings: ReturnType<typeof line>[]; settingsAt: number }): SyncEnvelope {
  const now = input.settingsAt;
  return {
    version: 1,
    deviceId: "dev",
    exportedAt: now,
    profile: { id: "main", name: "Player", deviceId: "dev", createdAt: 1, streak: 0, bestStreak: 0, lastSuccessDay: null, updatedAt: 1 },
    settings: {
      id: "main",
      updatedAt: now,
      coordinates: true,
      sound: true,
      boardTheme: "walnut",
      playStrength: 2000,
      endgameMaximum: true,
      playThinkMs: 900,
      endgameThinkMs: 1600,
      analysisDepth: 14,
    },
    games: [],
    openings: input.openings,
    reviews: [],
    endgames: [],
    attempts: [],
    repertoire: { id: "main", w: [], b: [], seeded: true, updatedAt: 1 },
    favorites: { id: "main", ids: [], updatedAt: 1 },
    extraTags: { id: "main", map: {}, updatedAt: 1 },
    queue: [],
  };
}

describe("premove queue", () => {
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("plays the head and keeps the rest waiting", () => {
    const queue = [
      { from: "e2", to: "e4", color: "w" as const },
      { from: "d2", to: "d4", color: "w" as const },
    ];
    const taken = dequeuePremove(START, queue);
    assert.equal(taken.move?.from, "e2");
    assert.deepEqual(taken.remaining, [queue[1]]);
    assert.equal(taken.cancelled, null);
    assert.equal(premoveSan(START, queue[0]), "e4");
  });

  it("cancels only the head the opponent's reply killed", () => {
    const noDpawn = "rnbqkbnr/pppppppp/8/8/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1";
    const queue = [
      { from: "d2", to: "d4", color: "w" as const },
      { from: "c2", to: "c4", color: "w" as const },
    ];
    const taken = dequeuePremove(noDpawn, queue);
    assert.equal(taken.move, null);
    assert.deepEqual(taken.cancelled, queue[0]);
    assert.deepEqual(taken.remaining, [queue[1]]);
  });

  it("keeps castling, promotion and en passant legal as queued moves", () => {
    const castling = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    assert.equal(premoveSan(castling, { from: "e1", to: "g1", color: "w" }), "O-O");
    assert.equal(premoveSan("8/P6k/8/8/8/8/K7/8 w - - 0 1", { from: "a7", to: "a8", promotion: "q", color: "w" }), "a8=Q");
    assert.equal(premoveSan(castling, { from: "e1", to: "g2", color: "w" }), null);
    const enPassant = "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3";
    assert.equal(premoveSan(enPassant, { from: "e5", to: "f6", color: "w" }), "exf6");
    assert.equal(premoveLabel({ from: "a7", to: "a8", promotion: "q", color: "w" }), "a7→a8=Q");
  });

  it("drops only the head that belonged to the side that moved by hand", () => {
    const queue = [
      { from: "e7", to: "e5", color: "b" as const },
      { from: "d7", to: "d5", color: "b" as const },
    ];
    // White's own move cannot answer a queue that was black's to play.
    assert.deepEqual(dropAnsweredPremove(queue, "w"), queue);
    const mine = [
      { from: "d2", to: "d4", color: "w" as const },
      { from: "c2", to: "c4", color: "w" as const },
    ];
    assert.deepEqual(dropAnsweredPremove(mine, "w"), [mine[1]]);
  });

  it("grows to the limit and then replaces the furthest-future intent", () => {
    let queue: QueuedMove[] = [];
    for (let rank = 2; rank <= 6; rank++) queue = enqueuePremove(queue, { from: `a${rank}`, to: `b${rank}`, color: "w" }, 5);
    assert.equal(queue.length, 5);
    queue = enqueuePremove(queue, { from: "a7", to: "b7", color: "w" }, 5);
    assert.equal(queue.length, 5);
    assert.equal(queue[0].from, "a2");
    assert.equal(queue.at(-1)?.from, "a7");
    assert.equal(queue.some((move) => move.from === "a6"), false);
  });
});

describe("premove targets", () => {
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const sorted = (fen: string, from: string) => premoveTargets(fen, from).slice().sort();

  it("lists where a sleeping piece would go if the turn came round", () => {
    // Black's knight is not moving yet, but g8→f6/h6 is exactly what a premove may plan.
    assert.deepEqual(sorted(START, "g8"), ["f6", "h6"]);
    assert.deepEqual(sorted(START, "g1"), []);
  });

  it("keeps one promotion square instead of four", () => {
    const promoting = "4k3/8/8/8/8/8/p1P5/1N2K3 w - - 0 1";
    assert.deepEqual(sorted(promoting, "a2"), ["a1", "b1"]);
  });

  it("offers only the squares a pinned piece can honestly reach", () => {
    const pinned = "4k3/4r3/8/8/8/8/8/4R1K1 w - - 0 1";
    const rook = sorted(pinned, "e7");
    assert.equal(rook.includes("e6"), true);
    assert.equal(rook.includes("d7"), false);
  });

  it("stays quiet on squares it was not asked about", () => {
    assert.deepEqual(sorted(START, "e4"), []);
    assert.deepEqual(premoveTargets("not a fen", "a1"), []);
  });
});

describe("premove projection", () => {
  // Black holds the move, so every white entry below is something queued for a later turn.
  const WAIT = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";
  const queued = (from: string, to: string): QueuedMove => ({ from, to, color: "w" });

  it("hands the next click the square the queue already leaves the piece on", () => {
    const walk = premoveProjection(WAIT, [queued("a2", "a3")], "a2");
    assert.equal(walk.from, "a3");
    assert.equal(new Chess(walk.fen).turn(), "b");
    assert.deepEqual(premoveTargets(walk.fen, walk.from), ["a4"]);
  });

  it("opens the square the piece came from once a move is queued", () => {
    const first = premoveProjection(WAIT, [], "g1");
    assert.equal(premoveTargets(first.fen, first.from).includes("g1"), false);
    const second = premoveProjection(WAIT, [queued("g1", "f3")], "g1");
    assert.equal(premoveTargets(second.fen, second.from).includes("g1"), true);
  });

  it("ignores the entries queued for other pieces", () => {
    const queue = [queued("b1", "c3"), queued("a2", "a3"), queued("d1", "d2")];
    assert.equal(premoveProjection(WAIT, queue, "a2").from, "a3");
  });

  it("stops at a link the chain cannot play", () => {
    const walk = premoveProjection(WAIT, [queued("a2", "a3"), queued("a3", "a2"), queued("a2", "a4")], "a2");
    assert.equal(walk.from, "a3");
    assert.equal(walk.fen.split(" ")[1], "b");
  });

  it("leaves a piece that is moving right now where it is", () => {
    assert.deepEqual(premoveProjection(WAIT, [queued("a2", "a3")], "e7"), { fen: WAIT, from: "e7" });
  });
});
