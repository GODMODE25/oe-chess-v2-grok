#!/usr/bin/env node
/**
 * Build-time opening research: ranks the bundled book S-tier → trash and grows
 * engine-verified continuations for the graded courses.
 *
 * Why not Lichess: the anonymous explorer is auth-gated (401) and the monthly
 * dumps are tens of gigabytes at well under a megabyte per second from here, so
 * a stats pull is not a build step anyone could actually wait for. Instead this
 * runs the Stockfish that already ships in the app, in Node, over UCI. Every
 * tier and every generated line is therefore the engine's own verdict, and the
 * generated files say so.
 *
 * Artifacts (all committed, so the app stays offline):
 *   src/lib/data/openings-meta.ts     tier + score per book line
 *   src/lib/data/course-extras.ts     generated continuation lines per course
 *   assets/db/openings-engine.json    provenance of this run
 *
 * Run: npm run db:openings:build [-- --tier-only | --expand-only | --course <id>]
 * Raw searches are cached in scripts/cache/engine/, so a re-run is cheap.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, "scripts", "cache", "engine");
const ENGINE_DIR = path.join(ROOT, "scripts", ".engine");

/**
 * Bands grade a line against the start position, not against zero: White begins
 * a tempo up, so an absolute score would rank every sound defence below every
 * white opening. A line is judged by how much better or worse it leaves its own
 * side than a normal starting position already does.
 */
export const CP_BANDS = [
  { tier: "s", min: 20 },
  { tier: "a", min: 8 },
  { tier: "b", min: -8 },
  { tier: "c", min: -25 },
  { tier: "d", min: -50 },
];

export const TUNE = {
  depth: 14,
  multipv: 5,
  /** Searches per course; each search yields multipv lines, so this grows fast. */
  searchBudget: 22,
  maxPlies: 26,
  /** Plies a principal variation may add before we re-search. */
  tail: 8,
  /** Continuations the engine already condemns this hard are not teaching material. */
  dropBelowCp: -100,
  linesPerCourse: 100,
  /** Book popularity below this loses one band; the book's own scale is 0-100. */
  popularityFloor: 55,
  /** Filled in at run time from the engine's own score of the starting position. */
  baselineCp: null,
};

export function ownerOf(name) {
  return /defen[cs]e|countergambit/i.test(name) ? "b" : "w";
}

export function scorePctFor(cpOwner) {
  return (100 / (1 + Math.exp(-0.004 * cpOwner)));
}

/**
 * Soundness band from the engine's own verdict, with a floor for lines nobody
 * plays: an obscure byline that scores well is still not what a learner should
 * spend reps on, so anything under the popularity floor drops one band. Nothing
 * is ever promoted by popularity.
 */
export function tierForCp(cpOwner, popularity) {
  let rank = CP_BANDS.findIndex((band) => cpOwner >= band.min);
  if (rank < 0) return "trash";
  if (popularity < TUNE.popularityFloor) rank += 1;
  return rank >= CP_BANDS.length ? "trash" : CP_BANDS[rank].tier;
}

/**
 * Soundness is measured against the engine's own score of the starting position,
 * so a black defence is graded on the same scale as a white opening: both are
 * judged by what they gain or lose for their own side relative to a normal game.
 * Expected-score percentages keep using the raw number.
 */
export function vsBaseline(cpWhiteLine, owner, baselineCp) {
  return owner === "w" ? cpWhiteLine - baselineCp : baselineCp - cpWhiteLine;
}

/**
 * A generated line is one of the engine's ranked tries, so its tier cannot be
 * better than its rank deserves: the top choice may be S, the fifth is at best
 * a C. Bands still decide downward from there.
 */
export function capTier(tier, rank) {
  const order = ["s", "a", "b", "c", "d", "trash"];
  // Ranks past the fourth share the C ceiling; d and trash only ever come from bands.
  const cap = order[Math.min(rank - 1, 3)];
  return order[Math.max(order.indexOf(tier), order.indexOf(cap))];
}

