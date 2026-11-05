import { Panel } from "./ui";

export function AboutView() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Panel>
        <h2 className="text-3xl">About OE Chess</h2>
        <p className="mt-3 max-w-3xl text-mist">
          OE Chess is a personal trainer for two things: the openings you want to remember, and the endgames you want to be able to play. There are no puzzles, no tactics sets, no online opponents, and no accounts required.
        </p>
      </Panel>
      <Panel>
        <h3 className="text-xl">Openings</h3>
        <p className="mt-2 text-sm text-mist">
          Legendary and S-tier courses sit on a shelf, three for White and three for Black. Open a course, pick one named variation, and play your moves. The book answers while you stay on the line. Leave the line and Stockfish takes the other side. Progress is saved on this device.
        </p>
      </Panel>
      <Panel>
        <h3 className="text-xl">Endgames</h3>
        <p className="mt-2 text-sm text-mist">
          Each card is a position with a job: mate, promote, or hold a draw. You play the named side against Stockfish. Hint, takeback, and retry stay with the position. A bar at the top shows how many of the shipped positions you have solved.
        </p>
      </Panel>
      <Panel>
        <h3 className="text-xl">Offline first</h3>
        <p className="mt-2 text-sm text-mist">
          The board, the courses, and the endgames work with no network. Google sign-in is optional and only copies your progress into your own Drive app-data folder. Nothing is sent to an OE Chess server.
        </p>
      </Panel>
      <Panel>
        <h3 className="text-xl">The engine</h3>
        <p className="mt-2 text-sm text-mist">
          Stockfish 19 lite runs in this browser. Move rules, including castling, en passant, and promotion, are checked before a move is accepted. The piece drawings and the opening notes are original to this app.
        </p>
      </Panel>
      <a
        href="https://github.com/GODMODE25/oe-chess-v2-grok"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub"
        className="flex justify-center text-mist hover:text-brass"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
        </svg>
      </a>
    </div>
  );
}
