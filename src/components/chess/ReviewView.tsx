import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyzeGame } from "@/lib/chess/review";
import { GRADE_LABEL, GRADE_MARK, REVIEW_DEPTH, seatsOf, summarizeReview } from "@/lib/chess/review-math";
import { gameToPgn, matchOpening, replay, statusOf } from "@/lib/chess/rules";
import { playTone } from "@/lib/chess/sound";
import { allOpenings, useOe } from "@/lib/chess/store";
import type { EngineInfo, GameReview, MoveGrade, ReviewedMove, SavedGame, Side } from "@/lib/chess/types";
import { Board } from "./Board";
import { MovesGraph } from "./EnginePanel";
import { EvalBar } from "./EvalBar";
import { SeatColumn } from "./SeatRail";
import { Button, cn, CollapsiblePanel, Meter, Panel, Pill } from "./ui";

const GRADE_TEXT: Record<MoveGrade, string> = {
  best: "text-best",
  good: "text-good",
  inaccuracy: "text-inaccuracy",
  mistake: "text-mistake",
  blunder: "text-blunder",
};

const GRADE_BG: Record<MoveGrade, string> = {
  best: "bg-best",
  good: "bg-good",
  inaccuracy: "bg-inaccuracy",
  mistake: "bg-mistake",
  blunder: "bg-blunder",
};

const GRADES: MoveGrade[] = ["best", "good", "inaccuracy", "mistake", "blunder"];

function scoreText(cp: number, mate: number | null): string {
  if (mate != null) return `Mate in ${Math.abs(mate)}`;
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

function GradeChip({ grade }: { grade: MoveGrade }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs font-medium", GRADE_TEXT[grade])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", GRADE_BG[grade])} aria-hidden />
      {GRADE_LABEL[grade]}
    </span>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-mist">{label}</dt>
      <dd className="min-w-0 text-ivory">{children}</dd>
    </div>
  );
}