/** UCI principal variation to SAN, stopping at the tail cap or the first illegal move. */
export function pvToSans(chess, pvUci, cap) {
  const rows = [];
  const probe = new Chess(chess.fen());
  for (const uci of pvUci) {
    if (rows.length >= cap) break;
    let moved;
    try {
      moved = probe.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    } catch {
      break;
    }
    if (!moved) break;
    rows.push(moved.san.replace(/[+#]/g, ""));
  }
  return rows;
}

/**
 * Engine scores are relative to the side to move (see uci.ts and EvalBar);
 * convert one into the point of view of whichever side we are grading.
 */
export function cpForSide(cpStm, stm, side) {
  return stm === side ? cpStm : -cpStm;
}

/** Ply at which a generated line first parts from its parent, or -1 for a pure extension. */
export function divergencePly(parentSans, sans) {
  for (let i = 0; i < parentSans.length; i++) {
    if (parentSans[i] !== sans[i]) return i;
  }
  return -1;
}

// --- book + courses -----------------------------------------------------------

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
      moves: match[6].split(",").map((row) => row.trim().replace(/^[""]|[""]$/g, "")).filter(Boolean),
      popularity: 70,
    });
  }
  for (const row of rows) {
    row.moves = row.moves.map((san) => san.replace(/[+#]/g, ""));
    if (typeof row.popularity !== "number") row.popularity = 60;
  }
  return rows;
}

function loadCourses(book) {
  const src = readFileSync(path.join(ROOT, "src", "lib", "chess", "courses.ts"), "utf8");
  const re = /id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*side:\s*"(w|b)",\s*tier:\s*"(legendary|s)",[\s\S]*?variationNames:\s*\[([^\]]*)\]/g;
  const rows = [];
  for (const match of src.matchAll(re)) {
    const names = match[5].split(",").map((row) => row.trim().replace(/^[""]|[""]$/g, "")).filter(Boolean);
    const head = book.find((line) => line.name === names[0]);
    if (!head) {
      console.warn(`course ${match[1]}: head variation "${names[0]}" is not in the book, skipping`);
      continue;
    }
    rows.push({ id: match[1], name: match[2], side: match[3], tier: match[4], head });
  }
  return rows;
}

function lineChess(sans) {
  const chess = new Chess();
  for (const san of sans) {
    try {
      if (!chess.move(san)) return null;
    } catch {
      return null;
    }
  }
  return chess;
}

// --- engine -------------------------------------------------------------------

function ensureEngineFiles() {
  mkdirSync(ENGINE_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });
  const js = path.join(ROOT, "public", "engines", "stockfish-19-lite-single.js");
  const wasm = path.join(ROOT, "public", "engines", "stockfish-19-lite-single.wasm");
  // The Node build looks for a wasm next to its own script, named after itself.
  copyFileSync(js, path.join(ENGINE_DIR, "engine.cjs"));
  copyFileSync(wasm, path.join(ENGINE_DIR, "engine.wasm"));
}

class UciEngine {
  constructor() {
    this.waiter = null;
    this.buffer = "";
  }

  start() {
    this.child = spawn(process.execPath, [path.join(ENGINE_DIR, "engine.cjs")], { cwd: ENGINE_DIR, stdio: ["pipe", "pipe", "inherit"] });
    this.child.stdout.on("data", (chunk) => this.onChunk(String(chunk)));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Stockfish did not answer uci in Node")), 40_000);
      this.waiter = { token: "uciok", done: () => (clearTimeout(timeout), resolve()) };
      this.send("uci");
    });
  }

  onChunk(text) {
    this.buffer += text;
    const rows = this.buffer.split("\n");
    this.buffer = rows.pop() ?? "";
    for (const raw of rows) {
      const line = raw.trim();
      if (!line) continue;
      const waiter = this.waiter;
      if (!waiter) continue;
      waiter.onLine?.(line);
      if (line === waiter.token || line.startsWith("bestmove")) {
        this.waiter = null;
        waiter.done?.();
      }
    }
  }

  send(command) {
    this.child.stdin.write(command + "\n");
  }

  async configure({ depth, multipv }) {
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send("setoption name Hash value 128");
    this.send("setoption name Threads value 2");
    this.send("setoption name Use NNUE value true");
    this.send("ucinewgame");
    await this.until("readyok", () => this.send("isready"));
    this.depth = depth;
  }

  until(token, fire) {
    return new Promise((resolve) => {
      this.waiter = { token, done: resolve };
      fire();
    });
  }

  /** Returns one row per multipv line: { cp, mate, pvUci }. */
  evaluate(fen, moves) {
    const cacheKey = path.join(CACHE_DIR, `${createHash("sha1").update(`${fen}|${moves.join(" ")}|${this.depth}`).digest("hex")}.json`);
    if (existsSync(cacheKey)) {
      try {
        return Promise.resolve(JSON.parse(readFileSync(cacheKey, "utf8")));
      } catch {
        // A truncated cache file just costs a re-search.
      }
    }
    const position = `position fen ${fen}${moves.length ? ` moves ${moves.join(" ")}` : ""}`;
    const rows = new Map();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiter = null;
        this.send("stop");
        reject(new Error(`search timed out for ${fen}`));
      }, 180_000);
      this.waiter = {
        token: "bestmove",
        onLine: (line) => {
          if (!line.startsWith("info ")) return;
          const match = /depth (\d+).*?multipv (\d+).*?score (cp|mate) (-?\d+).*?pv (.+)/.exec(line);
          if (!match || Number(match[1]) < this.depth) return;
          rows.set(Number(match[2]), { cp: match[3] === "cp" ? Number(match[4]) : null, mate: match[3] === "mate" ? Number(match[4]) : null, pvUci: match[5].trim().split(" ") });
        },
        done: () => {
          clearTimeout(timeout);
          const best = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
          if (best.length) writeFileSync(cacheKey, JSON.stringify(best));
          resolve(best);
        },
      };
      this.send(position);
      this.send(`go depth ${this.depth}`);
    });
  }

  quit() {
    this.send("quit");
  }
}

