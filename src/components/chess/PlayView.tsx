import {
  BarChart3,
  Flag,
  FlipVertical2,
  Handshake,
  PanelRight,
  Pause,
  Play,
  Square,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from "react";
import { getEngine } from "@/lib/chess/engine";
import {
  dequeuePremove,
  dropAnsweredPremove,
  enqueuePremove,
  premoveLabel,
  type QueuedMove,
} from "@/lib/chess/premove";
import { infoCp } from "@/lib/chess/review-math";
import {
  applyUciMove,
  advantageSeries,
  capturedPieces,
  fenOk,
  halfmoveClock,
  materialLead,
  replay,
  repetitionCount,
  START_FEN,
  statusOf,
  timeoutResult,
} from "@/lib/chess/rules";
import { playTone, setSoundEnabled } from "@/lib/chess/sound";
import { useOe } from "@/lib/chess/store";
import type { EngineInfo, PieceSet, Prefs, SavedGame, Side } from "@/lib/chess/types";
import { Board } from "./Board";
import { EnginePanelBody, MovesGraph } from "./EnginePanel";
import { EvalBar } from "./EvalBar";
import { PieceGlyph } from "./pieces";
import { ReviewView } from "./ReviewView";
import { seatRating, SeatBar, type SeatChipProps } from "./SeatRail";
import { Button, cn, Field, TextInput } from "./ui";

const TIMES = [
  { id: "unlimited", label: "Unlimited", ms: 0, inc: 0 },
  { id: "1+0", label: "1", ms: 60_000, inc: 0 },
  { id: "2+1", label: "2+1", ms: 2 * 60_000, inc: 1_000 },
  { id: "3+2", label: "3+2", ms: 3 * 60_000, inc: 2_000 },
  { id: "5+0", label: "5+0", ms: 5 * 60_000, inc: 0 },
  { id: "10+0", label: "10+0", ms: 10 * 60_000, inc: 0 },
  { id: "15+10", label: "15+10", ms: 15 * 60_000, inc: 10_000 },
];

const PIECE_NAMES: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
};

/** The engine's number in pawns from White's view; a forced mate is drawn as a decisive edge. */
function evalForWhite(info: EngineInfo, stm: Side): number | null {
  if (info.mate != null) return (stm === "w" ? 1 : -1) * (info.mate > 0 ? 9 : -9);
  if (info.cp != null) return ((stm === "w" ? 1 : -1) * info.cp) / 100;
  return null;
}

/** The pieces one player has taken, plus how much they are up — the way a board tray reads. */
function MaterialRow({
  side,
  taken,
  takenColor,
  lead,
  pieceSet,
}: {
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
        <PieceGlyph
          key={`${type}-${index}`}
          type={type}
          color={takenColor}
          set={pieceSet}
          className="h-5 w-5 opacity-80"
        />
      ))}
      {lead > 0 && <span className="ml-1 font-medium tabular-nums text-brass">+{lead}</span>}
    </div>
  );
}

