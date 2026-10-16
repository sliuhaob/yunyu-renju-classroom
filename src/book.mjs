export const BOOK_VERSION = '2026-10-16.1';
export const OPENING = ['H8', 'I9', 'I8', 'H7'];
export const SOURCES = [
  { title: '励精连珠教室 · 云月白4 H7、黑5 G10', url: 'https://www.ljrenju.com/croom/i06/i06ba.htm' },
  { title: 'RIF 国际连珠规则 · 第9条', url: 'https://gomoku.renju.net/rifrules/' }
];
// Move coordinates are transcribed factual variations; all prose and artwork are original.
// Both records use the actual Cloud Moon board. Do not translate to Rain Moon:
// the distance to an edge can change a tactical result.
export const LESSONS = [
  {
    id: 'main', name: 'G8 防守挑战', subtitle: '少量选点 · 每支走到终局', level: '进阶', finishDefense: 'G7',
    description: '白六固定 G8，从白八开始选择防点；黑棋形成合法四三或成五时结束挑战。',
    source: SOURCES[0].url, diagram: 'i062111.gif',
    moves: 'H8 I9 I8 H7 G10 G8 F9 F10 H11 I12 H9 F11 J6 J7 K7 K8 I6 I7 F7 E8 H6 G6 I5 H4 L8 M9 L6 K6 M5 N4 L5 L7 J4'.split(' '),
    notes: {
      5: 'G10 把黑棋的战场引向左上，白棋需要同时照顾中央的横二。',
      6: 'G8 封住横二的一端，并与 H7 形成斜向联络。',
      7: 'F9 与 G10 构成斜二。黑棋没有急着冲四，而是在扩大进攻空间。',
      8: 'F10 贴住左上黑子，限制两颗黑子的继续展开。',
      9: 'H11 把 F9、G10 连成斜活三，白棋必须处理这条线。',
      11: 'H9 把原有黑子连成另一条斜活三，进攻方向开始改变。',
      13: 'J6 为右下布局。此时不能只盯着上一手的进攻方向。',
      19: 'F7 连接两翼，后续进攻会逐渐转到下方。',
      25: 'L8 利用 I5、J6、K7 形成斜线攻势，逼迫白棋继续应对。',
      33: 'J4 连出斜三。后续收束由离线生成的连续冲四证明逐手校验。'
    }
  },
  {
    id: 'j7', name: 'J7 防守变化', subtitle: '从另一侧限制斜线', level: '基础', finishDefense: 'H12',
    description: '白六落在 J7 后，观察黑棋如何通过横三、斜三连续调动，最终完成四三收束。',
    source: SOURCES[0].url, diagram: 'i062725.gif',
    moves: 'H8 I9 I8 H7 G10 J7 G8 J8 H11 F8 F9 I12 G11 G9 F11 I11 D11 E11 E10 C12 H9 E12 H10'.split(' '),
    notes: {
      6: 'J7 从右下方限制黑棋，但中央横二仍有延伸空间。',
      7: 'G8 连成横活三，白棋需要挡住一端。',
      9: 'H11 延伸 G10 的斜线，与 F9 的潜在连接呼应。',
      11: 'F9 连成斜活三，白棋继续防守。',
      15: 'F11 在上方连成横三，把白棋引向这一侧。',
      17: 'D11 形成跳四，E11 是直接成五点。',
      19: 'E10 形成斜四，C12 成为必须处理的点。',
      21: 'H9 形成斜四，防守再次被迫转向。',
      23: 'H10 同时制造纵向冲四和横向三。先防冲四，黑棋仍能形成活四。'
    }
  }
];
export function keyOf(history) { return history.join(','); }
export function makeSeedBook() {
  const nodes = {};
  for (const lesson of LESSONS) for (let n = 4; n < lesson.moves.length; n++) {
    const prefix = lesson.moves.slice(0, n), key = keyOf(prefix);
    nodes[key] ??= { moves: {}, lessons: [] };
    const node = nodes[key], move = lesson.moves[n];
    if (!node.lessons.includes(lesson.id)) node.lessons.push(lesson.id);
    node.moves[move] ??= { note: lesson.notes[n + 1] ?? '', kind: 'recorded' };
  }
  return nodes;
}
