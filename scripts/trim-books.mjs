import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { OPENING, BOOK_VERSION, keyOf } from '../src/book.mjs';
import { BLACK, WHITE, playChallengeHistory, analyzeMove, indexOf } from '../src/renju.mjs';
import { writeCompactG8 } from './compact-g8.mjs';
import { ignoredCounterFours } from './tempo-fours.mjs';

export function trimG8Book(book) {
  const nodes = {}, leaves = [], endings = { 'four-three': 0, five: 0 }, histogram = {};
  function visit(history) {
    const { outcome } = playChallengeHistory(history);
    if (outcome) {
      assert.equal(outcome.winner, BLACK);
      leaves.push(history.length); endings[outcome.reason]++;
      return 0;
    }
    const key = keyOf(history), original = book.nodes[key];
    assert.ok(original, 'Unclosed branch: ' + key);
    const node = nodes[key] = { moves: original.moves, turn: original.turn };
    const moves = Object.keys(node.moves);
    assert.ok(moves.length);
    node.maxPliesToEnd = Math.max(...moves.map(move => 1 + visit([...history, move])));
    if (node.turn === WHITE) histogram[moves.length] = (histogram[moves.length] || 0) + 1;
    return node.maxPliesToEnd;
  }
  visit(OPENING);
  return { ...book, version: BOOK_VERSION, stopCondition: 'black-four-three-or-five', nodes,
    provenance: { ...book.provenance, verification: 'Every selected path ends at the first legal black four-three or five. Four-three is a challenge stop, not a RIF five-in-a-row result.' },
    stats: { positions: Object.keys(nodes).length, terminalPaths: leaves.length, whiteChoiceHistogram: histogram,
      earliestEndPly: leaves.reduce((a, b) => Math.min(a, b), Infinity), latestEndPly: leaves.reduce((a, b) => Math.max(a, b), 0), endings }
  };
}

function trimProof(board, proof) {
  const p = indexOf(proof.move), result = analyzeMove(board, p, BLACK);
  assert.equal(result.legal, true);
  if (result.win) return { move: proof.move, win: true };
  if (result.fourThree) return { move: proof.move, end: 'four-three' };
  assert.ok(proof.threats?.length, 'Missing continuation after ' + proof.move);
  const next = { move: proof.move, threats: proof.threats };
  board[p] = BLACK;
  const omitted = ignoredCounterFours(board);
  board[p] = 0;
  if (omitted.length) next.omittedTempoFours = omitted;
  if (proof.threats.length === 1) {
    assert.ok(proof.next);
    const defend = indexOf(proof.threats[0]);
    board[p] = BLACK; board[defend] = WHITE;
    next.next = trimProof(board, proof.next);
    board[p] = 0; board[defend] = 0;
  }
  return next;
}

export function trimLegacyBook(book) {
  const nodes = {}; let proved = 0;
  function visit(history) {
    const { board, outcome } = playChallengeHistory(history);
    if (outcome) { assert.equal(outcome.winner, BLACK); return; }
    const key = keyOf(history), original = book.nodes[key];
    assert.ok(original, 'Missing recorded continuation: ' + key);
    const node = nodes[key] = { ...original, moves: {} };
    const ignored = history.length % 2 ? ignoredCounterFours(board) : [];
    const omitted = new Set((original.omittedTempoFours || []).filter(move => ignored.includes(move)));
    let available = Object.keys(original.moves).length;
    for (const [move, entry] of Object.entries(original.moves)) {
      if (ignored.includes(move)) {
        const reply = entry.proof?.move || Object.keys(book.nodes[key + ',' + move]?.moves || {})[0];
        const p = indexOf(move); board[p] = WHITE;
        const ends = reply && analyzeMove(board, indexOf(reply), BLACK).win;
        board[p] = 0;
        if (ends && available > 1) { omitted.add(move); available--; continue; }
      }
      if (entry.proof) {
        assert.equal(history.length % 2, 1);
        const p = indexOf(move); assert.equal(board[p], 0);
        board[p] = WHITE;
        node.moves[move] = { ...entry, proof: trimProof(board, entry.proof) };
        board[p] = 0; proved++;
      } else {
        node.moves[move] = entry;
        visit([...history, move]);
      }
    }
    if (omitted.size) node.omittedTempoFours = [...omitted];
    else delete node.omittedTempoFours;
  }
  visit(OPENING);
  return { ...book, version: BOOK_VERSION, stopCondition: 'black-four-three-or-five', nodes, proved };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [file, trim] of [['g8.json', trimG8Book], ['responses.json', trimLegacyBook]]) {
    const url = new URL('../data/' + file, import.meta.url), book = trim(JSON.parse(await readFile(url)));
    await writeFile(url, JSON.stringify(book));
    if (file === 'g8.json') writeCompactG8(book);
    console.log(file, JSON.stringify(book.stats || { positions: Object.keys(book.nodes).length, proved: book.proved }));
  }
}
