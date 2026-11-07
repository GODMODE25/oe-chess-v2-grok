import { useEffect, useState } from "react";
import { getEngine } from "./engine";
import { useOe } from "./store";
import type { EngineInfo } from "./types";

export function useEngineAnalysis(input: {
  fen: string;
  uciMoves: string[];
  enabled: boolean;
  depth?: number;
}): { info: EngineInfo | null; thinking: boolean; arrows: { from: string; to: string }[] } {
  const configuredDepth = useOe((s) => s.settings.analysisDepth);
  const depth = input.depth ?? configuredDepth;
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [thinking, setThinking] = useState(false);
  const uciKey = input.uciMoves.join(" ");

  useEffect(() => {
    if (!input.enabled) {
      setInfo(null);
      setThinking(false);
      return;
    }
    let cancel = false;
    const engine = getEngine();
    setThinking(true);
    engine
      .go({
        fen: input.fen,
        uciMoves: input.uciMoves,
        depth,
        strength: "max",
        onInfo: (next) => {
          if (!cancel) setInfo(next);
        },
      })
      .catch(() => {
        // Trainers must not die on an engine timeout; the bar just holds its last value.
      })
      .finally(() => {
        if (!cancel) setThinking(false);
      });
    return () => {
      cancel = true;
      engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.enabled, input.fen, uciKey, depth]);

  const arrows = info?.pvUci[0] ? [{ from: info.pvUci[0].slice(0, 2), to: info.pvUci[0].slice(2, 4) }] : [];
  return { info, thinking, arrows };
}
