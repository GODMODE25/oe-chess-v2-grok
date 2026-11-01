# OE Chess

Personal opening and endgame trainer. No puzzles, tactics trainer, online play, tournaments, or chat.

The app that runs here is the full trainer: a local chessboard, a bundled Stockfish 19 engine, a shipped opening book, and 300+ endgame positions. Progress stays in the browser database and can optionally sync to your own Google Drive.

## Train

- **Play** against Stockfish, another person, or watch the engine play itself. Each side is Human or Computer. Choosing Computer does not start the clock. Press Start, Play White, or Play Black. Pause freezes the clock and the engine. Stop and New game both reset the clock and the board. Drag your piece on the opponent's turn to set a premove. If you are Black, the board turns around.
- **Openings** open on a shelf of three White courses and three Black courses (Legendary and S-tier). Add or remove courses, or add any line from the full book. Explorer lists every shipped line. Train one named variation at a time. Undo takes back the last move. Retry starts the variation over. The book replies on the line; Stockfish answers if you leave it. Progress bars track each variation and the course.
- **Endgames** use dropdowns for category, difficulty, pieces, side, and progress. Every shipped position is listed. Each side can be Human or Computer, and premoved. A prompt appears when you solve or fail, with Next or Back to the menu.
- **Library** keeps saved games and imports PGN.
- **About** explains what the trainer does and what it leaves out.
- **Settings** chooses a board color and a piece set (Classic photos or Diagram silhouettes), exports a backup, and optionally syncs to Google Drive.

You can use everything with no network. Google sign-in is only for sync.

## Run

```bash
npm install
npm run dev
```

The dev server listens on port 8080. `npm test` checks the rules, spaced repetition, endgame results, sync merge, and engine parsing. `node scripts/build-chess-db.mjs` rebuilds the shipped opening and endgame book.

## Pieces

The default set is the flat Cburnett set used on lichess.org. The files are in `public/pieces/standard/` and the license is in `public/pieces/standard/LICENSE.txt` (Colin M.L. Burnett, GPL-2.0-or-later). More free sets from the same project are at [lichess-org/lila public/piece](https://github.com/lichess-org/lila/tree/master/public/piece). Diagram and Classic stay available in Settings.

## Data

Regenerate the shipped book:

```bash
node scripts/build-chess-db.mjs
```

Outputs:

- `src/lib/data/openings.ts` and `src/lib/data/endgames.ts` (bundled into the app)
- `assets/db/openings.json`, `assets/db/endgames.json`, `assets/db/openings.pgn`, `assets/db/endgames.epd`
- `assets/db/schema.sql` documents the same entities for a SQLite build

Opening move orders are an original compilation of standard public-domain theory. Endgame positions are generated or hand-specified standard endings. No commercial database and no course text from another trainer is included.

## Engine

Stockfish 19 lite, single-threaded WebAssembly, from the `stockfish` npm package (Nathan Rugg’s stockfish.js). License: GPL-3.0. The license text ships at `public/engines/STOCKFISH-COPYING.txt`. The app runs the engine in a worker so the board stays responsive.

`chess.js` (BSD-2-Clause) checks legal moves in the interface, including castling, en passant, promotion, stalemate, insufficient material, threefold repetition, and the fifty-move rule.

Syzygy tablebases are not bundled. `probeTablebase` in `src/lib/chess/endgame-result.ts` returns null until tablebase files are added.

## Google Drive

1. In Google Cloud, create an OAuth client of type **Web application**.
2. Add this site’s origin as an authorized JavaScript origin.
3. Enable the Drive API.
4. The client id for this personal install is already filled in Settings. Change it if you use a different Google Cloud project. The scope requested is `drive.appdata` only.
5. Sign in, then use **Sync now** or **Restore from cloud**.

Sync is local-first. Simple fields use the newest edit. Records merge by id. A newer edit beats an older delete. Equal timestamps keep the content. Restore downloads a local backup before replacing this device.

## Tests

```bash
npm test
```

Covers rules, PGN comments, spaced repetition, endgame results, sync merge, and UCI parsing.

## Fonts

Fraunces and Outfit via Fontsource, SIL Open Font License.