/** Mate scores are decided, not graded; ±1000 cp keeps them inside the bands. */
function cpForStm(row) {
  if (row.mate != null) return row.mate > 0 ? 1000 : -1000;
  return row.cp ?? 0;
}

// --- work ----------------------------------------------------------------------

async function tierBook(engine, book, baselineCp) {
  const meta = {};
  let index = 0;
  for (const line of book) {
    index += 1;
    const chess = lineChess(line.moves);
    if (!chess) {
      console.warn(`line ${line.id} (${line.name}) is not legal, leaving it untiered`);
      continue;
    }
    const rows = await engine.evaluate(chess.fen(), []);
    if (!rows.length) continue;
    const owner = ownerOf(line.name);
    const cpWhite = cpForSide(cpForStm(rows[0]), chess.turn(), "w");
    const cpOwner = cpForSide(cpForStm(rows[0]), chess.turn(), owner);
    meta[line.id] = {
      tier: tierForCp(vsBaseline(cpWhite, owner, baselineCp), line.popularity ?? 60),
      scorePct: Number(scorePctFor(cpOwner).toFixed(1)),
      cp: cpOwner,
      source: "engine",
      at: Date.now(),
    };
    if (index % 10 === 0) console.log(`tiered ${index}/${book.length}`);
  }
  return meta;
}

async function expandCourse(engine, course, tune) {
  const root = course.head.moves;
  const rootChess = lineChess(root);
  if (!rootChess) {
    console.warn(`course ${course.id}: head line is not legal, skipping`);
    return [];
  }
  const queue = [{ sans: root, parent: null }];
  const found = [];
  let searches = 0;
  while (queue.length && searches < tune.searchBudget) {
    const node = queue.shift();
    const chess = lineChess(node.sans);
    if (!chess || chess.isGameOver() || node.sans.length >= tune.maxPlies) continue;
    searches += 1;
    const rows = await engine.evaluate(chess.fen(), []);
    console.log(`  ${course.id}: search ${searches}/${tune.searchBudget} at ply ${node.sans.length}`);
    for (const [rank, row] of rows.entries()) {
      const added = pvToSans(chess, row.pvUci, tune.tail);
      if (!added.length) continue;
      const sans = [...node.sans, ...added];
      const cpOwner = cpForSide(cpForStm(row), chess.turn(), course.side);
      if (cpOwner < tune.dropBelowCp) continue;
      found.push({ sans, parent: node, cpOwner, cpWhite: cpForSide(cpForStm(row), chess.turn(), "w"), rank: rank + 1 });
      if (searches + queue.length < tune.searchBudget && added.length >= 4 && sans.length < tune.maxPlies) {
        queue.push({ sans, parent: node });
      }
    }
  }
  const seen = new Set([root.join(" ")]);
  const rows = [];
  for (const item of found) {
    const key = item.sans.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(item);
  }
  return rows.slice(0, tune.linesPerCourse);
}

function generatedLine(course, entry, index, tune, at) {
  const parent = entry.parent?.sans ?? course.head.moves;
  const ply = divergencePly(parent, entry.sans);
  // A pure extension branches at the end of its parent, so the first new move is
  // still the move that says which line this is.
  const branchMove = entry.sans[ply >= 0 ? ply : parent.length] ?? entry.sans.at(-1);
  return {
    row: {
      id: `gen-${course.id}-${index}`,
      eco: course.head.eco ?? "A00",
      name: `${course.name}: ${branchMove} line`,
      family: course.head.family ?? course.name,
      popularity: 60,
      tags: ["generated", course.id],
      note: `Engine continuation of ${course.name}; Stockfish 19 chose ${branchMove} at ply ${parent.length + 1} and scores the line ${pvCpText(entry.cpOwner)} to depth ${tune.depth}.`,
      moves: entry.sans,
      source: "builtin",
      updatedAt: at,
      tier: capTier(tierForCp(vsBaseline(entry.cpWhite, course.side, tune.baselineCp ?? 0), 60), entry.rank ?? 1),
      scorePct: Number(scorePctFor(entry.cpOwner).toFixed(1)),
    },
  };
}

