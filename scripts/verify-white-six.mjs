import fs from 'node:fs';
import assert from 'node:assert/strict';
import { verifyG8 } from './verify-g8.mjs';
import { verifyExpandedBranch } from './verify-f10.mjs';
import { verifyTempoFours } from './verify-tempo-fours.mjs';
import { verifyOppositeSides } from './verify-double-four-three.mjs';

const labels = process.argv.slice(2);
for (const label of labels.length ? labels : ['w6h9', 'w6g9']) {
  assert.ok(['w6h9', 'w6g9'].includes(label));
  const read = suffix => JSON.parse(fs.readFileSync(new URL(`../data/${label}${suffix}.json`, import.meta.url), 'utf8'));
  const tree = read(''), coverage = read('-coverage'), pruning = read('-tempo-four-pruning'), sides = read('-double-four-three-coverage');
  assert.equal(coverage.root, 'H8,I9,I8,H7,G10,' + label.slice(2).toUpperCase());
  assert.equal(coverage.label, label);
  console.log(label, 'paths', JSON.stringify(verifyG8(tree)));
  console.log(label, 'tempo pruning', JSON.stringify(verifyTempoFours(tree, pruning, sides)));
  console.log(label, 'attack sides', JSON.stringify(verifyOppositeSides(console.log, tree, sides, { nodes: {} })));
  console.log(label, 'recursive coverage', JSON.stringify(verifyExpandedBranch(coverage, [], console.log, tree, pruning, sides)));
}
