import { ArrowRight, BookOpen, Flag, Swords, type LucideIcon } from "lucide-react";
import { assetUrl } from "@/lib/chess/asset-url";
import { useOe } from "@/lib/chess/store";
import { PieceGlyph } from "./pieces";
import { Pill } from "./ui";

const MODES: Array<{
  id: "play" | "openings" | "endgames";
  title: string;
  description: string;
  action: string;
  icon: LucideIcon;
  piece: string;
  color: "w" | "b";
}> = [
  {
    id: "play",
    title: "Play",
    description: "Play Stockfish or a friend on this device, with analysis and saved games.",
    action: "Start a game",
    icon: Swords,
    piece: "n",
    color: "w",
  },
  {
    id: "openings",
    title: "Openings",
    description: "Build a White and Black repertoire, then drill the lines you save.",
    action: "Train openings",
    icon: BookOpen,
    piece: "b",
    color: "b",
  },
  {
    id: "endgames",
    title: "Endgames",
    description: "Practise checkmates, pawn promotion, and defensive holds against Stockfish.",
    action: "Train endgames",
    icon: Flag,
    piece: "q",
    color: "w",
  },
];

export function LandingView() {
  const setNav = useOe((s) => s.setNav);
  const name = useOe((s) => s.profile.name);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-2 sm:py-6">
      <section className="relative isolate overflow-hidden rounded-2xl border border-line bg-surface p-6 sm:p-9">
        <div className="pointer-events-none absolute -left-20 -top-28 h-72 w-72 rounded-full bg-brass/10 blur-3xl" aria-hidden />
        <div className="relative flex items-center justify-between gap-8">
          <div className="max-w-2xl">
            <Pill tone="brass">Welcome, {name}</Pill>
            <h1 className="mt-5 font-display text-4xl leading-[1.05] sm:text-6xl">Choose your next move.</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-mist">
              Play a game, train your openings, or master the endgame. Pick up wherever you left off.
            </p>
          </div>
          <div className="relative hidden shrink-0 lg:block" aria-hidden="true">
            <div className="absolute inset-0 rounded-full bg-brass/15 blur-2xl" />
            <img src={assetUrl("/logo-piece.svg")} alt="" className="relative h-44 w-44 drop-shadow-2xl" />
          </div>
        </div>
      </section>
      <section aria-label="Chess modes" className="grid gap-4 md:grid-cols-3">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setNav(mode.id)}
              className="group flex min-h-[18rem] flex-col rounded-2xl border border-line bg-surface p-5 text-left transition duration-200 hover:-translate-y-1 hover:border-brass focus-visible:border-brass"
            >
              <span className="flex items-start justify-between gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface-2 text-brass">
                  <Icon className="h-6 w-6" strokeWidth={1.7} aria-hidden="true" />
                </span>
                <PieceGlyph type={mode.piece} color={mode.color} className="h-16 w-16 opacity-90 transition-transform duration-200 group-hover:-translate-y-1" />
              </span>
              <span className="mt-6 font-display text-3xl">{mode.title}</span>
              <span className="mt-2 text-sm leading-6 text-mist">{mode.description}</span>
              <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-medium text-brass">
                {mode.action}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </section>
      <p className="text-center text-xs text-mist">Your progress stays on this device unless you choose to sync it.</p>
    </div>
  );
}
