// Offline only. Exhaustive VCF search and per-point defence analysis, fast enough
// to run on every White position. Rule primitives mirror src/renju.mjs exactly;
// tests/vcf-engine.test.mjs compares the two.
import { coordOf, indexOf, fourThreeStands } from '../src/renju.mjs';

export const BLACK = 1, WHITE = 2;
const SEARCH_LIMIT = 200000, MAX_COUNTER_DEPTH = 6, WORK_LIMIT = 3000000;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const windows = [], beforeWindow = [], afterWindow = [];
for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) for (const [dx, dy] of DIRS) {
  const ex = x + 4 * dx, ey = y + 4 * dy;
  if (ex < 0 || ex > 14 || ey < 0 || ey > 14) continue;
  const cells = [];
  for (let k = 0; k < 5; k++) cells.push((y + k * dy) * 15 + x + k * dx);
  windows.push(cells);
  const bx = x - dx, by = y - dy, ax = ex + dx, ay = ey + dy;
  beforeWindow.push(bx >= 0 && bx < 15 && by >= 0 && by < 15 ? by * 15 + bx : -1);
  afterWindow.push(ax >= 0 && ax < 15 && ay >= 0 && ay < 15 ? ay * 15 + ax : -1);
}
const WINDOWS = windows.length;
const windowCell = new Int16Array(WINDOWS * 5);
windows.forEach((cells, w) => cells.forEach((p, i) => { windowCell[w * 5 + i] = p; }));
const before = Int16Array.from(beforeWindow), after = Int16Array.from(afterWindow);
const cellWindows = Array.from({ length: 225 }, () => []);
windows.forEach((cells, w) => cells.forEach(p => cellWindows[p].push(w)));
const windowsOf = cellWindows.map(list => Int16Array.from(list));
let seed = 0x9E3779B9;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
const Z1 = Array.from({ length: 3 }, () => Uint32Array.from({ length: 225 }, random));
const Z2 = Array.from({ length: 3 }, () => Uint32Array.from({ length: 225 }, random));

