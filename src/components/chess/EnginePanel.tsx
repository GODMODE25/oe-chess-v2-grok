import { useId, useRef, useState } from "react";
import { GRADE_LABEL } from "@/lib/chess/review-math";
import type { EngineInfo, MoveGrade } from "@/lib/chess/types";
import { cn } from "./ui";

export function EnginePanelBody({ info, enabled }: { info: EngineInfo | null; enabled: boolean }) {
  return info ? (
    <>
      <p className="text-2xl text-brass tabular-nums">{info.score}</p>
      <p className="mt-1 truncate text-sm text-mist">Depth {info.depth} · {info.nodes.toLocaleString()} nodes</p>
      <p className="mt-1 truncate text-sm">{info.pv}</p>
    </>
  ) : (
    <p className="text-sm text-mist">{enabled ? "Waiting for Stockfish." : "Analysis is off."}</p>
  );
}

const W = 100;
const H = 44;
const PAD = 3;

const GRADE_BG: Record<MoveGrade, string> = {
  best: "bg-best",
  good: "bg-good",
  inaccuracy: "bg-inaccuracy",
  mistake: "bg-mistake",
  blunder: "bg-blunder",
};

/** Advantage in pawns, from White's view, mapped so a few pawns already bends the curve hard. */
function yOf(value: number) {
  return H / 2 - (H / 2 - PAD) * Math.tanh(value / 4);
}

/**
 * One point per ply. A null is a ply with no value yet: the curve stops there instead of
 * drawing through it, so an unfinished pass never looks like a flat game.
 * The plot is click-aware so a point on the curve jumps the board to that move.
 */
export function MovesGraph({ values, active, onPly, marks }: {
  values: (number | null)[];
  active: number | null;
  onPly: (ply: number) => void;
  marks?: { ply: number; grade: MoveGrade }[];
}) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const clip = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (values.length < 2) {
    return <p className="mt-3 text-sm text-mist">The advantage graph starts with the first move.</p>;
  }

  const xOf = (index: number) => (index / (values.length - 1)) * W;
  const runs: { from: number; to: number; line: string; area: string }[] = [];
  let start = -1;
  for (let index = 0; index <= values.length; index++) {
    const value = index < values.length ? values[index] : null;
    if (value != null) {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0 && index - start >= 2) {
      const points = Array.from({ length: index - start }, (_, offset) => start + offset);
      const line = points.map((at, step) => `${step ? "L" : "M"}${xOf(at).toFixed(2)} ${yOf(values[at] as number).toFixed(2)}`).join(" ");
      runs.push({
        from: start,
        to: index - 1,
        line,
        area: `${line} L${xOf(index - 1).toFixed(2)} ${(H / 2).toFixed(2)} L${xOf(start).toFixed(2)} ${(H / 2).toFixed(2)} Z`,
      });
    }
    start = -1;
  }
  const shown = hover ?? (active != null && active < values.length ? active : values.length - 1);
  const lead = values[shown];
  const leadText = lead == null ? "—" : `${lead > 0 ? "+" : lead < 0 ? "-" : ""}${Math.abs(lead).toFixed(1)}`;
  const sideText = lead == null ? "" : lead > 0.4 ? "White" : lead < -0.4 ? "Black" : "Level";

  function plyAt(clientX: number) {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return Math.round(ratio * (values.length - 1));
  }

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between text-xs text-mist">
        <span>Advantage per move</span>
        <span className="tabular-nums text-ivory">
          Move {shown} · {leadText} {sideText}
        </span>
      </div>
      <div
        ref={plotRef}
        className="relative rounded-lg border border-line bg-surface-2"
        onPointerMove={(event) => setHover(plyAt(event.clientX))}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => onPly(plyAt(event.clientX))}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Advantage across ${values.length - 1} moves, now ${leadText} for ${sideText || "either side"}.`}
          className="block h-16 w-full cursor-crosshair"
        >
          <defs>
            <clipPath id={`${clip}-white`}>
              <rect x="0" y="0" width={W} height={H / 2} />
            </clipPath>
            <clipPath id={`${clip}-black`}>
              <rect x="0" y={H / 2} width={W} height={H / 2} />
            </clipPath>
          </defs>
          {runs.map((run) => (
            <g key={run.from}>
              <path d={run.area} className="fill-brass/25" clipPath={`url(#${clip}-white)`} />
              <path d={run.area} className="fill-brass/10" clipPath={`url(#${clip}-black)`} />
            </g>
          ))}
          <line
            x1="0"
            y1={H / 2}
            x2={W}
            y2={H / 2}
            className="stroke-line"
            strokeDasharray="3 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {runs.map((run) => (
            <path key={run.to} d={run.line} fill="none" className="stroke-brass" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
          {active != null && active < values.length && (
            <line
              x1={xOf(active)}
              y1={PAD / 2}
              x2={xOf(active)}
              y2={H - PAD / 2}
              className="stroke-ivory"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* HTML dots, not SVG circles: the plot stretches to its box and a circle would ride along. */}
        {marks
          ?.filter((mark) => mark.grade !== "good" && mark.ply < values.length && values[mark.ply] != null)
          .map((mark) => (
            <span
              key={mark.ply}
              title={`Move ${mark.ply}: ${GRADE_LABEL[mark.grade]}`}
              className={cn("pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-canvas", GRADE_BG[mark.grade])}
              style={{ left: `${xOf(mark.ply)}%`, top: `${(yOf(values[mark.ply] as number) / H) * 100}%` }}
            />
          ))}
      </div>
      <p className="mt-1 text-xs text-mist">Up is White. Click a point to visit that move.</p>
    </div>
  );
}
