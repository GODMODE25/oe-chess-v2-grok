/**
 * Build-time opening stats + tree generator.
 *
 * Streams monthly rated-game dumps from database.lichess.org (the anonymous
 * opening-explorer API is authentication-gated now, the dumps are not), keeps
 * only master games (both elo >= --min-elo), and derives:
 *   - src/lib/data/openings-meta.ts       tier S/A/B/C/D/trash + master stats per builtin line
 *   - src/lib/data/course-extras.ts       up to --budget master-played lines per S-tier/legendary course
 *   - assets/db/openings-stats.json       raw per-line counts for provenance
 * Per-month aggregates are cached in scripts/cache/lichess/, so --offline or a
 * second run costs nothing. Outputs are committed; the app never fetches.
 *
 * Run:  node scripts/fetch-lichess-openings.mjs [--months 2026-08,2026-09] [--offline]
 *       [--min-elo 2400] [--budget 100] [--max-ply 24] [--continuation 22] [--expand courseId]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { createInterface } from "node:readline";
import { createZstdDecompress } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Chess } from "chess.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, "scripts", "cache", "lichess");
const BASE_URL = "https://database.lichess.org";

// --- Tunable rules -----------------------------------------------------------

export const TIER_RULES = {
  /** Games at the family ply under this are unplayable at master level. */
  trashBelowGames: 300,
  /** Owner score (wins + half draws) cutoffs, percent. First match from the top wins. */
  bands: [
    { tier: "s", scorePct: 53.0, minGames: 40_000 },
    { tier: "a", scorePct: 51.5, minGames: 5_000 },
    { tier: "b", scorePct: 49.5, minGames: 0 },
    { tier: "c", scorePct: 47.5, minGames: 0 },
    { tier: "d", scorePct: 0, minGames: 0 },
  ],
  /** Family-defining prefix depth used for tiering; long lines are counted here. */
  familyPly: 6,
};

// --- Pure helpers (unit-tested offline) ---------------------------------------

export function ownerOf(name) {
  return /defen[cs]e|countergambit/i.test(name) ? "b" : "w";
}

export function scorePctFor(stats, owner) {
  const total = stats.w + stats.b + stats.d;
  if (!total) return 50;
  const wins = owner === "w" ? stats.w : stats.b;
  return ((wins + 0.5 * stats.d) / total) * 100;
}

export function assignTier(stats, rules = TIER_RULES) {
  if (stats.games < rules.trashBelowGames) return "trash";
  return rules.bands.find((band) => stats.games >= band.minGames && stats.scorePct >= band.scorePct)?.tier ?? "d";
}

export function countLeaves(nodes) {
  let rows = 0;
  for (const node of nodes) {
    if (!node.kids.length) rows += 1;
    else rows += countLeaves(node.kids);
  }
  return rows;
}

/**
 * Keep the `budget` most-played root-to-leaf lines. Prunes children below the
 * floor and over the breadth cap first, then rebuilds a trie containing only
 * the chosen lines, preserving each surviving node's real game count.
 */
export function extractLines(kids, budget = 100, minCnt = 12, breadthCap = 24) {
  const prune = (nodes) =>
    nodes
      .filter((node) => node.cnt >= minCnt)
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, breadthCap)
      .map((node) => ({ san: node.san, cnt: node.cnt, kids: prune(node.kids) }));
  const kept = prune(nodes_copy(kids));
  const lines = [];
  const collect = (node, trail) => {
    const next = [...trail, node];
    if (!node.kids.length) lines.push({ path: next, cnt: node.cnt });
    else for (const kid of node.kids) collect(kid, next);
  };
  for (const kid of kept) collect(kid, []);
  lines.sort((a, b) => b.cnt - a.cnt);
  const chosen = lines.slice(0, budget).map((row) => row.path);
  // Rebuild by marking every node on a chosen path, then dropping unmarked ones.
  for (const path of chosen) for (const node of path) node.keep = true;
  const rebuild = (nodes) =>
    nodes
      .filter((node) => node.keep)
      .map((node) => ({ san: node.san, cnt: node.cnt, kids: rebuild(node.kids) }));
  return rebuild(kept);
}

function nodes_copy(nodes) {
  return nodes.map((node) => ({ san: node.san, cnt: node.cnt, kids: nodes_copy(node.kids) }));
}

