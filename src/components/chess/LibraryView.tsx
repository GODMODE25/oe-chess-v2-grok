import { useState } from "react";
import { parsePgn, splitPgnGames } from "@/lib/chess/rules";
import { useOe } from "@/lib/chess/store";
import { importOpeningsFromPgn } from "./OpeningsView";
import { Button, Panel } from "./ui";

export function LibraryView() {
  const games = useOe((s) => s.games.filter((game) => !game.deleted));
  const saveGame = useOe((s) => s.saveGame);
  const deleteGame = useOe((s) => s.deleteGame);
  const setLaunch = useOe((s) => s.setLaunch);
  const [message, setMessage] = useState("");

  async function onFile(file: File, asOpening: boolean) {
    const text = await file.text();
    if (asOpening) {
      const count = importOpeningsFromPgn(text);
      setMessage(`Imported ${count} opening line${count === 1 ? "" : "s"}.`);
      return;
    }
    let count = 0;
    for (const chunk of splitPgnGames(text)) {
      const parsed = parsePgn(chunk);
      if (!parsed.ok) continue;
      saveGame({
        id: crypto.randomUUID(),
        white: parsed.headers.White || "White",
        black: parsed.headers.Black || "Black",
        result: parsed.result,
        startFen: parsed.startFen,
        sans: parsed.sans,
        event: parsed.headers.Event || "Imported",
        playerColor: "either",
        timeControl: "imported",
        finished: parsed.result !== "*",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      count += 1;
    }
    setMessage(count ? `Imported ${count} game${count === 1 ? "" : "s"}.` : "No games found in that file.");
  }

  return (
    <div className="grid gap-4">
      <Panel>
        <h2 className="text-2xl">Library</h2>
        <p className="mt-1 text-sm text-mist">Saved games stay on this device. Import a PGN as games or as repertoire lines.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-4 text-sm">
            Import games
            <input className="sr-only" type="file" accept=".pgn,text/plain" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file, false);
            }} />
          </label>
          <label className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-4 text-sm">
            Import as openings
            <input className="sr-only" type="file" accept=".pgn,text/plain" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file, true);
            }} />
          </label>
        </div>
        {message && <p className="mt-3 text-sm text-brass-2">{message}</p>}
      </Panel>
      <div className="grid gap-2">
        {games.length === 0 && <Panel><p className="text-mist">No saved games yet. A casual game is stored as you play.</p></Panel>}
        {games
          .slice()
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((game) => (
            <Panel key={game.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg">{game.white} – {game.black}</h3>
                <p className="text-sm text-mist">{game.result} · {game.sans.length} plies · {game.timeControl} · {game.finished ? "finished" : "unfinished"}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="quiet" onClick={() => setLaunch({ startFen: game.startFen, sans: game.sans, player: game.playerColor === "b" ? "b" : "w" })}>Resume</Button>
                <Button variant="ghost" onClick={() => deleteGame(game.id)}>Delete</Button>
              </div>
            </Panel>
          ))}
      </div>
    </div>
  );
}
