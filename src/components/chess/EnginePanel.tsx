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
