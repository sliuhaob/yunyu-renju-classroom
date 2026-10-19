import test from 'node:test';
import assert from 'node:assert/strict';
import g8 from '../data/g8.json' with { type: 'json' };
import book from '../data/responses.json' with { type: 'json' };
import { getState, advance } from '../src/session.mjs';
import { verifyG8 } from '../scripts/verify-g8.mjs';
import runtime from '../data/g8-runtime.json' with { type: 'json' };
import { compactG8 } from '../scripts/compact-g8.mjs';

test('compact runtime preserves the full recorded continuation graph', () => {
  assert.deepEqual(runtime, compactG8(g8));
  assert.ok(runtime.nodes.length < Object.keys(g8.nodes).length);
});

test('every selected G8 branch stops at the first legal black four-three or five', () => {
  const result = verifyG8();
  assert.ok(result.paths > 20);
});
test('every playable G8 choice works through the runtime API without a dead end', () => {
  for (const [key, node] of Object.entries(g8.nodes)) {
    const history = key.split(',');
    const state = getState(book, history, 'main');
    assert.deepEqual(state.choices, Object.keys(node.moves));
    assert.equal(state.curated, true);
    for (const choice of state.choices) {
      const next = advance(book, history, state.turn === 2 ? choice : undefined, 'main');
      assert.ok(next.outcome?.winner === 1 || (next.turn === 2 && next.choices.length >= 1 && next.choices.length <= 9));
      if (next.outcome) {
        assert.deepEqual(next.choices, []); assert.deepEqual(next.hints, []);
        assert.throws(() => advance(book, next.history, 'A1', 'main'), error => error.status === 409);
      }
    }
  }
});
