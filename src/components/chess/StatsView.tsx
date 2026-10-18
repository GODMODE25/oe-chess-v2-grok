import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { allEndgames, allOpenings, useOe } from "@/lib/chess/store";
import { Panel } from "./ui";

export function StatsView() {
  const profile = useOe((s) => s.profile);
  const reviews = useOe((s) => s.reviews);
  const attempts = useOe((s) => s.attempts);
  const customOpenings = useOe((s) => s.openings);
  const customEndgames = useOe((s) => s.endgames);
  const counts = { new: 0, learning: 0, review: 0, mastered: 0 };
  for (const review of reviews) counts[review.status] += 1;
  const unseen = Math.max(0, allOpenings(customOpenings).length * 2 - reviews.length);
  const byCategory = new Map<string, { name: string; solved: number; failed: number }>();
  const endgames = allEndgames(customEndgames);
  for (const attempt of attempts) {
    if (attempt.success == null) continue;
    const pos = endgames.find((row) => row.id === attempt.endgameId);
    const name = pos?.category ?? "Other";
    const row = byCategory.get(name) ?? { name, solved: 0, failed: 0 };
    if (attempt.success) row.solved += 1;
    else row.failed += 1;
    byCategory.set(name, row);
  }
  const data = [...byCategory.values()];
  const solved = attempts.filter((row) => row.success).length;
  const failed = attempts.filter((row) => row.success === false).length;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel>
        <p className="text-sm text-mist">Streak</p>
        <p className="text-4xl tabular-nums">{profile.streak}</p>
        <p className="text-sm text-mist">Best {profile.bestStreak}</p>
      </Panel>
      <Panel>
        <p className="text-sm text-mist">Opening cards</p>
        <p className="mt-2 text-sm">New {counts.new + unseen}</p>
        <p className="text-sm">Learning {counts.learning}</p>
        <p className="text-sm">Review {counts.review}</p>
        <p className="text-sm">Mastered {counts.mastered}</p>
      </Panel>
      <Panel>
        <p className="text-sm text-mist">Endgame attempts</p>
        <p className="text-4xl tabular-nums">{solved}<span className="text-lg text-mist">/{solved + failed}</span></p>
        <p className="text-sm text-mist">solved</p>
      </Panel>
      <Panel className="lg:col-span-3">
        <h2 className="mb-3 text-xl">Endgames by category</h2>
        <div className="h-64">
          {data.length === 0 ? (
            <p className="text-sm text-mist">Solve a few positions and the chart fills in.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="name" stroke="var(--color-mist)" tick={{ fontSize: 12 }} />
                <YAxis stroke="var(--color-mist)" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="solved" fill="var(--color-brass)" />
                <Bar dataKey="failed" fill="var(--color-walnut)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>
    </div>
  );
}
