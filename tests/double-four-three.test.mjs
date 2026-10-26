import test from 'node:test';
import assert from 'node:assert/strict';
import book from '../data/responses.json' with { type: 'json' };
import proof from '../data/double-four-three-coverage.json' with { type: 'json' };
import { BLACK, WHITE, indexOf, analyzeMove, winningMoves } from '../src/renju.mjs';
import { getState, advance } from '../src/session.mjs';
import { boardOf } from '../scripts/tempo-fours.mjs';
import { fourThreeDefenses, missingFourThreeSides, selectOppositeDefenses } from '../scripts/double-four-three.mjs';
import { fillFourThreeSides } from '../scripts/augment-double-four-three.mjs';
import { trimG8Book } from '../scripts/trim-books.mjs';
import { verifyG8 } from '../scripts/verify-g8.mjs';

const pictured = 'H8 I9 I8 H7 G10 G8 F9 H9 F10 E11 E10 D10 H11 I12 F8 F11 F7 F6 E7'.split(' ');

test('pictured menu formerly covered only H10, and five direct D7 blocks are now playable', () => {
  const b = boardOf(pictured), before = [...b], a = fourThreeDefenses(b);
  assert.deepEqual([...b], before);
  assert.deepEqual(a.threats, ['H10', 'D7']);
  assert.deepEqual(missingFourThreeSides(a, ['G9', 'D6', 'I10']), ['D7']);
  const added = ['D7', 'E8', 'C7', 'B7', 'G7'];
  assert.deepEqual(selectOppositeDefenses(a, ['G9', 'D6', 'I10']).map(d => d.move), added);
  assert.deepEqual(getState(book, pictured, 'main').choices, ['G9', 'D6', 'I10', ...added]);
  for (const move of added) {
    const s = advance(book, pictured, move, 'main');
    assert.equal(s.blackMove, 'H10');
    assert.equal(s.history.length, 21);
    assert.equal(s.outcome.reason, 'four-three');
    assert.deepEqual(s.choices, []);
  }
  for (const move of ['G9', 'D6', 'I10']) assert.equal(advance(book, pictured, move, 'main').blackMove, 'D7');
});

test('nine-choice cap reserves defenses for both sides before filling duplicate-side blocks', () => {
  const h = 'H8 I9 I8 H7 G10 G8 F9 F10 H11 I12 H9 F11 J6 J7 K7 K8 I5 L8 I7 K5 I6 I4 H6 G6 G5 J8 F6 E7 F5'.split(' ');
  const a = fourThreeDefenses(boardOf(h)), base = ['H5', 'E5', 'J5'];
  assert.deepEqual(a.threats, ['F8', 'F4']);
  const selected = selectOppositeDefenses(a, base);
  assert.equal(base.length + selected.length, 9);
  assert.ok(selected.some(d => d.move === 'F8'));
  assert.ok(selected.some(d => d.move === 'F4'));
  assert.deepEqual(missingFourThreeSides(a, [...base, ...selected.map(d => d.move)]), []);
});

test('mandatory black-five defense never gets replaced by an opposite four-three example', () => {
  const h = pictured.slice(0, 17), b = boardOf(h);
  assert.deepEqual(winningMoves(b, BLACK), [indexOf('F6')]);
  assert.deepEqual(fourThreeDefenses(b), { threats: [], defenses: [] });
  assert.deepEqual(getState(book, h, 'main').choices, ['F6']);
});

test('every added defense blocks a real threat and leaves its recorded reply legal', () => {
  for (const [key, entry] of Object.entries(proof.positions)) {
    const b = boardOf(key.split(','));
    for (const d of entry.added) {
      b[indexOf(d.move)] = WHITE;
      for (const target of d.stops) assert.ok(!analyzeMove(b, indexOf(target), BLACK).fourThree);
      const response = analyzeMove(b, indexOf(d.reply), BLACK);
      assert.ok(response.legal && response.fourThree);
      b[indexOf(d.reply)] = BLACK;
      assert.deepEqual(winningMoves(b, WHITE), []);
      b[indexOf(d.reply)] = 0; b[indexOf(d.move)] = 0;
    }
  }
});

test('side completion is idempotent and all new branches close at the next black move', () => {
  const nodes = {}, opening = pictured.slice(0, 4);
  for (const defense of ['G9', 'D6', 'I10']) {
    const line = [...pictured, defense, 'D7'];
    for (let n = 4; n < line.length; n++) {
      const key = line.slice(0, n).join(',');
      nodes[key] ||= { turn: n % 2 ? WHITE : BLACK, moves: {} };
      nodes[key].moves[line[n]] = { kind: 'regression-fixture' };
    }
  }
  const source = trimG8Book({ opening, nodes, coverage: {} }), first = fillFourThreeSides(source), second = fillFourThreeSides(first.book);
  assert.equal(first.addedChoices, 5);
  assert.equal(second.addedChoices, 0);
  assert.deepEqual(second.book, first.book);
  assert.deepEqual(second.proof, first.proof);
  assert.equal(verifyG8(first.book).paths, 8);
  assert.deepEqual(Object.keys(source.nodes[pictured.join(',')].moves), ['G9', 'D6', 'I10']);
});
