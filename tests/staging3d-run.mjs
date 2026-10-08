// « Mise en scène » in 3D in a run of a Remotion pipeline (player/three-stage.ts): a 3D shot of Uchu-chan's theatre
// (S12-CH1, the first chibi shot of Short 12) opened live through a .coulisses written in the workshop's cache — the
// theatre is only read (its revue goes to the cache). And « Ouvrir la scène 3D » in the Short 12 studio on that clip
// (read only: no note is written). Skipped when the theatre is not on this PC.
// usage: node tests/staging3d-run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEATRE = 'C:\\Users\\owner\\Desktop\\Youtube\\宇宙\\relance\\theatre\\06_Remotion';
const SHORT = 'C:\\Users\\owner\\Desktop\\Youtube\\宇宙\\relance\\shorts\\short12_yottsu_no_chikara\\short12_yottsu_no_chikara.coulisses';
if (!fs.existsSync(path.join(THEATRE, 'src', 'coulisses.ts')) || !fs.existsSync(SHORT)) { console.log('  (sauté : le théâtre d\'Uchu-chan ou le Short 12 n\'est pas là)\n\n0 ok, 0 ko'); process.exit(0); }
const SCR = path.join(STUDIO, '.cache', 'staging3d-run-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
process.env.COULISSES_LANG = 'fr';
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json');
process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json');
process.env.COULISSES_MEDIAS = path.join(SCR, 'medias');
const P = await import('../lib/projects.mjs');
const { lotMarkdown } = await import('../lib/lots.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const kill = (c) => { if (c) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
async function studioOn(revue, port) {
  const c = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', revue, '--no-open', '--port', String(port)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 240 && !/Ouvre : http/.test(out); i++) await sleep(250);
  return c;
}
let a = null, b = null, p = null;
try {
  const spec = path.join(SCR, 'spec.json');
  fs.writeFileSync(spec, JSON.stringify({ dossier: path.join(SCR, 'CH1'), titre: 'S12 · plan chibi 1', nom: 'S12-CH1 plan 3D', chaine: '宇宙ちゃん', format: '9:16', projet: THEATRE, composition: 'S12-CH1',
    utilise: [{ coulisses: SHORT, fichier: 'public/short12_yottsu_no_chikara/mg/chibi1.mp4' }] }));
  const file = spawnSync(process.execPath, [path.join(STUDIO, 'studio-cli.mjs'), 'projet', 'creer', '--depuis', spec], { encoding: 'utf8', env: process.env }).stdout.trim();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(data.utilise?.[0]?.fichier === 'public/short12_yottsu_no_chikara/mg/chibi1.mp4' && path.isAbsolute(data.utilise[0].coulisses), '« utilise » in the shot\'s .coulisses: the Short, and the file the shot becomes there');
  const shot = P.importProject(file);
  // 1) the shot, live, in 3D
  a = await studioOn(shot.revue, 4196);
  p = await launch({ port: 9378 });
  await p.goto('http://127.0.0.1:4196/');
  await p.until(`document.querySelector('#code')?.contentWindow?.StudioPlayer?.durationInFrames > 1`, 180000);
  const info = await p.eval(`const sp = document.querySelector('#code').contentWindow.StudioPlayer; return { d: sp.durationInFrames, w: sp.width, h: sp.height }`);
  check(info.d === 261 && info.w === 1080 && info.h === 1920, `the theatre's shot plays live (${info.d} frames, ${info.w}×${info.h})`);
  await p.eval(`document.querySelector('#code').contentWindow.StudioPlayer.seek(120); return 1`); await sleep(5000);
  const hits = await p.eval(`return (await document.querySelector('#code').contentWindow.StudioPlayer.pick(120, 540, 1500)).map((h) => h.names?.[0] ?? h.label)`);
  check(/^Stage › Piece\[key="cockpit-/.test(hits[0] ?? ''), `a pin names the 3D object under it, pixel-exact (${hits[0]})`);
  await p.key('m', 'KeyM', 'm');
  await p.until(`__studio.state().staging`, 60000); await sleep(1500);
  check(await p.eval(`return document.querySelector('#code').contentWindow.StudioPlayer.stage.kind`) === '3d', 'M: the 3D staging (a React Three Fiber scene on screen)');
  const at = await p.eval(`const r = document.querySelector('#media').getBoundingClientRect(); const k = Math.min(r.width / 1080, r.height / 1920); return [r.left + (r.width - 1080 * k) / 2 + 540 * k, r.top + (r.height - 1920 * k) / 2 + 1500 * k]`);
  await p.mouse('mousePressed', at[0], at[1]); await p.mouse('mouseReleased', at[0], at[1]); await sleep(1500);
  const sel = await p.eval(`return __studio.state().stage`);
  for (let i = 0; i < 4; i++) { await p.key('ArrowRight', 'ArrowRight'); await sleep(60); }
  await sleep(700);
  const d = sel ? await p.eval(`return document.querySelector('#code').contentWindow.StudioPlayer.stage.info(${JSON.stringify(sel)}).delta`) : null;
  check(/^Stage › Piece/.test(sel ?? '') && Math.abs((d?.p?.[0] ?? 0) - 0.2) < 1e-6, `a click picks the object, the arrows move it in 3D units (${sel} · Δx ${d?.p?.[0]})`);
  // dragging the object itself: along the floor (its height kept), then up with Shift (only its height)
  const sp3 = `document.querySelector('#code').contentWindow.StudioPlayer.stage`;
  const d0 = await p.eval(`return ${sp3}.info(${JSON.stringify(sel)}).delta.p`);
  await p.mouse('mousePressed', at[0], at[1]);
  for (let i = 1; i <= 6; i++) { await p.mouse('mouseMoved', at[0] + i * 12, at[1] - i * 4); await sleep(40); }
  await p.mouse('mouseReleased', at[0] + 72, at[1] - 24); await sleep(500);
  const d1 = await p.eval(`return ${sp3}.info(${JSON.stringify(sel)}).delta.p`);
  check(Math.hypot(d1[0] - d0[0], d1[2] - d0[2]) > 0.05 && Math.abs(d1[1] - d0[1]) < 1e-6 && await p.eval(`return __studio.state().stage`) === sel, `a drag on the object moves it along the floor, its height kept (Δ ${d1.map((x) => x.toFixed(2)).join(', ')})`);
  await p.eval(`const c = document.querySelector('#code').contentWindow.document.querySelector('canvas'), r = c.getBoundingClientRect();
    const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, shiftKey: true, button: 0, buttons: t === 'pointerup' ? 0 : 1, pointerId: 7 }));
    const f = document.querySelector('#code').getBoundingClientRect(), x = ${at[0] + 72} - f.left, y = ${at[1]} - f.top;   // where the object is now (an eye-level camera: it slid sideways, under the pointer's x)
    ev('pointerdown', x, y); for (let i = 1; i <= 5; i++) ev('pointermove', x, y - i * 10); ev('pointerup', x, y - 50); return 1`); await sleep(400);
  const d2 = await p.eval(`return ${sp3}.info(${JSON.stringify(sel)}).delta.p`);
  check(d2[1] - d1[1] > 0.02 && Math.abs(d2[0] - d1[0]) < 1e-6 && Math.abs(d2[2] - d1[2]) < 1e-6, `Shift + drag: only its height (Δy ${(d2[1] - d1[1]).toFixed(2)})`);
  // « Réinitialiser la caméra »
  check(await p.eval(`return /Réinitialiser la caméra/.test(document.querySelector('#scene').innerText)`), '« Réinitialiser la caméra » is in the panel');
  await p.eval(`document.querySelector('#sc-cam').click(); return 1`); await sleep(400);
  check(/Caméra libre active/.test(await p.eval(`return document.querySelector('#scene').innerText`)) && !/Oliver/.test(await p.eval(`return document.querySelector('#scene').innerText`)), 'the free camera; the units are the scene\'s (no Brambleshire scale)');
  // turn the free camera (a drag on empty sky), then reset it: the shot's view again
  const shotView = await p.eval(`return document.querySelector('#code').contentWindow.document.querySelector('canvas').toDataURL('image/jpeg', 0.5).length`);
  const sky = await p.eval(`const r = document.querySelector('#media').getBoundingClientRect(); const k = Math.min(r.width / 1080, r.height / 1920); return [r.left + (r.width - 1080 * k) / 2 + 540 * k, r.top + (r.height - 1920 * k) / 2 + 60 * k]`);
  await p.mouse('mousePressed', sky[0], sky[1]); for (let i = 1; i <= 8; i++) { await p.mouse('mouseMoved', sky[0] + i * 25, sky[1]); await sleep(40); } await p.mouse('mouseReleased', sky[0] + 200, sky[1]); await sleep(600);
  const camPos = () => p.eval(`const sp = document.querySelector('#code').contentWindow.StudioPlayer; return sp.cameraPos ? sp.cameraPos() : null`);
  // free camera: a drag that starts on another object (a backdrop, a floor…) turns the camera, nothing moves
  const other = await p.eval(`const sp = document.querySelector('#code').contentWindow.StudioPlayer; for (const [x, y] of [[540, 900], [300, 1200], [800, 1200], [540, 400], [200, 700], [900, 700], [540, 1750]]) { const n = (await sp.pick(120, x, y))[0]?.names?.[0] ?? ''; if (/^Stage › Piece/.test(n) && n !== ${JSON.stringify(sel)}) return [x, y, n]; } return null`);
  if (other) {
    const listed = () => p.eval(`return JSON.stringify(${sp3}.list().map((x) => [x.id, x.delta.p]))`);
    const c0 = await camPos(), l0 = await listed();
    const o = await p.eval(`const r = document.querySelector('#media').getBoundingClientRect(); const k = Math.min(r.width / 1080, r.height / 1920); return [r.left + (r.width - 1080 * k) / 2 + ${other[0]} * k, r.top + (r.height - 1920 * k) / 2 + ${other[1]} * k]`);
    await p.mouse('mousePressed', o[0], o[1]); for (let i = 1; i <= 6; i++) { await p.mouse('mouseMoved', o[0] + i * 15, o[1]); await sleep(40); } await p.mouse('mouseReleased', o[0] + 90, o[1]); await sleep(500);
    const c1 = await camPos();
    check(c0 && c1 && Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]) > 0.01 && await listed() === l0 && await p.eval(`return __studio.state().stage`) === sel, `free camera: a drag that starts on another object turns the camera, nothing moves (${other[2]})`);
  } else console.log('  (no other object under the probe points: the free-camera drag check is skipped)');
  const moved = await camPos();
  await p.eval(`document.querySelector('#sc-cam0').click(); return 1`); await sleep(600);
  const back = await camPos();
  void shotView;
  check(moved && back && Math.hypot(moved[0] - back[0], moved[1] - back[1], moved[2] - back[2]) > 0.05 && /Caméra libre active/.test(await p.eval(`return document.querySelector('#scene').innerText`)), `« Réinitialiser la caméra »: the shot's camera again, the free camera still on (${moved?.map((x) => x.toFixed(1)).join(',')} → ${back?.map((x) => x.toFixed(1)).join(',')})`);
  const md = lotMarkdown({ kind: 'remotion', target: 'x', title: 'S12', remotionDir: THEATRE, remotion: { composition: 'S12-CH1' }, coulisses: file, EP: SCR, REVUE: shot.revue, uses: P.project(shot.revue).uses },
    { lot: 1, sentAt: new Date().toISOString(), fps: 30, size: [1080, 1920], render: null, edits: [] });
  check(/Ce plan 3D est utilisé dans « 宇宙を動かす/.test(md) && md.includes('06_remotion\\public\\short12_yottsu_no_chikara\\mg\\chibi1.mp4') && /refaire le rendu de la composition `S12-CH1`/.test(md), 'the batch tells the agent to render the shot again into the Short\'s file');
  await p.close(); p = null; kill(a); a = null;
  // 2) the Short 12 studio: « Ouvrir la scène 3D » on the chibi clip
  const shortImp = P.importProject(SHORT);
  b = await studioOn(shortImp.revue, 4197);
  const meta = await (await fetch('http://127.0.0.1:4197/api/meta')).json();
  check(meta.shots3d?.length === 1 && meta.shots3d[0].id === shot.id && meta.shots3d[0].fichier.endsWith('chibi1.mp4'), 'the Short knows its 3D shot (the shot says it is used there)');
  p = await launch({ port: 9379 });
  await p.goto('http://127.0.0.1:4197/');
  await p.until(`window.__studio && __studio.state().frame !== undefined`, 60000); await sleep(4000);
  await p.eval(`document.querySelector('#v').currentTime = 2; return 1`); await sleep(1500);
  const btn = await p.eval(`const b = document.querySelector('#open3d'); return { shown: getComputedStyle(b).display !== 'none', text: b.textContent }`);
  await p.eval(`document.querySelector('#v').currentTime = 30; return 1`); await sleep(1500);
  const after = await p.eval(`return getComputedStyle(document.querySelector('#open3d')).display`);
  check(btn.shown && /Ouvrir la scène 3D · S12 · plan chibi 1/.test(btn.text) && after === 'none', `« ${btn.text} » on the chibi clip only`);
} catch (e) {
  check(false, `erreur : ${e.stack ?? e.message}`);
} finally {
  if (p) await p.close();
  kill(a); kill(b);
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
