import { Chess, validateFen } from "chess.js";
import type { OpeningLine, Side } from "./types";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function replay(startFen: string, sans: string[]) {
  const chess = new Chess();
  if (startFen && startFen !== START_FEN) {
    chess.load(startFen);
  }
  const uci: string[] = [];
  for (const san of sans) {
    const moved = chess.move(san);
    if (!moved) {
      throw new Error(`Illegal move ${san} from ${chess.fen()}`);
    }
    const promo = moved.promotion ? moved.promotion : "";
    uci.push(`${moved.from}${moved.to}${promo}`);
  }
  return { chess, uci };
}

export function safeReplay(startFen: string, sans: string[]) {
  try {
    return { ok: true as const, ...replay(startFen, sans) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Illegal line" };
  }
}

export function lastMoveOf(chess: Chess): { from: string; to: string } | null {
  const history = chess.history({ verbose: true });
  const last = history[history.length - 1];
  return last ? { from: last.from, to: last.to } : null;
}

/** Positive means White is ahead. Pawns 1, knights and bishops 3, rooks 5, queens 9. */
export function materialBalance(chess: Chess): number {
  let balance = 0;
  for (const row of chess.board()) {
    for (const square of row) {
      if (!square) continue;
      balance += (square.color === "w" ? 1 : -1) * (PIECE_VALUE[square.type] ?? 0);
    }
  }
  return balance;
}

/** White's advantage after each ply, beginning with the starting position itself. */
export function advantageSeries(startFen: string, sans: string[]): number[] {
  const chess = new Chess();
  if (startFen && startFen !== START_FEN) {
    try {
      chess.load(startFen);
    } catch {
      return [];
    }
  }
  const series = [materialBalance(chess)];
  for (const san of sans) {
    try {
      if (!chess.move(san)) break;
    } catch {
      break;
    }
    series.push(materialBalance(chess));
  }
  return series;
}

/** What each colour has lost, heaviest piece first. */
export function capturedPieces(chess: Chess): Record<Side, string[]> {
  const lost: Record<Side, string[]> = { w: [], b: [] };
  for (const move of chess.history({ verbose: true })) {
    if (!move.captured) continue;
    lost[move.color === "w" ? "b" : "w"].push(move.captured);
  }
  for (const side of ["w", "b"] as Side[]) {
    lost[side].sort((a, b) => (PIECE_VALUE[b] ?? 0) - (PIECE_VALUE[a] ?? 0));
  }
  return lost;
}

/** How much the given colour is up, or 0 when level or behind. */
export function materialLead(chess: Chess, color: Side): number {
  const lead = color === "w" ? materialBalance(chess) : -materialBalance(chess);
  return lead > 0 ? lead : 0;
}

export function fenOk(fen: string): boolean {
  return validateFen(fen).ok;
}

/**
 * The FIDE position key: the board, who moves next, the castling rights and the en-passant
 * square. Move counters are not part of a position, so the same arrangement reached later
 * still counts as a repeat.
 */
function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** Plies since the last pawn move or capture. The fifty-move draw lands on 100 of them. */
export function halfmoveClock(chess: Chess): number {
  return Number.parseInt(chess.fen().split(" ")[4] ?? "0", 10) || 0;
}

/** How many times the position on the board has occurred this game, the one on screen included. */
export function repetitionCount(startFen: string, sans: string[]): number {
  const chess = new Chess();
  if (startFen && startFen !== START_FEN) {
    try {
      chess.load(startFen);
    } catch {
      return 1;
    }
  }
  const seen = new Map<string, number>();
  const bump = () => {
    const key = positionKey(chess.fen());
    seen.set(key, (seen.get(key) ?? 0) + 1);
    return key;
  };
  let key = bump();
  for (const san of sans) {
    try {
      chess.move(san);
    } catch {
      break;
    }
    key = bump();
  }
  return seen.get(key) ?? 1;
}

/**
 * Whether one side could ever deliver checkmate, the way the big play sites grade
 * material: a pawn, rook or queen always can; knights alone never can; bishops that
 * only ever cover one colour complex never can; a bishop with a knight, or bishops
 * on both colour complexes, can.
 */
export function canDeliverMate(chess: Chess, side: Side): boolean {
  let knights = 0;
  let darkBishops = 0;
  let lightBishops = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== side) continue;
      if (piece.type === "p" || piece.type === "r" || piece.type === "q") return true;
      if (piece.type === "n") knights += 1;
      if (piece.type === "b") {
        const file = piece.square.charCodeAt(0) - 97;
        const rank = Number(piece.square[1]) - 1;
        if ((file + rank) % 2 === 0) darkBishops += 1;
        else lightBishops += 1;
      }
    }
  }
  if (knights > 0 && darkBishops + lightBishops > 0) return true;
  return darkBishops > 0 && lightBishops > 0;
}

/** Neither side has any way to checkmate: the position is dead and the game ends on its own. */
export function isDeadPosition(chess: Chess): boolean {
  return !canDeliverMate(chess, "w") && !canDeliverMate(chess, "b");
}

/** Flagging only wins when the opponent could still be mated by… wait, by the other side. */
export function timeoutResult(chess: Chess, flagged: Side): { result: string; label: string } {
  const winner: Side = flagged === "w" ? "b" : "w";
  const loser = flagged === "w" ? "White" : "Black";
  const victor = winner === "w" ? "White" : "Black";
  if (canDeliverMate(chess, winner)) {
    return {
      result: winner === "w" ? "1-0" : "0-1",
      label: `${loser} ran out of time — ${victor} wins.`,
    };
  }
  return {
    result: "1/2-1/2",
    label: `${loser} ran out of time, but ${victor} has no mate — draw.`,
  };
}

