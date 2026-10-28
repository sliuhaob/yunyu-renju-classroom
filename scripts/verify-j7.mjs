import assert from 'node:assert/strict';
import j7 from '../data/j7.json' with { type: 'json' };
import coverage from '../data/j7-coverage.json' with { type: 'json' };
import pruning from '../data/j7-tempo-four-pruning.json' with { type: 'json' };
import opposite from '../data/j7-double-four-three-coverage.json' with { type: 'json' };
import { verifyG8 } from './verify-g8.mjs';
import { verifyExpandedBranch } from './verify-f10.mjs';
import { verifyTempoFours } from './verify-tempo-fours.mjs';
import { verifyOppositeSides } from './verify-double-four-three.mjs';

assert.equal(coverage.root, 'H8,I9,I8,H7,G10,J7');
console.log('Verified J7 paths:', JSON.stringify(verifyG8(j7)));
console.log('Verified J7 tempo pruning:', JSON.stringify(verifyTempoFours(j7, pruning, opposite)));
console.log('Verified J7 attack sides:', JSON.stringify(verifyOppositeSides(console.log, j7, opposite, { nodes: {} })));
console.log('Verified J7 recursive coverage:', JSON.stringify(verifyExpandedBranch(coverage, [], console.log, j7, pruning, opposite)));
