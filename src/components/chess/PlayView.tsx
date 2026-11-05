import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getEngine } from "@/lib/chess/engine";
import { applyUciMove, fenOk, replay, START_FEN, statusOf } from "@/lib/chess/rules";
import { playTone, setSoundEnabled } from "@/lib/chess/sound";
import { useOe } from "@/lib/chess/store";
import type { EngineInfo, PanelPref, PlayPanelId, Side } from "@/lib/chess/types";
import { Board } from "./Board";
import { Button, cn, Field, Panel, TextInput } from "./ui";

const TIMES = [
  { id: "unlimited", label: "Unlimited", ms: 0, inc: 0 },
  { id: "3+2", label: "3+2", ms: 3 * 60_000, inc: 2_000 },
  { id: "5+0", label: "5+0", ms: 5 * 60_000, inc: 0 },
  { id: "10+0", label: "10+0", ms: 10 * 60_000, inc: 0 },
  { id: "15+10", label: "15+10", ms: 15 * 60_000, inc: 10_000 },
];

function clockText(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const PANELS: { id: PlayPanelId; label: string }[] = [
  { id: "presets", label: "Presets" },
  { id: "new", label: "New game" },
  { id: "moves", label: "Moves" },
  { id: "engine", label: "Engine" },
];

const DEFAULT_PREF: PanelPref = { visible: true, collapsed: false };

function EvalBar({ info, stm, flipped }: { info: EngineInfo | null; stm: Side; flipped: boolean }) {
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

function CollapsiblePanel({
  title,
  collapsed,
  onToggle,
  bodyClassName,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Panel className={cn("min-w-0", collapsed ? "py-2" : "p-3")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={collapsed ? "text-sm font-medium text-mist" : "text-lg"}>{title}</h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          className="rounded-md px-2 py-1 text-xs text-mist hover:bg-surface-2 hover:text-ivory"
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>
      {!collapsed && <div className={cn("mt-2 min-w-0", bodyClassName)}>{children}</div>}
    </Panel>
  );
}

export function PlayView() {
  const settings = useOe((s) => s.settings);
  const patchSettings = useOe((s) => s.patchSettings);
  const profile = useOe((s) => s.profile);
  const launch = useOe((s) => s.launch);
  const setLaunch = useOe((s) => s.setLaunch);
  const saveGame = useOe((s) => s.saveGame);
  const [startFen, setStartFen] = useState(START_FEN);
  const [sans, setSans] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [player, setPlayer] = useState<Side>("w");
  const [seats, setSeats] = useState<Record<Side, "you" | "stockfish">>({ w: "you", b: "stockfish" });
  const [premoves, setPremoves] = useState<{ from: string; to: string; promotion?: string }[]>([]);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [timeId, setTimeId] = useState("unlimited");
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

  const time = TIMES.find((row) => row.id === timeId) ?? TIMES[0];
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
    setOrientation(launch.player === "w" ? "white" : "black");
    setCursor(null);
    setResult("*");
    setFinished(false);
    setClock(null);
    setTimeId("unlimited");
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

  useEffect(() => {
    if (seats.b === "you" && seats.w !== "you") setOrientation("black");
    else if (seats.w === "you" && seats.b !== "you") setOrientation("white");
  }, [seats]);

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
        setSans((current) => applyUciMove(startFen, current, best) ?? current);
        setCursor(null);
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
  }, [engineTurn, analysis, startFen, uciKey, settings.playThinkMs, settings.playStrength, settings.analysisDepth, viewed.chess, full.uci]);

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
        timeControl: time?.id ?? "unlimited",
        finished,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [sans, finished, result, gameId, startFen, seats, profile.name, time?.id, saveGame]);

  function playSan(from: string, to: string, promotion?: string) {
    let moved;
    try {
      moved = full.chess.move({ from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined });
    } catch {
      return false;
    }
    if (clock && time && time.inc) {
      const side = moved.color;
      setClock((current) => (current ? { ...current, [side]: current[side] + time.inc } : current));
    }
    setSans((rows) => [...rows, moved.san]);
    setCursor(null);
    playTone(moved.captured ? "capture" : "move");
    return true;
  }

  function queuePremove(from: string, to: string, promotion?: string) {
    setPremoves((queue) => {
      const next = { from, to, promotion };
      if (queue.length >= 2) return [queue[0], next];
      return [...queue, next];
    });
  }

  function pushMove(from: string, to: string, promotion?: string) {
    if (phase !== "playing" || browsing || over) return;
    const piece = full.chess.get(from as "a1");
    if (!piece || seats[piece.color] !== "you") return;
    if (thinking || piece.color !== turn) {
      queuePremove(from, to, promotion);
      return;
    }
    playSan(from, to, promotion);
  }

  useEffect(() => {
    if (browsing || over || thinking || seats[turn] !== "you" || premoves.length === 0) return;
    const [head, ...rest] = premoves;
    setPremoves(rest);
    // An illegal head just fails and is dropped with it; the rest wait for the next turn.
    playSan(head.from, head.to, head.promotion);
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
    setGameId(crypto.randomUUID());
    setClock(time && time.ms ? { w: time.ms, b: time.ms } : null);
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
    setGameId(crypto.randomUUID());
    setClock(time && time.ms ? { w: time.ms, b: time.ms } : null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "f") setOrientation((side) => (side === "white" ? "black" : "white"));
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
  }, [sans, turn, seats]);

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
        <div className="flex w-full max-w-xl items-stretch gap-2">
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
              premoveSquares={premoves.flatMap((p) => [p.from, p.to])}
              arrows={analysis || thinking ? arrow : []}
              onMove={pushMove}
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="quiet" onClick={() => setOrientation((side) => (side === "white" ? "black" : "white"))}>Flip</Button>
          <Button variant="quiet" onClick={undo}>Undo</Button>
          <Button variant="quiet" disabled={phase === "idle"} onClick={() => setPhase((current) => (current === "playing" ? "paused" : "playing"))}>
            {phase === "paused" ? "Resume" : "Pause"}
          </Button>
          <Button variant="quiet" onClick={stopGame}>Stop</Button>
          <Button variant="quiet" onClick={() => setAnalysis((on) => !on)}>{analysis ? "Hide analysis" : "Analyze"}</Button>
          <Button variant="quiet" onClick={stopGame}>New game</Button>
        </div>
        <p className="text-xs text-mist">{premoves.length > 0 ? `${premoves.length} premove${premoves.length > 1 ? "s" : ""} set. They play if still legal.` : "Flip, undo, and the arrow keys also work from the keyboard."}</p>
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
                </div>
              </Field>
              <Field label="Starting FEN, optional">
                <TextInput value={fenDraft} placeholder="Standard position if empty" onChange={(event) => setFenDraft(event.target.value)} />
              </Field>
              <div className="grid gap-2">
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
            {info ? (
              <>
                <p className="text-2xl text-brass tabular-nums">{info.score}</p>
                <p className="mt-1 truncate text-sm text-mist">Depth {info.depth} · {info.nodes.toLocaleString()} nodes</p>
                <p className="mt-1 truncate text-sm">{info.pv}</p>
              </>
            ) : (
              <p className="text-sm text-mist">{analysis ? "Waiting for Stockfish." : "Analysis is off."}</p>
            )}
          </CollapsiblePanel>
        )}
      </div>
    </div>
  );
}
