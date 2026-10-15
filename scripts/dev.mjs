import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import worker from '../worker/index.mjs';
const root = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:5173');
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 8192) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const response = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body }));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    let file;
    if (url.pathname === '/src/renju.mjs') file = resolve('src/renju.mjs');
    else {
      file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(5173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:5173'));
