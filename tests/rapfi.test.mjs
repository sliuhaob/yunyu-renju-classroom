import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidates } from '../scripts/rapfi.mjs';

test('engine coordinates and completed multi-candidate iteration survive a final single-line status', () => {
  const lines = [
    'MESSAGE (1) -247 | 14-30 | H5 E7 F9',
    'MESSAGE (2) -386 | 14-34 | F6 D7 E7',
    'MESSAGE (3) -405 | 14-31 | F5 F6 F9',
    'MESSAGE Depth 14-30 | Eval -247 | Time 3334ms | H5 E7 F9',
    'MESSAGE Depth 14-30 | Eval -247 | Time 3335ms | H5 E7 F9'
  ];
  const candidates = parseCandidates(lines);
  assert.deepEqual(candidates.map(c => c.move), ['H11', 'F10', 'F11']);
  assert.deepEqual(candidates[0].pv, ['H11', 'E9', 'F7']);
});
test('a timed-out deeper iteration does not truncate the completed candidate list', () => {
  const candidates = parseCandidates([
    'MESSAGE (1) -200 | 11-20 | K10 J9',
    'MESSAGE (2) -300 | 11-20 | J9 K9',
    'MESSAGE (3) -400 | 11-20 | I9 K9',
    'MESSAGE Depth 11-20 | Eval -200 | Time 700ms | K10 J9',
    'MESSAGE (1) -210 | 12-20 | K10 J9',
    'MESSAGE Depth 11-20 | Eval -200 | Time 1000ms | K10 J9'
  ]);
  assert.deepEqual(candidates.map(c => c.move), ['K6', 'J7', 'I7']);
});

test('single-candidate analysis uses the latest completed principal variation', () => {
  const candidates = parseCandidates([
    'MESSAGE Depth 2-4 | Eval 143 | Time 1ms | F10 G11',
    'MESSAGE Depth 21-35 | Eval 1223 | Time 29000ms | G11 I11 E11'
  ]);
  assert.deepEqual(candidates, [{ move: 'G5', eval: '1223', depth: 21, pv: ['G5', 'I5', 'E5'] }]);
});
