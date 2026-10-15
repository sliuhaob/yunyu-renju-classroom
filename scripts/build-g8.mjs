// Build a closed, curated G8 strategy OFFLINE. Engine scores are proposals;
// only fully expanded legal paths ending in black five are published.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Rapfi } from './rapfi.mjs';
import { vcf } from './tactics.mjs';
import { OPENING, LESSONS, keyOf, BOOK_VERSION } from '../src/book.mjs';
import { BLACK, WHITE, playHistory, indexOf, coordOf, analyzeMove, winningMoves } from '../src/renju.mjs';

const cachePath = new URL('../artifacts/g8-engine-cache.json', import.meta.url);
let cache = {};
try { cache = JSON.parse(await readFile(cachePath)); } catch {}
const engine = new Rapfi(), nodes = {}, alternatives = [], unresolved = [];
let queries = 0;
const engineMs = Number(process.env.G8_ENGINE_MS || 900);
async function query(history, count = 3) {
  const key = keyOf(history) + ':' + count;
  if (cache[key] && (count !== 3 || cache[key].options.length > 1 || cache[key].parser === 2)) return cache[key];
  const result = await engine.analyze(history, count, engineMs);
  const { board } = playHistory(history), color = history.length % 2 ? WHITE : BLACK;
  const options = [...new Set([result.move, ...result.candidates.map(c => c.move)])]
    .filter(c => c && analyzeMove(board, indexOf(c), color).legal);
  if (!options.length) throw new Error('Engine returned no legal candidate: ' + key);
  cache[key] = { options, evaluations: result.candidates, ms: engineMs, parser: 2 };
  queries++;
  if (queries % 10 === 0) { await writeFile(cachePath, JSON.stringify(cache)); console.log('Engine positions', queries, 'tree nodes', Object.keys(nodes).length); }
  return cache[key];
}
function setMoves(history, moves, kind) {
  nodes[keyOf(history)] = { moves: Object.fromEntries(moves.map(move => [move, { kind }])), turn: history.length % 2 ? WHITE : BLACK };
}
function addWhite(history, move, kind = 'candidate') {
  const node = nodes[keyOf(history)] ??= { turn: WHITE, moves: {} };
  node.moves[move] = { kind };
}
function addProof(history, proof) {
  const move = coordOf(proof.move);
  setMoves(history, [move], 'shortest-vcf');
  const nextHistory = [...history, move];
  if (proof.win) return;
  const defenses = proof.threats.map(coordOf);
  setMoves(nextHistory, defenses, 'forced-defense');
  for (const defense of defenses) {
    const child = [...nextHistory, defense];
    if (defenses.length > 1) addProof(child, { move: proof.threats.find(p => coordOf(p) !== defense), win: true });
    else addProof(child, proof.next);
  }
}
// Keep the source main line as a fallback, but replace its suffix as soon as a
// shorter proved VCF exists. Other lines use the engine's strongest reply.
async function line(history, sourceLine = null, collect = false) {
  while (true) {
    const existing = nodes[keyOf(history)];
    if (existing) return;
    const { board, outcome } = playHistory(history);
    if (outcome) { if (outcome.winner !== BLACK) throw new Error('White won: ' + keyOf(history)); return; }
    if (history.length >= 49) throw new Error('Unfinished candidate: ' + keyOf(history));
    const color = history.length % 2 ? WHITE : BLACK;
    if (color === BLACK) {
      const proof = vcf(board, 9, 3000);
      if (proof) { addProof(history, proof); return; }
      const preferred = sourceLine && sourceLine[history.length];
      const move = preferred || (await query(history, 2)).options[0];
      if (!analyzeMove(board, indexOf(move), BLACK).legal) throw new Error('Illegal black ' + move);
      setMoves(history, [move], preferred ? 'source' : 'engine-candidate');
      history = [...history, move];
    } else {
      const forced = winningMoves(board, BLACK).map(coordOf);
      const preferred = sourceLine && sourceLine[history.length];
      const proposal = forced.length ? { options: forced } : await query(history, 3);
      const move = preferred || proposal.options[0];
      setMoves(history, [move], forced.length ? 'forced-defense' : 'candidate');
      if (!forced.length) alternatives.push({ history: [...history], candidates: proposal.options.filter(c => c !== move), expand: collect });
      history = [...history, move];
    }
  }
}

