import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BOOK_VERSION } from '../src/book.mjs';
import { BLACK, WHITE } from '../src/renju.mjs';
import { boardOf } from './tempo-fours.mjs';
import { fourThreeDefenses, missingFourThreeSides, selectOppositeDefenses } from './double-four-three.mjs';
import { trimG8Book } from './trim-books.mjs';
import { writeCompactG8 } from './compact-g8.mjs';

export const OPPOSITE_KIND = 'opposite-four-three-defense';
export const oppositePolicy = 'When Black has multiple legal next-move four-three attacks and no immediate five, cover every attack with a direct White block. Retain existing choices; add blocks of uncovered attacks, each followed by a fixed legal four-three at another point without an immediate White win. At most nine choices, prioritizing occupation of attack points and coverage of every side before additional nearby blocks.';

export function fillFourThreeSides(book, coverages = {}, progress = () => {}) {
  const cache = new Map(), positions = {}, byBranch = {}, nodes = { ...book.nodes };
  let whitePositions = 0, multiThreatPositions = 0, addedChoices = 0;
  for (const [key, original] of Object.entries(book.nodes)) {
    if (original.turn !== WHITE) continue;
    const history = key.split(','), board = boardOf(history), signature = board.join('');
    let analysis = cache.get(signature);
    if (!analysis) { analysis = fourThreeDefenses(board); cache.set(signature, analysis); }
    whitePositions++;
    if (analysis.threats.length >= 2) multiThreatPositions++;
    const selected = selectOppositeDefenses(analysis, Object.keys(original.moves));
    const node = nodes[key] = { ...original, moves: { ...original.moves } };
    for (const d of selected) {
      const reply = d.replies[0];
      node.moves[d.move] = { kind: OPPOSITE_KIND };
      nodes[key + ',' + d.move] = { turn: BLACK, moves: { [reply]: { kind: 'opposite-four-three-finish' } }, maxPliesToEnd: 1 };
      addedChoices++;
    }
    assert.deepEqual(missingFourThreeSides(analysis, Object.keys(node.moves)), []);
    const added = Object.keys(node.moves).filter(move => node.moves[move].kind === OPPOSITE_KIND).map(move => {
      const d = analysis.defenses.find(item => item.move === move);
      const reply = Object.keys(nodes[key + ',' + move]?.moves || {});
      assert.ok(d && reply.length === 1 && d.replies.includes(reply[0]), 'Invalid recorded side defense: ' + key + ',' + move);
      return { move, stops: d.stops, reply: reply[0] };
    });
    if (added.length) {
      positions[key] = { threats: analysis.threats, baseMoves: Object.keys(node.moves).filter(move => node.moves[move].kind !== OPPOSITE_KIND), added };
      const branch = history[7];
      const stat = byBranch[branch] ||= { positions: 0, choices: 0 };
      stat.positions++; stat.choices += added.length;
    }
    for (const coverage of Object.values(coverages)) {
      const entry = coverage.positions[key];
      if (!entry) continue;
      entry.moves = Object.keys(node.moves);
      if (added.length) entry.oppositeFourThreeMoves = added.map(d => d.move);
      else delete entry.oppositeFourThreeMoves;
    }
    if (whitePositions % 5000 === 0) progress({ whitePositions, multiThreatPositions, updated: Object.keys(positions).length, addedChoices });
  }
  const stats = { whitePositions, multiThreatPositions, augmentedPositions: Object.keys(positions).length,
    addedChoices: Object.values(positions).reduce((n, p) => n + p.added.length, 0), byBranch };
  const published = trimG8Book({ ...book, nodes, coverage: { ...book.coverage, doubleFourThree: { policy: oppositePolicy, ...stats } } });
  for (const [label, coverage] of Object.entries(coverages)) {
    coverage.version = BOOK_VERSION;
    coverage.policy = { ...coverage.policy, oppositeFourThreePolicy: oppositePolicy };
    published.coverage[label] = coverage.policy;
  }
  return { book: published, coverages, proof: { version: BOOK_VERSION, format: 'opposite-four-three-v1', policy: oppositePolicy, stats, positions }, addedChoices };
}

function main() {
  const book = JSON.parse(fs.readFileSync('data/g8.json', 'utf8'));
  const coverages = Object.fromEntries(['f10', 'f11', 'h9'].map(label => [label, JSON.parse(fs.readFileSync(`data/${label}-coverage.json`, 'utf8'))]));
  const result = fillFourThreeSides(book, coverages, p => console.log('Four-three coverage', p));
  fs.writeFileSync('data/g8.json', JSON.stringify(result.book));
  const compact = writeCompactG8(result.book);
  for (const [label, coverage] of Object.entries(result.coverages)) fs.writeFileSync(`data/${label}-coverage.json`, JSON.stringify(coverage));
  fs.writeFileSync('data/double-four-three-coverage.json', JSON.stringify(result.proof));
  for (const name of ['responses', 'tempo-four-pruning']) {
    const path = `data/${name}.json`, data = JSON.parse(fs.readFileSync(path, 'utf8'));
    data.version = BOOK_VERSION; fs.writeFileSync(path, JSON.stringify(data));
  }
  console.log('Completed opposite defenses', JSON.stringify({ addedThisRun: result.addedChoices, ...result.proof.stats, book: result.book.stats, runtimeNodes: compact.nodes.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
