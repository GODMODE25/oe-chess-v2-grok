import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TIER_RULES,
  assignTier,
  countLeaves,
  extractLines,
  ownerOf,
  parseMoveText,
  scorePctFor,
  treeToRows,
} from "./fetch-lichess-openings.mjs";

test("ownerOf: defenses and countergambits belong to black", () => {
  assert.equal(ownerOf("Sicilian Defense"), "b");
  assert.equal(ownerOf("French Defece typo"), "w");
  assert.equal(ownerOf("King's Indian Defence"), "b");
  assert.equal(ownerOf("Danish Countergambit"), "b");
  assert.equal(ownerOf("Italian Game"), "w");
});

test("scorePctFor is owner-relative", () => {
  const stats = { w: 100, b: 400, d: 100 };
  assert.equal(scorePctFor(stats, "b"), ((400 + 50) / 600) * 100);
  assert.equal(scorePctFor(stats, "w"), ((100 + 50) / 600) * 100);
  assert.equal(scorePctFor({ w: 0, b: 0, d: 0 }, "w"), 50);
});

test("assignTier walks the bands and flags obscurity as trash", () => {
  assert.equal(assignTier({ games: 100, scorePct: 60 }), "trash");
  assert.equal(assignTier({ games: 50_000, scorePct: 53.5 }), "s");
  assert.equal(assignTier({ games: 50_000, scorePct: 53.5, minGames: 0 }), "s");
  assert.equal(assignTier({ games: 6_000, scorePct: 52 }), "a");
  assert.equal(assignTier({ games: 6_000, scorePct: 50 }), "b");
  assert.equal(assignTier({ games: 6_000, scorePct: 48 }), "c");
  assert.equal(assignTier({ games: 6_000, scorePct: 40 }), "d");
  // S volume bar not met falls through to A/B/C/D even with a great score.
  assert.equal(assignTier({ games: 9_000, scorePct: 56 }), "a");
});

test("parseMoveText strips numbers, comments, clocks, results, and check marks", () => {
  const tokens = parseMoveText('1. e4 {note} e5 2. Nf3+ (1. d4 d5) Nc6 $1 {[%clk 0:01:00]} 1/2-1/2');
  assert.deepEqual(tokens, ["e4", "e5", "Nf3", "Nc6"]);
});

test("parseMoveText tolerates move numbers glued to the move", () => {
  assert.deepEqual(parseMoveText("2...d6 3.Bg5"), ["d6", "Bg5"]);
});

test("extractLines keeps the top lines by count and prunes thin branches", () => {
  const kids = [
    { san: "Nf6", cnt: 1000, kids: [
      { san: "g3", cnt: 600, kids: [{ san: "g6", cnt: 300, kids: [] }, { san: "e6", cnt: 250, kids: [] }] },
      { san: "e3", cnt: 350, kids: [{ san: "d5", cnt: 340, kids: [] }] },
      { san: "rarity", cnt: 5, kids: [{ san: "zzz", cnt: 5, kids: [] }] },
    ] },
    { san: "c5", cnt: 800, kids: [{ san: "Nf3", cnt: 800, kids: [] }] },
  ];
  const out = extractLines(kids, 3, 10);
  assert.equal(countLeaves(out), 3);
  const paths = [];
  const walk = (nodes, trail) => {
    for (const node of nodes) {
      if (!node.kids.length) paths.push([...trail, node.san].join(" "));
      else walk(node.kids, [...trail, node.san]);
    }
  };
  walk(out, []);
  assert.ok(paths.includes("c5 Nf3"));
  assert.ok(!paths.some((p) => p.includes("rarity")));
});

test("extractLines preserves game counts on kept nodes", () => {
  const kids = [{ san: "e4", cnt: 999, kids: [{ san: "c5", cnt: 500, kids: [] }] }];
  const out = extractLines(kids, 10, 10);
  assert.equal(out[0].cnt, 999);
});

test("countLeaves counts unfinished paths", () => {
  const kids = [
    { san: "a", cnt: 5, kids: [{ san: "b", cnt: 5, kids: [] }] },
    { san: "c", cnt: 3, kids: [] },
  ];
  assert.equal(countLeaves(kids), 2);
});

test("treeToRows flattens a trie into named lines, loudest first", () => {
  const course = { id: "white-italian", name: "Italian Game", root: ["e4", "e5", "Nf3"] };
  const nodes = [
    { san: "Nc6", cnt: 5000, kids: [{ san: "d4", cnt: 3000, kids: [] }, { san: "Bb5", cnt: 1500, kids: [] }] },
    { san: "d6", cnt: 900, kids: [{ san: "d4", cnt: 900, kids: [] }] },
  ];
  const rows = treeToRows(course, nodes, 1_700_000_000_000, 10, "C50", "Open Game");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].moves, ["e4", "e5", "Nf3", "Nc6", "d4"]);
  assert.equal(rows[0].name, "Italian Game: main master line");
  assert.equal(rows[1].name, "Italian Game: Bb5 line");
  assert.equal(rows[2].name, "Italian Game: d6 line");
  assert.equal(rows[0].eco, "C50");
  assert.equal(rows[0].family, "Open Game");
  assert.equal(rows[0].source, "builtin");
  assert.match(rows[0].note, /3,000 master games/);
  assert.ok(rows.every((row) => row.id.startsWith("gen-white-italian-lx-")));
});