// --- Book + courses -------------------------------------------------------------

function loadBook() {
  const rows = JSON.parse(readFileSync(path.join(ROOT, "assets", "db", "openings.json"), "utf8"));
  const src = readFileSync(path.join(ROOT, "src", "lib", "data", "extra-openings.ts"), "utf8");
  const re = /line\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*\[([^\]]*)\]/g;
  for (const match of src.matchAll(re)) {
    rows.push({
      id: match[1],
      eco: match[2],
      name: match[3],
      family: match[4],
      note: match[5],
      moves: match[6].split(",").map((row) => row.trim().replace(/^"|"$/g, "")).filter(Boolean),
      source: "builtin",
    });
  }
  // Check/mark decorations must not fork trie keys against raw PGN tokens.
  for (const row of rows) row.moves = row.moves.map((san) => san.replace(/[+#]/g, ""));
  return rows;
}

function loadCourses() {
  const src = readFileSync(path.join(ROOT, "src", "lib", "chess", "courses.ts"), "utf8");
  const courseRe =
    /id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*side:\s*"(w|b)",\s*tier:\s*"(legendary|s|unrated)",[\s\S]*?variationNames:\s*\[([^\]]*)\]/g;
  const book = loadBook();
  const rows = [];
  for (const match of src.matchAll(courseRe)) {
    const [, id, name, side, tier, namesBlob] = match;
    const names = namesBlob.split(",").map((row) => row.trim().replace(/^"|"$/g, "")).filter(Boolean);
    const head = book.find((line) => line.name === names[0]);
    if (!head) {
      console.warn(`course ${id}: head variation "${names[0]}" not in book, skipping`);
      continue;
    }
    // Root = head line minus a trailing opponent move, so the course's own setup is committed.
    let root = head.moves;
    const lastMover = root.length % 2 === 1 ? "w" : "b";
    if (lastMover !== side && root.length > 1) root = root.slice(0, -1);
    rows.push({ id, name, side, tier, headId: head.id, eco: head.eco, family: head.family, root });
  }
  return rows;
}

// --- Scan -----------------------------------------------------------------------

function newNode() {
  return { n: 0, w: 0, b: 0, d: 0, kids: new Map() };
}

function serialize(node) {
  const kids = {};
  for (const [san, kid] of node.kids) kids[san] = serialize(kid);
  return { n: node.n, w: node.w, b: node.b, d: node.d, kids };
}

function deserialize(row) {
  const node = { n: row.n, w: row.w, b: row.b, d: row.d, kids: new Map() };
  for (const [san, kid] of Object.entries(row.kids)) node.kids.set(san, deserialize(kid));
  return node;
}

/** Keep the cached continuation tries small: drop thin branches, cap breadth. */
function pruneCache(node, minCnt, cap = 24) {
  const rows = [...node.kids.entries()]
    .filter(([, kid]) => kid.n >= minCnt)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, cap);
  node.kids = new Map(rows);
  for (const [, kid] of node.kids) pruneCache(kid, minCnt, cap);
}

const TAG_RE = /^\[(\w+)\s"([^"]*)"\]/;

