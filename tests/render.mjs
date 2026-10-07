// « Lancer le rendu » end to end, on a SANDBOX copy, with the stand-in steps of tests/fake-render.mjs (no real render):
// a corrected batch, the request from the page, `studio-cli render` (checks → render → finish), the progress in the
// card and the header, the video let go of (hold) and replaced, the page reloading by itself with the notes moved,
// « Comparer avant / après », `done` (Claude has watched it), then « Arrêter le rendu » and a failing check.
// usage: start a studio server on a sandbox (STUDIO_PORT / STUDIO_SANDBOX as tests/e2e.mjs), then
//        node tests/render.mjs              the test (it replaces the sandbox's video by a remuxed copy)
//        node tests/render.mjs --restore    AFTER stopping that server: hard links and plan of the sandbox back
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { CACHE } from '../lib/place.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX = process.env.STUDIO_SANDBOX ?? path.join(STUDIO, '.cache', 'sandbox-test', '07_Episodes');
const PORT = +(process.env.STUDIO_PORT ?? 4180);
const FOLDER = 'E03 - The Secret Garden', EPD = path.join(SANDBOX, FOLDER), REVUE = path.join(EPD, 'revue'), MP4 = path.join(EPD, `${FOLDER}.mp4`);
const REAL_MP4 = path.join('C:\\Users\\owner\\Desktop\\Youtube\\music\\Brambleshire\\Théatre\\07_Episodes', FOLDER, `${FOLDER}.mp4`);
const USER_PROXY = path.join(STUDIO, 'sandbox', '07_Episodes', FOLDER, 'revue');   // the sandbox copy of the review copy
const BACKUP = path.join(CACHE, 'render-test-backup'), shots = path.join(CACHE, 'shots');
const CLI = path.join(STUDIO, 'studio-cli.mjs');
if (!/sandbox/i.test(SANDBOX)) { console.error('tests/render.mjs ne tourne que sur un bac à sable'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv.includes('--restore')) {   // the server must be stopped: nothing may hold these files
  const relink = (from, to) => { if (!fs.existsSync(from)) return false; fs.rmSync(to, { force: true }); fs.linkSync(from, to); return true; };
  console.log(`vidéo : ${relink(REAL_MP4, MP4) ? 'lien physique rétabli' : 'vraie vidéo absente, inchangée'}`);
  if (fs.existsSync(path.join(USER_PROXY, 'video-revue.mp4'))) {
    relink(path.join(USER_PROXY, 'video-revue.mp4'), path.join(REVUE, 'video-revue.mp4'));
    fs.copyFileSync(path.join(USER_PROXY, 'video-revue.json'), path.join(REVUE, 'video-revue.json'));
    console.log('copie de revue : lien physique rétabli');
  }
  fs.rmSync(path.join(REVUE, 'video-revue.tmp.mp4'), { force: true });
  if (fs.existsSync(BACKUP)) {
    for (const f of fs.readdirSync(REVUE).filter((x) => /^timeline(-v\d+)?\.json$/.test(x))) fs.rmSync(path.join(REVUE, f));
    for (const f of fs.readdirSync(BACKUP)) fs.copyFileSync(path.join(BACKUP, f), path.join(REVUE, f));
    fs.rmSync(BACKUP, { recursive: true, force: true });
    console.log('plans du rendu (timeline*.json) remis');
  }
  process.exit(0);
}

let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const cli = (...a) => execFileSync(process.execPath, [CLI, a[0], 'E03', ...a.slice(1), '--episodes', SANDBOX], { encoding: 'utf8' }).trim();
const api = async (u, body) => (await fetch(`http://127.0.0.1:${PORT}${u}`, body === undefined ? {} : { method: body === 'GET' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
function render(lot, env = {}) {   // `studio-cli render` as Claude runs it (in the background), with the stand-in steps
  const c = spawn(process.execPath, [CLI, 'render', 'E03', String(lot), '--episodes', SANDBOX], { env: { ...process.env, STUDIO_RENDER_RECIPE: path.join(STUDIO, 'tests', 'fake-render.mjs'), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const r = { out: '', code: null }; c.stdout.on('data', (d) => { r.out += d; }); c.stderr.on('data', (d) => { r.out += d; });
  r.done = new Promise((res) => c.on('close', (code) => { r.code = code; res(r); }));
  return r;
}

// a fresh sandbox revue; the plan files are kept aside (the fake finish writes a new one)
for (const d of ['lots', 'runs']) fs.rmSync(path.join(REVUE, d), { recursive: true, force: true });
for (const f of ['render.json', 'render.log', 'render-stop', 'studio-agent.json']) fs.rmSync(path.join(REVUE, f), { force: true });
fs.rmSync(BACKUP, { recursive: true, force: true }); fs.mkdirSync(BACKUP, { recursive: true }); fs.mkdirSync(shots, { recursive: true });
for (const f of fs.readdirSync(REVUE).filter((x) => /^timeline(-v\d+)?\.json$/.test(x))) fs.copyFileSync(path.join(REVUE, f), path.join(BACKUP, f));

const p = await launch({ port: 9343 });
const until = async (expr, ms = 30000) => {   // survives the page reloading by itself
  const t0 = Date.now();
  for (;;) { try { if (await p.eval(`return !!(${expr})`)) return true; } catch { /* reloading */ } if (Date.now() - t0 > ms) throw new Error(`timeout: ${expr}`); await sleep(150); }
};
const ev = (e) => p.eval(e).catch(() => null);
const card = () => ev(`return document.querySelector('#renderCard').innerText`);
try {
  // 1) one corrected batch on the current video (through the API, before the page is open)
  const meta = await api('/api/meta', undefined);
  const nb = await (await fetch(`http://127.0.0.1:${PORT}/api/notes`)).json();
  nb.notes.push({ id: 'rtest1', frame: 9050, end: null, text: 'Pousser l\'échelle vers la droite', images: [], thread: [], status: 'open', created: new Date().toISOString(), render: meta.render, draft: true, source: 'video' });
  await fetch(`http://127.0.0.1:${PORT}/api/notes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nb) });
  const sent = await api('/api/send', { ids: ['rtest1'], words: '', marks: {} });
  Object.assign(nb.notes.at(-1), { draft: false, lot: sent.lot, sentAt: new Date().toISOString() });   // as the page does after sending
  await fetch(`http://127.0.0.1:${PORT}/api/notes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nb) });
  cli('take', String(sent.lot)); cli('reply', 'rtest1', 'Échelle poussée de 0,2 vers la droite', '--status', 'done'); cli('done', String(sent.lot), 'échelle poussée');
  check(sent.ok && sent.lot === 1, `lot ${sent.lot} sent and closed by « Claude »`);

  // 2) the page: « Envois » › « Lancer le rendu »
  await p.goto(`http://localhost:${PORT}/#f=9050`);
  await until(`window.__studio && document.querySelector('#v').readyState >= 2`, 60000);
  await p.eval(`window.confirm = () => true; document.querySelector('#tabs button[data-tab=lots]').click(); return 1`);
  await until(`document.querySelector('#rcGo')`, 10000);
  check(/1 lot corrigé/.test(await card()), 'the card says what the render will carry (1 lot corrigé)');
  await p.eval(`document.querySelector('#rcGo').click(); return 1`);
  await until(`document.querySelector('#modal').style.display === 'flex'`, 10000);
  const line = await ev(`return document.querySelector('#mLine').textContent`);
  check(/Coulisses · E03 · rendu \(lot 2\)/.test(line), `the line to paste (${line?.slice(0, 60)}…)`);
  const md = fs.readFileSync(path.join(REVUE, 'lots', '002.md'), 'utf8');
  check(/demande de RENDU/.test(md) && /Lot 1 \(1 modif\) : corrigé/.test(md) && /render E03 --episodes .* 2` \*\*en tâche de fond/.test(md), 'the request tells Claude what it carries and the exact command');
  await p.eval(`document.querySelector('#mClose').click(); return 1`);
  await until(`/Retirer la demande/.test(document.querySelector('#renderCard').innerText)`, 8000);
  check(await ev(`return document.querySelector('#renderPill').textContent.includes('Rendu demandé')`), 'header: « Rendu demandé »');
  const dup = await api('/api/render', {});
  check(dup.ok === false && /attend déjà/.test(dup.why), 'a second request is refused while one waits');

  // 3) Claude runs it: checks, render progress, the video let go of, replaced, the page reloads
  const before = await ev(`return __studio.state().video`);
  const run = render(2, { FAKE_FRAMES: '160', FAKE_MS: '45' });
  await until(`/image \\d+ \\/ 160/.test(document.querySelector('#renderCard').innerText)`, 30000);
  const mid = await ev(`return { card: document.querySelector('#renderCard').innerText, pill: document.querySelector('#renderPill').textContent, bar: parseFloat(document.querySelector('#rcBar').style.width), chips: document.querySelectorAll('#renderCard .chip.ok').length }`);
  check(mid.chips === 5, `the five checks passed (${mid.chips} ✓)`);
  check(/Rendu \d+ %/.test(mid.pill) && mid.bar > 0, `progress: « ${mid.pill} », bar ${mid.bar} %, « ${/image [^\n]+/.exec(mid.card)?.[0]} »`);
  await p.shot(path.join(shots, 'render-1-progress.png'));
  let sawHeld = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000 && run.code === null) { if (await ev(`return __studio.state().held || document.querySelector('#stage').classList.contains('held')`)) { sawHeld = true; break; } await sleep(100); }
  if (sawHeld) await p.shot(path.join(shots, 'render-2-held.png'));
  check(sawHeld, 'while finish-render replaces the video, the page lets go of it (« Le nouveau rendu remplace la vidéo »)');
  await run.done;
  check(run.code === 0 && /RENDU TERMINÉ/.test(run.out) && /Integrated -16 LUFS/.test(run.out) && /done E03 --episodes/.test(run.out), 'the command ends with the loudness and the next step for Claude');
  await until(`window.__studio && __studio.state().video && __studio.state().video !== ${before}`, 40000);
  check(true, 'the page reloaded the new video by itself');
  await until(`window.__studio && document.querySelector('#v').readyState >= 2`, 60000);
  await p.eval(`window.confirm = () => true; document.querySelector('#tabs button[data-tab=lots]').click(); return 1`);
  await until(`/Nouvelle vidéo prête/.test(document.querySelector('#renderCard').innerText)`, 15000);
  const ready = await card();
  check(/−16,0 LUFS/.test(ready) && /crête −1,6 dBTP/.test(ready) && /regarde en entier/.test(ready), 'card: « Nouvelle vidéo prête · −16,0 LUFS · crête −1,6 dBTP », Claude watches it');
  check(Math.abs((await ev(`return __studio.state().frame`)) - 9050) <= 1, 'back on the same image after the reload');
  await sleep(3500);
  const moved = (await (await fetch(`http://127.0.0.1:${PORT}/api/notes`)).json()).notes.find((n) => n.id === 'rtest1');
  check(moved?.render?.size !== meta.render.size && moved?.before?.length === 1, 'the note was moved onto the new video (and keeps its old place)');
  await p.shot(path.join(shots, 'render-3-ready.png'));

  // 4) « Comparer avant / après »
  await until(`document.querySelector('#rcCmp')`, 10000);
  await p.eval(`document.querySelector('#rcCmp').click(); return 1`);
  await until(`__studio.state().cmp && document.querySelector('#cmpA').naturalWidth > 0 && document.querySelector('#cmpB').naturalWidth > 0`, 30000);
  const lab = await ev(`return [document.querySelector('#cmpLA').textContent, document.querySelector('#cmpLB').textContent, document.querySelector('#cmpTx').textContent]`);
  check(/Avant · rendu du/.test(lab[0]) && /Après · nouveau rendu · image 9050/.test(lab[1]) && /Pousser l'échelle/.test(lab[2]), `the wipe: « ${lab[0]} » | « ${lab[1]} »`);
  const r = await ev(`const r = document.querySelector('#cmpW').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]`);
  await p.mouse('mousePressed', r[0] + r[2] * 0.3, r[1] + r[3] / 2); await p.mouse('mouseMoved', r[0] + r[2] * 0.3, r[1] + r[3] / 2); await p.mouse('mouseReleased', r[0] + r[2] * 0.3, r[1] + r[3] / 2);
  await sleep(200);
  const x = (await ev(`return __studio.state().cmp`))?.x;
  check(Math.abs(x - 30) < 2, `dragging moves the wipe (${x?.toFixed(1)} %)`);
  await p.shot(path.join(shots, 'render-4-compare.png'));
  await p.key('b', 'KeyB', 'b'); await sleep(150);
  const x1 = (await ev(`return __studio.state().cmp`))?.x;
  await p.key('b', 'KeyB', 'b'); await sleep(150);
  check(x1 === 100 && (await ev(`return __studio.state().cmp`))?.x === 0, 'B: all « avant », then all « après »');
  await p.key('Escape', 'Escape'); await sleep(150);
  check(!(await ev(`return __studio.state().cmp`)), 'Escape closes it');

  // 5) Claude has watched it: `done`
  cli('done', '2', 'vue en entier, rien à signaler');
  await until(`/Dernier rendu vérifié par l'agent/.test(document.querySelector('#renderCard').innerText)`, 10000);
  check(/rien à signaler/.test(await card()) && !(await ev(`return document.querySelector('#renderPill').classList.contains('show')`)), 'card: « Dernier rendu vérifié par l\'agent : … », the header pill is gone');

  // 6) « Arrêter le rendu »
  await p.eval(`document.querySelector('#rcGo').click(); return 1`);
  await until(`document.querySelector('#modal').style.display === 'flex'`, 10000); await p.eval(`document.querySelector('#mClose').click(); return 1`);
  const run2 = render(3, { FAKE_FRAMES: '400', FAKE_MS: '120' });
  await until(`document.querySelector('#rcStop') && /image \\d+ \\/ 400/.test(document.querySelector('#renderCard').innerText)`, 30000);
  await p.eval(`document.querySelector('#rcStop').click(); return 1`);
  await Promise.race([run2.done, sleep(20000)]);
  check(run2.code === 1 && /RENDU ARRÊTÉ/.test(run2.out), 'Arrêter le rendu: the command stops (« RENDU ARRÊTÉ »)');
  await until(`/Rendu arrêté le/.test(document.querySelector('#renderCard').innerText) && /Relancer le rendu/.test(document.querySelector('#renderCard').innerText)`, 10000);
  check(true, 'card: « Rendu arrêté », « Relancer le rendu »');
  check(fs.statSync(MP4).size === moved.render.size, 'the video was not touched');

  // 7) a failing check blocks the render
  await p.eval(`document.querySelector('#rcGo').click(); return 1`);
  await until(`document.querySelector('#modal').style.display === 'flex'`, 10000); await p.eval(`document.querySelector('#mClose').click(); return 1`);
  const run3 = render(4, { FAKE_FAIL: 'depth' });
  await run3.done;
  check(run3.code === 1 && /RENDU NON LANCÉ/.test(run3.out) && /Profondeur/.test(run3.out), 'a failing check stops it before the render (« RENDU NON LANCÉ : contrôle « Profondeur » »)');
  await until(`/L'agent corrige, puis relance/.test(document.querySelector('#renderCard').innerText)`, 10000);
  check(await ev(`return document.querySelector('#renderPill').textContent.includes('bloqué') && document.querySelector('#renderCard .chip.fail') !== null`), 'card and header: « Rendu bloqué », the failing check in red');
  await p.shot(path.join(shots, 'render-5-blocked.png'));

  // 8) the sandbox guard: the real steps never replace a video outside the real project
  let guard = '';
  try { execFileSync(process.execPath, [CLI, 'render', 'E03', '--episodes', SANDBOX], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { guard = String(e.stderr || e.stdout || e.message); }
  check(/seulement sur le vrai projet/.test(guard), 'without the stand-in, a sandbox render is refused (finish = the real project only)');
} catch (e) { ko++; console.log('  ✗ ERREUR', e.message); } finally {
  const errs = p.logs.filter((l) => /exception|\[error\]/.test(l) && !/WebGL|X4000|503|Failed to load resource/.test(l));
  if (errs.length) console.log('page errors:\n' + errs.slice(0, 5).join('\n'));
  await p.close();
  console.log(`\n${ok} ok, ${ko} échec(s) · après avoir arrêté le serveur : node tests/render.mjs --restore`);
  process.exit(ko ? 1 : 0);
}
