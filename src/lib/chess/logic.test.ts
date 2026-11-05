import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { judgeEndgame } from "./endgame-result.ts";
import { parsePgn, replay, statusOf } from "./rules.ts";
import { applyGrade, blankReview, gradeFromDrill } from "./srs.ts";
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
