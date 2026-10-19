// The dictation (user request, 19/10/2026: OpenWhispr « intégré nativement », F2), on a test project only, with Chrome's
// fake microphone (a tone: nothing of the user's is heard or recorded) and a fake Whisper server (COULISSES_WHISPER_URL:
// OpenWhispr's own is never used, Coulisses starts none: COULISSES_WHISPER_BIN=none):
//   1. F2 held then released: a new note at the frame where F2 was pressed, its words the transcription; the video paused;
//      Whisper got a WAV (16 kHz, made from the page's recording), in French, with the episode's names as a hint;
//   2. F2 tapped: listening until F2 again; in a note's text: the words added where the cursor is, saved;
//   3. Échap: nothing kept; the microphone of the rail: clicked, clicked again;
//   4. no Whisper: said (OpenWhispr to open); what Whisper writes over a silence dropped (lib/dictate.mjs clean);
//   5. F2 in Aide › Raccourcis clavier.
// usage: node tests/dictate.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freePort } from './where.mjs';
import { launch } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'dictate-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(path.join(SCR, 'Clip'), { recursive: true });
const WPORT = await freePort(4195 + 30);
Object.assign(process.env, { COULISSES_LANG: 'fr', STUDIO_PROJECTS: path.join(SCR, 'projets.json'), COULISSES_SETTINGS: path.join(SCR, 'settings.json'), COULISSES_MEDIAS: path.join(SCR, 'medias'),
  COULISSES_WHISPER_URL: `http://127.0.0.1:${WPORT}`, COULISSES_WHISPER_BIN: 'none' });
const { importProject } = await import('../lib/projects.mjs');
const { clean } = await import('../lib/dictate.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const kill = (c) => { if (c) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };

// the fake Whisper: its page (as whisper.cpp's), and /inference: what it got, the words it gives
const calls = [];
const whisper = http.createServer((req, res) => {
  if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html><head><title>Whisper.cpp Server</title></head></html>'); }
  const parts = []; req.on('data', (d) => parts.push(d)); req.on('end', () => {
    const b = Buffer.concat(parts), s = b.toString('latin1'), field = (n) => new RegExp(`name="${n}"\\r\\n\\r\\n([^\\r]*)`).exec(s)?.[1] ?? null;
    const wav = s.indexOf('RIFF'), rate = wav >= 0 ? b.readUInt32LE(wav + 24) : 0;
    calls.push({ wav: wav >= 0 && s.slice(wav + 8, wav + 12) === 'WAVE', rate, language: field('language'), prompt: Buffer.from(field('prompt') ?? '', 'latin1').toString('utf8') });
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ text: ' Plus de lumière sur la lanterne.\n' }));
  });
});
await new Promise((r) => whisper.listen(WPORT, '127.0.0.1', r));

