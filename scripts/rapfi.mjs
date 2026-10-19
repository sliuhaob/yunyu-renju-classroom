// Optional OFFLINE candidate generator. The executable/weights are not shipped.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { indexOf, coordOf } from '../src/renju.mjs';

export class Rapfi {
  constructor(directory = process.env.RAPFI_DIR || 'artifacts/rapfi') {
    this.process = spawn(resolve(directory, 'pbrain-rapfi-windows-sse.exe'), [], { cwd: resolve(directory), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.pending = null;
    this.failed = false;
    createInterface({ input: this.process.stdout }).on('line', line => {
      if (!this.pending) return;
      this.pending.lines.push(line);
      if (/^\d+,\d+$/.test(line)) {
        const [x, y] = line.split(',').map(Number), result = { move: coordOf(y * 15 + x), lines: this.pending.lines, candidates: parseCandidates(this.pending.lines) };
        clearTimeout(this.pending.timer); this.pending.resolve(result); this.pending = null;
      }
    });
    const fail = error => {
      this.failed = true;
      if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; }
    };
    this.process.on('error', fail);
    this.process.stdin.on('error', fail);
    this.process.on('exit', code => { if (this.pending) fail(new Error('Rapfi exited: ' + code)); else this.failed = true; });
    this.process.stderr.on('data', chunk => process.stderr.write(chunk));
    this.send('START 15\nINFO rule 4\nINFO thread_num 1\nINFO hash_size 65536\nINFO pondering 0\nINFO caution_factor 4');
  }
  send(command) {
    if (this.failed || this.process.killed || this.process.stdin.destroyed) throw new Error('Rapfi is not running');
    this.process.stdin.write(command + '\n');
  }
  async analyze(history, count = 3, ms = 1000) {
    if (this.pending) throw new Error('Concurrent engine request');
    if (this.failed || this.process.killed) throw new Error('Rapfi is not running');
    const self = history.length % 2;
    const entries = history.map((c, i) => { const p = indexOf(c); return `${p % 15},${Math.floor(p / 15)},${i % 2 === self ? 1 : 2}`; });
    const promise = new Promise((resolve, reject) => {
      this.pending = { resolve, reject, lines: [], timer: setTimeout(() => { this.failed = true; this.process.kill(); reject(new Error('Rapfi timed out')); this.pending = null; }, Math.max(60000, ms + 30000)) };
    });
    try { this.send(`INFO timeout_turn ${ms}\nINFO time_left 2147483647\nYXBOARD\n${entries.join('\n')}\nDONE\nYXNBEST ${count}`); }
    catch (error) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; }
    return promise;
  }
  close() { if (!this.failed && !this.process.killed && !this.process.stdin.destroyed) { this.send('END'); this.process.stdin.end(); } }
}

export function parseCandidates(lines) {
  let current = new Map(), completed = [], multiPV = false;
  for (const line of lines) {
    const match = /^MESSAGE \((\d+)\) (.*?) \| (\d+)-(\d+) \| (.*)$/.exec(line);
    if (match) {
      multiPV = true;
      const pv = match[5].trim().split(/\s+/).filter(c => /^[A-O](?:[1-9]|1[0-5])$/.test(c)).map(c => c[0] + (16 - Number(c.slice(1))));
      current.set(Number(match[1]), { move: pv[0], eval: match[2], depth: Number(match[3]), pv });
    } else if (/^MESSAGE Depth /.test(line)) {
      const reportedDepth = Number(/^MESSAGE Depth (\d+)/.exec(line)?.[1]);
      // A timeout can print a partial deeper MultiPV iteration followed by the
      // last completed depth. Do not let that partial list erase candidates.
      if (current.size && [...current.values()].every(c => c.depth === reportedDepth)) completed = [...current.values()];
      else if (!multiPV || !completed.length) {
        const main = /^MESSAGE Depth (\d+)-\d+ \| Eval (.*?) \| Time .*? \| (.*)$/.exec(line);
        if (main) {
          const pv = main[3].trim().split(/\s+/).filter(c => /^[A-O](?:[1-9]|1[0-5])$/.test(c)).map(c => c[0] + (16 - Number(c.slice(1))));
          completed = [{ move: pv[0], eval: main[2], depth: Number(main[1]), pv }];
        }
      }
      current = new Map();
    }
  }
  return completed;
}
