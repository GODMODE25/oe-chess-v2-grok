import { Chess, type Square } from "chess.js";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { premoveProjection, premoveTargets, type QueuedMove } from "@/lib/chess/premove";
import type { BoardTheme, PieceSet, Side } from "@/lib/chess/types";
import { PieceGlyph } from "./pieces";

type Arrow = { from: string; to: string };

type BoardProps = {
  fen: string;
  orientation?: "white" | "black";
  interactive?: boolean;
  lastMove?: { from: string; to: string } | null;
  arrows?: Arrow[];
  highlights?: string[];
  premoves?: QueuedMove[];
  coordinates?: boolean;
  theme?: BoardTheme;
  pieceSet?: PieceSet;
  humanColors?: Side[];
  onPremove?: (move: QueuedMove) => void;
  onMove?: (from: string, to: string, promotion?: string) => void;
};

function kingSquare(chess: Chess): string | null {
  if (!chess.inCheck()) return null;
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]?.[file];
      if (piece && piece.type === "k" && piece.color === chess.turn()) {
        return `${"abcdefgh"[file]}${8 - rank}`;
      }
    }
  }
  return null;
}

function squareCenter(sq: string, orientation: "white" | "black") {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]) - 1;
  const x = orientation === "white" ? file : 7 - file;
  const y = orientation === "white" ? 7 - rank : rank;
  return { x: x + 0.5, y: y + 0.5 };
}

