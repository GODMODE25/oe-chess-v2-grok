export type Side = "w" | "b";
export type Difficulty = "beginner" | "intermediate" | "advanced" | "expert";
export type Objective = "checkmate" | "promote" | "draw";
export type LineStatus = "new" | "learning" | "review" | "mastered";
export type Grade = "fail" | "slow" | "good" | "perfect";
export type SyncStatus =
  | "offline"
  | "signed-out"
  | "signed-in"
  | "syncing"
  | "up-to-date"
  | "conflict"
  | "error";
export type NavId = "play" | "openings" | "endgames" | "library" | "stats" | "about" | "settings";
export type BoardTheme = "walnut" | "ink" | "stone";
export type PieceSet = "standard" | "diagram" | "classic";
export type PieceGroup = "pawn" | "knight" | "bishop" | "rook" | "queen" | "mixed" | "basic";

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
};

export type Profile = {
  id: string;
  name: string;
  deviceId: string;
  createdAt: number;
  streak: number;
  bestStreak: number;
  lastSuccessDay: string | null;
  updatedAt: number;
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
  googleClientId: string;
  pieceSet?: PieceSet;
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
