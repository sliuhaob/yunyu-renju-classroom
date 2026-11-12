import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import coverage from '../data/h11-coverage.json' with { type: 'json' };
import requests from '../data/h11-requests.json' with { type: 'json' };
import { verifyExpandedBranch } from './verify-f10.mjs';

export function verifyH11(onProgress = () => {}) {
  assert.equal(coverage.root, 'H8,I9,I8,H7,G10,G8,F9,H11');
  return verifyExpandedBranch(coverage, requests, onProgress);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log('Verified recursive H11 coverage:', JSON.stringify(verifyH11(progress => console.log('H11 audit progress:', JSON.stringify(progress)))));
