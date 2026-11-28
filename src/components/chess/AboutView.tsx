import { Github } from "lucide-react";
import { useState } from "react";
import { cn, Panel } from "./ui";

const TABS = [
  { id: "about", label: "About" },
  { id: "training", label: "How to train" },
  { id: "technical", label: "Offline & engine" },
] as const;

type AboutTab = (typeof TABS)[number]["id"];

export function AboutView() {
  const [tab, setTab] = useState<AboutTab>("about");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-3xl">About OE Chess</h2>
        <p className="mt-1 text-sm text-mist">
          What the app is for, how to train, and how it works.
        </p>
      </div>
      <nav
        aria-label="About sections"
        className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "h-10 shrink-0 rounded-lg px-3 text-sm transition",
              tab === item.id
                ? "bg-brass text-on-accent"
                : "text-mist hover:bg-surface-2 hover:text-ivory",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "about" && (
        <div className="grid gap-4">
          <Panel>
            <h3 className="text-xl">A focused personal trainer</h3>
            <p className="mt-2 text-sm leading-6 text-mist">
              OE Chess is a personal trainer for two things: the openings you want to remember, and
              the endgames you want to be able to play. There are no puzzles, no tactics sets, no
              online opponents, and no accounts required.
            </p>
          </Panel>
          <Panel>
            <h3 className="text-xl">Openings</h3>
            <p className="mt-2 text-sm leading-6 text-mist">
              Legendary and S-tier courses sit on a shelf, three for White and three for Black. Open
              a course, pick one named variation, and play your moves. The book answers while you
              stay on the line. Leave the line and Stockfish takes the other side. Progress is saved
              on this device.
            </p>
          </Panel>
          <Panel>
            <h3 className="text-xl">Endgames</h3>
            <p className="mt-2 text-sm leading-6 text-mist">
              Each card is a position with a job: mate, promote, or hold a draw. You play the named
              side against Stockfish. Hint, takeback, and retry stay with the position. A bar at the
              top shows how many of the shipped positions you have solved.
            </p>
          </Panel>
        </div>
      )}
      {tab === "training" && (
        <Panel>
          <h3 className="text-xl">How to train</h3>
          <div className="mt-4 grid gap-4 text-sm leading-6 text-mist md:grid-cols-3">
            <p>
              <strong className="text-ivory">Openings.</strong> Put lines in a White or Black
              repertoire, then drill them. A miss or a slow answer comes back sooner. Blind drill
              hides the book move until you ask.
            </p>
            <p>
              <strong className="text-ivory">Endgames.</strong> You play the assigned side against
              Stockfish. Mate, promote, or hold, depending on the card. Hints show the engine move.
              Retry starts the same position again.
            </p>
            <p>
              <strong className="text-ivory">Offline.</strong> The board, the openings, and the
              endgames work with no network. Sign-in is only for keeping a cloud copy of your
              progress.
            </p>
          </div>
        </Panel>
      )}
      {tab === "technical" && (
        <div className="grid gap-4">
          <Panel>
            <h3 className="text-xl">Offline first</h3>
            <p className="mt-2 text-sm leading-6 text-mist">
              The board, the courses, and the endgames work with no network. Cloud sign-in is
              optional and only keeps a copy of your progress so another device can pick it up.
              Nothing is sent to an OE Chess server.
            </p>
          </Panel>
          <Panel>
            <h3 className="text-xl">The engine</h3>
            <p className="mt-2 text-sm leading-6 text-mist">
              Stockfish 19 lite runs in this browser. Move rules, including castling, en passant,
              and promotion, are checked before a move is accepted. The piece drawings and the
              opening notes are original to this app.
            </p>
          </Panel>
        </div>
      )}
      <a
        href="https://github.com/GODMODE25/oe-chess-v2-grok"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="OE Chess on GitHub"
        title="OE Chess on GitHub"
        className="mx-auto grid h-11 w-11 place-items-center rounded-lg border border-line bg-surface text-mist transition hover:border-brass hover:text-brass"
      >
        <Github className="h-5 w-5" aria-hidden="true" />
      </a>
    </div>
  );
}