export class Pos {
  constructor() {
    this.board = new Uint8Array(225); this.nb = new Uint8Array(WINDOWS); this.nw = new Uint8Array(WINDOWS);
    this.h1 = 0; this.h2 = 0; this.mark = new Int32Array(225); this.stamp = 0;
    this.bufs = Array.from({ length: 256 }, () => new Int16Array(120));
    this.nodes = 0; this.limit = 1e9; this.over = false; this.tt = new Map(); this.pv = []; this.maxPly = Infinity;
  }
  key() { return this.h1 * 2097152 + (this.h2 >>> 11); }
  place(p, c) {
    this.board[p] = c;
    const counts = c === BLACK ? this.nb : this.nw, list = windowsOf[p];
    for (let i = 0; i < list.length; i++) counts[list[i]]++;
    this.h1 = (this.h1 ^ Z1[c][p]) >>> 0; this.h2 = (this.h2 ^ Z2[c][p]) >>> 0;
  }
  remove(p, c) {
    this.board[p] = 0;
    const counts = c === BLACK ? this.nb : this.nw, list = windowsOf[p];
    for (let i = 0; i < list.length; i++) counts[list[i]]--;
    this.h1 = (this.h1 ^ Z1[c][p]) >>> 0; this.h2 = (this.h2 ^ Z2[c][p]) >>> 0;
  }
  load(board) { for (let p = 0; p < 225; p++) if (board[p]) this.place(p, board[p]); return this; }
  fivesBlack(out) {
    const { nb, nw, board, mark } = this, stamp = ++this.stamp; let n = 0;
    for (let w = 0; w < WINDOWS; w++) if (nb[w] === 4 && nw[w] === 0) {
      const b = before[w], a = after[w];
      if ((b >= 0 && board[b] === BLACK) || (a >= 0 && board[a] === BLACK)) continue;
      for (let i = 0; i < 5; i++) { const e = windowCell[w * 5 + i]; if (board[e] === 0) { if (mark[e] !== stamp) { mark[e] = stamp; out[n++] = e; } break; } }
    }
    return n;
  }
  fivesWhite(out) {
    const { nb, nw, board, mark } = this, stamp = ++this.stamp; let n = 0;
    for (let w = 0; w < WINDOWS; w++) if (nw[w] === 4 && nb[w] === 0) {
      for (let i = 0; i < 5; i++) { const e = windowCell[w * 5 + i]; if (board[e] === 0) { if (mark[e] !== stamp) { mark[e] = stamp; out[n++] = e; } break; } }
    }
    return n;
  }
  fourMovesBlack(out) {
    const { nb, nw, board, mark } = this, stamp = ++this.stamp; let n = 0;
    for (let w = 0; w < WINDOWS; w++) if (nb[w] === 3 && nw[w] === 0) {
      const b = before[w], a = after[w];
      if ((b >= 0 && board[b] === BLACK) || (a >= 0 && board[a] === BLACK)) continue;
      for (let i = 0; i < 5; i++) { const e = windowCell[w * 5 + i]; if (board[e] === 0 && mark[e] !== stamp) { mark[e] = stamp; out[n++] = e; } }
    }
    return n;
  }
  fourMovesWhite(out) {
    const { nb, nw, board, mark } = this, stamp = ++this.stamp; let n = 0;
    for (let w = 0; w < WINDOWS; w++) if (nw[w] === 3 && nb[w] === 0) {
      for (let i = 0; i < 5; i++) { const e = windowCell[w * 5 + i]; if (board[e] === 0 && mark[e] !== stamp) { mark[e] = stamp; out[n++] = e; } }
    }
    return n;
  }
  at(x, y) { return x < 0 || x > 14 || y < 0 || y > 14 ? -1 : this.board[y * 15 + x]; }
  runLength(p, d, c) {
    const [dx, dy] = DIRS[d], x = p % 15, y = (p - x) / 15; let n = 1;
    for (let k = 1; this.at(x + k * dx, y + k * dy) === c; k++) n++;
    for (let k = 1; this.at(x - k * dx, y - k * dy) === c; k++) n++;
    return n;
  }
  exactFive(p) { for (let d = 0; d < 4; d++) if (this.runLength(p, d, BLACK) === 5) return true; return false; }
  countFours(p) { // board[p] is black
    const x = p % 15, y = (p - x) / 15; let total = 0;
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d], keys = [];
      for (let start = -4; start <= 0; start++) {
        let stones = 0, blanks = 0, blank = -1, low = 999, high = -1;
        for (let k = start; k < start + 5; k++) {
          const px = x + dx * k, py = y + dy * k, v = this.at(px, py), q = py * 15 + px;
          if (v === BLACK) { stones++; if (q < low) low = q; if (q > high) high = q; } else if (v === 0) { blanks++; blank = q; }
        }
        if (stones !== 4 || blanks !== 1) continue;
        this.board[blank] = BLACK;
        const five = this.runLength(blank, d, BLACK) === 5;
        this.board[blank] = 0;
        if (!five) continue;
        const key = low * 225 + high;
        if (!keys.includes(key)) keys.push(key);
      }
      total += keys.length;
    }
    return total;
  }
  countThrees(p) { // board[p] is black
    const x = p % 15, y = (p - x) / 15; let total = 0;
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d], keys = [];
      for (let k = -3; k <= 3; k++) {
        if (!k) continue;
        const px = x + k * dx, py = y + k * dy;
        if (this.at(px, py) !== 0) continue;
        const next = py * 15 + px;
        this.board[next] = BLACK;
        let low = 0, high = 0;
        while (this.at(px - (low + 1) * dx, py - (low + 1) * dy) === BLACK) low++;
        while (this.at(px + (high + 1) * dx, py + (high + 1) * dy) === BLACK) high++;
        let open = false, key = 0;
        if (low + high + 1 === 4) {
          const row = []; let includes = false;
          for (let i = -low; i <= high; i++) { const q = (py + i * dy) * 15 + px + i * dx; row.push(q); if (q === p) includes = true; }
          if (includes) {
            open = true;
            for (const [ex, ey] of [[px - (low + 1) * dx, py - (low + 1) * dy], [px + (high + 1) * dx, py + (high + 1) * dy]]) {
              if (this.at(ex, ey) !== 0) { open = false; break; }
              const e = ey * 15 + ex;
              this.board[e] = BLACK;
              const count = this.runLength(e, d, BLACK);
              this.board[e] = 0;
              if (count !== 5) { open = false; break; }
            }
            if (open) { const stones = row.filter(q => q !== next).sort((a, b) => a - b); key = stones[0] * 50625 + stones[1] * 225 + stones[2]; }
          }
        }
        const alreadyFive = open && this.exactFive(next);
        this.board[next] = 0;
        if (!open || alreadyFive || this.analyze(next) === -1) continue;
        if (!keys.includes(key)) keys.push(key);
      }
      total += keys.length;
    }
    return total;
  }
  // -1 forbidden, 100 five, otherwise fours * 10 + threes.
  analyze(p) {
    this.board[p] = BLACK;
    let result;
    if (this.exactFive(p)) result = 100;
    else {
      let overline = false;
      for (let d = 0; d < 4; d++) if (this.runLength(p, d, BLACK) > 5) overline = true;
      if (overline) result = -1;
      else {
        const fours = this.countFours(p);
        if (fours > 1) result = -1;
        else { const threes = this.countThrees(p); result = threes > 1 ? -1 : fours * 10 + threes; }
      }
    }
    this.board[p] = 0;
    return result;
  }
  // Black to move. Complete up to the node limit; check `over` before reading false as a proof.
  vcfBlack(limit = SEARCH_LIMIT) { this.nodes = 0; this.limit = limit; this.over = false; this.tt.clear(); this.pv.length = 0; return this.searchBlack(0); }
  searchBlack(ply) {
    if (++this.nodes > this.limit) { this.over = true; return false; }
    const moves = this.bufs[ply * 3], blackFives = this.bufs[ply * 3 + 1], whiteFives = this.bufs[ply * 3 + 2];
    if (this.fivesBlack(blackFives) > 0) { this.pv.push(blackFives[0]); return true; }
    const key = this.key();
    if (this.tt.get(key) !== undefined) return false;
    const danger = this.fivesWhite(whiteFives);
    if (danger >= 2) { this.tt.set(key, 0); return false; }
    if (ply >= this.maxPly) return false;
    let count;
    if (danger === 1) { moves[0] = whiteFives[0]; count = 1; } else count = this.fourMovesBlack(moves);
    for (let i = 0; i < count; i++) {
      const p = moves[i];
      if (this.analyze(p) === -1) continue;
      this.place(p, BLACK);
      const fives = this.fivesBlack(blackFives);
      if (fives === 0 || this.fivesWhite(whiteFives) > 0) { this.remove(p, BLACK); continue; }
      if (fives >= 2) { this.remove(p, BLACK); this.pv.push(p); return true; }
      const block = blackFives[0];
      this.place(block, WHITE); this.pv.push(p, block);
      const won = this.searchBlack(ply + 1);
      this.remove(block, WHITE); this.remove(p, BLACK);
      if (won) return true;
      this.pv.length -= 2;
      if (this.over) return false;
    }
    this.tt.set(key, 0);
    return false;
  }
  // Iterative deepening, for when the length of the kill matters and not just its existence.
  shortestBlack() {
    for (let depth = 0; depth <= 16; depth++) {
      this.maxPly = depth;
      const won = this.vcfBlack();
      this.maxPly = Infinity;
      if (won) return [...this.pv];
      if (this.over) return null;
    }
    return this.vcfBlack() ? [...this.pv] : null;
  }
  // Cheap re-proof: does a known Black VCF line still work here?
  replayBlack(pv) {
    const undo = [], blackFives = this.bufs[250], whiteFives = this.bufs[251];
    let won = false;
    for (let i = 0; i < pv.length; i += 2) {
      const p = pv[i];
      if (this.board[p]) break;
      const danger = this.fivesWhite(whiteFives);
      if (danger >= 2 || (danger === 1 && whiteFives[0] !== p)) break;
      const value = this.analyze(p);
      if (value === -1) break;
      if (value === 100) { won = true; break; }
      this.place(p, BLACK); undo.push(p, BLACK);
      const fives = this.fivesBlack(blackFives);
      if (fives === 0 || this.fivesWhite(whiteFives) > 0) break;
      if (fives >= 2) { won = true; break; }
      if (i + 1 >= pv.length) break;
      const block = blackFives[0];
      if (pv[i + 1] !== block) break;
      this.place(block, WHITE); undo.push(block, WHITE);
    }
    for (let i = undo.length - 2; i >= 0; i -= 2) this.remove(undo[i], undo[i + 1]);
    return won;
  }
  // White to move. A forced Black block on a forbidden point wins for White.
  vcfWhite(limit = SEARCH_LIMIT) { this.nodes = 0; this.limit = limit; this.over = false; this.tt.clear(); this.pv.length = 0; return this.searchWhite(0); }
  searchWhite(ply) {
    if (++this.nodes > this.limit) { this.over = true; return false; }
    const moves = this.bufs[ply * 3], blackFives = this.bufs[ply * 3 + 1], whiteFives = this.bufs[ply * 3 + 2];
    if (this.fivesWhite(whiteFives) > 0) { this.pv.push(whiteFives[0]); return true; }
    const key = this.key();
    if (this.tt.get(key) !== undefined) return false;
    const danger = this.fivesBlack(blackFives);
    if (danger >= 2) { this.tt.set(key, 0); return false; }
    let count;
    if (danger === 1) { moves[0] = blackFives[0]; count = 1; } else count = this.fourMovesWhite(moves);
    for (let i = 0; i < count; i++) {
      const p = moves[i];
      this.place(p, WHITE);
      const fives = this.fivesWhite(whiteFives);
      if (fives === 0 || this.fivesBlack(blackFives) > 0) { this.remove(p, WHITE); continue; }
      if (fives >= 2) { this.remove(p, WHITE); this.pv.push(p); return true; }
      const block = whiteFives[0];
      if (this.analyze(block) === -1) { this.remove(p, WHITE); this.pv.push(p); return true; }
      this.place(block, BLACK); this.pv.push(p, block);
      const won = this.searchWhite(ply + 1);
      this.remove(block, BLACK); this.remove(p, WHITE);
      if (won) return true;
      this.pv.length -= 2;
      if (this.over) return false;
    }
    this.tt.set(key, 0);
    return false;
  }
}

