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
  assert.deepEqual(advance(book, start.history, 'G8', 'main').choices, ['F10', 'H11', 'F11', 'H9']);
  const afterH11 = advance(book, [...start.history, 'G8', 'F9'], 'H11', 'main');
  assert.equal(afterH11.blackMove, 'E9');
  assert.deepEqual(afterH11.choices, ['F7', 'J11', 'D9', 'F11', 'H9']);
  const afterF11 = advance(book, afterH11.history, 'F11', 'main');
  assert.equal(afterF11.blackMove, 'D9');
  const afterC9 = advance(book, afterF11.history, 'C9', 'main');
  assert.equal(afterC9.blackMove, 'F10');
  assert.deepEqual(afterC9.choices, ['E11', 'G9', 'E10']);
  assert.equal(advance(book, afterC9.history, 'G9', 'main').blackMove, 'D10');
  const afterE10 = advance(book, afterC9.history, 'E10', 'main');
  assert.equal(afterE10.blackMove, 'G9');
  assert.equal(afterE10.outcome.reason, 'four-three');
  assert.equal(afterE10.history.length, 15);
  assert.deepEqual(afterE10.choices, []);
  assert.equal(advance(book, afterH11.history, 'H9', 'main').blackMove, 'F10');
  const afterD9 = advance(book, afterH11.history, 'D9', 'main');
  assert.equal(afterD9.blackMove, 'F11');
  assert.deepEqual(afterD9.choices, ['H9', 'E12']);
  const afterE12 = advance(book, afterD9.history, 'E12', 'main');
  assert.equal(afterE12.blackMove, 'F10');
});
test('white eighteen I10 is available on the C9 side line and stops at four-three', () => {
  const history = [...OPENING, 'G10', 'G8', 'F9', 'H11', 'E9', 'F11', 'D9', 'C9', 'F10', 'E11', 'G11', 'D8', 'H10'];
  assert.deepEqual(getState(book, history, 'main').choices, ['E10', 'I10']);
  const reply = advance(book, history, 'I10', 'main');
  assert.equal(reply.blackMove, 'F8');
  assert.deepEqual(reply.choices, ['E7', 'G9', 'F7', 'D10']);
  for (const defense of ['E7', 'G9', 'F7']) {
    const end = advance(book, reply.history, defense, 'main');
    assert.equal(end.blackMove, 'D10');
    assert.equal(end.outcome.reason, 'four-three');
    assert.equal(end.history.length, 21);
    assert.deepEqual(end.choices, []);
  }
  const afterD10 = advance(book, reply.history, 'D10', 'main');
  assert.equal(afterD10.blackMove, 'G9');
  assert.equal(afterD10.outcome.reason, 'four-three');
  assert.equal(afterD10.history.length, 21);
  assert.deepEqual(afterD10.choices, []);
});
test('white twenty F8 after F7 is met by E8 and ends at four-three', () => {
  const history = [...OPENING, 'G10', 'G8', 'F9', 'H11', 'E9', 'F11', 'D9', 'C9', 'F10', 'G9', 'D10', 'E10', 'D7', 'D8', 'F7'];
  assert.deepEqual(getState(book, history, 'main').choices, ['E8', 'G6', 'C6', 'F8']);
  const end = advance(book, history, 'F8', 'main');
  assert.equal(end.blackMove, 'E8');
  assert.equal(end.outcome.reason, 'four-three');
  assert.equal(end.history.length, 21);
  assert.deepEqual(end.choices, []);
});
test('white twenty D11 after D12 is met by C11 and ends at four-three', () => {
  const history = [...OPENING, 'G10', 'G8', 'F9', 'H11', 'E9', 'F11', 'D9', 'G9', 'E11', 'C9', 'E10', 'E8', 'D10', 'F10', 'D12'];
  assert.deepEqual(getState(book, history, 'main').choices, ['D8', 'D13', 'D11']);
  const reply = advance(book, history, 'D11', 'main');
  assert.equal(reply.blackMove, 'C11');
  assert.deepEqual(reply.choices, ['B12', 'F8']);
  for (const defense of reply.choices) {
    const end = advance(book, reply.history, defense, 'main');
    assert.equal(end.blackMove, 'E13');
    assert.equal(end.outcome.reason, 'four-three');
    assert.equal(end.history.length, 23);
    assert.deepEqual(end.choices, []);
  }
});
test('white sixteen E10 after K9 is available and has a fixed D8 reply', () => {
  const history = [...OPENING, 'G10', 'G8', 'F9', 'H11', 'E9', 'H9', 'F10', 'G9', 'D10', 'J9', 'K9'];
  assert.deepEqual(getState(book, history, 'main').choices, ['H10', 'E10']);
  const reply = advance(book, history, 'E10', 'main');
  assert.equal(reply.blackMove, 'D8');
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
for (const lesson of LESSONS) test(`${lesson.id} stops at its first four-three and rejects further play`, async () => {
  let state = advance(book, OPENING, null, lesson.id), steps = 0;
  while (!state.outcome && steps++ < 110) state = advance(book, state.history, state.hints[0] || state.choices[0], lesson.id);
  assert.equal(state.outcome?.winner, 1);
  assert.equal(state.outcome.reason, 'four-three');
  assert.deepEqual(state.choices, []); assert.deepEqual(state.hints, []);
  assert.throws(() => advance(book, state.history, 'A1', lesson.id), error => error.status === 409);
  assert.notEqual((await request('/api/state', { history: [...state.history, 'A1'], lessonId: lesson.id })).status, 200);
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
