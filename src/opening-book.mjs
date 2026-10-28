import { indexOf } from './renju.mjs';

// Join the four precomputed strategies at white six. Only the shared entry
// changes; all later choices, replies and distance bounds stay identical.
export function joinWhiteSixBooks(entries) {
  const nodes = [], choices = [], stats = { latestEndPly: 0, terminalPaths: 0 };
  let remaining = 0;
  for (const [move, book] of entries) {
    const root = book.nodes[book.root], whiteSix = book.nodes[root[2]];
    if (root.length !== 3 || root[1] !== indexOf('G10') || whiteSix.length !== 3 || whiteSix[1] !== indexOf(move)) throw new Error('Invalid white-six strategy: ' + move);
    const offset = nodes.length;
    for (const row of book.nodes) nodes.push(row.map((value, i) => i > 0 && i % 2 === 0 && value >= 0 ? value + offset : value));
    choices.push(indexOf(move), whiteSix[2] < 0 ? -1 : whiteSix[2] + offset);
    remaining = Math.max(remaining, whiteSix[0]);
    stats.latestEndPly = Math.max(stats.latestEndPly, book.stats.latestEndPly);
    stats.terminalPaths += book.stats.terminalPaths;
  }
  const whiteSix = nodes.push([remaining, ...choices]) - 1;
  const root = nodes.push([remaining + 1, indexOf('G10'), whiteSix]) - 1;
  return { root, nodes, stats };
}
