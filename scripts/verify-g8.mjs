import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import g8 from '../data/g8.json' with { type: 'json' };
import { OPENING, BOOK_VERSION, keyOf } from '../src/book.mjs';
import { BLACK, WHITE, playHistory, analyzeMove, indexOf, coordOf, winningMoves } from '../src/renju.mjs';

export function verifyG8(tree = g8) {
  assert.equal(tree.version, BOOK_VERSION);
  assert.deepEqual(tree.opening, OPENING);
  const visited = new Set(), endings = [], histogram = {};
  function visit(history) {
    const { board, outcome } = playHistory(history);
    if (outcome) { assert.equal(outcome.winner, BLACK); endings.push(history.length); return 0; }
    const key = keyOf(history), node = tree.nodes[key], color = history.length % 2 ? WHITE : BLACK;
    assert.ok(node, 'Unclosed branch: ' + key);
    visited.add(key);
    assert.equal(node.turn, color);
    const moves = Object.keys(node.moves);
    if (color === BLACK) assert.equal(moves.length, 1, 'Black reply is not fixed');
    else {
      assert.ok(moves.length >= 1 && moves.length <= 9, 'White choices must be single-digit');
      assert.equal(winningMoves(board, WHITE).length, 0, 'An immediate white win was hidden by the menu');
      const threats = winningMoves(board, BLACK).map(coordOf);
      if (threats.length) assert.deepEqual([...moves].sort(), [...threats].sort(), 'A forced defense was omitted or a pointless move was added');
      histogram[moves.length] = (histogram[moves.length] || 0) + 1;
    }
    const distances = moves.map(move => {
      assert.equal(analyzeMove(board, indexOf(move), color).legal, true, key + ' -> ' + move);
      return 1 + visit([...history, move]);
    });
    const max = Math.max(...distances);
    assert.equal(node.maxPliesToWin, max, 'Incorrect remaining distance');
    return max;
  }
  visit(OPENING);
  assert.equal(visited.size, Object.keys(tree.nodes).length, 'Unreachable nodes');
  assert.equal(endings.length, tree.stats.terminalPaths);
  assert.deepEqual(histogram, tree.stats.whiteChoiceHistogram);
  assert.equal(Math.min(...endings), tree.stats.earliestWinPly);
  assert.equal(Math.max(...endings), tree.stats.latestWinPly);
  return { positions: visited.size, paths: endings.length, histogram, earliest: Math.min(...endings), latest: Math.max(...endings) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log('Verified complete curated G8 tree:', JSON.stringify(verifyG8()));
