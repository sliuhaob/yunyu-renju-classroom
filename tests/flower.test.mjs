import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import { FIXED_OPENING, FLOWER_OPENING } from '../src/book.mjs';
import { getState, advance, flowerBooks } from '../src/session.mjs';
import { compactG8 } from '../scripts/compact-g8.mjs';

test('opening selection exposes distinct three-stone roots and white-four menus', async () => {
  const catalog = await (await worker.fetch(new Request('https://api.example/api/lessons'))).json();
  const visible = catalog.lessons.filter(l => !l.hidden);
  assert.deepEqual(visible.map(l => [l.id, l.opening]), [['opening', FIXED_OPENING], ['flower', FLOWER_OPENING]]);
  assert.deepEqual(getState(null, FIXED_OPENING).choices, ['H7', 'J8', 'G8']);
  assert.deepEqual(getState(null, FLOWER_OPENING, 'flower').choices, ['H9', 'G7', 'H10']);
  assert.throws(() => getState(null, FLOWER_OPENING), e => e.code === 'BAD_OPENING');
  assert.throws(() => getState(null, FIXED_OPENING, 'flower'), e => e.code === 'BAD_OPENING');
  assert.throws(() => advance(null, FLOWER_OPENING, 'J8', 'flower'), e => e.code === 'OUT_OF_BOOK');
  for (const move of ['H9', 'G7', 'H10']) {
    const request = new Request('https://api.example/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history: FLOWER_OPENING, move: move.toLowerCase(), lessonId: 'flower' }) });
    const response = await worker.fetch(request), after = await response.json();
    assert.equal(response.status, 200);
    assert.equal(after.lessonId, 'flower');
    assert.deepEqual(after.history.slice(0, 4), [...FLOWER_OPENING, move]);
    assert.equal(after.history.length, 5);
    assert.deepEqual(getState(null, after.history.slice(0, 3), 'flower').choices, ['H9', 'G7', 'H10']);
    assert.equal(catalog.flowerWhiteFour[move].terminalPaths, flowerBooks[move].stats.terminalPaths);
  }
});

for (const move of ['H9', 'G7', 'H10']) test(`every flower ${move} path preserves its raw choices, replies, distance and endpoint`, () => {
  const tree = JSON.parse(fs.readFileSync(new URL(`../data/flower-w4${move.toLowerCase()}.json`, import.meta.url)));
  assert.deepEqual(tree.opening, [...FLOWER_OPENING, move]);
  assert.deepEqual(flowerBooks[move], compactG8(tree));
  let leaves = 0;
  for (const [key, node] of Object.entries(tree.nodes)) {
    const h = key.split(','), state = getState(null, h, 'flower');
    assert.deepEqual(state.choices, Object.keys(node.moves), key);
    assert.equal(state.maxPliesToEnd, node.maxPliesToEnd);
    for (const choice of state.choices) {
      const next = getState(null, [...h, choice], 'flower');
      if (next.outcome) {
        leaves++;
        assert.equal(next.outcome.winner, 1);
        assert.ok(['four-three', 'five'].includes(next.outcome.reason));
        assert.deepEqual(next.choices, []);
        assert.throws(() => advance(null, next.history, 'A1', 'flower'), e => e.status === 409);
      } else assert.ok(next.choices.length >= 1 && next.choices.length <= (next.turn === 1 ? 1 : 9));
    }
  }
  assert.equal(leaves, tree.stats.terminalPaths);
});