export function Board({
  fen,
  orientation = "white",
  interactive = false,
  lastMove = null,
  arrows = [],
  highlights = [],
  premoves = [],
  coordinates = true,
  theme = "walnut",
  pieceSet = "standard",
  humanColors,
  onPremove,
  onMove,
}: BoardProps) {
  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: string; x: number; y: number; type: string; color: "w" | "b" } | null>(null);
  const [pending, setPending] = useState<{ from: string; to: string; premove: boolean; color: "w" | "b" } | null>(null);
  const dragIntent = useRef<{ from: string; to: string } | null>(null);

  // Once the position changes the board has moved under any grabbed piece, so nothing stays selected.
  useEffect(() => setSelected(null), [fen]);

  const files = orientation === "white" ? "abcdefgh".split("") : "hgfedcba".split("");
  const ranks = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const legal = chess?.moves({ verbose: true }) ?? [];
  const targets = selected ? legal.filter((move) => move.from === selected).map((move) => move.to) : [];
  // A piece of the side that is not moving keeps its selection, so one grab can queue several
  // destinations. Each further click is read from where the piece will already be standing after
  // the intents queued for it, so one grab walks it: a2→a3 then a3→a4, not a2→a3 and a2→a4.
  const premoveChain = useMemo(() => {
    if (!selected || !onPremove) return null;
    const projected = premoveProjection(fen, premoves, selected);
    return { ...projected, targets: premoveTargets(projected.fen, projected.from) };
  }, [fen, premoves, selected, onPremove]);
  const checked = chess ? kingSquare(chess) : null;
  // One square can be where move 2 lands and where move 3 starts from, so each keeps its own list.
  const premoveMarks = useMemo(() => {
    const map = new Map<string, { from: number[]; to: number[] }>();
    premoves.forEach((move, index) => {
      for (const key of ["from", "to"] as const) {
        const row = map.get(move[key]) ?? { from: [], to: [] };
        row[key].push(index + 1);
        map.set(move[key], row);
      }
    });
    return map;
  }, [premoves]);

  function owned(sq: string) {
    const piece = chess?.get(sq as Square);
    if (!piece) return null;
    const allowed = humanColors ?? (chess ? [chess.turn()] : []);
    return allowed.includes(piece.color) ? piece : null;
  }

  function tryMove(from: string, to: string) {
    const choices = legal.filter((move) => move.from === from && move.to === to);
    const piece = chess?.get(from as Square);
    if (!choices.length) {
      if (piece && premoveChain?.targets.includes(to)) {
        // The selection stays where it is: the next destination click queues the move this piece
        // would make from where the queue already leaves it, and clicking another piece moves the grab over.
        const origin = premoveChain.from;
        const rank = to[1];
        const promo = piece.type === "p" && ((piece.color === "w" && rank === "8") || (piece.color === "b" && rank === "1"));
        if (promo) setPending({ from: origin, to, premove: true, color: piece.color });
        else onPremove?.({ from: origin, to, color: piece.color });
        return;
      }
      const occupant = chess?.get(to as Square);
      if (occupant && owned(to)) setSelected(to);
      else setSelected(null);
      return;
    }
    if (choices.some((move) => move.promotion)) {
      setPending({ from, to, premove: false, color: piece?.color ?? "w" });
      setSelected(null);
      return;
    }
    if (piece && piece.color !== chess?.turn() && onPremove) onPremove({ from, to, color: piece.color });
    else onMove?.(from, to);
    setSelected(null);
  }

  function onPointerDown(event: PointerEvent, sq: string) {
    if (!interactive || !chess) return;
    dragIntent.current = null;
    // A legal target square keeps the selection, or a two-human game re-selects the victim
    // and click-click captures never fire; only a fresh grab of your own piece re-selects.
    if (selected && selected !== sq && targets.includes(sq as Square)) return;
    const piece = owned(sq);
    if (piece) {
      setSelected(sq);
      setDrag({ from: sq, x: event.clientX, y: event.clientY, type: piece.type, color: piece.color });
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag) return;
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const sq = el?.closest("[data-sq]")?.getAttribute("data-sq");
    const from = drag.from;
    setDrag(null);
    if (sq && sq !== from) {
      dragIntent.current = { from, to: sq };
      tryMove(from, sq);
    }
  }

  function onClickSquare(sq: string) {
    if (!interactive || drag) return;
    // Releasing a drag also fires a click on the square under the pointer. A queued premove leaves
    // the piece selected, so that echo would queue the same intent twice; the move already happened.
    const echoed = dragIntent.current;
    dragIntent.current = null;
    if (echoed && selected === echoed.from && sq === echoed.to) return;
    // A click on the grabbed piece usually just re-arms it, but once a chain is queued the piece's own
    // square is a real destination — the step back is the move the queue would leave it facing.
    if (selected && (selected !== sq || premoveChain?.targets.includes(sq))) tryMove(selected, sq);
    else setSelected(owned(sq) ? sq : null);
  }

  return (
    // No data-board for "theme": that attribute re-declares the square tokens on a
    // nearer element, which would outrank the app theme's own board palette.
    <div className="relative w-full max-w-xl" data-board={theme === "theme" ? undefined : theme}>
      <div
        className="board-frame relative grid aspect-square w-full grid-cols-8 overflow-hidden rounded-xl border border-line shadow-lg touch-none select-none"
        onPointerMove={(event) => drag && setDrag({ ...drag, x: event.clientX, y: event.clientY })}
        onPointerUp={onPointerUp}
      >
        {ranks.map((rank) =>
          files.map((file) => {
            const sq = `${file}${rank}`;
            const light = (file.charCodeAt(0) + rank) % 2 === 1;
            const piece = chess?.get(sq as Square);
            const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
            const isTarget = targets.includes(sq as Square);
            const isPremoveTarget = premoveChain?.targets.includes(sq) ?? false;
            const isPremove = premoveMarks.has(sq);
            const premoveOrder = premoveMarks.get(sq)?.to ?? [];
            const hide = drag?.from === sq;
            return (
              <button
                key={sq}
                type="button"
                data-sq={sq}
                aria-label={sq}
                onPointerDown={(event) => onPointerDown(event, sq)}
                onClick={() => onClickSquare(sq)}
                className={`relative aspect-square ${light ? "bg-board-light" : "bg-board-dark"}`}
              >
                {isLast && <span className="absolute inset-0 bg-brass/35" />}
                {checked === sq && <span className="absolute inset-0 bg-danger/55" />}
                {selected === sq && <span className="absolute inset-1 rounded-sm ring-2 ring-brass" />}
                {highlights.includes(sq) && <span className="absolute inset-0 bg-ok/35" />}
                {isPremove && <span className="absolute inset-0 bg-danger/35" />}
                {premoveOrder.map((order) => (
                  <span
                    key={order}
                    className="absolute top-0 right-0 z-20 grid h-4 w-4 place-items-center rounded-bl-md bg-danger text-[10px] font-semibold text-on-accent"
                  >
                    {order}
                  </span>
                ))}
                {isTarget && !piece && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="h-3 w-3 rounded-full bg-board-mark/50" />
                  </span>
                )}
                {isTarget && piece && <span className="absolute inset-1 rounded-full border-4 border-board-mark/50" />}
                {isPremoveTarget && !piece && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="h-3 w-3 rounded-full bg-danger/50" />
                  </span>
                )}
                {isPremoveTarget && piece && <span className="absolute inset-1 rounded-full border-4 border-danger/50" />}
                {piece && !hide && <PieceGlyph type={piece.type} color={piece.color} set={pieceSet} className="relative z-10 h-full w-full p-1" />}
                {coordinates && file === files[0] && (
                  <span className={`absolute top-0.5 left-1 text-xs ${light ? "text-coord-light" : "text-coord-dark"}`}>{rank}</span>
                )}
                {coordinates && rank === ranks[ranks.length - 1] && (
                  <span className={`absolute right-1 bottom-0 text-xs ${light ? "text-coord-light" : "text-coord-dark"}`}>{file}</span>
                )}
              </button>
            );
          }),
        )}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 8 8">
          {premoves.map((move, index) => {
            const a = squareCenter(move.from, orientation);
            const b = squareCenter(move.to, orientation);
            return (
              <line
                key={`premove-${index}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--color-danger)"
                strokeWidth="0.12"
                strokeDasharray="0.26 0.18"
                strokeLinecap="round"
                opacity="0.85"
              />
            );
          })}
          {arrows.map((arrow) => {
            const a = squareCenter(arrow.from, orientation);
            const b = squareCenter(arrow.to, orientation);
            return (
              <line
                key={`${arrow.from}${arrow.to}`}
                className="board-arrow"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--color-brass)"
                strokeWidth="0.18"
                strokeLinecap="round"
                opacity="0.9"
              />
            );
          })}
        </svg>
      </div>
      {drag && (
        <div className="pointer-events-none fixed z-50 h-16 w-16" style={{ left: drag.x - 32, top: drag.y - 32 }}>
          <PieceGlyph type={drag.type} color={drag.color} set={pieceSet} className="h-full w-full" />
        </div>
      )}
      {pending && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-scrim/70">
          <div className="flex gap-2 rounded-xl bg-surface p-3" role="dialog" aria-label="Choose promotion">
            {["q", "r", "b", "n"].map((type) => (
              <button
                key={type}
                type="button"
                className="h-14 w-14 rounded-lg bg-board-light"
                onClick={() => {
                  if (pending.premove) onPremove?.({ from: pending.from, to: pending.to, promotion: type, color: pending.color });
                  else onMove?.(pending.from, pending.to, type);
                  setPending(null);
                }}
              >
                <PieceGlyph type={type} color={pending.color} set={pieceSet} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
