import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, indexOf, coordOf, analyzeMove, BLACK, WHITE, playHistory } from '../src/renju.mjs';
function position(black, white = '') {
  const board = emptyBoard();
  for (const c of black.split(' ').filter(Boolean)) board[indexOf(c)] = BLACK;
  for (const c of white.split(' ').filter(Boolean)) board[indexOf(c)] = WHITE;
  return board;
}
test('all coordinates round-trip and invalid coordinates reject', () => {
  for (let p = 0; p < 225; p++) assert.equal(indexOf(coordOf(p)), p);
  for (const c of ['P1','A0','H16','',null,'A01']) assert.throws(() => indexOf(c));
});
test('black exact five wins; white five and overline win', () => {
  assert.equal(analyzeMove(position('D8 E8 F8 G8'), indexOf('H8'), BLACK).win, true);
  assert.equal(analyzeMove(position('', 'C8 D8 E8 F8 G8'), indexOf('H8'), WHITE).win, true);
});
test('black overline is forbidden', () => assert.equal(analyzeMove(position('C8 D8 E8 F8 G8'), indexOf('H8'), BLACK).reason, 'overline'));
test('RIF exact-five exception takes precedence over simultaneous overline', () => {
  const result = analyzeMove(position('C8 D8 E8 F8 G8 H4 H5 H6 H7'), indexOf('H8'), BLACK);
  assert.equal(result.win, true); assert.equal(result.legal, true);
});
test('double-three forbidden for black and allowed for white', () => {
  assert.equal(analyzeMove(position('G8 I8 H7 H9'), indexOf('H8'), BLACK).reason, 'double-three');
  assert.equal(analyzeMove(position('', 'G8 I8 H7 H9'), indexOf('H8'), WHITE).legal, true);
});
test('two distinct fours are forbidden', () => assert.equal(analyzeMove(position('E8 F8 G8 H5 H6 H7'), indexOf('H8'), BLACK).reason, 'double-four'));
test('two fours along the SAME axis are forbidden', () => assert.equal(analyzeMove(position('C8 E8 G8 I8'), indexOf('F8'), BLACK).reason, 'double-four'));
test('one open four with two winning endpoints is counted once', () => {
  const result = analyzeMove(position('E8 F8 G8'), indexOf('H8'), BLACK);
  assert.equal(result.legal, true); assert.equal(result.fours, 1);
});
test('blocked three is not a real three', () => assert.equal(analyzeMove(position('B8 C8 D7 D9', 'A8 E8'), indexOf('D8'), BLACK).legal, true));
test('edge three is not a real three', () => assert.equal(analyzeMove(position('A8 B8 C7 C9'), indexOf('C8'), BLACK).legal, true));
test('a three whose extensions both make double-four is fake', () => {
  const board = position('G8 I8 H7 H9 F5 F6 F7 J5 J6 J7');
  const result = analyzeMove(board, indexOf('H8'), BLACK);
  assert.equal(result.legal, true);
});
test('an ordinary four-three is legal', () => assert.equal(analyzeMove(position('E8 F8 G8 H7 H9'), indexOf('H8'), BLACK).legal, true));
test('analysis is pure and occupied intersections reject', () => {
  const board = position('G8 I8 H7 H9'), before = board.slice();
  analyzeMove(board, indexOf('H8'), BLACK); assert.deepEqual(board, before);
  assert.equal(analyzeMove(board, indexOf('G8'), WHITE).legal, false);
});
test('history rejects duplicates, post-win moves and forbidden moves', () => {
  assert.throws(() => playHistory(['H8','H8']));
  assert.throws(() => playHistory('A1 A15 B1 B15 C1 C15 D1 D15 E1 E15'.split(' ')));
});
