import test from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, analyzeMove, coordOf, fourThreeStands, indexOf, playChallengeHistory, standingFourThree, winningMoves } from '../src/renju.mjs';
import { advance, getState } from '../src/session.mjs';
import { boardOf } from '../scripts/tempo-fours.mjs';
import { immediateFinish, screenWhite, usableMoves } from '../scripts/f10-candidates.mjs';
import { attackKind, fourThreeDefenses, missingFourThreeSides, selectOppositeDefenses } from '../scripts/double-four-three.mjs';
import { Pos, blackVcfMove, byResistance, isWhiteFour, pointlessFour, whiteForcedWin } from '../scripts/vcf-engine.mjs';
import { vcf } from '../scripts/tactics.mjs';

const moves = text => text.split(' ');
// Every example comes from the audit of book 2026-11-05.1.
const FALSE_FOUR_THREE = moves('H8 I8 I9 G7 J9 H9 J10 J8 K11 L12 I10 G10 J7 G9 G11 G6 G8 E12 F11 K8 L10 K10 I13 M9 J12 H14 J13 J11 I11 I12 H11 E11 F13 G12 G13');
const WHITE_FORCED_WIN = moves('H8 I9 I8 H7 G10 G8 F9 F10 H11 I12 H9 F11 J6 K6 K7 K8 K5 I7 L6 G7 F7 G5 G6 H5 E8 D7 D9 C10 F5 F8 E9 G9 L8 I5 J4 I3 M7 N8 J7 J5 K4');

test('a four-three stops being an ending when White\'s forced block makes a four', () => {
  const { board, outcome } = playChallengeHistory(FALSE_FOUR_THREE);
  assert.equal(outcome, null);
  const last = indexOf('G13'), analysis = (board[last] = 0, analyzeMove(board, last, BLACK));
  assert.equal(analysis.fourThree, true);
  assert.equal(standingFourThree(board, last, analysis), false);
  board[last] = BLACK;
  assert.equal(fourThreeStands(board), false);
  assert.deepEqual(winningMoves(board, BLACK).map(coordOf), ['H13']);
  board[indexOf('H13')] = WHITE;
  assert.deepEqual(winningMoves(board, WHITE).map(coordOf).sort(), ['G14', 'L9']);
});

test('an ordinary four-three still ends the challenge', () => {
  const { outcome } = playChallengeHistory(moves('E8 A1 F8 C1 G8 E1 H7 G1 H9 I1 H8'));
  assert.equal(outcome.reason, 'four-three');
});

test('the screen and the black finish no longer accept a four-three White can answer', () => {
  const history = FALSE_FOUR_THREE.slice(0, -1), board = boardOf(history);
  assert.notEqual(immediateFinish(board)?.move, 'G13');
  assert.equal(attackKind(board, indexOf('G13')), null);
  // Before the fix these points were rejected only for a four-three White could answer.
  const screened = screenWhite(boardOf(moves('H8 I9 I8 J8 H10 J7 G9 J9 J10 I12 F10 I7 G11')));
  assert.equal(screened.rejected.I11, undefined);
  assert.equal(screened.rejected.I13, undefined);
  assert.ok(screened.candidates.includes('I11') && screened.candidates.includes('I13'));
});

test('White VCF is found, proved and proved on the actual menu position', () => {
  const board = boardOf(WHITE_FORCED_WIN);
  assert.deepEqual(whiteForcedWin(board).slice(0, 5), moves('I4 I6 I2 I1 L7'));
  assert.equal(whiteForcedWin(boardOf(WHITE_FORCED_WIN.slice(0, 11))), null);
});

test('fours the audit called pointless are dropped, with the audited reason', () => {
  const cases = [
    ['H8 I9 I8 J8 H10 H7 G9 G7 F7 J7 F8', 'K7', 'throws-away-defence'],
    ['H8 I8 I9 H10 G7 F6 I7 J6 H7 J7 H9 I6 G9', 'G6', 'delay'],
    ['H8 I9 I8 H7 G10 G8 F9 H9 F10 F7 I10 E10 G9 I7 G7 E8 F12 D5 E6 F11 F8 E7 D10', 'E9', 'block-finishes']
  ];
  for (const [history, four, reason] of cases) {
    const board = boardOf(moves(history)), before = [...board];
    assert.equal(isWhiteFour(board, four), true);
    assert.equal(pointlessFour(board, four), reason);
    assert.deepEqual([...board], before);
  }
});

