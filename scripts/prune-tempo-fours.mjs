import fs from 'node:fs';
import { BOOK_VERSION, OPENING } from '../src/book.mjs';
import { WHITE, indexOf } from '../src/renju.mjs';
import { compactG8, writeCompactG8 } from './compact-g8.mjs';
import { trimG8Book, trimLegacyBook } from './trim-books.mjs';
import { continuationVerifier, boardOf, findRedundantFours } from './tempo-fours.mjs';

const proofPath = 'data/tempo-four-pruning.json';
function prunePass(book, coverages, previous) {
const graph = compactG8(book), replay = continuationVerifier(graph.nodes), positions = {}, nodes = [], ids = new Map();
function copyProof(source, id, prefix) {
  const key = prefix + ':' + id;
  if (id < 0) return -1;
  if (ids.has(key)) return ids.get(key);
  const row = source[id], copy = [row[0]];
  for (let i = 1; i < row.length; i += 2) copy.push(row[i], copyProof(source, row[i + 1], prefix));
  const next = nodes.length; nodes.push(copy); ids.set(key, next); return next;
}
let visited = 0, removed = 0;
function visit(history, id) {
  const key = history.join(','), node = book.nodes[key];
  if (!node) return;
  if (node.turn === WHITE) {
    const omissions = findRedundantFours(boardOf(history), graph.nodes[id], graph.nodes, replay);
    const old = (previous.positions[key] || []).filter(item => !node.moves[item.move]);
    for (const item of omissions) { delete node.moves[item.move]; removed++; }
    const proofs = [
      ...old.map(item => ({ ...item, suffix: copyProof(previous.nodes, item.suffix, 'old') })),
      ...omissions.map(item => ({ ...item, suffix: copyProof(graph.nodes, item.suffix, 'new') }))
    ];
    if (proofs.length) positions[key] = proofs;
    for (const coverage of Object.values(coverages)) if (coverage.positions[key]) {
      coverage.positions[key].moves = Object.keys(node.moves);
      if (proofs.length) coverage.positions[key].omittedTempoFours = proofs.map(item => item.move);
      else delete coverage.positions[key].omittedTempoFours;
    }
  }
  if (++visited % 10000 === 0) console.log('Pruning progress', { visited, removed });
  const row = graph.nodes[id];
  for (const move of Object.keys(node.moves)) {
    const p = indexOf(move);
    for (let i = 1; i < row.length; i += 2) if (row[i] === p) visit([...history, move], row[i + 1]);
  }
}
visit(OPENING, graph.root);
const published = trimG8Book(book);
for (const [label, coverage] of Object.entries(coverages)) {
coverage.positions = Object.fromEntries(Object.entries(coverage.positions).filter(([key]) => published.nodes[key]));
coverage.version = BOOK_VERSION;
coverage.policy = { ...coverage.policy,
  whitePositions: Object.keys(coverage.positions).length,
  tempoFourPolicy: 'Omit a nonessential white four only when the identical full recorded continuation remains legal and wins both with and without its forced white-four/black-block exchange. Preserve forced defenses and at least one choice.',
  selections: Object.values(coverage.positions).reduce((r, p) => { r[p.selection] = (r[p.selection] || 0) + 1; return r; }, {}) };
published.coverage[label] = coverage.policy;
}
published.coverage.tempoFourPruning = { positions: Object.keys(positions).length, removedChoices: Object.values(positions).reduce((n, entries) => n + entries.length, 0) };
return { book: published, proof: { version: BOOK_VERSION, format: 'omitted-four-replay-v1', nodes, positions }, removed };
}

let book = JSON.parse(fs.readFileSync('data/g8.json', 'utf8'));
const coverages = Object.fromEntries(['f10', 'f11'].filter(label => fs.existsSync(`data/${label}-coverage.json`))
  .map(label => [label, JSON.parse(fs.readFileSync(`data/${label}-coverage.json`, 'utf8'))]));
let proof = fs.existsSync(proofPath) ? JSON.parse(fs.readFileSync(proofPath, 'utf8')) : { nodes: [], positions: {} };
let removed = 0, pass;
do {
  pass = prunePass(book, coverages, proof);
  book = pass.book; proof = pass.proof; removed += pass.removed;
  console.log('Pruning pass', { removed: pass.removed, positions: book.stats.positions });
} while (pass.removed);
fs.writeFileSync('data/g8.json', JSON.stringify(book));
const compact = writeCompactG8(book);
for (const [label, coverage] of Object.entries(coverages)) fs.writeFileSync(`data/${label}-coverage.json`, JSON.stringify(coverage));
fs.writeFileSync(proofPath, JSON.stringify(proof));
const legacy = trimLegacyBook(JSON.parse(fs.readFileSync('data/responses.json', 'utf8')));
fs.writeFileSync('data/responses.json', JSON.stringify(legacy));
console.log('Pruned tempo fours', JSON.stringify({ removed, ...book.coverage.tempoFourPruning, stats: book.stats, runtimeNodes: compact.nodes.length }));
