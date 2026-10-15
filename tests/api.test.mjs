import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import book from '../data/responses.json' with { type: 'json' };
import { OPENING, LESSONS } from '../src/book.mjs';
import { getState, advance } from '../src/session.mjs';
const request = (path, input, origin = 'http://localhost:5173') => worker.fetch(new Request('https://api.example' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(input) }));
test('fixed opening is centrally symmetric around the black midpoint', () => {
  assert.deepEqual(OPENING, ['H8', 'I9', 'I8', 'H7']);
});
test('G8 challenge fixes the opening while the legacy J7 variation remains available', () => {
  const start = advance(book, OPENING, null, 'main'); assert.equal(start.blackMove, 'G10');
  assert.deepEqual(start.choices, ['G8']);
  assert.equal(advance(book, start.history, 'G8', 'main').blackMove, 'F9');
  assert.equal(advance(book, start.history, 'J7', 'j7').blackMove, 'G8');
  assert.deepEqual(advance(book, start.history, 'G8', 'main').choices, ['F10', 'H11', 'F11']);
});
test('unsupported white move rejects without mutating history', () => {
  const history = [...OPENING,'G10']; assert.throws(() => advance(book, history, 'A1', 'main'), /候选点/); assert.equal(history.length, 5);
});
test('early off-line defenses enter a proved win for every remaining white reply', () => {
  const cases = [
    { id: 'j7', history: [...OPENING, 'G10', 'J7', 'G8'], reply: 'F8' }
  ];
  for (const { id, history, reply } of cases) {
    const state = advance(book, history, 'A1', id);
    assert.equal(state.blackMove, reply);
    assert.equal(state.choices.length, 225 - state.history.length);
    for (const defense of state.choices) {
      const result = advance(book, state.history, defense, id);
      assert.equal(result.outcome?.winner, 1, id + ': ' + defense);
    }
  }
});
for (const lesson of LESSONS) test(`full ${lesson.id} demonstration ends in black five`, () => {
  let state = advance(book, OPENING, null, lesson.id), steps = 0;
  while (!state.outcome && steps++ < 110) state = advance(book, state.history, state.hints[0] || state.choices[0], lesson.id);
  assert.equal(state.outcome?.winner, 1);
  console.log(lesson.id, 'finished at', state.history.length, 'plies');
});
test('replay validates arbitrary recorded prefixes, and blocks forged black moves', () => {
  const lesson = LESSONS.find(l => l.id === 'j7');
  for (let i = 4; i <= lesson.moves.length; i++) assert.equal(getState(book, lesson.moves.slice(0,i), lesson.id).history.length, i);
  assert.throws(() => getState(book, [...OPENING,'A1'], 'main'));
});
test('API returns next white turn with exact CORS origin', async () => {
  const response = await request('/api/move', { history: OPENING, lessonId: 'main' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.equal((await response.json()).turn, 2);
});
test('disallowed origins, malformed JSON, huge requests and invalid payload reject', async () => {
  assert.equal((await request('/api/move', { history: OPENING }, 'https://evil.example')).status, 403);
  assert.equal((await request('/api/state', null)).status, 400);
  assert.equal((await request('/api/state', { history: ['A1'] })).status, 400);
  assert.equal((await request('/api/state', { padding: 'x'.repeat(9000) })).status, 413);
  const malformed = await worker.fetch(new Request('https://api.example/api/state', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{' })); assert.equal(malformed.status,400);
});
test('CORS preflight and unknown routes', async () => {
  assert.equal((await worker.fetch(new Request('https://api.example/api/move',{method:'OPTIONS',headers:{Origin:'http://localhost:5173'}}))).status,204);
  assert.equal((await worker.fetch(new Request('https://api.example/nope'))).status,404);
  assert.equal((await worker.fetch(new Request('https://api.example/api/state'))).status,405);
});