const scratch = new Int16Array(120), scratch2 = new Int16Array(120);
const results = new Map();
// Counter-fours nest, and on a crowded board the tree can run for hours. The limit
// counts search nodes rather than time, so every machine reaches the same verdict.
class WorkLimit extends Error {}
const work = { left: Infinity };
function spend(P) {
  work.left -= P.nodes + 1;
  if (work.left < 0) throw new WorkLimit();
}
// White has just played x; Black to move. L: Black has a VCF, S: he has none, W: White wins, U: unknown.
function afterWhite(P, x, depth) {
  P.place(x, WHITE);
  let result;
  if (P.fivesBlack(scratch) > 0) result = 'L';
  else {
    const fours = P.fivesWhite(scratch);
    if (fours >= 2) result = 'W';
    else if (fours === 1) {
      const block = scratch[0];
      if (P.analyze(block) === -1) result = 'W';
      else if (depth >= MAX_COUNTER_DEPTH) result = 'U';
      else { P.place(block, BLACK); result = whiteToMove(P, depth + 1); P.remove(block, BLACK); }
    } else {
      const won = P.vcfBlack();
      spend(P);
      result = won ? 'L' : P.over ? 'U' : 'S';
    }
  }
  P.remove(x, WHITE);
  return result;
}
function whiteToMove(P, depth) {
  const key = P.key(), known = results.get(key);
  if (known) return known;
  let result;
  if (P.fivesWhite(scratch) > 0) result = 'W';
  else {
    const set = defenceSet(P, depth), has = status => set.survivors.some(s => s.status === status);
    result = !set.threat ? 'S' : has('W') ? 'W' : has('S') ? 'S' : has('U') ? 'U' : 'L';
  }
  results.set(key, result);
  return result;
}
// Which White moves stop Black's VCF? Every empty point is examined.
export function defenceSet(P, depth = 0) {
  const fives = [];
  { const n = P.fivesBlack(scratch2); for (let i = 0; i < n; i++) fives.push(scratch2[i]); }
  let threat = fives.length > 0, pv = null;
  if (!threat) {
    threat = P.vcfBlack();
    spend(P);
    if (threat) pv = [...P.pv];
    else if (P.over) return { threat: false, unknown: true, survivors: [], fives, pv: null };
  } else pv = [fives[0]];
  if (!threat) return { threat: false, survivors: [], fives, pv: null };
  const survivors = [], points = [];
  if (fives.length) points.push(...fives);
  else for (let p = 0; p < 225; p++) if (!P.board[p]) points.push(p);
  for (const x of points) {
    if (!fives.length) {
      P.place(x, WHITE);
      const replays = P.fivesWhite(scratch) === 0 && P.replayBlack(pv);
      P.remove(x, WHITE);
      if (replays) continue;
    }
    const status = afterWhite(P, x, depth);
    if (status !== 'L') survivors.push({ x, status });
  }
  return { threat: true, survivors, fives, pv };
}

