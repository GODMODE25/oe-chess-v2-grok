import type { OpeningLine } from "../chess/types";

const at = 1700000000000;

function line(id: string, eco: string, name: string, family: string, note: string, moves: string[], popularity: number): OpeningLine {
  return { id, eco, name, family, popularity, tags: ["s-tier"], note, moves, source: "builtin", updatedAt: at };
}

/** Deeper lines for the legendary and S-tier courses. Original move orders, not a copied database. */
export const EXTRA_OPENINGS: OpeningLine[] = [
  line(
    "op-c50-italian-pianissimo",
    "C50",
    "Italian, Pianissimo",
    "Open games",
    "Hold the center with d3 and c3, castle, then choose d4 only after both knights are out.",
    ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3", "Nf6", "c3", "d6", "O-O", "a6", "Nbd2", "O-O"],
    88,
  ),
  line(
    "op-c54-italian-greco",
    "C54",
    "Italian, Greco Attack",
    "Open games",
    "c3 and d4 open the center. Meet Bb4+ with Nc3 and castle before you grab the pawn.",
    ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d4", "exd4", "cxd4", "Bb4+", "Nc3", "Nxe4", "O-O"],
    86,
  ),
  line(
    "op-c88-ruy-closed-chigorin",
    "C88",
    "Ruy Lopez, Closed Chigorin",
    "Open games",
    "After the closed setup, h3 stops Bg4. Meet Na5 by dropping the bishop to c2, then strike with d4.",
    ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O", "h3", "Na5", "Bc2", "c5", "d4"],
    96,
  ),
  line(
    "op-c67-berlin-endgame",
    "C67",
    "Berlin Defense, Endgame",
    "Open games",
    "Trade queens and accept the endgame. Black's king is uncastled, so develop with Nc3 and Be3 before rushing.",
    ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6", "O-O", "Nxe4", "d4", "Nd6", "Bxc6", "dxc6", "dxe5", "Nf5", "Qxd8+", "Kxd8"],
    90,
  ),
  line(
    "op-d58-qgd-tartakower",
    "D58",
    "QGD, Tartakower",
    "Queen's Gambit",
    "Pin the knight, castle, then meet h6 and b6 calmly. Recapture on d5 with the knight or the pawn depending on the piece layout.",
    ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O", "Nf3", "h6", "Bh4", "b6"],
    87,
  ),
  line(
    "op-d15-slav-chebanenko",
    "D15",
    "Slav, Chebanenko",
    "Queen's Gambit",
    "a6 keeps the bishop's options open. Do not take on c4 until the light-squared bishop has a square.",
    ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "a6"],
    84,
  ),
  line(
    "op-b90-najdorf-english",
    "B90",
    "Najdorf, English Attack",
    "Sicilian",
    "Be3, f3, Qd2 and castle queenside. Black's e5 and Be6 blunt the knight before White pushes g4.",
    ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6", "Be3", "e5", "Nb3", "Be6", "f3", "Be7", "Qd2", "O-O"],
    97,
  ),
  line(
    "op-b76-dragon-yugoslav-bc4",
    "B76",
    "Dragon, Yugoslav with Bc4",
    "Sicilian",
    "The bishop on c4 eyes the dragon. Meet it with Bd7 and Rc8 before you break with d5.",
    ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6", "Be3", "Bg7", "f3", "O-O", "Qd2", "Nc6", "Bc4"],
    91,
  ),
  line(
    "op-c18-winawer-poisoned",
    "C18",
    "French Winawer, Knights",
    "French",
    "After Bxc3, the c-file and the light squares are the fight. Develop the knights before you decide on Qa5 or Qc7.",
    ["e4", "e6", "d4", "d5", "Nc3", "Bb4", "e5", "c5", "a3", "Bxc3+", "bxc3", "Ne7", "Nf3", "Nbc6"],
    89,
  ),
  line(
    "op-c07-tarrasch-open",
    "C07",
    "French Tarrasch, Open",
    "French",
    "cxd4 opens the position. Develop the knight to f6 and castle before you hunt the isolated pawn.",
    ["e4", "e6", "d4", "d5", "Nd2", "c5", "exd5", "Qxd5", "Ngf3", "cxd4", "Bc4", "Qd6", "O-O", "Nf6"],
    85,
  ),
  line(
    "op-e97-kid-mar-del-plata",
    "E97",
    "King's Indian, Mar del Plata",
    "King's Indian",
    "Nc6 and Ne7 prepare f5. Do not trade on d4. The pawn storm on the kingside is the plan after f5.",
    ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O", "Be2", "e5", "O-O", "Nc6", "d5", "Ne7"],
    93,
  ),
  line(
    "op-d02-london-main",
    "D02",
    "London System, Main",
    "Queen's pawn",
    "Bishop to f4, then e3, c3 and Nbd2. Castle before you choose between c4 and a queenside expansion.",
    ["d4", "d5", "Nf3", "Nf6", "Bf4", "e6", "e3", "c5", "c3", "Nc6", "Nbd2", "Bd6"],
    86,
  ),
];
