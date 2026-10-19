import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { indexOf } from '../src/renju.mjs';

// A node is [remainingPlies, moveIndex, childId, ...]. Identical continuation
// subtrees share one ID; -1 denotes a terminal child. Candidate order is kept.
export function compactG8(book) {
  const nodes = [], signatures = new Map();
  function visit(history) {
    const source = book.nodes[history.join(',')];
    if (!source) return -1;
    const row = [source.maxPliesToEnd];
    for (const move of Object.keys(source.moves)) row.push(indexOf(move), visit([...history, move]));
    const signature = JSON.stringify(row);
    if (signatures.has(signature)) return signatures.get(signature);
    const id = nodes.length;
    nodes.push(row); signatures.set(signature, id);
    return id;
  }
  const root = visit(book.opening);
  return { version: book.version, format: 'continuation-dag-v1', root, nodes, stats: book.stats };
}
export function writeCompactG8(book) {
  const compact = compactG8(book);
  fs.writeFileSync(new URL('../data/g8-runtime.json', import.meta.url), JSON.stringify(compact));
  return compact;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const compact = writeCompactG8(JSON.parse(fs.readFileSync(new URL('../data/g8.json', import.meta.url), 'utf8')));
  console.log('Runtime G8 continuation nodes:', compact.nodes.length);
}
