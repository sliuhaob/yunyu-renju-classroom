import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import { FIXED_OPENING, OPENING } from '../src/book.mjs';
import { compactG8 } from '../scripts/compact-g8.mjs';
import { getState, advance, whiteFourBooks } from '../src/session.mjs';

const state = history => getState(null, history);
const move = (history, defense) => advance(null, history, defense);

test('three fixed stones offer white-four H7/J8/G8 and an automatic black five', async () => {
  assert.deepEqual(FIXED_OPENING, ['H8', 'I9', 'I8']);
  assert.deepEqual(state(FIXED_OPENING).choices, ['H7', 'J8', 'G8']);
  assert.equal(state(FIXED_OPENING).turn, 2);
  assert.equal(state(FIXED_OPENING).maxPliesToEnd, Math.max(...Object.values(whiteFourBooks).map(book => book.nodes[book.root][0])) + 1);
  for (const choice of state(FIXED_OPENING).choices) {
    const original = [...FIXED_OPENING], after = move(original, choice.toLowerCase());
    assert.deepEqual(original, FIXED_OPENING);
    assert.equal(after.history.length, 5);
    assert.equal(after.history[3], choice);
    assert.equal(after.history[4], after.blackMove);
    assert.equal(after.turn, 2);
    // Reset, replay and undo return to the same three-stone menu.
    assert.deepEqual(state(after.history.slice(0, 3)).choices, ['H7', 'J8', 'G8']);
  }
  assert.deepEqual(move(FIXED_OPENING, 'H7').history, [...OPENING, 'G10']);
  assert.deepEqual(move(FIXED_OPENING, 'H7').choices, ['G8', 'J7', 'H9', 'G9']);
  const catalog = await (await worker.fetch(new Request('https://api.example/api/lessons'))).json();
  assert.deepEqual(catalog.opening, FIXED_OPENING);
  assert.deepEqual(Object.keys(catalog.whiteFour), ['H7', 'J8', 'G8']);
  for (const choice of ['J8', 'G8']) {
    const response = await worker.fetch(new Request('https://api.example/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history: FIXED_OPENING, move: choice }) }));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).history, move(FIXED_OPENING, choice).history);
  }
});

for (const [label, choice] of [['w4j8', 'J8'], ['w4g8', 'G8']]) test(`${choice} runtime preserves all raw defenses, fixed replies and endpoints`, () => {
  const tree = JSON.parse(fs.readFileSync(new URL(`../data/${label}.json`, import.meta.url), 'utf8'));
  assert.deepEqual(tree.opening, [...FIXED_OPENING, choice]);
  assert.deepEqual(whiteFourBooks[choice], compactG8(tree));
  let leaves = 0;
  for (const [key, node] of Object.entries(tree.nodes)) {
    const history = key.split(','), current = state(history);
    assert.deepEqual(current.choices, Object.keys(node.moves), key);
    assert.equal(current.maxPliesToEnd, node.maxPliesToEnd);
    for (const defense of current.choices) {
      const next = state([...history, defense]);
      if (next.outcome) {
        leaves++;
        assert.equal(next.outcome.winner, 1);
        assert.ok(['four-three', 'five'].includes(next.outcome.reason));
        assert.deepEqual(next.choices, []);
        assert.throws(() => move(next.history, 'A1'), e => e.status === 409);
      } else if (next.turn === 2) assert.ok(next.choices.length >= 1 && next.choices.length <= 9);
      else assert.equal(next.choices.length, 1);
    }
  }
  assert.equal(leaves, tree.stats.terminalPaths);
});

test('white-four entry rejects malformed prefixes, unsupported defenses and forged replies', () => {
  assert.throws(() => state(['H8', 'I9']), e => e.code === 'BAD_HISTORY');
  assert.throws(() => state(['H8', 'I10', 'I8']), e => e.code === 'BAD_OPENING');
  assert.throws(() => move(FIXED_OPENING, 'A1'), e => e.code === 'OUT_OF_BOOK');
  for (const choice of ['H7', 'J8', 'G8']) assert.throws(() => state([...FIXED_OPENING, choice, 'A1']), e => e.code === 'BAD_REPLY');
  assert.throws(() => getState(null, FIXED_OPENING, 'main'), e => e.code === 'BAD_HISTORY');
  assert.throws(() => getState(null, [...FIXED_OPENING, 'J8'], 'j7'), e => e.code === 'BAD_OPENING');
});
