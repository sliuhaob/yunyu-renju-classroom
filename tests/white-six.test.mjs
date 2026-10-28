import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import { OPENING, CHALLENGE } from '../src/book.mjs';
import { compactG8 } from '../scripts/compact-g8.mjs';
import { getState, advance, whiteSixBooks } from '../src/session.mjs';

const state = history => getState(null, history, CHALLENGE.id);
const move = (history, defense) => advance(null, history, defense, CHALLENGE.id);
const start = [...OPENING, 'G10'];

test('unified opening starts at white six and switches between all four books', async () => {
  assert.deepEqual(state(OPENING).choices, ['G10']);
  assert.deepEqual(move(OPENING).history, start);
  assert.deepEqual(state(start).choices, ['G8', 'J7', 'H9', 'G9']);
  assert.deepEqual(getState(null, start).choices, state(start).choices);
  for (const defense of state(start).choices) {
    const original = start.slice(), result = move(original, defense.toLowerCase());
    assert.deepEqual(original, start);
    assert.equal(result.history.length, 7);
    assert.equal(result.history[5], defense);
    assert.equal(result.lessonId, 'opening');
    assert.ok(result.choices.length >= 1 && result.choices.length <= 9);
    // Replaying or undoing to white six permits choosing a different book.
    assert.deepEqual(state(result.history.slice(0, 5)).choices, ['G8', 'J7', 'H9', 'G9']);
    for (const alternative of state(start).choices) assert.equal(move(result.history.slice(0, 5), alternative).history[5], alternative);
  }
  const catalog = await (await worker.fetch(new Request('https://api.example/api/lessons'))).json();
  assert.deepEqual(catalog.lessons.filter(l => !l.hidden).map(l => l.id), ['opening']);
  assert.deepEqual(Object.keys(catalog.whiteSix), ['G8', 'J7', 'H9', 'G9']);
  const response = await worker.fetch(new Request('https://api.example/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history: OPENING }) }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).choices, state(start).choices);
});

test('all four unified strategies exactly preserve every stored choice and black reply', () => {
  for (const [label, defense] of [['g8', 'G8'], ['j7', 'J7'], ['w6h9', 'H9'], ['w6g9', 'G9']]) {
    const tree = JSON.parse(fs.readFileSync(new URL(`../data/${label}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(whiteSixBooks[defense], compactG8(tree));
    for (const [key, node] of Object.entries(tree.nodes)) {
      const history = key.split(',');
      if (history.length < 6) continue; // Shared prefix intentionally adds white-six options.
      const current = state(history);
      assert.deepEqual(current.choices, Object.keys(node.moves), key);
      assert.equal(current.maxPliesToEnd, node.maxPliesToEnd);
      if (label.startsWith('w6')) for (const choice of current.choices) {
        const next = move(history, current.turn === 2 ? choice : undefined);
        assert.ok(next.outcome?.winner === 1 || next.turn === 2 && next.choices.length >= 1 && next.choices.length <= 9);
        if (next.outcome) {
          assert.deepEqual(next.choices, []);
          assert.throws(() => move(next.history, 'A1'), e => e.status === 409);
        }
      }
    }
  }
});

test('unified entry rejects forged history and unsupported moves', () => {
  assert.throws(() => state(['H8', 'I9', 'I8', 'H6']), e => e.code === 'BAD_OPENING');
  assert.throws(() => state([...OPENING, 'J10']), e => e.code === 'BAD_REPLY');
  assert.throws(() => state([...start, 'A1']), e => e.code === 'OUT_OF_BOOK');
  assert.throws(() => move(start, 'A1'), e => e.code === 'OUT_OF_BOOK');
  for (const defense of state(start).choices) assert.throws(() => state([...start, defense, 'A1']), e => e.code === 'BAD_REPLY');
});
