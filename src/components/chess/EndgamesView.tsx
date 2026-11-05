import { Chess } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { judgeEndgame } from "@/lib/chess/endgame-result";
import { getEngine } from "@/lib/chess/engine";
import { applyUciMove, fenOk, replay } from "@/lib/chess/rules";
import { playTone } from "@/lib/chess/sound";
import { allEndgames, useOe } from "@/lib/chess/store";
import type { Difficulty, EndgameAttempt, EndgamePos, Side } from "@/lib/chess/types";
import { Board } from "./Board";
import { Button, Field, Meter, Panel, Pill, TextInput } from "./ui";

const DIFFICULTIES: Array<Difficulty | "all"> = ["all", "beginner", "intermediate", "advanced", "expert"];
const PIECES = ["all", "basic", "pawn", "knight", "bishop", "rook", "queen", "mixed"];

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
  const saveAttempt = useOe((s) => s.saveAttempt);
  const saveEndgame = useOe((s) => s.saveEndgame);
  const noteSuccess = useOe((s) => s.noteSuccess);
  const positions = allEndgames(custom);
  const [category, setCategory] = useState("All");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [piece, setPiece] = useState("all");
  const [status, setStatus] = useState("all");
  const [side, setSide] = useState<"all" | Side>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftFen, setDraftFen] = useState("");
  const [draftTitle, setDraftTitle] = useState("");

  const categories = ["All", ...Array.from(new Set(positions.map((pos) => pos.category)))];
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

  const filtered = positions.filter((pos) => {
    if (category !== "All" && pos.category !== category) return false;
    if (difficulty !== "all" && pos.difficulty !== difficulty) return false;
    if (piece !== "all" && pos.pieceGroup !== piece) return false;
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

  const solvedCount = positions.filter((pos) => (stats.get(pos.id)?.wins ?? 0) > 0).length;

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
      ) : (
        <>
          <Panel>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl">Endgames</h2>
                <p className="mt-1 text-sm text-mist">{filtered.length} of {positions.length} positions</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={randomOne}>Random</Button>
                <Button variant="quiet" onClick={weakOne}>Train weak</Button>
              </div>
            </div>
            <div className="mt-3">
              <Meter value={positions.length ? (solvedCount / positions.length) * 100 : 0} label="Solved" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MenuSelect label="Category" value={category} onChange={setCategory} options={categories.map((item) => ({ value: item, label: item }))} />
              <MenuSelect label="Difficulty" value={difficulty} onChange={(value) => setDifficulty(value as Difficulty | "all")} options={DIFFICULTIES.map((item) => ({ value: item, label: item[0].toUpperCase() + item.slice(1) }))} />
              <MenuSelect label="Pieces" value={piece} onChange={setPiece} options={PIECES.map((item) => ({ value: item, label: item[0].toUpperCase() + item.slice(1) }))} />
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
                  <p className="mt-2 text-xs text-mist">{row ? `${row.wins}/${row.tries} solved` : "Not tried"}{pos.mateIn ? ` · mate in ${pos.mateIn}` : ""}</p>
                </button>
              );
            })}
          </div>
          <Panel>
            <h2 className="mb-2 text-lg">Add a position</h2>
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Title"><TextInput value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></Field>
              <Field label="FEN"><TextInput value={draftFen} onChange={(event) => setDraftFen(event.target.value)} /></Field>
            </div>
            <Button className="mt-3" onClick={addCustom}>Save position</Button>
          </Panel>
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
  const [premoves, setPremoves] = useState<{ from: string; to: string; promotion?: string }[]>([]);
  const saved = useRef(false);
  const tries = useRef(0);
  const played = useMemo(() => replay(pos.fen, sans), [pos.fen, sans]);
  const uciKey = played.uci.join(" ");
  const judgement = judgeEndgame(played.chess, pos);
  const turn = played.chess.turn();
  const engineTurn = !settled && judgement.state === "playing" && seats[turn] === "stockfish";
  const humans = (["w", "b"] as Side[]).filter((side) => seats[side] === "you");
  const last = played.chess.history({ verbose: true }).at(-1);

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

  function queuePremove(from: string, to: string, promotion?: string) {
    setPremoves((queue) => {
      const next = { from, to, promotion };
      if (queue.length >= 2) return [queue[0], next];
      return [...queue, next];
    });
  }

  function onMove(from: string, to: string, promotion?: string) {
    if (settled) return;
    const piece = played.chess.get(from as "a1");
    if (!piece || seats[piece.color] !== "you") return;
    if (thinking || piece.color !== turn) {
      queuePremove(from, to, promotion);
      return;
    }
    playMove(from, to, promotion);
  }

  useEffect(() => {
    if (settled || thinking || seats[turn] !== "you" || judgement.state !== "playing" || premoves.length === 0) return;
    const [head, ...rest] = premoves;
    setPremoves(rest);
    playMove(head.from, head.to, head.promotion);
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
    // Fresh attempt identity so the retry is recorded as a new row instead of overwriting.
    setAttemptId(crypto.randomUUID());
    setStarted(Date.now());
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]" data-fen={played.chess.fen()}>
      <div className="flex flex-col items-center gap-3">
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
          premoveSquares={premoves.flatMap((p) => [p.from, p.to])}
          arrows={arrow}
          onMove={onMove}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="quiet" onClick={onExit}>Back</Button>
          <Button variant="quiet" onClick={() => void hint()}>Hint</Button>
          <Button variant="quiet" onClick={takeback}>Takeback</Button>
          <Button variant="quiet" onClick={retry}>Retry</Button>
        </div>
        {thinking && <p className="text-sm text-mist">Stockfish is thinking.</p>}
        {engineError && (
          <p className="text-sm text-danger">
            {engineError}{" "}
            <button type="button" className="underline" onClick={() => setEngineNonce((value) => value + 1)}>Try again</button>
          </p>
        )}
        {premoves.length > 0 && <p className="text-sm text-mist">{premoves.length} premove{premoves.length > 1 ? "s" : ""} set.</p>}
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
        {note && <p className="mt-4 text-lg text-brass">{note}</p>}
        <p className="mt-4 text-xs text-mist break-all">{pos.fen}</p>
      </Panel>
    </div>
  );
}
