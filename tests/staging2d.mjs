// « Mise en scène » in a run of a Remotion pipeline (player/stage2d.ts), on the sample project of tests/coulisses-fixture.mjs
// (nothing real is touched), and the same tools in every project (user request, 08/10/2026: « il doit apparaître pour
// toutes les vidéos » · « je n'ai pas les mêmes menus en fonction de la vidéo » · « le mot scène disparaît »):
//   1. the rail, the tabs and the menu bar: every tool is there, greyed with its reason when it does not apply; the six
//      tabs keep their whole names;
//   2. M: the 2D staging; a click picks the title, a drag moves it, the arrows nudge it, the wheel resizes it — on top of
//      the engine (CSS translate / scale), in frame pixels;
//   3. « Ajouter »: a pinned edit with the offset, the « after » image photographed by the server at the frame's size,
//      and the batch's request in 2D words; the camera (the whole frame) reframes;
//   4. a project with only a video: the staging is greyed, and says why.
// usage: node tests/staging2d.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'staging2d-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
process.env.COULISSES_LANG = 'fr';
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json');
process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json');
process.env.COULISSES_MEDIAS = path.join(SCR, 'medias');
const { makeFixture } = await import('./coulisses-fixture.mjs');
const { importProject } = await import('../lib/projects.mjs');
const { lotMarkdown } = await import('../lib/lots.mjs');
const PORT = 4193, U = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const kill = (c) => { if (c) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
async function studioOn(revue, port) {
  const c = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', revue, '--no-open', '--port', String(port)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 160 && !/Ouvre : http/.test(out); i++) await sleep(250);
  if (!/Ouvre : http/.test(out)) throw new Error('le studio ne démarre pas : ' + out.slice(-300));
  c.log = () => out;
  return c;
}
const TOOLS = ['connect', 'send', 'staging', 'source', 'export', 'stopExport', 'compare', 'updates', 'verify', 'log'];
async function menuIds(p) {   // Outils: its entries, and the reason of each greyed one
  const [x, y] = await p.eval(`const r = document.querySelector('#menubar > button[data-menu=tools]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`);
  await p.mouse('mousePressed', x, y); await p.mouse('mouseReleased', x, y); await sleep(300);
  const r = await p.eval(`const m = document.querySelector('.mb-menu'); const items = m ? [...m.querySelectorAll(':scope > .mb-item')] : [];
    return { ids: items.map((r) => r.dataset.id), off: Object.fromEntries(items.map((r) => [r.dataset.id, r.classList.contains('off') ? r.title : ''])) }`);
  await p.key('Escape', 'Escape'); await sleep(100);
  return r;
}

let st = null, st2 = null, p = null;
try {
  const file = makeFixture(), imp = importProject(file);
  st = await studioOn(imp.revue, PORT);
  p = await launch({ port: 9372 });
  await p.goto(U + '/');
  await p.until(`document.querySelector('#code')?.contentWindow?.StudioPlayer?.durationInFrames`, 60000);
  await sleep(1500);

  // ---------- 1. the same tools everywhere ----------
  console.log('les mêmes outils partout');
  const rail = await p.eval(`return [...document.querySelectorAll('#rail button')].map((b) => ({ id: b.id || b.dataset.tool, shown: getComputedStyle(b).display !== 'none', off: b.classList.contains('off'), why: b.querySelector('.why')?.textContent ?? '' }))`);
  check(rail.map((b) => b.id).join() === 'select,draw,comment,bNote,bRange,bStage,bSrc' && rail.every((b) => b.shown), `the rail: ${rail.map((b) => b.id).join(' · ')}, all shown`);
  const src = rail.find((b) => b.id === 'bSrc'), stg = rail.find((b) => b.id === 'bStage');
  check(src.off && /Pas encore de vidéo/.test(src.why) && !stg.off, `« MP4 ⇄ code » greyed here (« ${src.why} »), « Mise en scène » ready`);
  const tabs = await p.eval(`const bar = document.querySelector('#tabs'), r = bar.getBoundingClientRect();
    return { names: [...bar.querySelectorAll('button')].map((b) => b.childNodes[0].textContent), cut: [...bar.querySelectorAll('button')].filter((b) => b.scrollWidth > b.clientWidth + 1).length,
      fits: bar.scrollWidth <= bar.clientWidth + 1, last: [...bar.querySelectorAll('button')].at(-1).getBoundingClientRect().right <= r.right + 1 }`);
  check(tabs.names.join('|') === 'Agent|Modifs|Notes|Envois|Inspecteur|Médias|Scène' && !tabs.cut && tabs.fits && tabs.last, `seven tabs, none cut, « Scène » whole (${tabs.names.join(' · ')})`);
  const m1 = await menuIds(p);
  check(TOOLS.every((id) => m1.ids.includes(id)) && !m1.ids.includes('render') && !m1.off.staging && /Pas encore de vidéo/.test(m1.off.source), `Outils: ${m1.ids.filter(Boolean).join(' · ')}`);

  // ---------- 2. the 2D staging ----------
  console.log('la mise en scène 2D');
  await p.eval(`document.querySelector('#code').contentWindow.StudioPlayer.seek(45); return 1`); await sleep(900);
  await p.key('m', 'KeyM', 'm');
  await p.until(`__studio.state().staging`, 20000);
  check(await p.eval(`return __studio.state().tab === 'scene' && document.querySelector('#code').contentWindow.StudioPlayer.stage.kind === '2d'`), 'M: the 2D staging, panel « Scène »');
  const at = await p.eval(`const f = document.querySelector('#code'), fr = f.getBoundingClientRect(), el = f.contentDocument.querySelector('[data-coulisses="titre s01"]'), r = el.getBoundingClientRect();
    return [fr.left + r.left + r.width / 2, fr.top + r.top + r.height / 2, r.width]`);
  await p.mouse('mousePressed', at[0], at[1]);
  for (let i = 1; i <= 5; i++) { await p.eval(`return 1`); await sleepMove(p, at[0] + i * 20, at[1] + i * 8); }
  await p.mouse('mouseReleased', at[0] + 100, at[1] + 40);
  await sleep(500);
  const sel = await p.eval(`return __studio.state().stage`);
  check(sel === '[data-coulisses="titre s01"]', `a click picks the title, by its data-coulisses name (${sel})`);
  const k = await p.eval(`const f = document.querySelector('#code').contentDocument.getElementById('coulisses-camera').parentElement; return f.getBoundingClientRect().width / 1920`);
  let info = await p.eval(`return document.querySelector('#code').contentWindow.StudioPlayer.stage.info(${JSON.stringify(sel)})`);
  check(Math.abs(info.delta.p[0] - 100 / k) < 3 && Math.abs(info.delta.p[1] - 40 / k) < 3, `a drag moves it, in frame pixels (Δx ${info.delta.p[0].toFixed(0)}, Δy ${info.delta.p[1].toFixed(0)}; ${(100 / k).toFixed(0)} × ${(40 / k).toFixed(0)} expected)`);
  const css = await p.eval(`return document.querySelector('#code').contentDocument.querySelector('[data-coulisses="titre s01"]').style.translate`);
  check(/px/.test(css) && await p.eval(`return /scale\\(/.test(document.querySelector('#code').contentDocument.querySelector('[data-coulisses="titre s01"]').style.transform)`), `shown on top of the engine: translate ${css}, its own transform untouched`);
  for (let i = 0; i < 3; i++) { await p.key('ArrowRight', 'ArrowRight'); await sleep(60); }
  await p.wheel(at[0] + 100, at[1] + 40, -120); await sleep(400);
  const info2 = await p.eval(`return document.querySelector('#code').contentWindow.StudioPlayer.stage.info(${JSON.stringify(sel)})`);
  check(Math.abs(info2.delta.p[0] - info.delta.p[0] - 3) < 0.01 && info2.delta.s > 1.03, `→ ×3 = +3 px, the wheel = size ×${info2.delta.s.toFixed(2)}`);
  check(await p.eval(`return document.querySelector('#sc-x').value`) === String(Math.round(info2.delta.p[0])), 'the panel shows the offset in pixels');
  // ---------- 3. into the queue: offset, pin, « after » image ----------
  console.log('dans la file');
  await p.eval(`document.querySelector('#sc-add').click(); return 1`);
  await p.until(`__studio.state().drafts === 1`, 60000); await sleep(3500);
  const notes = (await (await fetch(U + '/api/notes')).json()).notes;
  const n = notes.find((x) => x.stage);
  check(n?.stage?.dim === '2d' && n.stage.id === sel && n.stage.size?.join('x') === '1920x1080' && n.mark?.kind === 'pin' && /titre s01/.test(n.text), `a pinned edit with the 2D offset (« ${n?.text?.slice(0, 80)}… »)`);
  const after = n?.images?.find((im) => /après|after/i.test(im.label ?? ''));
  const afterFile = after ? path.join(imp.revue, after.file) : null;
  const dims = afterFile && fs.existsSync(afterFile) ? execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', afterFile], { encoding: 'utf8' }).trim() : '';
  check(dims === '1920,1080', `the « after » image, photographed by the server at the frame's size (${dims || 'none'})`);
  if (afterFile && fs.existsSync(afterFile)) fs.copyFileSync(afterFile, path.join(SCR, 'apres.jpg'));
  const md = lotMarkdown({ kind: 'remotion', target: 'x', title: 'Essai', remotionDir: SCR, remotion: { composition: 'C' }, coulisses: file, EP: SCR, REVUE: imp.revue },
    { lot: 1, sentAt: new Date().toISOString(), fps: 30, size: [1920, 1080], render: null, edits: [{ k: 1, id: n.id, frame: n.frame, end: null, time: 1.5, text: n.text, thread: [], context: null, mark: n.mark, target: null, source: 'code', images: [], captures: {}, stage: n.stage }] });
  check(/Mise en scène proposée par l'utilisateur/.test(md) && /Δx \+\d+ px \(vers la droite\)/.test(md) && /Boîte de l'élément/.test(md) && /là où le projet place cet élément/.test(md), 'the batch tells the agent the offset in pixels, the element\'s box, where to write it');
  // the camera: the whole frame
  await p.eval(`document.querySelector('#sc-cam').click(); return 1`); await sleep(300);
  check(await p.eval(`return __studio.state().stage === '@camera'`), '« Caméra » picks the whole frame');
  const mid = await p.eval(`const r = document.querySelector('#code').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`);
  await p.wheel(mid[0], mid[1], -120); await p.wheel(mid[0], mid[1], -120); await sleep(400);
  const cam = await p.eval(`return document.querySelector('#code').contentWindow.StudioPlayer.stage.info('@camera')`);
  const camCss = await p.eval(`return document.querySelector('#code').contentDocument.getElementById('coulisses-camera').style.scale`);
  check(cam.delta.s > 1.07 && +camCss > 1.07, `the wheel zooms the frame (×${cam.delta.s.toFixed(2)}, the preview's frame scale ${camCss})`);
  const camMd = lotMarkdown({ kind: 'remotion', target: 'x', title: 'Essai', remotionDir: SCR, remotion: { composition: 'C' }, coulisses: file, EP: SCR, REVUE: imp.revue },
    { lot: 1, sentAt: new Date().toISOString(), fps: 30, size: [1920, 1080], render: null, edits: [{ k: 1, id: 'c', frame: 45, end: null, time: 1.5, text: '', thread: [], context: null, mark: null, target: null, source: 'code', images: [], captures: {}, stage: { id: '@camera', name: 'Caméra', kind: 'cadre entier', delta: cam.delta, base: null, scope: { label: 'tout', from: 0, to: 299 }, frame: 45, dim: '2d', size: [1920, 1080] } }] });
  check(/Cadrage proposé par l'utilisateur/.test(camMd) && /mouvement de caméra/.test(camMd), 'a reframing goes to the agent as a camera move');
  await p.shot(path.join(SCR, 'staging2d.png'));
  await p.key('m', 'KeyM', 'm'); await sleep(500);
  check(!(await p.eval(`return __studio.state().staging`)), 'M again: staging off');
  await p.close(); p = null;

  // ---------- 4. a project with only its video ----------
  console.log('un projet vidéo seule');
  const vdir = path.join(SCR, 'video-seule'); fs.mkdirSync(vdir, { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-t', '2', '-pix_fmt', 'yuv420p', path.join(vdir, 'essai.mp4')]);
  const vimp = importProject(vdir);
  st2 = await studioOn(vimp.revue, PORT + 1);
  p = await launch({ port: 9373 });
  await p.goto(`http://127.0.0.1:${PORT + 1}/`);
  await p.until(`document.querySelector('#v').readyState >= 1`, 30000); await sleep(1200);
  const r2 = await p.eval(`return [...document.querySelectorAll('#rail button')].map((b) => ({ id: b.id || b.dataset.tool, shown: getComputedStyle(b).display !== 'none', off: b.classList.contains('off'), why: b.querySelector('.why')?.textContent ?? '' }))`);
  check(r2.map((b) => b.id).join() === rail.map((b) => b.id).join() && r2.every((b) => b.shown), 'the same rail for a video');
  const s2 = r2.find((b) => b.id === 'bStage');
  check(s2.off && /que sa vidéo/.test(s2.why), `« Mise en scène » greyed: « ${s2.why.slice(0, 70)}… »`);
  const m2 = await menuIds(p);
  check(JSON.stringify(m2.ids.filter(Boolean)) === JSON.stringify(m1.ids.filter(Boolean)) && /que sa vidéo/.test(m2.off.staging) && /propre logiciel/.test(m2.off.export), 'the same Tools menu, greyed where it does not apply, with the reason');
  await p.eval(`document.querySelector('#tabs button[data-tab="scene"]').click(); return 1`); await sleep(300);
  check(/que sa vidéo/.test(await p.eval(`return document.querySelector('#scene').innerText`)), 'the « Scène » tab says why');
} catch (e) {
  check(false, `erreur : ${e.stack ?? e.message}`);
} finally {
  if (p) await p.close();
  kill(st); kill(st2);
}
async function sleepMove(page, x, y) { await page.mouse('mouseMoved', x, y); await sleep(40); }
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