export function whiteForcedWin(board) {
  const P = new Pos().load(board);
  return P.vcfWhite() ? P.pv.map(coordOf) : null;
}
export function blackVcfMove(board) {
  const P = new Pos().load(board);
  return P.vcfBlack() ? coordOf(P.pv[0]) : null;
}
export function isWhiteFour(board, move) {
  const p = indexOf(move);
  if (board[p]) return false;
  const P = new Pos().load(board);
  P.place(p, WHITE);
  return P.fivesWhite(scratch) > 0;
}
// Longest resistance first: no Black VCF ranks ahead of every loss, then the longest
// shortest kill, then the point closest to the kill Black has now.
export function byResistance(board, moves) {
  const P = new Pos().load(board), kill = P.shortestBlack() || [];
  const distance = p => Math.min(99, ...kill.map(q => Math.max(Math.abs(p % 15 - q % 15), Math.abs(Math.floor(p / 15) - Math.floor(q / 15)))));
  const resistance = () => {
    if (P.fivesBlack(scratch) > 0) return 0;
    if (kill.length && P.fivesWhite(scratch) === 0 && P.replayBlack(kill)) return kill.length;
    return P.vcfBlack() ? P.shortestBlack()?.length ?? Infinity : Infinity;
  };
  return moves.map(move => {
    const p = indexOf(move);
    P.place(p, WHITE);
    const length = resistance();
    P.remove(p, WHITE);
    return { move, length, near: distance(p) };
  }).sort((a, b) => b.length - a.length || a.near - b.near).map(item => item.move);
}

