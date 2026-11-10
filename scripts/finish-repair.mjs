// Merge artifacts/<label>-repair.json into data/ once every branch of a book is
// repaired. A book has to change in one step: while one branch still ends at a
// four-three the rule no longer accepts, the whole book fails verification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOOK_VERSION } from '../src/book.mjs';
import { MENU_POLICY } from './f10-candidates.mjs';
import { trimG8Book } from './trim-books.mjs';
import { writeCompactG8 } from './compact-g8.mjs';
import { verifyG8 } from './verify-g8.mjs';

const BOOKS = { g8: ['f10', 'f11', 'h9', 'h11'], j7: ['j7'], w6h9: ['w6h9'], w6g9: ['w6g9'], w4j8: ['w4j8'], w4g8: ['w4g8'], 'flower-w4h9': ['flower-w4h9'], 'flower-w4g7': ['flower-w4g7'], 'flower-w4h10': ['flower-w4h10'] };
const label = process.argv.find(arg => arg.startsWith('--book='))?.split('=')[1];
assert.ok(BOOKS[label], 'Unknown book');
const book = JSON.parse(fs.readFileSync(`data/${label}.json`, 'utf8'));
const parts = BOOKS[label].map(name => JSON.parse(fs.readFileSync(`artifacts/${name}-repair.json`, 'utf8')));
for (const part of parts) assert.equal(part.version, BOOK_VERSION);
const nodes = Object.fromEntries(Object.entries(book.nodes).filter(([key]) => !parts.some(part => key.startsWith(part.root))));
for (const part of parts) Object.assign(nodes, part.nodes);
const published = trimG8Book({ ...book, nodes });
const coverages = parts.map(part => {
  const path = `data/${part.label}-coverage.json`, old = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : null;
  const positions = Object.fromEntries(Object.entries(part.audit).filter(([key]) => published.nodes[key]));
  const selections = Object.values(positions).reduce((counts, item) => { counts[item.selection] = (counts[item.selection] || 0) + 1; return counts; }, {});
  const policy = { ...old?.policy, root: part.root, policy: MENU_POLICY, exhaustiveLegalMoves: false, whitePositions: Object.keys(positions).length, selections };
  published.coverage = { ...published.coverage, [part.label]: policy };
  return { path, coverage: { version: BOOK_VERSION, label: part.label, root: part.root, policy, positions } };
});
console.log('Verified', JSON.stringify(verifyG8(published, book.opening)));
fs.writeFileSync(`data/${label}.json`, JSON.stringify(published));
writeCompactG8(published, label);
for (const { path, coverage } of coverages) fs.writeFileSync(path, JSON.stringify(coverage));
console.log('Unresolved', JSON.stringify(parts.map(part => [part.label, part.unresolved.length])));