await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
try {
  const prefix = [...OPENING, 'G10', 'G8', 'F9'];
  for (let n = 4; n < prefix.length; n++) setMoves(prefix.slice(0, n), [prefix[n]], 'fixed-opening');
  // Three serious white-eight choices, instead of adding distant filler moves.
  setMoves(prefix, ['F10', 'H11', 'F11'], 'candidate');
  const main = LESSONS.find(l => l.id === 'main').moves;
  for (const w of ['F10', 'H11', 'F11']) {
    console.log('Build white8', w);
    await line([...prefix, w], w === 'F10' ? main : null, true);
  }
  // On the three principal lines, add at most two other engine-ranked defenses.
  // Side lines are closed first; their extra candidates are added only when a
  // complete VCF proof is available. No unproved leaf can reach the runtime.
  for (let i = 0; i < alternatives.length; i++) {
    const { history, candidates, expand } = alternatives[i];
    for (const w of candidates.slice(0, 2)) {
      const { board } = playHistory([...history, w]);
      const proof = vcf(board, 9, 3000);
      if (proof) { addWhite(history, w); addProof([...history, w], proof); }
      else if (expand) {
        console.log('Expand white' + (history.length + 1), w, 'from', history.slice(-4).join(' '));
        const oldKeys = new Set(Object.keys(nodes)), oldAlternatives = alternatives.length;
        try { await line([...history, w]); addWhite(history, w); }
        catch (error) {
          if (!/^(Unfinished candidate|White won):/.test(error.message)) throw error;
          for (const key of Object.keys(nodes)) if (!oldKeys.has(key)) delete nodes[key];
          alternatives.length = oldAlternatives;
          unresolved.push({ history, move: w, reason: error.message });
          console.log('Deferred unclosed candidate', history.length + 1, w);
        }
      }
    }
  }
  // Prove closure and measure minimax distance on the actual curated tree.
  const histogram = {}, leaves = [];
  function close(history) {
    const { outcome } = playHistory(history);
    if (outcome) { if (outcome.winner !== BLACK) throw new Error('White leaf'); leaves.push(history.length); return 0; }
    const node = nodes[keyOf(history)], moves = Object.keys(node?.moves || {});
    if (!moves.length || (node.turn === BLACK && moves.length !== 1) || moves.length > 9) throw new Error('Incomplete/non-deterministic tree: ' + keyOf(history));
    const distances = moves.map(move => 1 + close([...history, move]));
    node.maxPliesToWin = Math.max(...distances);
    if (node.turn === WHITE) histogram[moves.length] = (histogram[moves.length] || 0) + 1;
    return node.maxPliesToWin;
  }
  close(OPENING);
  const output = { version: BOOK_VERSION, scope: 'curated-g8', opening: OPENING, root: keyOf(OPENING), provenance: { engine: 'Rapfi 250615, offline only', engineSource: 'https://github.com/dhbloo/rapfi/releases/tag/250615', rule: 'renju', verification: 'All selected paths replayed under RIF rules to black five; engine evaluations alone are not proof.' }, nodes, stats: {
    positions: Object.keys(nodes).length, terminalPaths: leaves.length, whiteChoiceHistogram: histogram,
    earliestWinPly: Math.min(...leaves), latestWinPly: Math.max(...leaves),
    fastestScope: 'Shortest proved VCF suffix; opening replies are engine/source candidates, not a global shortest-mate proof.'
  }};
  await writeFile(new URL('../data/g8.json', import.meta.url), JSON.stringify(output));
  await writeFile(new URL('../artifacts/g8-unresolved.json', import.meta.url), JSON.stringify(unresolved, null, 2));
  console.log('Built G8', JSON.stringify(output.stats));
} finally {
  await writeFile(cachePath, JSON.stringify(cache)); engine.close();
}
