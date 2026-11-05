import { useEffect, useMemo, useRef, useState } from "react";
import { COURSES, DEFAULT_CAROUSEL, courseById, reviewProgress, variationsFor, type Course } from "@/lib/chess/courses";
import { getEngine } from "@/lib/chess/engine";
import { parsePgn, replay, splitPgnGames, START_FEN } from "@/lib/chess/rules";
import { gradeFromDrill, reviewId } from "@/lib/chess/srs";
import { allOpenings, useOe } from "@/lib/chess/store";
import type { OpeningLine, Side } from "@/lib/chess/types";
import { Board } from "./Board";
import { Button, Meter, Panel, Pill, TextInput } from "./ui";

export function OpeningsView() {
  const repertoire = useOe((s) => s.repertoire);
  const reviews = useOe((s) => s.reviews);
  const settings = useOe((s) => s.settings);
  const setCarousel = useOe((s) => s.setCarousel);
  const custom = useOe((s) => s.openings);
  const book = useMemo(() => allOpenings(custom), [custom]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [lineId, setLineId] = useState<string | null>(null);
  const [adding, setAdding] = useState<Side | null>(null);
  const [tab, setTab] = useState<"shelf" | "explorer">("shelf");
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("All");
  const [trainSide, setTrainSide] = useState<Side>("w");
  const [ghost, setGhost] = useState<Course | null>(null);
  const carouselRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function scrollCarousel(side: Side, dir: -1 | 1) {
    carouselRefs.current[side]?.scrollBy({ left: dir * 312, behavior: "smooth" });
  }

  const shelf = {
    w: repertoire.carousel?.w ?? DEFAULT_CAROUSEL.w,
    b: repertoire.carousel?.b ?? DEFAULT_CAROUSEL.b,
  };
  const course = courseId ? courseById(courseId) : undefined;
  const variations = course ? variationsFor(course) : [];
  const activeCourse = course ?? ghost ?? undefined;
  const line = lineId ? book.find((row) => row.id === lineId) ?? null : null;
  const families = ["All", ...Array.from(new Set(book.map((row) => row.family)))];

  function progressFor(target: Course) {
    const rows = variationsFor(target);
    if (!rows.length) return 0;
    const total = rows.reduce((sum, row) => {
      const review = reviews.find((item) => item.id === reviewId(row.id, target.side));
      return sum + reviewProgress(review);
    }, 0);
    return total / rows.length;
  }

  function openLine(row: OpeningLine, side: Side) {
    setGhost({
      id: `solo-${row.id}`,
      name: row.name,
      side,
      tier: "s",
      blurb: row.note,
      variationNames: [row.name],
    });
    setCourseId(null);
    setLineId(row.id);
  }

  if (line && activeCourse) {
    const rows = variationsFor(activeCourse);
    const idx = rows.findIndex((row) => row.id === line.id);
    const hasNext = idx >= 0 && idx < rows.length - 1;
    return (
      <VariationSession
        key={line.id}
        course={activeCourse}
        line={line}
        hasNext={hasNext}
        onNext={() => setLineId(hasNext ? rows[idx + 1].id : null)}
        onExit={() => { setLineId(null); setGhost(null); }}
      />
    );
  }

  if (course) {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col items-center gap-3">
          <Board
            fen={START_FEN}
            orientation={course.side === "w" ? "white" : "black"}
            coordinates={settings.coordinates}
            theme={settings.boardTheme}
            pieceSet={settings.pieceSet ?? "standard"}
            interactive={false}
          />
          <p className="text-sm text-mist">You'll play {course.side === "w" ? "White" : "Black"} here. Pick a variation and we'll walk through it together.</p>
        </div>
        <div className="grid content-start gap-3">
          <Panel>
            <Button variant="ghost" onClick={() => setCourseId(null)}>Back to shelf</Button>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h2 className="text-2xl">{course.name}</h2>
              <Pill tone="brass">{course.tier === "legendary" ? "Legendary" : "S-tier"}</Pill>
            </div>
            <p className="mt-2 text-sm text-mist">{course.blurb}</p>
            <div className="mt-3">
              <Meter value={progressFor(course)} label="Opening progress" />
            </div>
          </Panel>
          {variations.map((variation) => {
            const review = reviews.find((item) => item.id === reviewId(variation.id, course.side));
            return (
              <button
                key={variation.id}
                type="button"
                className="rounded-xl border border-line bg-surface p-3 text-left hover:border-brass"
                onClick={() => setLineId(variation.id)}
              >
                <h3 className="text-lg">{variation.name}</h3>
                <p className="mt-1 text-sm text-mist">{variation.moves.length} plies · {variation.eco}</p>
                <div className="mt-2">
                  <Meter value={reviewProgress(review)} label={review?.status ?? "new"} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const visible = book.filter((row) => {
    if (family !== "All" && row.family !== family) return false;
    const hay = `${row.name} ${row.eco} ${row.family}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  return (
    <div className="grid gap-6">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Openings</h2>
            <p className="mt-1 text-sm text-mist">Your shelf starts with three white and three black courses. The full book is one tap away in Explorer and Add.</p>
          </div>
          <div className="flex gap-2">
            <Button variant={tab === "shelf" ? "primary" : "quiet"} onClick={() => setTab("shelf")}>Shelf</Button>
            <Button variant={tab === "explorer" ? "primary" : "quiet"} onClick={() => setTab("explorer")}>Explorer</Button>
          </div>
        </div>
      </Panel>
      {tab === "explorer" ? (
        <Panel>
          <div className="grid gap-3 md:grid-cols-[1fr_12rem_10rem]">
            <TextInput value={query} placeholder="Search the book" onChange={(event) => setQuery(event.target.value)} />
            <select className="h-11 rounded-lg border border-line bg-canvas px-3 text-sm" value={family} onChange={(event) => setFamily(event.target.value)}>
              {families.map((item) => <option key={item}>{item}</option>)}
            </select>
            <div className="flex gap-2">
              <Button className="whitespace-nowrap" variant={trainSide === "w" ? "primary" : "quiet"} onClick={() => setTrainSide("w")}>As White</Button>
              <Button className="whitespace-nowrap" variant={trainSide === "b" ? "primary" : "quiet"} onClick={() => setTrainSide("b")}>As Black</Button>
            </div>
          </div>
          <p className="mt-3 text-sm text-mist">{visible.length} lines</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {visible.map((row) => (
              <button key={row.id} type="button" className="rounded-lg border border-line px-3 py-2 text-left hover:border-brass" onClick={() => openLine(row, trainSide)}>
                <span className="text-xs text-mist">{row.eco} · {row.family}</span>
                <span className="block">{row.name}</span>
              </button>
            ))}
          </div>
        </Panel>
      ) : (
        <>
          {(["w", "b"] as Side[]).map((side) => (
            <section key={side} className="grid gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl">{side === "w" ? "White" : "Black"}</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="quiet"
                    className="h-9 w-9 px-0"
                    aria-label={`${side === "w" ? "White" : "Black"} shelf: scroll left`}
                    onClick={() => scrollCarousel(side, -1)}
                  >
                    ←
                  </Button>
                  <Button
                    variant="quiet"
                    className="h-9 w-9 px-0"
                    aria-label={`${side === "w" ? "White" : "Black"} shelf: scroll right`}
                    onClick={() => scrollCarousel(side, 1)}
                  >
                    →
                  </Button>
                  <Button variant="quiet" onClick={() => setAdding(side)}>Add</Button>
                </div>
              </div>
              <div ref={(el) => { carouselRefs.current[side] = el; }} className="scrollbar-hidden overflow-x-auto pb-2">
                <div className="mx-auto flex w-max gap-3">
                {shelf[side].map((id) => {
                  const solo = id.startsWith("line:") ? book.find((row) => row.id === id.slice(5)) : undefined;
                  const item = solo ? null : courseById(id);
                  if (!item && !solo) return null;
                  const title = item?.name ?? solo?.name ?? "";
                  const blurb = item?.blurb ?? solo?.note ?? "";
                  const pct = item
                    ? progressFor(item)
                    : reviewProgress(reviews.find((review) => review.id === reviewId(solo!.id, side)));
                  return (
                    <div key={id} className="w-72 shrink-0 rounded-xl border border-line bg-surface p-4">
                      <div className="flex items-start justify-between gap-2">
                        <Pill tone="brass">{item ? (item.tier === "legendary" ? "Legendary" : "S-tier") : "Line"}</Pill>
                        <Button variant="ghost" className="h-8 px-2" onClick={() => setCarousel(side, shelf[side].filter((row) => row !== id))}>Remove</Button>
                      </div>
                      <button
                        type="button"
                        className="mt-3 w-full text-left"
                        onClick={() => {
                          setGhost(null);
                          if (solo) openLine(solo, side);
                          else setCourseId(id);
                        }}
                      >
                        <h3 className="text-2xl">{title}</h3>
                        <p className="mt-1 min-h-12 text-sm text-mist">{blurb}</p>
                        <div className="mt-3">
                          <Meter value={pct} label="Progress" />
                        </div>
                      </button>
                    </div>
                  );
                })}
                </div>
              </div>
            </section>
          ))}
          {adding && (
            <Panel>
              <h2 className="text-xl">Add to {adding === "w" ? "White" : "Black"}</h2>
              <div className="mt-3 grid gap-2">
                {COURSES.filter((item) => item.side === adding && !shelf[adding].includes(item.id)).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="rounded-lg border border-line px-3 py-2 text-left hover:border-brass"
                    onClick={() => {
                      setCarousel(adding, [...shelf[adding], item.id]);
                      setAdding(null);
                    }}
                  >
                    <span className="text-xs text-brass">{item.tier === "legendary" ? "Legendary" : "S-tier"}</span>
                    <span className="block">{item.name}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-[12rem_1fr]">
                <select className="h-11 rounded-lg border border-line bg-canvas px-3 text-sm" value={family} onChange={(event) => setFamily(event.target.value)}>
                  {families.map((item) => <option key={item}>{item}</option>)}
                </select>
                <TextInput value={query} placeholder="Find any other line" onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="mt-3 grid max-h-80 gap-2 overflow-auto">
                {visible.filter((row) => !shelf[adding].includes(`line:${row.id}`)).slice(0, 40).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="rounded-lg border border-line px-3 py-2 text-left hover:border-brass"
                    onClick={() => {
                      setCarousel(adding, [...shelf[adding], `line:${row.id}`]);
                      setAdding(null);
                    }}
                  >
                    <span className="text-xs text-mist">{row.eco} · {row.family}</span>
                    <span className="block">{row.name}</span>
                  </button>
                ))}
              </div>
              <Button className="mt-3" variant="quiet" onClick={() => setAdding(null)}>Close</Button>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function VariationSession({ course, line, hasNext, onNext, onExit }: { course: Course; line: OpeningLine; hasNext: boolean; onNext: () => void; onExit: () => void }) {
  const settings = useOe((s) => s.settings);
  const gradeLine = useOe((s) => s.gradeLine);
  const noteSuccess = useOe((s) => s.noteSuccess);
  const [ply, setPly] = useState(0);
  const [offBook, setOffBook] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const [banner, setBanner] = useState("");
  const [hints, setHints] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [started] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [hold, setHold] = useState(false);
  const graded = useRef(false);
  const prefix = useMemo(
    () => (offBook ? [...line.moves.slice(0, ply), ...extra] : line.moves.slice(0, ply)),
    [offBook, line.moves, ply, extra],
  );
  const position = useMemo(() => replay(START_FEN, prefix), [prefix]);
  const studentTurn = !done && position.chess.turn() === course.side && !thinking;
  const expected = !offBook && ply < line.moves.length ? line.moves[ply] : "";
  const sessionPct = line.moves.length ? Math.min(100, (Math.min(ply, line.moves.length) / line.moves.length) * 100) : 0;

  useEffect(() => {
    if (done || offBook || hold) return;
    if (ply >= line.moves.length) {
      if (graded.current) return;
      graded.current = true;
      const grade = gradeFromDrill({
        mistakes,
        hints,
        elapsedMs: Date.now() - started,
        studentMoves: line.moves.filter((_, index) => (index % 2 === 0 ? "w" : "b") === course.side).length,
      });
      gradeLine(line.id, course.side, grade, Date.now() - started);
      if (grade !== "fail") noteSuccess();
      setDone(true);
      setBanner(grade === "fail" ? "Let's run that one again — a couple of spots slipped." : "That variation felt solid. Well played.");
      return;
    }
    if (position.chess.turn() === course.side) return;
    const timer = window.setTimeout(() => setPly((value) => value + 1), 420);
    return () => window.clearTimeout(timer);
  }, [ply, offBook, done, hold, line, course.side, position.chess, mistakes, hints, started, gradeLine, noteSuccess]);

  useEffect(() => {
    if (!offBook || done || position.chess.turn() === course.side || position.chess.isGameOver()) return;
    let cancel = false;
    const engine = getEngine();
    setThinking(true);
    engine
      .go({ fen: START_FEN, uciMoves: position.uci, movetime: 700, strength: "max" })
      .then((best) => {
        if (cancel || !best) return;
        const next = replay(START_FEN, prefix);
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
  }, [offBook, done, position.chess, position.uci, course.side, prefix]);

  // Undo resets the student's last move: step back (max 2) to the previous position where it is the student's turn.
  const onBookUndoTarget = useMemo(() => {
    for (let i = ply - 1; i >= Math.max(0, ply - 2); i--) {
      if (replay(START_FEN, line.moves.slice(0, i)).chess.turn() === course.side) return i;
    }
    return -1;
  }, [ply, line.moves, course.side]);
  const canUndo = offBook ? extra.length > 0 : onBookUndoTarget >= 0;
  const hasProgress = ply > 0 || extra.length > 0 || done;

  function undoLast() {
    setDone(false);
    graded.current = false;
    setBanner("No rush — take that move back and try again.");
    if (offBook) {
      if (extra.length <= 1) {
        setOffBook(false);
        setExtra([]);
      } else {
        // Pop the engine reply plus the student's wrong move so the landing state stays a student turn.
        const trimmed = extra.slice(0, -2);
        if (trimmed.length === 0) {
          setOffBook(false);
          setExtra([]);
        } else {
          setExtra(trimmed);
        }
      }
      setHold(false);
      return;
    }
    if (onBookUndoTarget >= 0) setPly(onBookUndoTarget);
    // hold=false is the freeze fix: the advance effect waits for the student instead of stalling.
    setHold(false);
  }

  function onMove(from: string, to: string, promotion?: string) {
    if (!studentTurn) return;
    setHold(false);
    let moved;
    try {
      moved = position.chess.move({ from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined });
    } catch {
      return;
    }
    if (!offBook) {
      const played = moved.san.replace(/[+#]/g, "");
      const book = expected.replace(/[+#]/g, "");
      if (played !== book) {
        setMistakes((value) => value + 1);
        setOffBook(true);
        setExtra([moved.san]);
        setBanner(`You've left the book — the variation move was ${expected}, but let's keep playing.`);
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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col items-center gap-3">
        <Board
          fen={position.chess.fen()}
          orientation={course.side === "w" ? "white" : "black"}
          interactive={studentTurn}
          coordinates={settings.coordinates}
          theme={settings.boardTheme}
          pieceSet={settings.pieceSet ?? "standard"}
          highlights={hintSquares}
          arrows={hints > 1 && hintSquares.length === 2 ? [{ from: hintSquares[0]!, to: hintSquares[1]! }] : []}
          onMove={onMove}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="quiet" onClick={onExit}>Back</Button>
          <Button variant="quiet" disabled={!studentTurn || offBook} onClick={() => setHints((value) => value + 1)}>Hint</Button>
          <Button variant="quiet" disabled={!canUndo} onClick={undoLast}>Undo</Button>
          {hasProgress && (
            <Button
              variant="quiet"
              onClick={() => {
                graded.current = false;
                setPly(0);
                setOffBook(false);
                setExtra([]);
                setHints(0);
                setMistakes(0);
                setDone(false);
                setHold(false);
                setBanner("");
              }}
            >
              Let's try that again
            </Button>
          )}
          {done && <Button onClick={onNext}>{hasNext ? "Next variation" : "Back to course"}</Button>}
        </div>
        <p className="text-center text-sm text-mist">
          {done
            ? "That one's logged — nice work."
            : thinking
              ? "Stockfish is answering — you went off book."
              : studentTurn && offBook
                ? "Your move — you're off book, play on."
                : studentTurn && expected
                  ? `Your move — try ${expected}.`
                  : studentTurn
                    ? "Your move."
                    : "Let's see how the book answers."}
        </p>
      </div>
      <Panel>
        <p className="text-sm text-brass">{course.name}</p>
        <h2 className="text-2xl">{line.name}</h2>
        <p className="mt-2 text-sm text-mist">{line.note}</p>
        <div className="mt-3">
          <Meter value={done ? 100 : sessionPct} label="This variation" />
        </div>
        <p className="mt-3 h-48 overflow-auto text-sm leading-6">
          {line.moves.map((san, index) => (
            <span key={`${san}${index}`} className={index < ply ? "text-ivory" : index === ply && !offBook ? "text-brass" : "text-mist"}>
              {index % 2 === 0 ? ` ${Math.floor(index / 2) + 1}.` : ""} {san}
            </span>
          ))}
        </p>
        {banner && <p className="mt-3 text-center text-sm text-brass-2">{banner}</p>}
      </Panel>
    </div>
  );
}

export function importOpeningsFromPgn(text: string) {
  const saveOpening = useOe.getState().saveOpening;
  let count = 0;
  for (const chunk of splitPgnGames(text)) {
    const parsed = parsePgn(chunk);
    if (!parsed.ok || parsed.sans.length === 0) continue;
    saveOpening({
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      eco: parsed.headers.ECO || "A00",
      name: parsed.headers.Opening || parsed.headers.Event || "Imported line",
      family: "Imported",
      popularity: 40,
      tags: ["imported"],
      note: parsed.comments.map((comment) => comment.comment).join(" "),
      moves: parsed.sans,
      source: "user",
      updatedAt: Date.now(),
    });
    count += 1;
  }
  return count;
}
