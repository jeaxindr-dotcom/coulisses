// « Exporter » a run of a Remotion pipeline from the studio (lib/export.mjs), on the sample project of
// tests/coulisses-fixture.mjs (nothing real is touched): the button is offered, an export runs the project's own
// scripts\coulisses-rendu.mjs to the end (progress, .tmp.mp4 then the final file, which the studio then reviews), an
// export stopped half-way leaves no final file, and an export keeps running when the studio is closed.
// usage: node tests/coulisses-export.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'coulisses-export-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json');
const { makeFixture, RUN } = await import('./coulisses-fixture.mjs');
const { importProject } = await import('../lib/projects.mjs');
const { exportAvailable } = await import('../lib/export.mjs');
const PORT = 4187, U = `http://127.0.0.1:${PORT}`, OUT = path.join(RUN, '07-renders');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const get = async (u) => (await fetch(U + u)).json();
const post = async (u, b = {}) => (await fetch(U + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
const finals = () => (fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => /^essai-.*\.mp4$/.test(f) && !/\.tmp\./.test(f) && !/remplace/.test(f)) : []);
const frames = (f) => +execFileSync('ffprobe', ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim().replace(/,$/, '');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
let studio = null;
async function startStudio(revue) {
  studio = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', revue, '--no-open', '--port', String(PORT)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; studio.stdout.on('data', (d) => { out += d; }); studio.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 160 && !/Ouvre : http/.test(out); i++) await sleep(250);
  if (!/Ouvre : http/.test(out)) throw new Error('le studio ne démarre pas : ' + out.split('\n').slice(-3).join(' '));
}
const stopStudio = () => { if (studio) { try { execFileSync('taskkill', ['/PID', String(studio.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } studio = null; } };
async function until(fn, ms, what) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`délai dépassé : ${what}`); await sleep(500); } }

try {
  const file = makeFixture();
  const imp = importProject(file);
  check(imp.kind === 'remotion', `the sample run is imported (${imp.revue})`);
  check(!exportAvailable({ kind: 'remotion', remotion: { projet: SCR }, exportRule: { dossier: OUT } }).ok
    && /pas encore de script d'export/.test(exportAvailable({ kind: 'remotion', remotion: { projet: SCR }, exportRule: { dossier: OUT } }).why)
    && /ne dit pas où arrive/.test(exportAvailable({ kind: 'remotion', remotion: { projet: SCR }, exportRule: null }).why), 'no export without the script, or without an export folder (and why)');
  await startStudio(imp.revue);
  const meta = await get('/api/meta');
  check(meta.features.export === true && meta.exportWhy === null, 'the studio offers « Exporter » for this run');
  check(meta.exportOptions?.map((o) => o.id).join('|') === 'final|test|remplace', `the script's variants are offered (${meta.exportOptions?.map((o) => o.label).join(', ')})`);

  // 1) the button, in the page
  const p = await launch({ port: 9346 });
  try {
    await p.goto(U + '/');
    await sleep(1500); await p.eval(`document.querySelector('[data-tab="lots"]').click(); return 1`).catch(() => {});
    const t0 = Date.now(); let html = '';
    while (Date.now() - t0 < 30000 && !/exGo/.test(html)) { await sleep(400); html = (await p.eval(`return document.querySelector('#renderCard')?.innerHTML ?? ''`).catch(() => '')) ?? ''; }
    check(/Exporter la vidéo/.test(html) && /Rendu test \(30 images\)/.test(html), 'the page shows one button per variant in the send card');
  } finally { await p.close(); }

  // 2) a whole export
  const before = finals().length;
  const s1 = await post('/api/export');
  check(s1.ok && s1.state === 'running' && s1.pid, `export started (pid ${s1.pid})`);
  const twice = await post('/api/export');
  check(!twice.ok && /tourne déjà/.test(twice.why), 'a second export is refused while one runs');
  let seen = 0;
  const done = await until(async () => { const x = (await get('/api/status')).export; if (x?.pct > seen) seen = x.pct; return x && x.state !== 'running' ? x : null; }, 240000, 'export');
  check(done.state === 'done' && done.pct === 100 && seen > 0 && fs.existsSync(done.file ?? ''), `export done (${path.basename(done.file ?? '')}, progress seen up to ${seen} %)`);
  check(finals().length === before + 1 && !fs.readdirSync(OUT).some((f) => /\.tmp\./.test(f)) && frames(done.file) === 300, 'one new final file, no .tmp left, every frame (300)');
  await sleep(21000);   // a file younger than 20 s is never reviewed (an export being written)
  const st = await get('/api/status');
  check(st.video?.name === path.basename(done.file), `the studio now reviews the new export (${st.video?.name})`);
  const log = await (await fetch(U + '/api/export/log')).text();
  check(!/COULISSES PROGRES/.test(log) && /COULISSES FIN/.test(log), 'the log keeps the lines that matter (no progress lines)');

  // 2b) the test variant: --qualite test (30 frames here)
  const sT = await post('/api/export', { qualite: 'test' });
  const dT = await until(async () => { const x = (await get('/api/status')).export; return x && x.state !== 'running' ? x : null; }, 240000, 'test export');
  check(sT.ok && sT.qualite === 'test' && dT.state === 'done' && frames(dT.file) === 30, `the test variant runs with --qualite test (${frames(dT.file ?? '')} frames)`);
  const bad = await post('/api/export', { qualite: 'nope' });
  check(!bad.ok && /inconnue/.test(bad.why), 'an unknown variant is refused');

  // 2c) replacing the very video under review while it is being played (a stream open on it)
  const r1 = await post('/api/export', { qualite: 'remplace' });
  const d1 = await until(async () => { const x = (await get('/api/status')).export; return x && x.state !== 'running' ? x : null; }, 240000, 'first replace export');
  await sleep(21000);
  const under = (await get('/api/status')).video;
  const ac = new AbortController();
  const reading = fetch(U + '/video', { signal: ac.signal }).then((r) => r.body.getReader().read()).catch(() => null);   // keeps the file open
  await sleep(800);
  const sz0 = fs.statSync(d1.file).mtimeMs;
  await post('/api/export', { qualite: 'remplace' });
  let sawHeld = false;
  const d2 = await until(async () => { const s = await get('/api/status'); if (s.held) sawHeld = true; const x = s.export; return x && x.state !== 'running' ? x : null; }, 240000, 'replace export');
  ac.abort(); await reading; await sleep(2000);   // the studio takes the video back at its next look (1 s)
  const after = await get('/api/status');
  console.log('    (remplacement : ' + JSON.stringify({ r1: r1.ok, revue: under?.name, etat: d2.state, remplace: fs.statSync(d2.file).mtimeMs > sz0, vu: sawHeld, tenu: after.held }) + ')');
  check(r1.ok && under?.name === 'essai-remplace.mp4' && d2.state === 'done' && fs.statSync(d2.file).mtimeMs > sz0 && sawHeld && !after.held,
    `an export replacing the video under review: the studio lets go of it, the file is replaced, the studio takes it back (held seen: ${sawHeld})`);

  // 3) stopped half-way: no final file
  const n2 = finals().length;
  const s2 = await post('/api/export');
  await until(async () => ((await get('/api/status')).export?.pct ?? 0) >= 6, 120000, 'rendering');
  const stop = await post('/api/export/stop');
  await sleep(2500);
  const x2 = (await get('/api/status')).export;
  check(stop.ok && x2.state === 'stopped' && !alive(s2.pid), 'Arrêter: the export and its children are ended');
  check(finals().length === n2, 'and no final file appeared (only a .tmp.mp4 may be left)');
  for (const f of fs.readdirSync(OUT).filter((x) => /\.tmp\.mp4$/.test(x))) fs.rmSync(path.join(OUT, f), { force: true });

  // 4) the studio closed during an export: it goes on, and the studio finds it done when it comes back
  const n3 = finals().length;
  const s3 = await post('/api/export');
  await sleep(3000);
  stopStudio();
  await until(() => finals().length === n3 + 1 || !alive(s3.pid), 240000, 'export without the studio');
  check(finals().length === n3 + 1, 'the export went on with the studio closed');
  await startStudio(imp.revue);
  const x3 = (await get('/api/status')).export;
  check(x3.state === 'done' && x3.pid === s3.pid, 'reopened, the studio shows it done');
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally {
  stopStudio();
  console.log(`\n${ok} ok, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
}
