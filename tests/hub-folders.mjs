// The home screen's « Chercher les .coulisses » and its folders (user request, 08/10/2026: « scanner tous les .coulisses du
// PC, soit le PC entier, soit un dossier choisi, pour les importer » · « ranger les .coulisses par dossier »), on .coulisses
// files made here for the sample project of tests/coulisses-fixture.mjs (nothing real is touched):
//   1. the search: every .coulisses under a folder, never in node_modules nor a hidden folder nor through a junction; a
//      broken one is shown with its problem; what is listed already is marked;
//   2. importing what is ticked; the projects land in their channel's folder;
//   3. a project moved to another folder, a new folder, « Sans dossier », back to its channel's; a folder renamed (the
//      channel's next projects follow);
//   4. the page: one section per folder, a folder folded, « Ranger », the search window.
// usage: node tests/hub-folders.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'hub-folders-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
process.env.COULISSES_LANG = 'fr';
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json');
process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json');
const { makeFixture, PROJET } = await import('./coulisses-fixture.mjs');
const PORT = 4199, H = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));   // COULISSES_TEST_SLOW=2: a slower PC
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const get = async (u) => (await fetch(H + u, { cache: 'no-store' })).json();
const post = async (u, b = {}) => (await fetch(H + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
const CLI = path.join(STUDIO, 'studio-cli.mjs');
const creer = (dossier, titre, chaine) => { const spec = path.join(SCR, `spec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`); fs.writeFileSync(spec, JSON.stringify({ dossier, titre, chaine, format: '16:9', projet: PROJET, composition: 'ESSAI-2026-10-07' })); return spawnSync(process.execPath, [CLI, 'projet', 'creer', '--depuis', spec], { encoding: 'utf8', env: process.env }).stdout.trim(); };
let hub = null, p = null;
try {
  makeFixture();
  const TREE = path.join(SCR, 'arbre');
  const a = creer(path.join(TREE, 'chaine-a', 'run1'), 'Run A1', 'Chaîne A');
  const a2 = creer(path.join(TREE, 'chaine-a', 'run2'), 'Run A2', 'Chaîne A');
  const b = creer(path.join(TREE, 'chaine-b', 'x', 'y'), 'Run B1', 'Chaîne B');
  creer(path.join(TREE, 'node_modules', 'pkg'), 'Caché node_modules', 'Chaîne A');
  creer(path.join(TREE, '.cache', 'z'), 'Caché .cache', 'Chaîne A');
  fs.writeFileSync(path.join(TREE, 'chaine-b', 'casse.coulisses'), '{ pas du json');
  fs.symlinkSync(path.join(TREE, 'chaine-a'), path.join(TREE, 'jonction'), 'junction');   // never followed (no double)
  hub = spawn(process.execPath, [path.join(STUDIO, 'hub-server.mjs'), '--port', String(PORT)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; hub.stdout.on('data', (d) => { out += d; }); hub.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 80 && !/HUB_READY/.test(out); i++) await sleep(250);

  // ---------- 1. the search ----------
  console.log('la recherche');
  let r = await post('/api/scan', { where: 'folder', path: TREE });
  check(r.ok && r.state === 'running', 'a search starts on a folder');
  let st; for (let i = 0; i < 80; i++) { await sleep(250); st = await get('/api/scan'); if (st.state !== 'running') break; }
  const titles = st.found.map((f) => f.title).sort((x, y) => x.localeCompare(y));
  check(st.state === 'done' && titles.join('|') === 'casse|Run A1|Run A2|Run B1', `it finds the .coulisses (${titles.join(', ')}), never in node_modules, .cache nor through a junction`);
  const broken = st.found.find((f) => f.title === 'casse');
  check(broken.problems && broken.why && broken.importable === false, `a broken one says why (« ${broken.why} »)`);
  check(st.found.filter((f) => f.title !== 'casse').every((f) => !f.imported && f.importable && f.channel), 'the others are new, importable, with their channel');
  check(!(await post('/api/scan', { where: 'folder', path: path.join(SCR, 'nulle-part') })).ok, 'a folder that does not exist is refused');

  // ---------- 2. importing ----------
  console.log('l\'import');
  r = await post('/api/import/many', { files: [a, a2, b] });
  check(r.ok && r.results.every((x) => x.ok), 'the files ticked are imported');
  let list = await get('/api/episodes');
  const byTitle = (t) => list.projects.find((x) => x.title === t);
  check(byTitle('Run A1')?.folder === 'Chaîne A' && byTitle('Run A2')?.folder === 'Chaîne A' && byTitle('Run B1')?.folder === 'Chaîne B', 'each project lands in its channel\'s folder');
  r = await post('/api/scan', { where: 'folder', path: TREE }); for (let i = 0; i < 80; i++) { await sleep(250); st = await get('/api/scan'); if (st.state !== 'running') break; }
  check(st.found.filter((f) => f.title.startsWith('Run')).every((f) => f.imported), 'searched again: they are « déjà dans Coulisses »');

  // ---------- 3. folders ----------
  console.log('les dossiers');
  await post('/api/folder', { ids: [byTitle('Run A2').id], folder: 'Essais' });
  list = await get('/api/episodes');
  check(byTitle('Run A2').folder === 'Essais' && byTitle('Run A1').folder === 'Chaîne A', 'a project moved to a new folder');
  await post('/api/folder', { ids: [byTitle('Run A2').id], folder: '' }); list = await get('/api/episodes');
  check(byTitle('Run A2').folder === null, '« Sans dossier »');
  await post('/api/folder', { ids: [byTitle('Run A2').id], folder: null }); list = await get('/api/episodes');
  check(byTitle('Run A2').folder === 'Chaîne A', 'back to its channel\'s folder');
  await post('/api/folder/rename', { from: 'Chaîne A', to: 'Ma chaîne A' }); list = await get('/api/episodes');
  check(byTitle('Run A1').folder === 'Ma chaîne A' && byTitle('Run A2').folder === 'Ma chaîne A', 'a folder renamed');
  const a3 = creer(path.join(TREE, 'chaine-a', 'run3'), 'Run A3', 'Chaîne A');
  await post('/api/import/many', { files: [a3] }); list = await get('/api/episodes');
  check(byTitle('Run A3')?.folder === 'Ma chaîne A', 'the channel\'s next project goes to the renamed folder');
  const e03 = list.episodes.find((x) => x.id === 'E03');
  if (e03) { await post('/api/folder', { ids: ['E03'], folder: 'Essais' }); list = await get('/api/episodes'); check(list.episodes.find((x) => x.id === 'E03').folder === 'Essais', 'an episode of the theatre can be filed too'); await post('/api/folder', { ids: ['E03'], folder: null }); }

  // ---------- 4. the page ----------
  console.log('la page');
  p = await launch({ port: 9380 });
  await p.goto(H + '/');
  await p.until(`document.querySelectorAll('#folders section.folder').length >= 2`, 20000); await sleep(600);
  const secs = await p.eval(`return [...document.querySelectorAll('#folders section.folder')].map((s) => [s.querySelector('.fname').textContent, s.querySelectorAll('.card').length])`);
  check(secs.some(([n, k]) => n === 'Ma chaîne A' && k === 3) && secs.some(([n, k]) => n === 'Chaîne B' && k === 1), `one section per folder (${secs.map(([n, k]) => `${n} ${k}`).join(' · ')})`);
  await p.eval(`[...document.querySelectorAll('#folders section.folder')].find((s) => s.querySelector('.fname').textContent === 'Chaîne B').querySelector('.caret').click(); return 1`); await sleep(300);
  check(await p.eval(`return [...document.querySelectorAll('#folders section.folder')].find((s) => s.querySelector('.fname').textContent === 'Chaîne B').classList.contains('closed') && JSON.parse(localStorage.getItem('hub.closed')).includes('Chaîne B')`), 'a folder folds, and stays folded');
  const idB = byTitle('Run B1').id;
  await p.eval(`document.querySelector('.card[data-id="${idB}"] .fold').click(); return 1`); await sleep(300);
  const menu = await p.eval(`return [...document.querySelectorAll('.fmenu button')].map((b) => b.textContent)`);
  check(menu.some((t) => /Ma chaîne A/.test(t)) && menu.some((t) => /Nouveau dossier/.test(t)) && menu.some((t) => /Sans dossier/.test(t)) && menu.some((t) => /Dossier de sa chaîne \(Chaîne B\)/.test(t)), `« Ranger »: ${menu.join(' · ')}`);
  await p.eval(`[...document.querySelectorAll('.fmenu button')].find((b) => /Ma chaîne A/.test(b.textContent)).click(); return 1`);
  await p.until(`[...document.querySelectorAll('#folders section.folder')].find((s) => s.querySelector('.fname').textContent === 'Ma chaîne A')?.querySelectorAll('.card').length === 4`, 10000);
  check(true, 'moved from the page: the card is in its new folder');
  await p.shot(path.join(SCR, 'hub-folders-list.png'));
  await p.eval(`document.querySelector('#scanBtn').click(); return 1`); await sleep(800);
  const dlg = await p.eval(`return document.querySelector('.mb-dlg .scan')?.innerText ?? ''`);
  check(/Tout le PC/.test(dlg) && /Un dossier/.test(dlg) && /déjà dans Coulisses/.test(dlg), 'the search window: the whole PC, a folder, and the last search\'s results');
  await p.shot(path.join(SCR, 'hub-folders.png'));
} catch (e) {
  check(false, `erreur : ${e.stack ?? e.message}`);
} finally {
  if (p) await p.close();
  if (hub) { try { execFileSync('taskkill', ['/PID', String(hub.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
