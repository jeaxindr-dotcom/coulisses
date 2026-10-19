// La dictée (user request, 19/10/2026: OpenWhispr « intégré nativement » à Coulisses, « un bouton à l'écran ou un raccourci
// clavier pour lancer la prise de note orale » — F2): what the user says becomes the words of a note, transcribed on this
// PC by the Whisper server that OpenWhispr runs (whisper.cpp, on the graphics card, OpenWhispr's own model: nothing to
// download, nothing sent anywhere). The server is found:
//   1. COULISSES_WHISPER_URL (the tests: a fake one);
//   2. the one OpenWhispr started: 127.0.0.1:8178 (its port), or the --host / --port of a whisper-server running;
//   3. none (OpenWhispr closed): Coulisses starts that same program with that same model itself, on a port of its own,
//      and stops it after 15 minutes without dictation or with this studio (COULISSES_WHISPER_BIN=none: never, the tests;
//      COULISSES_WHISPER_BIN=<exe>: that one).
// The page records with MediaRecorder (webm/opus); OpenWhispr's server reads WAV only (started without --convert): ffmpeg
// makes it 16 kHz mono PCM first. What Whisper writes over a silence (« *Bip* », « Sous-titres réalisés par… ») is dropped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';

const OW_BIN = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'open-whispr', 'bin');
const OW_MODELS = path.join(os.homedir(), '.cache', 'openwhispr', 'whisper-models');
const IDLE_MS = 15 * 60e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a Whisper server there? (whisper.cpp's own page: « Whisper.cpp Server »)
async function alive(url) {
  try { const r = await fetch(url.replace(/\/$/, '') + '/', { signal: AbortSignal.timeout(1500) }); return r.ok && /whisper/i.test(await r.text()); } catch { return false; }
}
// the whisper-servers running on this PC, as their command lines say (OpenWhispr chooses its port)
const running = () => new Promise((resolve) => {
  execFile('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name like 'whisper-server%'\" | ForEach-Object { $_.CommandLine }"], { encoding: 'utf8', windowsHide: true, timeout: 8000 }, (err, out) => {
    const urls = [];
    for (const l of String(out ?? '').split(/\r?\n/)) {
      const port = /--port\s+(\d+)/.exec(l)?.[1]; if (!port) continue;
      const host = /--host\s+(\S+)/.exec(l)?.[1] ?? '127.0.0.1';
      urls.push(`http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
    }
    resolve(urls);
  });
});
const freePort = (p) => new Promise((resolve) => { const s = net.createServer(); s.once('error', () => resolve(freePort(p + 1))); s.listen(p, '127.0.0.1', () => s.close(() => resolve(p))); });
// OpenWhispr's program and model (the graphics card's build first; the largest model)
function ownFiles() {
  const want = process.env.COULISSES_WHISPER_BIN;
  if (want === 'none') return null;
  let exe = want && fs.existsSync(want) ? want : null;
  if (!exe) {
    const found = [];
    const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory() && depth < 3) walk(p, depth + 1); else if (/^whisper-server.*\.exe$/i.test(e.name)) found.push(p); } };
    walk(OW_BIN, 0);
    exe = found.sort((a, b) => (/cuda/i.test(b) ? 1 : 0) - (/cuda/i.test(a) ? 1 : 0))[0] ?? null;
  }
  if (!exe) return null;
  const rank = (f) => ['large-v3-turbo', 'large-v3', 'large', 'medium', 'small', 'base', 'tiny'].findIndex((k) => f.includes(k));
  let models = []; try { models = fs.readdirSync(OW_MODELS).filter((f) => /^ggml-.*\.bin$/i.test(f)); } catch { /* none */ }
  const model = models.sort((a, b) => (rank(a) < 0 ? 99 : rank(a)) - (rank(b) < 0 ? 99 : rank(b)))[0];
  return model ? { exe, model: path.join(OW_MODELS, model) } : null;
}

export function dictation({ log = () => {} } = {}) {
  let url = null, own = null, idleT = null, starting = null;
  const stopOwn = () => { if (own) { try { own.kill(); } catch { /* gone */ } own = null; log('dictée : moteur Whisper de Coulisses arrêté'); } };
  const touch = () => { clearTimeout(idleT); if (own) { idleT = setTimeout(stopOwn, IDLE_MS); idleT.unref?.(); } };
  process.on('exit', stopOwn);
  // the server to use now, started if none (the first dictation without OpenWhispr: a few seconds, the model loading)
  async function engine() {
    if (process.env.COULISSES_WHISPER_URL) return (await alive(process.env.COULISSES_WHISPER_URL)) ? { url: process.env.COULISSES_WHISPER_URL, by: 'test' } : null;
    if (url && await alive(url)) return { url, by: own ? 'coulisses' : 'openwhispr' };
    url = null;
    for (const u of ['http://127.0.0.1:8178', ...(await running())]) if (await alive(u)) { url = u; return { url, by: 'openwhispr' }; }
    if (starting) return starting;
    const files = ownFiles(); if (!files) return null;
    starting = (async () => {
      const port = await freePort(8279);
      const c = spawn(files.exe, ['--model', files.model, '--host', '127.0.0.1', '--port', String(port), '--threads', String(Math.max(2, Math.min(12, os.cpus().length - 2))), '--language', 'auto', '--no-timestamps'],
        { cwd: path.dirname(files.exe), stdio: 'ignore', windowsHide: true });
      c.on('exit', () => { if (own === c) { own = null; url = null; } });
      own = c; log(`dictée : moteur Whisper démarré (${path.basename(files.model)}, port ${port})`);
      const u = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 120 && own === c; i++) { if (await alive(u)) { url = u; touch(); return { url, by: 'coulisses' }; } await sleep(500); }
      stopOwn(); return null;
    })().finally(() => { starting = null; });
    return starting;
  }
  // webm / ogg / wav from the page → WAV 16 kHz mono (what whisper-server reads)
  const toWav = (buf) => new Promise((resolve, reject) => {
    if (buf.subarray(0, 4).toString('latin1') === 'RIFF') return resolve(buf);
    const c = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1'], { windowsHide: true });
    const out = []; let err = '';
    c.stdout.on('data', (d) => out.push(d)); c.stderr.on('data', (d) => { err += d; });
    c.on('error', reject); c.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.trim().split('\n').pop() || `ffmpeg ${code}`))));
    c.stdin.on('error', () => {}); c.stdin.end(buf);
  });
  const multipart = (fields, file) => {
    const B = `----coulisses${Date.now().toString(36)}`, parts = [];
    const head = (name, extra = '') => Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${name}"${extra}\r\n\r\n`);
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="file"; filename="dictee.wav"\r\nContent-Type: audio/wav\r\n\r\n`), file, Buffer.from('\r\n'));
    for (const [k, v] of Object.entries(fields)) parts.push(head(k), Buffer.from(String(v)), Buffer.from('\r\n'));
    parts.push(Buffer.from(`--${B}--\r\n`));
    return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
  };
  return {
    // ready before the words are said (the page asks it as the recording starts): OpenWhispr found, or ours starting
    warm: async () => !!(await engine()),
    async transcribe(audio, { language = 'fr', prompt = '' } = {}) {
      const t0 = Date.now(), e = await engine();
      if (!e) return { ok: false, why: 'engine' };
      touch();
      const wav = await toWav(audio);
      const { body, type } = multipart({ language, response_format: 'json', temperature: '0', ...(prompt ? { prompt } : {}) }, wav);
      const r = await fetch(e.url.replace(/\/$/, '') + '/inference', { method: 'POST', headers: { 'Content-Type': type }, body, signal: AbortSignal.timeout(120000) });
      if (!r.ok) return { ok: false, why: 'answer', detail: `${r.status} ${(await r.text()).slice(0, 200)}` };
      const j = await r.json().catch(() => ({}));
      touch();
      return { ok: true, text: clean(j.text), ms: Date.now() - t0, engine: e.by };
    },
    stop: stopOwn,
  };
}
// what Whisper writes over a silence or a noise: sounds in brackets or stars, and the sign-offs of the subtitles it learned on
const NOISE = /^(\s*[([*♪][^)\]*♪]*[)\]*♪]\s*)+$/;
const GHOSTS = [/^sous-titr(es|age) (réalisés? )?(par|de) /i, /amara\.org/i, /^merci d'avoir regardé/i, /^thanks? for watching/i, /^\.+$/];
export function clean(text) {
  let s = String(text ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/[([*][^)\]*]{0,40}[)\]*]/g, (m) => (/^[([*]\s*(bip|musique|music|rires?|applaudissements|silence|bruit|inaudible|blank_audio)\s*[)\]*]$/i.test(m) ? '' : m)).replace(/\s+/g, ' ').trim();
  if (NOISE.test(s) || GHOSTS.some((g) => g.test(s))) return '';
  return s;
}
