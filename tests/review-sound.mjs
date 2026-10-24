// The review sound (lib/review-sound.mjs, page/studio/01-preview.js « RS »; user reports 24/10/2026: « le son fait que de
// se couper », « c'est impossible de review la vidéo »): the film's sound mixed by the studio from the timeline's audio
// tracks, played by the page as the clock, the preview muted and following it. On the sample project of
// tests/coulisses-fixture.mjs (its « Voix » track: a 330 Hz sine), a Chrome with Chrome's own rule on sound (as a tab of
// the user's Chrome), silent (tests/cdp.mjs), real clicks; at ½ speed (the sample lasts 10 s):
//   1. the mix made, said by the status; « Lecture »: the sound goes, the preview muted, its picture moving with it;
//   2. the preview thrown 2 s back behind the page's back (as a preview that stalls): moved again to the sound;
//   3. « Pause »: both stop; « Lecture » again: together;
//   4. a new version of the code (the picture only): the same mix, the new preview muted at once;
//   5. its sound changed (the voice file): mixed again — the preview's own sound meanwhile — then the new mix;
//   6. « Rétablir le son » (the speaker): the review sound loaded again, playing.
// usage: node tests/review-sound.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { makeFixture, RUN, PROJET } from './coulisses-fixture.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'review-sound-test');
const PORT = 4189, URL = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };

fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
fs.writeFileSync(path.join(SCR, 'settings.json'), JSON.stringify({ lang: 'fr' }));
makeFixture();
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json'); process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json'); process.env.COULISSES_LANG = 'fr';
const { importProject } = await import('../lib/projects.mjs');
const IMP = importProject(RUN);
const st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', IMP.revue, '--no-open', '--port', String(PORT)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
for (let i = 0; i < 160 && !/http:\/\/127/.test(out); i++) await sleep(250);
const p = await launch({ port: 9371, autoplay: 'tab' });
const ev = (e) => p.eval(e).catch(() => null);
const until = async (expr, ms = 60000) => { const t0 = Date.now(); for (;;) { if (await ev(`return !!(${expr})`)) return true; if (Date.now() - t0 > ms) return false; await sleep(250); } };
const shown = () => ev(`const f = document.querySelector('#code'); return f && f.src && !document.querySelector('iframe.code-next') ? new URL(f.src).search : null`);
const click = async (sel) => { const r = await ev(`const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]`); await p.mouse('mouseMoved', r[0], r[1]); await p.mouse('mousePressed', r[0], r[1]); await p.mouse('mouseReleased', r[0], r[1]); };
const inFrame = async (js) => { const s = await shown(); return s ? p.frameEval(s, js).catch(() => null) : null; };
const rs = () => ev('return window.__rs()');
const status = async () => (await (await fetch(`${URL}api/status`)).json()).reviewSound;
// the state now, over 1.5 s: the review sound's time moving, the preview muted, its frame moving, both together
async function now() {
  const a = await rs(), f0 = await inFrame('return window.StudioPlayer.frame()');
  await sleep(1500);
  const b = await rs(), fr = await inFrame('return { f: window.StudioPlayer.frame(), muted: window.StudioPlayer.isMuted(), playing: window.StudioPlayer.isPlaying() }');
  return { on: b?.on, sig: b?.sig, sound: +((b?.t ?? 0) - (a?.t ?? 0)).toFixed(2), paused: b?.paused, muted: fr?.muted, playing: fr?.playing, moved: (fr?.f ?? 0) - (f0 ?? 0), gap: fr ? +(fr.f / 30 - b.t).toFixed(2) : null };
}
const together = (s) => s.on && s.sound > 0.4 && !s.paused && s.muted && s.playing && s.moved > 5 && Math.abs(s.gap) < 0.4;
const pauseAt = async (f) => { if (await ev('return window.__preview.isPlaying()')) { await click('#bPlay'); await sleep(500); } await ev(`window.__preview.seek(${f}); return 1`); await sleep(700); };
try {
  await p.goto(URL);
  check(await until(`window.__studio && __studio.state().mode === 'code' && window.__preview?.durationInFrames > 1`, 120000), 'the studio on the live code, in a tab of a normal Chrome');
  await ev(`document.querySelector('.spd[data-s="0.5"]').click(); return 1`);
  // ---------- 1. the mix, « Lecture » ----------
  let s0 = null; for (let i = 0; i < 60 && s0?.state !== 'ready'; i++) { await sleep(500); s0 = await status(); }
  await until('window.__rs().sig', 10000);
  check(s0?.state === 'ready' && s0.clips === 1 && (await rs())?.sig === s0.sig, `the review sound mixed from the timeline (${JSON.stringify(s0)}), taken by the page`);
  await pauseAt(10); await click('#bPlay'); await sleep(800);
  const s1 = await now();
  check(together(s1), `« Lecture »: the review sound goes, the preview muted and moving with it (${JSON.stringify(s1)})`);
  // ---------- 2. the preview thrown back ----------
  await inFrame('window.StudioPlayer.seek(window.StudioPlayer.frame() - 60); return 1');
  await sleep(1800);
  const s2 = await now();
  check(together(s2), `the preview 2 s behind (as one that stalls): moved again to the sound (${JSON.stringify(s2)})`);
  // ---------- 3. pause, play ----------
  await click('#bPlay'); await sleep(800);
  const s3 = await now();
  check(s3.paused && !s3.playing && s3.sound === 0, `« Pause »: both stopped (${JSON.stringify(s3)})`);
  await click('#bPlay'); await sleep(800);
  const s3b = await now();
  check(together(s3b), `« Lecture » again: together (${JSON.stringify(s3b)})`);
  // ---------- 4. a new version of the code (the picture) ----------
  await pauseAt(10);
  const v0 = await shown(), sig0 = (await rs()).sig, runTs = path.join(PROJET, 'src', 'runs', 'essai.ts');
  fs.writeFileSync(runTs, fs.readFileSync(runTs, 'utf8').replace("titre: 'Le sujet'", "titre: 'Le sujet (corrigé)'"));
  let v1 = v0; for (let i = 0; i < 120 && (!v1 || v1 === v0); i++) { await sleep(500); v1 = await shown(); }
  await sleep(1500);
  await click('#bPlay'); await sleep(800);
  const s4 = await now();
  check(v1 !== v0 && s4.sig === sig0 && together(s4), `a new version of the picture: the same mix, the new preview muted (${JSON.stringify(s4)})`);
  // ---------- 5. its sound changed ----------
  await pauseAt(10);
  const wav = path.join(PROJET, 'public', 'essai', 'voix.wav'), later = new Date(Date.now() + 5000);
  fs.utimesSync(wav, later, later);   // (the same file, newer: a new signature)
  fs.writeFileSync(runTs, fs.readFileSync(runTs, 'utf8').replace("titre: 'Trois chiffres'", "titre: 'Trois chiffres (v2)'"));   // (the timeline read again)
  let s5 = null; for (let i = 0; i < 120 && !(s5?.state === 'ready' && s5.sig !== sig0); i++) { await sleep(500); s5 = await status(); }
  await until(`window.__rs().sig === ${JSON.stringify(s5?.sig)}`, 15000);
  await sleep(1500);
  await click('#bPlay'); await sleep(800);
  const s5b = await now();
  check(s5?.sig !== sig0 && s5b.sig === s5?.sig && together(s5b), `its sound changed: mixed again, the new mix taken (${JSON.stringify(s5b)})`);
  // ---------- 6. « Rétablir le son » ----------
  await click('#bSound'); await sleep(1200);
  const msg = await ev(`return document.querySelector('#save').textContent`);
  const s6 = await now();
  check(/rechargé/.test(msg) && together(s6), `« Rétablir le son »: the review sound loaded again, playing (« ${msg} », ${JSON.stringify(s6)})`);
  await click('#bPlay');
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally {
  await p.close(); st.kill();
  if (ko) console.log(out.split('\n').filter((l) => /son de relecture|erreur|error/i.test(l)).slice(-8).join('\n'));
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
