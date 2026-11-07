import { EXTRA_OPENINGS } from "../data/extra-openings";
import { OPENINGS } from "../data/openings";
import { COURSE_VARIATION_IDS, GENERATED_VARIATIONS } from "../data/course-extras";
import { OPENING_META } from "../data/openings-meta";
import type { LineTier, OpeningLine, Review, Side } from "./types";

export const TIER_LABEL: Record<LineTier, string> = { s: "S", a: "A", b: "B", c: "C", d: "D", trash: "Trash" };

export const TIER_RANK: Record<LineTier, number> = { s: 0, a: 1, b: 2, c: 3, d: 4, trash: 5 };

function withMeta(line: OpeningLine): OpeningLine {
  const meta = OPENING_META[line.id];
  if (!meta || line.tier) return line;
  return { ...line, tier: meta.tier, games: meta.games, scorePct: meta.scorePct };
}

export type CourseTier = "legendary" | "s";

export type Course = {
  id: string;
  name: string;
  side: Side;
  tier: CourseTier;
  blurb: string;
  variationNames: string[];
};

export const DEFAULT_CAROUSEL: Record<Side, string[]> = {
  w: ["white-italian", "white-ruy", "white-qg"],
  b: ["black-sicilian", "black-french", "black-kid"],
};

export const COURSES: Course[] = [
  {
    id: "white-italian",
    name: "Italian Game",
    side: "w",
    tier: "legendary",
    blurb: "Bc4 against e5. Learn the quiet setup, the Greco center, and the Evans pawn.",
    variationNames: ["Italian Game", "Italian Game, Quiet", "Italian, Pianissimo", "Giuoco Piano", "Giuoco Piano, Center Attack", "Italian, Greco Attack", "Evans Gambit", "Two Knights Defense", "Two Knights, Knight Attack", "Hungarian Defense"],
  },
  {
    id: "white-ruy",
    name: "Ruy Lopez",
    side: "w",
    tier: "legendary",
    blurb: "The Spanish bishop. Closed Chigorin, Berlin endgame, and the exchange.",
    variationNames: ["Ruy Lopez", "Ruy Lopez, Morphy", "Ruy Lopez, Closed Chigorin", "Closed Ruy Lopez", "Closed Ruy, Anti-Marshall", "Berlin Defense, Endgame", "Berlin Defense", "Berlin, Open Variation", "Ruy Lopez, Exchange", "Exchange Ruy, Main", "Ruy Lopez, Archangel", "Open Ruy Lopez", "Ruy Lopez, Deferred Steinitz", "Marshall Attack"],
  },
  {
    id: "white-qg",
    name: "Queen's Gambit",
    side: "w",
    tier: "s",
    blurb: "d4 and c4. Tartakower, the Orthodox, the Slav, and the accepted gambit.",
    variationNames: ["Queen's Gambit", "QGD, Tartakower", "Queen's Gambit Declined", "QGD, Orthodox", "QGD, Exchange", "QGD, Harrwitz", "Slav Defense", "Slav, Chebanenko", "Slav, Main Line", "Slav, Exchange", "Slav, Czech", "Semi-Slav", "Semi-Slav, Meran", "Semi-Slav, Botvinnik", "Queen's Gambit Accepted", "QGA, Classical"],
  },
  {
    id: "white-london",
    name: "London System",
    side: "w",
    tier: "s",
    blurb: "A compact white setup. Bishop out, then a small center.",
    variationNames: ["London System", "London System, Main", "Colle System", "Torre Attack"],
  },
  {
    id: "white-english",
    name: "English Opening",
    side: "w",
    tier: "s",
    blurb: "c4 first. Reversed Sicilian, symmetrical, and the Botvinnik setup.",
    variationNames: ["English Opening", "English, Reversed Sicilian", "English, Symmetrical", "English, Botvinnik setup", "English, Closed"],
  },
  {
    id: "black-sicilian",
    name: "Sicilian Defense",
    side: "b",
    tier: "legendary",
    blurb: "c5 against e4. Najdorf, Dragon, Scheveningen, and the Sveshnikov.",
    variationNames: ["Sicilian Defense", "Sicilian Najdorf", "Najdorf, English Attack", "Najdorf, Poisoned Pawn", "Najdorf, Opocensky", "Sicilian Dragon", "Dragon, Yugoslav with Bc4", "Dragon, Yugoslav Attack", "Dragon, Classical", "Accelerated Dragon", "Sicilian Scheveningen", "Sveshnikov Sicilian", "Kalashnikov Sicilian", "Classical Sicilian", "Sicilian Kan", "Sicilian Taimanov"],
  },
  {
    id: "black-french",
    name: "French Defense",
    side: "b",
    tier: "s",
    blurb: "e6 and d5. Winawer, Tarrasch, and the Advance.",
    variationNames: ["French Defense", "French Winawer, Knights", "French, Winawer", "French Winawer, Main", "French Tarrasch, Open", "French, Tarrasch", "French, Advance", "French Advance, Paulsen", "French, Exchange", "French, Rubinstein", "French, Steinitz"],
  },
  {
    id: "black-kid",
    name: "King's Indian",
    side: "b",
    tier: "s",
    blurb: "Fianchetto the king bishop and break with e5 or f5.",
    variationNames: ["King's Indian Defense", "King's Indian, Mar del Plata", "King's Indian, Classical", "King's Indian, Samisch", "King's Indian, Fianchetto", "King's Indian, Normal", "King's Indian, Four Pawns"],
  },
  {
    id: "black-caro",
    name: "Caro-Kann",
    side: "b",
    tier: "s",
    blurb: "c6 and d5. A solid black answer to e4.",
    variationNames: ["Caro-Kann Defense", "Caro-Kann, Classical", "Caro-Kann, Advance", "Caro-Kann, Exchange", "Caro-Kann, Fantasy"],
  },
  {
    id: "black-nimzo",
    name: "Nimzo-Indian",
    side: "b",
    tier: "s",
    blurb: "Bb4 against Nc3. Pin the knight and fight for e4.",
    variationNames: ["Nimzo-Indian Defense", "Nimzo-Indian, Classical", "Nimzo-Indian, Rubinstein", "Queen's Indian Defense"],
  },
];

export function catalogLines(): OpeningLine[] {
  return [...EXTRA_OPENINGS, ...GENERATED_VARIATIONS, ...OPENINGS].map(withMeta);
}

export function courseById(id: string): Course | undefined {
  return COURSES.find((course) => course.id === id);
}

export function variationsFor(course: Course): OpeningLine[] {
  const lines = catalogLines();
  const named = course.variationNames
    .map((name) => lines.find((line) => line.name === name))
    .filter((line): line is OpeningLine => Boolean(line));
  const ids = COURSE_VARIATION_IDS[course.id];
  if (!ids?.length) return named;
  // Generated variations join by id, so a renamed line no longer silently drops a branch.
  const seen = new Set(named.map((line) => line.id));
  const extra = lines.filter((line) => ids.includes(line.id) && !seen.has(line.id));
  return [...named, ...extra];
}

export function reviewProgress(review: Review | undefined): number {
  if (!review || review.reps === 0) return 0;
  if (review.status === "mastered") return 100;
  if (review.status === "review") return 72;
  return Math.min(58, 18 + review.reps * 12);
}
