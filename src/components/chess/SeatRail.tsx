import { assetUrl } from "@/lib/chess/asset-url";
import { cn } from "./ui";

export type Seat = "you" | "stockfish";

export type SeatChipProps = {
  seat: Seat;
  name: string;
  avatar?: string;
  /** Omit for a seat with no clock; pass null for a clock that has not started. */
  clockMs?: number | null;
  rating?: string;
  /** A second line under the name, for a review's accuracy instead of a clock. */
  detail?: string;
};

type SeatPair = {
  top: SeatChipProps;
  bottom: SeatChipProps;
  className?: string;
};

function clockText(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The number the engine is actually capped at; uncut play has no meaningful rating to show. */
export function seatRating(seat: Seat, strength: number | "max") {
  if (seat !== "stockfish") return "";
  if (strength === "max") return "Max";
  return String(Math.max(1320, Math.min(3190, Math.round(strength))));
}

/** The face of the player sitting in one seat: the Stockfish logo for the engine, the uploaded avatar for a person. */
function SeatAvatar({ seat, name, avatar, compact = false }: Pick<SeatChipProps, "seat" | "name" | "avatar"> & { compact?: boolean }) {
  const size = compact
    ? "h-9 w-9 shrink-0 rounded-full border border-line"
    : "h-13.5 w-13.5 shrink-0 rounded-full border border-line";
  if (seat === "stockfish") {
    return <img src={assetUrl("/stockfish-avatar.png")} alt="Stockfish" className={`${size} bg-surface object-cover`} />;
  }
  if (avatar) {
    return <img src={avatar} alt="" className={`${size} object-cover`} />;
  }
  return (
    <span className={`grid ${size} place-items-center bg-surface text-base text-mist`} aria-hidden>
      {(name.trim()[0] ?? "P").toUpperCase()}
    </span>
  );
}

/**
 * One seat in the rail beside the board: face over clock, so the column stays narrow enough to sit
 * next to the eval bar. The rating never moves the face: on a wide screen it hangs in the margin,
 * and closer to the edge of the layout it tucks onto the avatar so it is never cut off.
 */
export function SeatChip({ seat, name, avatar, clockMs, rating, detail }: SeatChipProps) {
  return (
    <div className="flex w-14 flex-col items-center gap-0.5">
      <span className="relative inline-flex">
        <SeatAvatar seat={seat} name={name} avatar={avatar} />
        {rating && (
          <span
            className="absolute right-[calc(100%-1.25rem)] top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-1 py-px text-[10px] font-medium tabular-nums whitespace-nowrap text-brass min-[1400px]:right-full min-[1400px]:mr-1"
            aria-label={`${name} rated ${rating}`}
            title={rating === "Max" ? `${name} at full strength` : `${name} playing at ${rating}`}
          >
            {rating}
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[10px] text-mist" title={name}>{name}</span>
      {detail && (
        <span className="w-full truncate text-center text-[10px] tabular-nums text-brass" title={detail}>{detail}</span>
      )}
      {clockMs !== undefined && (
        <span className="tabular-nums text-xs text-ivory">{clockMs == null ? "—" : clockText(clockMs)}</span>
      )}
    </div>
  );
}

/** The two seats, top over bottom, in the rail beside the board. */
export function SeatRail({ top, bottom, className }: SeatPair) {
  return (
    <div className={cn("flex w-14 shrink-0 flex-col items-center justify-between gap-y-1", className)}>
      <SeatChip {...top} />
      <SeatChip {...bottom} />
    </div>
  );
}

/**
 * One seat as a full-width row for phones: face, name and rating on the left, clock on the
 * right, so the seats can sit above and below the board instead of taking a column from it.
 */
export function SeatBar({ seat, name, avatar, clockMs, rating, detail, className }: SeatChipProps & { className?: string }) {
  return (
    <div className={cn("flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5", className)}>
      <SeatAvatar seat={seat} name={name} avatar={avatar} compact />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm text-ivory" title={name}>{name}</p>
        {(rating || detail) && (
          <p className="flex min-w-0 items-center gap-1.5 text-[10px] tabular-nums text-brass">
            {rating && (
              <span title={rating === "Max" ? `${name} at full strength` : `${name} playing at ${rating}`}>{rating}</span>
            )}
            {detail && <span className="truncate" title={detail}>{detail}</span>}
          </p>
        )}
      </div>
      {clockMs != null && (
        <span className="shrink-0 tabular-nums text-lg leading-none text-ivory" aria-label={`${name} clock ${clockText(clockMs)}`}>
          {clockText(clockMs)}
        </span>
      )}
    </div>
  );
}

/**
 * The same two seats, laid out by the room available: beside the board from the width where the
 * margin can hold them, above it below that, so the rail never takes squares away from the board.
 */
export function SeatColumn({ top, bottom, className }: SeatPair) {
  return (
    <div className={cn("flex w-full items-start justify-between gap-y-1 lg:w-14 lg:shrink-0 lg:flex-col lg:items-center lg:justify-between", className)}>
      <SeatChip {...top} />
      <SeatChip {...bottom} />
    </div>
  );
}
