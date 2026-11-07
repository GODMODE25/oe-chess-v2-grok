import { useEffect, useMemo, useRef, useState } from "react";
import { getEngine } from "@/lib/chess/engine";
import { dequeuePremove, dropAnsweredPremove, enqueuePremove, premoveLabel, type QueuedMove } from "@/lib/chess/premove";
import { applyUciMove, capturedPieces, fenOk, materialLead, replay, START_FEN, statusOf } from "@/lib/chess/rules";
import { playTone, setSoundEnabled } from "@/lib/chess/sound";
import { useOe } from "@/lib/chess/store";
import type { EngineInfo, PanelPref, PieceSet, PlayPanelId, Prefs, Side } from "@/lib/chess/types";
import { Board } from "./Board";
import { EnginePanelBody } from "./EnginePanel";
import { EvalBar } from "./EvalBar";
import { PieceGlyph } from "./pieces";
import { Button, cn, CollapsiblePanel, Field, TextInput } from "./ui";

const TIMES = [
  { id: "unlimited", label: "Unlimited", ms: 0, inc: 0 },
  { id: "1+0", label: "1", ms: 60_000, inc: 0 },
  { id: "2+1", label: "2+1", ms: 2 * 60_000, inc: 1_000 },
  { id: "3+2", label: "3+2", ms: 3 * 60_000, inc: 2_000 },
  { id: "5+0", label: "5+0", ms: 5 * 60_000, inc: 0 },
  { id: "10+0", label: "10+0", ms: 10 * 60_000, inc: 0 },
  { id: "15+10", label: "15+10", ms: 15 * 60_000, inc: 10_000 },
];

