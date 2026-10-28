import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BOOK_VERSION, OPENING } from '../src/book.mjs';
import { coordOf } from '../src/renju.mjs';
import { compactG8, writeCompactG8 } from './compact-g8.mjs';
import { trimG8Book, trimLegacyBook } from './trim-books.mjs';
import { continuationVerifier, boardOf, findRedundantFours } from './tempo-fours.mjs';
import { screenWhite } from './f10-candidates.mjs';
import { fillFourThreeSides } from './augment-double-four-three.mjs';

export function prunePass(book, coverages = {}, previous = { nodes: [], positions: {} }, progress = () => {}) {
  const graph = compactG8(book), replay = continuationVerifier(graph.nodes);
  const positions = {}, replays = {}, nodes = [], ids = new Map(), signatures = new Map(), output = {};
  const audits = Object.fromEntries(Object.entries(coverages).map(([label, coverage]) => [label, { ...coverage, positions: {} }]));
  function copyProof(source, id, prefix) {
    if (id < 0) return -1;
    const key = prefix + ':' + id;
    if (ids.has(key)) return ids.get(key);
    const row = source[id], copy = [row[0]];
    for (let i = 1; i < row.length; i += 2) copy.push(row[i], copyProof(source, row[i + 1], prefix));
    const signature = JSON.stringify(copy);
    let next = signatures.get(signature);
    if (next === undefined) { next = nodes.length; nodes.push(copy); signatures.set(signature, next); }
    ids.set(key, next); return next;
  }
  let visited = 0, removed = 0, collapsed = 0;
  function visit(history, sourceHistory, id, grafted = false) {
    if (id < 0) return;
    const key = history.join(','), white = history.length % 2 === 1, board = white ? boardOf(history) : null;
    let row = graph.nodes[id], omissions = [], removedMoves = new Set();
    if (white) {
      // Resolve chains before copying the remaining strategy. The immutable
      // source graph keeps every deletion independently replayable.
      while (true) {
        const found = findRedundantFours(board, row, graph.nodes, replay);
        removed += found.length;
        const all = found.length > 0 && found.length === (row.length - 1) / 2;
        const chosen = all ? found.reduce((a, b) => graph.nodes[a.suffix][0] <= graph.nodes[b.suffix][0] ? a : b) : null;
        omissions.push(...found.map(item => ({ ...item, ...(item === chosen ? { grafted: true } : {}) })));
        if (!all) { removedMoves = new Set(found.map(item => item.move)); break; }
        id = chosen.suffix; row = graph.nodes[id];
        sourceHistory = [...sourceHistory, chosen.move, chosen.reply];
        grafted = true; collapsed++;
      }
    }
    const source = book.nodes[sourceHistory.join(',')];
    assert.ok(source, 'Missing source subtree: ' + sourceHistory.join(','));
    const moves = {};
    for (let i = 1; i < row.length; i += 2) {
      const move = coordOf(row[i]);
      if (!removedMoves.has(move)) moves[move] = source.moves[move];
    }
    assert.ok(Object.keys(moves).length, 'Pruning produced an empty menu: ' + key);
    output[key] = { ...source, moves };
    if (white) {
      // Chained grafts can offer the same coordinate again with a different
      // black reply. Record one proof per actually removed menu choice; a
      // coordinate retained by the final suffix is not a removed choice.
      const uniqueOmissions = [...new Map(omissions.filter(item => !moves[item.move]).map(item => [item.move, item])).values()];
      const old = (previous.positions[key] || []).filter(item => !moves[item.move] && !uniqueOmissions.some(next => next.move === item.move));
      const proofs = [
        ...old.map(item => ({ ...item, suffix: copyProof(previous.nodes, item.suffix, 'old') })),
        ...uniqueOmissions.map(item => ({ ...item, suffix: copyProof(graph.nodes, item.suffix, 'new') }))
      ];
      assert.equal(new Set(proofs.map(item => item.move)).size, proofs.length);
      if (proofs.length) positions[key] = proofs;
      if (grafted) replays[key] = copyProof(graph.nodes, id, 'new');
      else if (previous.replays?.[key] !== undefined) replays[key] = copyProof(previous.nodes, previous.replays[key], 'old');
      for (const [label, coverage] of Object.entries(coverages)) {
        if (!key.startsWith(coverage.root + ',')) continue;
        const oldEntry = coverage.positions[key];
        assert.ok(grafted || oldEntry, 'Missing coverage: ' + key);
        const entry = grafted ? { selection: 'tempo-replay', needsScreen: true,
          ...(oldEntry?.requestedMoves ? { requestedMoves: oldEntry.requestedMoves } : {}) } : { ...oldEntry };
        entry.moves = Object.keys(moves);
        if (proofs.length) entry.omittedTempoFours = proofs.map(item => item.move);
        else delete entry.omittedTempoFours;
        audits[label].positions[key] = entry;
      }
    }
    if (++visited % 10000 === 0) progress({ visited, removed, collapsed });
    for (let i = 1; i < row.length; i += 2) {
      const move = coordOf(row[i]);
      if (moves[move]) visit([...history, move], [...sourceHistory, move], row[i + 1], grafted);
    }
  }
  visit(OPENING, OPENING, graph.root);
  const published = trimG8Book({ ...book, nodes: output, coverage: { ...book.coverage } });
  for (const [label, coverage] of Object.entries(audits)) {
    coverage.version = BOOK_VERSION;
    coverage.policy = { ...coverage.policy,
      whitePositions: Object.keys(coverage.positions).length,
      tempoFourPolicy: 'Omit a nonessential white four only when the identical full recorded continuation remains legal and wins with and without its forced white-four/black-block exchange. Preserve forced defenses. Replace all-redundant menus with the shortest verified suffix, including singleton and chained exchanges; audit grafted menus against that recorded strategy.',
      selections: Object.values(coverage.positions).reduce((r, p) => { r[p.selection] = (r[p.selection] || 0) + 1; return r; }, {}) };
    published.coverage[label] = coverage.policy;
  }
  published.coverage.tempoFourPruning = { positions: Object.keys(positions).length,
    removedChoices: Object.values(positions).reduce((n, entries) => n + entries.length, 0),
    graftedExchanges: Object.values(positions).flat().filter(item => item.grafted).length,
    replayedPositions: Object.keys(replays).length };
  return { book: published, coverages: audits,
    proof: { version: BOOK_VERSION, format: 'omitted-four-replay-v2', nodes, positions, replays }, removed, collapsed };
}

