import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import g8 from '../data/g8.json' with { type: 'json' };
import coverage from '../data/f10-coverage.json' with { type: 'json' };
import { BOOK_VERSION } from '../src/book.mjs';
import { playChallengeHistory } from '../src/renju.mjs';
import { screenWhite } from './f10-candidates.mjs';

export function verifyF10(onProgress = () => {}) {
  assert.equal(coverage.version, BOOK_VERSION);
  assert.equal(coverage.policy.exhaustiveLegalMoves, false);
  const positions = Object.entries(g8.nodes).filter(([key, node]) => key.startsWith(coverage.root) && node.turn === 2);
  assert.equal(positions.length, Object.keys(coverage.positions).length);
  assert.equal(positions.length, coverage.policy.whitePositions);
  const screens = new Map(), selections = {};
  let checked = 0, completed = 0;
  for (const [key, node] of positions) {
    const entry = coverage.positions[key];
    assert.ok(entry, 'Missing recursive F10 audit: ' + key);
    assert.deepEqual(Object.keys(node.moves), entry.moves);
    const { board } = playChallengeHistory(key.split(',')), boardKey = board.join('');
    let screen = screens.get(boardKey);
    if (!screen) { screen = screenWhite(board); screens.set(boardKey, screen); }
    assert.equal(entry.mode, screen.mode);
    assert.equal(entry.emptyPointsChecked, screen.checked);
    assert.equal(entry.survivingPoints, screen.candidates.length);
    if (entry.selection === 'all-forced' || entry.selection === 'all-tactical-survivors') {
      assert.deepEqual([...entry.moves].sort(), [...screen.candidates].sort(), 'A viable tactical defense was omitted: ' + key);
    } else if (entry.selection === 'engine-ranked') {
      assert.ok(screen.candidates.length > 9);
      assert.ok(entry.candidates.length > 0);
      assert.ok(entry.moves.every(move => screen.candidates.includes(move)));
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
