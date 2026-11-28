import { useMemo, useState } from "react";
import { ArrowRight, Clock3, Flame, Play, Target, TrendingUp, Trophy } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COURSES, DEFAULT_CAROUSEL, courseById, reviewProgress, variationsFor } from "@/lib/chess/courses";
import { reviewId } from "@/lib/chess/srs";
import { allEndgames, allOpenings, useOe } from "@/lib/chess/store";
import type { Course } from "@/lib/chess/courses";
import type { OpeningLine, Review } from "@/lib/chess/types";
import { Button, Panel, Pill, cn } from "./ui";

const DAY = 86_400_000;
const RANGES = [
  { id: "30", label: "30D", days: 30 },
  { id: "90", label: "90D", days: 90 },
  { id: "365", label: "1Y", days: 365 },
  { id: "all", label: "All", days: Number.POSITIVE_INFINITY },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

function startOfDay(time: number) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function shortDate(time: number) {
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function percent(value: number) {
  return Math.round(value);
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = "brass",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Flame;
  tone?: "brass" | "ok";
}) {
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-mist sm:text-xs sm:tracking-[0.14em]">{label}</p>
        <span
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 sm:h-8 sm:w-8",
            tone === "ok" ? "text-ok" : "text-brass",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div>
        <p className="font-display text-2xl leading-none tabular-nums sm:text-3xl">{value}</p>
        <p className="mt-1.5 text-[11px] leading-4 text-mist sm:text-xs">{detail}</p>
      </div>
    </Panel>
  );
}

function MasteryRing({ course, value, mastered, total }: { course: Course; value: number; mastered: number; total: number }) {
  const circumference = 2 * Math.PI * 26;
  const filled = Math.max(0, Math.min(100, value)) / 100;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/40 p-2.5">
      <div className="relative shrink-0">
        <svg viewBox="0 0 64 64" className="h-14 w-14 -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--color-surface-2)" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="var(--color-brass)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled * circumference} ${circumference}`}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[11px] font-medium tabular-nums">
          {percent(value)}%
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{course.name}</p>
        <p className="text-xs text-mist">
          {mastered}/{total} mastered · {course.side === "w" ? "White" : "Black"}
        </p>
      </div>
    </div>
  );
}

