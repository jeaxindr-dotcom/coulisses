// The sound measured (user request, 16/10/2026, from HyperFrames Studio's audio meters and loudness: « mets tout ») —
// EBU R128, as YouTube and the channels' finishings measure it (ffmpeg's ebur128):
//   - the reviewed video, every 0,1 s: the momentary loudness (400 ms, LUFS), the short-term one (3 s, LUFS), the true peak
//     of those 100 ms (dBTP, the loudest channel); then its integrated loudness, its loudness range (LU), its true peak.
//     Made in the background once per video (CACHE/loudness, by the file's size and date): ~10 s for 20 minutes;
//   - a range of it (a note's, the R range): its integrated loudness, range and true peak, measured exactly.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const jobs = new Map();   // cache file -> promise
// a value of ffmpeg's: « -inf », « nan » (a silence) and anything else not a number are the floor, −70
const num = (s) => { const v = parseFloat(s); return Number.isFinite(v) ? Math.max(-70, Math.round(v * 10) / 10) : -70; };
// ffmpeg's ebur128 on a file (a range of it with ss / t): its frame log (framelog=info: a line every 100 ms) and summary
function ebur128(file, { ss = null, t = null, frames = true } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-nostats', ...(ss !== null ? ['-ss', String(ss)] : []), ...(t !== null ? ['-t', String(t)] : []), '-i', file, '-vn', '-map', '0:a:0?',
      '-af', `ebur128=peak=true${frames ? ':framelog=info' : ''}`, '-f', 'null', '-'];
    const p = spawn('ffmpeg', args, { windowsHide: true });
    let buf = '', err = '';
    const M = [], S = [], P = [];
    p.stderr.on('data', (d) => {
      buf += d; const lines = buf.split(/\r?\n|\r/); buf = lines.pop();
      for (const l of lines) {
        const m = /\bt:\s*([\d.]+)\s+TARGET:\S+\s+LUFS\s+M:\s*(\S+)\s+S:\s*(\S+)\s+I:.*?FTPK:\s*([-\d.inf ]+?)\s+dBFS/.exec(l);
        if (m) { M.push(num(m[2])); S.push(num(m[3])); P.push(Math.max(...m[4].trim().split(/\s+/).map(num))); continue; }
        err += l + '\n'; if (err.length > 20000) err = err.slice(-10000);
      }
    });
    p.on('error', reject);
    p.on('close', (code) => {
      err += buf;
      const I = /Integrated loudness:\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/.exec(err), LRA = /Loudness range:\s*LRA:\s*([\d.]+)\s*LU/.exec(err), TP = /True peak:\s*Peak:\s*(-?[\d.]+|-inf)\s*dBFS/.exec(err);
      if (code !== 0 && !I) return reject(new Error(err.trim().split('\n').slice(-2).join(' | ') || `ffmpeg ${code}`));
      resolve({ step: 0.1, M, S, P, I: I ? num(I[1]) : null, LRA: LRA ? +LRA[1] : null, TP: TP ? num(TP[1]) : null, audio: M.length > 0 || !!I });
    });
  });
}
const cacheFile = (file, dir) => {
  const st = fs.statSync(file);
  return path.join(dir, `${crypto.createHash('sha1').update(path.resolve(file).toLowerCase()).digest('hex').slice(0, 12)}-${st.size}-${Math.round(st.mtimeMs)}.json`);
};
// { state: 'ready', data } | { state: 'building' } | { state: 'error', error } | { state: 'none' } (no video)
export function loudnessState(file, dir) {
  if (!file || !fs.existsSync(file)) return { state: 'none' };
  const f = cacheFile(file, dir);
  if (fs.existsSync(f)) {
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const k of ['M', 'S', 'P']) d[k] = (d[k] ?? []).map((v) => (Number.isFinite(v) ? v : -70));   // (a measure of before 16/10/2026: its silences null)
      return { state: 'ready', data: d };
    } catch { /* rewritten below */ }
  }
  if (!jobs.has(f)) {
    const job = ebur128(file).then((d) => {
      fs.mkdirSync(dir, { recursive: true });
      for (const old of fs.readdirSync(dir)) if (old.startsWith(path.basename(f).split('-')[0] + '-') && old !== path.basename(f)) fs.rmSync(path.join(dir, old), { force: true });   // the older measures of this video
      fs.writeFileSync(f, JSON.stringify(d));
      return d;
    });
    job.catch((e) => { jobs.set(f, { error: e.message }); });
    jobs.set(f, job);
  }
  const j = jobs.get(f);
  if (j?.error) return { state: 'error', error: j.error };
  return { state: 'building' };
}
// a range [a, b] (seconds) of the file, measured exactly: { I, LRA, TP }
export async function loudnessRange(file, a, b) {
  const d = await ebur128(file, { ss: Math.max(0, a), t: Math.max(0.4, b - a), frames: false });
  return { I: d.I, LRA: d.LRA, TP: d.TP, a, b };
}
