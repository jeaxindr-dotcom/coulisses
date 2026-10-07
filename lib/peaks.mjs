// Waveform peaks of an audio file for the timeline (after HyperFrames' AudioWaveform: the server sends peaks, the page
// draws bars). ffmpeg decodes to 8 kHz mono, one peak per 10 ms (0–255). Cached on disk by file path + size + date.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CACHE as ROOT } from './place.mjs';

const CACHE = path.join(ROOT, 'peaks');
const RATE = 8000, PER = 80;   // 100 peaks per second
const memo = new Map();
let running = 0; const queue = [];
const slot = () => new Promise((r) => { if (running < 3) { running++; r(); } else queue.push(r); });
const free = () => { const n = queue.shift(); if (n) n(); else running--; };

export async function peaksOf(file) {
  const st = fs.statSync(file);
  const key = crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
  if (memo.has(key)) return memo.get(key);
  const cached = path.join(CACHE, `${key}.json`);
  const job = (async () => {
    try { return JSON.parse(fs.readFileSync(cached, 'utf8')); } catch { /* not yet */ }
    await slot();
    try {
      const pcm = await new Promise((resolve, reject) => {
        const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { windowsHide: true });
        const chunks = []; let err = '';
        p.stdout.on('data', (d) => chunks.push(d)); p.stderr.on('data', (d) => { err += d; });
        p.on('error', reject); p.on('close', (c) => (c === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err.trim().split('\n').pop() || `ffmpeg ${c}`))));
      });
      const n = Math.floor(pcm.length / 2), out = new Array(Math.ceil(n / PER));
      let top = 1;
      for (let i = 0; i < out.length; i++) {
        let m = 0; const end = Math.min(n, (i + 1) * PER);
        for (let j = i * PER; j < end; j++) { const v = Math.abs(pcm.readInt16LE(j * 2)); if (v > m) m = v; }
        out[i] = m; if (m > top) top = m;
      }
      // absolute scale (not normalised per file), so a quiet sound looks quiet next to a loud one
      const data = { dur: +(n / RATE).toFixed(3), rate: RATE / PER, peaks: out.map((m) => Math.round(Math.min(1, m / 32768) * 255)), top: Math.round(top / 32768 * 255) };
      fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(cached, JSON.stringify(data));
      return data;
    } finally { free(); }
  })();
  memo.set(key, job);
  job.catch(() => memo.delete(key));
  return job;
}