function clockText(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const PIECE_NAMES: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen" };

/** The pieces one player has taken, plus how much they are up — the way a board tray reads. */
function MaterialRow({ side, taken, takenColor, lead, pieceSet }: {
  side: Side;
  taken: string[];
  takenColor: Side;
  lead: number;
  pieceSet: PieceSet;
}) {
  const name = side === "w" ? "White" : "Black";
  const label = taken.length
    ? `${name} took ${taken.map((type) => PIECE_NAMES[type] ?? type).join(", ")}`
    : `${name} has taken nothing`;
  return (
    <div
      role="img"
      aria-label={lead > 0 ? `${label}. ${name} is up ${lead}.` : label}
      className="flex min-h-7 w-full items-center gap-1 text-xs"
      title={lead > 0 ? `${name} is up ${lead}` : undefined}
    >
      {taken.map((type, index) => (
        <PieceGlyph key={`${type}-${index}`} type={type} color={takenColor} set={pieceSet} className="h-5 w-5 opacity-80" />
      ))}
      {lead > 0 && <span className="ml-1 font-medium tabular-nums text-brass">+{lead}</span>}
    </div>
  );
}

const DEFAULT_SEATS: Record<Side, "you" | "stockfish"> = { w: "you", b: "stockfish" };
const NO_PREFS: Prefs = {};

const PANELS: { id: PlayPanelId; label: string }[] = [
  { id: "presets", label: "Presets" },
  { id: "new", label: "New game" },
  { id: "moves", label: "Moves" },
  { id: "engine", label: "Engine" },
];

const DEFAULT_PREF: PanelPref = { visible: true, collapsed: false };

export function PlayView() {
  const settings = useOe((s) => s.settings);
  const patchSettings = useOe((s) => s.patchSettings);
  const patchPrefs = useOe((s) => s.patchPrefs);
  const profile = useOe((s) => s.profile);
  const launch = useOe((s) => s.launch);
  const setLaunch = useOe((s) => s.setLaunch);
  const saveGame = useOe((s) => s.saveGame);
  const [startFen, setStartFen] = useState(START_FEN);
  const [sans, setSans] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [player, setPlayer] = useState<Side>("w");
  const [premoves, setPremoves] = useState<QueuedMove[]>([]);
  const [premoveNote, setPremoveNote] = useState("");
  const [activeInc, setActiveInc] = useState(0);
  const [clock, setClock] = useState<{ w: number; b: number } | null>(null);
  const [gameId, setGameId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState("*");
  const [finished, setFinished] = useState(false);
  const [analysis, setAnalysis] = useState(false);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [thinking, setThinking] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [fenDraft, setFenDraft] = useState("");
  const [phase, setPhase] = useState<"idle" | "playing" | "paused">("idle");

  // Every setup choice lives in settings.prefs, so a reload or another device opens on the same position.
  const prefs = settings.prefs ?? NO_PREFS;
  const seats = prefs.playSeats ?? DEFAULT_SEATS;
  const setSeats = (next: Record<Side, "you" | "stockfish">) => patchPrefs({ playSeats: next });
  const orientation = prefs.orientation ?? "white";
  const setOrientation = (next: "white" | "black") => patchPrefs({ orientation: next });
  const timeId = prefs.timeId ?? "unlimited";
  const setTimeId = (next: string) => patchPrefs({ timeId: next });
  const customMinutes = prefs.customMinutes ?? "5";
  const setCustomMinutes = (next: string) => patchPrefs({ customMinutes: next });
  const customSeconds = prefs.customSeconds ?? "3";
  const setCustomSeconds = (next: string) => patchPrefs({ customSeconds: next });

  const customControl = useMemo(() => {
    const minutes = Math.min(180, Math.max(1, Number.parseInt(customMinutes, 10) || 0));
    const seconds = Math.min(180, Math.max(0, Number.parseInt(customSeconds, 10) || 0));
    return { id: "custom", label: `${minutes}+${seconds}`, ms: minutes * 60_000, inc: seconds * 1000 };
  }, [customMinutes, customSeconds]);
  const time = timeId === "custom" ? customControl : (TIMES.find((row) => row.id === timeId) ?? TIMES[0]);
  const timeControlLabel = time.id === "custom" ? time.label : time.id;
  const viewedSans = cursor == null ? sans : sans.slice(0, cursor);
  const viewed = useMemo(() => replay(startFen, viewedSans), [startFen, viewedSans]);
  const full = useMemo(() => replay(startFen, sans), [startFen, sans]);
  const browsing = cursor != null && cursor < sans.length;
  const status = statusOf(viewed.chess);
  const over = finished || status.over;
  const turn = full.chess.turn();
  const engineTurn = phase === "playing" && !browsing && !over && seats[turn] === "stockfish";
  const humans = (["w", "b"] as Side[]).filter((side) => seats[side] === "you");
  const last = viewed.chess.history({ verbose: true }).at(-1);
  const lost = useMemo(() => capturedPieces(viewed.chess), [viewed.chess]);
  const topColor: Side = orientation === "white" ? "b" : "w";
  const bottomColor: Side = orientation === "white" ? "w" : "b";
  const uciKey = full.uci.join(" ");

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

  useEffect(() => {
    if (!launch) return;
    setStartFen(launch.startFen || START_FEN);
    setSans(launch.sans);
    setPlayer(launch.player);
    setSeats({
      w: launch.player === "b" ? "stockfish" : "you",
      b: launch.player === "b" ? "you" : "stockfish",
    });
    setPremoves([]);
    setPremoveNote("");
    premoveSlot.current = "";
    setOrientation(launch.player === "w" ? "white" : "black");
    setCursor(null);
    setResult("*");
    setFinished(false);
    setClock(null);
    setTimeId("unlimited");
    setActiveInc(0);
    setGameId(crypto.randomUUID());
    setPhase("playing");
    setInfo(null);
    setLaunch(null);
  }, [launch, setLaunch]);

  useEffect(() => {
    if (phase !== "playing" || !clock || over || browsing) return;
    const id = window.setInterval(() => {
      setClock((current) => {
        if (!current) return current;
        const side = full.chess.turn();
        const next = { ...current, [side]: current[side] - 200 };
        if (next[side] <= 0) {
          next[side] = 0;
          setFinished(true);
          setResult(side === "w" ? "0-1" : "1-0");
        }
        return next;
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, clock, over, browsing, full]);

  useEffect(() => {
    if (phase !== "idle") return;
    setClock(time.ms ? { w: time.ms, b: time.ms } : null);
  }, [phase, time.ms, timeId]);

  const seatedOnce = useRef(false);
  useEffect(() => {
    // Only a seat change follows the board around; the first run must leave the remembered view alone.
    if (!seatedOnce.current) {
      seatedOnce.current = true;
      return;
    }
    if (seats.b === "you" && seats.w !== "you") setOrientation("black");
    else if (seats.w === "you" && seats.b !== "you") setOrientation("white");
  }, [seats]);

  // Move search and analysis share one effect on purpose: the move search must own the
  // engine slot while it runs, so analysis only kicks in when there is no engine turn.
  // (useEngineAnalysis serves the trainers, where there is no move search to interleave.)
  useEffect(() => {
    const wantMove = engineTurn;
    const wantAnalysis = analysis && !engineTurn;
    if (!wantMove && !wantAnalysis) return;
    let cancel = false;
    const engine = getEngine();
    if (wantMove) setThinking(true);
    engine
      .go({
        fen: wantMove ? startFen : viewed.chess.fen(),
        uciMoves: wantMove ? full.uci : [],
        movetime: wantMove ? settings.playThinkMs : undefined,
        depth: wantMove ? undefined : settings.analysisDepth,
        strength: settings.playStrength,
        onInfo: (next) => {
          if (!cancel) setInfo(next);
        },
      })
      .then((best) => {
        if (cancel || !best || !wantMove) return;
        const engineColor = full.chess.turn();
        const next = applyUciMove(startFen, sans, best);
        if (!next) return;
        setSans(next);
        setCursor(null);
        awardIncrement(engineColor);
        playTone("move");
      })
      .catch((error: unknown) => {
        if (!cancel) setEngineError(error instanceof Error ? error.message : "Engine error");
      })
      .finally(() => {
        if (!cancel) setThinking(false);
      });
    return () => {
      cancel = true;
      engine.stop();
    };
  }, [engineTurn, analysis, startFen, uciKey, sans, settings.playThinkMs, settings.playStrength, settings.analysisDepth, viewed.chess, full.uci]);

  useEffect(() => {
    if (status.over && result === "*") {
      setResult(status.result);
      setFinished(true);
      playTone(status.result === "1/2-1/2" ? "done" : "check");
    }
  }, [status.over, status.result, result]);

  useEffect(() => {
    if (sans.length === 0 && !finished) return;
    const handle = window.setTimeout(() => {
      saveGame({
        id: gameId,
        white: seats.w === "you" ? profile.name : "Stockfish",
        black: seats.b === "you" ? profile.name : "Stockfish",
        result: finished ? result : "*",
        startFen,
        sans,
        event: "Casual game",
        playerColor: seats.w === "you" && seats.b === "you" ? "either" : seats.b === "you" ? "b" : "w",
        timeControl: timeControlLabel,
        finished,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [sans, finished, result, gameId, startFen, seats, profile.name, timeControlLabel, saveGame]);

  // Increment comes from the control frozen at Start, so switching chips mid-game cannot change what a move adds.
  function awardIncrement(side: Side) {
    if (!clock || !activeInc) return;
    setClock((current) => (current ? { ...current, [side]: current[side] + activeInc } : current));
  }

  function playSan(from: string, to: string, promotion?: string) {
    let moved;
    try {
      moved = full.chess.move({ from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined });
    } catch {
      return false;
    }
    awardIncrement(moved.color);
    setSans((rows) => [...rows, moved.san]);
    setCursor(null);
    playTone(moved.captured ? "capture" : "move");
    return true;
  }

  function queuePremove(move: QueuedMove) {
    setPremoveNote("");
    setPremoves((queue) => enqueuePremove(queue, move));
  }

  function pushMove(from: string, to: string, promotion?: string) {
    if (phase !== "playing" || browsing || over) return;
    const piece = full.chess.get(from as "a1");
    if (!piece || seats[piece.color] !== "you") return;
    if (thinking || piece.color !== turn) {
      queuePremove({ from, to, promotion, color: piece.color });
      return;
    }
    // A move made by hand answers the queued head that was waiting for this turn — unless the flush
    // already spent it, in which case the next entry is aimed at a later turn and stays put.
    if (claimPremoveTurn()) setPremoves((queue) => dropAnsweredPremove(queue, piece.color));
    playSan(from, to, promotion);
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
    if (browsing || over || thinking || seats[turn] !== "you" || premoves.length === 0) return;
    // The head waits for its own side's turn, so a two-human queue is not judged against the other clock.
    if (premoves[0].color !== turn) return;
    if (!claimPremoveTurn()) return;
    const { move, cancelled, remaining } = dequeuePremove(full.chess.fen(), premoves);
    setPremoves(remaining);
    if (cancelled) setPremoveNote(`${premoveLabel(cancelled)} is no longer legal, so it was dropped.`);
    if (move) playSan(move.from, move.to, move.promotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premoves, turn, thinking, browsing, over, sans]);

  function undo() {
    const opponent = turn === "w" ? "b" : "w";
    const drop = sans.length >= 2 && seats[turn] === "you" && seats[opponent] === "stockfish" ? 2 : 1;
    setSans((rows) => rows.slice(0, Math.max(0, rows.length - drop)));
    setCursor(null);
    setFinished(false);
    setResult("*");
    setPremoves([]);
    setPremoveNote("");
    premoveSlot.current = "";
  }

  function begin(next: Record<Side, "you" | "stockfish"> = seats) {
    const only: Side = next.w === "you" && next.b !== "you" ? "w" : next.b === "you" && next.w !== "you" ? "b" : "w";
    setSeats(next);
    setPlayer(only);
    setOrientation(only === "w" ? "white" : "black");
    setStartFen(fenDraft.trim() && fenOk(fenDraft.trim()) ? fenDraft.trim() : START_FEN);
    setSans([]);
    setCursor(null);
    setResult("*");
    setFinished(false);
    setInfo(null);
    setEngineError("");
    setPremoves([]);
    setPremoveNote("");
    premoveSlot.current = "";
    setGameId(crypto.randomUUID());
    setClock(time && time.ms ? { w: time.ms, b: time.ms } : null);
    setActiveInc(time.inc);
    setPhase("playing");
  }

  function stopGame() {
    setPhase("idle");
    setSans([]);
    setCursor(null);
    setResult("*");
    setFinished(false);
    setInfo(null);
    setEngineError("");
    setPremoves([]);
    setPremoveNote("");
    premoveSlot.current = "";
    setGameId(crypto.randomUUID());
    setClock(time && time.ms ? { w: time.ms, b: time.ms } : null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "f") setOrientation(orientation === "white" ? "black" : "white");
      if (event.key === "u") undo();
      if (event.key === "ArrowLeft") setCursor((value) => Math.max(0, (value ?? sans.length) - 1));
      if (event.key === "ArrowRight") {
        setCursor((value) => {
          const next = (value ?? sans.length) + 1;
          return next >= sans.length ? null : next;
        });
      }
      if (event.key === "Escape") setCursor(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sans, turn, seats, orientation]);

  const arrow = info?.pvUci[0] ? [{ from: info.pvUci[0].slice(0, 2), to: info.pvUci[0].slice(2, 4) }] : [];
  const label = phase === "idle" ? "Press Start" : phase === "paused" ? "Paused" : thinking ? "Stockfish is thinking" : status.label;

  function panelPref(id: PlayPanelId): PanelPref {
    return settings.playPanels?.[id] ?? DEFAULT_PREF;
  }
  function patchPanel(id: PlayPanelId, patch: Partial<PanelPref>) {
    const all: Record<PlayPanelId, PanelPref> = {
      new: panelPref("new"),
      presets: panelPref("presets"),
      moves: panelPref("moves"),
      engine: panelPref("engine"),
    };
    all[id] = { ...all[id], ...patch };
    patchSettings({ playPanels: all });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col items-center gap-3">
        <div className="flex w-full max-w-xl items-center justify-between gap-3 text-sm">
          <span className="tabular-nums text-mist">{clock ? clockText(orientation === "white" ? clock.b : clock.w) : "No clock"}</span>
          <span className="text-center text-ivory">{label}</span>
          <span className="tabular-nums text-ivory">{clock ? clockText(orientation === "white" ? clock.w : clock.b) : "No clock"}</span>
        </div>
        <div className="flex w-full max-w-xl flex-col gap-1">
          <MaterialRow side={topColor} taken={lost[bottomColor]} takenColor={bottomColor} lead={materialLead(viewed.chess, topColor)} pieceSet={settings.pieceSet ?? "standard"} />
          <div className="flex w-full items-stretch gap-2">
            {analysis && <EvalBar info={info} stm={viewed.chess.turn()} flipped={orientation === "black"} />}
            <div className="min-w-0 flex-1">
              <Board
                fen={viewed.chess.fen()}
                orientation={orientation}
                interactive={phase === "playing" && !browsing && !over && humans.length > 0}
                humanColors={humans}
                onPremove={queuePremove}
                coordinates={settings.coordinates}
                theme={settings.boardTheme}
                pieceSet={settings.pieceSet ?? "standard"}
                lastMove={last ? { from: last.from, to: last.to } : null}
                premoves={premoves}
                arrows={analysis || thinking ? arrow : []}
                onMove={pushMove}
              />
            </div>
          </div>
          <MaterialRow side={bottomColor} taken={lost[topColor]} takenColor={topColor} lead={materialLead(viewed.chess, bottomColor)} pieceSet={settings.pieceSet ?? "standard"} />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="quiet" onClick={() => setOrientation(orientation === "white" ? "black" : "white")}>Flip</Button>
          <Button variant="quiet" onClick={undo}>Undo</Button>
          <Button variant="quiet" disabled={phase === "idle"} onClick={() => setPhase((current) => (current === "playing" ? "paused" : "playing"))}>
            {phase === "paused" ? "Resume" : "Pause"}
          </Button>
          <Button variant="quiet" onClick={stopGame}>Stop</Button>
          <Button variant="quiet" onClick={() => setAnalysis((on) => !on)}>{analysis ? "Hide analysis" : "Analyze"}</Button>
          <Button variant="quiet" onClick={stopGame}>New game</Button>
        </div>
        {premoves.length > 0 ? (
          <div className="flex w-full max-w-xl flex-wrap items-center gap-1.5 text-xs">
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
        ) : (
          <p className="text-xs text-mist">Flip, undo, and the arrow keys also work from the keyboard.</p>
        )}
        {premoveNote && <p className="text-xs text-danger">{premoveNote}</p>}
        {engineError && <p className="text-sm text-danger">{engineError}</p>}
      </div>
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-mist">Panels:</span>
          {PANELS.map((p) => {
            const pref = panelPref(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={pref.visible}
                onClick={() => patchPanel(p.id, { visible: !pref.visible })}
                className={cn(
                  "rounded-full border px-2.5 py-1 transition",
                  pref.visible ? "border-brass text-brass" : "border-line text-mist hover:text-ivory",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {panelPref("presets").visible && (
          <CollapsiblePanel
            title="Presets"
            collapsed={panelPref("presets").collapsed}
            onToggle={() => patchPanel("presets", { collapsed: !panelPref("presets").collapsed })}
          >
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => begin({ w: "you", b: "stockfish" })}>Play White</Button>
              <Button variant="quiet" onClick={() => begin({ w: "stockfish", b: "you" })}>Play Black</Button>
              <Button variant="quiet" onClick={() => begin({ w: "you", b: "you" })}>Two humans</Button>
              <Button variant="quiet" onClick={() => begin({ w: "stockfish", b: "stockfish" })}>Computer v Computer</Button>
            </div>
          </CollapsiblePanel>
        )}
        {panelPref("new").visible && (
          <CollapsiblePanel
            title="New game"
            collapsed={panelPref("new").collapsed}
            onToggle={() => patchPanel("new", { collapsed: !panelPref("new").collapsed })}
          >
            <div className="grid gap-3">
              <Field label="Time control">
                <div className="flex flex-wrap gap-2">
                  {TIMES.map((row) => (
                    <Button key={row.id} variant={timeId === row.id ? "primary" : "quiet"} onClick={() => setTimeId(row.id)}>
                      {row.label}
                    </Button>
                  ))}
                  <Button variant={timeId === "custom" ? "primary" : "quiet"} onClick={() => setTimeId("custom")}>
                    Custom
                  </Button>
                </div>
              </Field>
              {timeId === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Minutes">
                    <TextInput
                      type="number"
                      min={1}
                      max={180}
                      inputMode="numeric"
                      value={customMinutes}
                      onChange={(event) => setCustomMinutes(event.target.value)}
                    />
                  </Field>
                  <Field label="Increment, seconds">
                    <TextInput
                      type="number"
                      min={0}
                      max={180}
                      inputMode="numeric"
                      value={customSeconds}
                      onChange={(event) => setCustomSeconds(event.target.value)}
                    />
                  </Field>
                </div>
              )}
              <Field label="Starting FEN, optional">
                <TextInput value={fenDraft} placeholder="Standard position if empty" onChange={(event) => setFenDraft(event.target.value)} />
              </Field>
              <div className="grid gap-2">
                {(["w", "b"] as Side[]).map((side) => (
                  <div key={side} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{side === "w" ? "White" : "Black"}</span>
                    <div className="flex gap-2">
                      <Button variant={seats[side] === "you" ? "primary" : "quiet"} onClick={() => setSeats({ ...seats, [side]: "you" })}>Human</Button>
                      <Button variant={seats[side] === "stockfish" ? "primary" : "quiet"} onClick={() => setSeats({ ...seats, [side]: "stockfish" })}>Computer</Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="quiet" onClick={() => begin()}>Start</Button>
            </div>
          </CollapsiblePanel>
        )}
        {panelPref("moves").visible && (
          <CollapsiblePanel
            title="Moves"
            collapsed={panelPref("moves").collapsed}
            onToggle={() => patchPanel("moves", { collapsed: !panelPref("moves").collapsed })}
            bodyClassName="h-52 overflow-y-auto"
          >
            <ol className="space-y-1 text-sm">
            {sans.length === 0 && <li className="text-mist">No moves yet.</li>}
            {Array.from({ length: Math.ceil(sans.length / 2) }, (_, index) => (
              <li key={index} className="grid grid-cols-[2rem_1fr_1fr] gap-2">
                <span className="text-mist tabular-nums">{index + 1}.</span>
                {[0, 1].map((offset) => {
                  const san = sans[index * 2 + offset];
                  if (!san) return <span key={offset} />;
                  return (
                    <button
                      key={offset}
                      type="button"
                      className="rounded-md px-2 py-1 text-left hover:bg-surface-2"
                      onClick={() => {
                        const next = index * 2 + offset + 1;
                        setCursor(next >= sans.length ? null : next);
                      }}
                    >
                      {san}
                    </button>
                  );
                })}
              </li>
            ))}
            </ol>
          </CollapsiblePanel>
        )}
        {panelPref("engine").visible && (
          <CollapsiblePanel
            title="Engine"
            collapsed={panelPref("engine").collapsed}
            onToggle={() => patchPanel("engine", { collapsed: !panelPref("engine").collapsed })}
          >
            <EnginePanelBody info={info} enabled={analysis} />
          </CollapsiblePanel>
        )}
      </div>
    </div>
  );
}
