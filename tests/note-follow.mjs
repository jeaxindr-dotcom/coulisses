// Notes that follow the video (user request, 19/10/2026: « quand l'agent rallonge ou raccourcit la vidéo, la note doit
// rester collée à la même partie de la vidéo, pas à la même frame »), on the sample Remotion run of
// tests/coulisses-fixture.mjs (three shots s01 0-90, s02 90-210, s03 210-300) — nothing real is touched:
//   0. lib/plans.mjs: a spoken line moved, a shot lengthened, a clip trimmed at its head: the same moments;
//   1. a video exported from the code as it was (newer than every file of the code: its plan known): notes put on it;
//   2. the agent lengthens s01 by 15 frames in the code: on « MP4 rendu » the notes stay (that video did not change); on
//      « Code actuel » they are on the same moments of the new code (s02: +15, inside s01: in proportion), the playhead
//      too; back on the MP4: the frames of before, exactly (no drift); where the user put them kept (n.at);
//   3. a note moved by the user on the code, then the code changed again: it follows from where the user put it.
// usage: node tests/note-follow.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freePort, remotionModules } from './where.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'note-follow-test');
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kill = (c) => { if (c) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };

// ---------- 0. the mapping ----------
console.log('les repères');
{
  const { anchorsOf, mapper, mapFrames } = await import('../lib/plans.mjs');
  const ep = (k) => ({ duration: 20 + k, fps: 30, says: [{ id: 'L1', t: 1, dur: 2 }, { id: 'L2', t: 5 + k, dur: 2 }, { id: 'L3', t: 12 + k, dur: 3 }], sets: [], curtain: [], cutaways: [] });
  const M = mapper(anchorsOf(ep(0)), anchorsOf(ep(2)));
  check(Math.abs(M.map(6) - 8) < 1e-6 && Math.abs(M.map(13) - 15) < 1e-6 && Math.abs(M.map(2) - 2) < 1e-6, 'an episode: 2 s added before a line — a note on it moves 2 s, one before it stays');
  const run = (a) => ({ fps: 30, frames: (a + 8) * 30, tracks: [{ id: 'V1', type: 'video', clips: [{ t0: 0, t1: a, ref: 'p1' }, { t0: a, t1: a + 4, ref: 'p2' }, { t0: a + 4, t1: a + 8, ref: 'p3' }] }] });
  const R = mapper(anchorsOf(run(4)), anchorsOf(run(6)));
  check(Math.abs(R.map(5) - 7) < 1e-6 && Math.abs(R.map(9.5) - 11.5) < 1e-6, 'a montage: the 1st shot 2 s longer — the next shots move 2 s');
  const vid = (from) => ({ fps: 30, frames: 600, tracks: [{ id: 'V1', type: 'video', clips: [{ t0: 0, t1: 10 - from / 30, file: 'rush.mp4', from }, { t0: 10 - from / 30, t1: 20 - from / 30, file: 'b.mp4', from: 0 }] }] });
  const S = mapper(anchorsOf(vid(0)), anchorsOf(vid(60)));
  check(Math.abs(S.map(5) - 3) < 1e-6 && Math.abs(S.map(15) - 13) < 1e-6, 'a clip trimmed 2 s at its head: the same second of its source, exactly');
  check(JSON.stringify(mapFrames(anchorsOf(run(4)), anchorsOf(run(6)), 150, 165)) === '{"frame":210,"end":225}', 'frames of a range note: both ends moved');
}

if (!remotionModules()) { console.log('  (sauté : pas de projet Remotion avec ses node_modules sur ce PC)'); console.log(`\n${ok} ok, ${ko} ko`); process.exit(ko ? 1 : 0); }
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
Object.assign(process.env, { COULISSES_LANG: 'fr', STUDIO_PROJECTS: path.join(SCR, 'projets.json'), COULISSES_SETTINGS: path.join(SCR, 'settings.json'), COULISSES_MEDIAS: path.join(SCR, 'medias') });
const { makeFixture, RUN, PROJET } = await import('./coulisses-fixture.mjs');
const { importProject } = await import('../lib/projects.mjs');
const { launch } = await import('./cdp.mjs');
const RUNTS = path.join(PROJET, 'src', 'runs', 'essai.ts');
const shots = (a1, a2) => { let s = fs.readFileSync(RUNTS, 'utf8'); s = s.replace(/de: 0, a: \d+/, `de: 0, a: ${a1}`).replace(/de: \d+, a: \d+, couleur: '#14532d'/, `de: ${a1}, a: ${a2}, couleur: '#14532d'`).replace(/de: \d+, a: 300/, `de: ${a2}, a: 300`); fs.writeFileSync(RUNTS, s); };