function pvCpText(cpOwner) {
  if (Math.abs(cpOwner) >= 900) return "a forced mate";
  return `${(cpOwner / 100).toFixed(2)} pawns for ${cpOwner >= 0 ? "the line's own side" : "the other side"}`;
}

// --- emit ----------------------------------------------------------------------

function tsModule(header, body) {
  return `// Generated by scripts/build-openings.mjs — do not edit by hand.\n${header}\n${body}\n`;
}

function emit(meta, extras, ids, tune, months) {
  const metaPath = path.join(ROOT, "src", "lib", "data", "openings-meta.ts");
  const existing = existsSync(metaPath) ? readFileSync(metaPath, "utf8") : "";
  const from = existing.indexOf("export type OpeningMeta");
  const to = existing.indexOf("export const OPENING_META");
  const types = from >= 0 && to > from ? existing.slice(from, to).trimEnd() : "";
  // A generated line only exists while the catalog lists it; drop tiers of rows
  // an older run emitted and this one replaced.
  const live = new Set(Object.values(extras).flat().map((row) => row.id));
  const rows = Object.entries(meta)
    .filter(([id]) => !id.startsWith("gen-") || live.has(id))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, value]) => `  ${JSON.stringify(id)}: ${JSON.stringify(value)},`)
    .join("\n");
  writeFileSync(
    metaPath,
    tsModule(
      `import type { LineTier } from "../chess/types";\n\n${types}\n`,
      `export const OPENING_META: Record<string, OpeningMeta> = {\n${rows}\n};`,
    ),
  );

  const lineRows = Object.values(extras)
    .flat()
    .map((row) => `  ${JSON.stringify(row)},`)
    .join("\n");
  const idRows = Object.entries(ids)
    .map(([courseId, list]) => `  ${JSON.stringify(courseId)}: ${JSON.stringify(list)},`)
    .join("\n");
  writeFileSync(
    path.join(ROOT, "src", "lib", "data", "course-extras.ts"),
    tsModule(
      'import type { OpeningLine } from "../chess/types";\n\n/** courseId -> line ids of generated variations, replacing the fragile name join. */',
      `export const COURSE_VARIATION_IDS: Record<string, string[]> = {\n${idRows}\n};\n\n/** Engine continuations each course drills, generated at build time. */\nexport const GENERATED_VARIATIONS: OpeningLine[] = [\n${lineRows}\n];`,
    ),
  );

  writeFileSync(
    path.join(ROOT, "assets", "db", "openings-engine.json"),
    JSON.stringify({ generatedAt: Date.now(), engine: "stockfish-19-lite (vendored, run in Node)", months, tune, meta: Object.keys(meta).length, lines: Object.values(extras).flat().length }, null, 2),
  );
}

function parseArgs(argv) {
  const out = { ...TUNE, months: null, tierOnly: false, expandOnly: false, onlyCourse: null };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--tier-only") out.tierOnly = true;
    else if (key === "--expand-only") out.expandOnly = true;
    else if (key === "--course") (out.onlyCourse = value, i++);
    else if (key === "--months") out.months = value.split(",");
    else if (key === "--depth") (out.depth = Number(value), i++);
    else if (key === "--multipv") (out.multipv = Number(value), i++);
    else if (key === "--budget") (out.searchBudget = Number(value), i++);
    else if (key === "--lines") (out.linesPerCourse = Number(value), i++);
  }
  return out;
}

function existingMeta() {
  const file = path.join(ROOT, "src", "lib", "data", "openings-meta.ts");
  if (!existsSync(file)) return {};
  const text = readFileSync(file, "utf8");
  const start = text.indexOf("= {");
  const end = text.lastIndexOf("};");
  if (start < 0 || end < 0) return {};
  try {
    return JSON.parse(text.slice(start + 2, end + 1));
  } catch {
    return {};
  }
}

/**
 * One JSON row per line, so a partial run (--course, or one that failed) can keep
 * the lines every other course already contributed instead of wiping them.
 */
