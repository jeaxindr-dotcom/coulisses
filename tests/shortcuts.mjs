// The usual shortcuts of the studio (user request, 08/10/2026: « ajouter les raccourcis habituels, ctrl + z etc »), on the
// sample project of tests/coulisses-fixture.mjs (nothing real is touched):
//   Ctrl+Z / Ctrl+Y / Ctrl+Maj+Z on the user's own actions (a note added, written, deleted; a staging offset), one step per
//   burst of typing; Suppr without a question (Ctrl+Z brings the note back); Ctrl+S; Ctrl+Entrée sends the queue, and a
//   batch sent is not taken back; the Édition menu shows the step and its key; the home screen's label.
// usage: node tests/shortcuts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'shortcuts-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
process.env.COULISSES_LANG = 'fr';
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json');
process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json');
process.env.COULISSES_MEDIAS = path.join(SCR, 'medias');
const { makeFixture } = await import('./coulisses-fixture.mjs');
const { importProject } = await import('../lib/projects.mjs');
const I = await import('../lib/i18n.mjs');
const PORT = 4195, U = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
let st = null, p = null;
const key = (k, mods = {}) => p.eval(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, ctrlKey: ${!!mods.ctrl}, shiftKey: ${!!mods.shift}, bubbles: true, cancelable: true })); return 1`);
const S = () => p.eval(`return { ...__studio.state(), undo: __undo.state(), save: document.querySelector('#save').textContent, n: document.querySelectorAll('#draftList .card').length }`);
try {
  const file = makeFixture(), imp = importProject(file);
  st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', imp.revue, '--no-open', '--port', String(PORT)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 160 && !/Ouvre : http/.test(out); i++) await sleep(250);
  p = await launch({ port: 9376 });
  await p.goto(U + '/');
  await p.until(`document.querySelector('#code')?.contentWindow?.StudioPlayer?.durationInFrames`, 60000); await sleep(1200);

  // a note added, then undone, then redone
  await key('n'); await sleep(500); await p.eval(`document.activeElement?.blur?.(); return 1`);
  let s = await S();
  check(s.drafts === 1 && s.undo.back === 1, `N adds a note: one step back (« ${s.undo.top} »)`);
  await key('z', { ctrl: true }); await sleep(500); s = await S();
  check(s.drafts === 0 && s.undo.fwd === 1, 'Ctrl+Z: the note is gone');
  await key('y', { ctrl: true }); await sleep(500); s = await S();
  check(s.drafts === 1 && s.undo.back === 1 && s.undo.fwd === 0 && !!(await p.eval('return document.querySelector("#draftList .card.sel") ? 1 : 0')), 'Ctrl+Y: it is back, selected');
  // typing in the note: one step for the burst
  await p.eval(`const ta = document.querySelector('#draftList .card textarea.main'); ta.focus(); for (const t of ['L', 'Le', 'Le t', 'Le titre', 'Le titre plus haut']) { ta.value = t; ta.dispatchEvent(new Event('input', { bubbles: true })); } ta.blur(); return 1`);
  await sleep(600); s = await S();
  check(s.undo.back === 2, `typing in the note: one step for the whole burst (${s.undo.back - 1})`);
  await key('z', { ctrl: true, shift: false }); await sleep(400);
  const txt = await p.eval(`return document.querySelector('#draftList .card textarea.main').value`);
  check(txt === '', `Ctrl+Z takes the words back in one step (« ${txt} »)`);
  await key('z', { ctrl: true, shift: true }); await sleep(400);
  check(await p.eval(`return document.querySelector('#draftList .card textarea.main').value`) === 'Le titre plus haut', 'Ctrl+Maj+Z puts them back');
  // Suppr: no question, Ctrl+Z brings the note back
  let asked = false;
  await p.eval(`window.__asked = false; window.confirm = () => { window.__asked = true; return true; }; return 1`);
  await key('Delete'); await sleep(500); s = await S();
  asked = await p.eval(`return window.__asked`);
  check(s.drafts === 0 && !asked, 'Suppr deletes the note without a question');
  await key('z', { ctrl: true }); await sleep(500); s = await S();
  check(s.drafts === 1 && await p.eval(`return document.querySelector('#draftList .card textarea.main').value`) === 'Le titre plus haut', 'Ctrl+Z: the note is back, with its words');
  // in a text field, Ctrl+Z is the field's own
  const fwd0 = (await S()).undo.fwd;
  await p.eval(`const ta = document.querySelector('#draftList .card textarea.main'); ta.focus(); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); ta.blur(); return 1`); await sleep(300);
  check((await S()).drafts === 1 && (await S()).undo.fwd === fwd0, 'in a text field, Ctrl+Z is left to the field');
  // Ctrl+S
  await key('s', { ctrl: true }); await sleep(700); s = await S();
  const saved = JSON.parse(fs.readFileSync(path.join(imp.revue, 'notes.json'), 'utf8')).notes;
  check(/^Enregistré \d/.test(s.save) && saved.some((n) => n.text === 'Le titre plus haut'), `Ctrl+S saves now (« ${s.save} »)`);
  // the Édition menu
  const [mx, my] = await p.eval(`const r = document.querySelector('#menubar > button[data-menu=edit]').getBoundingClientRect(); return [r.left + 10, r.top + 8]`);
  await p.mouse('mousePressed', mx, my); await p.mouse('mouseReleased', mx, my); await sleep(300);
  const rows = await p.eval(`return [...document.querySelectorAll('.mb-menu .mb-item')].map((r) => ({ id: r.dataset.id, l: r.querySelector('.l').textContent, k: r.querySelector('.k')?.textContent ?? '', off: r.classList.contains('off') }))`);
  await p.key('Escape', 'Escape'); await sleep(100);
  const u = rows.find((r) => r.id === 'undo'), lot = rows.find((r) => r.id === 'undoLot');
  check(u && !u.off && u.k === 'Ctrl+Z' && /^Annuler /.test(u.l) && lot?.off && rows.some((r) => r.id === 'redo' && r.k === 'Ctrl+Y'), `Édition: « ${u?.l} » ${u?.k}, « Rétablir » Ctrl+Y, then the agent's fixes (« ${lot?.l} »)`);
  // a staging offset: undone, redone
  await p.eval(`document.querySelector('#code').contentWindow.StudioPlayer.seek(45); return 1`); await sleep(800);
  await key('m'); await p.until(`__studio.state().staging`, 20000); await sleep(400);
  await p.eval(`document.querySelector('#code').contentWindow.StudioPlayer.stage.select('[data-coulisses="titre s01"]'); return 1`); await sleep(300);
  for (let i = 0; i < 3; i++) { await p.eval(`document.querySelector('#code').contentWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return 1`); await sleep(50); }
  await sleep(900);
  const dx = () => p.eval(`return document.querySelector('#code').contentWindow.StudioPlayer.stage.info('[data-coulisses="titre s01"]').delta.p[0]`);
  const d1 = await dx();
  await key('z', { ctrl: true }); await sleep(400);
  const d0 = await dx();
  await key('y', { ctrl: true }); await sleep(400);
  check(d1 === 3 && d0 === 0 && (await dx()) === 3, `staging: 3 arrows = one step, Ctrl+Z puts the title back (Δx ${d1} → ${d0}), Ctrl+Y moves it again`);
  await key('m'); await sleep(400);
  // Ctrl+Entrée sends the queue; the batch is not taken back
  await key('Enter', { ctrl: true });
  await p.until(`(__studio.state().drafts === 0)`, 120000); await sleep(800); s = await S();
  check(s.drafts === 0 && s.undo.back === 0 && fs.existsSync(path.join(imp.revue, 'lots', '001.md')), 'Ctrl+Entrée sends the queue (lot 001); Ctrl+Z cannot take a batch back');
  // the home screen: one Coulisses for every project
  check(I.t('hub.wherePipeline', {}, 'fr') === 'Version installée · tous tes projets' && !/Brambleshire/.test(I.t('hub.wherePipeline', {}, 'en')), `the home screen's label: « ${I.t('hub.wherePipeline', {}, 'fr')} »`);
} catch (e) {
  check(false, `erreur : ${e.stack ?? e.message}`);
} finally {
  if (p) await p.close();
  if (st) { try { execFileSync('taskkill', ['/PID', String(st.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
