import test from 'node:test';
import assert from 'node:assert/strict';
import { playChallengeHistory } from '../src/renju.mjs';
import { screenWhite, rankedDefenses } from '../scripts/f10-candidates.mjs';

test('F10 screening retains both defenses of the first diagonal three', () => {
  const { board } = playChallengeHistory('H8 I9 I8 H7 G10 G8 F9 F10 H11'.split(' '));
  const before = [...board], screened = screenWhite(board);
  assert.deepEqual(screened.candidates, ['I12', 'E8']);
  assert.equal(screened.rejected.A1, 'open-four');
  assert.equal(screened.checked, 216);
  assert.deepEqual([...board], before);
});

test('F10 E8 side line includes the three previously missing counter-defenses', () => {
  const { board } = playChallengeHistory('H8 I9 I8 H7 G10 G8 F9 F10 H11 E8 H12'.split(' '));
  const screened = screenWhite(board);
  assert.deepEqual(screened.candidates, ['F11', 'H10', 'H9', 'J7']);
  assert.deepEqual(rankedDefenses(screened, { move: null, candidates: [] }, ['H10']), ['H10', 'F11', 'H9', 'J7']);
});
