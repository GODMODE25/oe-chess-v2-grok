# OE Chess architecture

## Why this shape

A native Windows shell (Tauri, Rust, a Stockfish process, SQLite, an NSIS installer) is the right packaging for a desktop-only build. This delivery runs in the browser, which is the environment the trainer actually opens in. The modules match the desktop design, with these substitutions:

| Desktop plan | This build |
| --- | --- |
| Tauri + React | TanStack Start + React |
| Rust rules | `chess.js`, tested directly |
| SQLite file | IndexedDB with the same entities, plus `assets/db/schema.sql` |
| Stockfish process | Stockfish 19 lite WASM in a web worker |
| Google Drive | Same protocol, browser OAuth token, Drive `appDataFolder` |

## Modules

- **Board** (`src/components/chess/Board.tsx`): click and drag, promotion, coordinates, last-move and check marks, engine arrows.
- **Play**: side, clock or unlimited, strength, FEN, PGN export, undo, analysis. Games autosave.
- **Openings**: shipped book plus custom lines, explorer tree, repertoire membership, spaced repetition, blind drill, hints, “play from here”.
- **Endgames**: filters, random and weak queues, Stockfish defense, hints, takeback, retry, completion rules.
- **Library / stats / settings**: PGN import, charts, backup, diagnostics, sync status.
- **Engine** (`src/lib/chess/engine.ts`): one worker, one search at a time, UCI strength via `UCI_LimitStrength` / `UCI_Elo` or uncapped.
- **Local database** (`src/lib/chess/db.ts`): versioned IndexedDB. Before a future upgrade it writes `localStorage` key `oe-chess-premigration-<version>`.

## Schema

IndexedDB stores: `profile`, `settings`, `games`, `openings`, `opening_reviews`, `endgames`, `endgame_attempts`, `sync_state`, `sync_queue`, `favorites`, `tags`, `repertoire`.

Shipped content is code, not rows. User rows carry `updatedAt` and, where deletion exists, a `deleted` tombstone.

## Sync protocol

Envelope version 1 is JSON: profile, settings, custom openings, reviews, custom endgames, attempts, games, repertoire, favorites, tags, and the change queue.

1. Every edit writes locally and appends a queue item.
2. **Sync now** downloads `oe-chess-sync.json` from Drive app data if it exists, merges, uploads the merge, then saves the merge locally.
3. Simple objects (settings, profile, repertoire, favorites, tags) use the newer `updatedAt`.
4. Lists merge by `id`. The newer row wins. On a tie, a non-deleted row beats a tombstone.
5. Rows that exist on only one side are kept. User-created content is not dropped because the other side has not seen it.
6. **Restore from cloud** downloads a local backup file first, then replaces this device’s rows with the cloud envelope. The local device id is kept.
7. Status values: Offline, Signed out, Signed in, Syncing, Up to date, Conflict, Error. Conflict means the merge had to choose; the notes list what was kept.

The access token stays in memory. It is not written to the database or the backup.

## Endgame results

- `checkmate`: the user must mate. Stalemate, repetition, fifty moves, or running out of moves is a failure.
- `promote`: promotion solves it, and so does checkmate.
- `draw`: a formal draw solves it, and so does surviving `holdMoves` of the user’s own moves. Getting mated fails.

## Spaced repetition

Fail resets the line to learning and schedules it minutes later. Slow, good, and perfect stretch the interval. Mastered requires several clean reps, a two-week interval, and a stable ease.