export function StatsView() {
  const profile = useOe((s) => s.profile);
  const reviews = useOe((s) => s.reviews);
  const attempts = useOe((s) => s.attempts);
  const games = useOe((s) => s.games);
  const customOpenings = useOe((s) => s.openings);
  const customEndgames = useOe((s) => s.endgames);
  const repertoire = useOe((s) => s.repertoire);
  const setNav = useOe((s) => s.setNav);
  const startDrill = useOe((s) => s.startDrill);
  const [range, setRange] = useState<RangeId>("90");
  const now = Date.now();

  const positions = useMemo(() => allEndgames(customEndgames), [customEndgames]);
  const book = useMemo(() => allOpenings(customOpenings), [customOpenings]);
  const lineById = useMemo(() => new Map(book.map((line) => [line.id, line])), [book]);

  const endgameStats = useMemo(() => {
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

  // Only analyzed games where the human seat was graded give a real rating estimate.
  const ratingPoints = useMemo(() => {
    const points: { at: number; rating: number }[] = [];
    for (const game of games) {
      if (game.deleted || !game.review) continue;
      if (game.playerColor !== "w" && game.playerColor !== "b") continue;
      const side = game.review[game.playerColor];
      if (!side || side.estimated === false) continue;
      points.push({ at: game.createdAt, rating: Math.round(side.rating) });
    }
    return points.sort((a, b) => a.at - b.at);
  }, [games]);

  const activeRange = RANGES.find((row) => row.id === range) ?? RANGES[1];
  const cutoff = now - activeRange.days * DAY;
  const chartData = useMemo(() => {
    const inRange = ratingPoints.filter((point) => point.at >= cutoff);
    const before = ratingPoints.filter((point) => point.at < cutoff).slice(-1);
    return [...before, ...inRange];
  }, [ratingPoints, cutoff]);

  const latestRating = ratingPoints.length ? ratingPoints[ratingPoints.length - 1].rating : null;
  const rangeDelta =
    chartData.length >= 2 ? chartData[chartData.length - 1].rating - chartData[0].rating : 0;

  const gameAccuracy = useMemo(() => {
    const values: number[] = [];
    for (const game of games) {
      if (game.deleted || !game.review) continue;
      if (game.playerColor !== "w" && game.playerColor !== "b") continue;
      const side = game.review[game.playerColor];
      if (side) values.push(side.accuracy);
    }
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }, [games]);

  const drillSolved = attempts.filter((attempt) => attempt.success === true).length;
  const drillFailed = attempts.filter((attempt) => attempt.success === false).length;
  const drillAccuracy = drillSolved + drillFailed > 0 ? (drillSolved / (drillSolved + drillFailed)) * 100 : null;
  const accuracy = gameAccuracy ?? drillAccuracy;
  const solvedPositions = positions.filter((pos) => (endgameStats.get(pos.id)?.wins ?? 0) > 0).length;

  const weekStart = now - 7 * DAY;
  const weekReviews = reviews.filter((review) => review.reps > 0 && review.updatedAt >= weekStart).length;
  const weekDrills = attempts.filter((attempt) => attempt.startedAt >= weekStart).length;
  const weekGames = games.filter((game) => !game.deleted && game.createdAt >= weekStart).length;

  const masteryCourses = useMemo(() => {
    const ids = new Set([
      ...(repertoire.carousel?.w ?? DEFAULT_CAROUSEL.w),
      ...(repertoire.carousel?.b ?? DEFAULT_CAROUSEL.b),
    ]);
    const rows = [...ids].map((id) => courseById(id)).filter((course): course is Course => Boolean(course));
    const ranked = (rows.length ? rows : COURSES.slice(0, 6)).map((course) => {
      const lines = variationsFor(course);
      const values = lines.map((line) =>
        reviewProgress(reviews.find((review) => review.id === reviewId(line.id, course.side))),
      );
      const value = values.length ? values.reduce((sum, row) => sum + row, 0) / values.length : 0;
      const mastered = values.filter((row) => row >= 100).length;
      return { course, value, mastered, total: lines.length };
    });
    return ranked.sort((a, b) => b.value - a.value).slice(0, 4);
  }, [repertoire.carousel, reviews]);

  // 13 weeks of activity, Monday-first, ending today.
  const heatmap = useMemo(() => {
    const activity = new Map<number, number>();
    const add = (time: number | null | undefined) => {
      if (!time) return;
      const day = startOfDay(time);
      activity.set(day, (activity.get(day) ?? 0) + 1);
    };
    for (const review of reviews) if (review.reps > 0) add(review.updatedAt);
    for (const attempt of attempts) add(attempt.startedAt);
    for (const game of games) if (!game.deleted) add(game.createdAt);

    const today = startOfDay(now);
    const mondayOffset = (new Date(today).getDay() + 6) % 7;
    const start = today - (mondayOffset + 12 * 7) * DAY;
    const weeks: { at: number; count: number }[][] = [];
    for (let week = 0; week < 13; week += 1) {
      const column: { at: number; count: number }[] = [];
      for (let day = 0; day < 7; day += 1) {
        const at = start + (week * 7 + day) * DAY;
        column.push({ at, count: activity.get(at) ?? 0 });
      }
      weeks.push(column);
    }
    return weeks;
  }, [reviews, attempts, games, now]);

  const dueOpenings = useMemo(() => {
    const rows: { review: Review; line: OpeningLine }[] = [];
    for (const review of reviews) {
      if (review.reps === 0 || review.dueAt > now) continue;
      const line = lineById.get(review.lineId);
      if (line) rows.push({ review, line });
    }
    return rows.sort((a, b) => a.review.dueAt - b.review.dueAt).slice(0, 3);
  }, [reviews, lineById, now]);

  const weakEndgames = useMemo(() => {
    const seen = new Set<string>();
    return positions
      .map((pos) => ({ pos, stat: endgameStats.get(pos.id) }))
      .filter((row) => !row.stat || row.stat.wins < row.stat.tries)
      .sort((a, b) => {
        const ra = a.stat && a.stat.tries ? a.stat.wins / a.stat.tries : 0.5;
        const rb = b.stat && b.stat.tries ? b.stat.wins / b.stat.tries : 0.5;
        return ra - rb;
      })
      .filter((row) => {
        if (seen.has(row.pos.title)) return false;
        seen.add(row.pos.title);
        return true;
      })
      .slice(0, 3);
  }, [positions, endgameStats]);

  const categoryRows = useMemo(() => {
    const map = new Map<string, { solved: number; tries: number }>();
    for (const attempt of attempts) {
      if (attempt.success == null) continue;
      const pos = positions.find((row) => row.id === attempt.endgameId);
      const name = pos?.category ?? "Other";
      const row = map.get(name) ?? { solved: 0, tries: 0 };
      row.tries += 1;
      if (attempt.success) row.solved += 1;
      map.set(name, row);
    }
    return [...map.entries()]
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => b.tries - a.tries)
      .slice(0, 6);
  }, [attempts, positions]);

  const queueCount = dueOpenings.length + weakEndgames.length;
  const nothingYet =
    ratingPoints.length === 0 && reviews.every((review) => review.reps === 0) && attempts.length === 0;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="Estimated rating"
          value={latestRating ? String(latestRating) : "—"}
          detail={
            latestRating
              ? `${rangeDelta >= 0 ? "+" : ""}${rangeDelta} over ${activeRange.label.toLowerCase()}`
              : "Analyze a game to estimate it"
          }
          icon={TrendingUp}
        />
        <StatTile
          label="Accuracy"
          value={accuracy != null ? `${percent(accuracy)}%` : "—"}
          detail={
            gameAccuracy != null
              ? `${games.filter((game) => game.review).length} analyzed games`
              : drillAccuracy != null
                ? `${drillSolved}/${drillSolved + drillFailed} drills solved`
                : "No games or drills graded yet"
          }
          icon={Target}
          tone="ok"
        />
        <StatTile
          label="Streak"
          value={`${profile.streak}d`}
          detail={`Best ${profile.bestStreak}d · ${weekReviews + weekDrills + weekGames} sessions this week`}
          icon={Flame}
        />
        <StatTile
          label="Endgames"
          value={`${solvedPositions}/${positions.length}`}
          detail={drillSolved > 0 ? `${percent((drillSolved / Math.max(1, drillSolved + drillFailed)) * 100)}% drill win rate` : "Positions solved at least once"}
          icon={Trophy}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Panel className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xl">Rating progression</h3>
              <p className="mt-0.5 text-xs text-mist">Estimated from your analyzed games, not a fixed number.</p>
            </div>
            <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1" role="group" aria-label="Rating range">
              {RANGES.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  aria-pressed={range === row.id}
                  onClick={() => setRange(row.id)}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-xs font-medium transition",
                    range === row.id ? "bg-brass text-on-accent" : "text-mist hover:text-ivory",
                  )}
                >
                  {row.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 h-56">
            {chartData.length < 2 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line text-center">
                <TrendingUp className="h-6 w-6 text-mist" aria-hidden />
                <p className="text-sm text-mist">
                  {ratingPoints.length === 0
                    ? "Finish a game and analyze it — the graph starts there."
                    : "One more analyzed game draws the line."}
                </p>
                <Button variant="quiet" onClick={() => setNav("play")}>
                  Play a game
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="at"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(value: number) => shortDate(value)}
                    stroke="var(--color-mist)"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="var(--color-mist)"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-line)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    labelFormatter={(label) => shortDate(Number(label))}
                    formatter={(value) => [`${value}`, "Rating"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="rating"
                    stroke="var(--color-brass)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "var(--color-brass)", strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xl">Next up</h3>
              <p className="mt-0.5 text-xs text-mist">Adaptive review queue</p>
            </div>
            <Pill tone={queueCount ? "brass" : "mist"}>
              {dueOpenings.length ? `${dueOpenings.length} due` : queueCount ? `${queueCount} to try` : "Clear"}
            </Pill>
          </div>
          {queueCount === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-line p-4 text-sm text-mist">
              Nothing is due. Start a new line or drill and it will show up here.
            </div>
          ) : (
            <div className="mt-3 grid gap-1.5">
              {dueOpenings.map(({ review, line }) => (
                <button
                  key={review.id}
                  type="button"
                  onClick={() => startDrill({ kind: "opening", lineId: review.lineId, side: review.side })}
                  className="group flex items-center gap-3 rounded-lg border border-line bg-surface-2/40 p-2.5 text-left transition hover:border-brass"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface text-brass">
                    <Clock3 className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{line.name}</span>
                    <span className="block truncate text-xs text-mist">
                      Opening · {review.side === "w" ? "White" : "Black"} · {review.status}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-mist transition group-hover:translate-x-0.5 group-hover:text-brass" aria-hidden />
                </button>
              ))}
              {weakEndgames.map(({ pos, stat }) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => startDrill({ kind: "endgame", id: pos.id })}
                  className="group flex items-center gap-3 rounded-lg border border-line bg-surface-2/40 p-2.5 text-left transition hover:border-brass"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface text-brass">
                    <Play className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{pos.title}</span>
                    <span className="block truncate text-xs text-mist">
                      Endgame · {stat ? `${stat.wins}/${stat.tries} solved` : "not tried yet"}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-mist transition group-hover:translate-x-0.5 group-hover:text-brass" aria-hidden />
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="quiet" className="h-9 px-3 text-xs" onClick={() => setNav("openings")}>
              Openings
            </Button>
            <Button variant="quiet" className="h-9 px-3 text-xs" onClick={() => setNav("endgames")}>
              Endgames
            </Button>
          </div>
          {queueCount > 0 && (
            <Button
              className="mt-2 h-9 w-full text-xs"
              onClick={() => {
                if (dueOpenings[0]) {
                  startDrill({ kind: "opening", lineId: dueOpenings[0].review.lineId, side: dueOpenings[0].review.side });
                } else if (weakEndgames[0]) {
                  startDrill({ kind: "endgame", id: weakEndgames[0].pos.id });
                }
              }}
            >
              Start review session
            </Button>
          )}
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Panel className="min-w-0">
          <h3 className="text-xl">Mastery</h3>
          <p className="mt-0.5 text-xs text-mist">Average line progress in your repertoire.</p>
          <div className="mt-3 grid gap-2">
            {masteryCourses.map(({ course, value, mastered, total }) => (
              <MasteryRing key={course.id} course={course} value={value} mastered={mastered} total={total} />
            ))}
          </div>
        </Panel>

        <Panel className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-xl">Training activity</h3>
              <p className="mt-0.5 text-xs text-mist">Replays, drills, and games over the last 13 weeks.</p>
            </div>
            <p className="text-xs tabular-nums text-mist">{weekReviews + weekDrills + weekGames} this week</p>
          </div>
          <div className="mt-4 flex w-full gap-[3px]">
            {heatmap.map((week, index) => (
              <div key={week[0].at} className="grid flex-1 grid-rows-7 gap-[3px]" aria-label={index === 12 ? "This week" : undefined}>
                {week.map((cell) => (
                  <div
                    key={cell.at}
                    title={`${shortDate(cell.at)}: ${cell.count} ${cell.count === 1 ? "session" : "sessions"}`}
                    className={cn(
                      "aspect-square w-full rounded-[3px] border border-line/40",
                      cell.count === 0 && "bg-surface-2/50",
                      cell.count > 0 && cell.count <= 2 && "bg-brass/25",
                      cell.count > 2 && cell.count <= 4 && "bg-brass/45",
                      cell.count > 4 && cell.count <= 7 && "bg-brass/70",
                      cell.count > 7 && "bg-brass",
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-mist">
            <span>
              {shortDate(heatmap[0][0].at)} – {shortDate(now)}
            </span>
            <span className="flex items-center gap-1">
              Less
              <span className="h-3 w-3 rounded-[3px] bg-surface-2/50" />
              <span className="h-3 w-3 rounded-[3px] bg-brass/25" />
              <span className="h-3 w-3 rounded-[3px] bg-brass/45" />
              <span className="h-3 w-3 rounded-[3px] bg-brass/70" />
              <span className="h-3 w-3 rounded-[3px] bg-brass" />
              More
            </span>
          </div>
        </Panel>
      </div>

      <Panel className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-xl">Endgame accuracy</h3>
            <p className="mt-0.5 text-xs text-mist">Where your conversion holds up, by category.</p>
          </div>
          <p className="text-xs text-mist">{attempts.length} attempts logged</p>
        </div>
        {categoryRows.length === 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line p-4">
            <p className="text-sm text-mist">
              {nothingYet ? "Your dashboard fills in as you play, drill, and analyze." : "No graded endgame attempts yet."}
            </p>
            <Button variant="quiet" className="h-9 px-3 text-xs" onClick={() => setNav("endgames")}>
              Try a drill
            </Button>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {categoryRows.map((row) => {
              const rate = row.tries ? (row.solved / row.tries) * 100 : 0;
              return (
                <div key={row.name} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{row.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-mist">
                      {row.solved}/{row.tries} · {percent(rate)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brass" style={{ width: `${Math.max(2, rate)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
