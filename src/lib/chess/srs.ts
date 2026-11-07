import type { Grade, LineStatus, Review, Side } from "./types";

const DAY = 86_400_000;

export function reviewId(lineId: string, side: Side): string {
  return `${lineId}:${side}`;
}

export function blankReview(lineId: string, side: Side, now: number): Review {
  return {
    id: reviewId(lineId, side),
    lineId,
    side,
    status: "new",
    ease: 2.5,
    intervalDays: 0,
    dueAt: now,
    reps: 0,
    lapses: 0,
    lastMs: null,
    updatedAt: now,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function statusFor(reps: number, intervalDays: number, ease: number, failed: boolean): LineStatus {
  if (failed || reps <= 0) return "learning";
  if (reps >= 5 && intervalDays >= 14 && ease >= 2.2) return "mastered";
  if (reps >= 2) return "review";
  return "learning";
}

/** SM-2 style schedule. Failures and slow answers come back sooner. */
export function applyGrade(review: Review, grade: Grade, now: number, elapsedMs: number | null): Review {
  const next: Review = { ...review, lastMs: elapsedMs, updatedAt: now };
  if (grade === "fail") {
    next.reps = 0;
    next.lapses += 1;
    next.ease = clamp(review.ease - 0.2, 1.3, 2.8);
    next.intervalDays = 10 / 1440;
    next.status = statusFor(0, next.intervalDays, next.ease, true);
    next.dueAt = now + next.intervalDays * DAY;
    return next;
  }
  const bonus = grade === "slow" ? 0.45 : grade === "perfect" ? 1.35 : 1;
  next.reps = review.reps + 1;
  if (next.reps === 1) next.intervalDays = 0.5 * bonus;
  else if (next.reps === 2) next.intervalDays = 2 * bonus;
  else next.intervalDays = Math.max(1, review.intervalDays * review.ease * bonus);
  const easeDelta = grade === "perfect" ? 0.1 : grade === "slow" ? -0.08 : 0.02;
  next.ease = clamp(review.ease + easeDelta, 1.3, 2.8);
  next.status = statusFor(next.reps, next.intervalDays, next.ease, false);
  next.dueAt = now + next.intervalDays * DAY;
  return next;
}

export function gradeFromDrill(input: {
  mistakes: number;
  hints: number;
  elapsedMs: number;
  studentMoves: number;
}): Grade {
  if (input.mistakes > 0) return "fail";
  const perMove = input.studentMoves > 0 ? input.elapsedMs / input.studentMoves : input.elapsedMs;
  if (input.hints > 0 || perMove > 12_000) return "slow";
  if (perMove < 4_000) return "perfect";
  return "good";
}

export function isDue(review: Review | undefined, now: number): boolean {
  if (!review || review.status === "new") return true;
  return review.dueAt <= now;
}

/** Opening drills bank progress only after this many consecutive clean replays. */
export const REPLAY_TARGET = 3;

export function nextStreak(streak: number, perfect: boolean): number {
  return perfect ? streak + 1 : 0;
}

export function queueRank(review: Review | undefined, now: number): number {
  if (!review || review.status === "new") return 0;
  if (review.dueAt <= now) return 1 + Math.min(10, review.lapses);
  return 100 + (review.dueAt - now) / DAY;
}
