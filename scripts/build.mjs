import { cp, mkdir, writeFile } from 'node:fs/promises';
const api = process.env.RENJU_API_BASE || '';
if (api && (!/^https:\/\//.test(api) || new URL(api).pathname !== '/')) throw new Error('RENJU_API_BASE 必须是 HTTPS Worker 根地址');
await mkdir('dist/src', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('src/renju.mjs', 'dist/src/renju.mjs');
await writeFile('dist/config.js', `window.RENJU_API_BASE = ${JSON.stringify(api.replace(/\/$/, ''))};\n`);
await writeFile('dist/.nojekyll', '');
console.log('Built GitHub Pages frontend to dist/. API:', api || 'same origin (local preview)');
