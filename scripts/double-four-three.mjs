import { BLACK, WHITE, analyzeMove, coordOf, indexOf, winningMoves } from '../src/renju.mjs';

// A pair of legal four-three attack points is not the forbidden double-four.
// These are threats on Black's NEXT turn, before White chooses a defense.
export function fourThreeDefenses(board) {
  if (winningMoves(board, BLACK).length || winningMoves(board, WHITE).length) return { threats: [], defenses: [] };
  const threats = [];
  for (let p = 0; p < board.length; p++) {
    if (board[p]) continue;
    const a = analyzeMove(board, p, BLACK);
    if (a.legal && a.fourThree) threats.push(p);
  }
  if (threats.length < 2) return { threats: threats.map(coordOf), defenses: [] };
  const defenses = [];
  for (let p = 0; p < board.length; p++) {
    if (board[p]) continue;
    board[p] = WHITE;
    const stops = [], replies = [], counter = winningMoves(board, WHITE);
    for (const q of threats) {
      const a = analyzeMove(board, q, BLACK);
      if (!a.legal || !a.fourThree) stops.push(coordOf(q));
      else if (!counter.some(c => c !== q)) replies.push(coordOf(q));
    }
    board[p] = 0;
    if (stops.length) defenses.push({ move: coordOf(p), stops, replies });
  }
  return { threats: threats.map(coordOf), defenses };
}

export function missingFourThreeSides(analysis, moves) {
  const covered = new Set(analysis.defenses.filter(d => moves.includes(d.move)).flatMap(d => d.stops));
  return analysis.threats.length >= 2 ? analysis.threats.filter(move => !covered.has(move)) : [];
}

export function selectOppositeDefenses(analysis, moves, limit = 9) {
  const missing = missingFourThreeSides(analysis, moves);
  if (!missing.length) return [];
  const distance = (move, target) => {
    const p = indexOf(move), q = indexOf(target);
    return Math.max(Math.abs(p % 15 - q % 15), Math.abs(Math.floor(p / 15) - Math.floor(q / 15)));
  };
  const candidates = analysis.defenses.filter(d => !moves.includes(d.move) && d.replies.length && d.stops.some(t => missing.includes(t)));
  candidates.sort((a, b) => Number(!missing.includes(a.move)) - Number(!missing.includes(b.move))
    || b.stops.length - a.stops.length
    || Math.min(...a.stops.map(t => distance(a.move, t))) - Math.min(...b.stops.map(t => distance(b.move, t)))
    || indexOf(a.move) - indexOf(b.move));
  const selected = [], uncovered = new Set(missing);
  // Reserve one direct defense for EVERY uncovered side before filling spare
  // slots with other real blocks. Never fill the menu with one side again.
  for (const d of candidates) if (d.stops.some(t => uncovered.has(t))) {
    if (moves.length + selected.length >= limit) throw new Error('No space to cover every four-three side');
    selected.push(d); d.stops.forEach(t => uncovered.delete(t));
  }
  if (uncovered.size) throw new Error('Missing a verified opposite-side finish: ' + [...uncovered].join(','));
  for (const d of candidates) if (!selected.includes(d) && moves.length + selected.length < limit) selected.push(d);
  return selected;
}
