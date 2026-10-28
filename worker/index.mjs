import book from '../data/responses.json' with { type: 'json' };
import g8 from '../data/g8-runtime.json' with { type: 'json' };
import j7 from '../data/j7-runtime.json' with { type: 'json' };
import { LESSONS, OPENING, BOOK_VERSION, SOURCES } from '../src/book.mjs';
import { getState, advance, LessonError } from '../src/session.mjs';
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url), origin = request.headers.get('Origin');
    const origins = (env.ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map(v => v.trim());
    const allowed = !origin || origins.includes(origin);
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' };
    if (allowed && origin) headers['Access-Control-Allow-Origin'] = origin;
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
    if (!allowed) return json({ error: '此网站尚未配置为允许访问的前端来源', code: 'CORS_DENIED' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    try {
      if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true, version: BOOK_VERSION });
      if (url.pathname === '/api/lessons' && request.method === 'GET') return json({ lessons: LESSONS.map(({ moves, notes, diagram, ...lesson }) => ({ ...lesson, length: moves.length })), opening: OPENING, sources: SOURCES, version: BOOK_VERSION, provedVariations: book.proved, g8: g8.stats, j7: j7.stats });
      if (!['/api/state', '/api/move'].includes(url.pathname)) return json({ error: '接口不存在' }, 404);
      if (request.method !== 'POST') return json({ error: '请使用 POST 请求' }, 405);
      if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: '请使用 JSON 格式' }, 415);
      if (Number(request.headers.get('Content-Length')) > 8192) return json({ error: '请求过大' }, 413);
      // Read with a strict limit even when the client omits Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return json({ error: '缺少请求体' }, 400);
      let size = 0; const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel(); return json({ error: '请求过大' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let input;
      try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'JSON 格式错误' }, 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: '无效请求' }, 400);
      const lesson = input.lessonId ?? 'main';
      return json(url.pathname === '/api/state' ? getState(book, input.history, lesson) : advance(book, input.history, input.move, lesson));
    } catch (error) {
      if (error instanceof LessonError) return json({ error: error.message, code: error.code }, error.status);
      console.error('Lesson request failed');
      return json({ error: '课程暂时不可用，请重试', code: 'INTERNAL_ERROR' }, 500);
    }
  }
};
