import fs from 'node:fs';
import assert from 'node:assert/strict';
import { FIXED_OPENING, FLOWER_OPENING } from '../src/book.mjs';
import { verifyG8 } from './verify-g8.mjs';
import { verifyExpandedBranch } from './verify-f10.mjs';
import { verifyTempoFours } from './verify-tempo-fours.mjs';
import { verifyOppositeSides } from './verify-double-four-three.mjs';

const labels = process.argv.slice(2);
for (const label of labels.length ? labels : ['w4j8', 'w4g8', 'flower-w4h9', 'flower-w4g7', 'flower-w4h10']) {
  assert.ok(['w4j8', 'w4g8', 'flower-w4h9', 'flower-w4g7', 'flower-w4h10'].includes(label));
  const read = suffix => JSON.parse(fs.readFileSync(new URL(`../data/${label}${suffix}.json`, import.meta.url), 'utf8'));
  const tree = read(''), coverage = read('-coverage'), pruning = read('-tempo-four-pruning'), sides = read('-double-four-three-coverage');
  const opening = label.startsWith('flower-') ? [...FLOWER_OPENING, label.slice('flower-w4'.length).toUpperCase()] : [...FIXED_OPENING, label.slice(2).toUpperCase()];
  assert.equal(coverage.root, opening.join(','));
  assert.equal(coverage.label, label);
  console.log(label, 'paths', JSON.stringify(verifyG8(tree, opening)));
  console.log(label, 'tempo pruning', JSON.stringify(verifyTempoFours(tree, pruning, sides)));
  console.log(label, 'attack sides', JSON.stringify(verifyOppositeSides(console.log, tree, sides, { nodes: {} })));
  console.log(label, 'recursive coverage', JSON.stringify(verifyExpandedBranch(coverage, [], console.log, tree, pruning, sides)));
}
