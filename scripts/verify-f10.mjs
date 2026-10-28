import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import g8 from '../data/g8.json' with { type: 'json' };
import coverage from '../data/f10-coverage.json' with { type: 'json' };
import requests from '../data/f10-requests.json' with { type: 'json' };
import pruning from '../data/tempo-four-pruning.json' with { type: 'json' };
import opposite from '../data/double-four-three-coverage.json' with { type: 'json' };
import { BOOK_VERSION } from '../src/book.mjs';
import { playChallengeHistory } from '../src/renju.mjs';
import { screenWhite } from './f10-candidates.mjs';
import { continuationVerifier } from './tempo-fours.mjs';
import { verifyGraftedMenu } from './verify-tempo-fours.mjs';

export function verifyF10(onProgress = () => {}) {
  assert.equal(coverage.root, 'H8,I9,I8,H7,G10,G8,F9,F10');
  return verifyExpandedBranch(coverage, requests, onProgress);
}

export function verifyExpandedBranch(coverage, requests = [], onProgress = () => {}, tree = g8, pruningProof = pruning, sideProof = opposite) {
  const g8 = tree, pruning = pruningProof, opposite = sideProof;
  assert.equal(coverage.version, BOOK_VERSION);
  const label = coverage.root.split(',').at(-1).toLowerCase();
  assert.deepEqual(coverage.policy, g8.coverage[label]);
  assert.equal(coverage.policy.exhaustiveLegalMoves, false);
  const positions = Object.entries(g8.nodes).filter(([key, node]) => key.startsWith(coverage.root + ',') && node.turn === 2);
  assert.equal(positions.length, Object.keys(coverage.positions).length);
  assert.equal(positions.length, coverage.policy.whitePositions);
  for (const { history, moves } of requests) {
    const key = history.join(',');
    if (!coverage.positions[key]) {
      assert.ok(history.some((move, i) => pruning.positions[history.slice(0, i).join(',')]?.some(entry => entry.move === move)), 'Requested parent vanished without a verified pruning');
      continue;
    }
    assert.ok(coverage.positions[key], 'Missing explicitly requested defense position: ' + key);
    assert.deepEqual(coverage.positions[key].requestedMoves, moves);
    for (const move of moves) assert.ok(g8.nodes[key]?.moves[move] || pruning.positions[key]?.some(entry => entry.move === move), 'Missing requested defense: ' + key + ' -> ' + move);
  }
  const screens = new Map(), selections = {}, replay = continuationVerifier(pruning.nodes);
  let checked = 0, completed = 0;
  for (const [key, node] of positions) {
    const entry = coverage.positions[key];
    assert.ok(entry, 'Missing recursive defense audit: ' + key);
    assert.deepEqual(Object.keys(node.moves), entry.moves);
    const omitted = (pruning.positions[key] || []).map(item => item.move);
    assert.deepEqual(entry.omittedTempoFours || [], omitted);
    const added = (opposite.positions[key]?.added || []).map(item => item.move);
    assert.deepEqual(entry.oppositeFourThreeMoves || [], added);
    const screenedMoves = [...entry.moves.filter(move => !added.includes(move)), ...omitted];
    const { board } = playChallengeHistory(key.split(',')), boardKey = board.join('');
    let screen = screens.get(boardKey);
    if (!screen) { screen = screenWhite(board); screens.set(boardKey, screen); }
    assert.equal(entry.mode, screen.mode);
    assert.equal(entry.emptyPointsChecked, screen.checked);
    assert.equal(entry.survivingPoints, screen.candidates.length);
    if (entry.selection === 'tempo-replay') {
      verifyGraftedMenu(key, replay, g8, pruning, opposite);
    } else if (entry.selection === 'all-forced' || entry.selection === 'all-tactical-survivors') {
      assert.deepEqual([...screenedMoves].sort(), [...screen.candidates].sort(), 'A viable tactical defense was omitted without a tempo-four proof: ' + key);
    } else if (entry.selection === 'engine-ranked') {
      assert.ok(screen.candidates.length > 9);
      assert.ok(entry.candidates.length > 0);
      assert.ok(screenedMoves.every(move => screen.candidates.includes(move)));
    } else {
      assert.equal(entry.selection, 'terminal-examples');
      assert.equal(screen.candidates.length, 0);
    }
    checked += screen.checked;
    if (++completed % 10000 === 0) onProgress({ completed, total: positions.length, uniqueBoards: screens.size });
    selections[entry.selection] = (selections[entry.selection] || 0) + 1;
  }
  assert.deepEqual(selections, coverage.policy.selections);
  return { whitePositions: positions.length, emptyPointsChecked: checked, uniqueBoards: screens.size, selections };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log('Verified recursive F10 coverage:', JSON.stringify(verifyF10(progress => console.log('F10 audit progress:', JSON.stringify(progress)))));
