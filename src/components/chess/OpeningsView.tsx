import { useEffect, useMemo, useRef, useState } from "react";
import { gradeFromDrill, isDue, queueRank, reviewId } from "@/lib/chess/srs";
import { parsePgn, replay, splitPgnGames, START_FEN } from "@/lib/chess/rules";
import { allOpenings, useOe } from "@/lib/chess/store";
import type { OpeningLine, Side } from "@/lib/chess/types";
import { Board } from "./Board";
import { Button, Field, Panel, Pill, TextInput } from "./ui";

type Tab = "train" | "explore" | "repertoire";

export function OpeningsView() {
  const [tab, setTab] = useState<Tab>("train");
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {(["train", "explore", "repertoire"] as Tab[]).map((item) => (
          <Button key={item} variant={tab === item ? "primary" : "quiet"} onClick={() => setTab(item)}>
            {item === "train" ? "Train" : item === "explore" ? "Explorer" : "Repertoire"}
          </Button>
        ))}
      </div>
      {tab === "train" && <Trainer />}
      {tab === "explore" && <Explorer />}
      {tab === "repertoire" && <RepertoireEditor />}
    </div>
  );
}

function Trainer() {
  const repertoire = useOe((s) => s.repertoire);
  const reviews = useOe((s) => s.reviews);
  const custom = useOe((s) => s.openings);
  const settings = useOe((s) => s.settings);
  const gradeLine = useOe((s) => s.gradeLine);
  const noteSuccess = useOe((s) => s.noteSuccess);
  const setLaunch = useOe((s) => s.setLaunch);
  const [side, setSide] = useState<Side>("w");
  const [blind, setBlind] = useState(false);
  const [index, setIndex] = useState(0);
  const [ply, setPly] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(0);
  const [started, setStarted] = useState(() => Date.now());
  const [banner, setBanner] = useState("");
  const [doneGrade, setDoneGrade] = useState<string | null>(null);
  const graded = useRef(false);

  const lines = useMemo(() => {
    const pool = allOpenings(custom).filter((line) => repertoire[side].includes(line.id));
    return pool
      .map((line) => ({ line, review: reviews.find((row) => row.id === reviewId(line.id, side)) }))
      .sort((a, b) => queueRank(a.review, Date.now()) - queueRank(b.review, Date.now()));
  }, [custom, repertoire, reviews, side]);
  const dueCount = lines.filter((row) => isDue(row.review, Date.now())).length;
  const current = lines[index]?.line;
  const prefix = current ? current.moves.slice(0, ply) : [];
  const position = useMemo(() => replay(START_FEN, prefix), [prefix]);
  const studentTurn = current ? (ply % 2 === 0 ? "w" : "b") === side && ply < current.moves.length : false;
  const expected = current && ply < current.moves.length ? current.moves[ply] : "";

  useEffect(() => {
    setPly(0);
    setMistakes(0);
    setHints(0);
    setStarted(Date.now());
    setBanner("");
    setDoneGrade(null);
    graded.current = false;
  }, [current?.id, side]);

  useEffect(() => {
    if (!current || doneGrade || graded.current) return;
    if (ply >= current.moves.length) {
      graded.current = true;
      const grade = gradeFromDrill({
        mistakes,
        hints,
        elapsedMs: Date.now() - started,
        studentMoves: current.moves.filter((_, i) => (i % 2 === 0 ? "w" : "b") === side).length,
      });
      gradeLine(current.id, side, grade, Date.now() - started);
      if (grade !== "fail") noteSuccess();
      setDoneGrade(grade);
      return;
    }
    if (studentTurn) return;
    const timer = window.setTimeout(() => setPly((value) => value + 1), 280);
    return () => window.clearTimeout(timer);
  }, [current, ply, studentTurn, doneGrade, mistakes, hints, started, side, gradeLine, noteSuccess]);

  function resetLine() {
    setPly(0);
    setMistakes(0);
    setHints(0);
    setStarted(Date.now());
    setBanner("");
    setDoneGrade(null);
    graded.current = false;
  }

  function onMove(from: string, to: string, promotion?: string) {
    if (!current || !studentTurn || doneGrade) return;
    const next = replay(START_FEN, prefix);
    let moved;
    try {
      moved = next.chess.move({ from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined });
    } catch {
      return;
    }
    const played = moved.san.replace(/[+#]/g, "");
    const book = expected.replace(/[+#]/g, "");
    if (played !== book) {
      setMistakes((value) => value + 1);
      setBanner(`The repertoire move is ${expected}.`);
      return;
    }
    setBanner("");
    setPly((value) => value + 1);
  }

  const hintSquares = useMemo(() => {
    if (!hints || !expected || !current) return [];
    try {
      const probe = replay(START_FEN, prefix);
      const moved = probe.chess.move(expected);
      return moved ? [moved.from, moved.to] : [];
    } catch {
      return [];
    }
  }, [hints, expected, current, prefix]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full max-w-xl flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant={side === "w" ? "primary" : "quiet"} onClick={() => { setSide("w"); setIndex(0); }}>White</Button>
            <Button variant={side === "b" ? "primary" : "quiet"} onClick={() => { setSide("b"); setIndex(0); }}>Black</Button>
          </div>
          <Button variant={blind ? "primary" : "quiet"} onClick={() => setBlind((value) => !value)}>
            {blind ? "Blind drill on" : "Blind drill"}
          </Button>
        </div>
        {current ? (
          <Board
            fen={position.chess.fen()}
            orientation={side === "w" ? "white" : "black"}
            interactive={studentTurn && !doneGrade}
            coordinates={settings.coordinates}
            theme={settings.boardTheme}
            highlights={hints > 0 ? hintSquares : []}
            arrows={hints > 1 && hintSquares.length === 2 ? [{ from: hintSquares[0], to: hintSquares[1] }] : []}
            onMove={onMove}
          />
        ) : (
          <Panel>Add lines to this repertoire first.</Panel>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="quiet" onClick={() => setHints((value) => value + 1)} disabled={!studentTurn}>Hint</Button>
          <Button variant="quiet" onClick={resetLine}>Retry</Button>
          <Button
            variant="quiet"
            onClick={() => current && setLaunch({ startFen: position.chess.fen(), sans: [], player: side })}
          >
            Play from here
          </Button>
        </div>
        {banner && <p className="text-sm text-brass-2">{banner}</p>}
      </div>
      <Panel>
        <p className="text-sm text-mist">{dueCount} due · {lines.length} in this repertoire</p>
        {current && (
          <>
            <h2 className="mt-2 text-2xl">{current.name}</h2>
            <p className="text-sm text-brass">{current.eco}</p>
            {!blind && <p className="mt-3 text-sm text-mist">{current.note}</p>}
            {!blind && (
              <p className="mt-3 text-sm leading-6">
                {current.moves.map((san, i) => (
                  <span key={`${san}${i}`} className={i === ply ? "text-brass" : i < ply ? "text-ivory" : "text-mist"}>
                    {i % 2 === 0 ? ` ${Math.floor(i / 2) + 1}.` : ""} {san}
                  </span>
                ))}
              </p>
            )}
            {blind && <p className="mt-3 text-sm text-mist">The book move stays hidden until you miss or ask for a hint.</p>}
            {doneGrade && (
              <div className="mt-4 grid gap-2">
                <Pill tone={doneGrade === "fail" ? "danger" : "ok"}>{doneGrade}</Pill>
                <Button onClick={() => setIndex((value) => (value + 1) % Math.max(1, lines.length))}>Next line</Button>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function Explorer() {
  const custom = useOe((s) => s.openings);
  const favorites = useOe((s) => s.favorites);
  const extraTags = useOe((s) => s.extraTags);
  const settings = useOe((s) => s.settings);
  const toggleFavorite = useOe((s) => s.toggleFavorite);
  const saveOpening = useOe((s) => s.saveOpening);
  const repertoire = useOe((s) => s.repertoire);
  const setRepertoire = useOe((s) => s.setRepertoire);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("All");
  const [picked, setPicked] = useState<string | null>(null);
  const [ply, setPly] = useState(0);
  const [draft, setDraft] = useState({ name: "", eco: "A00", moves: "", note: "", tags: "" });
  const [formError, setFormError] = useState("");
  const lines = allOpenings(custom);
  const families = ["All", ...Array.from(new Set(lines.map((line) => line.family)))];
  const filtered = lines.filter((line) => {
    const tags = [...line.tags, ...(extraTags.map[line.id] ?? [])].join(" ");
    const blob = `${line.name} ${line.eco} ${line.moves.join(" ")} ${tags}`.toLowerCase();
    if (family !== "All" && line.family !== family) return false;
    return blob.includes(query.trim().toLowerCase());
  });
  const current = lines.find((line) => line.id === picked) ?? filtered[0];
  const prefix = current?.moves.slice(0, ply) ?? [];
  const position = useMemo(() => replay(START_FEN, prefix), [prefix]);
  const nextMoves = new Map<string, OpeningLine[]>();
  for (const line of filtered) {
    if (!prefix.every((san, index) => line.moves[index] === san)) continue;
    const san = line.moves[prefix.length];
    if (!san) continue;
    nextMoves.set(san, [...(nextMoves.get(san) ?? []), line]);
  }

  function createLine() {
    const parsed = draft.moves.trim().split(/\s+/).filter(Boolean);
    try {
      replay(START_FEN, parsed);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Illegal moves");
      return;
    }
    if (!draft.name.trim() || parsed.length < 1) {
      setFormError("Name the line and give at least one move.");
      return;
    }
    const line: OpeningLine = {
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      eco: draft.eco || "A00",
      name: draft.name.trim(),
      family: "Custom",
      popularity: 50,
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      note: draft.note.trim(),
      moves: parsed,
      source: "user",
      updatedAt: Date.now(),
    };
    saveOpening(line);
    setRepertoire("w", [...repertoire.w, line.id]);
    setFormError("");
    setPicked(line.id);
    setDraft({ name: "", eco: "A00", moves: "", note: "", tags: "" });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_18rem]">
      <Panel className="max-h-[70vh] overflow-auto">
        <TextInput value={query} placeholder="Search name, ECO, moves" onChange={(event) => setQuery(event.target.value)} />
        <div className="mt-3 flex flex-col gap-1">
          {families.map((item) => (
            <button key={item} type="button" className={`rounded-lg px-3 py-2 text-left text-sm ${family === item ? "bg-brass text-ink" : "hover:bg-panel"}`} onClick={() => setFamily(item)}>
              {item}
            </button>
          ))}
        </div>
      </Panel>
      <div className="flex flex-col items-center gap-3">
        <Board
          fen={position.chess.fen()}
          coordinates={settings.coordinates}
          theme={settings.boardTheme}
          interactive={false}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="quiet" onClick={() => setPly(0)}>Start</Button>
          <Button variant="quiet" onClick={() => setPly((value) => Math.max(0, value - 1))}>Back</Button>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {[...nextMoves.entries()].map(([san, group]) => (
            <Button key={san} variant="quiet" onClick={() => { setPly((value) => value + 1); setPicked(group[0].id); }}>
              {san} · {group.length}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-3">
        <Panel className="max-h-72 overflow-auto">
          {filtered.slice(0, 40).map((line) => (
            <button key={line.id} type="button" className="block w-full rounded-lg px-2 py-2 text-left hover:bg-panel" onClick={() => { setPicked(line.id); setPly(0); }}>
              <span className="text-xs text-brass">{line.eco}</span>
              <span className="block text-sm">{line.name}</span>
            </button>
          ))}
        </Panel>
        {current && (
          <Panel>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xl">{current.name}</h2>
              <Button variant="ghost" onClick={() => toggleFavorite(current.id)}>{favorites.ids.includes(current.id) ? "Starred" : "Star"}</Button>
            </div>
            <p className="mt-2 text-sm text-mist">{current.note}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="quiet" onClick={() => setRepertoire("w", repertoire.w.includes(current.id) ? repertoire.w.filter((id) => id !== current.id) : [...repertoire.w, current.id])}>
                {repertoire.w.includes(current.id) ? "In White" : "Add White"}
              </Button>
              <Button variant="quiet" onClick={() => setRepertoire("b", repertoire.b.includes(current.id) ? repertoire.b.filter((id) => id !== current.id) : [...repertoire.b, current.id])}>
                {repertoire.b.includes(current.id) ? "In Black" : "Add Black"}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {current.tags.map((tag) => <Pill key={tag}>{tag}</Pill>)}
            </div>
          </Panel>
        )}
        <Panel>
          <h2 className="mb-2 text-lg">Custom line</h2>
          <div className="grid gap-2">
            <TextInput placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <TextInput placeholder="ECO" value={draft.eco} onChange={(event) => setDraft({ ...draft, eco: event.target.value })} />
            <TextInput placeholder="Moves, e.g. e4 c5 Nf3" value={draft.moves} onChange={(event) => setDraft({ ...draft, moves: event.target.value })} />
            <TextInput placeholder="Note" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
            <TextInput placeholder="Tags, comma separated" value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <Button onClick={createLine}>Save line</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function RepertoireEditor() {
  const custom = useOe((s) => s.openings);
  const repertoire = useOe((s) => s.repertoire);
  const setRepertoire = useOe((s) => s.setRepertoire);
  const deleteOpening = useOe((s) => s.deleteOpening);
  const [side, setSide] = useState<Side>("w");
  const [query, setQuery] = useState("");
  const lines = allOpenings(custom).filter((line) => `${line.name} ${line.eco}`.toLowerCase().includes(query.toLowerCase()));
  const selected = new Set(repertoire[side]);
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant={side === "w" ? "primary" : "quiet"} onClick={() => setSide("w")}>White</Button>
        <Button variant={side === "b" ? "primary" : "quiet"} onClick={() => setSide("b")}>Black</Button>
        <TextInput className="max-w-xs" placeholder="Filter" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <ul className="grid gap-1 md:grid-cols-2">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-panel">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(line.id)}
                onChange={() => {
                  const next = selected.has(line.id) ? repertoire[side].filter((id) => id !== line.id) : [...repertoire[side], line.id];
                  setRepertoire(side, next);
                }}
              />
              <span>{line.eco} {line.name}</span>
            </label>
            {line.source === "user" && (
              <Button variant="ghost" onClick={() => deleteOpening(line.id)}>Delete</Button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function importOpeningsFromPgn(text: string) {
  const saveOpening = useOe.getState().saveOpening;
  const games = splitPgnGames(text);
  let count = 0;
  for (const chunk of games) {
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
