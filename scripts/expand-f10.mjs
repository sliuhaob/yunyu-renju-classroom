import fs from 'node:fs';
import { Rapfi } from './rapfi.mjs';
import { vcf } from './tactics.mjs';
import { trimG8Book } from './trim-books.mjs';
import { writeCompactG8 } from './compact-g8.mjs';
import { verifyG8 } from './verify-g8.mjs';
import { immediateFinish, screenWhite, rankedDefenses, usableMoves, MENU_POLICY } from './f10-candidates.mjs';
import { continuationVerifier, redundantFour } from './tempo-fours.mjs';
import { fourThreeDefenses, missingFourThreeSides } from './double-four-three.mjs';
import { OPPOSITE_KIND } from './augment-double-four-three.mjs';
import { blackVcfMove, byResistance, whiteForcedWin } from './vcf-engine.mjs';
import { BLACK, WHITE, playChallengeHistory, analyzeMove, indexOf, coordOf, standingFourThree } from '../src/renju.mjs';
import { BOOK_VERSION, OPENING, LESSONS } from '../src/book.mjs';

const openingKind = process.argv.find(arg => arg.startsWith('--opening='))?.split('=')[1] || 'cloud';
if (!['cloud', 'flower'].includes(openingKind)) throw new Error('Unsupported opening');
const flower = openingKind === 'flower';
const whiteFour = process.argv.find(arg => arg.startsWith('--white4='))?.split('=')[1].toUpperCase();
if (flower && !['H9', 'G7', 'H10'].includes(whiteFour) || whiteFour && !(flower ? ['H9', 'G7', 'H10'] : ['J8', 'G8']).includes(whiteFour)) throw new Error('Unsupported white four: ' + whiteFour);
const whiteSix = process.argv.find(arg => arg.startsWith('--white6='))?.split('=')[1].toUpperCase();
if (whiteFour && whiteSix) throw new Error('Choose one opening branch');
if (whiteSix && !['H9', 'G9'].includes(whiteSix)) throw new Error('Unsupported white six: ' + whiteSix);
const branch = whiteFour || whiteSix || process.argv.find(arg => arg.startsWith('--branch='))?.split('=')[1].toUpperCase() || 'F10';
if (!whiteFour && !['F10', 'F11', 'H9', 'H11', 'J7', 'G9'].includes(branch)) throw new Error('Unsupported branch: ' + branch);
const label = (flower ? 'flower-' : '') + (whiteFour ? 'w4' : whiteSix ? 'w6' : '') + branch.toLowerCase(), isJ7 = branch === 'J7', independent = !!whiteFour || !!whiteSix || isJ7;
const root = whiteFour ? (flower ? 'H8,I8,I9,' : 'H8,I9,I8,') + branch : independent ? 'H8,I9,I8,H7,G10,' + branch : 'H8,I9,I8,H7,G10,G8,F9,' + branch;
const opening = whiteFour ? root.split(',') : OPENING;
const rootWhitePly = root.split(',').length + 1;
const bookLabel = independent ? label : 'g8', bookPath = `data/${bookLabel}.json`;
const coveragePath = `data/${label}-coverage.json`, requestsPath = `data/${label}-requests.json`;
function seedBranch() {
  const moves = whiteFour || whiteSix ? root.split(',') : LESSONS.find(lesson => lesson.id === 'j7').moves, nodes = {};
  for (let n = 4; n < moves.length; n++) nodes[moves.slice(0, n).join(',')] = {
    turn: n % 2 ? WHITE : BLACK, moves: { [moves[n]]: { kind: 'recorded' } }
  };
  return { opening, nodes, coverage: {} };
}
const original = fs.existsSync(bookPath) ? JSON.parse(fs.readFileSync(bookPath, 'utf8')) : seedBranch();
const requests = fs.existsSync(requestsPath) ? JSON.parse(fs.readFileSync(requestsPath, 'utf8')) : [];
const requestedMoves = new Map(requests.map(({ history, moves }) => [history.join(','), moves]));
const requestedOnly = process.argv.includes('--requested-only');
// Repair keeps every recorded menu and reply that still passes the rules, asks the
// engine only about what changed, and writes artifacts/<label>-repair.json for
// scripts/finish-repair.mjs instead of touching data/.
const repair = process.argv.includes('--repair');
const REPAIR_BUDGET = Number(process.env.REPAIR_BUDGET || 1500);
class BudgetExceeded extends Error {}
const NO_PROPOSAL = { move: null, candidates: [] };
const storedAudit = repair && fs.existsSync(coveragePath) ? JSON.parse(fs.readFileSync(coveragePath, 'utf8')).positions : {};
const tempoPath = `data/${bookLabel === 'g8' ? '' : bookLabel + '-'}tempo-four-pruning.json`;
const tempoProof = repair && fs.existsSync(tempoPath) ? JSON.parse(fs.readFileSync(tempoPath, 'utf8')) : { nodes: [], positions: {} };
const tempoReplay = continuationVerifier(tempoProof.nodes);
const unresolved = [];
const nodes = {}, audit = {}, screens = new Map(), proofMoves = new Map(), mateHints = new Map();
const engines = Array.from({ length: Number(process.env.RENJU_ENGINES || 4) }, () => new Rapfi()), idleEngines = [...engines], waitingEngines = [], inFlight = new Map();
let spareLanes = engines.length - 1;
const cachePath = `artifacts/${label}-engine-cache.json`, progressPath = `artifacts/${label}-${requestedOnly ? 'request' : 'build'}-progress.json`;
let cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
let queries = 0, completed = 0;
const engineMs = Number(process.env[branch + '_ENGINE_MS'] || 1200);
const rootWhiteMs = Number(process.env[branch + '_ROOT_MS'] || (branch === 'H9' || independent ? 45000 : engineMs));
const rootReplyMs = Number(process.env[branch + '_ROOT_REPLY_MS'] || (branch === 'H9' || independent ? 8000 : 0));
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
  const prior = repair ? original.nodes[history.join(',')]?.moves || {} : {};
  nodes[history.join(',')] = { turn: history.length % 2 ? WHITE : BLACK, moves: Object.fromEntries(moves.map(m => [m, prior[m] && prior[m].kind !== OPPOSITE_KIND ? prior[m] : { kind }])) };
  if (++completed % 1000 === 0) { save(); console.log('Closed nodes', completed, 'ply', history.length, 'last', history.slice(-5).join(' ')); }
}
async function expandDefenses(history, moves, budgetFor = () => undefined, mayDrop = false) {
  const failed = new Map();
  const attempt = async move => {
    try { await expand([...history, move], budgetFor(move)); }
    catch (error) { if (!mayDrop) throw error; failed.set(move, error.message); }
  };
  const parallel = [], sequential = [moves[0]];
  for (const move of moves.slice(1)) {
    if (spareLanes > 0) {
      spareLanes--;
      parallel.push(attempt(move).finally(() => { spareLanes++; }));
    } else sequential.push(move);
  }
  const serial = (async () => { for (const move of sequential) await attempt(move); })();
  const results = await Promise.allSettled([serial, ...parallel]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  for (const [move, error] of failed) {
    unresolved.push({ history: history.join(','), move, error: error.slice(0, 300) });
    console.log('Unclosed white move', history.length + 1, move, error.slice(0, 160));
  }
  return moves.filter(move => !failed.has(move));
}
function finishes(board, move) {
  const p = indexOf(move), a = analyzeMove(board, p, BLACK);
  return a.legal && (a.win || standingFourThree(board, p, a));
}
// One selection path for fresh builds and repairs. Pointless fours leave before
// anything is counted or ranked, so they cannot use up slots or set the band.
async function chooseDefenses(key, history, board, screen, existing) {
  if (screen.mode === 'forced') return { moves: screen.candidates, selection: 'all-forced', proposal: NO_PROPOSAL, dropped: {} };
  const keep = requestedMoves.get(key) || [];
  const omitted = (tempoProof.positions[key] || []).filter(item => redundantFour(board, item.move, item.reply, item.suffix, tempoReplay)).map(item => item.move);
  const filtered = usableMoves(board, screen.candidates, { keep, omitted }), kept = usableMoves(board, existing, { keep, omitted });
  const survivors = filtered.usable, dropped = { ...filtered.dropped, ...kept.dropped };
  const narrowed = { ...screen, mode: survivors.length ? 'defense' : 'unavoidable', candidates: survivors };
  let proposal = NO_PROPOSAL;
  if (!survivors.length || survivors.length > 9) {
    const stored = storedAudit[key]?.candidates;
    if (stored?.length) proposal = { move: stored[0].move, candidates: stored.map(c => ({ ...c, eval: c.evaluation })) };
    else {
      proposal = await query(history, board, 9, history.length === rootWhitePly ? rootWhiteMs : engineMs);
      if (history.length === rootWhitePly && rootReplyMs && proposal.candidates.length) proposal = await refineRootProposal(history, board, proposal);
    }
  }
  const offered = usableMoves(board, [...new Set([proposal.move, ...proposal.candidates.map(c => c.move)])].filter(Boolean), { keep, omitted }).usable;
  const ranked = { ...proposal, move: offered.includes(proposal.move) ? proposal.move : null, candidates: proposal.candidates.filter(c => offered.includes(c.move)) };
  let moves = rankedDefenses(narrowed, ranked, kept.usable);
  const attacks = fourThreeDefenses(board);
  if (!moves.length && survivors.length) moves = byResistance(board, survivors).slice(0, 3);
  if (!moves.length) moves = byResistance(board, attacks.defenses.filter(d => !d.four).map(d => d.move)).slice(0, 3);
  if (!moves.length) { moves = existing; for (const move of moves) delete dropped[move]; }
  // A survivor that stops a next-move kill outright comes before anything that ignores it.
  for (let missing = missingFourThreeSides(attacks, moves); missing.length && moves.length < 9; missing = missingFourThreeSides(attacks, moves)) {
    const covers = d => d.stops.filter(s => missing.includes(s)).length;
    const best = attacks.defenses.filter(d => survivors.includes(d.move) && !moves.includes(d.move) && covers(d)).sort((a, b) => covers(b) - covers(a))[0];
    if (!best) break;
    moves = [...moves, best.move];
  }
  return { moves, proposal, dropped, selection: survivors.length > 9 ? 'engine-ranked' : survivors.length ? 'all-tactical-survivors' : 'terminal-examples' };
}
async function refineRootProposal(history, board, proposal) {
  // Multi-PV can overestimate resistance when one black reply has not been
  // searched deeply enough. Refine each root candidate independently before
  // applying the same six-ply band; keep both evaluations in the offline audit.
  const candidates = [];
  for (const candidate of proposal.candidates) {
    const p = indexOf(candidate.move);
    if (!analyzeMove(board, p, WHITE).legal) continue;
    const next = board.slice(); next[p] = WHITE;
    const reply = await query([...history, candidate.move], next, 1, rootReplyMs);
    const originalMate = /^-M(\d+)$/.exec(candidate.eval);
    const replyMate = /^\+?M(\d+)$/.exec(reply.candidates[0]?.eval || '');
    const evaluation = originalMate && replyMate ? '-M' + Math.min(Number(originalMate[1]), Number(replyMate[1]) + 1) : candidate.eval;
    candidates.push({ ...candidate, eval: evaluation, rootEvaluation: candidate.eval,
      replyAnalysis: reply.candidates[0] && { move: reply.candidates[0].move, evaluation: reply.candidates[0].eval, depth: reply.candidates[0].depth } });
  }
  return { ...proposal, candidates };
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
async function expand(history, budget) {
  const key = history.join(',');
  if (nodes[key]) return;
  if (budget && --budget.left < 0) throw new BudgetExceeded('Repair budget exhausted: ' + key);
  const { board, outcome } = playChallengeHistory(history);
  if (outcome) { if (outcome.winner !== BLACK) throw new Error('White wins: ' + key); return; }
  if (history.length >= 69) throw new Error('Unclosed at ply limit: ' + key);
  if (history.length % 2 === 0) {
    const prior = Object.keys(original.nodes[key]?.moves || {});
    if (repair && prior.length && finishes(board, prior[0])) { put(history, prior, 'preserved-reply'); return; }
    const finish = immediateFinish(board);
    if (finish) { put(history, [finish.move], 'immediate-' + finish.reason); return; }
    const boardKey = board.join('');
    const search = repair ? !prior.length : !prior.length || history.length <= 22;
    let proofMove = null;
    if (search) {
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
    if (search && !proofMove && (history.length > 8 || whiteSix || whiteFour) && history.length <= 22) {
      const r = await query(history, board, 3, (whiteSix || whiteFour) && history.length === root.split(',').length ? 45000 : 8000);
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
      if (analyzeMove(board, indexOf(move), BLACK).legal) {
        try {
          await expand([...history, move], budget || (repair && !prior.includes(move) ? { left: REPAIR_BUDGET } : undefined));
          put(history, [move], prior.includes(move) ? 'preserved-reply' : move === proofMove ? 'shortest-vcf' : 'engine-reply');
          return;
        } catch (error) {
          if (budget && error instanceof BudgetExceeded) throw error;
          errors.push(error.message);
          console.log('Retry black', history.length + 1, move, error.message.slice(0, 160));
        }
      }
      if (attempt === candidates.length - 1) {
        const r = await query(history, board, 5, 5000);
        // A repair only replaces a reply with a proved win. Otherwise it wanders to the
        // ply limit in positions Black cannot finish, at five seconds a move.
        const engineMoves = repair ? r.candidates.filter(c => /^\+?M\d+$/.test(c.eval)).map(c => c.move) : [r.move, ...r.candidates.map(c => c.move)];
        candidates.push(...[blackVcfMove(board), ...engineMoves].filter(m => m && !candidates.includes(m)));
      }
    }
    throw new Error('No closed black reply: ' + key + '\n' + errors.join('\n'));
  }
  // A position White wins by force means Black's last move was wrong: fail it so
  // the parent tries another reply.
  const counter = whiteForcedWin(board);
  if (counter) throw new Error('White has a forced win: ' + key + ' via ' + counter.join(' '));
  const boardKey = board.join('');
  let screen = screens.get(boardKey);
  if (!screen) { screen = screenWhite(board); screens.set(boardKey, screen); }
  const existing = Object.entries(original.nodes[key]?.moves || {}).filter(([, entry]) => entry.kind !== OPPOSITE_KIND).map(([move]) => move);
  const { moves: chosen, selection, proposal, dropped } = await chooseDefenses(key, history, board, screen, existing);
  const moves = includeRequested(history, board, chosen);
  if (!moves.length) throw new Error('No selected white defense: ' + key);
  const closed = await expandDefenses(history, moves, move => budget || (repair && !existing.includes(move) ? { left: REPAIR_BUDGET } : undefined), repair && !budget && screen.mode !== 'forced');
  if (!closed.length) throw new Error('No closed white defense: ' + key);
  const unclosed = moves.filter(move => !closed.includes(move));
  audit[key] = { mode: screen.mode, emptyPointsChecked: screen.checked, survivingPoints: screen.candidates.length, selection,
    moves: closed, candidates: proposal.candidates.map(({ move, eval: evaluation, evaluation: stored, depth, rootEvaluation, replyAnalysis }) => ({ move, evaluation: evaluation ?? stored, depth,
      ...(rootEvaluation ? { rootEvaluation, replyAnalysis } : {}) })),
    ...(Object.keys(dropped).length ? { omittedFours: Object.entries(dropped).map(([move, reason]) => ({ move, reason })) } : {}),
    ...(unclosed.length ? { unclosedMoves: unclosed } : {}),
    ...(requestedMoves.has(key) ? { requestedMoves: requestedMoves.get(key) } : {}) };
  put(history, closed, label + '-expanded-defense');
}
function writeRepair() {
  fs.writeFileSync(`artifacts/${label}-repair.json`, JSON.stringify({ version: BOOK_VERSION, label, book: bookLabel, root, nodes, audit, unresolved }));
  console.log('Repaired', label, JSON.stringify({ nodes: Object.keys(nodes).length, whitePositions: Object.keys(audit).length, unresolved: unresolved.length, queries }));
}
function publish() {
  const merged = { ...original, nodes: { ...Object.fromEntries(Object.entries(original.nodes).filter(([key]) => !key.startsWith(root))), ...nodes } };
  const published = trimG8Book(merged);
  const reachableAudit = Object.fromEntries(Object.entries(audit).filter(([key]) => published.nodes[key]));
  published.coverage = { ...published.coverage, [label]: {
    root, policy: MENU_POLICY,
    exhaustiveLegalMoves: false, whitePositions: Object.keys(reachableAudit).length,
    ...(Object.entries(reachableAudit).some(([key, entry]) => key.split(',').length === rootWhitePly && entry.candidates?.some(c => c.replyAnalysis)) ? { rootRefinement: { whiteSearchMs: rootWhiteMs, blackReplySearchMs: rootReplyMs, policy: 'Refine each of nine root candidates with an independent black search; use the shorter reported mate bound before applying the same six-ply band.' } } : {}),
    selections: Object.values(reachableAudit).reduce((counts, item) => { counts[item.selection] = (counts[item.selection] || 0) + 1; return counts; }, {})
  } };
  console.log('Verified', JSON.stringify(verifyG8(published, opening)));
  fs.writeFileSync(bookPath, JSON.stringify(published));
  writeCompactG8(published, bookLabel);
  fs.writeFileSync(coveragePath, JSON.stringify({ version: BOOK_VERSION, label, root, policy: published.coverage[label], positions: reachableAudit }));
  console.log(branch + ' coverage', JSON.stringify(published.coverage[label]));
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
      if (audit[key].unclosedMoves) {
        audit[key].unclosedMoves = audit[key].unclosedMoves.filter(move => !moves.includes(move));
        if (!audit[key].unclosedMoves.length) delete audit[key].unclosedMoves;
      }
      put(history, moves, label + '-expanded-defense');
    }
  } else await expand(root.split(','));
  if (repair) writeRepair(); else publish();
} finally { save(); for (const engine of engines) engine.close(); }