function existingExtras() {
  const file = path.join(ROOT, "src", "lib", "data", "course-extras.ts");
  if (!existsSync(file)) return { extras: {}, ids: {} };
  const text = readFileSync(file, "utf8");
  const extras = {};
  const catalog = text.slice(text.indexOf("GENERATED_VARIATIONS: OpeningLine[] = ["), text.lastIndexOf("];"));
  for (const match of catalog.matchAll(/^\s*\{.*\},$/gm)) {
    try {
      const row = JSON.parse(match[0].trim().replace(/,$/, ""));
      const courseId = row.tags?.[1];
      if (!courseId) continue;
      (extras[courseId] ??= []).push(row);
    } catch {
      // A row we cannot read is a row the next full run replaces.
    }
  }
  const ids = {};
  const map = text.slice(text.indexOf("COURSE_VARIATION_IDS"), text.indexOf("GENERATED_VARIATIONS"));
  for (const match of map.matchAll(/^\s*("[^"]+"): (\[.*\]),$/gm)) {
    try {
      ids[JSON.parse(match[1])] = JSON.parse(match[2]);
    } catch {
      // ignore
    }
  }
  return { extras, ids };
}

/** Tier counts split by who owns the line, which is how the tempo allowance gets audited. */
function logTierSplit(book, meta) {
  const by = { w: {}, b: {} };
  for (const line of book) {
    const row = meta[line.id];
    if (!row) continue;
    const owner = ownerOf(line.name);
    by[owner][row.tier] = (by[owner][row.tier] ?? 0) + 1;
  }
  console.log(`white-owned tiers: ${JSON.stringify(by.w)}`);
  console.log(`black-owned tiers: ${JSON.stringify(by.b)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const book = loadBook();
  const courses = loadCourses(book).filter((course) => !args.onlyCourse || course.id === args.onlyCourse);
  console.log(`book: ${book.length} lines; courses: ${courses.length}; depth ${args.depth}, multipv ${args.multipv}`);
  ensureEngineFiles();
  const engine = new UciEngine();
  await engine.start();
  await engine.configure({ depth: args.depth, multipv: args.multipv });
  const started = Date.now();
  // One search of the initial position sets the scale every line is graded on.
  const [startRow] = await engine.evaluate(new Chess().fen(), []);
  if (!startRow) throw new Error("no evaluation for the starting position");
  args.baselineCp = cpForStm(startRow);
  console.log(`baseline: Stockfish sees ${args.baselineCp > 0 ? "+" : ""}${args.baselineCp} cp for White at depth ${args.depth}`);
  const meta = args.expandOnly ? {} : await tierBook(engine, book, args.baselineCp);
  if (!args.expandOnly) logTierSplit(book, meta);
  // Lines from courses this run does not touch are carried forward, so a
  // --tier-only or --course run never empties the catalog.
  const carried = existingExtras();
  const extras = { ...carried.extras };
  const ids = { ...carried.ids };
  // Emit as we go: a run interrupted halfway still leaves valid artifacts,
  // because every raw search is cached and a re-run continues from them.
  let merged = { ...existingMeta(), ...meta };
  if (!args.expandOnly) emit(merged, extras, ids, args, args.months ?? ["stockfish"]);
  if (!args.tierOnly) {
    for (const course of courses) {
      console.log(`expanding ${course.id} (${course.name})`);
      let found = [];
      try {
        found = await expandCourse(engine, course, args);
      } catch (error) {
        console.warn(`course ${course.id}: expansion failed (${error instanceof Error ? error.message : error}), keeping earlier courses`);
      }
      const at = Date.now();
      extras[course.id] = found.map((entry, index) => generatedLine(course, entry, index, args, at).row);
      ids[course.id] = extras[course.id].map((row) => row.id);
      // Tiers of generated lines come from the same searches that made them.
      for (const row of extras[course.id]) {
        meta[row.id] = { tier: row.tier, scorePct: row.scorePct, cp: undefined, source: "engine", at: row.updatedAt };
      }
      merged = { ...existingMeta(), ...meta };
      emit(merged, extras, ids, args, args.months ?? ["stockfish"]);
    }
  }
  engine.quit();
  const histogram = {};
  for (const value of Object.values(merged)) histogram[value.tier] = (histogram[value.tier] ?? 0) + 1;
  console.log(`tiers: ${JSON.stringify(histogram)}`);
  console.log(`lines generated: ${Object.values(extras).flat().length}; wrote data modules in ${((Date.now() - started) / 60000).toFixed(1)} min`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
