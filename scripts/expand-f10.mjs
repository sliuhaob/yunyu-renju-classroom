import fs from 'node:fs';
import { Rapfi } from './rapfi.mjs';
import { vcf } from './tactics.mjs';
import { trimG8Book } from './trim-books.mjs';
import { writeCompactG8 } from './compact-g8.mjs';
import { verifyG8 } from './verify-g8.mjs';
import { immediateFinish, screenWhite, rankedDefenses } from './f10-candidates.mjs';
import { BLACK, WHITE, playChallengeHistory, analyzeMove, indexOf, coordOf } from '../src/renju.mjs';
import { BOOK_VERSION } from '../src/book.mjs';

const branch = process.argv.find(arg => arg.startsWith('--branch='))?.split('=')[1].toUpperCase() || 'F10';
if (!['F10', 'F11'].includes(branch)) throw new Error('Unsupported white-eight branch: ' + branch);
const label = branch.toLowerCase(), root = 'H8,I9,I8,H7,G10,G8,F9,' + branch;
const coveragePath = `data/${label}-coverage.json`, requestsPath = `data/${label}-requests.json`;
const original = JSON.parse(fs.readFileSync('data/g8.json', 'utf8'));
const requests = fs.existsSync(requestsPath) ? JSON.parse(fs.readFileSync(requestsPath, 'utf8')) : [];
const requestedMoves = new Map(requests.map(({ history, moves }) => [history.join(','), moves]));
const requestedOnly = process.argv.includes('--requested-only');
const nodes = {}, audit = {}, screens = new Map(), proofMoves = new Map(), mateHints = new Map();
const engines = Array.from({ length: 4 }, () => new Rapfi()), idleEngines = [...engines], waitingEngines = [], inFlight = new Map();
let spareLanes = engines.length - 1;
const cachePath = `artifacts/${label}-engine-cache.json`, progressPath = `artifacts/${label}-${requestedOnly ? 'request' : 'build'}-progress.json`;
let cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
let queries = 0, completed = 0;
const engineMs = Number(process.env[branch + '_ENGINE_MS'] || 1200);
function rememberMateLines(cacheKey, result) {
  const [encoded, side] = cacheKey.split(':');
  for (const candidate of result.candidates || []) {
    const match = (side === '0' ? /^\+?M(\d+)$/ : /^-M(\d+)$/).exec(candidate.eval);
    if (!match) continue;
    const board = Uint8Array.from(encoded, Number);
    let color = side === '0' ? BLACK : WHITE;
    for (let i = 0; i < candidate.pv.length; i++) {
      const move = candidate.pv[i], p = indexOf(move), analysis = analyzeMove(board, p, color);
      if (!analysis.legal) break;
      if (color === BLACK) {
        const key = board.join(''), remaining = Number(match[1]) - i;
        if (!mateHints.has(key) || mateHints.get(key).remaining > remaining) mateHints.set(key, { move, remaining });
      }
      board[p] = color;
      if (analysis.win || color === BLACK && analysis.fourThree) break;
      color = color === BLACK ? WHITE : BLACK;
    }
  }
}
for (const [key, result] of Object.entries(cache)) rememberMateLines(key, result);
function save() {
  fs.writeFileSync(cachePath, JSON.stringify(cache));
  fs.writeFileSync(progressPath, JSON.stringify({ version: BOOK_VERSION, nodes, audit }));
}
if (requestedOnly) {
  Object.assign(nodes, Object.fromEntries(Object.entries(original.nodes).filter(([key]) => key.startsWith(root))));
  Object.assign(audit, JSON.parse(fs.readFileSync(coveragePath, 'utf8')).positions);
}
if (process.env[branch + '_RESUME'] && fs.existsSync(progressPath)) {
  const saved = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  if (saved.version === BOOK_VERSION) { Object.assign(nodes, saved.nodes); Object.assign(audit, saved.audit); }
}
if (process.env[branch + '_REFINE_EARLY']) {
  // Revisit early decisions after stronger searches without discarding closed
  // later continuations that still match the chosen move sequence.
  for (const key of Object.keys(nodes)) if (key.split(',').length <= 22) { delete nodes[key]; delete audit[key]; }
}
async function query(history, board, count, ms = engineMs) {
  const key = board.join('') + ':' + history.length % 2 + ':' + count + ':' + ms;
  if (cache[key]) return cache[key];
  if (inFlight.has(key)) return inFlight.get(key);
  const job = (async () => {
    try { for (let attempt = 0; attempt < 2; attempt++) {
      let engine = idleEngines.pop() || await new Promise(resolve => waitingEngines.push(resolve));
      try {
        const r = await engine.analyze(history, count, ms);
        cache[key] = { move: r.move, candidates: r.candidates };
        rememberMateLines(key, cache[key]);
        if (++queries % 50 === 0) { fs.writeFileSync(cachePath, JSON.stringify(cache)); console.log('Engine queries', queries, 'complete nodes', completed, 'ply', history.length); }
        return cache[key];
      } catch (error) {
        if (!engine.failed || attempt) throw error;
        console.log('Restart failed engine and retry position at ply', history.length);
      } finally {
        if (engine.failed) { const slot = engines.indexOf(engine); engine = engines[slot] = new Rapfi(); }
        const waiter = waitingEngines.shift();
        if (waiter) waiter(engine); else idleEngines.push(engine);
      }
    } } finally { inFlight.delete(key); }
  })();
  inFlight.set(key, job);
  return job;
}
function put(history, moves, kind) {
  nodes[history.join(',')] = { turn: history.length % 2 ? WHITE : BLACK, moves: Object.fromEntries(moves.map(m => [m, { kind }])) };
  if (++completed % 1000 === 0) { save(); console.log('Closed nodes', completed, 'ply', history.length, 'last', history.slice(-5).join(' ')); }
}
async function expandDefenses(history, moves) {
  const parallel = [], sequential = [moves[0]];
  for (const move of moves.slice(1)) {
    if (spareLanes > 0) {
      spareLanes--;
      parallel.push(expand([...history, move]).finally(() => { spareLanes++; }));
    } else sequential.push(move);
  }
  const serial = (async () => { for (const move of sequential) await expand([...history, move]); })();
  const results = await Promise.allSettled([serial, ...parallel]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}
function includeRequested(history, board, moves) {
  const additions = requestedMoves.get(history.join(',')) || [];
  for (const move of additions) {
    if (history.length % 2 !== 1 || !analyzeMove(board, indexOf(move), WHITE).legal) throw new Error('Invalid requested defense: ' + history.join(',') + ' -> ' + move);
  }
  const combined = [...new Set([...moves, ...additions])];
  if (combined.length > 9) throw new Error('More than nine requested/selected defenses: ' + history.join(','));
  return combined;
}
async function expand(history) {
  const key = history.join(',');
  if (nodes[key]) return;
  const { board, outcome } = playChallengeHistory(history);
  if (outcome) { if (outcome.winner !== BLACK) throw new Error('White wins: ' + key); return; }
  if (history.length >= 69) throw new Error('Unclosed at ply limit: ' + key);
  if (history.length % 2 === 0) {
    const finish = immediateFinish(board);
    if (finish) { put(history, [finish.move], 'immediate-' + finish.reason); return; }
    const prior = Object.keys(original.nodes[key]?.moves || {});
    const boardKey = board.join('');
    let proofMove = null;
    if (!prior.length || history.length <= 22) {
      const engineKey = boardKey + ':0:3:' + engineMs;
      if (!proofMoves.has(boardKey)) {
        // A cached normal engine query means the identical VCF search already
        // failed on this board. Otherwise cache both proof and no-proof results.
        const proof = cache[engineKey] || cache[boardKey + ':0:1:600'] ? null : vcf(board, 9, 3000);
        proofMoves.set(boardKey, proof ? coordOf(proof.move) : null);
      }
      proofMove = proofMoves.get(boardKey);
    }
    let candidates = proofMove ? [proofMove] : prior;
    if (!proofMove && history.length > 8 && history.length <= 22) {
      const r = await query(history, board, 3, 8000);
      const mates = r.candidates.filter(c => /^\+?M\d+$/.test(c.eval)).sort((a, b) => Number(a.eval.replace(/^\+?M/, '')) - Number(b.eval.replace(/^\+?M/, '')));
      candidates = [...new Set([...(mates.length ? mates.map(c => c.move) : prior.length ? prior : [r.move]), ...r.candidates.map(c => c.move)])];
    }
    if (!candidates.length) {
      // Black has one fixed reply. Spend its search budget on one principal
      // variation; reuse earlier multi-PV results when already cached.
      const hint = mateHints.get(boardKey);
      if (hint) candidates = [hint.move];
      else {
        const r = cache[boardKey + ':0:3:' + engineMs] ? await query(history, board, 3) : await query(history, board, 1, 600);
        candidates = [...new Set([r.move, ...r.candidates.map(c => c.move)])];
      }
    }
    const errors = [];
    for (let attempt = 0; attempt < candidates.length; attempt++) {
      const move = candidates[attempt];
      if (!analyzeMove(board, indexOf(move), BLACK).legal) continue;
      try {
        await expand([...history, move]);
        put(history, [move], prior.includes(move) ? 'preserved-reply' : move === proofMove ? 'shortest-vcf' : 'engine-reply');
        return;
      } catch (error) {
        errors.push(error.message);
        console.log('Retry black', history.length + 1, move, error.message.slice(0, 160));
        if (attempt === candidates.length - 1) {
          const r = await query(history, board, 5, 5000);
          candidates.push(...[r.move, ...r.candidates.map(c => c.move)].filter(m => !candidates.includes(m)));
        }
      }
    }
    throw new Error('No closed black reply: ' + key + '\n' + errors.join('\n'));
  }
  const boardKey = board.join('');
  let screen = screens.get(boardKey);
  if (!screen) { screen = screenWhite(board); screens.set(boardKey, screen); }
  const existing = Object.keys(original.nodes[key]?.moves || {});
  const proposal = screen.mode === 'forced' || (screen.candidates.length > 0 && screen.candidates.length <= 9)
    ? { move: null, candidates: [] } : await query(history, board, 9);
  const moves = includeRequested(history, board, rankedDefenses(screen, proposal, existing));
  if (!moves.length) throw new Error('No selected white defense: ' + key);
  await expandDefenses(history, moves);
  audit[key] = { mode: screen.mode, emptyPointsChecked: screen.checked, survivingPoints: screen.candidates.length,
    selection: screen.mode === 'forced' ? 'all-forced' : screen.candidates.length <= 9 && screen.candidates.length ? 'all-tactical-survivors' : screen.mode === 'unavoidable' ? 'terminal-examples' : 'engine-ranked',
    moves, candidates: proposal.candidates.map(({ move, eval: evaluation, depth }) => ({ move, evaluation, depth })),
    ...(requestedMoves.has(key) ? { requestedMoves: requestedMoves.get(key) } : {}) };
  put(history, moves, label + '-expanded-defense');
}
try {
  if (requestedOnly) {
    for (const { history, moves: additions } of requests) {
      const key = history.join(','), parent = nodes[key];
      if (!key.startsWith(root + ',') || !parent || !audit[key]) throw new Error('Requested parent is not a recorded ' + branch + ' defense: ' + key);
      const { board, outcome } = playChallengeHistory(history);
      if (outcome) throw new Error('Requested parent has already ended: ' + key);
      const moves = includeRequested(history, board, Object.keys(parent.moves));
      await expandDefenses(history, additions);
      audit[key] = { ...audit[key], moves, requestedMoves: additions };
      put(history, moves, label + '-expanded-defense');
    }
  } else await expand(root.split(','));
  const merged = { ...original, nodes: { ...Object.fromEntries(Object.entries(original.nodes).filter(([key]) => !key.startsWith(root))), ...nodes } };
  const published = trimG8Book(merged);
  const reachableAudit = Object.fromEntries(Object.entries(audit).filter(([key]) => published.nodes[key]));
  published.coverage = { ...published.coverage, [label]: {
    root, policy: 'All forced defenses; all one-move-loss escape points when at most nine; otherwise nine-PV engine screening with a 220-score / six-ply mate band, preserving prior viable choices. Terminal examples when no escape exists.',
    exhaustiveLegalMoves: false, whitePositions: Object.keys(reachableAudit).length,
    selections: Object.values(reachableAudit).reduce((counts, item) => { counts[item.selection] = (counts[item.selection] || 0) + 1; return counts; }, {})
  } };
  console.log('Verified', JSON.stringify(verifyG8(published)));
  fs.writeFileSync('data/g8.json', JSON.stringify(published));
  writeCompactG8(published);
  fs.writeFileSync(coveragePath, JSON.stringify({ version: BOOK_VERSION, root, policy: published.coverage[label], positions: reachableAudit }));
  console.log(branch + ' coverage', JSON.stringify(published.coverage[label]));
} finally { save(); for (const engine of engines) engine.close(); }