let cachedKey = null, cachedSet = null;
function defencesOf(P, board) {
  const key = board.join('');
  if (key !== cachedKey) {
    results.clear(); cachedKey = key;
    cachedSet = { threat: false, unknown: true, survivors: [] };
    cachedSet = defenceSet(P);
  }
  return cachedSet;
}
// Why a non-forced White four is not worth offering, or null when it may help.
// It is measured with and without the four and Black's forced block:
//   block-finishes       the block is itself a five or a standing four-three
//   gives-black-vcf      Black had no VCF before the exchange and has one after
//   throws-away-defence  another point stops the VCF, but after this four nothing does
//   delay                every point loses to VCF, before and after
export function pointlessFour(board, move) {
  work.left = WORK_LIMIT;
  try { return judgeFour(board, move); }
  catch (error) { if (error instanceof WorkLimit) return null; throw error; }
}
function judgeFour(board, move) {
  const x = indexOf(move), P = new Pos().load(board);
  if (P.board[x] || P.fivesBlack(scratch) > 0) return null;
  P.place(x, WHITE);
  const fours = P.fivesWhite(scratch), block = scratch[0];
  P.remove(x, WHITE);
  if (fours !== 1) return null;
  const value = P.analyze(block);
  if (value === -1) return null;
  P.place(x, WHITE); P.place(block, BLACK);
  const finished = value === 100 || value === 11 && fourThreeStands(P.board);
  P.remove(block, BLACK); P.remove(x, WHITE);
  if (finished) return 'block-finishes';
  const start = defencesOf(P, board);
  P.place(x, WHITE); P.place(block, BLACK);
  const after = defenceSet(P, 1), whiteWins = P.vcfWhite();
  P.remove(block, BLACK); P.remove(x, WHITE);
  if (whiteWins || start.unknown || after.unknown) return null;
  if (!start.threat) return after.threat ? 'gives-black-vcf' : null;
  if (!after.threat) return null;
  const alive = new Set(start.survivors.map(s => s.x)), loses = !alive.has(x);
  if (loses && alive.size) return 'throws-away-defence';
  if (after.survivors.some(s => s.x !== x && s.x !== block && !alive.has(s.x))) return null;
  return loses ? 'delay' : null;
}
