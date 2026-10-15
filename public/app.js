import { coordOf, indexOf, playHistory, analyzeMove, BLACK, forbiddenNames } from './src/renju.mjs';
const $ = id => document.getElementById(id);
const API = (window.RENJU_API_BASE || '').replace(/\/$/, '');
const OPENING = ['H8', 'I9', 'I8', 'H7'];
const G8_START = [...OPENING, 'G10', 'G8', 'F9'];
const STORAGE = 'yunyu-classroom-v1';
let lessonId = 'main', catalog, state, timeline = [...OPENING], busy = false, showHints = true, demo = false, demoTimer, focusIndex = indexOf('H8');
let forbiddenPoints = new Map();
const feedback = (text, error = false) => { $('feedback').textContent = text; $('feedback').classList.toggle('error', error); };
async function api(path, body) {
  const response = await fetch(API + '/api/' + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('课堂服务未连接。请检查 Workers 地址配置后刷新。'); }
  if (!response.ok) throw new Error(data.error || '请求失败，请重试');
  return data;
}
function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ version: state.version, lessonId, timeline, cursor: state.history.length })); } catch { /* Private browsing may disable storage. */ }
}
function stopDemo() { demo = false; clearTimeout(demoTimer); $('demo').textContent = '▷ 演示当前变化'; }
async function perform(action) {
  if (busy) return;
  busy = true; updateButtons(); document.body.classList.add('loading');
  try { await action(); }
  catch (error) { stopDemo(); feedback(error.name === 'TimeoutError' ? '连接超时，棋局已保留。请重试。' : error.message === 'Failed to fetch' ? '无法连接课堂服务，棋局已保留。请检查网络或 Workers 的跨域配置。' : error.message, true); }
  finally { busy = false; document.body.classList.remove('loading'); updateButtons(); }
}
function makeBoard() {
  let grid = '';
  for (let i = 0; i < 15; i++) {
    const v = 48 + i * 36;
    grid += `<path d="M48 ${v}H552 M${v} 48V552" stroke="#827557" stroke-width=".9" opacity=".65"/>`;
    grid += `<text x="${v}" y="579" text-anchor="middle" fill="#918266" font-family="Georgia,serif" font-size="11">${String.fromCharCode(65 + i)}</text>`;
    grid += `<text x="25" y="${v + 4}" text-anchor="middle" fill="#918266" font-family="Georgia,serif" font-size="11">${15 - i}</text>`;
  }
  for (const [x, y] of [[3,3],[11,3],[7,7],[3,11],[11,11]]) grid += `<circle cx="${48+x*36}" cy="${48+y*36}" r="3.2" fill="#75694e"/>`;
  $('grid-svg').innerHTML = grid;
  for (let p = 0; p < 225; p++) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'intersection'; button.dataset.pos = p;
    button.style.left = (8 + p % 15 * 6) + '%'; button.style.top = (8 + Math.floor(p / 15) * 6) + '%';
    button.setAttribute('role', 'gridcell'); button.setAttribute('aria-label', coordOf(p) + ' 空位'); button.tabIndex = p === focusIndex ? 0 : -1;
    button.addEventListener('click', () => { focusIndex = p; if (!busy && !demo) play(coordOf(p)); });
    button.addEventListener('keydown', event => {
      const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -15, ArrowDown: 15 }[event.key];
      if (offset) {
        event.preventDefault();
        const nx = p % 15 + (offset === 1 ? 1 : offset === -1 ? -1 : 0), ny = Math.floor(p / 15) + (offset === 15 ? 1 : offset === -15 ? -1 : 0);
        if (nx >= 0 && nx < 15 && ny >= 0 && ny < 15) { focusIndex = ny * 15 + nx; button.tabIndex = -1; const target = $('intersections').children[focusIndex]; target.tabIndex = 0; target.focus(); }
      }
    });
    $('intersections').append(button);
  }
}
function render() {
  if (!state) return;
  const { board } = playHistory(state.history), lesson = catalog.lessons.find(l => l.id === lessonId);
  forbiddenPoints = new Map();
  if ($('forbidden').checked && !state.outcome) for (let p = 0; p < 225; p++) if (!board[p]) {
    const result = analyzeMove(board, p, BLACK);
    if (result.forbidden) forbiddenPoints.set(p, forbiddenNames[result.reason]);
  }
  const numbers = new Map(state.history.map((c, i) => [indexOf(c), i + 1]));
  const winning = new Set(state.outcome?.line || []);
  for (let p = 0; p < 225; p++) {
    const button = $('intersections').children[p], coord = coordOf(p), number = numbers.get(p);
    button.replaceChildren(); button.tabIndex = p === focusIndex ? 0 : -1;
    const stone = document.createElement('span');
    if (board[p]) {
      stone.className = 'stone ' + (board[p] === 1 ? 'black' : 'white') + (number === state.history.length ? ' latest' : '') + (winning.has(p) ? ' win' : ''); stone.textContent = number;
      button.setAttribute('aria-label', `${coord} ${board[p] === 1 ? '黑' : '白'}棋 第${number}手`);
      button.append(stone);
    } else {
      const isHint = showHints && state.hints.includes(coord) && state.turn === 2;
      button.setAttribute('aria-label', `${coord} 空位${isHint ? ' 候选点' : ''}${forbiddenPoints.has(p) ? ' 黑棋' + forbiddenPoints.get(p) + '禁手，白棋可落' : ''}`);
      if (isHint) { stone.className = 'hint-marker'; stone.textContent = String.fromCharCode(65 + state.hints.indexOf(coord)); button.append(stone); }
      else if (forbiddenPoints.has(p)) { stone.className = 'forbid-marker'; stone.textContent = '×'; button.append(stone); }
    }
  }
  $('board').classList.toggle('no-numbers', !$('numbers').checked);
  $('lesson-title').textContent = lesson.name;
  $('lesson-number').textContent = lessonId === 'main' ? '01' : '02';
  $('turn-label').replaceChildren();
  const dot = document.createElement('b'); dot.className = 'small-white';
  $('turn-label').append(dot, state.outcome ? (state.outcome.reason === 'four-three' ? '本变化结束 · 黑棋四三' : '本变化结束 · 黑棋成五') : state.history.length < timeline.length ? '复盘中 · 可从这里继续' : state.turn === 2 ? `轮到你 · 白${state.history.length + 1}` : `轮到黑棋 · 第${state.history.length + 1}手`);
  $('move-label').textContent = `第 ${state.history.length} 手`;
  $('coverage').textContent = state.outcome ? '本局已结束' : state.curated ? `${state.choices.length} 个候选点` : `${state.coverage.supported} / ${state.coverage.empty} 个空点已收录`;
  $('coverage-note').textContent = state.outcome ? '重新挑战，或悔棋换一个防点。' : state.curated ? '任选标记点落白子，黑棋自动应对。黑棋形成四三或成五即结束。' : state.coverage.supported === state.coverage.empty ? '此局面的所有空点均可尝试；黑棋形成四三或成五即结束。' : '请选择已收录防点；黑棋形成四三或成五即结束。';
  $('variations').replaceChildren();
  if (state.turn === 2 && !state.outcome) for (const [i, move] of state.hints.entries()) {
    const button = document.createElement('button'); button.className = 'variation'; button.title = `白棋落在 ${move}`;
    const strong = document.createElement('strong'); strong.textContent = move;
    const small = document.createElement('small'); small.textContent = state.curated ? String.fromCharCode(65 + i) : i === 0 ? '本课防点' : '另一变化';
    button.append(strong, small); button.addEventListener('click', () => { stopDemo(); play(move); });
    $('variations').append(button);
  }
  $('move-list').replaceChildren();
  timeline.forEach((coord, i) => {
    const button = document.createElement('button'); button.className = 'record-move' + (i + 1 === state.history.length ? ' current' : '') + (i + 1 > state.history.length ? ' future' : '');
    button.title = `第 ${i + 1} 手 ${i % 2 ? '白' : '黑'} ${coord}`; button.disabled = i < 3;
    const number = document.createElement('span'); number.textContent = i + 1;
    const dot = document.createElement('i'); dot.className = 'tiny-stone' + (i % 2 ? ' white' : '');
    button.append(number, dot, coord); button.addEventListener('click', () => { stopDemo(); goTo(i + 1); }); $('move-list').append(button);
  });
  $('replay-position').textContent = `${state.history.length} / ${timeline.length}`;
  document.querySelectorAll('.lesson-item').forEach(el => { el.classList.toggle('active', el.dataset.id === lessonId); el.setAttribute('aria-pressed', String(el.dataset.id === lessonId)); });
  $('hint').classList.toggle('on', showHints); $('hint').setAttribute('aria-pressed', String(showHints));
  updateButtons();
}
function updateButtons() {
  for (const id of ['hint','reset','undo','first','prev','next','last','symmetry','export']) $(id).disabled = busy || !state;
  if (!state) { $('demo').disabled = true; return; }
  $('undo').disabled = busy || state.history.length <= (state.curated ? 7 : 5);
  $('first').disabled = $('prev').disabled = busy || state.history.length <= 4;
  $('last').disabled = busy || state.history.length === timeline.length;
  $('next').disabled = busy || (state.history.length === timeline.length && (state.turn === 2 || !!state.outcome));
  $('demo').disabled = busy && !demo;
  document.querySelectorAll('.lesson-item,.variation').forEach(button => button.disabled = busy);
}
async function play(move) {
  if (!state || busy || state.outcome) return;
  if (state.turn !== 2 && move != null) { feedback('现在轮到黑棋，点击“下一手”继续。'); return; }
  if (move && state.history.includes(move)) { feedback('这里已经有棋子，请选择空点。'); return; }
  if (move && state.curated && !state.choices.includes(move)) { feedback('请选择本轮标出的候选点。'); return; }
  await perform(async () => {
    const result = await api('move', { history: state.history, move, lessonId });
    state = result; timeline = [...result.history]; render(); save();
    feedback(result.outcome ? (result.outcome.reason === 'four-three' ? '黑棋已形成四三，本次挑战结束。' : '黑棋成五获胜。可以重新挑战。') : '黑棋已落子，轮到你了。');
    const current = $('move-list').querySelector('.current'); if (current) $('move-list').scrollTop = current.offsetTop - $('move-list').offsetTop - 70;
  });
}
async function goTo(cursor) {
  await perform(async () => {
    const result = await api('state', { history: timeline.slice(0, Math.max(4, cursor)), lessonId }); state = result; render(); save();
    feedback(result.history.length < timeline.length ? '正在复盘。可继续前后查看，也可以从当前局面重新选择防守。' : '已回到最新一步。');
  });
}
async function reset(id = lessonId) {
  stopDemo();
  await perform(async () => {
    const result = await api(id === 'main' ? 'state' : 'move', { history: id === 'main' ? G8_START : OPENING, lessonId: id });
    lessonId = id; state = result; timeline = [...result.history]; showHints = true; render(); save();
    feedback(id === 'main' ? '已进入 G8 分支。你执白，从白8开始挑战。' : '黑五 G10 已落子。你执白，从第 6 手开始练习。');
  });
}
async function demoStep() {
  if (!demo || !state || state.outcome) { stopDemo(); return; }
  if (state.history.length < timeline.length) await goTo(state.history.length + 1);
  else await play(state.turn === 2 ? state.hints[0] || state.choices[0] : undefined);
  if (demo && !state.outcome) demoTimer = setTimeout(demoStep, 850); else stopDemo();
}
$('hint').onclick = () => { showHints = !showHints; render(); feedback(showHints ? '候选点已标出。' : '候选点标记已隐藏。'); };
$('numbers').onchange = render; $('forbidden').onchange = () => { render(); feedback($('forbidden').checked ? '× 只限制黑棋；你执白，可以在这些点落子。' : '黑棋禁手标记已隐藏。'); };
$('reset').onclick = () => reset(); $('classroom').onclick = () => $('board').scrollIntoView({ behavior: 'smooth', block: 'center' });
$('undo').onclick = () => { stopDemo(); goTo(Math.max(state.curated ? 7 : 5, state.history.length - (state.history.length % 2 ? 2 : 1))); };
$('first').onclick = () => { stopDemo(); goTo(4); }; $('symmetry').onclick = () => { stopDemo(); goTo(4); };
$('prev').onclick = () => { stopDemo(); goTo(state.history.length - 1); };
$('last').onclick = () => { stopDemo(); goTo(timeline.length); };
$('next').onclick = () => { stopDemo(); state.history.length < timeline.length ? goTo(state.history.length + 1) : play(); };
$('demo').onclick = async () => { if (demo) { stopDemo(); return; } if (state?.outcome) await reset(); demo = true; $('demo').textContent = 'Ⅱ 暂停演示'; demoStep(); };
$('export').onclick = () => {
  const payload = { title: '云雨棋室 · ' + catalog.lessons.find(l => l.id === lessonId).name, rules: 'RIF renju; fixed opening', stopCondition: 'black-four-three-or-five', version: state.version, lessonId, history: timeline, source: state.source };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `yunyu-${lessonId}-${timeline.length}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); feedback('已导出当前棋谱。');
};
for (const id of ['rules','sources']) { $(id + '-open').onclick = () => $(id + '-dialog').showModal(); $(id + '-dialog').onclick = event => { if (event.target === $(id + '-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } }; }
makeBoard();
await perform(async () => {
  catalog = await api('lessons');
  $('book-stats').textContent = `棋谱版本 ${catalog.version} · G8 挑战：${catalog.g8.positions} 个局面，${catalog.g8.terminalPaths} 条挑战路线。`;
  for (const [i, lesson] of catalog.lessons.entries()) {
    const button = document.createElement('button'); button.className = 'lesson-item'; button.dataset.id = lesson.id;
    const num = document.createElement('span'); num.className = 'lesson-num'; num.textContent = '0' + (i + 1);
    const content = document.createElement('span'), strong = document.createElement('strong'), small = document.createElement('small'); strong.textContent = lesson.name; small.textContent = lesson.subtitle; content.append(strong, small); button.append(num, content);
    button.onclick = () => reset(lesson.id); $('lessons').append(button);
  }
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE)); } catch {}
  if (saved?.version === catalog.version && catalog.lessons.some(l => l.id === saved.lessonId) && Array.isArray(saved.timeline)) {
    try {
      await api('state', { history: saved.timeline, lessonId: saved.lessonId });
      const cursor = Number.isInteger(saved.cursor) && saved.cursor >= 4 && saved.cursor <= saved.timeline.length ? saved.cursor : saved.timeline.length;
      state = await api('state', { history: saved.timeline.slice(0, cursor), lessonId: saved.lessonId }); timeline = saved.timeline; lessonId = saved.lessonId;
    } catch { saved = null; }
  }
  if (!state) { state = await api('state', { history: G8_START, lessonId }); timeline = [...state.history]; }
  render(); save(); $('connection').textContent = API ? 'Cloudflare · 固定棋谱' : '本地预览 · 固定棋谱';
  feedback(saved && state.history.length > 5 ? '已恢复上次的练习进度。' : '已进入 G8 分支。你执白，从白8开始挑战。');
});
