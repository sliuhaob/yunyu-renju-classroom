import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import coverage from '../data/f11-coverage.json' with { type: 'json' };
import { verifyExpandedBranch } from './verify-f10.mjs';

export function verifyF11(onProgress = () => {}) {
  assert.equal(coverage.root, 'H8,I9,I8,H7,G10,G8,F9,F11');
  return verifyExpandedBranch(coverage, [], onProgress);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log('Verified recursive F11 coverage:', JSON.stringify(verifyF11(progress => console.log('F11 audit progress:', JSON.stringify(progress)))));
