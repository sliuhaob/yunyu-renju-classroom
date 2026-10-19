import { OPENING, LESSONS, keyOf, BOOK_VERSION } from './book.mjs';
import { BLACK, WHITE, playChallengeHistory as playHistory, coordOf, indexOf } from './renju.mjs';
import g8 from '../data/g8-runtime.json' with { type: 'json' };
export class LessonError extends Error {
  constructor(message, status = 422, code = 'OUT_OF_BOOK') { super(message); this.status = status; this.code = code; }
}
function resolve(book, history) {
  if (!Array.isArray(history) || history.length < 4 || history.length > 225 || history.some(c => typeof c !== 'string')) throw new LessonError('棋谱格式无效', 400, 'BAD_HISTORY');
  history = history.map(c => c.toUpperCase());
  if (!OPENING.every((c, i) => history[i] === c)) throw new LessonError('本课程固定为云月白四 H7 的局面', 400, 'BAD_OPENING');
  let cursor = { type: 'recorded', node: book.nodes[keyOf(OPENING)] }, note = '';
  for (let i = 4; i < history.length; i++) {
    const move = history[i];
    if (cursor.type === 'done') throw new LessonError('对局已经结束', 400, 'FINISHED');
    if (cursor.type === 'recorded') {
      const entry = cursor.node?.moves[move];
      if (!entry) throw new LessonError('这个防点尚未收录。请选择标出的防点，或查看当前主线。');
      note = entry.note;
      cursor = entry.proof ? { type: 'black', proof: entry.proof } : { type: 'recorded', node: book.nodes[keyOf(history.slice(0, i + 1))] };
    } else if (cursor.type === 'black') {
      if (move !== cursor.proof.move) throw new LessonError('黑棋必须按已录入的棋谱落子', 400, 'BAD_REPLY');
      note = cursor.proof.win ? '黑棋连成五子。复盘刚才的防守，看看进攻从哪里开始变得连续。' : '黑棋冲四。优先防住直接成五点，避免只看自己能否连三。';
      cursor = cursor.proof.win || cursor.proof.end === 'four-three' ? { type: 'done' } : { type: 'white', proof: cursor.proof };
    } else {
      const wins = cursor.proof.threats.filter(c => c !== move);
      note = wins.length ? '这一步没有解除黑棋的全部成五威胁。' : '挡住冲四点，黑棋会继续按固定的收束手顺进攻。';
      const next = wins.length ? { move: wins[0], win: true } : cursor.proof.next;
      if (!next) throw new LessonError('棋谱数据不完整', 500, 'BOOK_ERROR');
      cursor = { type: 'black', proof: next };
    }
  }
  let game;
  try { game = playHistory(history); } catch (error) { throw new LessonError(error.message, 400, 'ILLEGAL_HISTORY'); }
  return { cursor, note, ...game, history };
}
export function getState(book, history, lessonId = 'main') {
  const lesson = LESSONS.find(l => l.id === lessonId);
  if (!lesson) throw new LessonError('课程不存在', 404, 'UNKNOWN_LESSON');
  if (lessonId === 'main') return getG8State(history, lesson);
  const { cursor, board, outcome, note, history: normalized } = resolve(book, history);
  const turn = history.length % 2 ? WHITE : BLACK;
  let choices;
  if (outcome || cursor.type === 'done') choices = [];
  else if (cursor.type === 'recorded') choices = Object.keys(cursor.node?.moves ?? {});
  else if (cursor.type === 'black') choices = [cursor.proof.move];
  else choices = Array.from({ length: 225 }, (_, p) => p).filter(p => !board[p]).map(coordOf);
  const preferred = lesson.moves[history.length] || (history.length === lesson.moves.length ? lesson.finishDefense : undefined);
  const onLine = history.every((c, i) => c.toUpperCase() === lesson.moves[i]);
  const recorded = cursor.type === 'recorded' ? choices.filter(c => cursor.node.moves[c].kind === 'recorded') : [];
  const hints = outcome ? [] : onLine && choices.includes(preferred) ? [preferred, ...recorded.filter(c => c !== preferred)] : cursor.type === 'white' ? cursor.proof.threats : recorded.length ? recorded : choices.slice(0, 3);
  return { version: BOOK_VERSION, history: normalized, turn, choices, hints, note: note || '白四已落在 H7，轮到黑五。先观察四子的中心对称关系。', outcome, onLine, phase: cursor.type, lessonId, source: lesson.source, totalRecorded: lesson.moves.length, coverage: { supported: choices.length, empty: board.filter(p => !p).length } };
}
function getG8State(history, lesson) {
  if (!Array.isArray(history) || history.length < 4 || history.length > 225 || history.some(c => typeof c !== 'string')) throw new LessonError('棋谱格式无效', 400, 'BAD_HISTORY');
  const normalized = history.map(c => c.toUpperCase());
  if (!OPENING.every((c, i) => normalized[i] === c)) throw new LessonError('前四手固定为 H8、I9、I8、H7', 400, 'BAD_OPENING');
  let node = g8.nodes[g8.root];
  for (let i = 4; i < normalized.length; i++) {
    let position;
    try { position = indexOf(normalized[i]); } catch { throw new LessonError('无效坐标', 400, 'BAD_HISTORY'); }
    let child;
    for (let edge = 1; node && edge < node.length; edge += 2) if (node[edge] === position) { child = node[edge + 1]; break; }
    if (child === undefined) throw new LessonError(i % 2 ? '请选择本轮标出的候选点' : '黑棋必须按固定应手落子', 422, i % 2 ? 'OUT_OF_BOOK' : 'BAD_REPLY');
    node = child < 0 ? null : g8.nodes[child];
  }
  let game;
  try { game = playHistory(normalized); } catch (error) { throw new LessonError(error.message, 400, 'ILLEGAL_HISTORY'); }
  const choices = game.outcome ? [] : node?.filter((_, i) => i % 2 === 1).map(coordOf) || [];
  if (!game.outcome && !choices.length) throw new LessonError('分支数据不完整', 500, 'BOOK_ERROR');
  const turn = normalized.length % 2 ? WHITE : BLACK;
  return { version: BOOK_VERSION, history: normalized, turn, choices, hints: turn === WHITE ? choices : [], note: '', outcome: game.outcome, onLine: false, phase: 'curated', curated: true, lessonId: 'main', source: lesson.source, totalRecorded: g8.stats.latestEndPly, maxPliesToEnd: node?.[0] || 0, coverage: { supported: choices.length, empty: 225 - normalized.length } };
}
export function advance(book, history, whiteMove, lessonId) {
  const state = getState(book, history, lessonId);
  if (state.outcome) throw new LessonError('本局已结束，请重新练习', 409, 'FINISHED');
  const next = [...state.history];
  if (state.turn === WHITE) {
    const move = typeof whiteMove === 'string' ? whiteMove.toUpperCase() : '';
    if (!state.choices.includes(move)) throw new LessonError(state.curated ? '请选择本轮标出的候选点，棋盘已保留。' : '这个防点尚未收录，棋盘已保留。可开启防点提示，选择已验证的变化。');
    next.push(move);
  } else if (whiteMove != null) throw new LessonError('当前轮到黑棋', 400, 'WRONG_TURN');
  const afterWhite = getState(book, next, lessonId);
  if (afterWhite.outcome) return afterWhite;
  if (!afterWhite.choices.length) throw new LessonError('本分支后续棋谱尚未收录', 422, 'INCOMPLETE_BRANCH');
  // Every black reply is prewritten. No heuristic, random, or online AI fallback.
  next.push(afterWhite.choices[0]);
  const result = getState(book, next, lessonId);
  return { ...result, whiteNote: state.turn === WHITE ? afterWhite.note : '', blackMove: next.at(-1) };
}