/** Strips comments/variations/NAGs/move numbers/results; SANs lose +/# so trie keys stay stable. */
export function parseMoveText(text) {
  return text
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\S+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^\d+\.+/, "").replace(/[+#]$/, ""))
    .filter((token) => token && !["...", "1-0", "0-1", "1/2-1/2", "*", "1/2"].includes(token));
}

async function scanMonth(month, book, courses, args) {
  const cacheFile = path.join(CACHE_DIR, `${month}.json`);
  if (existsSync(cacheFile)) {
    console.log(`[${month}] using cache`);
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }
  if (args.offline) throw new Error(`--offline and ${month} is not cached`);
  const url = `${BASE_URL}/standard/lichess_db_standard_rated_${month}.pgn.zst`;
  console.log(`[${month}] streaming ${url}`);

  const lineTrie = newNode();
  for (const line of book) {
    let node = lineTrie;
    for (const san of line.moves.slice(0, args.maxPly)) {
      if (!node.kids.has(san)) node.kids.set(san, newNode());
      node = node.kids.get(san);
    }
  }
  const rootTrie = newNode();
  for (const [index, course] of courses.entries()) {
    let node = rootTrie;
    for (const san of course.root) {
      if (!node.kids.has(san)) node.kids.set(san, newNode());
      node = node.kids.get(san);
    }
    if (!node.ends) node.ends = [];
    node.ends.push(index);
  }
  const rootTries = courses.map(() => newNode());

  let games = 0;
  let masters = 0;
  let record = null;
  const started = Date.now();
  const input = await openPgnStream(url);
  const rl = createInterface({ input, crlfDelay: Infinity });

  for await (const text of rl) {
    if (text.startsWith("[Tag") || TAG_RE.test(text)) {
      record ??= {};
      const pair = TAG_RE.exec(text);
      if (pair) record[pair[1]] = pair[2];
      continue;
    }
    if (text.trim() === "") {
      if (record) {
        games += 1;
        consume(record);
        record = null;
      }
      continue;
    }
    if (record) (record.moves ??= []).push(...parseMoveText(text));
  }
  if (record) consume(record);

  function consume(rec) {
    const elo = Math.min(Number(rec.WhiteElo || 0), Number(rec.BlackElo || 0));
    if (elo < args.minElo) return;
    masters += 1;
    const outcome = rec.Result === "1-0" ? "w" : rec.Result === "0-1" ? "b" : rec.Result === "1/2-1/2" ? "d" : null;
    if (!outcome || !rec.moves?.length) return;
    const tokens = rec.moves.slice(0, args.maxPly);

    let node = lineTrie;
    for (const san of tokens) {
      const kid = node.kids.get(san);
      if (!kid) break;
      node = kid;
      node.n += 1;
      node[outcome] += 1;
    }

    let walker = rootTrie;
    for (let ply = 0; ply < tokens.length; ply++) {
      const kid = walker.kids.get(tokens[ply]);
      if (!kid) break;
      walker = kid;
      if (!walker.ends) continue;
      for (const index of walker.ends) {
        let cont = rootTries[index];
        cont.n += 1;
        const tail = tokens.slice(ply + 1, ply + 1 + args.continuation);
        for (const san of tail) {
          if (!cont.kids.has(san)) cont.kids.set(san, newNode());
          cont = cont.kids.get(san);
          cont.n += 1;
        }
        cont[outcome] += 1;
      }
    }
  }

  console.log(`[${month}] ${games.toLocaleString()} games, ${masters.toLocaleString()} masters in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  for (const trie of rootTries) pruneCache(trie, Math.max(8, Math.ceil(trie.n * 0.002)));
  const aggregate = {
    month,
    games,
    masters,
    minElo: args.minElo,
    lineTrie: serialize(lineTrie),
    rootTries: rootTries.map((trie, index) => ({ courseId: courses[index].id, trie: serialize(trie) })),
  };
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(aggregate));
  return aggregate;
}

function openPgnStream(url) {
  return new Promise((resolve, reject) => {
    const zst = createZstdDecompress();
    const req = request(url, { headers: { "User-Agent": "oe-chess-db/1.0 (build-time stats)" }, timeout: 120_000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      res.on("error", reject);
      res.pipe(zst);
      resolve(zst);
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`timeout for ${url}`)));
    req.end();
  });
}

// --- Merge + derive ---------------------------------------------------------------

function absorb(from, into) {
  into.n += from.n;
  into.w += from.w;
  into.b += from.b;
  into.d += from.d;
  for (const [san, kid] of from.kids) {
    if (!into.kids.has(san)) into.kids.set(san, newNode());
    absorb(kid, into.kids.get(san));
  }
}

function mergeAggregates(aggregates, courses) {
  const mergedLine = deserialize(aggregates[0].lineTrie);
  const first = aggregates[0].rootTries.map((row) => ({ courseId: row.courseId, trie: deserialize(row.trie) }));
  for (const row of aggregates.slice(1)) {
    absorb(deserialize(row.lineTrie), mergedLine);
    for (const rootRow of row.rootTries) {
      const slot = first.find((item) => item.courseId === rootRow.courseId);
      if (slot) absorb(deserialize(rootRow.trie), slot.trie);
    }
  }
  const byCourse = new Map(first.map((row) => [row.courseId, row.trie]));
  return { mergedLine, byCourse };
}

export function lineStatsAt(nodeLike, owner) {
  const games = nodeLike.n;
  const scorePct = scorePctFor(nodeLike, owner);
  return {
    games,
    white: nodeLike.w,
    black: nodeLike.b,
    drawn: nodeLike.d,
    owner,
    scorePct: Math.round(scorePct * 10) / 10,
    tier: assignTier({ games, scorePct }),
  };
}

function bookStats(mergedLine, book, args) {
  const out = {};
  for (const line of book) {
    const depth = Math.min(line.moves.length, args.maxPly);
    const familyDepth = Math.min(depth, TIER_RULES.familyPly);
    let node = mergedLine;
    let family = null;
    for (let ply = 0; ply < depth; ply++) {
      const kid = node.kids.get(line.moves[ply]);
      if (!kid) break;
      node = kid;
      if (ply + 1 === familyDepth) family = node;
    }
    family ??= { n: 0, w: 0, b: 0, d: 0 };
    out[line.id] = lineStatsAt(family, ownerOf(line.name));
  }
  return out;
}

/** Attach real UCI strings by walking the position tree once. */
function annotateTree(rootChess, kids) {
  const walk = (nodes, chess) => {
    const rows = [];
    for (const node of nodes) {
      let move;
      try {
        move = chess.move(node.san);
      } catch {
        console.warn(`dropping illegal generated move ${node.san}`);
        continue;
      }
      const uci = move.from + move.to + (move.promotion ?? "");
      const childChess = new Chess(chess.fen());
      rows.push({ san: move.san.replace(/[+#]/g, ""), uci, cnt: node.cnt, kids: walk(node.kids, childChess) });
      chess.undo();
    }
    return rows.sort((a, b) => b.cnt - a.cnt);
  };
  return walk(kids, rootChess);
}

/**
 * Flatten a pruned master trie into drillable root-to-leaf lines, loudest first.
 * The name picks the move that parts this line from the busiest one, so a learner
 * sees "…with d4" rather than "master line 7".
 */
export function treeToRows(course, nodes, at, limit = 100, eco = "A00", family = "Generated") {
  const lines = [];
  const walk = (node, trail) => {
    const next = [...trail, node.san];
    if (!node.kids.length) lines.push({ sans: next, cnt: node.cnt });
    else for (const kid of node.kids) walk(kid, next);
  };
  for (const node of nodes) walk(node, []);
  lines.sort((a, b) => b.cnt - a.cnt);
  const kept = lines.slice(0, limit);
  const top = kept[0]?.sans ?? [];
  return kept.map((row, index) => {
    let branch = null;
    for (let ply = 0; ply < row.sans.length; ply++) {
      if (row.sans[ply] !== top[ply]) {
        branch = row.sans[ply];
        break;
      }
    }
    const label = branch ? `${branch} line` : index === 0 ? "main master line" : `${row.sans.at(-1)} line`;
    return {
      id: `gen-${course.id}-lx-${index}`,
      eco,
      name: `${course.name}: ${label}`,
      family,
      popularity: Math.min(99, Math.round(20 + Math.log10(Math.max(1, row.cnt)) * 25)),
      tags: ["generated", course.id, "lichess"],
      note: `${row.cnt.toLocaleString()} master games reached this line in the Lichess rated dumps.`,
      moves: [...course.root, ...row.sans],
      source: "builtin",
      updatedAt: at,
    };
  });
}

function emit(stats, trees, args, months) {
  const now = Date.now();
  const metaRows = Object.fromEntries(
    Object.entries(stats).map(([id, row]) => [
      id,
      { tier: row.tier, games: row.games, white: row.white, black: row.black, drawn: row.drawn, scorePct: row.scorePct, source: "lichess", at: now },
    ]),
  );
  const preamble =
    `// Generated by scripts/fetch-lichess-openings.mjs from Lichess rated dumps ${months.join(",")} (both elo >= ${args.minElo}).\n` +
    `import type { LineTier } from "../chess/types";\n\n` +
    `export type OpeningMeta = {\n  tier: LineTier;\n  games?: number;\n  white?: number;\n  black?: number;\n  drawn?: number;\n  scorePct: number;\n  cp?: number;\n  source: "engine" | "lichess";\n  at: number;\n};\n\n`;
  writeFileSync(path.join(ROOT, "src", "lib", "data", "openings-meta.ts"), `${preamble}export const OPENING_META: Record<string, OpeningMeta> = ${JSON.stringify(metaRows, null, 1)};\n`);
  const rows = [...trees.values()].flat();
  const idMap = Object.fromEntries([...trees.entries()].map(([courseId, list]) => [courseId, list.map((row) => row.id)]));
  writeFileSync(
    path.join(ROOT, "src", "lib", "data", "course-extras.ts"),
    `// Generated by scripts/fetch-lichess-openings.mjs — do not edit by hand.\n` +
      `import type { OpeningLine } from "../chess/types";\n\n` +
      `/** courseId -> line ids of generated variations, replacing the fragile name join. */\n` +
      `export const COURSE_VARIATION_IDS: Record<string, string[]> = ${JSON.stringify(idMap, null, 1)};\n\n` +
      `/** Master-played continuations each course drills, generated at build time. */\n` +
      `export const GENERATED_VARIATIONS: OpeningLine[] = ${JSON.stringify(rows, null, 1)};\n`,
  );
  writeFileSync(path.join(ROOT, "assets", "db", "openings-stats.json"), JSON.stringify({ generatedAt: now, months, minElo: args.minElo, stats }, null, 2));
  const histogram = {};
  for (const row of Object.values(stats)) histogram[row.tier] = (histogram[row.tier] ?? 0) + 1;
  console.log("tier distribution:", histogram);
  console.log(`emitted ${Object.keys(stats).length} meta rows and ${trees.size} course trees`);
}

// --- Main ------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { months: null, offline: false, minElo: 2400, budget: 100, maxPly: 24, continuation: 22, onlyCourse: null };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--offline") out.offline = true;
    else if (key === "--months") out.months = value.split(",");
    else if (key === "--min-elo") out.minElo = Number(value);
    else if (key === "--budget") out.budget = Number(value);
    else if (key === "--max-ply") out.maxPly = Number(value);
    else if (key === "--continuation") out.continuation = Number(value);
    else if (key === "--expand") out.onlyCourse = value;
    else throw new Error(`unknown flag ${key}`);
  }
  return out;
}

