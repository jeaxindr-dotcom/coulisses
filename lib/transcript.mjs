// The words heard in the video (user request, 16/10/2026, from HyperFrames Studio's transcription: « mets tout, check
// comment bien le marier à l'interface »): the reviewed MP4 transcribed word by word, with « hyperframes transcribe » of
// the user's own HyperFrames CLI (lib/hyperframes.mjs: Coulisses ships no model). Its engines:
//   - Parakeet (NVIDIA parakeet-tdt-0.6b-v3, on the CPU, ~5 s for a minute of video): 25 European languages, the language
//     found by itself; installed once with « hyperframes models install parakeet » (≈ 640 Mo, the user's consent: a
//     button of the studio);
//   - Whisper large-v3 for the other languages (Japanese, Chinese, Korean…): the CLI installs its runtime and downloads
//     the model (≈ 3 Go) the first time.
// Made in the background once per video (CACHE/transcripts, by the file's size and date), on demand; then again by
// itself for each new render of a project transcribed once (revue/paroles.json keeps its language).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { hfFor, hfEnv } from './hyperframes.mjs';

export const PARAKEET_LANGS = 'en es fr de bg hr cs da nl et fi el hu it lv lt mt pl pt ro sk sl sv ru uk'.split(' ');
const jobs = new Map();   // cache file -> { pct, error, child }
const cacheFile = (file, dir) => {
  const st = fs.statSync(file);
  return path.join(dir, `${crypto.createHash('sha1').update(path.resolve(file).toLowerCase()).digest('hex').slice(0, 12)}-${st.size}-${Math.round(st.mtimeMs)}.json`);
};

// the words in phrases: a pause of 0,7 s, a sentence's end or 7 s of speech close one
export function phrasesOf(words) {
  const out = []; let cur = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur && (w.a - words[i - 1].b > 0.7 || w.a - cur.a > 7 || /[.!?…。！？]$/.test(words[i - 1].w))) { out.push(cur); cur = null; }
    if (!cur) cur = { a: w.a, b: w.b, i0: i, i1: i };
    cur.b = w.b; cur.i1 = i;
  }
  if (cur) out.push(cur);
  return out.map((p) => ({ ...p, text: words.slice(p.i0, p.i1 + 1).map((w) => w.w).join(/^(ja|zh|ko|th)$/.test(words.lang ?? '') ? '' : ' ') }));
}

// the engines here: the CLI, Parakeet installed or not (asked again every 20 s at most), an install going on
let eng = { at: 0, v: null }, installing = null;
export async function engines() {
  const hf = hfFor(null);
  if (!hf) return { cli: null, parakeet: false, installing: !!installing };
  if (Date.now() - eng.at > 20000 || eng.v?.cli !== hf.version) {
    const parakeet = await new Promise((resolve) => execFile(process.execPath, [hf.cli, 'models', 'list', '--json'], { env: hfEnv(), encoding: 'utf8', windowsHide: true, timeout: 30000 }, (e, out) => {
      try { resolve(!!JSON.parse(String(out).trim().split('\n').pop()).models?.find((m) => m.engine === 'parakeet')?.installed); } catch { resolve(false); }
    }));
    eng = { at: Date.now(), v: { cli: hf.version, parakeet } };
  }
  return { ...eng.v, installing: !!installing, installError: installing?.error ?? null };
}
// « hyperframes models install parakeet », once, in the background
export function installParakeet() {
  const hf = hfFor(null); if (!hf) return false;
  if (installing && !installing.error) return true;
  installing = { error: null };
  const p = spawn(process.execPath, [hf.cli, 'models', 'install', 'parakeet'], { env: hfEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err = (err + d).slice(-4000); }); p.stdout.on('data', () => {});
  p.on('error', (e) => { installing = { error: e.message }; });
  p.on('close', (code) => { eng.at = 0; installing = code === 0 ? null : { error: err.trim().split('\n').slice(-2).join(' ') || `code ${code}` }; });
  return true;
}

