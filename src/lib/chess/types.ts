export type Side = "w" | "b";
export type Difficulty = "beginner" | "intermediate" | "advanced" | "expert";
export type Objective = "checkmate" | "promote" | "draw";
export type LineStatus = "new" | "learning" | "review" | "mastered";
export type Grade = "fail" | "slow" | "good" | "perfect";
export type SyncStatus =
  "offline" | "signed-out" | "signed-in" | "syncing" | "up-to-date" | "conflict" | "error";
export type NavId =
  "home" | "play" | "openings" | "endgames" | "profile" | "about" | "settings";
/** `theme` leaves the squares to whichever app theme is selected. */
export type BoardTheme = "theme" | "walnut" | "ink" | "stone";
export type PieceSet = "standard" | "merida" | "alpha" | "staunty" | "maestro";
export type AppTheme = "brass" | "print" | "graphite" | "atelier" | "cyber" | "glass";

/** Picker order, and the whitelist the settings loader validates against. */
export const PIECE_SET_LABELS: Record<PieceSet, string> = {
  standard: "Standard",
  merida: "Merida",
  alpha: "Alpha",
  staunty: "Staunty",
  maestro: "Maestro",
};

/** `brass` is what `@theme` already declares, so styles.css restyles the other five. */
export const APP_THEME_LABELS: Record<AppTheme, string> = {
  brass: "Brass & Ink",
  print: "Printed Line",
  graphite: "Graphite Studio",
  atelier: "Atelier",
  cyber: "Cyber",
  glass: "Glassmorphism",
};
export type PieceGroup = "pawn" | "knight" | "bishop" | "rook" | "queen" | "mixed" | "basic";

/** Soundness band from the build-time engine pass; undefined behaves like "c". */
export type LineTier = "s" | "a" | "b" | "c" | "d" | "trash";

export type OpeningLine = {
  id: string;
  eco: string;
  name: string;
  family: string;
  popularity: number;
  tags: string[];
  note: string;
  moves: string[];
  source: "builtin" | "user";
  updatedAt: number;
  deleted?: boolean;
  tier?: LineTier;
  /** Games behind the tier; only a Lichess refresh fills this in. */
  games?: number;
  /** Owner's expected score, in percent. */
  scorePct?: number;
};

export type Review = {
  id: string;
  lineId: string;
  side: Side;
  status: LineStatus;
  ease: number;
  intervalDays: number;
  dueAt: number;
  reps: number;
  lapses: number;
  lastMs: number | null;
  updatedAt: number;
  /** Consecutive mistake-free replays; progress banks on the third. */
  perfectStreak?: number;
};

export type EndgamePos = {
  id: string;
  title: string;
  fen: string;
  category: string;
  pieceGroup: PieceGroup;
  difficulty: Difficulty;
  userSide: Side;
  objective: Objective;
  mateIn: number | null;
  maxMoves: number | null;
  holdMoves: number | null;
  notes: string;
  solution: string[];
  source: "builtin" | "user";
  updatedAt: number;
  deleted?: boolean;
};

export type EndgameAttempt = {
  id: string;
  endgameId: string;
  startedAt: number;
  finishedAt: number | null;
  success: boolean | null;
  moves: number;
  hints: number;
  timeMs: number;
  updatedAt: number;
};

export type SavedGame = {
  id: string;
  white: string;
  black: string;
  result: string;
  startFen: string;
  sans: string[];
  event: string;
  playerColor: Side | "either";
  timeControl: string;
  finished: boolean;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
  /** Strength the engine seat was capped at, so a review can anchor its rating estimate. */
  engineElo?: number | "max";
  /** The completed engine pass over this game; absent until someone reviews it. */
  review?: GameReview;
  /** Earlier passes, newest last, so Re-analyze adds a run instead of erasing one. */
  reviewRuns?: ReviewPass[];
};

/** How a move compares with the engine's choice, in win-chance points lost. */
export type MoveGrade = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export type ReviewedMove = {
  /** Eval after the move, centipawns from White's view; a mate is encoded near ±10000. */
  cp: number;
  mate: number | null;
  /** Centipawns the mover gave up, capped at 1000 so one mate does not skew the average. */
  loss: number;
  /** Win-chance points the mover gave up, before the cap; the grade and accuracy come from this. */
  lossWin: number;
  grade: MoveGrade;
  /** The engine's choice in the position before this move, UCI and SAN. */
  bestUci: string;
  bestSan: string;
  /** The engine's preferred continuation from that position, up to six plies of SAN. */
  bestLine: string;
  depth: number;
  /** The mover had exactly one legal reply: no choice to grade, so accuracy skips it. */
  forced?: boolean;
  /** Nodes and selective depth the search reached for the position before this move. */
  nodes?: number;
  seldepth?: number;
};