let st = null, p = null;
try {
  const FILE = makeFixture();
  await sleep(1200);   // (the video below newer than every file of the code)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x223344:s=640x360:r=30:d=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(RUN, '07-renders', 'essai.mp4')]);
  const imp = importProject(FILE), NOTES = path.join(imp.revue, 'notes.json');
  const port = await freePort(4189);
  st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', imp.revue, '--no-open', '--port', String(port)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 200 && !/Ouvre : http/.test(out); i++) await sleep(150);
  p = await launch({ port: 9383 });
  const U = `http://127.0.0.1:${port}/`;
  await p.goto(U);
  await p.until(`window.__studio && document.querySelector('#v').readyState >= 1 && __studio.state().plans.code && __studio.state().plans.video`, 120000);
  const plans = () => p.eval(`return __studio.state().plans`);
  const saved = () => { try { return Object.fromEntries(JSON.parse(fs.readFileSync(NOTES, 'utf8')).notes.map((n) => [n.text, n])); } catch { return {}; } };
  const waitSaved = async (pred) => { for (let i = 0; i < 40; i++) { const s = saved(); if (pred(s)) return s; await sleep(250); } return saved(); };
  const frames = (s) => ['A', 'B', 'C'].map((k) => s[k]?.frame).join(' ');
  const P0 = await plans();
  check(P0.code === P0.video, `a video newer than the code: its plan is the code's (${P0.video})`);

  // ---------- 1. notes on the video ----------
  console.log('des notes sur la vidéo');
  const note = async (f, text) => {
    await p.eval(`location.hash = 'f=${f}'; return 1`); await sleep(400);
    await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'n', code: 'KeyN', text: 'n', windowsVirtualKeyCode: 78 }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78 });
    await sleep(300);
    await p.eval(`const t = document.activeElement; t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles: true })); t.blur(); return 1`);
  };
  await note(120, 'A'); await note(200, 'B'); await note(45, 'C');
  let s = await waitSaved((x) => x.A && x.B && x.C);
  check(frames(s) === '120 200 45' && s.A.at?.plan === P0.video && s.A.plan === P0.video, `placed on the video, its version kept (${frames(s)}, ${s.A?.at?.plan})`);

  // ---------- 2. the agent lengthens s01 ----------
  console.log("l'agent allonge le 1er plan de 15 images");
  shots(105, 225);
  await p.until(`__studio.state().plans.code && __studio.state().plans.code !== ${JSON.stringify(P0.code)}`, 90000);
  const P1 = await plans(); await sleep(1500);
  s = saved();
  check(P1.video === P0.video && frames(s) === '120 200 45', `on « MP4 rendu »: the video did not change, the notes neither (${frames(s)})`);
  await p.eval(`location.hash = 'f=200'; return 1`); await sleep(500);
  await p.eval(`document.querySelector('#srcCode').click(); return 1`);
  await p.until(`__studio.state().mode === 'code'`, 120000);
  s = await waitSaved((x) => x.A?.frame !== 120);
  const head = await p.eval(`return __studio.state().frame`);
  check(frames(s) === '135 215 53', `« Code actuel »: the notes on the same moments of the new code — s02 +15, inside s01 in proportion (${frames(s)})`);
  check(Math.abs(head - 215) <= 1, `the playhead too: the same moment (${head})`);
  check(s.A.at.frame === 120 && s.A.at.plan === P0.video && s.A.plan === P1.code && s.A.source === 'code', 'where the user put it kept; on the code now (its image for the agent from the code)');
  let msg = ''; for (let i = 0; i < 12 && !/suivent/.test(msg); i++) { await sleep(250); msg = await p.eval(`return document.querySelector('#save').textContent`); }
  check(/suivent la vidéo modifiée/.test(msg), `said (« ${msg} »)`);
  const before = await p.eval(`return [...document.querySelectorAll('.card')].map((c) => c.querySelector('.frames')?.textContent ?? '').join(' | ')`);
  check(/120/.test(before), 'the card says where it was (« avant : image 120 »)');
  await p.eval(`document.querySelector('#srcVideo').click(); return 1`);
  await p.until(`__studio.state().mode === 'video'`, 60000);
  s = await waitSaved((x) => x.A?.frame === 120);
  check(frames(s) === '120 200 45', `back on the MP4: the frames of before, exactly — nothing drifts (${frames(s)})`);

  // ---------- 3. a note moved by the user, the code changed again ----------
  console.log('une note déplacée, puis le code encore changé');
  await p.eval(`document.querySelector('#srcCode').click(); return 1`);
  await p.until(`__studio.state().mode === 'code'`, 60000);
  await waitSaved((x) => x.A?.frame === 135);
  await p.eval(`const c = [...document.querySelectorAll('.card')].find((c) => c.querySelector('textarea.main')?.value === 'A'); const i = c.querySelector('.f0'); i.value = '160'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
  s = await waitSaved((x) => x.A?.frame === 160);
  check(s.A.at.frame === 160 && s.A.at.plan === P1.code, `moved by the user to 160: that is where it belongs now (${s.A.at.frame}, ${s.A.at.plan === P1.code ? 'code' : s.A.at.plan})`);
  shots(120, 240);
  await p.until(`__studio.state().plans.code !== ${JSON.stringify(P1.code)}`, 90000);
  s = await waitSaved((x) => x.A?.frame !== 160);
  check(frames(s) === '175 230 60', `the code changed again: each from where the user put it (A 160 → 175, B 200 → 230, C 45 → 60: ${frames(s)})`);
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally { await p?.close().catch(() => {}); kill(st); const nm = path.join(PROJET, 'node_modules'); try { if (fs.existsSync(nm)) fs.rmSync(nm); } catch { /* */ } }
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