// the project's choice (revue/paroles.json): { lang: 'auto' | 'ja' | … } once it was transcribed, else null
export const wordsChoice = (revue) => { try { return JSON.parse(fs.readFileSync(path.join(revue, 'paroles.json'), 'utf8')); } catch { return null; } };

// { state: 'ready', data } | { state: 'building', pct } | { state: 'error', error } | { state: 'idle' } (not asked)
// | { state: 'none' } (no video) | { state: 'noCli' }. start: { lang } transcribes now (and keeps the choice in revue)
export function transcriptState(file, dir, revue, start = null) {
  if (!file || !fs.existsSync(file)) return { state: 'none' };
  const f = cacheFile(file, dir);
  if (!start && fs.existsSync(f)) { try { return { state: 'ready', data: JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { /* made again below */ } }
  const j = jobs.get(f);
  if (j && !j.error && !j.done) return { state: 'building', pct: j.pct };
  const choice = start ?? wordsChoice(revue);
  if (!start && j?.error) return { state: 'error', error: j.error, lang: choice?.lang ?? 'auto' };
  if (!choice) return { state: 'idle' };
  const hf = hfFor(null); if (!hf) return { state: 'noCli' };
  if (start) { try { fs.mkdirSync(revue, { recursive: true }); fs.writeFileSync(path.join(revue, 'paroles.json'), JSON.stringify({ lang: start.lang ?? 'auto', at: new Date().toISOString() })); } catch { /* read-only */ } }
  run(hf, file, f, dir, choice.lang ?? 'auto');
  return { state: 'building', pct: 0 };
}

function run(hf, file, f, dir, lang) {
  const job = { pct: 0, error: null, done: false };
  jobs.set(f, job);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coulisses-paroles-'));
  const whisper = lang !== 'auto' && !PARAKEET_LANGS.includes(lang);
  const args = [hf.cli, 'transcribe', file, '--json', '-d', tmp, ...(whisper ? ['--engine', 'whisper', '-m', 'large-v3', '-l', lang] : lang === 'auto' ? ['--engine', 'auto'] : ['--engine', 'auto', '-l', lang])];
  const p = spawn(process.execPath, args, { cwd: tmp, env: hfEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', buf = '', err = '', dur = 0;
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => {
    buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const l of lines) {
      let e = null; try { e = JSON.parse(l); } catch { err = (err + l + '\n').slice(-4000); continue; }
      if (e.durationSeconds) dur = e.durationSeconds;
      if (e.type === 'words' && e.through && dur) job.pct = Math.min(99, Math.round((e.through / dur) * 100));
    }
  });
  const end = (error) => { job.done = !error; job.error = error; try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } };
  p.on('error', (e) => end(e.message));
  p.on('close', (code) => {
    try {
      const res = JSON.parse(out.trim().split('\n').pop() || '{}');
      if (code !== 0 || !res.ok) throw new Error(res.error ?? res.message ?? (err.trim().split('\n').slice(-2).join(' ') || `code ${code}`));
      const raw = JSON.parse(fs.readFileSync(res.transcriptPath ?? path.join(tmp, 'transcript.json'), 'utf8'));
      const words = raw.filter((w) => w && typeof w.text === 'string' && w.text.trim() && Number.isFinite(+w.start)).map((w) => ({ w: w.text.trim(), a: +(+w.start).toFixed(3), b: +(+(w.end ?? w.start)).toFixed(3) }));
      const used = res.detectedLanguage ?? (lang === 'auto' ? null : lang);
      words.lang = used;
      const data = { engine: res.engine ?? null, model: res.model ?? null, lang: used, asked: lang, at: new Date().toISOString(), words, phrases: phrasesOf(words) };
      fs.mkdirSync(dir, { recursive: true });
      for (const old of fs.readdirSync(dir)) if (old.startsWith(path.basename(f).split('-')[0] + '-') && old !== path.basename(f)) fs.rmSync(path.join(dir, old), { force: true });   // the older ones of this video
      fs.writeFileSync(f, JSON.stringify(data));
      end(null);
    } catch (e) { end(e.message); }
  });
  job.child = p;
}
