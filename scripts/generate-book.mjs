import { writeFile, mkdir } from 'node:fs/promises';
import { makeSeedBook, LESSONS, keyOf, BOOK_VERSION } from '../src/book.mjs';
import { WHITE, coordOf, playHistory, analyzeMove } from '../src/renju.mjs';
import { vcf } from './tactics.mjs';
import { trimLegacyBook } from './trim-books.mjs';
const nodes = makeSeedBook();
function serialize(proof) {
  return { move: coordOf(proof.move), ...(proof.win ? { win: true } : { threats: proof.threats.map(coordOf), ...(proof.next ? { next: serialize(proof.next) } : {}) }) };
}
let proved = 0;
for (const lesson of LESSONS) {
  for (let n = 5; n <= lesson.moves.length; n += 2) {
    const history = lesson.moves.slice(0, n), { board } = playHistory(history);
    const node = nodes[keyOf(history)] ??= { moves: {}, lessons: [lesson.id] };
    for (let w = 0; w < 225; w++) if (!board[w]) {
      const white = coordOf(w);
      if (node.moves[white] || analyzeMove(board, w, WHITE).win) continue;
      board[w] = WHITE;
      const proof = vcf(board, n === lesson.moves.length ? 5 : 2, n === lesson.moves.length ? 600 : 25);
      board[w] = 0;
      if (!proof) continue;
      node.moves[white] = { kind: 'proved', note: '黑棋后续可连续冲四取胜。可复盘查看具体手顺。', proof: serialize(proof) };
      proved++;
    }
    console.log(lesson.id, n, 'plies;', proved, 'proved variations');
  }
}
await mkdir('data', { recursive: true });
const published = trimLegacyBook({ version: BOOK_VERSION, nodes, proved });
await writeFile('data/responses.json', JSON.stringify(published));
console.log('Wrote', Object.keys(published.nodes).length, 'positions and', published.proved, 'forcing proofs.');
