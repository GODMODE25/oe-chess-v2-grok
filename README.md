# OE Chess

Personal opening and endgame trainer. No puzzles, tactics trainer, online play, tournaments, or chat.

The app that runs here is the full trainer: a local chessboard, a bundled Stockfish 19 engine, a shipped opening book, and 300+ endgame positions. Progress stays in the browser database and can optionally sync to your own Google Drive.

## Train

- **Play** a legal game against Stockfish. Choose a side, a clock, a strength, or a starting FEN. Undo, flip the board, step through the score, and turn on analysis.
- **Openings** browse the book by name and ECO, build a White repertoire and a Black repertoire, and drill lines with spaced repetition. Blind drill hides the book move.
- **Endgames** filter the position list and play the assigned side until you mate, promote, or hold the draw.
- **Library** keeps saved games and imports PGN.
- **Settings** exports a backup, a diagnostic log, and optional Google Drive sync.

You can use everything with no network. Google sign-in is only for sync.

## Run

```bash
npm install
npm run dev
```

The dev server listens on port 8080. `npm test` checks the rules, spaced repetition, endgame results, sync merge, and engine parsing. `node scripts/build-chess-db.mjs` rebuilds the shipped opening and endgame book.

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
4. Paste the client id into Settings. The scope requested is `drive.appdata` only.
5. Sign in, then use **Sync now** or **Restore from cloud**.

Sync is local-first. Simple fields use the newest edit. Records merge by id. A newer edit beats an older delete. Equal timestamps keep the content. Restore downloads a local backup before replacing this device.

## Tests

```bash
npm test
```

Covers rules, PGN comments, spaced repetition, endgame results, sync merge, and UCI parsing.

## Fonts

Fraunces and Outfit via Fontsource, SIL Open Font License.
