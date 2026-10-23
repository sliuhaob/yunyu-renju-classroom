// Build a closed, curated G8 strategy OFFLINE. Engine scores are proposals;
// Build verified winning lines, then publish only up to the first four-three/five.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Rapfi } from './rapfi.mjs';
import { trimG8Book } from './trim-books.mjs';
import { writeCompactG8 } from './compact-g8.mjs';
import { vcf } from './tactics.mjs';
import { OPENING, LESSONS, keyOf, BOOK_VERSION } from '../src/book.mjs';
import { BLACK, WHITE, playHistory, indexOf, coordOf, analyzeMove, winningMoves } from '../src/renju.mjs';

const cachePath = new URL('../artifacts/g8-engine-cache.json', import.meta.url);
const previousBook = JSON.parse(await readFile(new URL('../data/g8.json', import.meta.url)));
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
  const whiteEight = ['F10', 'H11', 'F11', 'H9'];
  setMoves(prefix, whiteEight, 'candidate');
  const main = LESSONS.find(l => l.id === 'main').moves;
  for (const w of whiteEight) {
    console.log('Build white8', w);
    await line([...prefix, w], w === 'F10' ? main : null, true);
  }
  // Explicitly requested defenses are fully expanded, even when outside the
  // engine's candidate shortlist. Attach them only after their lines close.
  const requested = [
    { history: [...prefix, 'H11', 'E9'], move: 'D9' },
    { history: [...prefix, 'H11', 'E9', 'D9', 'F11'], move: 'E12' },
    { history: [...prefix, 'H11', 'E9'], move: 'F11' },
    { history: [...prefix, 'H11', 'E9'], move: 'H9' },
    { history: [...prefix, 'H11', 'E9', 'F11', 'D9', 'C9', 'F10', 'E11', 'G11', 'D8', 'H10'], move: 'I10' },
    { history: [...prefix, 'H11', 'E9', 'F11', 'D9', 'C9', 'F10', 'E11', 'G11', 'D8', 'H10', 'I10', 'F8'], move: 'D10' },
    { history: [...prefix, 'H11', 'E9', 'F11', 'D9', 'C9', 'F10'], move: 'G9' },
    { history: [...prefix, 'H11', 'E9', 'F11', 'D9', 'C9', 'F10'], move: 'E10' },
    { history: [...prefix, 'H11', 'E9', 'F11', 'D9', 'C9', 'F10', 'G9', 'D10', 'E10', 'D7', 'D8', 'F7'], move: 'F8' },
    { history: [...prefix, 'H11', 'E9', 'F11', 'D9', 'G9', 'E11', 'C9', 'E10', 'E8', 'D10', 'F10', 'D12'], move: 'D11' },
    { history: [...prefix, 'H11', 'E9', 'H9', 'F10', 'G9', 'D10', 'J9', 'K9'], move: 'E10' },
    { history: [...prefix, 'H11', 'E9', 'H9', 'F10', 'G9', 'D10'], move: 'E10' }
  ];
  for (const { history, move } of requested) {
    const { board, outcome } = playHistory(history);
    // The parent may be created later while expanding an existing side line.
    if (history.length % 2 !== 1 || outcome || !analyzeMove(board, indexOf(move), WHITE).legal) throw new Error('Invalid requested defense: ' + keyOf(history) + ' -> ' + move);
    console.log('Build requested white' + (history.length + 1), move);
    await line([...history, move], null, true);
  }
  // On the principal lines, add at most two other engine-ranked defenses.
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
  for (const { history, move } of requested) {
    if (nodes[keyOf(history)]?.turn !== WHITE) throw new Error('Requested defense parent not recorded: ' + keyOf(history));
    addWhite(history, move);
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
  let published = trimG8Book(output);
  // Adding a requested branch elsewhere must not replace the recursively
  // expanded strategies with the older three-candidate seed generator.
  for (const label of ['f10', 'f11', 'h9']) if (previousBook.coverage?.[label]) {
    const root = previousBook.coverage[label].root;
    published = trimG8Book({ ...published, coverage: previousBook.coverage, nodes: {
      ...Object.fromEntries(Object.entries(published.nodes).filter(([key]) => !key.startsWith(root))),
      ...Object.fromEntries(Object.entries(previousBook.nodes).filter(([key]) => key.startsWith(root)))
    } });
    const coveragePath = new URL(`../data/${label}-coverage.json`, import.meta.url);
    const coverage = JSON.parse(await readFile(coveragePath));
    coverage.version = BOOK_VERSION;
    await writeFile(coveragePath, JSON.stringify(coverage));
  }
  await writeFile(new URL('../data/g8.json', import.meta.url), JSON.stringify(published));
  writeCompactG8(published);
  await writeFile(new URL('../artifacts/g8-unresolved.json', import.meta.url), JSON.stringify(unresolved, null, 2));
  console.log('Built G8', JSON.stringify(published.stats));
} finally {
  await writeFile(cachePath, JSON.stringify(cache)); engine.close();
}
