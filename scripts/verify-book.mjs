import assert from 'node:assert/strict';
import book from '../data/responses.json' with { type: 'json' };
import { BOOK_VERSION } from '../src/book.mjs';
import { BLACK, WHITE, playChallengeHistory as playHistory, indexOf, analyzeMove, winningMoves, coordOf } from '../src/renju.mjs';
import { ignoredCounterFours } from './tempo-fours.mjs';
let proofs = 0, blackMoves = 0, entries = 0;
assert.equal(book.version, BOOK_VERSION);
assert.equal(book.stopCondition, 'black-four-three-or-five');
function verifyProof(board, proof) {
  const p = indexOf(proof.move), result = analyzeMove(board, p, BLACK);
  assert.equal(result.legal, true, 'Illegal black move ' + proof.move); blackMoves++;
  if (proof.win) { assert.equal(result.win, true); return; }
  if (proof.end === 'four-three') {
    assert.equal(result.fourThree, true);
    assert.deepEqual(Object.keys(proof).sort(), ['end', 'move']);
    return;
  }
  assert.equal(result.win, false);
  assert.equal(result.fourThree, false, 'Continuation after a four-three');
  board[p] = BLACK;
  const threats = winningMoves(board, BLACK).map(coordOf);
  assert.deepEqual(proof.omittedTempoFours || [], ignoredCounterFours(board));
  assert.deepEqual(proof.threats.slice().sort(), threats.slice().sort(), 'Incorrect winning endpoints');
  assert.ok(threats.length > 0); assert.equal(winningMoves(board, WHITE).length, 0, 'White can win before black');
  // Every white move except a sole threat leaves a prewritten immediate win.
  if (threats.length === 1) {
    assert.ok(proof.next, 'Missing forced continuation');
    const defend = indexOf(threats[0]); board[defend] = WHITE;
    verifyProof(board, proof.next); board[defend] = 0;
  }
  board[p] = 0;
}
for (const [key, node] of Object.entries(book.nodes)) {
  const history = key.split(','), { board, outcome } = playHistory(history);
  assert.equal(outcome, null);
  if (node.omittedTempoFours) {
    const ignored = ignoredCounterFours(board);
    for (const move of node.omittedTempoFours) {
      assert.ok(ignored.includes(move) && !node.moves[move], 'Incorrect omitted legacy counter-four');
    }
  }
  if (history.length % 2 === 0) assert.equal(Object.keys(node.moves).length, 1, 'Black reply must be deterministic');
  for (const [move, entry] of Object.entries(node.moves)) {
    entries++;
    const color = history.length % 2 ? WHITE : BLACK, p = indexOf(move);
    assert.equal(analyzeMove(board, p, color).legal, true, key + ' -> ' + move);
    if (entry.proof) { board[p] = WHITE; verifyProof(board, entry.proof); board[p] = 0; proofs++; }
  }
}
assert.equal(proofs, book.proved);
console.log(`Verified ${Object.keys(book.nodes).length} recorded positions, ${entries} transitions, ${proofs} forcing entries and ${blackMoves} legal proof moves.`);
