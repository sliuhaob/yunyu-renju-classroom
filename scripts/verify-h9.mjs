import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import coverage from '../data/h9-coverage.json' with { type: 'json' };
import { verifyExpandedBranch } from './verify-f10.mjs';
import { rankedDefenses, screenWhite } from './f10-candidates.mjs';
import { playChallengeHistory } from '../src/renju.mjs';

export function verifyH9(onProgress = () => {}) {
  assert.equal(coverage.root, 'H8,I9,I8,H7,G10,G8,F9,H9');
  const history = (coverage.root + ',F10').split(','), entry = coverage.positions[history.join(',')];
  assert.ok(entry, 'The pictured black-nine F10 position must remain available');
  assert.equal(coverage.policy.rootRefinement.blackReplySearchMs, 8000);
  for (const candidate of entry.candidates) {
    const original = /^-M(\d+)$/.exec(candidate.rootEvaluation), reply = /^\+?M(\d+)$/.exec(candidate.replyAnalysis?.evaluation || '');
    const expected = original && reply ? '-M' + Math.min(Number(original[1]), Number(reply[1]) + 1) : candidate.rootEvaluation;
    assert.equal(candidate.evaluation, expected);
  }
  const proposal = { move: 'F7', candidates: entry.candidates.map(c => ({ ...c, eval: c.evaluation })) };
  const selected = rankedDefenses(screenWhite(playChallengeHistory(history).board), proposal, ['F7', 'J9']);
  assert.deepEqual([...entry.moves, ...(entry.omittedTempoFours || [])].sort(), selected.sort());
  return verifyExpandedBranch(coverage, [], onProgress);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log('Verified recursive H9 coverage:', JSON.stringify(verifyH9(progress => console.log('H9 audit progress:', JSON.stringify(progress)))));
