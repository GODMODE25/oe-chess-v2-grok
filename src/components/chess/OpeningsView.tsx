import { useEffect, useMemo, useRef, useState } from "react";
import { COURSES, DEFAULT_CAROUSEL, TIER_LABEL, TIER_RANK, courseById, reviewProgress, variationsFor, type Course } from "@/lib/chess/courses";
import { parsePgn, lastMoveOf, safeReplay, splitPgnGames, START_FEN } from "@/lib/chess/rules";
import { reviewId } from "@/lib/chess/srs";
import { allOpenings, useOe } from "@/lib/chess/store";
import type { LineTier, OpeningLine, Prefs, Side } from "@/lib/chess/types";
import { OpeningSession } from "./OpeningSession";
import { Board } from "./Board";
import { Button, Meter, Panel, Pill, TextInput } from "./ui";

const TIERS = Object.keys(TIER_LABEL) as LineTier[];
const NO_PREFS: Prefs = {};

function TierPill({ tier }: { tier: LineTier }) {
  return <Pill tone={tier === "s" ? "brass" : tier === "trash" ? "danger" : "mist"}>{TIER_LABEL[tier]}</Pill>;
}

function byQuality(a: OpeningLine, b: OpeningLine) {
  return (TIER_RANK[a.tier ?? "d"] - TIER_RANK[b.tier ?? "d"]) || b.popularity - a.popularity;
}