export function ReviewView({ game }: { game: SavedGame }) {
  const settings = useOe((s) => s.settings);
  const profile = useOe((s) => s.profile);
  const closeReview = useOe((s) => s.closeReview);
  const attachReview = useOe((s) => s.attachReview);
  const openings = useOe((s) => s.openings);
  const total = game.sans.length;
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<"white" | "black">(game.playerColor === "b" ? "black" : "white");
  const [autoplay, setAutoplay] = useState(false);
  const [showArrow, setShowArrow] = useState(true);
  const [moves, setMoves] = useState<ReviewedMove[]>(game.review?.moves ?? []);
  const [report, setReport] = useState<GameReview | null>(game.review ?? null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [rerun, setRerun] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const activeCellRef = useRef<HTMLButtonElement | null>(null);

  const seats = useMemo(() => seatsOf(game), [game]);
  const startTurn = useMemo(() => replay(game.startFen, []).chess.turn(), [game.startFen]);
  const viewed = useMemo(() => replay(game.startFen, game.sans.slice(0, ply)), [game.startFen, game.sans, ply]);
  const turn = viewed.chess.turn();
  const last = viewed.chess.history({ verbose: true }).at(-1);
  const current = ply > 0 ? moves[ply - 1] : undefined;
  const nextBest = moves[ply];
  const summary = useMemo(() => summarizeReview(moves, startTurn, seats), [moves, startTurn, seats]);
  const finalStatus = useMemo(() => statusOf(replay(game.startFen, game.sans).chess), [game.startFen, game.sans]);
  const opening = useMemo(() => matchOpening(game.sans, allOpenings(openings)), [game.sans, openings]);

  // One engine pass per game. A stored report opens instantly; Re-analyze replaces the move
  // rows, and attachReview keeps the earlier pass's numbers so the two can be compared.
  useEffect(() => {
    if (game.review && rerun === 0) {
      setMoves(game.review.moves);
      setReport(game.review);
      setRunning(false);
      setProgress(null);
      return;
    }
    setMoves([]);
    setReport(null);
    setError("");
    setRunning(true);
    setProgress({ done: 0, total });
    const handle = analyzeGame(game, {
      onMove: (_index, move) => setMoves((rows) => [...rows, move]),
      onProgress: (done, count) => setProgress({ done, total: count }),
      onDone: (review) => {
        setMoves(review.moves);
        setReport(review);
        setRunning(false);
        setProgress(null);
        attachReview(game.id, review);
      },
      onError: (message) => {
        setError(message);
        setRunning(false);
        setProgress(null);
      },
    });
    return () => handle.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, rerun, total, attachReview]);

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      setPly((value) => {
        if (value >= total) {
          setAutoplay(false);
          return value;
        }
        playTone("move");
        return value + 1;
      });
    }, 900);
    return () => window.clearInterval(id);
  }, [autoplay, total]);

  useEffect(() => {
    activeCellRef.current?.scrollIntoView({ block: "nearest" });
  }, [ply]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "ArrowLeft") setPly((value) => Math.max(0, value - 1));
      if (event.key === "ArrowRight") setPly((value) => Math.min(total, value + 1));
      if (event.key === "Home") setPly(0);
      if (event.key === "End") setPly(total);
      if (event.key === "f") setOrientation((value) => (value === "white" ? "black" : "white"));
      if (event.key === " ") {
        event.preventDefault();
        setAutoplay((value) => !value);
      }
      if (event.key === "Escape") closeReview();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, closeReview]);

  const evalInfo = useMemo<EngineInfo | null>(() => {
    const cp = ply === 0 ? report?.startCp : moves[ply - 1]?.cp;
    if (cp == null) return null;
    const mate = ply === 0 ? null : (moves[ply - 1]?.mate ?? null);
    return {
      depth: report?.depth ?? 0,
      seldepth: 0,
      score: scoreText(cp, mate),
      cp: mate != null ? null : cp,
      mate,
      nodes: 0,
      nps: 0,
      pv: "",
      pvUci: [],
    };
  }, [ply, moves, report]);

  const graph = useMemo(() => {
    // Null means "no engine number for this ply yet", and MovesGraph breaks the curve there,
    // so a half-read game shows the part Stockfish has actually seen rather than a material guess.
    const values: (number | null)[] = [report ? report.startCp / 100 : null];
    for (let index = 0; index < total; index++) {
      const reviewed = moves[index];
      values.push(reviewed ? reviewed.cp / 100 : null);
    }
    return values;
  }, [report, moves, total]);
  const marks = useMemo(() => moves.map((move, index) => ({ ply: index + 1, grade: move.grade })), [moves]);
  const firstTrouble = moves.findIndex((move) => move.grade === "mistake" || move.grade === "blunder");

  const topColor: Side = orientation === "white" ? "b" : "w";
  const bottomColor: Side = orientation === "white" ? "w" : "b";
  const nameOf = (color: Side) => (color === "w" ? game.white : game.black);
  const seatProps = (color: Side) => ({
    seat: seats[color].engine ? ("stockfish" as const) : ("you" as const),
    name: nameOf(color),
    avatar: !seats[color].engine && nameOf(color) === profile.name ? profile.avatar : undefined,
    rating: seats[color].engine ? (game.engineElo === "max" ? "Max" : String(seats[color].strength)) : "",
    detail: moves.length ? `${Math.round(summary[color].accuracy)}%` : undefined,
  });
  const arrow = showArrow && nextBest?.bestUci ? [{ from: nextBest.bestUci.slice(0, 2), to: nextBest.bestUci.slice(2, 4) }] : [];

  function step(next: number) {
    setAutoplay(false);
    setPly(Math.max(0, Math.min(total, next)));
    playTone("move");
  }

  function exportPgn() {
    const note = report
      ? [
          opening ? `Opening: ${opening.name} (${opening.eco}).` : "",
          `OE Chess review${report.engine ? ` by ${report.engine}` : ""} at depth ${report.depth}: White accuracy ${report.w.accuracy.toFixed(1)}% (ACPL ${report.w.acpl.toFixed(0)}), Black accuracy ${report.b.accuracy.toFixed(1)}% (ACPL ${report.b.acpl.toFixed(0)}).`,
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;
    const pgn = gameToPgn({
      white: game.white,
      black: game.black,
      result: game.result,
      event: game.event || "OE Chess",
      startFen: game.startFen,
      sans: game.sans,
      note,
    });
    const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `oe-chess-review-${game.id.slice(0, 8)}.pgn`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (total === 0) {
    return (
      <Panel>
        <h2 className="text-2xl">Game review</h2>
        <p className="mt-2 text-sm text-mist">This game has no moves to review.</p>
        <Button className="mt-3" variant="quiet" onClick={closeReview}>Back to Play</Button>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col items-center gap-3">
        {/* 41.125rem = Play's 40rem block plus the eval bar, so the board keeps Play's rendered size. */}
        <div className="flex w-full max-w-[41.125rem] flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-xl leading-none">Game review</h2>
            <p className="mt-1 truncate text-xs text-mist">
              {game.white} – {game.black} · {game.result} · {game.timeControl}
            </p>
            {opening && (
              <p className="mt-1 truncate text-xs">
                <span className="text-brass">{opening.name}</span>
                <span className="text-mist"> · {opening.eco} · book followed for {opening.ply} {opening.ply === 1 ? "ply" : "plies"}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="quiet" className="h-9 px-3" onClick={exportPgn}>Export PGN</Button>
            <Button variant="quiet" className="h-9 px-3" onClick={closeReview}>Exit review</Button>
          </div>
        </div>
        <div className="flex w-full max-w-[41.125rem] flex-wrap items-center gap-2 text-xs">
          <span className="tabular-nums text-ivory">Move {ply} of {total}</span>
          {current ? <GradeChip grade={current.grade} /> : <span className="text-mist">Starting position</span>}
          {current?.forced && <span className="text-mist" title="Only one legal move existed, so there was nothing to choose.">only legal move</span>}
          {current && current.grade !== "best" && current.grade !== "good" && (
            <span className={cn("tabular-nums", GRADE_TEXT[current.grade])}>
              −{(current.loss / 100).toFixed(1)} pawns · −{Math.round(current.lossWin)}% win chance
            </span>
          )}
          {ply === total && <Pill tone="brass">{finalStatus.label}</Pill>}
        </div>
        <div className="flex w-full max-w-[41.125rem] flex-col gap-2 lg:flex-row lg:items-stretch">
          <SeatColumn top={seatProps(topColor)} bottom={seatProps(bottomColor)} />
          <div className="flex min-w-0 flex-1 items-stretch gap-2">
            <EvalBar info={evalInfo} stm={turn} flipped={orientation === "black"} />
            <div className="min-w-0 flex-1">
              <Board
                fen={viewed.chess.fen()}
                orientation={orientation}
                interactive={false}
                coordinates={settings.coordinates}
                theme={settings.boardTheme}
                pieceSet={settings.pieceSet ?? "standard"}
                animate={settings.animations ?? true}
                lastMove={last ? { from: last.from, to: last.to } : null}
                arrows={arrow}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="quiet" className="h-9 px-3" aria-label="First position" title="First (Home)" onClick={() => step(0)}>⏮</Button>
          <Button variant="quiet" className="h-9 px-3" aria-label="Previous move" title="Previous (←)" onClick={() => step(ply - 1)}>◀</Button>
          <Button variant={autoplay ? "primary" : "quiet"} className="h-9 px-3" aria-label={autoplay ? "Pause autoplay" : "Autoplay"} title="Autoplay (space)" onClick={() => setAutoplay((value) => !value)}>
            {autoplay ? "Pause" : "Play"}
          </Button>
          <Button variant="quiet" className="h-9 px-3" aria-label="Next move" title="Next (→)" onClick={() => step(ply + 1)}>▶</Button>
          <Button variant="quiet" className="h-9 px-3" aria-label="Last position" title="Last (End)" onClick={() => step(total)}>⏭</Button>
          <Button variant="quiet" className="h-9 px-3" onClick={() => setOrientation((value) => (value === "white" ? "black" : "white"))}>Flip</Button>
          <Button variant={showArrow ? "primary" : "quiet"} className="h-9 px-3" onClick={() => setShowArrow((value) => !value)}>
            {showArrow ? "Best-move arrow" : "Arrow off"}
          </Button>
          <Button variant="quiet" className="h-9 px-3" disabled={running} onClick={() => setRerun((value) => value + 1)}>
            {running ? "Analyzing…" : "Re-analyze"}
          </Button>
        </div>
        <p className="text-xs text-mist">Arrow keys step, space autoplays, F flips, Escape leaves the review.</p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      <div className="flex w-full min-w-0 flex-col gap-3">
        <Panel>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-2xl">Review</h2>
            <Pill tone={report ? "brass" : "mist"}>{report ? `Depth ${report.depth}` : running ? "Analyzing" : "Waiting"}</Pill>
          </div>
          {running && progress && (
            <div className="mt-3">
              <Meter value={(progress.done / Math.max(1, progress.total)) * 100} label="Stockfish is reading the game" detail={`${progress.done} of ${progress.total} positions`} />
              {progress.done === 0 && (
                <p className="mt-1 text-xs text-mist">The first review loads Stockfish (~2 MB); later reviews start instantly.</p>
              )}
            </div>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(["w", "b"] as Side[]).map((color) => {
              const side = summary[color];
              const played = side.counts.best + side.counts.good + side.counts.inaccuracy + side.counts.mistake + side.counts.blunder;
              return (
                <div key={color} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm">{nameOf(color)}</span>
                    <span className="text-xs text-mist">{seats[color].engine ? "engine" : "human"}</span>
                  </div>
                  <p className="mt-1 text-3xl tabular-nums text-brass">
                    {played ? side.accuracy.toFixed(1) : "—"}
                    <span className="text-sm text-mist">%</span>
                  </p>
                  <Meter value={played ? side.accuracy : 0} />
                  <div className="mt-2 flex items-baseline justify-between gap-2 text-xs text-mist">
                    <span className="tabular-nums" title="Average centipawn loss">ACPL {played ? side.acpl.toFixed(0) : "—"}</span>
                    <span className="tabular-nums text-ivory" title={side.estimated ? "Heuristic estimate from accuracy against the opponent's strength" : "The strength this seat was set to"}>
                      {side.estimated ? `~${side.rating}` : side.rating}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                    {GRADES.map((grade) => (
                      <span key={grade} className={cn("inline-flex items-center gap-1 text-xs tabular-nums", GRADE_TEXT[grade])} title={`${GRADE_LABEL[grade]}: ${side.counts[grade]}`}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", GRADE_BG[grade])} aria-hidden />
                        {side.counts[grade]}
                      </span>
                    ))}
                  </div>
                  {!!(side.forced ?? 0) && (
                    <p className="mt-1 text-[10px] text-mist">
                      {side.forced} forced {side.forced === 1 ? "move" : "moves"}: graded best, left out of accuracy.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {firstTrouble >= 0 && (
            <Button variant="quiet" className="mt-3 h-9 w-full px-3" onClick={() => step(firstTrouble + 1)}>
              Jump to the first {moves[firstTrouble].grade} (move {firstTrouble + 1})
            </Button>
          )}
          <p className="mt-3 text-xs text-mist">
            Each move is compared with Stockfish&apos;s choice at depth {report?.depth ?? 16}; the win-chance loss sets the grade. Accuracy and the ~ rating are estimates, not official Elo.
            {((summary.w.forced ?? 0) > 0 || (summary.b.forced ?? 0) > 0) && " Moves with only one legal reply are counted as best and left out of accuracy."}
          </p>
          <CollapsiblePanel title="Analysis details" collapsed={!detailsOpen} onToggle={() => setDetailsOpen((value) => !value)}>
            <dl className="space-y-1 text-xs">
              <Detail label="Engine">{report?.engine ?? "Reported by the running Stockfish build; this older report predates provenance tracking."}</Detail>
              <Detail label="Grading">{report?.formulas ?? "Win-chance curve and grade bands, version not recorded."}</Detail>
              <Detail label="Search">{report?.config ? `depth ${report.config.depth}, ${report.config.movetimeMs} ms per position` : `depth ${report?.depth ?? REVIEW_DEPTH}`}</Detail>
              <Detail label="Coverage">{`${moves.length} of ${total} plies evaluated${running ? ", still reading" : ""}`}</Detail>
              <Detail label="Forced">{`White ${summary.w.forced ?? 0} · Black ${summary.b.forced ?? 0}`}</Detail>
              <Detail label="Analyzed">{report ? new Date(report.analyzedAt).toLocaleString() : "in progress"}</Detail>
            </dl>
            {game.reviewRuns && game.reviewRuns.length > 0 && (
              <div className="mt-2 border-t border-line pt-2">
                <p className="text-xs text-mist">Earlier passes on this game</p>
                <ul className="mt-1 space-y-1 text-xs">
                  {game.reviewRuns.slice(-3).reverse().map((pass) => (
                    <li key={pass.analyzedAt} className="tabular-nums text-mist">
                      {new Date(pass.analyzedAt).toLocaleString()} · depth {pass.depth} · {Math.round(pass.w.accuracy)}% / {Math.round(pass.b.accuracy)}%
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CollapsiblePanel>
        </Panel>
        <Panel>
          <h2 className="text-lg">Moves</h2>
          <div className="mt-2 max-h-72 overflow-y-auto pr-1">
            <ol className="space-y-0.5 text-sm">
              {Array.from({ length: Math.ceil(total / 2) }, (_, index) => (
                <li key={index} className="grid grid-cols-[2rem_1fr_1fr] gap-1">
                  <span className="py-1 text-mist tabular-nums">{index + 1}.</span>
                  {[0, 1].map((offset) => {
                    const at = index * 2 + offset;
                    const san = game.sans[at];
                    if (!san) return <span key={offset} />;
                    const reviewed = moves[at];
                    const active = ply === at + 1;
                    return (
                      <button
                        key={offset}
                        ref={active ? activeCellRef : undefined}
                        type="button"
                        onClick={() => step(at + 1)}
                        className={cn(
                          "flex items-baseline gap-1 rounded-md px-2 py-1 text-left hover:bg-surface-2",
                          active && "bg-surface-2 outline outline-1 outline-brass",
                        )}
                      >
                        <span className="text-ivory">{san}</span>
                        {reviewed && GRADE_MARK[reviewed.grade] && (
                          <span className={cn("text-xs font-semibold", GRADE_TEXT[reviewed.grade])}>{GRADE_MARK[reviewed.grade]}</span>
                        )}
                        {reviewed && (reviewed.grade === "inaccuracy" || reviewed.grade === "mistake" || reviewed.grade === "blunder") && (
                          <span className={cn("ml-auto text-[10px] tabular-nums", GRADE_TEXT[reviewed.grade])}>−{(reviewed.loss / 100).toFixed(1)}</span>
                        )}
                      </button>
                    );
                  })}
                </li>
              ))}
            </ol>
          </div>
        </Panel>
        <Panel>
          <h2 className="text-lg">At this move</h2>
          {evalInfo ? (
            <>
              <p className="mt-1 text-2xl tabular-nums text-brass">{evalInfo.score}</p>
              <p className="mt-1 text-sm text-mist">
                {nextBest
                  ? `Depth ${nextBest.depth}${nextBest.seldepth ? ` (selective ${nextBest.seldepth})` : ""}${nextBest.nodes ? ` · ${nextBest.nodes.toLocaleString()} nodes` : ""}`
                  : report ? `Depth ${report.depth}` : running ? "Reading…" : "Waiting for Stockfish"}
                {nextBest?.bestLine ? ` · ${nextBest.bestLine}` : ""}
              </p>
              {current && current.bestSan && game.sans[ply - 1] !== current.bestSan ? (
                <p className="mt-2 text-sm">
                  Played <span className="text-ivory">{game.sans[ply - 1]}</span>; the engine preferred{" "}
                  <span className={GRADE_TEXT[current.grade]}>{current.bestSan}</span>.
                </p>
              ) : current ? (
                <p className="mt-2 text-sm text-mist">
                  {current.bestSan ? "Matches the engine's choice here." : "No engine choice was recorded for this position."}
                </p>
              ) : (
                <p className="mt-2 text-sm text-mist">Step forward to grade a move.</p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-mist">Waiting for Stockfish.</p>
          )}
          <MovesGraph values={graph} active={ply} onPly={(next) => step(next)} marks={marks} />
        </Panel>
      </div>
    </div>
  );
}