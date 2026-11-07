import { Chess } from "chess.js";
import type { Side } from "./types";

/** The colour is kept so a hand-made move only answers a queued move of its own side. */
export type QueuedMove = { from: string; to: string; promotion?: string; color: Side };

/** Six is room to plan a sequence without letting a stale queue run the game for you. */
export const PREMOVE_LIMIT = 6;

/**
 * Add a move to the back of the queue. When it is already full the newest click replaces the
 * furthest-future intent, so the moves about to fire are the ones you queued first.
 */
export function enqueuePremove(queue: QueuedMove[], move: QueuedMove, limit = PREMOVE_LIMIT): QueuedMove[] {
  if (queue.length >= limit) return [...queue.slice(0, limit - 1), move];
  return [...queue, move];
}

/** The SAN a queued move would produce in this position, or null if the position rejects it. */
export function premoveSan(fen: string, move: QueuedMove): string | null {  try {
    return new Chess(fen).move({
      from: move.from,
      to: move.to,
      promotion: move.promotion as "q" | "r" | "b" | "n" | undefined,
    }).san;
  } catch {
    return null;
  }
}

/**
 * Take the head of the queue against the position the opponent actually left behind. Only the head
 * gets a turn to play, so an illegal head is cancelled on its own and the rest wait for a later turn.
 */
export function dequeuePremove(
  fen: string,
  queue: QueuedMove[],
): { move: QueuedMove | null; cancelled: QueuedMove | null; remaining: QueuedMove[] } {
  const [head, ...rest] = queue;
  if (!head) return { move: null, cancelled: null, remaining: [] };
  return premoveSan(fen, head) ? { move: head, cancelled: null, remaining: rest } : { move: null, cancelled: head, remaining: rest };
}

/**
 * A move made by hand supersedes the queued head only when that head was this side's turn to take,
 * so a two-human game never eats the reply the other player was still planning.
 */
export function dropAnsweredPremove(queue: QueuedMove[], color: Side): QueuedMove[] {
  return queue[0]?.color === color ? queue.slice(1) : queue;
}

export function premoveLabel(move: QueuedMove): string {
  return `${move.from}→${move.to}${move.promotion ? `=${move.promotion.toUpperCase()}` : ""}`;
}

/**
 * The squares a selected piece could play to if it were this side's turn — the ghost moves that
 * make a queue clickable before the opponent has answered. Handing the turn over in a copy of the
 * position is what lets chess.js list them, so en passant is dropped: it cannot cross a turn swap.
 */
export function premoveTargets(fen: string, from: string): string[] {
  try {
    const position = new Chess(fen);
    const piece = position.get(from as "a1");
    if (!piece || piece.color === position.turn()) return [];
    const probe = new Chess(withTurn(position.fen(), piece.color));
    return [...new Set(probe.moves({ square: from as "a1", verbose: true }).map((move) => move.to))];
  } catch {
    return [];
  }
}

function withTurn(fen: string, color: Side): string {
  const rows = fen.split(" ");
  return [rows[0], color, rows[2], "-", rows[4], rows[5]].join(" ");
}

/**
 * Where a grabbed piece would stand once the intents already queued for it have played out, and the
 * position it would stand in. Only that piece's own chain is applied: the opponent's replies are not
 * known yet, so the rest of the queue is a plan for later turns rather than part of this projection.
 * Each entry is played from a copy handed to us, which leaves the opponent to move again — the same
 * frame the next intent is read from.
 */
export function premoveProjection(fen: string, queue: QueuedMove[], from: string): { fen: string; from: string } {
  try {
    const position = new Chess(fen);
    const ours = position.get(from as "a1")?.color;
    if (!ours || ours === position.turn()) return { fen, from };
    let square = from;
    for (const move of queue) {
      if (move.from !== square) continue;
      // Tried in a copy handed over to us, so an entry that cannot play leaves the projection untouched.
      const trial = new Chess(withTurn(position.fen(), ours));
      try {
        trial.move({ from: move.from, to: move.to, promotion: move.promotion as "q" | "r" | "b" | "n" | undefined });
      } catch {
        break;
      }
      // The reply is still the opponent's to give, which is the frame the next intent is read from.
      position.load(trial.fen());
      square = move.to;
    }
    return { fen: position.fen(), from: square };
  } catch {
    return { fen, from };
  }
}
