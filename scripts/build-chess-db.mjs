/**
 * Rebuild shipped opening and endgame databases.
 * Run: node scripts/build-chess-db.mjs
 *
 * Sources: original compilation of standard opening move orders (public-domain
 * theory, ECO names) and generated or hand-specified endgame positions.
 * No commercial databases and no third-party course text.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";

const NOW = 1_700_000_000_000;

const RAW = `
C20|King's Pawn Opening|Open games|70|e4,fundamentals|e4 e5 Nf3 Nc6|Open with the king's pawn, then bring the knight out before you choose a bishop home.
C50|Italian Game|Open games|94|e4,open|e4 e5 Nf3 Nc6 Bc4 Bc5|The bishop on c4 eyes f7. Develop fast and decide later whether to strike with d3 or c3 and d4.
C50|Italian Game, Quiet|Open games|80|e4,open|e4 e5 Nf3 Nc6 Bc4 Bc5 d3|A slow center keeps pieces on the board. Finish development and castle before forcing tactics.
C53|Giuoco Piano|Open games|84|e4,open|e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3|Support a later d4 with c3. Do not rush the central break until the king is safe.
C53|Giuoco Piano, Center Attack|Open games|76|e4,open|e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4|d4 opens the center. Recapture with the c-pawn and keep the dark squares under control.
C55|Two Knights Defense|Open games|86|e4,open|e4 e5 Nf3 Nc6 Bc4 Nf6|Black attacks e4 at once. White can defend quietly with d3 or try Ng5 against f7.
C57|Two Knights, Knight Attack|Open games|72|e4,tactics|e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5|Ng5 forces an immediate answer on d5. Know the tactics before you play this in a serious line.
C51|Evans Gambit|Open games|68|e4,gambit|e4 e5 Nf3 Nc6 Bc4 Bc5 b4|The pawn offer speeds development and opens the a-file. Take only if you know the follow-up.
C50|Hungarian Defense|Open games|48|e4,solid|e4 e5 Nf3 Nc6 Bc4 Be7|A restrained bishop. It is solid, but Black gives up some activity compared with Bc5.
C44|Scotch Game|Open games|82|e4,open|e4 e5 Nf3 Nc6 d4|Open the center on move three. After the trade, the d4 knight becomes the center of the fight.
C45|Scotch Game, Main Line|Open games|78|e4,open|e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5|Develop the bishop with tempo against the knight, then castle and fight the half-open e-file.
C44|Scotch Gambit|Open games|64|e4,gambit|e4 e5 Nf3 Nc6 d4 exd4 Bc4|Leave the pawn on d4 and play for piece activity. Do not grab material if your king is still in the center.
C42|Petrov Defense|Open games|74|e4,solid|e4 e5 Nf3 Nf6|Black counterattacks e4 instead of defending e5. Symmetry is only temporary.
C42|Petrov, Classical|Open games|70|e4,solid|e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4|Regain the pawn and kick the knight later with d4 or Nc3. King safety matters more than a tiny material edge.
C43|Petrov, Steinitz|Open games|60|e4,solid|e4 e5 Nf3 Nf6 d4|White strikes in the center at once. Be ready for an open position with early queen activity.
C41|Philidor Defense|Open games|55|e4,solid|e4 e5 Nf3 d6|d6 is sturdy and a little passive. Prepare a later break with c6 and d5 or f5, not a premature opening of the center.
C40|Elephant Gambit|Open games|40|e4,gambit|e4 e5 Nf3 d5|An early counterstrike. Only use it if you have checked the tactics after exd5.
C40|Latvian Gambit|Open games|42|e4,gambit|e4 e5 Nf3 f5|f5 weakens the king. Treat it as a sharp sideline, not a main repertoire choice.
C30|King's Gambit|Open games|66|e4,gambit|e4 e5 f4|White offers a pawn to open the f-file. Castle quickly or do not play the gambit.
C33|King's Gambit Accepted|Open games|62|e4,gambit|e4 e5 f4 exf4 Nf3 g5|Black holds the pawn with g5. Develop with Bc4 and keep an eye on the weakened diagonal.
C31|Falkbeer Countergambit|Open games|44|e4,gambit|e4 e5 f4 d5|A central counter instead of taking on f4. Calculate the pawn tension before you commit the king.
C21|Danish Gambit|Open games|46|e4,gambit|e4 e5 d4 exd4 c3|Two pawns for rapid development. If you decline, do it with a developing move, not a slow pawn grab.
C23|Bishop's Opening|Open games|58|e4,open|e4 e5 Bc4|The bishop comes out before the knight. It is flexible and avoids an immediate Petrov.
C24|Bishop's Opening, Berlin|Open games|56|e4,open|e4 e5 Bc4 Nf6 d3|A quiet setup. You can still transpose toward an Italian or a Vienna structure.
C25|Vienna Game|Open games|63|e4,open|e4 e5 Nc3|Nc3 supports d4 and leaves f4 available. Develop the kingside before you open the position.
C26|Vienna, Falkbeer idea|Open games|52|e4,open|e4 e5 Nc3 Nf6 Bc4 Nc6 d3|Both sides develop classically. Complete castling, then choose between f4 and a central d4.
C28|Vienna Gambit|Open games|50|e4,gambit|e4 e5 Nc3 Nf6 f4|f4 attacks the center while the knight already sits on c3. Do not fall behind in development.
C46|Three Knights Game|Open games|54|e4,open|e4 e5 Nf3 Nc6 Nc3|Flexible development. Black chooses among Bb4, Nf6, and g6.
C47|Four Knights Game|Open games|60|e4,open|e4 e5 Nf3 Nc6 Nc3 Nf6|A symmetrical starting point. The first player to find a useful pawn break usually takes the initiative.
C48|Four Knights, Spanish|Open games|58|e4,open|e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5|Bb5 pins the knight the way a Ruy Lopez does. Trade on c6 only with a clear plan for the pawn structure.
C60|Ruy Lopez|Open games|96|e4,open|e4 e5 Nf3 Nc6 Bb5|Pressure the knight that defends e5. The Spanish game rewards patient maneuvering.
C65|Berlin Defense|Open games|88|e4,endgame|e4 e5 Nf3 Nc6 Bb5 Nf6|An immediate hit on e4. Many lines trade into an endgame, so know the resulting piece activity.
C67|Berlin, Open Variation|Open games|80|e4,endgame|e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4|After Nxe4 White regains the pawn and often reaches a queenless middlegame. King activity matters.
C68|Ruy Lopez, Exchange|Open games|64|e4,structure|e4 e5 Nf3 Nc6 Bb5 a6 Bxc6|Doubled c-pawns for Black, and White keeps a kingside pawn majority. The endgame plan starts early.
C69|Exchange Ruy, Main|Open games|60|e4,structure|e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O|Castle and then decide between d4 and a slow buildup. Do not rush before the rooks are connected.
C70|Ruy Lopez, Morphy|Open games|90|e4,open|e4 e5 Nf3 Nc6 Bb5 a6 Ba4|a6 asks the bishop a question. Ba4 keeps the pressure and the option to take on c6.
C78|Ruy Lopez, Archangel|Open games|66|e4,open|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O b5 Bb3 Bb7|b5 and Bb7 fight for the center from a distance. Watch the a4-e8 diagonal.
C84|Closed Ruy Lopez|Open games|86|e4,closed|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7|The main closed Spanish. Prepare c3 and d4, and do not trade pieces without a reason.
C88|Closed Ruy, Anti-Marshall|Open games|74|e4,closed|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O d3|d3 sidesteps the Marshall pawn sacrifice. Play is slower and more maneuvering.
C89|Marshall Attack|Open games|77|e4,gambit|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5|Black sacrifices a pawn for activity. Know the main defensive setup before you allow it.
C80|Open Ruy Lopez|Open games|75|e4,open|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4|Black takes on e4 and accepts an open fight. Regain the pawn cleanly before you start an attack.
C75|Ruy Lopez, Deferred Steinitz|Open games|58|e4,solid|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6|A solid, slightly cramped defense. Break later with f5 or prepare piece trades.
B01|Scandinavian Defense|Semi-open|72|e4,semi|e4 d5|An immediate central counter. Be ready to move the queen twice and then develop quickly.
B01|Scandinavian, Modern|Semi-open|70|e4,semi|e4 d5 exd5 Qxd5 Nc3 Qa5|Qa5 is the modern home for the queen. Develop the minor pieces before you look for tactics.
B02|Alekhine Defense|Semi-open|64|e4,hypermodern|e4 Nf6|Invite White's pawns forward, then undermine them. Do not attack the pawn center too late.
B03|Alekhine, Four Pawns|Semi-open|55|e4,hypermodern|e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 f4|White grabs space. Black must chip with c5 or dxe5 before the center rolls through.
B06|Modern Defense|Pirc and Modern|60|e4,hypermodern|e4 g6 d4 Bg7|The fianchetto comes before Nf6. Strike the center with c5 or d6 and e5 once development is done.
B07|Pirc Defense|Pirc and Modern|68|e4,hypermodern|e4 d6 d4 Nf6 Nc3 g6|A flexible defensive shell. Finish Bg7 and castling before you choose c5, e5, or a queenside expansion.
B09|Pirc, Austrian Attack|Pirc and Modern|62|e4,attack|e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3|White builds a broad pawn center. Black should counter in the center rather than wait.
B10|Caro-Kann Defense|Caro-Kann|90|e4,solid|e4 c6|Support d5 with a pawn, not a piece. The resulting positions are solid and slightly slower than a Sicilian.
B12|Caro-Kann, Advance|Caro-Kann|84|e4,solid|e4 c6 d4 d5 e5|White gains space. Black undermines with c5 and develops the light-squared bishop outside the chain.
B13|Caro-Kann, Exchange|Caro-Kann|66|e4,structure|e4 c6 d4 d5 exd5 cxd5|An open, symmetrical center. Piece activity and the half-open files decide it.
B18|Caro-Kann, Classical|Caro-Kann|80|e4,solid|e4 c6 d4 d5 Nd2 dxe4 Nxe4 Bf5|The bishop develops before e6. Do not allow your light-squared bishop to be buried.
B12|Caro-Kann, Fantasy|Caro-Kann|48|e4,sideline|e4 c6 d4 d5 f3|f3 supports e4 and keeps the position sharp. Develop before you open the center.
B20|Sicilian Defense|Sicilian|97|e4,sicilian|e4 c5|Fight for the center from the flank. You accept asymmetrical pawn structure in return for counterplay.
B21|Smith-Morra Gambit|Sicilian|58|e4,gambit|e4 c5 d4 cxd4 c3|A pawn for development and open lines. Decline with a developing move if you are unsure of the tactics.
B21|Sicilian Wing Gambit|Sicilian|36|e4,gambit|e4 c5 b4|An offbeat pawn offer on the wing. Know a concrete follow-up or choose a main line instead.
B22|Sicilian Alapin|Sicilian|70|e4,sicilian|e4 c5 c3|White prepares d4 with a solid pawn. Black should occupy the center with d5 when it is sound.
B23|Closed Sicilian|Sicilian|64|e4,sicilian|e4 c5 Nc3 Nc6 g3|A slow fianchetto setup. Expand with f4 only after the king has castled.
B27|Sicilian, Hungarian|Sicilian|60|e4,sicilian|e4 c5 Nf3|The flexible knight move. Black chooses among d6, Nc6, e6, and g6.
B30|Sicilian Rossolimo|Sicilian|78|e4,sicilian|e4 c5 Nf3 Nc6 Bb5|Bb5 avoids the open Sicilian theory maze. Decide whether to take on c6 or retreat after a6.
B32|Kalashnikov Sicilian|Sicilian|62|e4,sicilian|e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 e5|e5 gains space and accepts a hole on d5. Control that square with pieces.
B33|Sveshnikov Sicilian|Sicilian|80|e4,sicilian|e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5|A sharp system built around the d5 square. Know the piece plan before you enter it.
B40|Sicilian, French Variation|Sicilian|58|e4,sicilian|e4 c5 Nf3 e6|e6 prepares d5 or a Taimanov-style setup. Do not block the dark-squared bishop forever.
B41|Sicilian Kan|Sicilian|66|e4,sicilian|e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6|a6 keeps the knight out of b5 and prepares queenside expansion. Develop before grabbing pawns.
B48|Sicilian Taimanov|Sicilian|72|e4,sicilian|e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6|Flexible piece play. Black delays d6 and keeps options on both wings.
B50|Sicilian, Knight Development|Sicilian|68|e4,sicilian|e4 c5 Nf3 d6|The door to the Najdorf, Dragon, and Classical. d6 controls e5 and prepares Nf6.
B51|Moscow Sicilian|Sicilian|64|e4,sicilian|e4 c5 Nf3 d6 Bb5+|The check asks Black to choose a piece arrangement. Know your answer before you play d6.
B56|Classical Sicilian|Sicilian|74|e4,sicilian|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6|Classical piece development. Be ready for both quiet Be2 and sharper Bg5 or f4 tries.
B70|Sicilian Dragon|Sicilian|76|e4,sicilian|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6|The dark-squared bishop becomes the main piece. Castle and then choose between central and queenside counterplay.
B72|Dragon, Yugoslav Attack|Sicilian|74|e4,attack|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3|White prepares a kingside pawn storm. Black must generate real queenside play, not just wait.
B74|Dragon, Classical|Sicilian|60|e4,sicilian|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be2|A calmer anti-Dragon. Black still castles and uses the long diagonal.
B80|Sicilian Scheveningen|Sicilian|78|e4,sicilian|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6|A compact center. Watch the timing of e5 or d5 so you do not leave a permanent weakness.
B90|Sicilian Najdorf|Sicilian|95|e4,sicilian|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6|a6 controls b5 and prepares queenside play. It is a system, not a single trick.
B92|Najdorf, Opocensky|Sicilian|70|e4,sicilian|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2|A positional Najdorf. Develop e5 or e6 with a clear plan for the d5 square.
B96|Najdorf, Gothic start|Sicilian|68|e4,sicilian|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5|Bg5 pins the knight's attention to the center. Know whether you intend e6 and Qb6 before you enter.
B97|Najdorf, Poisoned Pawn|Sicilian|63|e4,tactics|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Qb6 Qd2 Qxb2|The queen takes on b2. This is concrete tactics — do not play it from memory you do not have.
B36|Accelerated Dragon|Sicilian|73|e4,sicilian|e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6|g6 without an early d6. Watch the Maroczy bind if White plays c4.
C00|French Defense|French|88|e4,french|e4 e6|Prepare d5. Accept a light-squared bishop that needs a plan, usually b6 or a later pawn break.
C02|French, Advance|French|82|e4,french|e4 e6 d4 d5 e5|White clamps the center. Black's counterplay is c5, and often Qb6 against d4.
C02|French Advance, Paulsen|French|76|e4,french|e4 e6 d4 d5 e5 c5 c3 Nc6|Reinforce d4 with c3. Develop the kingside before you start wing attacks.
C01|French, Exchange|French|60|e4,structure|e4 e6 d4 d5 exd5 exd5|Symmetry and an open e-file. The game is decided by piece placement, not a fixed pawn structure.
C03|French, Tarrasch|French|74|e4,french|e4 e6 d4 d5 Nd2|Nd2 avoids the pin on c3. It is slightly modest and very solid.
C05|French Tarrasch, Closed|French|66|e4,french|e4 e6 d4 d5 Nd2 Nf6 c3|A quiet setup. Complete development and only then resolve the central tension.
C10|French, Rubinstein|French|64|e4,french|e4 e6 d4 d5 Nc3 dxe4|Black releases the tension early. The position is sound if you develop the light-squared bishop.
C11|French, Steinitz|French|78|e4,french|e4 e6 d4 d5 Nc3 Nf6|Pressure e4. Be ready for e5 and a closed chain where you play c5.
C15|French, Winawer|French|84|e4,french|e4 e6 d4 d5 Nc3 Bb4|Pin the knight and fight the pawn structure. Know the plans after e5 and a3.
C18|French Winawer, Main|French|80|e4,french|e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7|Doubled c-pawns against the bishop pair. Black attacks the base of the chain; White uses the space and the bishops.
D00|Blackmar-Diemer Gambit|Queen's pawn|40|d4,gambit|d4 d5 e4 dxe4 Nc3 Nf6 f3|A sharp gambit. Only play it if you enjoy concrete tactics more than a structural edge.
D00|Queen's Pawn Game|Queen's pawn|75|d4,fundamentals|d4 d5 Nf3 Nf6|A flexible queen's pawn start. You can still choose the London, Colle, or a gambit-free classical setup.
D02|London System|Queen's pawn|86|d4,system|d4 d5 Nf3 Nf6 Bf4|Develop the dark-squared bishop outside the pawn chain, then build with e3, c3, and Nbd2.
D04|Colle System|Queen's pawn|58|d4,system|d4 d5 Nf3 Nf6 e3 c5|A compact setup aimed at a later e4 break. Do not play e4 until your pieces are ready.
A45|Trompowsky Attack|Queen's pawn|62|d4,sideline|d4 Nf6 Bg5|Develop the bishop before setting a pawn structure. Be ready to give the bishop for the knight if it damages Black's pawns.
A46|Torre Attack|Queen's pawn|60|d4,system|d4 Nf6 Nf3 e6 Bg5|A cousin of the London with the bishop on g5. Keep your setup flexible against early c5.
D06|Queen's Gambit|Queen's Gambit|92|d4,gambit|d4 d5 c4|Offer the c-pawn to fight for the center. It is a gambit in name more than in practice.
D07|Chigorin Defense|Queen's Gambit|52|d4,sideline|d4 d5 c4 Nc6|Nc6 adds pressure to d4. Mind the dark squares if you later play e5.
D08|Albin Countergambit|Queen's Gambit|48|d4,gambit|d4 d5 c4 e5 dxe5 d4|A pawn sacrifice for a wedge on d4. Know the tactics, or decline the adventure.
D10|Slav Defense|Queen's Gambit|88|d4,slav|d4 d5 c4 c6|Support d5 with c6 so the light-squared bishop can come out. That is the Slav's whole idea.
D13|Slav, Exchange|Queen's Gambit|55|d4,structure|d4 d5 c4 c6 cxd5 cxd5|Early symmetry. Play for a small edge in piece activity rather than a forced attack.
D15|Slav, Main Line|Queen's Gambit|80|d4,slav|d4 d5 c4 c6 Nf3 Nf6 Nc3|The normal tabiya. Black chooses between taking on c4 and keeping the tension.
D17|Slav, Czech|Queen's Gambit|70|d4,slav|d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4|Taking on c4 starts a concrete fight. Develop the bishop to f5 or g4 before e6.
D20|Queen's Gambit Accepted|Queen's Gambit|78|d4,qga|d4 d5 c4 dxc4|Take the pawn and give it back for development if White plays accurately. Do not cling to the pawn.
D26|QGA, Classical|Queen's Gambit|74|d4,qga|d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4|The main way to regain the pawn. Castle and then look at c5 or e5 breaks.
D30|Queen's Gambit Declined|Queen's Gambit|90|d4,qgd|d4 d5 c4 e6|Solid and classical. The light-squared bishop is the piece you must solve.
D35|QGD, Exchange|Queen's Gambit|72|d4,structure|d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5|Carlsbad structure: minority attack ideas for White, piece breaks for Black.
D37|QGD, Harrwitz|Queen's Gambit|68|d4,qgd|d4 d5 c4 e6 Nc3 Nf6 Nf3 Be7|Develop calmly. The timing of c5 or the capture on c4 decides the structure.
D43|Semi-Slav|Queen's Gambit|86|d4,slav|d4 d5 c4 e6 Nc3 Nf6 Nf3 c6|A rock-solid triangle of pawns. The light-squared bishop still needs a plan.
D44|Semi-Slav, Botvinnik|Queen's Gambit|70|d4,tactics|d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 Bg5 dxc4|The sharp Botvinnik complex. Enter only when you know the tactics.
D46|Semi-Slav, Meran|Queen's Gambit|72|d4,slav|d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4|White regains the pawn and Black prepares c5 or e5. Piece activity matters more than the extra tempo.
D60|QGD, Orthodox|Queen's Gambit|76|d4,qgd|d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7|The classical defensive setup. Free the light-squared bishop with a later pawn break.
E01|Catalan Opening|Catalan|84|d4,catalan|d4 Nf6 c4 e6 g3|Combine the queen's pawn with a fianchetto. Pressure the long diagonal before you force the center.
E04|Catalan, Open|Catalan|78|d4,catalan|d4 Nf6 c4 e6 g3 d5 Bg2 dxc4|Black takes on c4. White regains it with piece pressure, not by rushing.
E06|Catalan, Closed|Catalan|76|d4,catalan|d4 Nf6 c4 e6 g3 d5 Bg2 Be7|Black keeps the pawn tension. Develop Nf3, O-O, and only then decide on Qc2 or b3.
D80|Grunfeld Defense|Indian defences|86|d4,grunfeld|d4 Nf6 c4 g6 Nc3 d5|Strike the center immediately with d5. You allow White space in return for piece pressure.
D85|Grunfeld, Exchange|Indian defences|82|d4,grunfeld|d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3|The main theoretical battleground. Black attacks the pawn center with c5 and piece pressure on the long diagonal.
D97|Grunfeld, Russian|Indian defences|64|d4,grunfeld|d4 Nf6 c4 g6 Nc3 d5 Nf3 Bg7 Qb3|White defends c4 with the queen and asks a question on d5. Develop before you resolve the tension.
E11|Bogo-Indian Defense|Indian defences|60|d4,indian|d4 Nf6 c4 e6 Nf3 Bb4+|The check interrupts White's setup. Decide in advance whether you will trade the bishop or drop it back.
E12|Queen's Indian Defense|Indian defences|82|d4,indian|d4 Nf6 c4 e6 Nf3 b6|Control e4 with a fianchetto. It is a positional defense, not a gambit.
E15|Queen's Indian, Fianchetto|Indian defences|70|d4,indian|d4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2|Both bishops fianchetto in many lines. Fight for the e4 square with pieces.
E20|Nimzo-Indian Defense|Indian defences|93|d4,indian|d4 Nf6 c4 e6 Nc3 Bb4|Pin the knight that would support e4. Doubled pawns for White are the strategic theme.
E32|Nimzo-Indian, Classical|Indian defences|78|d4,indian|d4 Nf6 c4 e6 Nc3 Bb4 Qc2|Qc2 breaks the pin and eyes the bishop. Be ready for the exchange on c3.
E41|Nimzo-Indian, Rubinstein|Indian defences|74|d4,indian|d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Nf3|A solid white setup with e3. Black chooses d5 or c5 and finishes development.
E60|King's Indian Defense|King's Indian|90|d4,kid|d4 Nf6 c4 g6|A hypermodern defense. You castle and then strike with e5 or c5.
E62|King's Indian, Fianchetto|King's Indian|72|d4,kid|d4 Nf6 c4 g6 Nf3 Bg7 g3 O-O Bg2 d6|A quieter anti-King's Indian. Black still prepares e5, but the attacks are slower.
E70|King's Indian, Normal|King's Indian|80|d4,kid|d4 Nf6 c4 g6 Nc3 Bg7 e4|White occupies the center. Black must challenge it; passive defense loses.
E76|King's Indian, Four Pawns|King's Indian|58|d4,attack|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4|Maximum space for White. Black needs a timely c5 or e5 break.
E80|King's Indian, Samisch|King's Indian|66|d4,kid|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3|f3 supports e4 and prepares Be3 and Qd2. Black looks for c5 and queenside play.
E92|King's Indian, Classical|King's Indian|84|d4,kid|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2|The classical main line. Castle, then choose e5 with a plan for the center.
E97|King's Indian, Mar del Plata|King's Indian|80|d4,kid|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6|The famous race: White attacks on the queenside, Black on the kingside. Know which pieces to trade.
A43|Old Benoni|King's Indian|52|d4,benoni|d4 c5|An immediate flank strike. Be ready for d5 and a closed, strategic fight.
A56|Benoni Defense|King's Indian|70|d4,benoni|d4 Nf6 c4 c5|Give White a pawn wedge on d5 in return for queenside play and the half-open e-file later.
A57|Benko Gambit|King's Indian|68|d4,gambit|d4 Nf6 c4 c5 d5 b5|Sacrifice a pawn for the a- and b-files. If you play it, play on those files, not in the center.
A58|Benko, Accepted|King's Indian|64|d4,gambit|d4 Nf6 c4 c5 d5 b5 cxb5 a6|The main accepted order. Develop the fianchetto and put rooks on the open files.
E10|Blumenfeld Gambit|King's Indian|46|d4,gambit|d4 Nf6 c4 e6 Nf3 c5 d5 b5|A cousin of the Benko with an e6 pawn. Concrete and easy to mishandle.
A51|Budapest Gambit|Indian defences|50|d4,gambit|d4 Nf6 c4 e5|A piece-play gambit against d4. Have a follow-up ready after dxe5.
A80|Dutch Defense|Dutch|66|d4,dutch|d4 f5|Fight for e4 with a kingside pawn. The king is a little looser, so develop accurately.
A84|Dutch, Classical|Dutch|60|d4,dutch|d4 f5 c4 Nf6 g3 e6|A Stonewall-ready structure. The light-squared bishop needs a route, often via e7 or d6.
A90|Dutch, Stonewall|Dutch|62|d4,dutch|d4 f5 c4 e6 Nf3 d5|Pawns on d5, e6, and f5. You get the e4 square as a theme and a bad bishop to solve.
A87|Dutch, Leningrad|Dutch|64|d4,dutch|d4 f5 c4 Nf6 g3 g6 Bg2 Bg7 Nf3|A King's Indian shape with f5. Control e4 and do not forget king safety.
A00|Polish Opening|Flank openings|42|flank|b4 e5 Bb2|An early wing pawn. It is playable, but have a plan against a classical center.
A01|Nimzo-Larsen Attack|Flank openings|55|flank|b3 e5 Bb2 Nc6 e3|Fianchetto the queen's bishop and wait to see the center. Do not delay development of the kingside.
A02|Bird's Opening|Flank openings|48|flank|f4 d5 Nf3|A reversed Dutch. Control e5 and watch the weakened king diagonal.
A04|Reti Opening|Flank openings|76|flank,reti|Nf3 d5 c4|Pressure d5 without committing d4. You can transpose into many queen's pawn structures.
A07|King's Indian Attack|Flank openings|70|flank,kia|Nf3 d5 g3 Nf6 Bg2 c5 O-O Nc6 d3|A system, not a forced line. Build e4 after you castle.
A10|English Opening|Flank openings|88|flank,english|c4 e5|Fight for d5 from the flank. It often becomes a reversed Sicilian.
A15|English, Anglo-Indian|Flank openings|72|flank,english|c4 Nf6 Nf3 g6|A flexible move order. You can head for a fianchetto or a queen's pawn center.
A20|English, Reversed Sicilian|Flank openings|68|flank,english|c4 e5 Nc3 Nf6|Black occupies the center the way White does in a Sicilian. Develop and then choose d3 or a later d4.
A25|English, Closed|Flank openings|64|flank,english|c4 e5 Nc3 Nc6 g3|A closed English. Fianchetto, castle, and prepare d3 or a central break.
A30|English, Symmetrical|Flank openings|70|flank,english|c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7|Symmetry does not mean a draw. The first useful pawn break, d4 or d5, matters.
A36|English, Botvinnik setup|Flank openings|66|flank,english|c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 e4|The Botvinnik pawn wedge. Control d5 and do not open the position before you are developed.
B00|Nimzowitsch Defense|Semi-open|44|e4,sideline|e4 Nc6|An unusual knight development. It is legal and tricky, but less reliable than mainstream defenses.
B00|Owen's Defense|Semi-open|40|e4,hypermodern|e4 b6 d4 Bb7|A queenside fianchetto against e4. Strike the center soon or you will be squeezed.
`.trim();

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function parseOpenings() {
  const rows = [];
  const seen = new Set();
  for (const line of RAW.split("\n")) {
    const [eco, name, family, pop, tags, moves, note] = line.split("|");
    if (!eco || !name || !moves) throw new Error(`Bad row: ${line}`);
    const chess = new Chess();
    const sans = moves.trim().split(/\s+/);
    for (const san of sans) {
      let m;
      try {
        m = chess.move(san);
      } catch (error) {
        throw new Error(`Illegal ${san} in ${name} (${eco}) after ${chess.fen()} :: ${moves} (${error.message})`);
      }
    }
    let id = `op-${eco.toLowerCase()}-${slug(name)}`;
    if (seen.has(id)) id = `${id}-2`;
    if (seen.has(id)) throw new Error(`Duplicate id ${id}`);
    seen.add(id);
    rows.push({
      id,
      eco,
      name,
      family,
      popularity: Number(pop),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      note,
      moves: sans,
      source: "builtin",
      updatedAt: NOW,
    });
  }
  if (rows.length < 80) throw new Error(`Only ${rows.length} openings`);
  return rows;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FILES = "abcdefgh";
function sq(f, r) {
  return FILES[f] + (r + 1);
}
function apart(a, b) {
  return Math.max(Math.abs(a.f - b.f), Math.abs(a.r - b.r)) > 1;
}
function touches(a, b) {
  return Math.max(Math.abs(a.f - b.f), Math.abs(a.r - b.r)) === 1;
}

function toFen(map, turn) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const piece = map[sq(f, r)];
      if (!piece) empty += 1;
      else {
        if (empty) row += empty;
        empty = 0;
        row += piece;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${turn} - - 0 1`;
}

function legalFen(fen) {
  try {
    const chess = new Chess(fen);
    return chess.isGameOver() ? null : chess;
  } catch {
    return null;
  }
}

function charOf(side, kind) {
  const lower = { k: "k", q: "q", r: "r", b: "b", n: "n", p: "p" }[kind];
  return side === "w" ? lower.toUpperCase() : lower;
}

let seq = 1;
function make(partial) {
  const id = `eg-${String(seq).padStart(4, "0")}`;
  seq += 1;
  return {
    id,
    mateIn: null,
    maxMoves: null,
    holdMoves: null,
    solution: [],
    source: "builtin",
    updatedAt: NOW,
    ...partial,
  };
}

function generateEndgames() {
  const rng = mulberry32(20260321);
  const out = [];
  const used = new Set();

  function push(pos) {
    const chess = legalFen(pos.fen);
    if (!chess) return false;
    if (used.has(pos.fen)) return false;
    used.add(pos.fen);
    out.push(pos);
    return true;
  }

  function randSq() {
    return { f: Math.floor(rng() * 8), r: Math.floor(rng() * 8) };
  }

  function uniqueSquares(n) {
    const got = [];
    const seen = new Set();
    let guard = 0;
    while (got.length < n && guard < 400) {
      guard += 1;
      const s = randSq();
      const key = `${s.f}${s.r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      got.push(s);
    }
    return got.length === n ? got : null;
  }

  function fillBasic(kind, count, meta) {
    let made = 0;
    let guard = 0;
    while (made < count && guard < count * 400) {
      guard += 1;
      const userSide = rng() < 0.82 ? "w" : "b";
      const turn = rng() < 0.75 ? userSide : userSide === "w" ? "b" : "w";
      const need = kind.length + 2;
      const squares = uniqueSquares(need);
      if (!squares) continue;
      const ak = squares[0];
      const dk = squares[1];
      if (!apart(ak, dk)) continue;
      const extras = squares.slice(2);
      if ([...kind].filter((k) => k === "b").length === 2) {
        const colors = extras.map((s) => (s.f + s.r) % 2);
        if (colors.length === 2 && colors[0] === colors[1]) continue;
      }
      let hanging = false;
      for (const s of extras) {
        if (touches(dk, s)) hanging = true;
      }
      if (hanging) continue;
      const map = {};
      map[sq(ak.f, ak.r)] = charOf(userSide, "k");
      map[sq(dk.f, dk.r)] = charOf(userSide === "w" ? "b" : "w", "k");
      kind.split("").forEach((piece, i) => {
        const s = extras[i];
        map[sq(s.f, s.r)] = charOf(userSide, piece);
      });
      const fen = toFen(map, turn);
      const ok = push(
        make({
          title: meta.title,
          fen,
          category: meta.category,
          pieceGroup: meta.pieceGroup,
          difficulty: meta.difficulty,
          userSide,
          objective: "checkmate",
          maxMoves: meta.maxMoves,
          notes: meta.notes,
        }),
      );
      if (ok) made += 1;
    }
    if (made < count) throw new Error(`Only made ${made}/${count} for ${meta.title}`);
  }

  fillBasic("q", 36, {
    title: "Queen versus king",
    category: "Basic mates",
    pieceGroup: "basic",
    difficulty: "beginner",
    maxMoves: 16,
    notes:
      "Shrink the box with the queen, bring your king up, and mate on the edge. Keep a flight square until your king is close enough to help — a lone queen stalemates easily.",
  });
  fillBasic("r", 30, {
    title: "Rook versus king",
    category: "Basic mates",
    pieceGroup: "basic",
    difficulty: "beginner",
    maxMoves: 22,
    notes:
      "Cut the king off with the rook, one rank or file at a time. Walk your own king forward and mate with the rook protected. Do not stalemate the king on the rim.",
  });
  fillBasic("bb", 18, {
    title: "Two bishops versus king",
    category: "Basic mates",
    pieceGroup: "basic",
    difficulty: "intermediate",
    maxMoves: 28,
    notes:
      "The bishops must stay on opposite colors. Drive the king to a corner of either color and mate with the king beside the enemy king. Do not let the bishops drift onto the same color.",
  });
  fillBasic("bn", 16, {
    title: "Bishop and knight versus king",
    category: "Basic mates",
    pieceGroup: "basic",
    difficulty: "advanced",
    maxMoves: 40,
    notes:
      "This mate only lives in the corner that matches the bishop's color. Drive the king there with the knight covering the escape squares. Central king moves waste the move budget.",
  });

  function winningPawn(count) {
    let made = 0;
    let guard = 0;
    while (made < count && guard < 5000) {
      guard += 1;
      const file = 2 + Math.floor(rng() * 4);
      const pr = 4 + Math.floor(rng() * 2);
      const kr = pr + 1;
      if (kr > 7) continue;
      const userSide = rng() < 0.8 ? "w" : "b";
      const ak = { f: file, r: userSide === "w" ? kr : 7 - kr };
      const pawn = { f: file, r: userSide === "w" ? pr : 7 - pr };
      let dk = null;
      for (let i = 0; i < 20; i++) {
        const tryK = randSq();
        if (apart(tryK, ak) && apart(tryK, pawn) && Math.abs(tryK.f - file) >= 3) {
          dk = tryK;
          break;
        }
      }
      if (!dk) continue;
      const map = {};
      map[sq(ak.f, ak.r)] = charOf(userSide, "k");
      map[sq(pawn.f, pawn.r)] = charOf(userSide, "p");
      map[sq(dk.f, dk.r)] = charOf(userSide === "w" ? "b" : "w", "k");
      const fen = toFen(map, userSide);
      const ok = push(
        make({
          title: "King and pawn versus king",
          fen,
          category: "Pawn endings",
          pieceGroup: "pawn",
          difficulty: pr >= 5 ? "beginner" : "intermediate",
          userSide,
          objective: "promote",
          maxMoves: 14,
          notes:
            "Put the king in front of the pawn, take the opposition, and only then push. A pawn that runs ahead of its king is often blocked or captured.",
        }),
      );
      if (ok) made += 1;
    }
    if (made < count) throw new Error(`pawns ${made}`);
  }
  winningPawn(28);

  function rookPawnDraws(count) {
    let made = 0;
    let guard = 0;
    while (made < count && guard < 8000) {
      guard += 1;
      const file = rng() < 0.5 ? 0 : 7;
      const attacker = rng() < 0.5 ? "w" : "b";
      const defender = attacker === "w" ? "b" : "w";
      const pawnRank = attacker === "w" ? 4 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);
      const promo = attacker === "w" ? 7 : 0;
      const dk = { f: file, r: promo };
      const pawn = { f: file, r: pawnRank };
      const akf = file === 0 ? 2 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 2);
      const akr = attacker === "w" ? Math.max(0, pawnRank - 1) : Math.min(7, pawnRank + 1);
      const ak = { f: akf, r: akr };
      if (!apart(ak, dk) || !apart(ak, pawn) || !apart(dk, pawn)) continue;
      const map = {};
      map[sq(ak.f, ak.r)] = charOf(attacker, "k");
      map[sq(pawn.f, pawn.r)] = charOf(attacker, "p");
      map[sq(dk.f, dk.r)] = charOf(defender, "k");
      const fen = toFen(map, attacker);
      const ok = push(
        make({
          title: "Rook-pawn draw",
          fen,
          category: "Pawn endings",
          pieceGroup: "pawn",
          difficulty: "intermediate",
          userSide: defender,
          objective: "draw",
          holdMoves: 10,
          notes:
            "Rook pawns are the drawing pawns. Stay on the promotion square, or the corner next to it, and do not step away to help a piece you do not have.",
        }),
      );
      if (ok) made += 1;
    }
    if (made < count) throw new Error(`rook pawns ${made}`);
  }
  rookPawnDraws(12);

  function pieceAndPawn(kind, count, meta) {
    let made = 0;
    let guard = 0;
    while (made < count && guard < count * 500) {
      guard += 1;
      const userSide = rng() < 0.85 ? "w" : "b";
      const file = 2 + Math.floor(rng() * 4);
      const pr = userSide === "w" ? 4 : 3;
      const squares = uniqueSquares(2);
      if (!squares) continue;
      const ak = squares[0];
      const minor = squares[1];
      const pawn = { f: file, r: pr };
      const keys = new Set([`${ak.f}${ak.r}`, `${minor.f}${minor.r}`, `${pawn.f}${pawn.r}`]);
      if (keys.size < 3) continue;
      let dk = null;
      for (let i = 0; i < 30; i++) {
        const t = randSq();
        const key = `${t.f}${t.r}`;
        if (keys.has(key)) continue;
        if (apart(t, ak) && !touches(t, minor) && !touches(t, pawn) && Math.abs(t.f - file) >= 2) {
          dk = t;
          break;
        }
      }
      if (!dk) continue;
      const map = {};
      map[sq(ak.f, ak.r)] = charOf(userSide, "k");
      map[sq(minor.f, minor.r)] = charOf(userSide, kind);
      map[sq(pawn.f, pawn.r)] = charOf(userSide, "p");
      map[sq(dk.f, dk.r)] = charOf(userSide === "w" ? "b" : "w", "k");
      const fen = toFen(map, userSide);
      const ok = push(make({ ...meta, fen, userSide, objective: "promote", maxMoves: meta.maxMoves }));
      if (ok) made += 1;
    }
    if (made < count) throw new Error(`${meta.title} ${made}`);
  }

  pieceAndPawn("r", 20, {
    title: "Rook and pawn versus king",
    category: "Rook endings",
    pieceGroup: "rook",
    difficulty: "beginner",
    maxMoves: 16,
    notes: "Cut the enemy king off with the rook, escort the pawn with your king, and promote. Do not put the rook in front of your own pawn without a reason.",
  });
  pieceAndPawn("b", 20, {
    title: "Bishop and pawn versus king",
    category: "Bishop endings",
    pieceGroup: "bishop",
    difficulty: "intermediate",
    maxMoves: 18,
    notes: "The bishop controls the squares the pawn cannot. Keep the bishop on a long diagonal and do not let the enemy king sit in front of a pawn it can blockade.",
  });
  pieceAndPawn("n", 18, {
    title: "Knight and pawn versus king",
    category: "Knight endings",
    pieceGroup: "knight",
    difficulty: "intermediate",
    maxMoves: 20,
    notes: "Knights are clumsy at losing a move. Use the king to shoulder the enemy king away, and do not park the knight where it blocks your own pawn.",
  });

  function lucena(count) {
    let made = 0;
    for (let file = 1; file <= 6 && made < count; file++) {
      for (const rookRank of [0, 1]) {
        if (made >= count) break;
        const map = {};
        map[sq(file, 6)] = "P";
        map[sq(file, 7)] = "K";
        const bkf = Math.min(7, file + 2);
        map[sq(bkf, 6)] = "k";
        const rf = file + 1 <= 7 ? file + 1 : file - 1;
        map[sq(rf, rookRank)] = "R";
        const brf = file > 3 ? 0 : 7;
        map[sq(brf, 3)] = "r";
        if (touches({ f: file, r: 7 }, { f: bkf, r: 6 })) continue;
        const fen = toFen(map, "w");
        const ok = push(
          make({
            title: "Lucena-style rook ending",
            fen,
            category: "Rook endings",
            pieceGroup: "rook",
            difficulty: "intermediate",
            userSide: "w",
            objective: "promote",
            maxMoves: 20,
            notes:
              "Your king is on the promotion square and the pawn is on the seventh, with the enemy king cut off. Build a bridge: place the rook so it shields your king from checks, then step aside and promote.",
          }),
        );
        if (ok) made += 1;
      }
    }
    if (made < 8) throw new Error(`lucena ${made}`);
  }
  lucena(12);

  function philidor(count) {
    let made = 0;
    let guard = 0;
    while (made < count && guard < 4000) {
      guard += 1;
      const file = 2 + Math.floor(rng() * 4);
      const map = {};
      map[sq(file, 4)] = "P";
      map[sq(file, 3)] = "K";
      map[sq(file, 7)] = "k";
      const rf = rng() < 0.5 ? 0 : 7;
      map[sq(rf, 5)] = "r";
      const wrf = rf === 0 ? 7 : 0;
      map[sq(wrf, 6)] = "R";
      const fen = toFen(map, rng() < 0.5 ? "w" : "b");
      const ok = push(
        make({
          title: "Third-rank rook defense",
          fen,
          category: "Rook endings",
          pieceGroup: "rook",
          difficulty: "intermediate",
          userSide: "b",
          objective: "draw",
          holdMoves: 12,
          notes:
            "Keep the king in front of the passed pawn and the rook on the rank in front of that pawn. When the pawn steps forward, swing the rook behind it and check from a distance. Trading rooks is fine only if the king and pawn ending is drawn.",
        }),
      );
      if (ok) made += 1;
    }
    if (made < count) throw new Error(`philidor ${made}`);
  }
  philidor(16);

  function queenVsRook(count) {
    let made = 0;
    let guard = 0;
    while (made < count && guard < 8000) {
      guard += 1;
      const squares = uniqueSquares(4);
      if (!squares) continue;
      const [wk, bk, wq, br] = squares;
      if (!apart(wk, bk)) continue;
      if (touches(bk, wq) || touches(wk, br)) continue;
      const map = {};
      map[sq(wk.f, wk.r)] = "K";
      map[sq(bk.f, bk.r)] = "k";
      map[sq(wq.f, wq.r)] = "Q";
      map[sq(br.f, br.r)] = "r";
      const fen = toFen(map, "w");
      const chess = legalFen(fen);
      if (!chess) continue;
      const ok = push(
        make({
          title: "Queen versus rook",
          fen,
          category: "Queen endings",
          pieceGroup: "queen",
          difficulty: "advanced",
          userSide: "w",
          objective: "checkmate",
          maxMoves: 40,
          notes:
            "Queen versus rook is a win, but the rook looks for forks and stalemate. Centralize the queen, keep your king near the action, and do not let the rook check you onto a fork.",
        }),
      );
      if (ok) made += 1;
    }
    if (made < count) throw new Error(`Q vs R ${made}`);
  }
  queenVsRook(22);

  function practical(count) {
    let made = 0;
    let guard = 0;
    while (made < count && guard < 8000) {
      guard += 1;
      const squares = uniqueSquares(6);
      if (!squares) continue;
      const [wk, bk, wr, wp, bp, extra] = squares;
      if (!apart(wk, bk)) continue;
      if (touches(bk, wr) || touches(bk, wp) || touches(wk, bp)) continue;
      if (wp.r === 0 || wp.r === 7 || bp.r === 0 || bp.r === 7) continue;
      const map = {};
      map[sq(wk.f, wk.r)] = "K";
      map[sq(bk.f, bk.r)] = "k";
      map[sq(wr.f, wr.r)] = "R";
      map[sq(wp.f, wp.r)] = "P";
      map[sq(extra.f, extra.r)] = "P";
      map[sq(bp.f, bp.r)] = "p";
      const fen = toFen(map, "w");
      const ok = push(
        make({
          title: "Convert the extra rook",
          fen,
          category: "Practical conversion",
          pieceGroup: "mixed",
          difficulty: rng() < 0.5 ? "advanced" : "expert",
          userSide: "w",
          objective: "checkmate",
          maxMoves: 45,
          notes:
            "You are a rook ahead. Trade pawns when it does not drop the rook, cut the enemy king off, and do not rush a promotion that hangs material. Checkmate is the goal.",
        }),
      );
      if (ok) made += 1;
    }
    if (made < count) throw new Error(`practical ${made}`);
  }
  practical(24);

  function queenEnding(count) {
    let made = 0;
    let guard = 0;
    while (made < count && guard < 6000) {
      guard += 1;
      const squares = uniqueSquares(5);
      if (!squares) continue;
      const [wk, bk, wq, wp, bq] = squares;
      if (!apart(wk, bk) || touches(bk, wq) || touches(wk, bq) || touches(bk, wp)) continue;
      if (wp.r === 0 || wp.r === 7) continue;
      const map = {};
      map[sq(wk.f, wk.r)] = "K";
      map[sq(bk.f, bk.r)] = "k";
      map[sq(wq.f, wq.r)] = "Q";
      map[sq(bq.f, bq.r)] = "q";
      map[sq(wp.f, wp.r)] = "P";
      const fen = toFen(map, "w");
      const ok = push(
        make({
          title: "Queen ending with an extra pawn",
          fen,
          category: "Queen endings",
          pieceGroup: "queen",
          difficulty: "expert",
          userSide: "w",
          objective: "checkmate",
          maxMoves: 50,
          notes:
            "Extra pawns in queen endings are won by inches. Keep your king sheltered from checks, centralize the queen, and push the pawn only when the check sequence has ended.",
        }),
      );
      if (ok) made += 1;
    }
    if (made < count) throw new Error(`queen end ${made}`);
  }
  queenEnding(18);

  function oppositeBishops(count) {
    let made = 0;
    let guard = 0;
    while (made < count && guard < 5000) {
      guard += 1;
      const squares = uniqueSquares(6);
      if (!squares) continue;
      const [wk, bk, wb, bb, wp, bp] = squares;
      if (!apart(wk, bk)) continue;
      if ((wb.f + wb.r) % 2 === (bb.f + bb.r) % 2) continue;
      if (touches(bk, wb) || touches(wk, bb) || touches(bk, wp) || touches(wk, bp)) continue;
      if (wp.r === 0 || wp.r === 7 || bp.r === 0 || bp.r === 7) continue;
      const map = {};
      map[sq(wk.f, wk.r)] = "K";
      map[sq(bk.f, bk.r)] = "k";
      map[sq(wb.f, wb.r)] = "B";
      map[sq(bb.f, bb.r)] = "b";
      map[sq(wp.f, wp.r)] = "P";
      map[sq(bp.f, bp.r)] = "p";
      const fen = toFen(map, "b");
      const ok = push(
        make({
          title: "Opposite-colored bishops",
          fen,
          category: "Bishop endings",
          pieceGroup: "bishop",
          difficulty: "advanced",
          userSide: "b",
          objective: "draw",
          holdMoves: 12,
          notes:
            "Opposite-colored bishops often draw a pawn down if you blockade on the color your bishop controls. Put the king on the pawn's path and do not trade into a lost pawn ending.",
        }),
      );
      if (ok) made += 1;
    }
    if (made < count) throw new Error(`opp bishops ${made}`);
  }
  oppositeBishops(16);

  const mates = [
    {
      title: "Edge queen mate",
      fen: "7k/8/6K1/8/8/8/8/7Q w - - 0 1",
      solution: ["Qh7#"],
      mateIn: 1,
      notes: "The queen mates on the edge beside the king, protected by your own king. Check the flight squares before you move.",
    },
    {
      title: "Edge rook mate",
      fen: "7k/8/6K1/8/8/8/8/R7 w - - 0 1",
      solution: ["Ra8#"],
      mateIn: 1,
      notes: "The rook mates along the eighth rank while your king covers h7 and g7. Check that the rook cannot simply be taken.",
    },
  ];
  for (const mate of mates) {
    const chess = new Chess(mate.fen);
    for (const san of mate.solution) {
      if (!chess.move(san)) throw new Error(`Bad mate move ${san} ${mate.fen}`);
    }
    if (!chess.isCheckmate()) throw new Error(`Not mate ${mate.title}`);
    push(
      make({
        title: mate.title,
        fen: mate.fen,
        category: "Basic mates",
        pieceGroup: "basic",
        difficulty: "beginner",
        userSide: "w",
        objective: "checkmate",
        mateIn: mate.mateIn,
        maxMoves: 4,
        solution: mate.solution,
        notes: mate.notes,
      }),
    );
  }

  if (out.length < 300) throw new Error(`Only ${out.length} endgames`);
  return out;
}

function toPgn(openings) {
  return openings
    .map((op) => {
      const chess = new Chess();
      chess.header("Event", op.name);
      chess.header("Site", "OE Chess");
      chess.header("Date", "2026.01.01");
      chess.header("Round", op.eco);
      chess.header("White", op.family);
      chess.header("Black", op.eco);
      chess.header("Result", "*");
      chess.header("ECO", op.eco);
      chess.header("Opening", op.name);
      chess.setComment(op.note);
      for (const san of op.moves) chess.move(san);
      return chess.pgn({ maxWidth: 78 });
    })
    .join("\n\n");
}

function toEpd(endgames) {
  return endgames
    .map((eg) => {
      const ops = [
        `id "${eg.id}"`,
        `ce 0`,
        `c0 "${eg.category.replaceAll('"', "")}"`,
        `c1 "${eg.difficulty}"`,
        `c2 "${eg.objective}"`,
        `c3 "${eg.userSide}"`,
      ];
      return `${eg.fen} ${ops.join("; ")};`;
    })
    .join("\n");
}

const openings = parseOpenings();
const endgames = generateEndgames();
mkdirSync("assets/db", { recursive: true });
mkdirSync("src/lib/data", { recursive: true });

const openingTs = `import type { OpeningLine } from "../chess/types";\n\nexport const OPENINGS: OpeningLine[] = ${JSON.stringify(openings, null, 2)};\n`;
const endgameTs = `import type { EndgamePos } from "../chess/types";\n\nexport const ENDGAMES: EndgamePos[] = ${JSON.stringify(endgames, null, 2)};\n`;
writeFileSync("src/lib/data/openings.ts", openingTs);
writeFileSync("src/lib/data/endgames.ts", endgameTs);
writeFileSync("assets/db/openings.json", JSON.stringify(openings, null, 2));
writeFileSync("assets/db/endgames.json", JSON.stringify(endgames, null, 2));
writeFileSync("assets/db/openings.pgn", toPgn(openings));
writeFileSync("assets/db/endgames.epd", toEpd(endgames) + "\n");
console.log(`openings ${openings.length}, endgames ${endgames.length}`);