let st = null, p = null;
try {
  const VID = path.join(SCR, 'Clip', 'Clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x283040:s=640x360:r=30:d=10', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', VID]);
  const imp = importProject(VID), NOTES = path.join(imp.revue, 'notes.json');
  const port = await freePort(4189);
  st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', imp.revue, '--no-open', '--port', String(port)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 200 && !/Ouvre : http/.test(out); i++) await sleep(150);
  p = await launch({ port: 9385, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  await p.goto(`http://127.0.0.1:${port}/#f=90`);
  await p.until(`window.__studio && window.__dictate && document.querySelector('#v').readyState >= 1`, 60000); await sleep(800);
  const key = (type) => p.send('Input.dispatchKeyEvent', { type, key: 'F2', code: 'F2', windowsVirtualKeyCode: 113, nativeVirtualKeyCode: 113 });
  const esc = () => p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }).then(() => p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }));
  const drafts = () => p.eval(`return [...document.querySelectorAll('#draftList .card')].map((c) => ({ id: c.dataset.id, text: c.querySelector('textarea.main').value }))`);
  const saved = () => { try { return JSON.parse(fs.readFileSync(NOTES, 'utf8')).notes; } catch { return []; } };
  // (the notes are saved 0.4 s after the last change: the file asked until it says it)
  const savedSoon = async (pred) => { for (let i = 0; i < 20; i++) { if (pred(saved())) return true; await sleep(250); } return false; };
  const msg = () => p.eval(`return document.querySelector('#save').textContent`);
  const idle = () => p.until(`!__dictate.state().on && !__dictate.state().busy`, 15000);

  // ---------- 1. F2 held ----------
  console.log('F2 maintenu');
  await p.eval(`document.querySelector('#bPlay').click(); return 1`); await sleep(700);
  const f0 = await p.eval(`return __studio.state().frame`);
  await key('keyDown'); await sleep(400);
  const listening = await p.eval(`return { st: __dictate.state(), pill: document.querySelector('#dictee').className, t: document.querySelector('#dictee .t').textContent, paused: document.querySelector('#v').paused }`);
  await sleep(1100); await key('keyUp'); await idle(); await sleep(400);
  let d = await drafts();
  check(listening.st.on && /listen/.test(listening.pill) && /écoute/.test(listening.t) && listening.paused, `listening while held, the video paused (« ${listening.t} »)`);
  await savedSoon((ns) => ns.some((n) => n.text === 'Plus de lumière sur la lanterne.'));
  const n1 = saved().find((n) => n.text === 'Plus de lumière sur la lanterne.');
  check(d.length === 1 && d[0].text === 'Plus de lumière sur la lanterne.' && n1 && Math.abs(n1.frame - f0) <= 1 && n1.draft, `released: a note at the frame of F2 (${n1?.frame} / ${f0}), its words the transcription, saved`);
  check(calls.length === 1 && calls[0].wav && calls[0].rate === 16000 && calls[0].language === 'fr' && /Clip/.test(calls[0].prompt), `Whisper got a WAV at 16 kHz, in French, with the title as a hint (${JSON.stringify(calls[0])})`);
  let m1 = ''; for (let i = 0; i < 10 && !/6 mots/.test(m1); i++) { await sleep(300); m1 = await msg(); }
  check(/6 mots/.test(m1), `said, once saved (« ${m1} »)`);

  // ---------- 2. F2 tapped; into a field ----------
  console.log('F2 tapé, dans un champ');
  await p.eval(`const t = document.querySelector('#draftList .card textarea.main'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return 1`);
  await key('keyDown'); await sleep(80); await key('keyUp'); await sleep(1300);
  const still = await p.eval(`return __dictate.state()`);
  await key('keyDown'); await sleep(60); await key('keyUp'); await idle(); await sleep(700);
  d = await drafts(); await savedSoon((ns) => ns.some((n) => n.text === d[0]?.text));
  check(still.on && still.target === 'main', `tapped: still listening after it, into the note's text (${JSON.stringify(still)})`);
  check(d.length === 1 && d[0].text === 'Plus de lumière sur la lanterne. Plus de lumière sur la lanterne.' && saved().some((n) => n.text === d[0].text), `F2 again: the words added at the cursor, saved (« ${d[0]?.text} »)`);

  // ---------- 3. Échap; the microphone ----------
  console.log('Échap, le micro de la barre');
  await p.eval(`document.activeElement?.blur(); return 1`);
  const nCalls = calls.length;
  await key('keyDown'); await sleep(600); await esc(); await key('keyUp'); await idle(); await sleep(400);
  check(calls.length === nCalls && (await drafts()).length === 1 && /annulée/.test(await msg()), `Échap: nothing sent, nothing kept (« ${await msg()} »)`);
  const mic = await p.eval(`const r = document.querySelector('#bMic').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`);
  const click = async () => { await p.mouse('mousePressed', mic[0], mic[1]); await sleep(60); await p.mouse('mouseReleased', mic[0], mic[1]); };
  await click(); await sleep(1300);
  const on2 = await p.eval(`return __dictate.state().on && document.querySelector('#bMic').classList.contains('on')`);
  await click(); await idle(); await sleep(500);
  check(on2 && (await drafts()).length === 2 && calls.length === nCalls + 1, 'the microphone of the rail: a click listens, a click again ends it, a new note');

  // ---------- 4. no Whisper; silences ----------
  console.log('sans Whisper');
  await new Promise((r) => whisper.close(r)); whisper.closeAllConnections?.();
  await key('keyDown'); await sleep(1000); await key('keyUp'); await idle(); await sleep(400);
  const m4 = await msg();
  check(/OpenWhispr/.test(m4) && (await drafts()).length === 2, `no Whisper server: said, nothing made (« ${m4} »)`);
  check(clean(' *Bip*\n') === '' && clean("Sous-titres réalisés par la communauté d'Amara.org") === '' && clean(' [Musique] ') === '' && clean(' Plus de lumière (ici).\n') === 'Plus de lumière (ici).', 'what Whisper writes over a silence: dropped; real words kept');

  // ---------- 5. Raccourcis clavier ----------
  const sc = await p.eval(`return { keys: window.Shortcuts.keys('dictate'), tip: document.querySelector('#bMicTip').textContent }`);
  check(sc.keys.join() === 'F2' && /F2/.test(sc.tip), `F2 in the shortcuts (Aide › Raccourcis clavier), on the microphone's tip (« ${sc.tip} »)`);
  await p.shot(path.join(SCR, 'dictee.png'));
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally { await p?.close().catch(() => {}); kill(st); whisper.close(); }
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
