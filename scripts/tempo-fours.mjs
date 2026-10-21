import { BLACK, WHITE, analyzeMove, coordOf, indexOf, winningMoves } from '../src/renju.mjs';

// Replay the SAME recorded continuation, with no engine substitutions. This
// deliberately conservative test never equates two merely losing positions.
export function continuationVerifier(nodes) {
  const cache = new Map();
  function replay(board, id, turn = WHITE) {
    if (id < 0 || !nodes[id]) return false;
    const key = `${turn}:${id}:${board.join('')}`;
    if (cache.has(key)) return cache.get(key);
    const row = nodes[id], moves = row.filter((_, i) => i % 2 === 1);
    let valid = moves.length > 0 && (turn === WHITE || moves.length === 1);
    if (turn === WHITE) {
      if (winningMoves(board, WHITE).length) valid = false;
      const forced = winningMoves(board, BLACK);
      if (forced.length && (forced.length !== moves.length || forced.some(p => !moves.includes(p)))) valid = false;
    }
    for (let i = 1; valid && i < row.length; i += 2) {
      const p = row[i], child = row[i + 1], a = analyzeMove(board, p, turn);
      if (!a.legal || turn === WHITE && a.win) { valid = false; break; }
      board[p] = turn;
      const end = turn === BLACK && (a.win || a.fourThree);
      valid = end ? child === -1 && (a.win || !winningMoves(board, WHITE).length)
        : child >= 0 && replay(board, child, turn === BLACK ? WHITE : BLACK);
      board[p] = 0;
    }
    cache.set(key, valid);
    return valid;
  }
  return replay;
}

// Both the real position and the position with the white-four/black-block
// exchange omitted must support exactly the same remaining strategy.
export function redundantFour(board, white, reply, suffix, replay) {
  if (winningMoves(board, BLACK).length || winningMoves(board, WHITE).length) return false;
  const w = indexOf(white), b = indexOf(reply);
  if (board[w] || board[b] || w === b || analyzeMove(board, w, WHITE).win) return false;
  board[w] = WHITE;
  const threats = winningMoves(board, WHITE), a = analyzeMove(board, b, BLACK);
  if (threats.length !== 1 || threats[0] !== b || !a.legal || a.win || a.fourThree) { board[w] = 0; return false; }
  board[b] = BLACK;
  const actual = replay(board, suffix);
  board[w] = 0; board[b] = 0;
  return actual && replay(board, suffix);
}

export function follow(nodes, root, history, start = 4) {
  let id = root;
  for (const move of history.slice(start)) {
    const row = nodes[id], p = indexOf(move);
    let next;
    for (let i = 1; row && i < row.length; i += 2) if (row[i] === p) next = row[i + 1];
    if (next === undefined) return undefined;
    id = next;
  }
  return id;
}

export function boardOf(history) {
  const board = new Uint8Array(225);
  history.forEach((move, i) => { board[indexOf(move)] = i % 2 ? WHITE : BLACK; });
  return board;
}

// In the legacy free-choice VCF UI, counter-checking while failing to block an
// existing black five threat loses immediately. Compute this menu offline too.
export function ignoredCounterFours(board) {
  const blackWins = winningMoves(board, BLACK), omitted = [];
  if (!blackWins.length) return omitted;
  for (let p = 0; p < board.length; p++) {
    if (board[p] || blackWins.includes(p) || analyzeMove(board, p, WHITE).win) continue;
    board[p] = WHITE;
    if (winningMoves(board, WHITE).length) omitted.push(coordOf(p));
    board[p] = 0;
  }
  return omitted;
}

export function findRedundantFours(board, row, nodes, replay) {
  if (!row || row.length <= 3 || winningMoves(board, BLACK).length) return [];
  const found = [];
  for (let i = 1; i < row.length; i += 2) {
    const black = nodes[row[i + 1]];
    if (!black || black.length !== 3 || black[2] < 0) continue;
    const move = coordOf(row[i]), reply = coordOf(black[1]), suffix = black[2];
    if (redundantFour(board, move, reply, suffix, replay)) found.push({ move, reply, suffix });
  }
  // A white turn must still have a continuation. If every option is a tempo
  // four, keep the shortest existing example (stable candidate order on ties).
  if (found.length === (row.length - 1) / 2) {
    const keep = found.reduce((a, b) => nodes[a.suffix][0] <= nodes[b.suffix][0] ? a : b);
    return found.filter(item => item !== keep);
  }
  return found;
}
