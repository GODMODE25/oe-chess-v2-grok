import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { TIER_LABEL, type Course } from "@/lib/chess/courses";
import { getEngine } from "@/lib/chess/engine";
import { lastMoveOf, replay, START_FEN } from "@/lib/chess/rules";
import { REPLAY_TARGET, gradeFromDrill, reviewId } from "@/lib/chess/srs";
import { useOe } from "@/lib/chess/store";
import { useEngineAnalysis } from "@/lib/chess/use-engine-analysis";
import type { OpeningLine, Prefs, Side } from "@/lib/chess/types";
import { Board } from "./Board";
import { Button, Meter, Panel, Pill } from "./ui";
import { EnginePanelBody } from "./EnginePanel";
import { EvalBar } from "./EvalBar";

const SPEEDS = [400, 800, 1600] as const;
const NO_PREFS: Prefs = {};

function moverOf(index: number): Side {
  return index % 2 === 0 ? "w" : "b";
}

/**
 * Watch, then repeat. A line only reaches the spaced-repetition book after
 * REPLAY_TARGET clean runs in a row; the first slip opens the off-book modal
 * and clears the count.
 */
export function OpeningSession({
  course,
  line,
  hasNext,
  isCourse,
  onNext,
  onExit,
}: {
  course: Course;
  line: OpeningLine;
  hasNext: boolean;
  isCourse: boolean;
  onNext: () => void;
  onExit: () => void;
}) {
  const settings = useOe((s) => s.settings);
  const patchPrefs = useOe((s) => s.patchPrefs);
  const review = useOe((s) => s.reviews.find((row) => row.id === reviewId(line.id, course.side)));
  const recordReplayAttempt = useOe((s) => s.recordReplayAttempt);
  const breakStreak = useOe((s) => s.breakStreak);
  const noteSuccess = useOe((s) => s.noteSuccess);

  const [phase, setPhase] = useState<"watch" | "repeat">("watch");
  const [watchPly, setWatchPly] = useState(0);
  const [playing, setPlaying] = useState(true);
  // The demo speed is a stored choice, so the next opening plays at the pace just set.
  const prefs = settings.prefs ?? NO_PREFS;
  const speedMs = (prefs.demoSpeedMs ?? 800) as (typeof SPEEDS)[number];
  const setSpeedMs = (next: (typeof SPEEDS)[number]) => patchPrefs({ demoSpeedMs: next });

  const [ply, setPly] = useState(0);
  const [offBook, setOffBook] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(0);
  const [done, setDone] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [prompt, setPrompt] = useState<{ played: string; expected: string } | null>(null);
  const [browsePly, setBrowsePly] = useState<number | null>(null);
  const [analyze, setAnalyze] = useState(false);
  const [banner, setBanner] = useState("");
  const [runStartedAt, setRunStartedAt] = useState(() => Date.now());
  const logged = useRef(false);

  const watched = useMemo(() => replay(START_FEN, line.moves.slice(0, watchPly)), [line.moves, watchPly]);
  const drillPrefix = useMemo(
    () => (offBook ? [...line.moves.slice(0, ply), ...extra] : line.moves.slice(0, ply)),
    [offBook, line.moves, ply, extra],
  );
  const position = useMemo(() => replay(START_FEN, drillPrefix), [drillPrefix]);
  const browsed = useMemo(() => (browsePly === null ? null : replay(START_FEN, line.moves.slice(0, browsePly))), [browsePly, line.moves]);
  const shown = browsed ?? (phase === "watch" ? watched : position);
  const shownUci = shown.uci;

  const studentTurn = phase === "repeat" && !done && !prompt && browsePly === null && !thinking && position.chess.turn() === course.side;

  const expected = phase === "repeat" && !offBook && ply < line.moves.length ? line.moves[ply] : "";
  const streak = review?.perfectStreak ?? 0;
  const sessionPct = line.moves.length ? Math.min(100, (Math.min(ply, line.moves.length) / line.moves.length) * 100) : 0;
  const analysisOn = (phase === "watch" || analyze || browsePly !== null || offBook) && !prompt;

  const analysis = useEngineAnalysis({
    fen: START_FEN,
    uciMoves: shownUci,
    enabled: analysisOn,
  });

  useEffect(() => {
    if (phase !== "watch" || !playing || browsed) return;
    if (watchPly >= line.moves.length) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setWatchPly((value) => value + 1), speedMs);
    return () => window.clearTimeout(timer);
  }, [phase, playing, browsed, watchPly, line.moves.length, speedMs]);

  useEffect(() => {
    if (phase !== "repeat" || offBook || done || prompt || browsed) return;
    if (ply >= line.moves.length) {
      if (logged.current) return;
      logged.current = true;
      const perfect = mistakes === 0;
      const elapsedMs = Date.now() - runStartedAt;
      const grade = gradeFromDrill({
        mistakes,
        hints,
        elapsedMs,
        studentMoves: line.moves.filter((_, index) => moverOf(index) === course.side).length,
      });
      const result = recordReplayAttempt(line.id, course.side, perfect, grade, elapsedMs);
      if (result.logged) {
        noteSuccess();
        setBanner(`Three clean runs in a row — ${line.name} is in the book.`);
      } else if (perfect) {
        setBanner(`Nice. ${result.runsToGo} more clean run${result.runsToGo === 1 ? "" : "s"} in a row and it's logged.`);
      } else {
        setBanner("That one slipped — the count starts again from zero.");
      }
      setDone(true);
      return;
    }
    if (position.chess.turn() === course.side) return;
    const timer = window.setTimeout(() => setPly((value) => value + 1), 420);
    return () => window.clearTimeout(timer);
  }, [phase, ply, offBook, done, prompt, browsed, line, course.side, position.chess, mistakes, hints, runStartedAt, recordReplayAttempt, noteSuccess]);

  // Declared after the analysis hook on purpose: when the student leaves the book, this search
  // must be the newest one, or the analysis request would cancel the engine's reply.
  useEffect(() => {
    if (!offBook || done || prompt || browsed || position.chess.turn() === course.side || position.chess.isGameOver()) return;
    let cancel = false;
    const engine = getEngine();
    setThinking(true);
    engine
      .go({ fen: START_FEN, uciMoves: position.uci, movetime: 700, strength: "max" })
      .then((best) => {
        if (cancel || !best) return;
        const next = replay(START_FEN, drillPrefix);
        const moved = next.chess.move({
          from: best.slice(0, 2),
          to: best.slice(2, 4),
          promotion: (best[4] as "q" | "r" | "b" | "n" | undefined) || undefined,
        });
        if (moved) setExtra((rows) => [...rows, moved.san]);
      })
      .finally(() => {
        if (!cancel) setThinking(false);
      });
    return () => {
      cancel = true;
      engine.stop();
    };
  }, [offBook, done, prompt, browsed, position.chess, position.uci, course.side, drillPrefix]);

  const onBookUndoTarget = useMemo(() => {
    for (let i = ply - 1; i >= Math.max(0, ply - 2); i--) {
      if (replay(START_FEN, line.moves.slice(0, i)).chess.turn() === course.side) return i;
    }
    return -1;
  }, [ply, line.moves, course.side]);
  const canUndo = phase === "repeat" && !prompt && (offBook ? extra.length > 0 : onBookUndoTarget >= 0);
  const hasProgress = ply > 0 || extra.length > 0 || done;

  function undoLast() {
    setDone(false);
    logged.current = false;
    setRunStartedAt(Date.now());
    setBanner("No rush — take that move back and try again.");
    if (offBook) {
      if (extra.length <= 1) {
        setOffBook(false);
        setExtra([]);
      } else {
        // Pop the engine reply plus the student's wrong move so the landing state is a student turn.
        const trimmed = extra.slice(0, -2);
        setExtra(trimmed);
        if (trimmed.length === 0) setOffBook(false);
      }
      return;
    }
    if (onBookUndoTarget >= 0) setPly(onBookUndoTarget);
  }

  function resetRun(nextPhase: "watch" | "repeat") {
    logged.current = false;
    setPhase(nextPhase);
    setPly(0);
    setWatchPly(0);
    setPlaying(nextPhase === "watch");
    setOffBook(false);
    setExtra([]);
    setHints(0);
    setMistakes(0);
    setDone(false);
    setPrompt(null);
    setBrowsePly(null);
    setBanner("");
    setRunStartedAt(Date.now());
  }

  function onMove(from: string, to: string, promotion?: string) {
    if (!studentTurn) return;
    // Probe a copy: chess.js mutates in place, and `position.chess` is the object
    // the board is drawn from — an off-book try must not move it.
    let moved;
    try {
      moved = new Chess(position.chess.fen()).move({ from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined });
    } catch {
      return;
    }
    if (!offBook) {
      const played = moved.san.replace(/[+#]/g, "");
      if (played !== expected.replace(/[+#]/g, "")) {
        // The move is never committed: the board stays on the last book position, under the modal.
        setMistakes((value) => value + 1);
        breakStreak(line.id, course.side);
        setPrompt({ played: moved.san, expected });
        return;
      }
      setBanner("");
      setPly((value) => value + 1);
      return;
    }
    setExtra((rows) => [...rows, moved.san]);
  }

  const hintSquares = useMemo(() => {
    if (!hints || !expected) return [] as string[];
    try {
      const probe = replay(START_FEN, line.moves.slice(0, ply));
      const moved = probe.chess.move(expected);
      return moved ? [moved.from, moved.to] : [];
    } catch {
      return [];
    }
  }, [hints, expected, ply, line.moves]);

  const hintArrows = hints > 1 && hintSquares.length === 2 ? [{ from: hintSquares[0]!, to: hintSquares[1]! }] : [];
  const arrows = [...(analysisOn ? analysis.arrows : []), ...hintArrows];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full max-w-xl items-stretch gap-2">
          {analysis.info && (phase === "watch" || analyze || offBook || browsePly !== null) ? (
            <EvalBar info={analysis.info} stm={shown.chess.turn()} flipped={course.side === "b"} />
          ) : null}
          <Board
            fen={shown.chess.fen()}
            orientation={course.side === "w" ? "white" : "black"}
            interactive={studentTurn}
            lastMove={lastMoveOf(shown.chess)}
            coordinates={settings.coordinates}
            theme={settings.boardTheme}
            pieceSet={settings.pieceSet ?? "standard"}
            highlights={hintSquares}
            arrows={arrows}
            onMove={onMove}
          />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="quiet" onClick={onExit}>
            Back
          </Button>
          {phase === "watch" ? (
            <>
              <Button variant="quiet" disabled={browsed !== null} onClick={() => setPlaying((value) => !value)}>
                {playing ? "Pause" : "Play"}
              </Button>
              <Button variant="quiet" disabled={watchPly === 0} onClick={() => setWatchPly((value) => Math.max(0, value - 2))}>
                ◀
              </Button>
              <Button
                variant="quiet"
                disabled={watchPly >= line.moves.length}
                onClick={() => setWatchPly((value) => Math.min(line.moves.length, value + 1))}
              >
                ▶
              </Button>
              <Button variant="quiet" onClick={() => setSpeedMs(SPEEDS[(SPEEDS.indexOf(speedMs) + 1) % SPEEDS.length])}>
                {speedMs === 400 ? "Fast" : speedMs === 800 ? "Normal" : "Slow"}
              </Button>
              <Button onClick={() => resetRun("repeat")}>Start the drill →</Button>
            </>
          ) : (
            <>
              {browsePly === null ? (
                <>
                  <Button variant="quiet" disabled={!studentTurn || offBook} onClick={() => setHints((value) => value + 1)}>
                    Hint
                  </Button>
                  <Button variant="quiet" disabled={!canUndo} onClick={undoLast}>
                    Undo
                  </Button>
                  <Button variant="quiet" onClick={() => setAnalyze((value) => !value)}>
                    {analyze ? "Hide analysis" : "Analyze"}
                  </Button>
                </>
              ) : (
                <Button variant="quiet" onClick={() => setBrowsePly(null)}>
                  Back to the drill
                </Button>
              )}
              {hasProgress && (
                <Button variant="quiet" onClick={() => resetRun("repeat")}>
                  Let's try that again
                </Button>
              )}
              <Button variant="quiet" onClick={() => resetRun("watch")}>
                Watch it again
              </Button>
              {done && (
                <Button onClick={onNext}>{hasNext ? "Next variation" : isCourse ? "Back to course" : "Back to explorer"}</Button>
              )}
            </>
          )}
        </div>
        <p className="text-center text-sm text-mist">
          {prompt
            ? "Pick one — retry the book move, or play it out."
            : browsePly !== null
              ? "Looking around — the drill is waiting right where you left it."
              : done
                ? banner || "That one's logged — nice work."
                : phase === "watch"
                  ? watchPly >= line.moves.length
                    ? "That's the whole line. Now repeat it yourself."
                    : playing
                      ? "Watch how the line runs — the bar tells you how each move scores."
                      : "Paused. Step through it, or start the drill."
                  : offBook
                    ? thinking
                      ? "Stockfish is answering — you left the book, play on."
                      : "Your move — you're off book, play on."
                    : studentTurn && expected
                      ? `Your move — try ${expected}.`
                      : studentTurn
                        ? "Your move."
                        : "The book answers itself — keep up."}
        </p>
      </div>
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-brass">{course.name}</p>
          {line.tier && <Pill tone={line.tier === "s" ? "brass" : line.tier === "trash" ? "danger" : "mist"}>{TIER_LABEL[line.tier]}</Pill>}
        </div>
        <h2 className="text-2xl">{line.name}</h2>
        <p className="mt-2 text-sm text-mist">{line.note}</p>
        <div className="mt-3">
          <Meter value={done ? 100 : phase === "watch" ? (watchPly / Math.max(1, line.moves.length)) * 100 : sessionPct} label={phase === "watch" ? "Watch" : "This run"} />
        </div>
        <p className="mt-3 text-sm text-mist">
          Clean runs in a row: <span className="text-ivory">{streak}</span> of {REPLAY_TARGET}
        </p>
        <p className="mt-1 text-xs text-mist">
          Nothing is logged until you replay the whole line {REPLAY_TARGET} times without a slip — one wrong move and the count starts again.
        </p>
        <div className="mt-3 h-48 overflow-auto text-sm leading-6">
          {line.moves.map((san, index) => {
            const activePly = phase === "watch" ? watchPly : ply;
            const look = browsePly !== null ? (index < browsePly ? "text-ivory" : index === browsePly ? "text-brass" : "text-mist") : index < activePly ? "text-ivory" : index === activePly && phase === "repeat" ? "text-brass" : "text-mist";
            return phase === "repeat" && !offBook ? (
              <button
                key={`${san}${index}`}
                type="button"
                className={`mr-1.5 cursor-pointer hover:underline ${look}`}
                title={`Look at the position after ${san}`}
                onClick={() => setBrowsePly(index)}
              >
                {index % 2 === 0 ? ` ${Math.floor(index / 2) + 1}.` : ""} {san}
              </button>
            ) : (
              <span key={`${san}${index}`} className={`mr-1.5 ${look}`}>
                {index % 2 === 0 ? ` ${Math.floor(index / 2) + 1}.` : ""} {san}
              </span>
            );
          })}
        </div>
        {banner && !done && <p className="mt-3 text-center text-sm text-brass-2">{banner}</p>}
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs text-brass">Engine</p>
          <EnginePanelBody info={analysis.info} enabled={phase === "watch" || analyze || browsePly !== null || offBook} />
        </div>
      </Panel>

      {prompt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-scrim/70 p-4" role="dialog" aria-modal="true" aria-label="You left the book">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 text-center">
            <h3 className="text-xl">That's outside the book</h3>
            <p className="mt-2 text-sm text-mist">
              You played <span className="text-ivory">{prompt.played}</span>. The line asks for <span className="text-brass">{prompt.expected}</span>. Your
              streak of clean runs is back to zero either way.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  setPrompt(null);
                  setBanner("Back to it — play the book move.");
                }}
              >
                Retry the variation
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setPrompt(null);
                  setOffBook(true);
                  setExtra([prompt.played]);
                }}
              >
                Continue gameplay
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
