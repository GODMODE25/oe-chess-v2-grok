import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { judgeEndgame } from "./endgame-result.ts";
import { dequeuePremove, dropAnsweredPremove, enqueuePremove, premoveLabel, premoveProjection, premoveSan, premoveTargets, type QueuedMove } from "./premove.ts";
import { advantageSeries, canDeliverMate, capturedPieces, halfmoveClock, isDeadPosition, matchOpening, materialBalance, materialLead, parsePgn, replay, repetitionCount, START_FEN, statusOf, timeoutResult } from "./rules.ts";
import { OPENINGS } from "../data/openings.ts";
import { REPLAY_TARGET, applyGrade, blankReview, gradeFromDrill, nextStreak } from "./srs.ts";
import { mergeEnvelopes } from "./sync-merge.ts";
import type { OpeningLine, SyncEnvelope } from "./types.ts";
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

describe("dead positions", () => {
  it("grades each side's mating chances by material", () => {
    assert.equal(canDeliverMate(new Chess("8/8/8/8/8/6n1/8/K1k5 w - - 0 1"), "b"), false, "a lone knight cannot mate");
    assert.equal(canDeliverMate(new Chess("8/8/8/8/8/6n1/6n1/K5k1 w - - 0 1"), "b"), false, "two knights cannot force mate either");
    assert.equal(canDeliverMate(new Chess("8/8/8/8/8/7b/8/K5k1 w - - 0 1"), "b"), false, "one bishop cannot mate");
    assert.equal(canDeliverMate(new Chess("8/8/8/8/8/8/5b1b/K5k1 w - - 0 1"), "b"), false, "two same-colour bishops cannot mate");
    assert.equal(canDeliverMate(new Chess("8/8/8/8/8/7b/5b2/K5k1 w - - 0 1"), "b"), true, "bishops on both complexes can");
    assert.equal(canDeliverMate(new Chess("8/8/8/8/8/7b/6n1/K5k1 w - - 0 1"), "b"), true, "a bishop with a knight can");
    assert.equal(canDeliverMate(new Chess("8/8/8/8/8/6p1/8/K5k1 w - - 0 1"), "b"), true, "a pawn can always promote its way to mate");
    assert.equal(canDeliverMate(new Chess("8/8/8/8/8/8/1k6/3KR3 w - - 0 1"), "w"), true, "a rook can mate");
  });

  it("closes the game the moment neither side can checkmate", () => {
    const knights = new Chess("8/8/8/8/6n1/6N1/8/K6k w - - 0 1");
    assert.equal(isDeadPosition(knights), true, "knight versus knight is dead");
    assert.equal(statusOf(knights).result, "1/2-1/2");
    assert.equal(statusOf(knights).label, "Draw — neither side can checkmate.");
    const twoKnights = new Chess("8/8/8/8/8/8/6n1/4K2k w - - 0 1");
    assert.equal(statusOf(twoKnights).result, "1/2-1/2", "two knights against a bare king still cannot mate");
    const oppositeBishops = new Chess("8/8/8/8/8/7b/5b2/K5k1 w - - 0 1");
    assert.equal(isDeadPosition(oppositeBishops), false, "the bishop pair keeps playing for the mate");
    const pawn = new Chess("8/8/8/8/8/6p1/8/K5k1 w - - 0 1");
    assert.equal(statusOf(pawn).over, false, "a pawn on the board means the game is alive");
  });

  it("draws a flag fall when the survivor has no mate", () => {
    const dead = new Chess("8/8/8/8/6n1/6N1/8/K6k b - - 0 1");
    assert.equal(timeoutResult(dead, "b").result, "1/2-1/2", "a knight cannot win on the clock");
    const alive = new Chess("8/8/8/8/8/8/1k6/3KR3 b - - 0 1");
    assert.equal(timeoutResult(alive, "b").result, "1-0", "the rook still collects the point");
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

  it("graphs the advantage after every ply", () => {
    assert.deepEqual(advantageSeries(START_FEN, []), [0]);
    assert.deepEqual(advantageSeries(START_FEN, ["e4", "e5", "Bc4", "Nf6", "Nf3", "Nxe4", "Bxf7+", "Kxf7"]), [
      0, 0, 0, 0, 0, 0, -1, 0, -3,
    ]);
  });

  it("keeps the part of the graph it can replay", () => {
    assert.deepEqual(advantageSeries(START_FEN, ["e4", "e5", "Qxd8"]), [0, 0, 0]);
    assert.deepEqual(advantageSeries("not a fen", ["e4"]), []);
    assert.deepEqual(advantageSeries("8/P7/8/8/8/8/k7/7K w - - 0 1", ["a8=Q"]), [1, 9]);
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

describe("repetition counting", () => {
  const shuffle = ["Nf3", "Nf6", "Ng1", "Ng8"];

  it("counts the position on screen, the starting one included", () => {
    assert.equal(repetitionCount(START_FEN, []), 1);
    assert.equal(repetitionCount(START_FEN, shuffle), 2, "the knights went out and back once");
    assert.equal(repetitionCount(START_FEN, [...shuffle, ...shuffle]), 3);
  });

  it("warns one repeat before the automatic draw", () => {
    const twice = replay(START_FEN, shuffle);
    assert.equal(statusOf(twice.chess).over, false, "two occurrences is still playable");
    const third = replay(START_FEN, [...shuffle, ...shuffle]);
    assert.equal(statusOf(third.chess).result, "1/2-1/2");
    assert.equal(statusOf(third.chess).label, "Draw by threefold repetition.");
  });

  it("counts repeats that are not consecutive", () => {
    const line = ["Nf3", "Nf6", "Ng1", "Ng8", "Nc3", "Nc6", "Nb1", "Nb8"];
    assert.equal(repetitionCount(START_FEN, line), 3, "two different knight excursions both came home");
    assert.equal(statusOf(replay(START_FEN, line).chess).label, "Draw by threefold repetition.");
  });

  it("reads a position by its castling rights, not only its pieces", () => {
    const home = ["Nf3", "Nf6", "Rg1", "Ng8", "Ng5", "Nc6", "Rh1", "Nb8", "Nf3", "Nf6", "Ng1", "Ng8"];
    const { chess } = replay(START_FEN, home);
    assert.equal(chess.fen().split(" ")[0], START_FEN.split(" ")[0], "every piece is back on its starting square");
    assert.equal(chess.fen().split(" ")[2], "Qkq", "the h1 rook moved, so White has lost its kingside right for good");
    assert.equal(repetitionCount(START_FEN, home), 1, "an identical board with different castling rights is a different position");
  });

  it("starts counting from a custom position", () => {
    const fen = "4k3/8/8/8/8/8/8/R3K2R w - - 0 1";
    assert.equal(repetitionCount(fen, ["Ra2", "Ke7", "Ra1", "Ke8"]), 2, "the rook shuffle came back to the set-up position");
    assert.equal(repetitionCount(fen, ["Ra2", "Ke7", "Ra1"]), 1, "Black still has to come home first");
  });

  it("stops counting at a move that is not in the game", () => {
    assert.equal(repetitionCount(START_FEN, [...shuffle, "Ke3"]), 2, "an illegal tail cannot invent a third occurrence");
  });
});

describe("fifty-move clock", () => {
  // One rook walking about with the king shuffling behind it: every ply is a new position and
  // nothing is captured, so the fifty-move rule is the only one in play.
  const quiet = "4k3/8/8/8/8/8/8/R2K3R w - - 80 40";
  const march = ["Ra2", "Kd8", "Ra3", "Ke8", "Ra4", "Kd8", "Ra5", "Ke8", "Ra6", "Kd8", "Ra7", "Ke8", "Rb7", "Kd8", "Rb6", "Ke8", "Rb5", "Kd8", "Rb4", "Ke8"];

  it("counts the plies since the last pawn move or capture", () => {
    assert.equal(halfmoveClock(replay(START_FEN, []).chess), 0);
    assert.equal(halfmoveClock(replay(quiet, []).chess), 80, "a set-up position keeps the clock it arrived with");
    assert.equal(halfmoveClock(replay(quiet, march.slice(0, 6)).chess), 86);
  });

  it("resets on a capture and on a pawn move", () => {
    assert.equal(halfmoveClock(replay("4k3/p7/8/8/8/8/8/R2K3R w - - 80 40", ["Rxa7"]).chess), 0);
    assert.equal(halfmoveClock(replay("4k3/p7/8/8/8/8/8/R2K3R b - - 80 40", ["a5"]).chess), 0);
  });

  it("warns before the automatic draw, then closes the game", () => {
    const almost = replay(quiet, march.slice(0, 12));
    assert.equal(halfmoveClock(almost.chess), 92);
    assert.equal(statusOf(almost.chess).over, false, "92 quiet plies is still playable");
    const drawn = replay(quiet, march);
    assert.equal(halfmoveClock(drawn.chess), 100);
    assert.equal(statusOf(drawn.chess).result, "1/2-1/2");
    assert.equal(statusOf(drawn.chess).label, "Draw by the fifty-move rule.");
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

describe("opening lookup", () => {
  const line = (over: Partial<OpeningLine>): OpeningLine => ({
    id: over.id ?? "x",
    eco: over.eco ?? "C00",
    name: over.name ?? "Line",
    family: over.family ?? "Family",
    popularity: over.popularity ?? 50,
    tags: [],
    note: "",
    moves: over.moves ?? [],
    source: "builtin",
    updatedAt: 0,
    deleted: over.deleted,
  });

  it("prefers the deepest catalogued line the game actually followed", () => {
    const book = [line({ moves: ["e4", "e5"], name: "Short" }), line({ moves: ["e4", "e5", "Nf3"], name: "Deeper" })];
    assert.equal(matchOpening(["e4", "e5", "Nf3", "Nc6"], book)?.name, "Deeper");
    assert.equal(matchOpening(["e4", "e5", "Nf3", "Nc6"], book)?.ply, 3);
  });

  it("needs the whole line played, and gives up when the book runs out", () => {
    const book = [line({ moves: ["e4", "e5", "Nf3"] })];
    assert.equal(matchOpening(["e4", "e5", "d6"], book), null);
    assert.equal(matchOpening(["e4", "e5"], book), null, "the game stopped before the line did");
    assert.equal(matchOpening(["e4", "e5", "Nf3", "Nf6", "d4"], book)?.ply, 3, "extra plies do not undo a match");
  });

  it("ignores check marks, an empty book and lines that were deleted", () => {
    assert.equal(matchOpening(["e4", "e5", "Bb5+"], [line({ moves: ["e4", "e5", "Bb5"] })])?.ply, 3);
    assert.equal(matchOpening(["e4", "e5"], []), null);
    assert.equal(matchOpening(["e4", "e5"], [line({ moves: ["e4", "e5"], deleted: true })]), null);
    assert.equal(matchOpening(["e4", "e5"], [line({ moves: [] })]), null);
  });

  it("breaks an equal-depth tie by popularity", () => {
    const book = [line({ moves: ["d4", "d5"], name: "Rare", popularity: 10 }), line({ moves: ["d4", "d5"], name: "Common", popularity: 90 })];
    assert.equal(matchOpening(["d4", "d5", "Nf3"], book)?.name, "Common");
  });

  it("names a real game from the shipped book", () => {
    const found = matchOpening(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"], OPENINGS);
    assert.equal(found?.eco, "C50");
    assert.equal(found?.name, "Italian Game");
    assert.equal(found?.ply, 6);
  });
});
