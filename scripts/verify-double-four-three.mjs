import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import g8 from '../data/g8.json' with { type: 'json' };
import legacy from '../data/responses.json' with { type: 'json' };
import proof from '../data/double-four-three-coverage.json' with { type: 'json' };
import { BOOK_VERSION } from '../src/book.mjs';
import { BLACK, WHITE, analyzeMove, indexOf, winningMoves } from '../src/renju.mjs';
import { boardOf } from './tempo-fours.mjs';
import { fourThreeDefenses, missingFourThreeSides } from './double-four-three.mjs';
import { OPPOSITE_KIND, oppositePolicy } from './augment-double-four-three.mjs';

export function verifyOppositeSides(progress = () => {}) {
  assert.equal(proof.version, BOOK_VERSION);
  assert.equal(proof.format, 'opposite-four-three-v1');
  assert.equal(proof.policy, oppositePolicy);
  const cache = new Map(), byBranch = {};
  let whitePositions = 0, multiThreatPositions = 0, augmentedPositions = 0, addedChoices = 0;
  function inspect(board) {
    const signature = board.join('');
    if (!cache.has(signature)) cache.set(signature, fourThreeDefenses(board));
    return cache.get(signature);
  }
  for (const [key, node] of Object.entries(g8.nodes)) {
    if (node.turn !== WHITE) continue;
    const history = key.split(','), board = boardOf(history), analysis = inspect(board), moves = Object.keys(node.moves);
    whitePositions++;
    if (analysis.threats.length >= 2) multiThreatPositions++;
    assert.deepEqual(missingFourThreeSides(analysis, moves), [], 'Missing direct defense of another four-three: ' + key);
    const entry = proof.positions[key], generated = moves.filter(move => node.moves[move].kind === OPPOSITE_KIND);
    if (generated.length || entry) {
      assert.ok(entry && generated.length);
      assert.deepEqual(entry.threats, analysis.threats);
      assert.ok(entry.threats.length >= 2);
      assert.deepEqual(entry.baseMoves, moves.filter(move => !generated.includes(move)));
      assert.deepEqual(entry.added.map(d => d.move), generated);
      assert.ok(moves.length <= 9);
      for (const d of entry.added) {
        const actual = analysis.defenses.find(candidate => candidate.move === d.move);
        assert.ok(actual && actual.stops.length && actual.replies.includes(d.reply));
        assert.deepEqual(d.stops, actual.stops);
        assert.ok(!d.stops.includes(d.reply));
        assert.deepEqual(Object.keys(g8.nodes[key + ',' + d.move].moves), [d.reply]);
        board[indexOf(d.move)] = WHITE;
        const response = analyzeMove(board, indexOf(d.reply), BLACK);
        assert.ok(response.legal && response.fourThree);
        board[indexOf(d.reply)] = BLACK;
        assert.deepEqual(winningMoves(board, WHITE), []);
        board[indexOf(d.reply)] = 0; board[indexOf(d.move)] = 0;
        assert.ok(!g8.nodes[key + ',' + d.move + ',' + d.reply], 'Continuation after four-three');
        addedChoices++;
      }
      augmentedPositions++;
      const branch = history[7], stat = byBranch[branch] ||= { positions: 0, choices: 0 };
      stat.positions++; stat.choices += entry.added.length;
    }
    if (whitePositions % 10000 === 0) progress({ whitePositions, augmentedPositions, addedChoices });
  }
  assert.equal(Object.keys(proof.positions).length, augmentedPositions, 'Unreachable side-defense evidence');
  const stats = { whitePositions, multiThreatPositions, augmentedPositions, addedChoices, byBranch };
  assert.deepEqual(proof.stats, stats);
  assert.deepEqual(g8.coverage.doubleFourThree, { policy: oppositePolicy, ...stats });
  // Legacy compressed VCF turns already have an immediate black-five threat;
  // inspect the remaining explicitly recorded J7 white decisions too.
  let legacyPositions = 0;
  for (const [key, node] of Object.entries(legacy.nodes)) {
    const h = key.split(',');
    if (h[5] !== 'J7' || h.length % 2 !== 1) continue;
    legacyPositions++;
    assert.deepEqual(missingFourThreeSides(inspect(boardOf(h)), Object.keys(node.moves)), [], 'Missing J7 attack-side defense: ' + key);
  }
  return { ...stats, legacyPositions };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log('Verified all four-three sides:', JSON.stringify(verifyOppositeSides(p => console.log('Side coverage progress:', JSON.stringify(p)))));