/** A control that keeps its label on wide screens and shrinks to its icon on a phone. */
function ActionButton({
  icon: Icon,
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <Button
      variant="quiet"
      aria-label={label}
      title={label}
      className={cn("h-10 w-10 shrink-0 px-0 sm:h-11 sm:w-auto sm:px-4", className)}
      {...props}
    >
      <Icon className="h-4 w-4 shrink-0 sm:hidden" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

const DEFAULT_SEATS: Record<Side, "you" | "stockfish"> = { w: "you", b: "stockfish" };
const NO_PREFS: Prefs = {};

const PANE_TABS = [
  { id: "presets", label: "Presets" },
  { id: "new", label: "New game" },
  { id: "moves", label: "Moves" },
  { id: "analysis", label: "Analysis" },
] as const;

type PaneTab = (typeof PANE_TABS)[number]["id"];

export function PlayView() {
  const settings = useOe((s) => s.settings);
  const patchPrefs = useOe((s) => s.patchPrefs);
  const profile = useOe((s) => s.profile);
  const launch = useOe((s) => s.launch);
  const setLaunch = useOe((s) => s.setLaunch);
  const saveGame = useOe((s) => s.saveGame);
  const openReview = useOe((s) => s.openReview);
  const closeReview = useOe((s) => s.closeReview);
  const reviewGame = useOe((s) =>
    s.reviewGameId ? s.games.find((row) => row.id === s.reviewGameId) : undefined,
  );
  const [startFen, setStartFen] = useState(START_FEN);
  const [sans, setSans] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [premoves, setPremoves] = useState<QueuedMove[]>([]);
  const [premoveNote, setPremoveNote] = useState("");
  const [activeInc, setActiveInc] = useState(0);
  const [clock, setClock] = useState<{ w: number; b: number } | null>(null);
  const [gameId, setGameId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState("*");
  const [finished, setFinished] = useState(false);
  const [analysis, setAnalysis] = useState(false);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  // Engine numbers already seen, keyed by ply, so the graph keeps its history while analysis moves on.
  const [evalLog, setEvalLog] = useState<Record<number, number>>({});
  const [thinking, setThinking] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [fenDraft, setFenDraft] = useState("");
  const [phase, setPhase] = useState<"idle" | "playing" | "paused">("idle");
  // How a game ended when it was not the board's own doing (resign, agreed draw, flag fall).
  const [endNote, setEndNote] = useState("");
  const [endDialog, setEndDialog] = useState<"resign" | "draw" | null>(null);
  const [drawPending, setDrawPending] = useState(false);
  const [offerNote, setOfferNote] = useState("");
  // On a phone the option pane lives in a popup that only the Panels button opens, so the board keeps the page.
  const [panelsOpen, setPanelsOpen] = useState(false);
  // The game-over notice is a popup over the board, never a strip above it.
  const [endNotice, setEndNotice] = useState(false);
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  // Bumped whenever the game resets or ends, so a slow draw offer cannot land on a different game.
  const drawSeq = useRef(0);

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
  const paneTab: PaneTab = PANE_TABS.some((t) => t.id === prefs.playPaneTab)
    ? (prefs.playPaneTab as PaneTab)
    : "presets";
  const setPaneTab = (next: PaneTab) => patchPrefs({ playPaneTab: next });

  const customControl = useMemo(() => {
    const minutes = Math.min(180, Math.max(1, Number.parseInt(customMinutes, 10) || 0));
    const seconds = Math.min(180, Math.max(0, Number.parseInt(customSeconds, 10) || 0));
    return {
      id: "custom",
      label: `${minutes}+${seconds}`,
      ms: minutes * 60_000,
      inc: seconds * 1000,
    };
  }, [customMinutes, customSeconds]);
  const time =
    timeId === "custom" ? customControl : (TIMES.find((row) => row.id === timeId) ?? TIMES[0]);
  const timeControlLabel = time.id === "custom" ? time.label : time.id;
  const viewedSans = cursor == null ? sans : sans.slice(0, cursor);
  const viewed = useMemo(() => replay(startFen, viewedSans), [startFen, viewedSans]);
  const full = useMemo(() => replay(startFen, sans), [startFen, sans]);
  const browsing = cursor != null && cursor < sans.length;
  const status = statusOf(viewed.chess);
  const repeat = useMemo(() => repetitionCount(startFen, viewedSans), [startFen, viewedSans]);
  const over = finished || status.over;
  const turn = full.chess.turn();
  const engineTurn =
    phase === "playing" && !browsing && !over && !reviewGame && seats[turn] === "stockfish";
  const humans = (["w", "b"] as Side[]).filter((side) => seats[side] === "you");
  // The one engine seat, when the game is human v engine; null for two humans or two engines.
  const engineSide: Side | null =
    humans.length === 1 ? (seats.w === "stockfish" ? "w" : "b") : null;
  const last = viewed.chess.history({ verbose: true }).at(-1);
  const lost = useMemo(() => capturedPieces(viewed.chess), [viewed.chess]);
  const topColor: Side = orientation === "white" ? "b" : "w";
  const bottomColor: Side = orientation === "white" ? "w" : "b";
  const uciKey = full.uci.join(" ");
  // Stockfish's number where it actually looked at a position; the material count everywhere else.
  const graph = useMemo(
    () => advantageSeries(startFen, sans).map((value, ply) => evalLog[ply] ?? value),
    [startFen, sans, evalLog],
  );
  const graphPly = cursor ?? sans.length;

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

  // The moves marquee lives above the board; keep the newest ply in view as the game runs on.
  useEffect(() => {
    const el = marqueeRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [sans.length]);

  useEffect(() => {
    if (!launch) return;
    setStartFen(launch.startFen || START_FEN);
    setSans(launch.sans);
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
    setEndNote("");
    setEndDialog(null);
    setOfferNote("");
    drawSeq.current += 1;
    setClock(null);
    setTimeId("unlimited");
    setActiveInc(0);
    setGameId(crypto.randomUUID());
    setPhase("playing");
    setInfo(null);
    setEvalLog({});
    setLaunch(null);
    focusBoardOnPhone();
    // Only a new launch should re-run this; the focus helper is a render-local function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch, setLaunch]);

  const clockRunning = phase === "playing" && clock !== null && !over && !browsing && !reviewGame;
  // Ticks measure real elapsed time, so engine-heavy positions (Computer v Computer)
  // cannot silently pause the clock. The stamp survives effect restarts (a fresh engine
  // ply re-keys this effect), so time between the last tick and the restart is still billed.
  const clockStamp = useRef(0);
  useEffect(() => {
    if (!clockRunning) {
      clockStamp.current = 0;
      return;
    }
    if (!clockStamp.current) clockStamp.current = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const since = clockStamp.current ? now - clockStamp.current : 200;
      clockStamp.current = now;
      setClock((current) => {
        if (!current) return current;
        const side = full.chess.turn();
        const next = { ...current, [side]: current[side] - since };
        if (next[side] <= 0) {
          next[side] = 0;
          const timedOut = timeoutResult(full.chess, side);
          setFinished(true);
          setResult(timedOut.result);
          setEndNote(timedOut.label);
        }
        return next;
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [clockRunning, full]);

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
    const wantAnalysis = analysis && !engineTurn && !reviewGame;
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
          if (cancel) return;
          setInfo(next);
          const board = wantMove ? full.chess : viewed.chess;
          const score = evalForWhite(next, board.turn());
          if (score == null) return;
          const ply = board.history().length;
          setEvalLog((log) => (log[ply] === score ? log : { ...log, [ply]: score }));
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
  }, [
    engineTurn,
    analysis,
    reviewGame,
    startFen,
    uciKey,
    sans,
    settings.playThinkMs,
    settings.playStrength,
    settings.analysisDepth,
    viewed.chess,
    full.uci,
  ]);

  useEffect(() => {
    if (status.over && result === "*") {
      setResult(status.result);
      setFinished(true);
      playTone(status.result === "1/2-1/2" ? "done" : "check");
    }
  }, [status.over, status.result, result]);

  useEffect(() => {
    if (!over) setEndNotice(false);
    else if (endNote || sans.length > 0) setEndNotice(true);
  }, [over, endNote, sans.length]);

  function gameSnapshot(): SavedGame {
    const done = finished || status.over;
    return {
      id: gameId,
      white: seats.w === "you" ? profile.name : "Stockfish",
      black: seats.b === "you" ? profile.name : "Stockfish",
      result: done ? (result === "*" ? status.result : result) : "*",
      startFen,
      sans,
      event: "Casual game",
      playerColor:
        seats.w === "you" && seats.b === "you" ? "either" : seats.b === "you" ? "b" : "w",
      timeControl: timeControlLabel,
      engineElo:
        seats.w === "stockfish" || seats.b === "stockfish" ? settings.playStrength : undefined,
      finished: done,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  useEffect(() => {
    // A resignation or draw before the first move leaves nothing worth keeping; the banner still says so.
    if (sans.length === 0) return;
    const handle = window.setTimeout(() => saveGame(gameSnapshot()), 400);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sans,
    finished,
    result,
    gameId,
    startFen,
    seats,
    profile.name,
    timeControlLabel,
    saveGame,
    settings.playStrength,
    status.over,
    status.result,
  ]);

  // Increment comes from the control frozen at Start, so switching chips mid-game cannot change what a move adds.
  function awardIncrement(side: Side) {
    if (!clock || !activeInc) return;
    setClock((current) => (current ? { ...current, [side]: current[side] + activeInc } : current));
  }

  function playSan(from: string, to: string, promotion?: string) {
    let moved;
    try {
      moved = full.chess.move({
        from,
        to,
        promotion: promotion as "q" | "r" | "b" | "n" | undefined,
      });
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
    if (phase !== "playing" || browsing || over || drawPending) return;
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
    if (
      browsing ||
      over ||
      thinking ||
      drawPending ||
      seats[turn] !== "you" ||
      premoves.length === 0
    )
      return;
    // The head waits for its own side's turn, so a two-human queue is not judged against the other clock.
    if (premoves[0].color !== turn) return;
    if (!claimPremoveTurn()) return;
    const { move, cancelled, remaining } = dequeuePremove(full.chess.fen(), premoves);
    setPremoves(remaining);
    if (cancelled)
      setPremoveNote(`${premoveLabel(cancelled)} is no longer legal, so it was dropped.`);
    if (move) playSan(move.from, move.to, move.promotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premoves, turn, thinking, browsing, over, sans]);

  function undo() {
    const opponent = turn === "w" ? "b" : "w";
    const drop =
      sans.length >= 2 && seats[turn] === "you" && seats[opponent] === "stockfish" ? 2 : 1;
    const kept = Math.max(0, sans.length - drop);
    setSans((rows) => rows.slice(0, kept));
    // A replayed ply can be a different move, so numbers recorded past the cut are no longer about this game.
    setEvalLog((log) => {
      const trimmed: Record<number, number> = {};
      for (const [ply, value] of Object.entries(log))
        if (Number(ply) <= kept) trimmed[Number(ply)] = value;
      return trimmed;
    });
    setCursor(null);
    setFinished(false);
    setResult("*");
    setEndNote("");
    setEndDialog(null);
    setOfferNote("");
    drawSeq.current += 1;
    setPremoves([]);
    setPremoveNote("");
    premoveSlot.current = "";
  }

  function begin(next: Record<Side, "you" | "stockfish"> = seats) {
    const only: Side =
      next.w === "you" && next.b !== "you" ? "w" : next.b === "you" && next.w !== "you" ? "b" : "w";
    setSeats(next);
    setOrientation(only === "w" ? "white" : "black");
    setStartFen(fenDraft.trim() && fenOk(fenDraft.trim()) ? fenDraft.trim() : START_FEN);
    setSans([]);
    setCursor(null);
    setResult("*");
    setFinished(false);
    setEndNote("");
    setEndDialog(null);
    setOfferNote("");
    drawSeq.current += 1;
    setInfo(null);
    setEvalLog({});
    setEngineError("");
    setPremoves([]);
    setPremoveNote("");
    premoveSlot.current = "";
    setGameId(crypto.randomUUID());
    setClock(time && time.ms ? { w: time.ms, b: time.ms } : null);
    setActiveInc(time.inc);
    setPhase("playing");
    focusBoardOnPhone();
  }

  function stopGame() {
    setPhase("idle");
    setSans([]);
    setCursor(null);
    setResult("*");
    setFinished(false);
    setEndNote("");
    setEndDialog(null);
    setOfferNote("");
    drawSeq.current += 1;
    setInfo(null);
    setEvalLog({});
    setEngineError("");
    setPremoves([]);
    setPremoveNote("");
    premoveSlot.current = "";
    setGameId(crypto.randomUUID());
    setClock(time && time.ms ? { w: time.ms, b: time.ms } : null);
  }

  /** Ends a game by agreement or forfeit; the board itself has no say in these. */
  function finishGame(nextResult: string, note: string) {
    drawSeq.current += 1;
    setResult(nextResult);
    setFinished(true);
    setEndNote(note);
    setEndDialog(null);
    setDrawPending(false);
    setOfferNote("");
    playTone(nextResult === "1/2-1/2" ? "done" : "check");
  }

  function resignSide(side: Side) {
    const winner = side === "w" ? "b" : "w";
    finishGame(
      winner === "w" ? "1-0" : "0-1",
      `${side === "w" ? "White" : "Black"} resigned — ${winner === "w" ? "White" : "Black"} wins.`,
    );
  }

  /** Two humans simply agree. Stockfish looks at the position and only accepts a lost or level one. */
  async function offerDraw() {
    if (!engineSide) {
      finishGame("1/2-1/2", "Draw agreed.");
      return;
    }
    setEndDialog(null);
    const id = ++drawSeq.current;
    setDrawPending(true);
    setOfferNote("Stockfish is considering the draw offer…");
    try {
      const infos: EngineInfo[] = [];
      await getEngine().go({
        fen: full.chess.fen(),
        depth: 12,
        movetime: 700,
        strength: "max",
        onInfo: (info) => infos.push(info),
      });
      if (id !== drawSeq.current) return;
      const info = infos.at(-1);
      const white = info ? infoCp(info, full.chess.turn()) : 0;
      // The engine's own view of the position: it accepts once it has no real winning chances.
      const advantage = engineSide === "w" ? white : -white;
      setDrawPending(false);
      if (advantage <= 60) finishGame("1/2-1/2", "Draw agreed — Stockfish accepted the offer.");
      else setOfferNote("Stockfish declined the draw offer.");
    } catch {
      if (id !== drawSeq.current) return;
      setDrawPending(false);
      setOfferNote("The draw offer went unanswered. Try again.");
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (reviewGame) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (endDialog) {
        if (event.key === "Escape") setEndDialog(null);
        return;
      }
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
  }, [sans, turn, seats, orientation, reviewGame, endDialog]);

  // Every hook has to run before a conditional return; the review now renders as a popup
  // over Play instead of replacing it, so there is nothing to return early for.
  const quietPlies = useMemo(() => halfmoveClock(viewed.chess), [viewed]);

  const arrow = info?.pvUci[0]
    ? [{ from: info.pvUci[0].slice(0, 2), to: info.pvUci[0].slice(2, 4) }]
    : [];
  const label =
    endNote || (phase === "paused" ? "Paused" : thinking ? "Stockfish is thinking" : status.label);
  // The draw itself is automatic on the third occurrence, so the warning has to come before it:
  // at two repeats the player can still steer out of it, and it is worth knowing that.
  const repeatWarn = !status.over && phase === "playing" && repeat >= 2 && humans.length > 0;
  // The draw is automatic at 100 quiet plies, so the last ten are worth counting down. The
  // repetition notice wins the line when both are live, because it can arrive first.
  const clockWarn =
    !status.over && !repeatWarn && phase === "playing" && humans.length > 0 && quietPlies >= 80;

  /** On a phone a running game gets the whole page: starting one shuts the panels popup away. */
  function focusBoardOnPhone() {
    if (!window.matchMedia("(max-width: 1279px)").matches) return;
    setPanelsOpen(false);
  }

  const pane = (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
      <nav
        aria-label="Play options"
        className="flex shrink-0 gap-1 self-start rounded-lg border border-line bg-surface-2 p-1"
      >
        {PANE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={paneTab === tab.id}
            onClick={() => setPaneTab(tab.id)}
            className={cn(
              "h-9 shrink-0 rounded-md px-3 text-sm transition",
              paneTab === tab.id
                ? "bg-brass text-on-accent"
                : "text-mist hover:bg-surface hover:text-ivory",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">
        {paneTab === "presets" && (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => begin({ w: "you", b: "stockfish" })}>Play White</Button>
            <Button variant="quiet" onClick={() => begin({ w: "stockfish", b: "you" })}>
              Play Black
            </Button>
            <Button variant="quiet" onClick={() => begin({ w: "you", b: "you" })}>
              Two humans
            </Button>
            <Button variant="quiet" onClick={() => begin({ w: "stockfish", b: "stockfish" })}>
              Computer v Computer
            </Button>
          </div>
        )}
        {paneTab === "new" && (
          <div className="grid gap-3">
            <Field label="Time control">
              <div className="flex flex-wrap gap-2">
                {TIMES.map((row) => (
                  <Button
                    key={row.id}
                    variant={timeId === row.id ? "primary" : "quiet"}
                    onClick={() => setTimeId(row.id)}
                  >
                    {row.label}
                  </Button>
                ))}
                <Button
                  variant={timeId === "custom" ? "primary" : "quiet"}
                  onClick={() => setTimeId("custom")}
                >
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
              <TextInput
                value={fenDraft}
                placeholder="Standard position if empty"
                onChange={(event) => setFenDraft(event.target.value)}
              />
            </Field>
            <div className="grid gap-2">
              {(["w", "b"] as Side[]).map((side) => (
                <div key={side} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{side === "w" ? "White" : "Black"}</span>
                  <div className="flex gap-2">
                    <Button
                      variant={seats[side] === "you" ? "primary" : "quiet"}
                      onClick={() => setSeats({ ...seats, [side]: "you" })}
                    >
                      Human
                    </Button>
                    <Button
                      variant={seats[side] === "stockfish" ? "primary" : "quiet"}
                      onClick={() => setSeats({ ...seats, [side]: "stockfish" })}
                    >
                      Computer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="quiet" onClick={() => begin()}>
              Start
            </Button>
          </div>
        )}
        {paneTab === "moves" && (
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
        )}
        {paneTab === "analysis" && (
          <div className="grid gap-3">
            <EnginePanelBody info={info} enabled={analysis} />
            <MovesGraph
              values={graph}
              active={graphPly}
              onPly={(ply) => setCursor(ply >= sans.length ? null : ply)}
            />
          </div>
        )}
      </div>
    </div>
  );

  const seatProps = (side: Side): SeatChipProps => ({
    seat: seats[side],
    name: seats[side] === "you" ? profile.name : "Stockfish",
    avatar: seats[side] === "you" ? profile.avatar : undefined,
    clockMs: clock ? clock[side] : null,
    rating: seatRating(seats[side], settings.playStrength),
  });
  const topSeat = seatProps(topColor);
  const bottomSeat = seatProps(bottomColor);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2 px-0 py-2 sm:px-4 xl:flex-row xl:gap-4 xl:px-6">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-2">
        {sans.length > 0 && (
          <div
            ref={marqueeRef}
            role="region"
            aria-label="Moves"
            className="scrollbar-hidden flex w-full max-w-[40rem] shrink-0 gap-1.5 overflow-x-auto rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
          >
            {Array.from({ length: Math.ceil(sans.length / 2) }, (_, index) => (
              <span key={index} className="flex shrink-0 items-center gap-1">
                <span className="tabular-nums text-mist">{index + 1}.</span>
                {[0, 1].map((offset) => {
                  const san = sans[index * 2 + offset];
                  if (!san) return null;
                  return (
                    <button
                      key={offset}
                      type="button"
                      className="rounded px-1.5 py-0.5 text-ivory hover:bg-surface-2"
                      onClick={() => {
                        const next = index * 2 + offset + 1;
                        setCursor(next >= sans.length ? null : next);
                      }}
                    >
                      {san}
                    </button>
                  );
                })}
              </span>
            ))}
          </div>
        )}
        {(endNote || phase !== "idle") && (
          <p className="w-full max-w-[40rem] shrink-0 px-2 text-xs text-ivory sm:px-0">
            {label}
            {repeatWarn && (
              <span
                className="text-brass"
                title="The same position has occurred this many times. A third occurrence is an automatic draw."
              >
                {" "}
                Position {repeat}× — one more repeat draws by repetition.
              </span>
            )}
            {clockWarn && (
              <span
                className="text-brass"
                title="No pawn has moved and nothing has been captured for this many plies. At 100 the game is a draw."
              >
                {" "}
                Fifty-move clock {quietPlies}/100 — {100 - quietPlies}{" "}
                {100 - quietPlies === 1 ? "ply" : "plies"} to a draw.
              </span>
            )}
          </p>
        )}
        {/* Each seat sits with its own side of the board: the top player above, the bottom player below. */}
        <div className="flex w-full max-w-[40rem] shrink-0 flex-col gap-1 px-2 sm:px-0">
          <SeatBar {...topSeat} />
          <MaterialRow
            side={topColor}
            taken={lost[bottomColor]}
            takenColor={bottomColor}
            lead={materialLead(viewed.chess, topColor)}
            pieceSet={settings.pieceSet ?? "standard"}
          />
        </div>
        {/* The board is square and fitted: 100cqh when the room is taller than wide, 100cqw otherwise, so it never scrolls the page. */}
        <div className="flex min-h-0 w-full flex-1 justify-center">
          <div className="flex min-h-0 w-full max-w-[40rem] items-stretch justify-center gap-1.5">
            {analysis && (
              <div className="flex">
                <EvalBar info={info} stm={viewed.chess.turn()} flipped={orientation === "black"} />
              </div>
            )}
            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center [container-type:size]">
              <div className="aspect-square w-[min(100cqw,100cqh)]">
                <Board
                  fen={viewed.chess.fen()}
                  orientation={orientation}
                  interactive={
                    phase === "playing" && !browsing && !over && !drawPending && humans.length > 0
                  }
                  humanColors={humans}
                  onPremove={queuePremove}
                  coordinates={settings.coordinates}
                  theme={settings.boardTheme}
                  pieceSet={settings.pieceSet ?? "standard"}
                  animate={settings.animations ?? true}
                  lastMove={last ? { from: last.from, to: last.to } : null}
                  premoves={premoves}
                  arrows={analysis || thinking ? arrow : []}
                  onMove={pushMove}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex w-full max-w-[40rem] shrink-0 flex-col gap-1 px-2 sm:px-0">
          <MaterialRow
            side={bottomColor}
            taken={lost[topColor]}
            takenColor={topColor}
            lead={materialLead(viewed.chess, bottomColor)}
            pieceSet={settings.pieceSet ?? "standard"}
          />
          <SeatBar {...bottomSeat} />
        </div>
        <div className="flex w-full shrink-0 flex-wrap justify-center gap-1 sm:gap-2">
          <ActionButton
            icon={FlipVertical2}
            label="Flip"
            onClick={() => setOrientation(orientation === "white" ? "black" : "white")}
          />
          <ActionButton icon={Undo2} label="Undo" onClick={undo} />
          <ActionButton
            icon={phase === "paused" ? Play : Pause}
            label={phase === "paused" ? "Resume" : "Pause"}
            disabled={phase === "idle"}
            onClick={() => setPhase((current) => (current === "playing" ? "paused" : "playing"))}
          />
          <ActionButton
            icon={Square}
            label="Stop"
            className="hidden sm:inline-flex"
            onClick={stopGame}
          />
          <ActionButton
            icon={Flag}
            label="Resign"
            disabled={phase === "idle" || over || humans.length === 0 || drawPending}
            onClick={() => setEndDialog("resign")}
          />
          <ActionButton
            icon={Handshake}
            label={engineSide ? "Offer draw" : "Draw"}
            title={
              engineSide
                ? "Stockfish accepts only if it has no real winning chances."
                : "Agree a draw with your opponent."
            }
            disabled={
              phase === "idle" ||
              over ||
              humans.length === 0 ||
              drawPending ||
              (engineSide != null && seats[turn] === "stockfish")
            }
            onClick={() => setEndDialog("draw")}
          />
          <ActionButton
            icon={BarChart3}
            label={analysis ? "Hide analysis" : "Analyze"}
            aria-pressed={analysis}
            onClick={() => setAnalysis((on) => !on)}
          />
          <ActionButton
            icon={PanelRight}
            label={panelsOpen ? "Hide panels" : "Panels"}
            className="xl:hidden"
            aria-pressed={panelsOpen}
            onClick={() => setPanelsOpen((open) => !open)}
          />
        </div>
        {premoves.length > 0 ? (
          <div className="flex w-full max-w-[40rem] shrink-0 flex-wrap items-center gap-1.5 px-2 text-xs sm:px-0">
            <span className="text-mist">Queued:</span>
            {premoves.map((move, index) => (
              <span
                key={`${move.from}${move.to}${index}`}
                className="flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pl-2 pr-1"
              >
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
            <button
              type="button"
              className="rounded-full px-2 py-1 text-mist hover:bg-surface-2 hover:text-ivory"
              onClick={() => {
                setPremoves([]);
                setPremoveNote("");
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <p className="hidden shrink-0 text-xs text-mist sm:block">
            Flip, undo, and the arrow keys also work from the keyboard.
          </p>
        )}
        {premoveNote && <p className="shrink-0 text-xs text-danger">{premoveNote}</p>}
        {offerNote && <p className="shrink-0 text-xs text-mist">{offerNote}</p>}
        {engineError && <p className="shrink-0 text-sm text-danger">{engineError}</p>}
      </div>
      <div className="hidden min-h-0 w-[22rem] shrink-0 rounded-xl border border-line bg-surface p-3 xl:flex">{pane}</div>
      {endDialog && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-scrim/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={endDialog === "resign" ? "Resign the game" : "Draw offer"}
        >
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 text-center">
            {endDialog === "resign" ? (
              <>
                <h2 className="text-xl">Resign this game?</h2>
                <p className="mt-2 text-sm text-mist">
                  {humans.length === 2
                    ? "The side that resigns loses. The result is saved to your library."
                    : "You lose to Stockfish. The result is saved to your library."}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {humans.length === 2 ? (
                    <>
                      <Button variant="danger" onClick={() => resignSide("w")}>
                        White resigns
                      </Button>
                      <Button variant="danger" onClick={() => resignSide("b")}>
                        Black resigns
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => resignSide(seats.w === "you" ? "w" : "b")}
                    >
                      Resign
                    </Button>
                  )}
                  <Button variant="quiet" onClick={() => setEndDialog(null)}>
                    Keep playing
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl">{engineSide ? "Offer a draw?" : "Agree a draw?"}</h2>
                <p className="mt-2 text-sm text-mist">
                  {engineSide
                    ? "Stockfish accepts only when it has no real winning chances; otherwise it plays on."
                    : "Both sides agree to split the point. The result is saved to your library."}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button onClick={() => void offerDraw()}>
                    {engineSide ? "Offer draw" : "Agree draw"}
                  </Button>
                  <Button variant="quiet" onClick={() => setEndDialog(null)}>
                    Keep playing
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {endNotice && !endDialog && !reviewGame && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-scrim/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Game over"
        >
          <div className="modal-card w-full max-w-md rounded-xl border border-line p-5 text-center">
            <h2 className="text-xl">{endNote || status.label}</h2>
            {sans.length > 0 && (
              <p className="mt-2 text-sm text-mist">
                Review it with Stockfish to see where the game turned.
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {sans.length > 0 && (
                <Button
                  onClick={() => {
                    saveGame(gameSnapshot());
                    setEndNotice(false);
                    openReview(gameId);
                  }}
                >
                  Review game
                </Button>
              )}
              <Button variant="quiet" onClick={() => setEndNotice(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      {panelsOpen && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-scrim/70 p-2 sm:p-4 xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Play panels"
        >
          <div className="modal-card flex h-[calc(100dvh-1rem)] w-full max-w-md flex-col gap-3 overflow-hidden rounded-xl border border-line p-3 sm:h-[calc(100dvh-2rem)] sm:p-4">
            <div className="flex shrink-0 justify-end">
              <button
                type="button"
                aria-label="Close panels"
                onClick={() => setPanelsOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-mist transition hover:text-ivory"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1">{pane}</div>
          </div>
        </div>
      )}
      {reviewGame && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-scrim/70 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Game review"
        >
          <div className="modal-card relative flex h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-line p-3 sm:h-[calc(100dvh-2rem)] sm:p-4">
            <button
              type="button"
              aria-label="Close review"
              onClick={closeReview}
              className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-mist transition hover:text-ivory"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-h-0 flex-1">
              <ReviewView game={reviewGame} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
