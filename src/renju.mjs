// RIF 9.1–9.3. Board coordinates are A1…O15, with row 15 at the top.
export const SIZE = 15;
export const BLACK = 1;
export const WHITE = 2;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
export function indexOf(coord) {
  if (typeof coord !== 'string' || !/^[A-O](?:[1-9]|1[0-5])$/i.test(coord)) throw new Error('无效坐标');
  return (15 - Number(coord.slice(1))) * 15 + coord.toUpperCase().charCodeAt(0) - 65;
}
export function coordOf(index) {
  return String.fromCharCode(65 + index % 15) + (15 - Math.floor(index / 15));
}
export function emptyBoard() { return new Uint8Array(225); }
function at(board, x, y) { return x < 0 || x >= 15 || y < 0 || y >= 15 ? -1 : board[y * 15 + x]; }
function line(board, pos, dx, dy, color) {
  const x = pos % 15, y = Math.floor(pos / 15);
  const result = [pos];
  for (const sign of [-1, 1]) {
    for (let n = 1; at(board, x + n * dx * sign, y + n * dy * sign) === color; n++) {
      result.push((y + n * dy * sign) * 15 + x + n * dx * sign);
    }
  }
  return result;
}
function winningLine(board, pos, color, exact = color === BLACK) {
  return DIRS.map(([dx, dy]) => line(board, pos, dx, dy, color)).find(row => exact ? row.length === 5 : row.length >= 5);
}
// Deduplicate by the four stones, not by endpoints: an open four is ONE four.
function fours(board, pos, color) {
  const x = pos % 15, y = Math.floor(pos / 15), result = new Map();
  for (let d = 0; d < DIRS.length; d++) {
    const [dx, dy] = DIRS[d];
    for (let start = -4; start <= 0; start++) {
      const stones = [], blanks = [];
      for (let k = start; k < start + 5; k++) {
        const px = x + dx * k, py = y + dy * k, v = at(board, px, py);
        if (v === color) stones.push(py * 15 + px);
        else if (v === 0) blanks.push(py * 15 + px);
      }
      if (stones.length !== 4 || blanks.length !== 1) continue;
      const endpoint = blanks[0];
      board[endpoint] = color;
      const isFive = line(board, endpoint, dx, dy, color).length === 5;
      board[endpoint] = 0;
      if (color === BLACK && !isFive) continue;
      const key = stones.slice().sort((a, b) => a - b).join(',');
      if (!result.has(key)) result.set(key, { stones, endpoints: [], direction: d });
      result.get(key).endpoints.push(endpoint);
    }
  }
  return [...result.values()];
}
// A real three must extend to an open straight four through a legal move.
// Recursion is finite: each call adds a stone; no arbitrary depth cutoff is used.
function realThrees(board, pos, memo) {
  const x = pos % 15, y = Math.floor(pos / 15), result = new Map();
  for (let d = 0; d < DIRS.length; d++) {
    const [dx, dy] = DIRS[d];
    for (let k = -3; k <= 3; k++) {
      const px = x + k * dx, py = y + k * dy;
      if (!k || at(board, px, py) !== 0) continue;
      const next = py * 15 + px;
      board[next] = BLACK;
      const row = line(board, next, dx, dy, BLACK).sort((a, b) => a - b);
      let open = false;
      if (row.length === 4 && row.includes(pos)) {
        const first = row[0], last = row[3];
        const sx = Math.sign(last % 15 - first % 15), sy = Math.sign(Math.floor(last / 15) - Math.floor(first / 15));
        const ends = [[first % 15 - sx, Math.floor(first / 15) - sy], [last % 15 + sx, Math.floor(last / 15) + sy]];
        open = ends.every(([ex, ey]) => {
          if (at(board, ex, ey) !== 0) return false;
          const e = ey * 15 + ex;
          board[e] = BLACK;
          const count = line(board, e, dx, dy, BLACK).length;
          board[e] = 0;
          return count === 5;
        });
      }
      // RIF definition of a three excludes an extension that simultaneously wins.
      const alreadyFive = open && winningLine(board, next, BLACK);
      board[next] = 0;
      if (!open || alreadyFive) continue;
      const analysis = analyzeMove(board, next, BLACK, memo);
      if (analysis.forbidden) continue;
      const stones = row.filter(p => p !== next), key = stones.join(',');
      if (!result.has(key)) result.set(key, { stones, extensions: [], direction: d });
      result.get(key).extensions.push(next);
    }
  }
  return [...result.values()];
}
export function analyzeMove(board, pos, color, memo = new Map()) {
  if (!Number.isInteger(pos) || pos < 0 || pos >= 225 || board[pos]) return { legal: false, reason: 'occupied-or-outside', forbidden: false, win: false };
  const key = color === BLACK ? board.join('') + ':' + pos : null;
  if (key && memo.has(key)) return memo.get(key);
  board[pos] = color;
  const row = winningLine(board, pos, color);
  let result;
  if (row) result = { legal: true, forbidden: false, win: true, line: row, reason: 'five' };
  else if (color === WHITE) result = { legal: true, forbidden: false, win: false };
  else if (DIRS.some(([dx, dy]) => line(board, pos, dx, dy, color).length > 5)) result = { legal: false, forbidden: true, win: false, reason: 'overline' };
  else {
    const four = fours(board, pos, BLACK);
    if (four.length > 1) result = { legal: false, forbidden: true, win: false, reason: 'double-four', patterns: four };
    else {
      const three = realThrees(board, pos, memo);
      result = three.length > 1 ? { legal: false, forbidden: true, win: false, reason: 'double-three', patterns: three } : { legal: true, forbidden: false, win: false, fours: four.length, threes: three.length };
    }
  }
  board[pos] = 0;
  if (key) memo.set(key, result);
  return result;
}
export function playHistory(history) {
  if (!Array.isArray(history) || history.length > 225) throw new Error('无效棋谱');
  const board = emptyBoard();
  let outcome = null;
  for (let i = 0; i < history.length; i++) {
    if (outcome) throw new Error('对局结束后不能继续落子');
    const p = indexOf(history[i]), color = i % 2 ? WHITE : BLACK;
    const analysis = analyzeMove(board, p, color);
    if (!analysis.legal) throw new Error(`第 ${i + 1} 手 ${history[i]} 非法：${analysis.reason}`);
    board[p] = color;
    if (analysis.win) outcome = { winner: color, line: analysis.line };
  }
  return { board, outcome };
}
export function nearbyMoves(board, distance = 2) {
  const result = new Set();
  for (let p = 0; p < 225; p++) if (board[p]) {
    const x = p % 15, y = Math.floor(p / 15);
    for (let dx = -distance; dx <= distance; dx++) for (let dy = -distance; dy <= distance; dy++) {
      if (at(board, x + dx, y + dy) === 0) result.add((y + dy) * 15 + x + dx);
    }
  }
  return [...result].sort((a, b) => a - b);
}
export function winningMoves(board, color) {
  return nearbyMoves(board, 1).filter(p => {
    board[p] = color;
    const win = Boolean(winningLine(board, p, color));
    board[p] = 0;
    return win;
  });
}
export const forbiddenNames = { 'overline': '长连', 'double-four': '四四', 'double-three': '三三' };
