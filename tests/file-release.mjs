// The studio never keeps a media file open (14/10/2026: the live preview's <video> elements asked « bytes=0- », read a
// little and stopped; the server's stream stayed paused with the file open, and Windows refused to replace it — the 4K
// paper-3D of a Video du monde export failed one after the other). On the sample project of tests/coulisses-fixture.mjs
// (nothing real is touched): a video of public/ played then paused in the page, the file replaced while the page is open.
// usage: node tests/file-release.mjs   (COULISSES_TEST_SERVER=<studio-server.mjs> to check another version)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = process.env.COULISSES_TEST_SERVER ?? path.join(STUDIO, 'studio-server.mjs');
const SCR = path.join(STUDIO, '.cache', 'file-release-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
process.env.COULISSES_LANG = 'fr';
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json');
process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json');
process.env.COULISSES_MEDIAS = path.join(SCR, 'medias');
const { makeFixture, PROJET } = await import('./coulisses-fixture.mjs');
const { importProject } = await import('../lib/projects.mjs');
const PORT = 4192, U = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const kill = (c) => { if (c) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };

let st = null, p = null;
try {
  const file = makeFixture(), imp = importProject(file);
  // a 30 MB video in the project's public/ (more than one answer of the server: several parts are asked)
  const clip = path.join(PROJET, 'public', 'essai', 'clip.mp4'), next = path.join(SCR, 'clip-4k.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=20', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '12M', '-pix_fmt', 'yuv420p', clip]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', next]);
  st = spawn(process.execPath, [SERVER, '--project', imp.revue, '--no-open', '--port', String(PORT)], { cwd: path.dirname(SERVER), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 160 && !/Ouvre : http/.test(out); i++) await sleep(250);
  if (!/Ouvre : http/.test(out)) throw new Error('le studio ne démarre pas : ' + out.slice(-300));
  p = await launch({ port: 9374 });
  await p.goto(U + '/');
  await p.until(`!!document.querySelector('#media')`, 60000);
  // a <video> of the page plays the file a little, then stays paused (as a premounted clip of the live preview)
  const r = await p.eval(`const v = document.createElement('video'); v.id = 'rel'; v.muted = true; v.preload = 'auto'; v.src = '/public/essai/clip.mp4'; document.body.appendChild(v);
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video error')); });
    await v.play(); await new Promise((res) => setTimeout(res, 1500)); v.pause(); v.currentTime = 12; await new Promise((res) => (v.onseeked = res));
    return { w: v.videoWidth, t: +v.currentTime.toFixed(2), buffered: v.buffered.length ? +v.buffered.end(v.buffered.length - 1).toFixed(1) : 0 }`);
  check(r.w === 1920 && r.t === 12, `the page plays the video of public/ and seeks in it (${JSON.stringify(r)})`);
  await sleep(2500);
  // the file replaced as an export does (rename over it), the page still open with its paused <video>
  let err = null;
  try { fs.renameSync(next, clip); } catch (e) { err = e.code; }
  check(!err, `the file replaced while the page shows it (${err ?? 'renamed'})`);
  // the page asks again: it gets the new file
  const r2 = await p.eval(`const v = document.getElementById('rel'); v.src = '/public/essai/clip.mp4?2'; await new Promise((res) => (v.onloadeddata = res)); return v.videoWidth`);
  check(!err && r2 === 1280, `the page reads the new file afterwards (${r2} px wide)`);
} catch (e) { ko++; console.log('  ✗ ' + e.message); } finally {
  if (p) await p.close().catch(() => {});
  kill(st);
}
console.log(`\n${ok} ok, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