export function OpeningsView() {
  const repertoire = useOe((s) => s.repertoire);
  const reviews = useOe((s) => s.reviews);
  const settings = useOe((s) => s.settings);
  const patchPrefs = useOe((s) => s.patchPrefs);
  const setCarousel = useOe((s) => s.setCarousel);
  const custom = useOe((s) => s.openings);
  const book = useMemo(() => allOpenings(custom), [custom]);
  // The catalog holds a few same-named twins at different depths; keep the first, which is what each course drills.
  const bookOnly = useMemo(() => {
    const named = new Set<string>();
    return book.filter((row) => {
      if (row.tags?.includes("generated")) return false;
      if (named.has(row.name)) return false;
      named.add(row.name);
      return true;
    });
  }, [book]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [lineId, setLineId] = useState<string | null>(null);
  const [adding, setAdding] = useState<Side | null>(null);
  const [query, setQuery] = useState("");
  const [ghost, setGhost] = useState<Course | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const carouselRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const railRef = useRef<HTMLDivElement | null>(null);

  // The view choices are stored, so the shelf opens the way it was left.
  const prefs = settings.prefs ?? NO_PREFS;
  const tab = prefs.openingsTab ?? "shelf";
  const setTab = (next: "shelf" | "explorer") => patchPrefs({ openingsTab: next });
  const tierFilter = prefs.tierFilter ?? "all";
  const setTierFilter = (next: "all" | LineTier) => patchPrefs({ tierFilter: next });
  const trainSide = prefs.trainSide ?? "w";
  const setTrainSide = (next: Side) => patchPrefs({ trainSide: next });

  function scrollRail(dir: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.firstElementChild as HTMLElement | null;
    rail.scrollBy({ top: dir * ((card?.offsetHeight ?? 148) + 12), behavior: "smooth" });
  }

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
  const families = ["All", ...Array.from(new Set(bookOnly.map((row) => row.family)))];
  // A stored family that no longer ships would read as an empty shelf, so fall back to All.
  const family = prefs.family && families.includes(prefs.family) ? prefs.family : "All";
  const setFamily = (next: string) => patchPrefs({ family: next });

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
      <OpeningSession
        key={line.id}
        course={activeCourse}
        line={line}
        hasNext={hasNext}
        isCourse={Boolean(course)}
        onNext={() => setLineId(hasNext ? rows[idx + 1].id : null)}
        onExit={() => { setLineId(null); setGhost(null); }}
      />
    );
  }

  if (course) {
    const pinned = variations.find((row) => row.id === pinnedId) ?? variations[0] ?? null;
    const pinnedPosition = pinned ? safeReplay(START_FEN, pinned.moves) : null;
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="mx-auto grid w-full max-w-xl content-start justify-items-start gap-3">
          <Button variant="ghost" onClick={() => setCourseId(null)}>Back to shelf</Button>
          <div className="flex w-full flex-col items-center gap-3">
            <Board
              fen={pinnedPosition?.ok ? pinnedPosition.chess.fen() : START_FEN}
              lastMove={pinnedPosition?.ok ? lastMoveOf(pinnedPosition.chess) : null}
              orientation={course.side === "w" ? "white" : "black"}
              coordinates={settings.coordinates}
              theme={settings.boardTheme}
              pieceSet={settings.pieceSet ?? "standard"}
              interactive={false}
            />
            <p className="text-sm text-mist">
              {pinned
                ? `Pinned to ${pinned.name}. Pick another variation to move the board — then start the drill.`
                : "You'll play the course moves here."}
            </p>
          </div>
        </div>
        <div className="grid content-start gap-3">
          <Panel>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl">{course.name}</h2>
              <Pill tone="brass">{course.tier === "legendary" ? "Legendary" : "S-tier"}</Pill>
            </div>
            <p className="mt-2 text-sm text-mist">{course.blurb}</p>
            <div className="mt-3">
              <Meter value={progressFor(course)} label="Opening progress" />
            </div>
          </Panel>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-mist">{variations.length} variations</p>
            {variations.length > 3 && (
              <div className="flex gap-2">
                <Button
                  variant="quiet"
                  className="h-9 w-9 px-0"
                  aria-label={`${course.name} variations: scroll up`}
                  onClick={() => scrollRail(-1)}
                >
                  ↑
                </Button>
                <Button
                  variant="quiet"
                  className="h-9 w-9 px-0"
                  aria-label={`${course.name} variations: scroll down`}
                  onClick={() => scrollRail(1)}
                >
                  ↓
                </Button>
              </div>
            )}
          </div>
          <div
            ref={railRef}
            className="scrollbar-hidden grid snap-y snap-mandatory content-start gap-3 overflow-y-auto"
            style={{ maxHeight: "calc(3 * 8.5rem + 2 * 0.75rem)" }}
          >
            {variations.map((variation) => {
              const review = reviews.find((item) => item.id === reviewId(variation.id, course.side));
              const isPinned = pinned?.id === variation.id;
              return (
                <div
                  key={variation.id}
                  className={`h-[8.5rem] snap-start rounded-xl border p-3 ${isPinned ? "border-brass bg-surface-2" : "border-line bg-surface"}`}
                >
                  <button type="button" className="flex h-full w-full flex-col text-left" onClick={() => setPinnedId(variation.id)}>
                    <div className="flex items-start gap-2">
                      <h3 className="text-lg">{variation.name}</h3>
                      {variation.tier && <TierPill tier={variation.tier} />}
                    </div>
                    <p className="mt-1 text-sm text-mist">{variation.moves.length} plies · {variation.eco}</p>
                    <div className="mt-auto pt-2">
                      <Meter value={reviewProgress(review)} label={review?.status ?? "new"} />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
          {pinned && <Button onClick={() => setLineId(pinned.id)}>Start this variation</Button>}
        </div>
      </div>
    );
  }

  function matchesSlice(row: OpeningLine) {
    if (family !== "All" && row.family !== family) return false;
    const hay = `${row.name} ${row.eco} ${row.family}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  }

  const searched = bookOnly.filter(matchesSlice);
  const visible = searched
    .filter((row) => tierFilter === "all" || (row.tier ?? "d") === tierFilter)
    .sort(byQuality);
  const tierCounts = TIERS.map((tier) => ({
    tier,
    count: searched.filter((row) => (row.tier ?? "d") === tier).length,
  })).filter((option) => option.count > 0);
  // Engine continuations stay under their course in Explorer; the Add browser still offers them.
  const addChoices = book.filter(matchesSlice).sort(byQuality);

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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-mist">{visible.length} openings in the book, best first</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant={tierFilter === "all" ? "primary" : "quiet"} className="h-9 px-3" onClick={() => setTierFilter("all")}>
                All
              </Button>
              {tierCounts.map(({ tier, count }) => (
                <Button
                  key={tier}
                  variant={tierFilter === tier ? "primary" : "quiet"}
                  className="h-9 px-3"
                  onClick={() => setTierFilter(tier)}
                >
                  {TIER_LABEL[tier]} · {count}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {visible.map((row) => (
              <button key={row.id} type="button" className="rounded-lg border border-line px-3 py-2 text-left hover:border-brass" onClick={() => openLine(row, trainSide)}>
                <span className="flex items-center gap-2 text-xs text-mist">
                  {row.eco} · {row.family}
                  {row.tier && <TierPill tier={row.tier} />}
                </span>
                <span className="block">{row.name}</span>
              </button>
            ))}
            {!visible.length && <p className="text-sm text-mist">Nothing matches this filter. Set the tier back to All or clear the search.</p>}
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
                {addChoices.filter((row) => !shelf[adding].includes(`line:${row.id}`)).slice(0, 40).map((row) => (
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