function defaultMonths() {
  const rows = [];
  const now = new Date();
  for (let back = 1; rows.length < 3; back++) {
    const day = new Date(now.getFullYear(), now.getMonth() - back, 1);
    rows.push(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`);
  }
  return rows;
}

export async function main(argv) {
  const args = parseArgs(argv);
  const months = args.months ?? defaultMonths();
  const book = loadBook();
  const courses = loadCourses().filter((course) => !args.onlyCourse || course.id === args.onlyCourse);
  console.log(`book: ${book.length} lines; courses: ${courses.length}; months: ${months.join(", ")}`);

  const aggregates = [];
  for (const month of months) {
    try {
      aggregates.push(await scanMonth(month, book, courses, args));
    } catch (error) {
      console.error(`month ${month} failed: ${error.message}`);
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(path.join(CACHE_DIR, "failed.json"), JSON.stringify({ month, error: error.message, at: Date.now() }, null, 2));
    }
  }
  if (!aggregates.length) {
    console.error("no data available (cache empty and offline?)");
    process.exitCode = 1;
    return;
  }

  const { mergedLine, byCourse } = mergeAggregates(aggregates, courses);
  const stats = bookStats(mergedLine, book, args);
  const trees = new Map();
  for (const course of courses) {
    const trie = byCourse.get(course.id);
    if (!trie || trie.n === 0) {
      console.warn(`no master games matched ${course.name}'s root`);
      continue;
    }
    const kids = [...trie.kids].map(([san, node]) => plain(san, node));
    const chosen = extractLines(kids, args.budget, Math.max(10, Math.ceil(trie.n * 0.004)));
    const rootChess = new Chess();
    for (const san of course.root) rootChess.move(san);
    trees.set(course.id, treeToRows(course, annotateTree(rootChess, chosen), Date.now(), args.budget, course.eco ?? "A00", course.family ?? course.name));
  }
  emit(stats, trees, args, months.filter((month) => !args.offline || existsSync(path.join(CACHE_DIR, `${month}.json`))));
}

function plain(san, node) {
  return { san, cnt: node.n, kids: [...node.kids].map(([kidSan, kid]) => plain(kidSan, kid)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
