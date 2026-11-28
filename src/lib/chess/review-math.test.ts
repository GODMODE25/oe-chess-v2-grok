import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import {
  gradeOf,
  infoCp,
  mateCp,
  moveAccuracy,
  ownerOf,
  positionLedger,
  seatsOf,
  summarizeReview,
  terminalCp,
  winPct,
} from "./review-math.ts";
import type { EngineInfo, MoveGrade, ReviewedMove, SideReview } from "./types.ts";

function row(lossWin: number, overrides: Partial<ReviewedMove> = {}): ReviewedMove {
  const grade: MoveGrade = lossWin >= 30 ? "blunder" : lossWin >= 20 ? "mistake" : lossWin >= 10 ? "inaccuracy" : lossWin < 1 ? "best" : "good";
  return {
    cp: 0,
    mate: null,
    loss: Math.round(lossWin * 4),
    lossWin,
    grade,
    bestUci: "e2e4",
    bestSan: "e4",
    bestLine: "e4",
    depth: 16,
    ...overrides,
  };
}

const humanSeats = { w: { engine: false, strength: 2000 }, b: { engine: false, strength: 2000 } };

function info(overrides: Partial<EngineInfo>): EngineInfo {
  return { depth: 16, seldepth: 18, score: "", cp: 0, mate: null, nodes: 0, nps: 0, pv: "", pvUci: [], ...overrides };
}

describe("win chance curve", () => {
  it("puts a level position at half and grows with the advantage", () => {
    assert.equal(winPct(0), 50);
    assert.ok(winPct(120) > winPct(60));
    assert.ok(winPct(60) > 50);
  });

  it("stays inside a percentage and mirrors around the draw", () => {
    for (const cp of [-2000, -300, -1, 1, 300, 2000]) {
      const pct = winPct(cp);
      assert.ok(pct > 0 && pct < 100, `${cp} gave ${pct}`);
      assert.ok(Math.abs(winPct(cp) + winPct(-cp) - 100) < 1e-9);
    }
  });

  it("reads a mate as a saturated percentage, signed by who is getting mated", () => {
    assert.ok(mateCp(1, "w") > 9000);
    assert.ok(mateCp(1, "b") < -9000);
    assert.ok(mateCp(1, "w") > mateCp(6, "w"), "mate in 1 should outweigh mate in 6");
    assert.ok(mateCp(-2, "w") < -9000, "a mate for the opponent flips the sign");
    assert.equal(mateCp(60, "w"), mateCp(50, "w"), "depths past the cap saturate");
    assert.equal(infoCp(info({ mate: 3, cp: null }), "b"), mateCp(3, "b"));
    assert.equal(infoCp(info({ mate: null, cp: 42 }), "b"), 42, "a pawn count is used as-is");
  });
});

describe("grades", () => {
  it("bands win-chance loss at 10, 20 and 30", () => {
    assert.equal(gradeOf(9.9, false), "good");
    assert.equal(gradeOf(10, false), "inaccuracy");
    assert.equal(gradeOf(19.9, false), "inaccuracy");
    assert.equal(gradeOf(20, false), "mistake");
    assert.equal(gradeOf(29.9, false), "mistake");
    assert.equal(gradeOf(30, false), "blunder");
    assert.equal(gradeOf(0, false), "good");
  });

  it("calls the engine's own choice best whatever the loss was", () => {
    assert.equal(gradeOf(30, true), "best");
    assert.equal(gradeOf(0, true), "best");
  });

  it("scores a move by the win chance it gave up and stays inside 0..100", () => {
    assert.ok(Math.abs(moveAccuracy(0) - 100) < 0.01);
    assert.ok(moveAccuracy(5) < moveAccuracy(1));
    assert.ok(moveAccuracy(40) < moveAccuracy(20));
    assert.equal(moveAccuracy(120), 0);
    assert.ok(Math.abs(moveAccuracy(-5) - 100) < 0.01, "a gain cannot read as worse than level");
    for (const lossWin of [0, 3, 12, 25, 60, 400]) {
      const accuracy = moveAccuracy(lossWin);
      assert.ok(accuracy >= 0 && accuracy <= 100);
    }
  });
});