test('forced blocks are never filtered, even when the block is also a four', () => {
  const history = 'H8 I9 I8 H7 G10 G8 F9 H9 F10 E11 E10 D10 H11 I12 F8 F11 F7'.split(' '), board = boardOf(history);
  assert.deepEqual(winningMoves(board, BLACK).map(coordOf), ['F6']);
  assert.equal(pointlessFour(board, 'F6'), null);
});

test('moves named in a request stay even when they fail the four test', () => {
  const board = boardOf(moves('H8 I9 I8 J8 H10 H7 G9 G7 F7 J7 F8'));
  assert.deepEqual(usableMoves(board, ['K7']).usable, []);
  assert.deepEqual(usableMoves(board, ['K7']).dropped, { K7: 'throws-away-defence' });
  assert.deepEqual(usableMoves(board, ['K7'], { keep: ['K7'] }).usable, ['K7']);
});

test('one attack is enough to need a direct block, and an open four counts as one', () => {
  const board = boardOf(moves('H8 I9 I8 J8 H10 H7 G9 E9 G10 K7 G8'));
  const analysis = fourThreeDefenses(board), before = [...board];
  assert.ok(analysis.threats.includes('F8'));
  assert.ok(missingFourThreeSides(analysis, ['G7', 'G11']).includes('F8'));
  assert.deepEqual([...board], before);
  const added = selectOppositeDefenses(analysis, ['G7', 'G11']);
  assert.ok(added.some(d => d.stops.includes('F8')));
  assert.ok(added.every(d => !d.four));
});

test('resistance ranking never prefers a point that ignores the kill', () => {
  const board = boardOf(moves('H8 I9 I8 H7 G10 G8 F9 F10 H11 I12 H9 F11 J6 J7 K7 K8 I6 I7 F7 E8 H6 G6 I5')), before = [...board];
  const line = new Pos().load(board).shortestBlack();
  assert.ok(line.length > 0);
  const near = coordOf(line[0]), ranked = byResistance(board, ['A1', near, 'O15']);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0], near);
  assert.deepEqual([...board], before);
});

test('audited menus now offer the real defenses and none of the pointless fours', () => {
  const menu = (lesson, history) => getState(null, moves(history), lesson).choices;
  assert.deepEqual(menu('opening', 'H8 I9 I8 J8 H10 H7 G9 G7 F7 J7 F8'), ['I11', 'E7', 'I7']);
  assert.deepEqual(menu('flower', 'H8 I8 I9 H10 G7 F6 I7 J6 H7 J7 H9 I6 G9'), ['F9', 'J9']);
  assert.deepEqual(menu('opening', 'H8 I9 I8 J8 H10 H7 G9 I7 F8 E7 H9'), ['G5', 'H6']);
  assert.ok(menu('opening', 'H8 I9 I8 H7 G10 G8 F9 H11 E9 H9 F10 F7 I10').includes('E10'));
  assert.ok(menu('opening', 'H8 I9 I8 J8 H10 H7 G9 E9 G10 K7 G8').includes('F8'));
});

test('Black no longer plays the false four-three or the reply that let White win', () => {
  const reply = advance(null, FALSE_FOUR_THREE.slice(0, -2), 'G12', 'flower');
  assert.notEqual(reply.blackMove, 'G13');
  assert.equal(reply.outcome, null);
  const before = WHITE_FORCED_WIN.slice(0, -1);
  assert.notDeepEqual(getState(null, before, 'opening').choices, ['K4']);
});

test('the fast engine agrees with src/renju.mjs on rules and on VCF', () => {
  const games = [FALSE_FOUR_THREE, WHITE_FORCED_WIN, moves('H8 I9 I8 H7 G10 G8 F9 F10 H11 I12 H9 F11 J6 J7 K7 K8 I6 I7 F7 E8 H6 G6 I5 H4 L8 M9 L6 K6 M5 N4 L5 L7 J4')];
  for (const game of games) for (let n = 9; n < game.length; n += 3) {
    const board = boardOf(game.slice(0, n)), P = new Pos().load(board), fives = new Int16Array(120);
    for (let p = 0; p < 225; p++) if (!board[p]) {
      const a = analyzeMove(board, p, BLACK), value = P.analyze(p);
      const expected = !a.legal ? -1 : a.win ? 100 : a.fours * 10 + a.threes;
      assert.equal(value, expected, game.slice(0, n).join(' ') + ' @' + coordOf(p));
    }
    const count = P.fivesBlack(fives), black = [...fives.slice(0, count)].sort((a, b) => a - b);
    assert.deepEqual(black, winningMoves(board, BLACK).sort((a, b) => a - b));
    if (n % 2 === 0 && count === 0) {
      const found = vcf(board.slice(), 7, 2500);
      if (found) assert.ok(blackVcfMove(board));
    }
  }
});
