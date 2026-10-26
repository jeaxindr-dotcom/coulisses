// « Rendre ce plan » (user request, 09/10/2026), on the sample project of tests/coulisses-fixture.mjs as the « shot » and a
// « Short » made here (nothing real is touched): its clip public\mg\plan.mp4 is 2 s, 960 × 540, without sound.
//   1. the shot's card: « Rendre ce plan », what it is (the Short, the file);
//   2. the render: the clip made again from the code, in the clip's format (960 × 540 = scale 0.5, no sound), put in
//      place, the old one kept in revue\shot-backups; the card says it;
//   3. « Remettre la version d'avant »: the old clip back; « Afficher dans l'Explorateur »: the clip, selected;
//   4. a render stopped: the clip untouched, no temporary file left; /api/rebuild answers (the Short's preview).
// usage: node tests/shot-render.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, requireSandbox } from './cdp.mjs';
import { freePort } from './where.mjs';
import { waitForRenderIdle } from '../lib/render-activity.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'shot-render-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
process.env.COULISSES_LANG = 'fr';
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json');
process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json');
process.env.COULISSES_MEDIAS = path.join(SCR, 'medias');
const EXPLORER = path.join(SCR, 'explorer.log');
const { makeFixture, PROJET } = await import('./coulisses-fixture.mjs');
const { importProject } = await import('../lib/projects.mjs');
const PORT = await freePort(4240);
let U = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const probe = (f) => { try { const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', f], { encoding: 'utf8' })); const v = j.streams.find((s) => s.codec_type === 'video'); return { w: v?.width, h: v?.height, audio: j.streams.some((s) => s.codec_type === 'audio'), d: +j.format.duration }; } catch { return null; } };
let st = null, p = null, serverOutput = '', sandboxChecked = false;
const injectNavigationFailure = process.argv.includes('--navigation-failure');
await waitForRenderIdle();
try {
  makeFixture();
  if (injectNavigationFailure) {
    // Injection limitée au processus d'essai du plan : aucun fichier du SDK ni
    // du projet réel n'est modifié. Rejoue exactement l'erreur observée au rendu.
    const preload = path.join(SCR, 'navigation-failure.mjs');
    fs.writeFileSync(preload, `import path from 'node:path';
import {createRequire} from 'node:module';
if (process.argv[1]?.endsWith('shot-render-run.mjs')) {
  const require = createRequire(${JSON.stringify(path.join(PROJET, 'package.json'))});
  const file = path.join(path.dirname(require.resolve('@remotion/renderer/package.json')), 'dist', 'render-media.js');
  const implementation = require(file), original = implementation.renderMedia;
  let first = true;
  implementation.renderMedia = async (options) => {
    if (first) { first = false; console.log('INJECTION TEST : navigation locale sans réponse'); throw new Error('Visited "http://localhost:3001/index.html" but got no response.'); }
    console.log('INJECTION TEST : véritable rendu après reprise');
    return original(options);
  };
}
`);
    process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--import=${pathToFileURL(preload).href}`].filter(Boolean).join(' ');
  }
  // the « Short »: a Remotion project folder whose public\mg\plan.mp4 the shot becomes
  const SHORT = path.join(SCR, 'short'), CLIP = path.join(SHORT, 'public', 'mg', 'plan.mp4');
  fs.mkdirSync(path.dirname(CLIP), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=960x540:rate=30:duration=2', '-pix_fmt', 'yuv420p', CLIP]);
  const SHORT_FILE = path.join(SHORT, 'Short essai.coulisses');
  fs.writeFileSync(SHORT_FILE, JSON.stringify({ coulisses: 1, titre: 'Short essai', remotion: { projet: '.', composition: 'X' }, revue: 'revue' }, null, 1));
  // the shot: the fixture's composition, used in that Short as public/mg/plan.mp4
  const spec = path.join(SCR, 'spec.json');
  fs.writeFileSync(spec, JSON.stringify({ dossier: path.join(SCR, 'plan'), titre: 'Plan essai', nom: 'Plan essai', chaine: 'Essai', format: '16:9', projet: PROJET, composition: 'ESSAI-2026-10-07', utilise: [{ coulisses: SHORT_FILE, fichier: 'public/mg/plan.mp4' }] }));
  const file = spawnSync(process.execPath, [path.join(STUDIO, 'studio-cli.mjs'), 'projet', 'creer', '--depuis', spec], { encoding: 'utf8', env: process.env }).stdout.trim();
  const shot = importProject(file);
  st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', shot.revue, '--no-open', '--port', String(PORT)], { cwd: STUDIO, env: { ...process.env, COULISSES_EXPLORER_LOG: EXPLORER }, stdio: ['ignore', 'pipe', 'pipe'] });
  st.stdout.on('data', (d) => { serverOutput += d; }); st.stderr.on('data', (d) => { serverOutput += d; });
  for (let i = 0; i < 160 && !/Ouvre : http/.test(serverOutput); i++) await sleep(250);
  U = /Ouvre : (http:\/\/127\.0\.0\.1:\d+)/.exec(serverOutput)?.[1];
  if (!U) throw new Error(`Le studio d’essai ne démarre pas : ${serverOutput}`);
  await requireSandbox(U, SCR);
  sandboxChecked = true;
  p = await launch({ port: await freePort(9391) });
  await p.goto(U + '/');
  await p.until(`window.__studio && document.querySelector('button[data-tab=lots]')`, 60000);
  await p.eval(`window.confirm = () => true; document.querySelector('button[data-tab=lots]').click(); return 1`);
  await p.until(`/Rendre ce plan/.test(document.querySelector('#renderCard')?.innerText ?? '')`, 20000);
  const card0 = await p.eval(`return document.querySelector('#renderCard').innerText`);
  check(/Ce plan est un clip de « Short essai » \(plan\.mp4\)/.test(card0) && !!(await p.eval(`return document.querySelector('.shGo') ? 1 : 0`)), '1. the shot\'s card: « Rendre ce plan », a clip of « Short essai » (plan.mp4)');
  const old = probe(CLIP);
  // ---------- 2. the render ----------
  await p.eval(`document.querySelector('.shGo').click(); return 1`);
  let s = null;
  for (let i = 0; i < 600; i++) { await sleep(500); s = (await (await fetch(U + '/api/status')).json()).shot; if (s && s.state !== 'running') break; }
  if (s?.state !== 'done') {
    console.log(`  Diagnostic du rendu : ${JSON.stringify(s)}\n${fs.existsSync(path.join(shot.revue, 'shot-render.log')) ? fs.readFileSync(path.join(shot.revue, 'shot-render.log'), 'utf8') : '(journal absent)'}`);
    throw new Error(`Rendre ce plan a échoué : ${s?.error ?? s?.state ?? 'aucun état reçu'}`);
  }
  // La vérification d’annulation plus bas remplace le journal du plan : conserver
  // d’abord la trace du véritable rendu terminé pour les diagnostics.
  fs.copyFileSync(path.join(shot.revue, 'shot-render.log'), path.join(SCR, 'shot-render-success.log'));
  const now = probe(CLIP), kept = fs.existsSync(path.join(shot.revue, 'shot-backups')) ? fs.readdirSync(path.join(shot.revue, 'shot-backups')) : [];
  check(s?.state === 'done' && now?.w === 960 && now?.h === 540 && !now.audio && Math.abs(now.d - 10) < 0.2, `2. rendered from the code, in the clip's format (${now?.w} × ${now?.h}, ${now?.audio ? 'with sound' : 'no sound'}, ${now?.d?.toFixed(2)} s: the composition's 300 frames at scale 0.5)`);
  if (injectNavigationFailure) {
    const trace = fs.readFileSync(path.join(shot.revue, 'shot-render.log'), 'utf8');
    check(trace.includes('INJECTION TEST : navigation locale sans réponse') && trace.includes('Navigation du rendu local sans réponse : reprise unique'), 'La panne de navigation réelle du SDK est injectée puis reconnue par le produit');
    check(trace.includes('INJECTION TEST : véritable rendu après reprise') && s?.state === 'done', 'Le véritable encodage et remplacement réussissent après la reprise');
  }
  check(kept.length === 1 && Math.abs(probe(path.join(shot.revue, 'shot-backups', kept[0]))?.d - old.d) < 0.1 && !fs.existsSync(CLIP.replace(/\.mp4$/, '.coulisses-tmp.mp4')), `the old clip kept in revue\\shot-backups (${kept[0]}), no temporary file left`);
  await p.until(`/Plan rendu/.test(document.querySelector('#renderCard').innerText)`, 15000).catch(() => {});
  check(/Plan rendu.*remis dans « Short essai »/.test(await p.eval(`return document.querySelector('#renderCard').innerText`)) && !!(await p.eval(`return document.querySelector('.shUndo') ? 1 : 0`)), 'the card: « Plan rendu … et remis dans « Short essai » », « Remettre la version d\'avant »');
  // ---------- 3. undo, reveal ----------
  await p.eval(`document.querySelector('.shReveal').click(); return 1`); await sleep(500);
  check((fs.existsSync(EXPLORER) ? fs.readFileSync(EXPLORER, 'utf8').trim() : '') === `/select,"${CLIP}"`, '3. « Afficher dans l\'Explorateur »: the clip, selected in its folder');
  await p.eval(`document.querySelector('.shUndo').click(); return 1`);
  for (let i = 0; i < 40 && Math.abs((probe(CLIP)?.d ?? 0) - old.d) > 0.1; i++) await sleep(250);
  check(Math.abs(probe(CLIP)?.d - old.d) < 0.1 && fs.readdirSync(path.join(shot.revue, 'shot-backups')).length === 0, '« Remettre la version d\'avant »: the old clip is back in the Short');
  // ---------- 4. a render stopped ----------
  const before = fs.statSync(CLIP).mtimeMs;
  const r1 = await (await fetch(U + '/api/shot/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"use":0}' })).json();
  await sleep(2500);
  const r2 = await (await fetch(U + '/api/shot/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  await sleep(800);
  s = (await (await fetch(U + '/api/status')).json()).shot;
  check(r1.ok && r2.ok && s?.state === 'stopped' && fs.statSync(CLIP).mtimeMs === before && !fs.existsSync(CLIP.replace(/\.mp4$/, '.coulisses-tmp.mp4')), '4. a render stopped: the clip untouched, no temporary file');
  const rb = await (await fetch(U + '/api/rebuild', { method: 'POST' })).json();
  check(rb.ok, '/api/rebuild answers (the Short\'s studio refreshes its live preview after a shot is made again)');
  await p.shot(path.join(SCR, 'shot-card.png'));
} catch (e) {
  check(false, `erreur : ${e.stack ?? e.message}`);
} finally {
  fs.writeFileSync(path.join(SCR, 'server.log'), serverOutput);
  if (sandboxChecked) try {
    const state = (await (await fetch(U + '/api/status')).json()).shot;
    if (state?.state === 'running') await fetch(U + '/api/shot/stop', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
  } catch { /* Notre studio d’essai est déjà fermé. */ }
  if (p) await p.close();
  if (st) { try { execFileSync('taskkill', ['/PID', String(st.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
