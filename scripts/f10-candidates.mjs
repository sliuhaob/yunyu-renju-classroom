// Offline selection policy. Exact tactical screens precede engine ranking.
export const MENU_POLICY = 'All forced defenses; all one-move-loss escape points when at most nine; otherwise nine-PV engine screening with a 220-score / six-ply mate band, preserving prior viable choices. Terminal examples when no escape exists. A non-forced white four is dropped before any of this when its forced block ends the game, gives Black a VCF he lacked, or leaves every White reply losing to VCF.';
import { BLACK, WHITE, analyzeMove, coordOf, nearbyMoves, standingFourThree, winningMoves } from '../src/renju.mjs';
import { pointlessFour } from './vcf-engine.mjs';

export function immediateFinish(board) {
  for (const p of nearbyMoves(board, 2)) {
    const a = analyzeMove(board, p, BLACK);
    if (!a.legal) continue;
    if (a.win) return { move: coordOf(p), reason: 'five' };
    if (standingFourThree(board, p, a)) return { move: coordOf(p), reason: 'four-three' };
  }
  return null;
}

// Test every empty intersection, including distant counter-attacks. A legal
// black four-three/open four only counts if white cannot win immediately, and a
// four-three only counts if White's forced block does not itself make a four.
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
      if (standingFourThree(board, q, a)) { reason = 'four-three'; break; }
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

// Split moves into those worth offering and those that fail pointlessFour. Fours
// must go before survivors are counted, or they fill the nine slots and set the
// engine's evaluation band. `keep` is for moves the book owner asked for by name.
export function usableMoves(board, moves, { keep = [], omitted = [] } = {}) {
  const usable = [], dropped = {};
  for (const move of moves) {
    if (keep.includes(move)) { usable.push(move); continue; }
    if (omitted.includes(move)) continue;
    const reason = pointlessFour(board, move);
    if (reason) dropped[move] = reason; else usable.push(move);
  }
  return { usable, dropped };
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
