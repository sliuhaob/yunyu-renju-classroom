import test from 'node:test';
import assert from 'node:assert/strict';
import j7 from '../data/j7.json' with { type: 'json' };
import runtime from '../data/j7-runtime.json' with { type: 'json' };
import book from '../data/responses.json' with { type: 'json' };
import { compactG8 } from '../scripts/compact-g8.mjs';
import { getState, advance } from '../src/session.mjs';

test('J7 compact book and every API branch preserve the offline selected strategy', () => {
  assert.deepEqual(runtime, compactG8(j7));
  for (const [key, node] of Object.entries(j7.nodes)) {
    const h = key.split(','), state = getState(book, h, 'j7');
    assert.equal(state.curated, true);
    assert.equal(state.lessonId, 'j7');
    assert.deepEqual(state.choices, Object.keys(node.moves));
    for (const choice of state.choices) {
      const next = advance(book, h, state.turn === 2 ? choice : undefined, 'j7');
      assert.ok(next.outcome?.winner === 1 || (next.turn === 2 && next.choices.length >= 1 && next.choices.length <= 9));
      if (next.outcome) {
        assert.deepEqual(next.choices, []);
        assert.throws(() => advance(book, next.history, 'A1', 'j7'), e => e.status === 409);
      }
    }
  }
});

test('J7 rejects unselected moves and histories from a different white-six lesson', () => {
  const root = 'H8 I9 I8 H7 G10 J7 G8'.split(' ');
  assert.throws(() => advance(book, root, 'A1', 'j7'), e => e.code === 'OUT_OF_BOOK');
  assert.throws(() => getState(book, 'H8 I9 I8 H7 G10 G8 F9'.split(' '), 'j7'));
  assert.throws(() => getState(book, root, 'main'));
});
