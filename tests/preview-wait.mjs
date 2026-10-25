// The live preview never plays over a scene that is still loading (user report 25/10/2026: « à l'arrêt on voit bien
// deux images superposées suite à un fondu ; quand je mets play, l'écran devient noir — résultat, j'envoie des
// corrections qui n'ont pas lieu d'être »; player/assets-wait.tsx). On the sample project of tests/coulisses-fixture.mjs,
// its scene s02 (frames 90-210) slow to mount — 2 s of delayRender, nothing drawn meanwhile, as a Theatre stage loading
// its textures —, a Chrome with Chrome's own rule on sound (a tab of the user's Chrome), silent, a real click on « Lecture »
// from frame 60; sampled every 50 ms:
//   1. no frame of s02 played without its scene (the render waits for it: so does the preview now);
//   2. the playback waited at the scene's start, then went on;
//   3. the review sound waited with it (its time still), then went on with the picture;
//   4. the badge « Image en cours de chargement » said it while waiting, playing.
// usage: node tests/preview-wait.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { makeFixture, RUN } from './coulisses-fixture.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'preview-wait');
const PORT = 4189, URL = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };

fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
fs.writeFileSync(path.join(SCR, 'settings.json'), JSON.stringify({ lang: 'fr' }));
makeFixture({ slowScene: 2000 });
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json'); process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json'); process.env.COULISSES_LANG = 'fr';
process.env.COULISSES_PREMOUNT = '0';   // (the wait itself, without premounting: tests/preview-premount.mjs has it)
const { importProject } = await import('../lib/projects.mjs');
const IMP = importProject(RUN);
const st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', IMP.revue, '--no-open', '--port', String(PORT)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
for (let i = 0; i < 160 && !/http:\/\/127/.test(out); i++) await sleep(250);
const p = await launch({ port: 9375, autoplay: 'tab' });
const ev = (e) => p.eval(e).catch(() => null);
const until = async (expr, ms = 60000) => { const t0 = Date.now(); for (;;) { if (await ev(`return !!(${expr})`)) return true; if (Date.now() - t0 > ms) return false; await sleep(250); } };
const shown = () => ev(`const f = document.querySelector('#code'); return f && f.src && !document.querySelector('iframe.code-next') ? new URL(f.src).search : null`);
const click = async (sel) => { const r = await ev(`const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]`); await p.mouse('mouseMoved', r[0], r[1]); await p.mouse('mousePressed', r[0], r[1]); await p.mouse('mouseReleased', r[0], r[1]); };
try {
  await p.goto(URL);
  check(await until(`window.__studio && __studio.state().mode === 'code' && window.__preview?.durationInFrames > 1`, 120000), 'the studio on the live code, its scene s02 slow to mount (2 s)');
  await until('window.__rs?.().sig', 30000);   // (the review sound ready: the clock of the playback)
  await sleep(1500);
  const s = await shown();
  await ev('window.__preview.seek(60); return 1'); await sleep(1200);
  // the sampler, in the preview: its frame, the scene s02 drawn or not; in the page: the review sound, the badge
  await p.frameEval(s, `window.__smp = []; const t0 = performance.now(); window.__tk = setInterval(() => { const P = window.StudioPlayer; window.__smp.push({ t: Math.round(performance.now() - t0), f: P.frame(), scene: !!document.querySelector('[data-coulisses="titre s02"]') }); }, 50); return 1`);
  await ev(`window.__pg = []; const t0 = performance.now(); window.__pt = setInterval(() => { const r = window.__rs(); window.__pg.push({ t: Math.round(performance.now() - t0), rs: r.t, badge: document.querySelector('#codeWait').classList.contains('on') }); }, 50); return 1`);
  await click('#bPlay');
  await sleep(6000);
  const smp = await p.frameEval(s, 'clearInterval(window.__tk); return window.__smp');
  const pg = await ev('clearInterval(window.__pt); return window.__pg');
  await click('#bPlay');
  const black = smp.filter((x) => x.f >= 93 && x.f < 205 && !x.scene);
  check(smp.length > 50 && black.length === 0, `no frame of s02 played without its scene (${black.length} of ${smp.filter((x) => x.f >= 93 && x.f < 205).length} samples in s02 without it${black.length ? ', first at frame ' + black[0].f : ''})`);
  const held = smp.filter((x) => x.f >= 88 && x.f <= 93).length * 50, last = smp.at(-1)?.f ?? 0;
  check(held >= 1200 && last > 130, `the playback waited at the scene's start (${(held / 1000).toFixed(1)} s around frame 90), then went on (frame ${last})`);
  // the review sound during the wait: its time still (± a step of its clock)
  const waitT = smp.filter((x) => x.f >= 88 && x.f <= 93).map((x) => x.t);
  const during = pg.filter((x) => waitT.length && x.t > waitT[0] + 300 && x.t < waitT.at(-1) - 100).map((x) => x.rs);
  const still = during.length > 5 && Math.max(...during) - Math.min(...during) < 0.25;
  const after = pg.at(-1)?.rs ?? 0, frameAfter = last / 30;
  check(still && Math.abs(after - frameAfter) < 0.5, `the review sound waited with it (${during.length ? (Math.max(...during) - Math.min(...during)).toFixed(2) : '?'} s moved while waiting), then went on with the picture (sound ${after.toFixed(2)} s, picture ${frameAfter.toFixed(2)} s)`);
  check(pg.some((x) => x.badge), `the badge said the wait while playing (${pg.filter((x) => x.badge).length * 50} ms shown)`);
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally {
  await p.close(); st.kill();
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
