import { Chess } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { judgeEndgame } from "@/lib/chess/endgame-result";
import { getEngine } from "@/lib/chess/engine";
import { applyUciMove, fenOk, replay } from "@/lib/chess/rules";
import { playTone } from "@/lib/chess/sound";
import { allEndgames, useOe } from "@/lib/chess/store";
import type { Difficulty, EndgameAttempt, EndgamePos, Side } from "@/lib/chess/types";
import { Board } from "./Board";
import { Button, Field, Panel, Pill, TextInput } from "./ui";

const DIFFICULTIES: Array<Difficulty | "all"> = ["all", "beginner", "intermediate", "advanced", "expert"];

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

  return (
    <div className="grid gap-4">
      {active ? (
        <Trainer
          pos={active}
          onExit={() => setActiveId(null)}
          onSave={(attempt) => {
            saveAttempt(attempt);
            if (attempt.success) noteSuccess();
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={randomOne}>Random</Button>
            <Button variant="quiet" onClick={weakOne}>Train weak</Button>
            {DIFFICULTIES.map((item) => (
              <Button key={item} variant={difficulty === item ? "primary" : "quiet"} onClick={() => setDifficulty(item)}>
                {item}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {["all", "basic", "pawn", "knight", "bishop", "rook", "queen", "mixed"].map((item) => (
              <Button key={item} variant={piece === item ? "primary" : "ghost"} onClick={() => setPiece(item)}>{item}</Button>
            ))}
            <Button variant={side === "all" ? "primary" : "ghost"} onClick={() => setSide("all")}>Either side</Button>
            <Button variant={side === "w" ? "primary" : "ghost"} onClick={() => setSide("w")}>White</Button>
            <Button variant={side === "b" ? "primary" : "ghost"} onClick={() => setSide("b")}>Black</Button>
            {["all", "new", "solved", "failed"].map((item) => (
              <Button key={item} variant={status === item ? "primary" : "ghost"} onClick={() => setStatus(item)}>{item}</Button>
            ))}
          </div>
          <div className="flex gap-2 overflow-auto">
            {categories.map((item) => (
              <Button key={item} variant={category === item ? "primary" : "quiet"} onClick={() => setCategory(item)}>{item}</Button>
            ))}
          </div>
          <p className="text-sm text-mist">{filtered.length} positions. Tablebases are not installed — Stockfish judges the defense.</p>
          <div className="grid gap-2 md:grid-cols-2">
            {filtered.slice(0, 60).map((pos) => {
              const row = stats.get(pos.id);
              return (
                <button key={pos.id} type="button" className="rounded-xl border border-line bg-ink-2 p-3 text-left hover:border-brass" onClick={() => setActiveId(pos.id)}>
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

function Trainer({ pos, onExit, onSave }: { pos: EndgamePos; onExit: () => void; onSave: (attempt: EndgameAttempt) => void }) {
  const settings = useOe((s) => s.settings);
  const [sans, setSans] = useState<string[]>([]);
  const [hints, setHints] = useState(0);
  const [arrow, setArrow] = useState<{ from: string; to: string }[]>([]);
  const [started] = useState(() => Date.now());
  const [attemptId] = useState(() => crypto.randomUUID());
  const [settled, setSettled] = useState(false);
  const [note, setNote] = useState("");
  const [thinking, setThinking] = useState(false);
  const saved = useRef(false);
  const played = useMemo(() => replay(pos.fen, sans), [pos.fen, sans]);
  const judgement = judgeEndgame(played.chess, pos);
  const engineTurn = !settled && judgement.state === "playing" && played.chess.turn() !== pos.userSide;
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
    if (!engineTurn) return;
    let cancel = false;
    const engine = getEngine();
    setThinking(true);
    engine
      .go({
        fen: pos.fen,
        uciMoves: played.uci,
        movetime: settings.endgameMaximum ? settings.endgameThinkMs : settings.playThinkMs,
        strength: settings.endgameMaximum ? "max" : settings.playStrength,
      })
      .then((best) => {
        if (cancel || !best) return;
        setSans((current) => applyUciMove(pos.fen, current, best) ?? current);
        playTone("move");
      })
      .finally(() => {
        if (!cancel) setThinking(false);
      });
    return () => {
      cancel = true;
      engine.stop();
    };
  }, [engineTurn, pos.fen, played.uci, settings.endgameMaximum, settings.endgameThinkMs, settings.playStrength, settings.playThinkMs]);

  function onMove(from: string, to: string, promotion?: string) {
    if (engineTurn || settled || thinking) return;
    try {
      const moved = played.chess.move({ from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined });
      setSans((rows) => [...rows, moved.san]);
      setArrow([]);
      playTone(moved.captured ? "capture" : "move");
    } catch {
      /* illegal */
    }
  }

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
    setSans((rows) => {
      if (rows.length === 0) return rows;
      const lastColor = replay(pos.fen, rows).chess.history({ verbose: true }).at(-1)?.color;
      if (lastColor && lastColor !== pos.userSide) return rows.slice(0, -2);
      return rows.slice(0, -1);
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col items-center gap-3">
        <Board
          fen={played.chess.fen()}
          orientation={pos.userSide === "w" ? "white" : "black"}
          interactive={!engineTurn && !settled && !thinking}
          coordinates={settings.coordinates}
          theme={settings.boardTheme}
          lastMove={last ? { from: last.from, to: last.to } : null}
          arrows={arrow}
          onMove={onMove}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="quiet" onClick={onExit}>Back</Button>
          <Button variant="quiet" onClick={() => void hint()}>Hint</Button>
          <Button variant="quiet" onClick={takeback}>Takeback</Button>
          <Button variant="quiet" onClick={() => { saved.current = false; setSans([]); setSettled(false); setNote(""); setArrow([]); }}>Retry</Button>
        </div>
        {thinking && <p className="text-sm text-mist">Stockfish is defending.</p>}
      </div>
      <Panel>
        <h2 className="text-2xl">{pos.title}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill>{pos.category}</Pill>
          <Pill tone="brass">{pos.difficulty}</Pill>
          <Pill tone="ok">{pos.objective}</Pill>
        </div>
        <p className="mt-3 text-sm text-mist">{pos.notes}</p>
        {pos.mateIn != null && <p className="mt-2 text-sm">Mate in {pos.mateIn}.</p>}
        <p className="mt-3 text-sm">Moves {judgement.userMoves}{pos.maxMoves ? ` / ${pos.maxMoves}` : ""}{pos.holdMoves ? ` · hold ${pos.holdMoves}` : ""}</p>
        {pos.solution.length > 0 && <p className="mt-3 text-sm">Solution: {pos.solution.join(" ")}</p>}
        {note && <p className="mt-4 text-lg text-brass">{note}</p>}
        <p className="mt-4 text-xs text-mist break-all">{pos.fen}</p>
      </Panel>
    </div>
  );
}
