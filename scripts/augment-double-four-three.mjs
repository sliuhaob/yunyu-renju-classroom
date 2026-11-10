import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BOOK_VERSION } from '../src/book.mjs';
import { BLACK, WHITE, coordOf, indexOf, winningMoves } from '../src/renju.mjs';
import { boardOf } from './tempo-fours.mjs';
import { fourThreeDefenses, missingFourThreeSides, selectOppositeDefenses } from './double-four-three.mjs';
import { trimG8Book } from './trim-books.mjs';
import { writeCompactG8 } from './compact-g8.mjs';

export const OPPOSITE_KIND = 'opposite-four-three-defense';
export const oppositePolicy = 'When Black has any next-move standing four-three or open four and no immediate five, cover every attack with a direct White block. Retain existing choices; add quiet blocks of uncovered attacks, each followed by a fixed finish at another attack point: a standing four-three, or an open four played out to five. At most nine choices, prioritizing occupation of attack points and coverage of every side before additional nearby blocks; when nine are not enough, a choice whose attacks another choice covers makes way.';

// Black's open four still has to be played out: White blocks one end, Black takes the other.
function playOutOpenFour(nodes, coverages, key, board) {
  const blocks = winningMoves(board, BLACK), moves = blocks.map(coordOf);
  nodes[key] = { turn: WHITE, moves: Object.fromEntries(moves.map(move => [move, { kind: 'opposite-open-four-block' }])) };
  for (const move of moves) nodes[key + ',' + move] = { turn: BLACK, moves: { [moves.find(other => other !== move)]: { kind: 'opposite-open-four-finish' } }, maxPliesToEnd: 1 };
  for (const coverage of Object.values(coverages)) if (key.startsWith(coverage.root + ','))
    coverage.positions[key] = { mode: 'forced', emptyPointsChecked: 225 - board.filter(Boolean).length, survivingPoints: moves.length, selection: 'all-forced', moves, candidates: [] };
}

// Nine choices can be full of blocks of the same attack. Give up the last one whose
// attacks are still covered without it, so the side it crowds out gets a slot.
function makeRoom(analysis, moves, keep) {
  for (const move of [...moves].reverse()) {
    if (keep.includes(move)) continue;
    const rest = moves.filter(other => other !== move);
    if (missingFourThreeSides(analysis, rest).length <= missingFourThreeSides(analysis, moves).length) return move;
  }
  return null;
}

export function fillFourThreeSides(book, coverages = {}, progress = () => {}) {
  const cache = new Map(), positions = {}, nodes = { ...book.nodes }, uncovered = [];
  let whitePositions = 0, multiThreatPositions = 0, addedChoices = 0;
  for (const [key, original] of Object.entries(book.nodes)) {
    if (original.turn !== WHITE) continue;
    const history = key.split(','), board = boardOf(history), signature = board.join('');
    let analysis = cache.get(signature);
    if (!analysis) { analysis = fourThreeDefenses(board); cache.set(signature, analysis); }
    whitePositions++;
    if (analysis.threats.length >= 2) multiThreatPositions++;
    const node = nodes[key] = { ...original, moves: { ...original.moves } };
    const requested = Object.values(coverages).flatMap(coverage => coverage.positions[key]?.requestedMoves || []);
    let selected = selectOppositeDefenses(analysis, Object.keys(node.moves));
    while (missingFourThreeSides(analysis, [...Object.keys(node.moves), ...selected.map(d => d.move)]).length && Object.keys(node.moves).length + selected.length >= 9) {
      const out = makeRoom(analysis, Object.keys(node.moves), requested);
      if (!out) break;
      delete node.moves[out];
      for (const coverage of Object.values(coverages)) if (coverage.positions[key]) (coverage.positions[key].sideEvictedMoves ||= []).push(out);
      selected = selectOppositeDefenses(analysis, Object.keys(node.moves));
    }
    for (const d of selected) {
      const reply = d.replies[0], stone = indexOf(d.move), finish = indexOf(reply);
      node.moves[d.move] = { kind: OPPOSITE_KIND };
      nodes[key + ',' + d.move] = { turn: BLACK, moves: { [reply]: { kind: 'opposite-four-three-finish' } }, maxPliesToEnd: 1 };
      if (d.replyKinds[reply] === 'open-four') {
        board[stone] = WHITE; board[finish] = BLACK;
        playOutOpenFour(nodes, coverages, key + ',' + d.move + ',' + reply, board);
        board[stone] = 0; board[finish] = 0;
      }
      addedChoices++;
    }
    const leftOver = missingFourThreeSides(analysis, Object.keys(node.moves));
    if (leftOver.length) uncovered.push({ key, threats: leftOver });
    const added = Object.keys(node.moves).filter(move => node.moves[move].kind === OPPOSITE_KIND).map(move => {
      const d = analysis.defenses.find(item => item.move === move);
      const reply = Object.keys(nodes[key + ',' + move]?.moves || {});
      assert.ok(d && reply.length === 1 && d.replies.includes(reply[0]), 'Invalid recorded side defense: ' + key + ',' + move);
      return { move, stops: d.stops, reply: reply[0], finish: d.replyKinds[reply[0]] };
    });
    if (added.length) {
      positions[key] = { threats: analysis.threats, baseMoves: Object.keys(node.moves).filter(move => node.moves[move].kind !== OPPOSITE_KIND), added };
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
  if (uncovered.length) console.log('Attacks left without a direct defense', uncovered.length, JSON.stringify(uncovered.slice(0, 5)));
  const published = trimG8Book({ ...book, nodes });
  // Count on the trimmed tree: evicted branches have left, played-out open fours have arrived.
  const reachable = Object.entries(published.nodes).filter(([, node]) => node.turn === WHITE).map(([key]) => key);
  for (const key of Object.keys(positions)) if (!published.nodes[key]) delete positions[key];
  const branches = {};
  for (const [key, entry] of Object.entries(positions)) {
    const stat = branches[key.split(',')[7]] ||= { positions: 0, choices: 0 };
    stat.positions++; stat.choices += entry.added.length;
  }
  const stats = { whitePositions: reachable.length, multiThreatPositions: reachable.filter(key => (cache.get(boardOf(key.split(',')).join(''))?.threats.length || 0) >= 2).length,
    augmentedPositions: Object.keys(positions).length, addedChoices: Object.values(positions).reduce((n, p) => n + p.added.length, 0), byBranch: branches };
  published.coverage = { ...published.coverage, doubleFourThree: { policy: oppositePolicy, ...stats } };
  for (const [label, coverage] of Object.entries(coverages)) {
    for (const key of Object.keys(coverage.positions)) if (!published.nodes[key]) delete coverage.positions[key];
    coverage.version = BOOK_VERSION;
    coverage.policy = { ...coverage.policy, oppositeFourThreePolicy: oppositePolicy, whitePositions: Object.keys(coverage.positions).length,
      selections: Object.values(coverage.positions).reduce((counts, item) => { counts[item.selection] = (counts[item.selection] || 0) + 1; return counts; }, {}) };
    published.coverage[label] = coverage.policy;
  }
  return { book: published, coverages, proof: { version: BOOK_VERSION, format: 'opposite-four-three-v2', policy: oppositePolicy, stats, positions }, addedChoices, uncovered };
}

function main() {
  const book = JSON.parse(fs.readFileSync('data/g8.json', 'utf8'));
  const coverages = Object.fromEntries(['f10', 'f11', 'h9', 'h11'].map(label => [label, JSON.parse(fs.readFileSync(`data/${label}-coverage.json`, 'utf8'))]));
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
