import { Chess } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { judgeEndgame } from "@/lib/chess/endgame-result";
import { getEngine } from "@/lib/chess/engine";
import { dequeuePremove, dropAnsweredPremove, enqueuePremove, premoveLabel, type QueuedMove } from "@/lib/chess/premove";
import { applyUciMove, fenOk, replay } from "@/lib/chess/rules";
import { playTone } from "@/lib/chess/sound";
import { allEndgames, useOe } from "@/lib/chess/store";
import type { Difficulty, EndgameAttempt, EndgamePos, Prefs, PieceGroup, Side } from "@/lib/chess/types";
import { Board } from "./Board";
import { EnginePanelBody } from "./EnginePanel";
import { EvalBar } from "./EvalBar";
import { Button, CollapsiblePanel, Field, Meter, Panel, Pill, TextInput } from "./ui";
import { useEngineAnalysis } from "@/lib/chess/use-engine-analysis";

const NO_PREFS: Prefs = {};

const RANKS: Difficulty[] = ["beginner", "intermediate", "advanced", "expert"];
/** The shelf order: mates first, then the piece you promote, then the messy ones. */
const GROUPS: Array<PieceGroup | "custom"> = ["basic", "pawn", "knight", "bishop", "rook", "queen", "mixed", "custom"];
const GROUP_LABEL: Record<PieceGroup | "custom", string> = {
  basic: "Basic mates",
  pawn: "Pawn endings",
  knight: "Knight endings",
  bishop: "Bishop endings",
  rook: "Rook endings",
  queen: "Queen endings",
  mixed: "Practical conversion",
  custom: "Your positions",
};
const GROUP_HINT: Record<PieceGroup | "custom", string> = {
  basic: "King and queen, king and rook, the two-bishop and lone-king finishes everything else is built on.",
  pawn: "King and pawn against king: opposition, outflanking, and the squares that decide them.",
  knight: "One knight's tempo — zugzwang, the take-off, and knights versus pawns.",
  bishop: "Same-colour and opposite-colour bishop endings, and the wrong rook's bishop.",
  rook: "Rook endings, from the Lucena and Philidor positions to active-rook defence.",
  queen: "Queen endings, where the checks are the plan and pawn races decide the rest.",
  mixed: "Converting an extra piece or pawn against anything still on the board.",
  custom: "Positions you added from a FEN.",
};

function groupOf(pos: EndgamePos): PieceGroup | "custom" {
  return pos.source === "user" ? "custom" : pos.pieceGroup;
}

function rankLabel(rank: Difficulty) {
  return rank[0].toUpperCase() + rank.slice(1);
}

function pct(solved: number, total: number) {
  return total ? (solved / total) * 100 : 0;
}

type Stats = Map<string, { tries: number; wins: number }>;

function solvedIn(rows: EndgamePos[], stats: Stats) {
  return rows.filter((pos) => (stats.get(pos.id)?.wins ?? 0) > 0).length;
}

function MenuSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs text-mist">
      {label}
      <select
        className="h-11 rounded-lg border border-line bg-canvas px-3 text-sm text-ivory outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export function EndgamesView() {
  const custom = useOe((s) => s.endgames);
  const attempts = useOe((s) => s.attempts);
  const settings = useOe((s) => s.settings);
  const patchPrefs = useOe((s) => s.patchPrefs);
  const saveAttempt = useOe((s) => s.saveAttempt);
  const saveEndgame = useOe((s) => s.saveEndgame);
  const noteSuccess = useOe((s) => s.noteSuccess);
  const positions = useMemo(() => allEndgames(custom), [custom]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftFen, setDraftFen] = useState("");
  const [draftTitle, setDraftTitle] = useState("");

  // The shelf is a drill-down — piece group, then difficulty — and the two lists below it stay filterable.
  const prefs = settings.prefs ?? NO_PREFS;
  const filters = prefs.endgameFilters ?? {};
  const status = filters.status ?? "all";
  const setStatus = (next: string) => patchPrefs({ endgameFilters: { ...filters, status: next } });
  const side = filters.side ?? "all";
  const setSide = (next: "all" | Side) => patchPrefs({ endgameFilters: { ...filters, side: next } });
  const addCollapsed = prefs.endgameAddCollapsed ?? false;
  const setAddCollapsed = (next: boolean) => patchPrefs({ endgameAddCollapsed: next });
  const stats = useMemo(() => {
    const map = new Map<string, { tries: number; wins: number }>();
    for (const attempt of attempts) {
      if (attempt.success == null) continue;
      const row = map.get(attempt.endgameId) ?? { tries: 0, wins: 0 };
      row.tries += 1;
      if (attempt.success) row.wins += 1;
      map.set(attempt.endgameId, row);
    }
    return map;
  }, [attempts]);

  // One pass per group: how many positions it holds and how many are already banked.
  const groups = useMemo(() => {
    return GROUPS.map((key) => {
      const rows = positions.filter((pos) => groupOf(pos) === key);
      const byDifficulty = RANKS.map((rank) => {
        const slice = rows.filter((pos) => pos.difficulty === rank);
        return { rank, total: slice.length, solved: solvedIn(slice, stats) };
      }).filter((row) => row.total > 0);
      return { key, total: rows.length, solved: solvedIn(rows, stats), tried: rows.filter((pos) => stats.has(pos.id)).length, byDifficulty };
    }).filter((row) => row.total > 0);
  }, [positions, stats]);
  const group = groups.find((row) => row.key === filters.piece) ?? null;
  const rank = group?.byDifficulty.find((row) => row.rank === filters.difficulty)?.rank ?? null;
  const setGroup = (next: PieceGroup | "custom" | "all") =>
    patchPrefs({ endgameFilters: { ...filters, piece: next, difficulty: "all" } });
  const setRank = (next: Difficulty) => patchPrefs({ endgameFilters: { ...filters, difficulty: next } });
  const backToGroup = () => patchPrefs({ endgameFilters: { ...filters, difficulty: "all" } });

  const slice = group ? positions.filter((pos) => groupOf(pos) === group.key && (!rank || pos.difficulty === rank)) : positions;
  const filtered = slice.filter((pos) => {
    if (side !== "all" && pos.userSide !== side) return false;
    const row = stats.get(pos.id);
    if (status === "solved" && !(row && row.wins > 0)) return false;
    if (status === "failed" && !(row && row.tries > row.wins)) return false;
    if (status === "new" && row) return false;
    return true;
  });
  const active = positions.find((pos) => pos.id === activeId) ?? null;

  function randomOne() {
    const pick = filtered[Math.floor(Math.random() * filtered.length)];
    if (pick) setActiveId(pick.id);
  }
  function weakOne() {
    const ranked = [...filtered].sort((a, b) => {
      const sa = stats.get(a.id);
      const sb = stats.get(b.id);
      const ra = sa && sa.tries ? sa.wins / sa.tries : -1;
      const rb = sb && sb.tries ? sb.wins / sb.tries : -1;
      return ra - rb;
    });
    if (ranked[0]) setActiveId(ranked[0].id);
  }
  function addCustom() {
    if (!fenOk(draftFen.trim())) return;
    const chess = new Chess(draftFen.trim());
    const pos: EndgamePos = {
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      title: draftTitle.trim() || "Custom position",
      fen: chess.fen(),
      category: "Custom",
      pieceGroup: "mixed",
      difficulty: "intermediate",
      userSide: chess.turn(),
      objective: "checkmate",
      mateIn: null,
      maxMoves: 40,
      holdMoves: null,
      notes: "A position you added. Play until checkmate.",
      solution: [],
      source: "user",
      updatedAt: Date.now(),
    };
    saveEndgame(pos);
    setActiveId(pos.id);
    setDraftFen("");
    setDraftTitle("");
  }

  const solvedCount = solvedIn(positions, stats);

  return (
    <div className="grid gap-4">
      {active ? (
        <Trainer
          key={active.id}
          pos={active}
          onExit={() => setActiveId(null)}
          onNext={() => {
            const index = filtered.findIndex((pos) => pos.id === active.id);
            const next = filtered[index + 1] ?? filtered[0];
            if (next) setActiveId(next.id);
          }}
          onSave={(attempt) => {
            saveAttempt(attempt);
            if (attempt.success) noteSuccess();
          }}
        />
      ) : group && rank ? (
        <>
          <Panel>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Button variant="quiet" onClick={backToGroup}>Back to {GROUP_LABEL[group.key]}</Button>
                <h2 className="mt-2 text-2xl">{GROUP_LABEL[group.key]} · {rankLabel(rank)}</h2>
                <p className="mt-1 text-sm text-mist">{filtered.length} of {slice.length} positions</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={randomOne} disabled={filtered.length === 0}>Random</Button>
                <Button variant="quiet" onClick={weakOne} disabled={filtered.length === 0}>Train weak</Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MenuSelect
                label="Your side"
                value={side}
                onChange={(value) => setSide(value as "all" | Side)}
                options={[{ value: "all", label: "Either" }, { value: "w", label: "White" }, { value: "b", label: "Black" }]}
              />
              <MenuSelect
                label="Progress"
                value={status}
                onChange={setStatus}
                options={[{ value: "all", label: "All" }, { value: "new", label: "New" }, { value: "solved", label: "Solved" }, { value: "failed", label: "Failed" }]}
              />
            </div>
          </Panel>
          <div className="grid gap-2 md:grid-cols-2">
            {filtered.map((pos) => {
              const row = stats.get(pos.id);
              return (
                <button key={pos.id} type="button" className="rounded-xl border border-line bg-surface p-3 text-left hover:border-brass" onClick={() => setActiveId(pos.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg">{pos.title}</h2>
                    <Pill tone={pos.difficulty === "beginner" ? "ok" : "brass"}>{pos.difficulty}</Pill>
                  </div>
                  <p className="mt-1 text-sm text-mist">{pos.category} · you play {pos.userSide === "w" ? "White" : "Black"} · {pos.objective}</p>
                  <p className="mt-2 text-xs text-mist">{(row?.wins ?? 0) > 0 ? "Solved" : row ? "Not solved yet" : "Not tried"}{pos.mateIn ? ` · mate in ${pos.mateIn}` : ""}</p>
                </button>
              );
            })}
          </div>
          {filtered.length === 0 && <p className="text-sm text-mist">Nothing here with these filters on.</p>}
        </>
      ) : group ? (
        <>
          <Panel>
            <Button variant="quiet" onClick={() => setGroup("all")}>Back to endgames</Button>
            <h2 className="mt-2 text-2xl">{GROUP_LABEL[group.key]}</h2>
            <p className="mt-1 text-sm text-mist">{GROUP_HINT[group.key]}</p>
            <div className="mt-3">
              <Meter value={pct(group.solved, group.total)} label="Solved" detail={`${group.solved} of ${group.total} banked · ${group.tried} tried`} />
            </div>
          </Panel>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {group.byDifficulty.map((row) => (
              <button key={row.rank} type="button" className="rounded-xl border border-line bg-surface p-3 text-left hover:border-brass" onClick={() => setRank(row.rank)}>
                <h2 className="text-lg">{rankLabel(row.rank)}</h2>
                <p className="mt-1 text-xs text-mist">{row.total} position{row.total === 1 ? "" : "s"}</p>
                <div className="mt-3">
                  <Meter value={pct(row.solved, row.total)} />
                </div>
                <p className="mt-2 text-xs tabular-nums text-mist">{row.solved} solved</p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <Panel>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl">Endgames</h2>
                <p className="mt-1 text-sm text-mist">Pick a piece group, then a difficulty.</p>
              </div>
            </div>
            <div className="mt-3">
              <Meter value={pct(solvedCount, positions.length)} label="Solved" detail={`${solvedCount} of ${positions.length} banked`} />
            </div>
          </Panel>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((row) => (
              <button key={row.key} type="button" className="rounded-xl border border-line bg-surface p-3 text-left hover:border-brass" onClick={() => setGroup(row.key)}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg">{GROUP_LABEL[row.key]}</h2>
                  <Pill tone={row.solved === row.total ? "ok" : "mist"}>{row.solved}/{row.total}</Pill>
                </div>
                <p className="mt-1 text-sm text-mist">{GROUP_HINT[row.key]}</p>
                <div className="mt-3">
                  <Meter value={pct(row.solved, row.total)} />
                </div>
                <p className="mt-2 text-xs tabular-nums text-mist">{row.tried} tried · {row.byDifficulty.length} level{row.byDifficulty.length === 1 ? "" : "s"}</p>
              </button>
            ))}
          </div>
          <CollapsiblePanel title="Add a position" collapsed={addCollapsed} onToggle={() => setAddCollapsed(!addCollapsed)}>
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Title"><TextInput value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></Field>
              <Field label="FEN"><TextInput value={draftFen} onChange={(event) => setDraftFen(event.target.value)} /></Field>
            </div>
            <Button className="mt-3" onClick={addCustom} disabled={!fenOk(draftFen.trim())}>Save position</Button>
          </CollapsiblePanel>
        </>
      )}
    </div>
  );
}

function Trainer({ pos, onExit, onNext, onSave }: { pos: EndgamePos; onExit: () => void; onNext: () => void; onSave: (attempt: EndgameAttempt) => void }) {
  const settings = useOe((s) => s.settings);
  const [sans, setSans] = useState<string[]>([]);
  const [hints, setHints] = useState(0);
  const [arrow, setArrow] = useState<{ from: string; to: string }[]>([]);
  const [started, setStarted] = useState(() => Date.now());
  const [attemptId, setAttemptId] = useState(() => crypto.randomUUID());
  const [settled, setSettled] = useState(false);
  const [note, setNote] = useState("");
  const [thinking, setThinking] = useState(false);
  const [seats, setSeats] = useState<Record<Side, "you" | "stockfish">>({
    w: pos.userSide === "w" ? "you" : "stockfish",
    b: pos.userSide === "b" ? "you" : "stockfish",
  });
  const [engineError, setEngineError] = useState("");
  const [engineNonce, setEngineNonce] = useState(0);
  const [analysis, setAnalysis] = useState(false);
  const [premoves, setPremoves] = useState<QueuedMove[]>([]);
  const [premoveNote, setPremoveNote] = useState("");
  const saved = useRef(false);
  const tries = useRef(0);
  const played = useMemo(() => replay(pos.fen, sans), [pos.fen, sans]);
  const uciKey = played.uci.join(" ");
  const judgement = judgeEndgame(played.chess, pos);
  const turn = played.chess.turn();
  const engineTurn = !settled && judgement.state === "playing" && seats[turn] === "stockfish";
  const humans = (["w", "b"] as Side[]).filter((side) => seats[side] === "you");
  const last = played.chess.history({ verbose: true }).at(-1);
  // The takeover search owns the engine during engine turns, so analysis yields to it.
  const evalAnalysis = useEngineAnalysis({
    fen: pos.fen,
    uciMoves: played.uci,
    enabled: analysis && !engineTurn && !settled && judgement.state === "playing",
  });

  useEffect(() => {
    if (judgement.state === "playing" || saved.current) return;
    saved.current = true;
    setSettled(true);
    setNote(judgement.reason);
    playTone(judgement.state === "solved" ? "done" : "fail");
    onSave({
      id: attemptId,
      endgameId: pos.id,
      startedAt: started,
      finishedAt: Date.now(),
      success: judgement.state === "solved",
      moves: judgement.userMoves,
      hints,
      timeMs: Date.now() - started,
      updatedAt: Date.now(),
    });
  }, [judgement.state, judgement.reason, judgement.userMoves, settled, attemptId, hints, onSave, pos.id, started]);

  useEffect(() => {
    tries.current = 0;
  }, [pos.id, sans.length]);

  useEffect(() => {
    if (!engineTurn) return;
    let cancel = false;
    const engine = getEngine();
    setThinking(true);
    const movetime = settings.endgameMaximum ? settings.endgameThinkMs : settings.playThinkMs;
    engine
      .go({
        fen: pos.fen,
        uciMoves: uciKey ? uciKey.split(" ") : [],
        movetime,
        strength: settings.endgameMaximum ? "max" : settings.playStrength,
      })
      .then((best) => {
        if (cancel) return;
        const next = best ? applyUciMove(pos.fen, sans, best) : null;
        if (!next) {
          if (tries.current < 2) {
            tries.current += 1;
            setEngineNonce((value) => value + 1);
            return;
          }
          setEngineError(best ? "Stockfish returned a move this position rejects." : "Stockfish did not answer.");
          return;
        }
        tries.current = 0;
        setEngineError("");
        setSans(next);
        playTone("move");
      })
      .catch((error: unknown) => {
        if (cancel) return;
        if (tries.current < 2) {
          tries.current += 1;
          setEngineNonce((value) => value + 1);
          return;
        }
        setEngineError(error instanceof Error ? error.message : "Engine error");
      })
      .finally(() => {
        if (!cancel) setThinking(false);
      });
    return () => {
      cancel = true;
      engine.stop();
    };
  }, [engineTurn, pos.fen, uciKey, sans, engineNonce, settings.endgameMaximum, settings.endgameThinkMs, settings.playStrength, settings.playThinkMs]);

  function playMove(from: string, to: string, promotion?: string) {
    try {
      const moved = played.chess.move({ from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined });
      setSans((rows) => [...rows, moved.san]);
      setArrow([]);
      playTone(moved.captured ? "capture" : "move");
      return true;
    } catch {
      return false;
    }
  }

  function queuePremove(move: QueuedMove) {
    setPremoveNote("");
    setPremoves((queue) => enqueuePremove(queue, move));
  }

  function onMove(from: string, to: string, promotion?: string) {
    if (settled) return;
    const piece = played.chess.get(from as "a1");
    if (!piece || seats[piece.color] !== "you") return;
    if (thinking || piece.color !== turn) {
      queuePremove({ from, to, promotion, color: piece.color });
      return;
    }
    // A move made by hand answers the queued head that was waiting for this turn — unless the flush
    // already spent it, in which case the next entry is aimed at a later turn and stays put.
    if (claimPremoveTurn()) setPremoves((queue) => dropAnsweredPremove(queue, piece.color));
    playMove(from, to, promotion);
  }

  const premoveSlot = useRef("");
  // One queue entry per turn, so an illegal head is cancelled alone instead of cascading into the next.
  function claimPremoveTurn() {
    const slot = `${turn}${sans.length}`;
    if (premoveSlot.current === slot) return false;
    premoveSlot.current = slot;
    return true;
  }

  useEffect(() => {
    if (settled || thinking || seats[turn] !== "you" || judgement.state !== "playing" || premoves.length === 0) return;
    // The head waits for its own side's turn, so a two-human queue is not judged against the other clock.
    if (premoves[0].color !== turn) return;
    if (!claimPremoveTurn()) return;
    const { move, cancelled, remaining } = dequeuePremove(played.chess.fen(), premoves);
    setPremoves(remaining);
    if (cancelled) setPremoveNote(`${premoveLabel(cancelled)} is no longer legal, so it was dropped.`);
    if (move) playMove(move.from, move.to, move.promotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premoves, turn, thinking, settled, sans]);

  async function hint() {
    const engine = getEngine();
    const best = await engine.go({ fen: pos.fen, uciMoves: played.uci, movetime: 700, strength: "max" });
    if (!best) return;
    setArrow([{ from: best.slice(0, 2), to: best.slice(2, 4) }]);
    setHints((value) => value + 1);
  }

  function takeback() {
    setSettled(false);
    saved.current = false;
    setNote("");
    setPremoves([]);
    setPremoveNote("");
    premoveSlot.current = "";
    setSans((rows) => {
      if (rows.length === 0) return rows;
      const lastColor = replay(pos.fen, rows).chess.history({ verbose: true }).at(-1)?.color;
      if (lastColor && lastColor !== pos.userSide) return rows.slice(0, -2);
      return rows.slice(0, -1);
    });
  }

  function retry() {
    saved.current = false;
    setSans([]);
    setSettled(false);
    setNote("");
    setArrow([]);
    setPremoves([]);
    setPremoveNote("");
    premoveSlot.current = "";
    // Fresh attempt identity so the retry is recorded as a new row instead of overwriting.
    setAttemptId(crypto.randomUUID());
    setStarted(Date.now());
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]" data-fen={played.chess.fen()}>
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full max-w-xl items-stretch gap-2">
          {analysis && <EvalBar info={evalAnalysis.info} stm={turn} flipped={seats.b === "you" && seats.w !== "you"} />}
          <div className="min-w-0 flex-1">
            <Board
              fen={played.chess.fen()}
              orientation={seats.b === "you" && seats.w !== "you" ? "black" : "white"}
              interactive={!settled && humans.length > 0}
              humanColors={humans}
              onPremove={queuePremove}
              coordinates={settings.coordinates}
              theme={settings.boardTheme}
              pieceSet={settings.pieceSet ?? "standard"}
              lastMove={last ? { from: last.from, to: last.to } : null}
              premoves={premoves}
              arrows={analysis ? [...arrow, ...evalAnalysis.arrows] : arrow}
              onMove={onMove}
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="quiet" onClick={onExit}>Back</Button>
          <Button variant="quiet" onClick={() => void hint()}>Hint</Button>
          <Button variant="quiet" onClick={takeback}>Takeback</Button>
          <Button variant="quiet" onClick={retry}>Retry</Button>
          <Button variant="quiet" onClick={() => setAnalysis((on) => !on)}>{analysis ? "Hide analysis" : "Analyze"}</Button>
        </div>
        {thinking && <p className="text-sm text-mist">Stockfish is thinking.</p>}
        {engineError && (
          <p className="text-sm text-danger">
            {engineError}{" "}
            <button type="button" className="underline" onClick={() => setEngineNonce((value) => value + 1)}>Try again</button>
          </p>
        )}
        {premoves.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
            <span className="text-mist">Queued:</span>
            {premoves.map((move, index) => (
              <span key={`${move.from}${move.to}${index}`} className="flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pl-2 pr-1">
                <span className="tabular-nums text-mist">{index + 1}</span>
                <span className="text-ivory">{premoveLabel(move)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${premoveLabel(move)} from the queue`}
                  className="grid h-5 w-5 place-items-center rounded-full text-mist hover:bg-surface hover:text-ivory"
                  onClick={() => setPremoves((queue) => queue.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </span>
            ))}
            <button type="button" className="rounded-full px-2 py-1 text-mist hover:bg-surface-2 hover:text-ivory" onClick={() => { setPremoves([]); setPremoveNote(""); }}>
              Clear
            </button>
          </div>
        )}
        {premoveNote && <p className="text-xs text-danger">{premoveNote}</p>}
        {settled && (
          <div className="fixed inset-0 z-40 grid place-items-center bg-scrim/70 p-4">
            <Panel className="w-full max-w-md text-center">
              <h2 className="text-2xl">{judgement.state === "solved" ? "Solved" : judgement.reason.includes("Move budget") ? "Move budget exhausted. Try again?" : "Not this time"}</h2>
              <p className="mt-2 text-sm text-mist">{note}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button onClick={onNext}>Next position</Button>
                <Button variant="quiet" onClick={retry}>Try again</Button>
                <Button variant="quiet" onClick={onExit}>Back to menu</Button>
              </div>
            </Panel>
          </div>
        )}
      </div>
      <Panel className="h-[36rem] overflow-y-auto">
        <h2 className="text-2xl">{pos.title}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill>{pos.category}</Pill>
          <Pill tone="brass">{pos.difficulty}</Pill>
          <Pill tone="ok">{pos.objective}</Pill>
        </div>
        <p className="mt-3 text-sm text-mist">{pos.notes}</p>
        <div className="mt-4 grid gap-2">
          {(["w", "b"] as Side[]).map((side) => (
            <div key={side} className="flex items-center justify-between gap-2">
              <span className="text-sm">{side === "w" ? "White" : "Black"}</span>
              <div className="flex gap-2">
                <Button variant={seats[side] === "you" ? "primary" : "quiet"} onClick={() => setSeats((current) => ({ ...current, [side]: "you" }))}>Human</Button>
                <Button variant={seats[side] === "stockfish" ? "primary" : "quiet"} onClick={() => setSeats((current) => ({ ...current, [side]: "stockfish" }))}>Computer</Button>
              </div>
            </div>
          ))}
        </div>
        {pos.mateIn != null && <p className="mt-2 text-sm">Mate in {pos.mateIn}.</p>}
        <p className="mt-3 text-sm">Moves {judgement.userMoves}{pos.maxMoves ? ` / ${pos.maxMoves}` : ""}{pos.holdMoves ? ` · hold ${pos.holdMoves}` : ""}</p>
        {pos.solution.length > 0 && <p className="mt-3 text-sm">Solution: {pos.solution.join(" ")}</p>}
        {analysis && (
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="text-sm text-mist">Engine</h3>
            <div className="mt-1">
              <EnginePanelBody info={evalAnalysis.info} enabled={analysis} />
            </div>
          </div>
        )}
        {note && <p className="mt-4 text-lg text-brass">{note}</p>}
        <p className="mt-4 text-xs text-mist break-all">{pos.fen}</p>
      </Panel>
    </div>
  );
}