describe("terminal scores", () => {
  it("names the loser of a mate and treats every other finish as level", () => {
    assert.equal(terminalCp(new Chess("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3")), -10000);
    assert.equal(terminalCp(new Chess("r3k2r/ppp1p1pp/2n5/3pQp2/2b2P2/2P5/PP1PN1PP/RN2K2R b KQkq f3 0 10")), null, "a live position has no terminal score");
    assert.equal(terminalCp(new Chess("k7/8/1Q6/8/8/8/8/7K b - - 0 1")), 0, "stalemate is level");
  });
});

describe("position ledger", () => {
  it("lines each position up with the move played FROM it", () => {
    const sans = ["e4", "e5", "Nf3", "Nc6"];
    const rows = positionLedger(undefined, sans);
    assert.equal(rows.length, sans.length + 1);
    assert.equal(rows[0].fen, new Chess().fen());
    assert.equal(rows[0].turn, "w");
    assert.equal(rows[0].playedUci, "e2e4");
    assert.equal(rows[1].turn, "b");
    assert.equal(rows[1].playedUci, "e7e5", "row 1 is the position Black faced, with Black's reply");

    const afterE4 = new Chess(rows[0].fen);
    afterE4.move("e4");
    assert.equal(rows[1].fen, afterE4.fen(), "row 1 is exactly where 1.e4 left the game");

    const walk = new Chess();
    for (const [index, entry] of rows.entries()) {
      assert.equal(entry.fen, walk.fen(), `row ${index} is the position the mover actually faced`);
      if (entry.playedUci) walk.move(entry.playedUci);
    }
    assert.equal(rows[3].playedUci, "b8c6");
    assert.equal(rows[4].playedUci, "", "the last position has no move after it");
    assert.equal(rows[4].turn, "w");
  });

  it("starts from a stored position when the game did not begin at the default", () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
    const rows = positionLedger(fen, ["Nf3"]);
    assert.equal(rows[0].fen, new Chess(fen).fen());
    assert.equal(rows[0].playedUci, "g1f3");
    assert.equal(rows[1].playedUci, "");
  });

  it("records promotions with the piece chosen", () => {
    const rows = positionLedger("8/P7/8/8/8/8/k7/7K w - - 0 1", ["a8=Q"]);
    assert.equal(rows[0].playedUci, "a7a8q");
  });

  it("counts the legal replies so a forced move can be skipped", () => {
    const forced = positionLedger("k7/7Q/8/8/8/8/8/K7 b - - 0 1", ["Kb8"]);
    assert.equal(forced[0].legal, 1, "the queen on h7 leaves Black one square");
    const open = positionLedger(undefined, ["e4"]);
    assert.equal(open[0].legal, 20);
    assert.equal(open[1].legal, 20, "after 1.e4 Black still has twenty replies");
  });

  it("refuses a move that is not legal in the recorded position", () => {
    assert.throws(() => positionLedger(undefined, ["e4", "e5", "Ke3"]), /Move 3 \(Ke3\) is not legal/);
    assert.throws(() => positionLedger(undefined, ["e4", "squiggle"]), /Move 2 \(squiggle\) is not legal/);
  });
});

