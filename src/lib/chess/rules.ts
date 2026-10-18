import { Chess, validateFen } from "chess.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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

export function fenOk(fen: string): boolean {
  return validateFen(fen).ok;
}

export function statusOf(chess: Chess): { over: boolean; result: string; label: string } {
  if (chess.isCheckmate()) {
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
