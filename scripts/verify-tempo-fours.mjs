import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import g8 from '../data/g8.json' with { type: 'json' };
import proof from '../data/tempo-four-pruning.json' with { type: 'json' };
import { BOOK_VERSION } from '../src/book.mjs';
import { WHITE, playChallengeHistory } from '../src/renju.mjs';
import { continuationVerifier, redundantFour } from './tempo-fours.mjs';

export function verifyTempoFours() {
  assert.equal(proof.version, BOOK_VERSION);
  assert.equal(proof.format, 'omitted-four-replay-v1');
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
  const result = { positions: Object.keys(proof.positions).length, removedChoices };
  assert.deepEqual(g8.coverage.tempoFourPruning, result);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log('Verified omitted white fours:', JSON.stringify(verifyTempoFours()));
