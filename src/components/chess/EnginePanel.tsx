import { useId, useRef, useState } from "react";
import type { EngineInfo } from "@/lib/chess/types";

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

/** Advantage in pawns, from White's view, mapped so a few pawns already bends the curve hard. */
function yOf(value: number) {
  return H / 2 - (H / 2 - PAD) * Math.tanh(value / 4);
}

/**
 * One point per ply: the engine's number where analysis has produced one, material otherwise.
 * The plot is click-aware so a point on the curve jumps the board to that move.
 */
export function MovesGraph({ values, active, onPly }: { values: number[]; active: number | null; onPly: (ply: number) => void }) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const clip = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (values.length < 2) {
    return <p className="mt-3 text-sm text-mist">The advantage graph starts with the first move.</p>;
  }

  const xOf = (index: number) => (index / (values.length - 1)) * W;
  const line = values.map((value, index) => `${index ? "L" : "M"}${xOf(index).toFixed(2)} ${yOf(value).toFixed(2)}`).join(" ");
  const area = `${line} L${W} ${H / 2} L0 ${H / 2} Z`;
  const shown = hover ?? (active != null && active < values.length ? active : values.length - 1);
  const lead = values[shown];
  const leadText = `${lead > 0 ? "+" : lead < 0 ? "-" : ""}${Math.abs(lead).toFixed(1)}`;
  const sideText = lead > 0.4 ? "White" : lead < -0.4 ? "Black" : "Level";

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
          Move {shown} · {leadText} {sideText === "Level" ? "" : sideText}
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
          aria-label={`Advantage across ${values.length - 1} moves, now ${leadText} for ${sideText}.`}
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
          <path d={area} className="fill-brass/25" clipPath={`url(#${clip}-white)`} />
          <path d={area} className="fill-brass/10" clipPath={`url(#${clip}-black)`} />
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
          <path d={line} fill="none" className="stroke-brass" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
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
      </div>
      <p className="mt-1 text-xs text-mist">Up is White. Click a point to visit that move.</p>
    </div>
  );
}
