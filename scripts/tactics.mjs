// Offline only. Runtime replies are read from the generated book, never searched.
import { BLACK, WHITE, analyzeMove, nearbyMoves, winningMoves } from '../src/renju.mjs';
export function vcf(board, depth = 7, budget = 2500) {
  let visited = 0;
  const cache = new Map();
  function search(left) {
    if (++visited > budget) return null;
    const wins = winningMoves(board, BLACK);
    if (wins.length) return { move: wins[0], win: true };
    if (left === 0) return null;
    const key = board.join('') + ':' + left;
    if (cache.has(key)) return cache.get(key);
    const danger = winningMoves(board, WHITE);
    if (danger.length > 1) return null;
    const candidates = danger.length ? danger : nearbyMoves(board, 2);
    for (const p of candidates) {
      if (board[p]) continue;
      board[p] = BLACK;
      const threats = winningMoves(board, BLACK);
      const counter = threats.length ? winningMoves(board, WHITE) : [];
      board[p] = 0;
      if (!threats.length || counter.length || !analyzeMove(board, p, BLACK).legal) continue;
      if (threats.length > 1) {
        const result = { move: p, threats };
        cache.set(key, result); return result;
      }
      const defend = threats[0];
      board[p] = BLACK; board[defend] = WHITE;
      const next = search(left - 1);
      board[defend] = 0; board[p] = 0;
      if (next) {
        const result = { move: p, threats, next };
        cache.set(key, result); return result;
      }
    }
    cache.set(key, null); return null;
  }
  for (let left = 1; left <= depth; left++) {
    const result = search(left);
    if (result) return result;
    if (visited > budget) break;
  }
  return null;
}
