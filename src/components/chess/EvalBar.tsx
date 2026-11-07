import type { EngineInfo, Side } from "@/lib/chess/types";

export function EvalBar({ info, stm, flipped }: { info: EngineInfo | null; stm: Side; flipped: boolean }) {
  let pct = 50;
  if (info) {
    if (info.mate != null) {
      const mateForWhite = stm === "w" ? info.mate > 0 : info.mate < 0;
      pct = mateForWhite ? 100 : 0;
    } else if (info.cp != null) {
      const cpWhite = stm === "w" ? info.cp : -info.cp;
      pct = 100 / (1 + Math.exp(-0.004 * cpWhite));
    }
  }
  const whitePct = flipped ? 100 - pct : pct;
  return (
    <div
      className="relative w-2.5 shrink-0 self-stretch overflow-hidden rounded-full border border-line bg-surface"
      title={info ? info.score : "No evaluation yet"}
      aria-label="Evaluation bar"
    >
      <div className="absolute inset-x-0 top-0 bg-ivory" style={{ height: `${whitePct}%` }} />
    </div>
  );
}
