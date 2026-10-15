// Audit real coverage independently from the headline count of tactical branches.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { OPENING, keyOf } from '../src/book.mjs';
import { WHITE, playHistory } from '../src/renju.mjs';
import { vcf } from './tactics.mjs';

const raw = await readFile(new URL('../data/responses.json', import.meta.url));
const book = JSON.parse(raw);
const whitePositions = [], uniqueProofs = new Set();
let transitions = 0, proofRecords = 0, proofBytes = 0, immediateWinEntries = 0;
function countProof(proof) {
  proofRecords++;
  uniqueProofs.add(JSON.stringify(proof));
  if (proof.next) countProof(proof.next);
}
for (const [key, node] of Object.entries(book.nodes)) {
  const history = key.split(','), moves = Object.entries(node.moves);
  transitions += moves.length;
  if (history.length % 2) whitePositions.push({
    ply: history.length, history, empty: 225 - history.length,
    supported: moves.length,
    recorded: moves.filter(([, entry]) => !entry.proof).length,
    proved: moves.filter(([, entry]) => entry.proof).length
  });
  for (const [, entry] of moves) if (entry.proof) {
    if (entry.proof.win) immediateWinEntries++;
    proofBytes += Buffer.byteLength(JSON.stringify(entry.proof));
    countProof(entry.proof);
  }
}
const rootHistory = [...OPENING, 'G10'];
const root = whitePositions.find(row => keyOf(row.history) === keyOf(rootHistory));
const naiveTree = [];
let leaves = 1n, accumulated = 0n;
for (let choices = 1; choices <= 10; choices++) {
  leaves *= BigInt(222 - choices * 2);
  accumulated += leaves;
  if ([1, 2, 3, 4, 5, 10].includes(choices)) naiveTree.push({
    whiteChoices: choices, throughWhitePly: 4 + choices * 2,
    leaves: leaves.toString(), cumulativeReplyRecords: accumulated.toString(),
    cumulativeBytesAt64: (accumulated * 64n).toString()
  });
}
// Current generator deliberately skips these early positions. Measure whether
// its VCF solver can generate even one reply for any of the 220 white-six moves.
// A null result here says nothing about the position's true game-theoretic value.
const { board } = playHistory(rootHistory);
const start = performance.now();
let vcfRootSolved = 0;
for (let p = 0; p < 225; p++) if (!board[p]) {
  board[p] = WHITE;
  if (vcf(board, 2, 25)) vcfRootSolved++;
  board[p] = 0;
}
const vcfRootElapsedMs = Math.round(performance.now() - start);
const report = {
  opening: OPENING, fixedBlackFive: 'G10',
  current: {
    jsonBytes: raw.length, gzipBytes: gzipSync(raw).length,
    recordedPositions: Object.keys(book.nodes).length, transitions,
    provedEntries: book.proved, immediateWinEntries, proofRecords,
    uniqueSerializedProofs: uniqueProofs.size, proofBytes,
    whitePositions: whitePositions.length,
    fullyCoveredRecordedWhitePositions: whitePositions.filter(p => p.supported === p.empty).length,
    supportedAtRecordedWhitePositions: whitePositions.reduce((sum, row) => sum + row.supported, 0),
    emptyAtRecordedWhitePositions: whitePositions.reduce((sum, row) => sum + row.empty, 0),
    firstWhiteMove: { supported: root.supported, legal: root.empty, moves: Object.keys(book.nodes[keyOf(rootHistory)].moves) },
    earlyWhitePositions: whitePositions.filter(p => p.ply <= 11),
  },
  vcfRootProbe: { positions: 220, solved: vcfRootSolved, depth: 2, visitBudgetPerPosition: 25, elapsedMs: vcfRootElapsedMs, caveat: 'Only VCF detection; not a general win/loss solver or a runtime estimate for full solving.' },
  naiveTree,
  naiveTreeCaveat: 'Upper counting envelope for unmerged histories under one black reply, ignoring earlier wins and unavailable continuations. Not the required size of a compressed winning strategy.',
  compactStorageScenarios: [100_000, 1_000_000, 10_000_000, 100_000_000].map(n => ({ positions: n, bytesAt64: n * 64, bytesAt128: n * 128 })),
  compactStorageCaveat: 'Illustrative 64–128-byte compact policy record (packed position + reply + metadata/index); excludes a complete proof graph, DB overhead and backups. Position counts are budget scenarios, not a prediction.',
};
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/book-capacity.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
