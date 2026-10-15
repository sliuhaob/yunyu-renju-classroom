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
