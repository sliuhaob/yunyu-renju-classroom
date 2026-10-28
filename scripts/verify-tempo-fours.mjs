import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import g8 from '../data/g8.json' with { type: 'json' };
import proof from '../data/tempo-four-pruning.json' with { type: 'json' };
import opposite from '../data/double-four-three-coverage.json' with { type: 'json' };
import { BOOK_VERSION } from '../src/book.mjs';
import { WHITE, coordOf, playChallengeHistory } from '../src/renju.mjs';
import { continuationVerifier, redundantFour, findRedundantFours, boardOf, follow } from './tempo-fours.mjs';
import { compactG8 } from './compact-g8.mjs';

export function verifyGraftedMenu(key, replay, tree = g8, evidence = proof, sides = opposite) {
  const g8 = tree, proof = evidence, opposite = sides;
  const id = proof.replays[key], node = g8.nodes[key], row = proof.nodes[id];
  assert.ok(row && node?.turn === WHITE, 'Missing graft evidence: ' + key);
  assert.ok(replay(boardOf(key.split(',')), id), 'Grafted strategy no longer wins: ' + key);
  const omitted = new Set((proof.positions[key] || []).map(item => item.move));
  const moves = row.filter((_, i) => i % 2 === 1).map(coordOf).filter(move => !omitted.has(move));
  const added = new Set((opposite.positions[key]?.added || []).map(item => item.move));
  // Opposite-side blocks have their own independent immediate-finish proof.
  assert.deepEqual(Object.keys(node.moves).filter(move => !added.has(move)), moves, 'Grafted menu differs from its verified suffix: ' + key);
  for (let i = 1; i < row.length; i += 2) {
    const move = coordOf(row[i]);
    if (omitted.has(move)) continue;
    const black = proof.nodes[row[i + 1]];
    assert.equal(black?.length, 3);
    assert.deepEqual(Object.keys(g8.nodes[key + ',' + move]?.moves || {}), [coordOf(black[1])], 'Grafted black reply changed');
  }
}

export function verifyTempoFours(tree = g8, evidence = proof, sides = opposite) {
  const g8 = tree, proof = evidence, opposite = sides;
  assert.equal(proof.version, BOOK_VERSION);
  assert.equal(proof.format, 'omitted-four-replay-v2');
  const replay = continuationVerifier(proof.nodes);
  let removedChoices = 0;
  for (const [key, entries] of Object.entries(proof.positions)) {
    const node = g8.nodes[key];
    assert.ok(node && node.turn === WHITE && Object.keys(node.moves).length > 0, 'Invalid pruning parent: ' + key);
    assert.equal(new Set(entries.map(item => item.move)).size, entries.length);
    const { board, outcome } = playChallengeHistory(key.split(','));
    assert.equal(outcome, null);
    for (const { move, reply, suffix } of entries) {
      assert.ok(!node.moves[move], 'Pruned defense was reintroduced: ' + key + ',' + move);
      assert.ok(!g8.nodes[key + ',' + move], 'Orphaned pruned branch');
      const before = [...board];
      assert.ok(redundantFour(board, move, reply, suffix, replay), 'Exchange changes the recorded kill: ' + key + ',' + move);
      assert.deepEqual([...board], before);
      removedChoices++;
    }
  }
  for (const key of Object.keys(proof.replays)) verifyGraftedMenu(key, replay, g8, proof, opposite);
  // Check completeness too: the former singleton safeguard escaped the old
  // verifier, which only inspected already-deleted choices.
  const graph = compactG8(g8), remaining = continuationVerifier(graph.nodes);
  for (const [key, node] of Object.entries(g8.nodes)) if (node.turn === WHITE) {
    const history = key.split(','), id = follow(graph.nodes, graph.root, history);
    assert.deepEqual(findRedundantFours(boardOf(history), graph.nodes[id], graph.nodes, remaining), [], 'Unnecessary four still offered: ' + key);
  }
  const result = { positions: Object.keys(proof.positions).length, removedChoices,
    graftedExchanges: Object.values(proof.positions).flat().filter(item => item.grafted).length,
    replayedPositions: Object.keys(proof.replays).length };
  assert.deepEqual(g8.coverage.tempoFourPruning, result);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log('Verified omitted white fours:', JSON.stringify(verifyTempoFours()));
