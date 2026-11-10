import { BLACK, WHITE, analyzeMove, coordOf, indexOf, standingFourThree, winningMoves } from '../src/renju.mjs';

// What Black's next move at q would decide, if anything.
export function attackKind(board, q) {
  const a = analyzeMove(board, q, BLACK);
  if (!a.legal || a.win) return null;
  if (a.fourThree) return standingFourThree(board, q, a) ? 'four-three' : null;
  if (!a.fours) return null;
  board[q] = BLACK;
  const open = winningMoves(board, BLACK).length > 1;
  board[q] = 0;
  return open ? 'open-four' : null;
}

// These are threats on Black's NEXT turn, before White chooses a defense: every
// standing four-three and every open four. One such threat is enough to need a
// direct defense, and a menu that blocks only the three still leaves the other.
export function fourThreeDefenses(board) {
  if (winningMoves(board, BLACK).length || winningMoves(board, WHITE).length) return { threats: [], defenses: [] };
  const threats = [];
  for (let p = 0; p < board.length; p++) if (!board[p] && attackKind(board, p)) threats.push(p);
  if (!threats.length) return { threats: [], defenses: [] };
  const defenses = [];
  for (let p = 0; p < board.length; p++) {
    if (board[p]) continue;
    board[p] = WHITE;
    const stops = [], replies = [], counter = winningMoves(board, WHITE);
    for (const q of threats) {
      const kind = q === p ? null : attackKind(board, q);
      if (!kind) stops.push(coordOf(q));
      else if (!counter.some(c => c !== q)) replies.push({ move: coordOf(q), kind });
    }
    board[p] = 0;
    // A finishing four-three needs no further book moves, so prefer it as the reply.
    replies.sort((a, b) => Number(a.kind !== 'four-three') - Number(b.kind !== 'four-three'));
    if (stops.length) defenses.push({ move: coordOf(p), stops, replies: replies.map(r => r.move), replyKinds: Object.fromEntries(replies.map(r => [r.move, r.kind])), four: counter.length > 0 });
  }
  return { threats: threats.map(coordOf), defenses };
}

// A threat only a White four can stop is not counted: such a four is no defense.
export function missingFourThreeSides(analysis, moves) {
  const covered = new Set(analysis.defenses.filter(d => moves.includes(d.move)).flatMap(d => d.stops));
  const blockable = new Set(analysis.defenses.filter(d => !d.four).flatMap(d => d.stops));
  return analysis.threats.filter(move => !covered.has(move) && blockable.has(move));
}

export function selectOppositeDefenses(analysis, moves, limit = 9) {
  const missing = missingFourThreeSides(analysis, moves);
  if (!missing.length) return [];
  const distance = (move, target) => {
    const p = indexOf(move), q = indexOf(target);
    return Math.max(Math.abs(p % 15 - q % 15), Math.abs(Math.floor(p / 15) - Math.floor(q / 15)));
  };
  const candidates = analysis.defenses.filter(d => !d.four && !moves.includes(d.move) && d.replies.length && d.stops.some(t => missing.includes(t)));
  candidates.sort((a, b) => Number(!missing.includes(a.move)) - Number(!missing.includes(b.move))
    || b.stops.length - a.stops.length
    || Math.min(...a.stops.map(t => distance(a.move, t))) - Math.min(...b.stops.map(t => distance(b.move, t)))
    || indexOf(a.move) - indexOf(b.move));
  const selected = [], uncovered = new Set(missing);
  // Reserve one direct defense for EVERY uncovered side before filling spare
  // slots with other real blocks. Never fill the menu with one side again.
  for (const d of candidates) if (d.stops.some(t => uncovered.has(t))) {
    if (moves.length + selected.length >= limit) break;
    selected.push(d); d.stops.forEach(t => uncovered.delete(t));
  }
  for (const d of candidates) if (!selected.includes(d) && moves.length + selected.length < limit) selected.push(d);
  return selected;
}