export function statusOf(chess: Chess): { over: boolean; result: string; label: string } {  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "b" : "w";
    return {
      over: true,
      result: winner === "w" ? "1-0" : "0-1",
      label: winner === "w" ? "Checkmate. White wins." : "Checkmate. Black wins.",
    };
  }
  if (chess.isStalemate()) return { over: true, result: "1/2-1/2", label: "Stalemate. Draw." };
  if (chess.isInsufficientMaterial()) {
    return { over: true, result: "1/2-1/2", label: "Draw by insufficient material." };
  }
  if (isDeadPosition(chess)) {
    return { over: true, result: "1/2-1/2", label: "Draw — neither side can checkmate." };
  }
  if (chess.isThreefoldRepetition()) {
    return { over: true, result: "1/2-1/2", label: "Draw by threefold repetition." };
  }
  if (chess.isDrawByFiftyMoves()) {
    return { over: true, result: "1/2-1/2", label: "Draw by the fifty-move rule." };
  }
  if (chess.isDraw()) return { over: true, result: "1/2-1/2", label: "Draw." };
  if (chess.inCheck()) {
    return { over: false, result: "*", label: chess.turn() === "w" ? "White is in check." : "Black is in check." };
  }
  return { over: false, result: "*", label: chess.turn() === "w" ? "White to move." : "Black to move." };
}

export function applyUciMove(startFen: string, sans: string[], uci: string): string[] | null {
  try {
    const { chess } = replay(startFen, sans);
    const parsed = uciToSquares(uci);
    if (!parsed) return null;
    const moved = chess.move({
      from: parsed.from,
      to: parsed.to,
      promotion: parsed.promotion as "q" | "r" | "b" | "n" | undefined,
    });
    if (!moved) return null;
    return [...sans, moved.san];
  } catch {
    return null;
  }
}

export function uciToSquares(uci: string): { from: string; to: string; promotion?: string } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  };
}

export function gameToPgn(input: {
  white: string;
  black: string;
  result: string;
  event: string;
  startFen: string;
  sans: string[];
  note?: string;
}): string {
  const chess = new Chess();
  if (input.startFen && input.startFen !== START_FEN) chess.load(input.startFen);
  chess.header("Event", input.event || "OE Chess");
  chess.header("Site", "Local");
  chess.header("Date", new Date().toISOString().slice(0, 10).replace(/-/g, "."));
  chess.header("White", input.white || "White");
  chess.header("Black", input.black || "Black");
  chess.header("Result", input.result || "*");
  if (input.note) chess.setComment(input.note);
  for (const san of input.sans) {
    const moved = chess.move(san);
    if (!moved) break;
  }
  chess.header("Result", input.result || "*");
  return chess.pgn({ maxWidth: 80 });
}

/** Check marks are an annotation, not a move: catalog lines are authored with and without them. */
function sanKey(san: string): string {
  return san.trim().replace(/[+#]/g, "");
}

/**
 * The deepest catalogued line the game actually followed, and the ply where it left book.
 * Ties go to the longer line, then to the more popular one, because several ECO codes can
 * describe the same first moves reached by different orders.
 */
export function matchOpening(sans: string[], lines: OpeningLine[]): { eco: string; name: string; family: string; ply: number } | null {
  const played = sans.map(sanKey);
  let best: { eco: string; name: string; family: string; ply: number; popularity: number } | null = null;
  for (const line of lines) {
    if (line.deleted) continue;
    const moves = line.moves;
    if (moves.length === 0 || moves.length > played.length || moves.length < (best?.ply ?? 0)) continue;
    if (!moves.every((move, index) => sanKey(move) === played[index])) continue;
    const popularity = line.popularity ?? 0;
    if (best && moves.length === best.ply && popularity <= best.popularity) continue;
    best = { eco: line.eco, name: line.name, family: line.family, ply: moves.length, popularity };
  }
  if (!best) return null;
  return { eco: best.eco, name: best.name, family: best.family, ply: best.ply };
}

export type ParsedPgn = {
  ok: boolean;
  error?: string;
  headers: Record<string, string>;
  sans: string[];
  comments: { fen: string; comment: string }[];
  startFen: string;
  result: string;
};

export function parsePgn(pgn: string): ParsedPgn {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn, { strict: false });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read that PGN.",
      headers: {},
      sans: [],
      comments: [],
      startFen: START_FEN,
      result: "*",
    };
  }
  if (chess.history().length === 0 && !pgn.includes("1.")) {
    return {
      ok: false,
      error: "No moves found in that PGN.",
      headers: {},
      sans: [],
      comments: [],
      startFen: START_FEN,
      result: "*",
    };
  }
  const headers = chess.getHeaders();
  const startFen = headers.FEN && headers.SetUp === "1" ? headers.FEN : START_FEN;
  return {
    ok: true,
    headers,
    sans: chess.history(),
    comments: chess.getComments().map((c) => ({ fen: c.fen, comment: c.comment })),
    startFen,
    result: headers.Result || "*",
  };
}

export function splitPgnGames(text: string): string[] {
  const chunks = text
    .replace(/\r/g, "")
    .split(/\n(?=\[Event\s)/)
    .map((s) => s.trim())
    .filter((s) => s.includes("[") || /\d+\./.test(s));
  return chunks.length ? chunks : [text.trim()].filter(Boolean);
}
