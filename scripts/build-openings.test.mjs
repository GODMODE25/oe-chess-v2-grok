import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "chess.js";
import { CP_BANDS, TUNE, capTier, cpForSide, divergencePly, ownerOf, pvToSans, scorePctFor, tierForCp, vsBaseline } from "./build-openings.mjs";

test("tierForCp bands the engine verdict and obscurity can only demote", () => {
  assert.equal(tierForCp(35, 90), "s");
  assert.equal(tierForCp(15, 90), "a");
  assert.equal(tierForCp(0, 90), "b");
  assert.equal(tierForCp(-15, 90), "c");
  assert.equal(tierForCp(-40, 90), "d");
  assert.equal(tierForCp(-200, 90), "trash");
  // Rare lines lose exactly one band, including the top one, and D drops out.
  assert.equal(tierForCp(35, TUNE.popularityFloor - 1), "a");
  assert.equal(tierForCp(35, TUNE.popularityFloor), "s");
  assert.equal(tierForCp(-40, 20), "trash");
  // Nothing is ever promoted by popularity.
  assert.equal(tierForCp(-200, 100), "trash");
  assert.equal(CP_BANDS.at(-1).tier, "d");
  assert.ok(TUNE.depth >= 10, "the tiers must be deep enough to mean something");
});

test("cpForSide converts a side-to-move score into the graded side's view", () => {
  assert.equal(cpForSide(35, "w", "w"), 35);
  assert.equal(cpForSide(35, "w", "b"), -35);
  assert.equal(cpForSide(35, "b", "b"), 35);
  assert.equal(cpForSide(-80, "b", "w"), 80);
});

test("vsBaseline grades both colours on the start position's own edge", () => {
  // Stockfish typically sees a small white edge; that edge is the zero of the scale.
  assert.equal(vsBaseline(34, "w", 30), 4);
  assert.equal(vsBaseline(34, "b", 30), -4);
  // Equalising a black defence to the baseline is exactly as good as holding it as White.
  assert.equal(tierForCp(vsBaseline(30, "b", 30), 70), tierForCp(vsBaseline(30, "w", 30), 70));
  // A defence that hands back more than the edge is worse than one that keeps it.
  assert.notEqual(tierForCp(vsBaseline(75, "w", 30), 70), tierForCp(vsBaseline(5, "w", 30), 70));
});

test("scorePctFor is the same logistic the eval bar draws", () => {
  assert.equal(scorePctFor(0), 50);
  assert.equal(scorePctFor(250), 100 / (1 + Math.exp(-0.004 * 250)));
  assert.ok(scorePctFor(120) > 61 && scorePctFor(120) < 62, `1.2 pawns is a modest edge, got ${scorePctFor(120)}`);
  assert.ok(scorePctFor(300) > 75 && scorePctFor(300) < 78, `3 pawns is close to decided, got ${scorePctFor(300)}`);
  assert.ok(scorePctFor(-120) < 39 && scorePctFor(-120) > 38);
  assert.ok(Math.abs(scorePctFor(120) + scorePctFor(-120) - 100) < 1e-9);
});

test("capTier keeps a fifth-choice try from wearing an S badge", () => {
  assert.equal(capTier("s", 1), "s");
  assert.equal(capTier("s", 2), "a");
  assert.equal(capTier("s", 3), "b");
  assert.equal(capTier("s", 5), "c");
  assert.equal(capTier("s", 9), "c");
  // A cap never promotes: a weak line stays weak whatever its rank.
  assert.equal(capTier("d", 1), "d");
  assert.equal(capTier("trash", 3), "trash");
});

test("pvToSans replays the principal variation and stops at the cap", () => {
  const chess = new Chess();
  const sans = pvToSans(chess, ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"], 3);
  assert.deepEqual(sans, ["e4", "e5", "Nf3"]);
  assert.deepEqual(pvToSans(chess, ["e2e4", "e7e9"], 4), ["e4"]);
  assert.deepEqual(pvToSans(chess, ["a1a2"], 4), []);
});

test("pvToSans keeps promotions and never leaves the source board touched", () => {
  const chess = new Chess("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
  assert.deepEqual(pvToSans(chess, ["a7a8q"], 2), ["a8=Q"]);
  assert.equal(chess.fen(), "4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
});

test("divergencePly reports where a generated line parts from its parent", () => {
  assert.equal(divergencePly(["e4", "e5", "Nf3"], ["e4", "e5", "d4"]), 2);
  assert.equal(divergencePly(["d4", "Nf6"], ["d4", "Nf6", "c4", "e6"]), -1);
});

test("ownerOf mirrors the Lichess script so both sources rank the same way", async () => {
  const lichess = await import("./fetch-lichess-openings.mjs");
  for (const name of ["Sicilian Defense: Najdorf Variation", "King's Gambit Accepted", "French Defence", "Danish Countergambit"]) {
    assert.equal(ownerOf(name), lichess.ownerOf(name));
  }
});
