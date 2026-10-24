// The preview's sound never needs F5 (user report 22/10/2026: « quand je rajoute une note et que je relance la vidéo, il
// n'y a plus de son et je suis obligé d'appuyer sur F5 »), on the sample Remotion project of tests/coulisses-fixture.mjs
// (an <Audio> of a 330 Hz sine, played at ½ speed; nothing real is touched; the test's Chrome is silent: tests/cdp.mjs). Remotion's Player
// plays all its sound through ONE AudioContext; each way it can die, played here, and the sound back without F5
// (player/sound.ts watches, page/studio/01-preview.js makes the preview again):
//   0. a normal playback: nothing done (no preview made again);
//   1. its context suspended behind the Player's back: started again, the same preview;
//   2. its context refusing for good (each resume() rejected): the Player mutes itself again and again — the preview made
//      again, at the same image, playing, with its sound;
//   3. its context running with its clock stopped: the same;
//   4. its « error » (the sound device failing): a 3rd time in 2 min is only said (a device really gone), « Rétablir le
//      son » (the speaker under the image) makes the preview again anyway.
// usage: node tests/sound-watch.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { makeFixture, RUN } from './coulisses-fixture.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'sound-watch');
const PORT = 4189, URL = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };

fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
fs.writeFileSync(path.join(SCR, 'settings.json'), JSON.stringify({ lang: 'fr' }));
makeFixture();
// (its own registry and settings: never the user's)
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json'); process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json'); process.env.COULISSES_LANG = 'fr';
process.env.COULISSES_REVIEW_SOUND = '0';   // (the preview's OWN sound tested here: the review sound off — tests/review-sound.mjs)
const { importProject } = await import('../lib/projects.mjs');
const IMP = importProject(RUN);
const st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', IMP.revue, '--no-open', '--port', String(PORT)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
for (let i = 0; i < 160 && !/http:\/\/127/.test(out); i++) await sleep(250);
const p = await launch({ port: 9363 });
const ev = (e) => p.eval(e).catch(() => null);
const until = async (expr, ms = 60000) => { const t0 = Date.now(); for (;;) { if (await ev(`return !!(${expr})`)) return true; if (Date.now() - t0 > ms) return false; await sleep(250); } };
// the preview on screen: its frame told by its own address (a preview made again has the same version, a new « r »)
const shown = () => ev(`const f = document.querySelector('#code'); return f && !document.querySelector('iframe.code-next') ? new URL(f.src).search : null`);
const inFrame = async (js) => { const s = await shown(); return s ? p.frameEval(s, js).catch(() => null) : null; };
// its sound now: the Player playing and unmuted, its AudioContext running with its clock going, an <audio> of it playing
// (its time moving: Remotion sets it again to the frame now and then, just after a start)
async function sound() {
  return inFrame(`const P = window.StudioPlayer, C = window.__coulissesAudio ?? [], c = C[C.length - 1], au = [...document.querySelectorAll('audio')];
    const t0 = au.map((a) => a.currentTime), c0 = c?.currentTime ?? 0, w0 = performance.now();
    const going = () => au.filter((a, i) => a.src && !a.paused && !a.muted && a.volume > 0 && Math.abs(a.currentTime - t0[i]) > 0.05).length;
    // (an <audio> played through Web Audio says its time by steps of about 1.3 s: until its next one, 2.5 s at most)
    while (performance.now() - w0 < 2500 && (performance.now() - w0 < 1000 || !going())) await new Promise((r) => setTimeout(r, 100));
    return { playing: P.isPlaying(), muted: P.isMuted(), ctx: c?.state ?? null, clock: +(((c?.currentTime ?? 0) - c0) / ((performance.now() - w0) / 1000)).toFixed(2), going: going() }`);
}
const good = (s) => !!s && s.playing && !s.muted && s.ctx === 'running' && s.clock > 0.5 && s.going > 0;
const play = () => ev(`document.querySelector('#bPlay').click(); return 1`);
const playing = () => ev('return window.__preview.isPlaying()');
const playFrom = async (f) => { if (await playing()) { await play(); await sleep(400); } await ev(`window.__preview.seek(${f}); return 1`); await sleep(700); await play(); await sleep(2500); };
const save = () => ev(`return document.querySelector('#save').textContent`);
const deaths = () => ev('return window.__soundDead ?? 0');
// a new preview, then its sound: [made again, its sound]
async function remade(before, ms = 25000) {
  const t0 = Date.now(); let s = null;
  while (Date.now() - t0 < ms) { s = await shown(); if (s && s !== before) break; await sleep(300); }
  if (!s || s === before) return [false, null];
  await sleep(1500);
  const r = await sound();
  if (!good(r) && process.env.SOUND_DEBUG) {
    console.log('   balise sur 2 s :', JSON.stringify(await inFrame(`const a = [...document.querySelectorAll('audio')].find((x) => x.src && !x.src.startsWith('data:')), P = window.StudioPlayer, out = [];
      for (let i = 0; i < 20; i++) { out.push((a.paused ? 'P' : '>') + a.currentTime.toFixed(2) + '/' + P.getCurrentFrame?.()); await new Promise((r) => setTimeout(r, 100)); }
      return out.join(' ')`)));
    console.log('   journaux :', JSON.stringify(p.logs.filter((x) => /audio|mute|resume|play\(|NotAllowed|interrupt/i.test(x)).slice(-8)));
  }
  return [true, r];
}
try {
  await p.goto(URL);
  check(await until(`window.__studio && __studio.state().mode === 'code' && window.__preview?.durationInFrames > 1`, 120000), 'the studio on the live code of the sample project');
  // (at ½ speed: the sample video lasts 10 s, 20 s so — a preview made again keeps the speed)
  await ev(`document.querySelector('.spd[data-s="0.5"]').click(); return 1`);
  await sleep(2500);

  // ---------- 0. a normal playback ----------
  await playFrom(20);
  const s0 = await sound(); await sleep(3000);
  const s0b = await sound();
  check(good(s0) && good(s0b) && (await deaths()) === 0, `a normal playback: its sound going, nothing done (${JSON.stringify(s0b)}, previews made again: ${await deaths()})`);
  await play(); await sleep(3000);
  check((await deaths()) === 0, 'paused: nothing done either');

  // ---------- 1. suspended behind the Player's back ----------
  console.log('le contexte audio suspendu dans le dos du lecteur');
  await playFrom(20);
  const f1 = await shown();
  await inFrame(`const C = window.__coulissesAudio; await C[C.length - 1].suspend(); return 1`);
  let back1 = null;
  for (let i = 0; i < 16 && !back1; i++) { await sleep(500); const s = await sound(); if (good(s)) back1 = { ...s, after: (i + 1) * 1.5 }; }
  check(!!back1 && (await shown()) === f1 && (await deaths()) === 0, `started again by itself, the same preview (${back1 ? `${back1.after} s` : 'never'})`);

  // ---------- 2. refusing for good ----------
  console.log('le contexte audio refuse pour de bon');
  await playFrom(20);
  const f2 = await shown(), d2 = await deaths();
  await inFrame(`AudioContext.prototype.resume = function () { return Promise.reject(new DOMException('device', 'InvalidStateError')); }; return 1`);
  await play(); await sleep(400); await play();   // (a pause, a play: the Player starts its sound again — refused)
  const [m2, s2] = await remade(f2, 30000);
  check(m2 && (await deaths()) === d2 + 1 && good(s2), `the preview made again, playing with its sound (${JSON.stringify(s2)})`);
  const fr2 = await ev('return __studio.state().frame');
  check(fr2 > 20 && fr2 < 300, `… at its image (${fr2}), « ${await save()} »`);

  // ---------- 3. its clock stopped ----------
  console.log("le contexte audio tourne, son horloge arrêtée");
  await playFrom(20);
  const f3 = await shown(), d3 = await deaths();
  await inFrame(`const C = window.__coulissesAudio, c = C[C.length - 1], t = c.currentTime; Object.defineProperty(c, 'currentTime', { get: () => t }); return 1`);
  const [m3, s3] = await remade(f3, 30000);
  check(m3 && (await deaths()) === d3 + 1 && good(s3), `the preview made again, playing with its sound (${JSON.stringify(s3)})`);

  // ---------- 4. its « error », a 3rd time in 2 min; then « Rétablir le son » ----------
  console.log("l'« error » du périphérique, une 3e fois en 2 min ; puis « Rétablir le son »");
  await playFrom(20);
  const f4 = await shown(), d4 = await deaths();
  await inFrame(`const C = window.__coulissesAudio; C[C.length - 1].dispatchEvent(new Event('error')); return 1`);
  await sleep(2500);
  const msg4 = await save();
  check((await shown()) === f4 && (await deaths()) === d4 && /Toujours pas de son/.test(msg4), `a 3rd time in 2 min: only said (« ${msg4} »)`);
  await ev(`document.querySelector('#bSound').click(); return 1`);
  const [m4, s4] = await remade(f4, 30000);
  check(m4 && good(s4), `« Rétablir le son »: the preview made again, with its sound (${JSON.stringify(s4)}, « ${await save()} »)`);
  await play();
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally {
  await p.close(); st.kill();
  if (ko) console.log(out.split('\n').slice(-25).join('\n'));
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
