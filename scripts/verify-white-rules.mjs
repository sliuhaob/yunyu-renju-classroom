// Walks every book and fails on the two things no menu rule may allow: a White
// position White wins by force, and a White four that fails pointlessFour.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BLACK, WHITE, indexOf, winningMoves } from '../src/renju.mjs';
import { boardOf } from './tempo-fours.mjs';
import { pointlessFour, whiteForcedWin } from './vcf-engine.mjs';

const BOOKS = ['g8', 'j7', 'w6h9', 'w6g9', 'w4j8', 'w4g8', 'flower-w4h9', 'flower-w4g7', 'flower-w4h10'];
const COVERAGE = { g8: ['f10', 'f11', 'h9', 'h11'] };

export function verifyWhiteRules(label) {
  const read = name => JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
  const tree = read(label), requested = new Set();
  for (const name of COVERAGE[label] || [label]) for (const [key, entry] of Object.entries(read(name + '-coverage').positions)) for (const move of entry.requestedMoves || []) requested.add(key + ',' + move);
  const seen = new Set();
  let positions = 0, fours = 0;
  for (const [key, node] of Object.entries(tree.nodes)) {
    if (node.turn !== WHITE) continue;
    positions++;
    const board = boardOf(key.split(',')), signature = board.join(''), first = !seen.has(signature);
    seen.add(signature);
    if (first) assert.equal(whiteForcedWin(board), null, 'White wins by force but the menu goes on: ' + key);
    if (winningMoves(board, BLACK).length) continue;
    for (const move of Object.keys(node.moves)) {
      if (requested.has(key + ',' + move)) continue;
      assert.equal(pointlessFour(board, move), null, 'Pointless four offered: ' + key + ',' + move);
      board[indexOf(move)] = WHITE;
      if (winningMoves(board, WHITE).length) fours++;
      board[indexOf(move)] = 0;
    }
  }
  return { positions, uniqueBoards: seen.size, foursOffered: fours };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const labels = process.argv.slice(2);
  for (const label of labels.length ? labels : BOOKS) console.log('Verified White rules', label, JSON.stringify(verifyWhiteRules(label)));
}
