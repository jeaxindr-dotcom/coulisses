// The colour of the notes and the batch filter (user request, 18/10/2026: « rouge = je place une note, bleu = il l'a
// corrigée, verte = je l'ai validée » ; « un pull down pour choisir d'afficher toutes les notes, ou les notes par lot »),
// on a test project only (nothing real is touched):
//   1. the colours: a note to fix is red, one the agent fixed is blue (its answer in replies.json), on the card (its
//      number, its edge) and on the timeline (the pixel of its mark);
//   2. « Valider »: green, written in notes.json (« verified »), « masquer les validées » hides it; again: blue; « corrigé »
//      unticked: red; the home screen counts a validated note as done;
//   3. « Toutes les notes / Lot 1 / Lot 2 »: the chosen batch's notes only in the list and on the timeline, the note not sent
//      yet always on the timeline; kept when the page loads again; « Valider les N corrigées » of a batch; « Voir les
//      notes » of a batch (Envois tab) chooses it.
// usage: node tests/note-states.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freePort } from './where.mjs';
import { launch } from './cdp.mjs';

process.env.COULISSES_LANG = 'fr';
const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'note-states-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(path.join(SCR, 'Clip'), { recursive: true });
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json');
process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json');
process.env.COULISSES_MEDIAS = path.join(SCR, 'medias');
const { importProject } = await import('../lib/projects.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const kill = (c) => { if (c) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
const T0 = Date.now() - 3600e3, iso = (s) => new Date(T0 + s * 1000).toISOString();
const note = (id, frame, lot, more = {}) => ({ id, frame, end: null, text: `note ${id}`, images: [], thread: [], status: 'open', created: iso(0), updated: iso(0), draft: false, lot, sentAt: iso(1), ...more });
// the colours of page/studio.css (--ntodo, --nfixed, --nok)
const RED = [255, 114, 114], BLUE = [98, 168, 255], GREEN = [79, 217, 139];
const near = (a, b) => a && b && a.every((x, i) => Math.abs(x - b[i]) <= 12);

let st = null, hub = null, p = null;
try {
  const VID = path.join(SCR, 'Clip', 'Clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x202838:s=640x360:r=30:d=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', VID]);
  const imp = importProject(VID);
  // lot 1: a (fixed by the agent), b (fixed), c (to fix); lot 2: d (fixed), e (to fix); x: not sent yet
  const NOTES = path.join(imp.revue, 'notes.json');
  fs.writeFileSync(NOTES, JSON.stringify({ notes: [note('a', 30, 1), note('b', 60, 1), note('c', 90, 1), note('d', 150, 2), note('e', 210, 2), note('x', 250, undefined, { draft: true, lot: undefined, sentAt: undefined })] }));
  fs.writeFileSync(path.join(imp.revue, 'replies.json'), JSON.stringify({ notes: Object.fromEntries(['a', 'b', 'd'].map((id) => [id, { status: 'done', statusAt: iso(60), messages: [{ text: `corrigé ${id}`, at: iso(60) }] }])), lots: { 1: { status: 'done', at: iso(60) }, 2: { status: 'done', at: iso(60) } } }));
  // the two batches as sent (revue/lots/001.json, 002.json): the Envois tab lists them
  fs.mkdirSync(path.join(imp.revue, 'lots'), { recursive: true });
  for (const [n, ids] of [[1, ['a', 'b', 'c']], [2, ['d', 'e']]]) fs.writeFileSync(path.join(imp.revue, 'lots', `00${n}.json`), JSON.stringify({ lot: n, sentAt: iso(1), edits: ids.map((id) => ({ id })) }));
  const port = await freePort(4189);
  st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', imp.revue, '--no-open', '--port', String(port)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 200 && !/Ouvre : http/.test(out); i++) await sleep(150);
  const U = `http://127.0.0.1:${port}/`;
  p = await launch({ port: 9389 });
  await p.size(1600, 1000);
  const open = async () => { await p.goto(U); await p.until(`window.__studio && document.querySelector('#v').readyState >= 1 && document.querySelectorAll('#list .card').length`, 60000); await sleep(600); };
  await p.eval(`localStorage.clear(); return 1`).catch(() => {});
  await open();
  await p.eval(`document.querySelector('#tabs button[data-tab="notes"]').click(); return 1`); await sleep(400);
  const cards = () => p.eval(`return [...document.querySelectorAll('#list .card')].map((c) => ({ id: c.dataset.id, st: (c.className.match(/st-(\\w+)/) || [])[1], num: getComputedStyle(c.querySelector('.num')).backgroundColor, vf: c.querySelector('.vf')?.textContent.trim() ?? null }))`);
  const rgb = (s) => (s?.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  // the pixel of a point note's mark on the timeline (its circle, beside its number)
  const tlPixel = (id) => p.eval(`const s = __studio.state(), x = s.tlX[${JSON.stringify(id)}]; if (x === undefined) return null; const cv = document.querySelector('#tl'), d = devicePixelRatio || 1;
    return [...cv.getContext('2d').getImageData(Math.round((118 + x + 5) * d), Math.round(32 * d), 1, 1).data].slice(0, 3)`);
  const notesFile = () => Object.fromEntries(JSON.parse(fs.readFileSync(NOTES, 'utf8')).notes.map((n) => [n.id, n.status]));

  // ---------- 1. the colours ----------
  console.log('les couleurs');
  let c = await cards();
  const by = (id) => c.find((x) => x.id === id);
  check(by('a')?.st === 'fixed' && by('d')?.st === 'fixed' && by('c')?.st === 'todo' && by('e')?.st === 'todo', `fixed by the agent: blue, to fix: red (${c.map((x) => x.id + ':' + x.st).join(' ')})`);
  check(near(rgb(by('c')?.num), RED) && near(rgb(by('a')?.num), BLUE), `the card's number in its colour (${by('c')?.num} · ${by('a')?.num})`);
  const px = { a: await tlPixel('a'), c: await tlPixel('c') };
  check(near(px.c, RED) && near(px.a, BLUE), `on the timeline too (c ${px.c} · a ${px.a})`);

  // ---------- 2. « Valider » ----------
  console.log('« Valider »');
  check(by('a')?.vf === 'Valider' && by('c')?.vf === 'Valider', 'a « Valider » button beside « corrigé »');
  await p.eval(`document.querySelector('#list .card[data-id="a"] .vf').click(); return 1`); await sleep(900);
  c = await cards();
  const pxA = await tlPixel('a');
  check(by('a')?.st === 'ok' && near(rgb(by('a')?.num), GREEN) && by('a')?.vf === 'Validée' && near(pxA, GREEN), `validated: green, on the card and on the timeline (${by('a')?.num} · ${pxA})`);
  check(notesFile().a === 'verified', `written in notes.json (« ${notesFile().a} »)`);
  await p.eval(`const h = document.querySelector('#hideDone'); h.checked = true; h.dispatchEvent(new Event('change')); return 1`); await sleep(300);
  c = await cards();
  check(!by('a') && by('b') && by('c'), `« masquer les validées »: the green one hidden, the blue and red ones kept (${c.map((x) => x.id).join(' ')})`);
  await p.eval(`const h = document.querySelector('#hideDone'); h.checked = false; h.dispatchEvent(new Event('change')); return 1`); await sleep(300);
  const label = await p.eval(`return document.querySelector('#hideDoneT').textContent`);
  check(label === 'masquer les validées', `its label (« ${label} »)`);
  // the home screen: a validated note is not « to fix »
  const hp = await freePort(4188);
  hub = spawn(process.execPath, [path.join(STUDIO, 'hub-server.mjs'), '--port', String(hp)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let hout = ''; hub.stdout.on('data', (d) => { hout += d; });
  for (let i = 0; i < 150 && !hout.includes('HUB_READY'); i++) await sleep(100);
  const card = (await (await fetch(`http://127.0.0.1:${hp}/api/episodes`)).json()).projects?.find((x) => x.id === imp.id);
  check(card?.open === 2 + 1, `the home screen: ${card?.open} to fix (c, e, and x not sent yet), the validated and fixed ones not counted`);
  kill(hub); hub = null;
  await p.eval(`document.querySelector('#list .card[data-id="a"] .vf').click(); return 1`); await sleep(700);
  c = await cards();
  check(by('a')?.st === 'fixed' && notesFile().a === 'done', `« Validée » clicked again: blue, « corrigée » (${by('a')?.st}, ${notesFile().a})`);
  await p.eval(`document.querySelector('#list .card[data-id="a"] .vf').click(); return 1`); await sleep(500);
  await p.eval(`const d = document.querySelector('#list .card[data-id="a"] .dn'); d.checked = false; d.dispatchEvent(new Event('change')); return 1`); await sleep(700);
  c = await cards();
  check(by('a')?.st === 'todo' && notesFile().a === 'open', `« corrigé » unticked on a validated note: red again (${by('a')?.st}, ${notesFile().a})`);
  await p.eval(`const d = document.querySelector('#list .card[data-id="a"] .dn'); d.checked = true; d.dispatchEvent(new Event('change')); return 1`); await sleep(500);

  // ---------- 3. the batch filter ----------
  console.log('« Toutes les notes / Lot 1 / Lot 2 »');
  const opts = await p.eval(`return [...document.querySelectorAll('#lotF option')].map((o) => o.value + '=' + o.textContent)`);
  check(opts.join('|') === 'all=Toutes les notes (5)|1=Lot 1 · 3 notes|2=Lot 2 · 2 notes', `the menu: ${opts.join(' | ')}`);
  const pick = async (v) => { await p.eval(`const s = document.querySelector('#lotF'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); return 1`); await sleep(400); };
  await pick('2');
  c = await cards();
  let s = await p.eval(`return __studio.state()`);
  const count = await p.eval(`return document.querySelector('#count').textContent`);
  check(c.map((x) => x.id).join() === 'd,e' && s.lotf === 2, `Lot 2: its notes only in the list (${c.map((x) => x.id).join(' ')}) · « ${count} »`);
  check([...s.tl].sort().join() === 'd,e,x', `… and on the timeline, with the note not sent yet (${[...s.tl].sort().join(' ')})`);
  await open();
  s = await p.eval(`return __studio.state()`); c = await cards();
  check(s.lotf === 2 && c.map((x) => x.id).join() === 'd,e', `kept when the page loads again (${s.lotf})`);
  const okBtn = await p.eval(`const b = document.querySelector('#lotOk'); return getComputedStyle(b).display !== 'none' && b.textContent.trim()`);
  await p.eval(`document.querySelector('#lotOk').click(); return 1`); await sleep(800);
  c = await cards();
  check(okBtn === 'Tout valider (1)', `« ${okBtn} » on lot 2 (its one fixed note)`);
  check(by('d')?.st === 'ok' && by('e')?.st === 'todo' && notesFile().d === 'verified' && notesFile().b !== 'verified', `its fixed notes validated, its red one and lot 1 untouched (d ${by('d')?.st}, e ${by('e')?.st}, b ${notesFile().b})`);
  await p.eval(`document.querySelector('#ltabs button[data-tab="lots"]').click(); return 1`); await sleep(400);
  await p.eval(`const l = [...document.querySelectorAll('#lots .lot')].find((x) => x.querySelector('.lh b')?.textContent === 'Lot 1'); l?.querySelector('.go').click(); return !!l`); await sleep(500);
  s = await p.eval(`return __studio.state()`); c = await cards();
  check(s.lotf === 1 && c.map((x) => x.id).join() === 'a,b,c', `« Voir les notes » of lot 1 (Envois): lot 1 chosen (${c.map((x) => x.id).join(' ')})`);
  await pick('all');
  s = await p.eval(`return __studio.state()`);
  check([...s.tl].sort().join() === 'a,b,c,d,e,x', `« Toutes les notes »: all of them again (${[...s.tl].sort().join(' ')})`);
  await p.shot(path.join(SCR, 'notes.png'));
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally { await p?.close().catch(() => {}); kill(st); kill(hub); }
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
