// Offline selection policy. Exact tactical screens precede engine ranking.
import { BLACK, WHITE, analyzeMove, coordOf, nearbyMoves, winningMoves } from '../src/renju.mjs';

export function immediateFinish(board) {
  const danger = winningMoves(board, WHITE);
  for (const p of nearbyMoves(board, 2)) {
    const a = analyzeMove(board, p, BLACK);
    if (!a.legal) continue;
    if (a.win) return { move: coordOf(p), reason: 'five' };
    if (a.fourThree && !danger.some(q => q !== p)) return { move: coordOf(p), reason: 'four-three' };
  }
  return null;
}

// Test every empty intersection, including distant counter-attacks. A legal
// black four-three/open four only counts if white cannot win immediately.
export function screenWhite(board) {
  const whiteWins = winningMoves(board, WHITE).map(coordOf);
  if (whiteWins.length) throw new Error('White has an immediate win: ' + whiteWins.join(' '));
  const forced = winningMoves(board, BLACK).map(coordOf);
  if (forced.length) return { mode: 'forced', candidates: forced, checked: 225 - board.filter(Boolean).length };
  const blackPoints = nearbyMoves(board, 2), survivors = [], rejected = {};
  for (let p = 0; p < 225; p++) {
    if (board[p]) continue;
    board[p] = WHITE;
    let reason = null;
    const counter = winningMoves(board, WHITE);
    for (const q of blackPoints) {
      if (board[q]) continue;
      const a = analyzeMove(board, q, BLACK);
      if (!a.legal) continue;
      if (a.win) { reason = 'five'; break; }
      if (counter.some(c => c !== q)) continue;
      if (a.fourThree) { reason = 'four-three'; break; }
      if (a.fours) {
        board[q] = BLACK;
        const open = winningMoves(board, BLACK).length > 1;
        board[q] = 0;
        if (open) { reason = 'open-four'; break; }
      }
    }
    board[p] = 0;
    if (reason) rejected[coordOf(p)] = reason;
    else survivors.push(coordOf(p));
  }
  return { mode: survivors.length ? 'defense' : 'unavoidable', candidates: survivors, checked: survivors.length + Object.keys(rejected).length, rejected };
}

export function rankedDefenses(screen, proposal, existing = []) {
  if (screen.mode === 'forced') return screen.candidates;
  const ranked = [...new Set([proposal.move, ...proposal.candidates.map(c => c.move), ...existing])].filter(Boolean);
  if (screen.mode === 'unavoidable') return [...new Set([...existing, ...ranked])].slice(0, 3);
  if (screen.candidates.length <= 9) return [...new Set([...existing.filter(c => screen.candidates.includes(c)), ...screen.candidates])];
  // Quiet positions have many harmless distant moves. Retain every engine
  // candidate within 220 evaluation units of its best numeric score; when all
  // candidates lose by force, retain lines within six plies of the longest mate.
  const scores = proposal.candidates.map(c => ({ ...c, numeric: /^-?\d+$/.test(c.eval) ? Number(c.eval) : null, mate: /^-M(\d+)$/.exec(c.eval)?.[1] })).filter(c => screen.candidates.includes(c.move));
  const numeric = scores.filter(c => c.numeric !== null);
  const best = Math.max(...numeric.map(c => c.numeric));
  const longest = Math.max(...scores.map(c => Number(c.mate) || 0));
  const selected = scores.filter(c => /^\+?M\d+$/.test(c.eval) || (numeric.length ? c.numeric !== null && c.numeric >= best - 220 : !c.mate || Number(c.mate) >= longest - 6)).map(c => c.move);
  return [...new Set([...existing.filter(c => screen.candidates.includes(c)), proposal.move, ...selected])].filter(c => screen.candidates.includes(c)).slice(0, 9);
}