describe("per-side summary", () => {
  it("assigns plies by turn order from whichever side opened", () => {
    assert.equal(ownerOf(0, "w"), "w");
    assert.equal(ownerOf(1, "w"), "b");
    assert.equal(ownerOf(0, "b"), "b");
    assert.equal(ownerOf(3, "b"), "w");

    const rows = [row(0), row(30), row(0), row(30)];
    const whiteFirst = summarizeReview(rows, "w", humanSeats);
    assert.equal(whiteFirst.w.counts.blunder, 0);
    assert.equal(whiteFirst.b.counts.blunder, 2);
    const blackFirst = summarizeReview([row(30), row(0), row(30), row(0)], "b", humanSeats);
    assert.equal(blackFirst.b.counts.blunder, 2, "an odd first ply still belongs to the side that moved first");
    assert.equal(blackFirst.w.counts.blunder, 0);
  });

  it("averages accuracy and centipawn loss over each side's own moves", () => {
    const rows = [row(0), row(20), row(10), row(30)];
    const sides = summarizeReview(rows, "w", humanSeats);
    assert.ok(Math.abs(sides.w.accuracy - (moveAccuracy(0) + moveAccuracy(10)) / 2) < 1e-9);
    assert.ok(Math.abs(sides.b.accuracy - (moveAccuracy(20) + moveAccuracy(30)) / 2) < 1e-9);
    assert.equal(sides.w.acpl, (0 + 40) / 2);
    assert.equal(sides.b.acpl, (80 + 120) / 2);
  });

  it("leaves one-reply moves out of accuracy, but still counts them as best", () => {
    const rows = [row(0, { forced: true }), row(20), row(0, { forced: true }), row(0)];
    const sides = summarizeReview(rows, "w", humanSeats);
    assert.ok(Math.abs(sides.w.accuracy - 100) < 0.01, "both White replies were forced, so nothing was graded");
    assert.equal(sides.w.forced, 2);
    assert.equal(sides.w.counts.best, 2);
    const mixed = summarizeReview([row(20), row(0, { forced: true })], "w", humanSeats);
    assert.ok(Math.abs(mixed.b.accuracy - 100) < 0.01);
    assert.equal(mixed.b.forced, 1);
    assert.ok(mixed.w.forced === 0 || mixed.w.forced === undefined);
  });

  it("estimates every seat from its accuracy, the engine included", () => {
    const rows = [row(0), row(0)];
    const vsEngine = summarizeReview(rows, "w", { w: { engine: false, strength: 2000 }, b: { engine: true, strength: 2200 } });
    assert.equal(vsEngine.b.estimated, true);
    assert.equal(vsEngine.w.estimated, true);
    assert.equal(vsEngine.w.rating, 2200 + 400, "100% accuracy against a 2200 engine anchors at +400");
    assert.equal(vsEngine.b.rating, 2600 + 400, "the engine is read against the human's own estimate");
    const engineVsWeakHuman = summarizeReview([row(30), row(0)], "w", { w: { engine: false, strength: 2000 }, b: { engine: true, strength: 1600 } });
    assert.ok(engineVsWeakHuman.b.rating < vsEngine.b.rating, "a weaker field drags the engine's performance down too");
    assert.notEqual(engineVsWeakHuman.b.rating, 1600, "the set strength is no longer what gets reported");
    const twoHumans = summarizeReview([row(30), row(30)], "w", humanSeats);
    assert.ok(twoHumans.w.rating >= 400 && twoHumans.w.rating <= 3500);
    assert.ok(twoHumans.w.rating < 1500, "a blundering game should estimate below the anchor");
  });

  it("has nothing to say about a game with no moves", () => {
    const sides: { w: SideReview; b: SideReview } = summarizeReview([], "w", humanSeats);
    assert.equal(sides.w.accuracy, 0);
    assert.equal(sides.b.acpl, 0);
    assert.equal(sides.w.forced, 0);
  });

  it("reads the engine seat from who the player chose to be", () => {
    assert.equal(seatsOf({ playerColor: "w", engineElo: 1500 }).b.engine, true);
    assert.equal(seatsOf({ playerColor: "w", engineElo: 1500 }).w.engine, false);
    assert.equal(seatsOf({ playerColor: "either", engineElo: 1500 }).w.engine, false);
    assert.equal(seatsOf({ playerColor: "either", engineElo: 1500 }).b.engine, false);
    assert.equal(seatsOf({ playerColor: "b", engineElo: "max" }).w.strength, 3190);
    assert.equal(seatsOf({ playerColor: "b", engineElo: undefined }).w.strength, 2000);
  });
});
