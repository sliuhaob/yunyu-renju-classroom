import test from 'node:test';
import assert from 'node:assert/strict';
import book from '../data/responses.json' with { type: 'json' };
import graph from '../data/g8-runtime.json' with { type: 'json' };
import proof from '../data/tempo-four-pruning.json' with { type: 'json' };
import { getState, advance } from '../src/session.mjs';
import { BLACK, WHITE, analyzeMove, indexOf, winningMoves } from '../src/renju.mjs';
import { boardOf, follow, continuationVerifier, redundantFour, ignoredCounterFours } from '../scripts/tempo-fours.mjs';

test('J9/K9 is a removable exchange, with exactly the same remaining kill on both boards', () => {
  const h = 'H8 I9 I8 H7 G10 G8 F9 H11 E9 H9 F10 G9 D10'.split(' ');
  const entry = proof.positions[h.join(',')].find(p => p.move === 'J9');
  assert.equal(entry.reply, 'K9');
  const b = boardOf(h), before = [...b];
  assert.ok(redundantFour(b, 'J9', 'K9', entry.suffix, continuationVerifier(proof.nodes)));
  assert.deepEqual([...b], before);
});

test('G7 counter-four that changes the continuation remains available', () => {
  const h = 'H8 I9 I8 H7 G10 G8 F9 F10 H11 I12 H9 F11 J6 J7 K7 K8 I5 H4 E8 D7 I6 I7 L6'.split(' ');
  const b = boardOf(h), black = graph.nodes[follow(graph.nodes, graph.root, [...h, 'G7'])];
  b[indexOf('G7')] = WHITE;
  assert.deepEqual(winningMoves(b, WHITE), [indexOf('F7')]);
  b[indexOf('G7')] = 0;
  assert.equal(redundantFour(b, 'G7', 'F7', black[2], continuationVerifier(graph.nodes)), false);
  assert.ok(getState(book, h, 'main').choices.includes('G7'));
  assert.equal(advance(book, h, 'G7', 'main').blackMove, 'F7');
});

test('a counter-four that also blocks black five is preserved', () => {
  const h = 'H8 I9 I8 H7 G10 G8 F9 F10 H11 I12 H9 F11 J6 J7 K7 K8 I5 H4 E8 D7 I6 I7 L6 H6 L5 L7 K5 J5 J4 H3 H5 K6 I4 N9 M8 M7 I2 I3 K4 J3 L4 M4 L2'.split(' ');
  const b = boardOf(h);
  assert.deepEqual(winningMoves(b, BLACK), [indexOf('L3')]);
  b[indexOf('L3')] = WHITE;
  assert.deepEqual(winningMoves(b, WHITE), [indexOf('K3')]);
  b[indexOf('L3')] = 0;
  assert.ok(!ignoredCounterFours(b).includes('L3'));
  assert.deepEqual(getState(book, h, 'main').choices, ['L3']);
});

test('legacy counter-four which ignores black five is removed from menu and replay', () => {
  const h = 'H8 I9 I8 H7 G10 J7 G8 J8 H11 F8 F9 I12 G11 G9 F11 I11 D11'.split(' ');
  assert.ok(ignoredCounterFours(boardOf(h)).includes('I13'));
  assert.ok(!getState(book, h, 'j7').choices.includes('I13'));
  assert.throws(() => advance(book, h, 'I13', 'j7'), error => error.code === 'OUT_OF_BOOK');
  assert.throws(() => getState(book, [...h, 'I13'], 'j7'), error => error.code === 'OUT_OF_BOOK');
  assert.ok(getState(book, h, 'j7').choices.includes('E11'));
});

test('legacy compressed proof menus and forged histories reject their omitted counter-fours', () => {
  let checked = 0;
  function visit(history, p) {
    if (!p) return;
    const after = [...history, p.move];
    for (const w of p.omittedTempoFours || []) {
      const b = boardOf(after); b[indexOf(w)] = WHITE;
      assert.ok(winningMoves(b, WHITE).length);
      assert.ok(winningMoves(b, BLACK).some(q => analyzeMove(b, q, BLACK).win));
      assert.ok(!getState(book, after, 'j7').choices.includes(w));
      assert.throws(() => advance(book, after, w, 'j7'), error => error.code === 'OUT_OF_BOOK');
      assert.throws(() => getState(book, [...after, w], 'j7'), error => error.code === 'OUT_OF_BOOK');
      checked++;
    }
    if (p.next) visit([...after, p.threats[0]], p.next);
  }
  for (const [key, n] of Object.entries(book.nodes)) {
    const h = key.split(',');
    if (h[5] !== 'J7') continue;
    for (const [w, entry] of Object.entries(n.moves)) if (entry.proof) visit([...h, w], entry.proof);
  }
  assert.ok(checked > 0);
});