export type SideReview = {
  accuracy: number;
  acpl: number;
  /** A heuristic performance estimate, from this seat's accuracy against the opponent. */
  rating: number;
  /** False only in older saved reports, where an engine seat echoed its set strength. */
  estimated: boolean;
  counts: Record<MoveGrade, number>;
  /** Moves left out of accuracy and ACPL because only one reply was legal. */
  forced?: number;
};

export type GameReview = {
  depth: number;
  analyzedAt: number;
  /** Eval of the starting position, centipawns from White's view. */
  startCp: number;
  /** One entry per ply, aligned with the game's sans. */
  moves: ReviewedMove[];
  w: SideReview;
  b: SideReview;
  /** UCI identity plus the build that searched, so a report says who graded it. */
  engine?: string;
  /** Which arithmetic produced the grades; absent in reports stored before provenance. */
  formulas?: string;
  config?: { depth: number; movetimeMs: number };
};

/** A finished pass, kept without its per-move rows so re-analysis never loses the old numbers. */
export type ReviewPass = {
  analyzedAt: number;
  depth: number;
  engine?: string;
  w: SideReview;
  b: SideReview;
};

export type Profile = {
  id: string;
  name: string;
  /** Square image as a data URL, set from an uploaded avatar. */
  avatar?: string;
  deviceId: string;
  createdAt: number;
  streak: number;
  bestStreak: number;
  lastSuccessDay: string | null;
  updatedAt: number;
};

export type Seat = "you" | "stockfish";

/** The choices the app remembers: what the last setup was, which shelf was open, which filters were on. */
export type Prefs = {
  timeId?: string;
  customMinutes?: string;
  customSeconds?: string;
  playSeats?: Record<Side, Seat>;
  orientation?: "white" | "black";
  playPaneTab?: "presets" | "new" | "moves" | "analysis";
  openingsTab?: "shelf" | "explorer";
  tierFilter?: "all" | LineTier;
  family?: string;
  trainSide?: Side;
  demoSpeedMs?: number;
  endgameAddCollapsed?: boolean;
  endgameFilters?: {
    difficulty?: Difficulty | "all";
    piece?: PieceGroup | "custom" | "all";
    status?: string;
    side?: "all" | Side;
  };
};

export type Settings = {
  id: string;
  updatedAt: number;
  coordinates: boolean;
  sound: boolean;
  boardTheme: BoardTheme;
  playStrength: number | "max";
  endgameMaximum: boolean;
  playThinkMs: number;
  endgameThinkMs: number;
  analysisDepth: number;
  pieceSet?: PieceSet;
  /** Slides, capture fades and the check flash on the board. Absent means on. */
  animations?: boolean;
  appTheme?: AppTheme;
  /** An uploaded backdrop, as a JPEG data URL. Painted behind every theme when present. */
  shellArt?: string;
  /** How much of that backdrop shows through the theme's veil, 0–100. */
  shellArtStrength?: number;
  prefs?: Prefs;
};

export type Repertoire = {
  id: string;
  w: string[];
  b: string[];
  seeded: boolean;
  updatedAt: number;
  carousel?: { w: string[]; b: string[] };
};

export type FavoriteSet = { id: string; ids: string[]; updatedAt: number };
export type TagSet = { id: string; map: Record<string, string[]>; updatedAt: number };

export type SyncQueueItem = {
  id: string;
  at: number;
  kind: string;
  summary: string;
};

export type SyncState = {
  id: string;
  status: SyncStatus;
  lastSyncedAt: number | null;
  lastError: string;
  notes: string[];
  dirty: boolean;
  updatedAt: number;
};

export type SyncEnvelope = {
  version: 1;
  deviceId: string;
  exportedAt: number;
  profile: Profile;
  settings: Settings;
  games: SavedGame[];
  openings: OpeningLine[];
  reviews: Review[];
  endgames: EndgamePos[];
  attempts: EndgameAttempt[];
  repertoire: Repertoire;
  favorites: FavoriteSet;
  extraTags: TagSet;
  queue: SyncQueueItem[];
};

export type EngineInfo = {
  depth: number;
  seldepth: number;
  score: string;
  cp: number | null;
  mate: number | null;
  nodes: number;
  nps: number;
  pv: string;
  pvUci: string[];
};