function main() {
  const label = process.argv.find(arg => arg.startsWith('--book='))?.split('=')[1] || 'g8';
  assert.ok(['g8', 'j7', 'w6h9', 'w6g9'].includes(label), 'Unknown book');
  const prefix = label === 'g8' ? '' : label + '-';
  const proofPath = `data/${prefix}tempo-four-pruning.json`;
  let book = JSON.parse(fs.readFileSync(`data/${label}.json`, 'utf8'));
  let coverages = Object.fromEntries((label === 'g8' ? ['f10', 'f11', 'h9'] : [label]).filter(label => fs.existsSync(`data/${label}-coverage.json`))
    .map(label => [label, JSON.parse(fs.readFileSync(`data/${label}-coverage.json`, 'utf8'))]));
  let proof = fs.existsSync(proofPath) ? JSON.parse(fs.readFileSync(proofPath, 'utf8')) : { nodes: [], positions: {} };
  let removed = 0, collapsed = 0, pass;
  do {
    pass = prunePass(book, coverages, proof, progress => console.log('Pruning progress', progress));
    book = pass.book; proof = pass.proof; coverages = pass.coverages;
    removed += pass.removed; collapsed += pass.collapsed;
    console.log('Pruning pass', { removed: pass.removed, collapsed: pass.collapsed, positions: book.stats.positions });
  } while (pass.removed);
  // Re-screen changed boards; never reuse an old board's tactical audit.
  const screens = new Map(); let screened = 0;
  for (const coverage of Object.values(coverages)) for (const [key, entry] of Object.entries(coverage.positions)) {
    if (!entry.needsScreen) continue;
    const board = boardOf(key.split(',')), signature = board.join('');
    let screen = screens.get(signature);
    if (!screen) { screen = screenWhite(board); screens.set(signature, screen); }
    Object.assign(entry, { mode: screen.mode, emptyPointsChecked: screen.checked, survivingPoints: screen.candidates.length });
    delete entry.needsScreen;
    if (++screened % 1000 === 0) console.log('Replayed coverage screened', screened);
  }
  // Complete both attack sides after trimming/grafting so rebuilding the book
  // cannot bring back the former one-sided terminal-example menus.
  const opposite = fillFourThreeSides(book, coverages, p => console.log('Four-three coverage', p));
  book = opposite.book; coverages = opposite.coverages;
  fs.writeFileSync(`data/${prefix}double-four-three-coverage.json`, JSON.stringify(opposite.proof));
  fs.writeFileSync(`data/${label}.json`, JSON.stringify(book));
  const compact = writeCompactG8(book, label);
  for (const [label, coverage] of Object.entries(coverages)) fs.writeFileSync(`data/${label}-coverage.json`, JSON.stringify(coverage));
  fs.writeFileSync(proofPath, JSON.stringify(proof));
  if (label === 'g8') {
    const legacy = trimLegacyBook(JSON.parse(fs.readFileSync('data/responses.json', 'utf8')));
    fs.writeFileSync('data/responses.json', JSON.stringify(legacy));
  }
  console.log('Pruned tempo fours', JSON.stringify({ removed, collapsed, ...book.coverage.tempoFourPruning, stats: book.stats, runtimeNodes: compact.nodes.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
