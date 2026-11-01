import { Panel } from "./ui";

export function AboutView() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="lg:col-span-2">
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
    </div>
  );
}
