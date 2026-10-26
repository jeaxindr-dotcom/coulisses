// Contrats HTTP de l'aperçu : studio et projet privés sous .cache, aucun navigateur.
// --baseline exécute les routes, le constructeur et le mixeur de 10633a9 avec la même épreuve.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {remotionModules, skip} from './where.mjs';
import {requireSandbox} from './cdp.mjs';
import {waitForRenderIdle} from '../lib/render-activity.mjs';
const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.argv.includes('--baseline'), label = baseline ? 'reference' : 'corrige';
const SCR = path.join(STUDIO, '.cache', 'preview-server-regressions', label);
const PROJECT = path.join(SCR, 'projet'), RUN = path.join(SCR, 'film');
const MODULES = remotionModules(); if (!MODULES) skip('dépendances Remotion absentes', 'COULISSES_TEST_REMOTION');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0, server = null, output = '', base = '';
const results = [], guards = [];
const check = (yes, name, evidence = null) => {yes ? ok++ : ko++; results.push({nom: name, reussi: !!yes, preuve: evidence}); console.log(`  ${yes ? '✓' : '✗'} ${name}`);};
const guard = async () => {await waitForRenderIdle(); guards.push({date: new Date().toISOString(), actif: false});};
const write = (file, text) => {fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text);};
const inside = (file) => path.resolve(file).startsWith(path.resolve(SCR) + path.sep);
const status = async () => (await fetch(`${base}/api/status`, {signal: AbortSignal.timeout(5000)})).json();
const wait = async (fn, timeout = 45000) => {const start = Date.now(); for (;;) {const value = await fn(); if (value) return value; if (Date.now() - start > timeout) throw new Error('Délai du scénario HTTP dépassé'); await sleep(150);}};
const post = async (payload) => {const response = await fetch(`${base}/api/preview-lease`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}); return {status: response.status, data: await response.json().catch(() => null)};};
const get = async (url) => {const response = await fetch(new URL(url, base), {signal: AbortSignal.timeout(8000)}); return {status: response.status, type: response.headers.get('content-type'), body: Buffer.from(await response.arrayBuffer())};};
const component = (label) => `import React from 'react'; import './style.css'; import image from './image.svg';
export const compositions=[{id:'PROTOCOLE',fps:30,width:320,height:180,durationInFrames:30,component:()=> <div className="capture"><img src={image}/>${label}</div>}];`;
const timeline = (master = false) => `export const timeline=()=>({fps:30,durationInFrames:30,${master ? "reviewAudio:{src:'son.wav',offsetFrames:0,volume:0.25}," : ''}pistes:[{id:'son',nom:'Voix descriptive',type:'audio',clips:[{de:0,a:30,label:'Voix',son:'son.wav'}]}]});`;
const page = async (version) => {
  const response = await get(`/player.html?v=${version}`), html = response.body.toString();
  const release = /window\.__COULISSES_PREVIEW_RELEASE__\s*=\s*({[^;]+});/.exec(html);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  return {status: response.status, html, release: release ? JSON.parse(release[1]) : null,
    js: scripts.find((s) => s.includes('/player-assets/')) ?? scripts.find((s) => s.startsWith('/player.js')) ?? `/player.js?v=${version}`,
    css: /<link[^>]+href="([^"]+)"/.exec(html)?.[1] ?? null};
};
try {
  await guard();
  if (!SCR.startsWith(path.join(STUDIO, '.cache') + path.sep)) throw new Error('Bac à sable invalide');
  const nm = path.join(PROJECT, 'node_modules');
  if (fs.existsSync(nm)) fs.rmSync(nm); // jonction retirée avant le dossier privé
  fs.rmSync(SCR, {recursive: true, force: true}); fs.mkdirSync(PROJECT, {recursive: true});
  fs.symlinkSync(MODULES, nm, 'junction');
  write(path.join(PROJECT, 'package.json'), '{"private":true}');
  write(path.join(PROJECT, 'src', 'coulisses.tsx'), component('VERSION_UNE'));
  write(path.join(PROJECT, 'src', 'style.css'), '.capture{color:rgb(255,0,0)}');
  write(path.join(PROJECT, 'src', 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="red" d="M0 0h2v2H0z"/></svg>');
  write(path.join(PROJECT, 'src', 'index.ts'), "import {registerRoot} from 'remotion'; import React from 'react'; registerRoot(()=>null);");
  write(path.join(PROJECT, 'src', 'timeline.ts'), timeline());
  // PCM silencieux synthétique ; aucune sortie sonore ni ffmpeg pour fabriquer la fixture.
  const wav = Buffer.alloc(44 + 16000 * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  write(path.join(PROJECT, 'public', 'son.wav'), wav);
  write(path.join(RUN, 'essai.coulisses'), JSON.stringify({coulisses: 1, titre: 'Régression HTTP aperçu', chaine: 'Essai privé', format: '16:9',
    remotion: {projet: '../projet', entree: 'src/index.ts', module: 'src/coulisses.tsx', timeline: 'src/timeline.ts', composition: 'PROTOCOLE'}, revue: 'revue', export: {dossier: 'rendus'}}));
  process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json'); process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json');
  process.env.COULISSES_MEDIAS = path.join(SCR, 'medias'); process.env.COULISSES_HISTORY_DIR = path.join(SCR, 'historique'); process.env.COULISSES_LANG = 'fr';
  delete process.env.COULISSES_REVIEW_SOUND;
  write(process.env.COULISSES_SETTINGS, '{"lang":"fr","mediasAutoSort":false}');
  const {importProject} = await import('../lib/projects.mjs'); const project = importProject(RUN);
  if (!inside(project.revue)) throw new Error('Import sorti du bac à sable');
  let entry = path.join(STUDIO, 'studio-server.mjs');
  if (baseline) {
    const runtime = path.join(SCR, 'reference-runtime');
    const old = (file) => execFileSync('git', ['show', `10633a9:${file}`], {cwd: STUDIO, encoding: 'utf8'});
    const imports = (source) => source.replace(/(['"])\.\/lib\/([^'"]+)\1/g, (_all, q, file) => JSON.stringify(pathToFileURL(path.join(['player-build.mjs', 'review-sound.mjs'].includes(file) ? runtime : STUDIO, 'lib', file)).href));
    for (const name of ['player-build.mjs', 'review-sound.mjs']) {
      let source = old(`lib/${name}`).replace(/(['"])\.\/([^'"]+)\1/g, (_all, q, file) => JSON.stringify(pathToFileURL(path.join(STUDIO, 'lib', file)).href));
      source = source.replace("const STUDIO = path.resolve(HERE, '..');", `const STUDIO = ${JSON.stringify(STUDIO)};`);
      write(path.join(runtime, 'lib', name), source);
    }
    write(path.join(runtime, 'player', 'player.html'), old('player/player.html'));
    entry = path.join(runtime, 'studio-server.mjs');
    write(entry, imports(old('studio-server.mjs')));
  }
  let port;
  for (const candidate of [4188, 4187, 4190, 4191, 4184, 4185]) {
    const free = await new Promise((resolve) => {const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(candidate, '127.0.0.1', () => s.close(() => resolve(true)));});
    if (free) {port = candidate; break;}
  }
  if (!port) throw new Error('Aucun port autorisé libre');
  await guard();
  server = spawn(process.execPath, [entry, '--project', project.revue, '--no-open', '--port', String(port)], {cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  server.stdout.on('data', (d) => {output += d;}); server.stderr.on('data', (d) => {output += d;});
  await wait(() => {if (server.exitCode !== null) throw new Error(`Le serveur a quitté : ${output}`); return /Ouvre : http:\/\/127/.test(output);});
  const actual = +/Ouvre : http:\/\/127\.0\.0\.1:(\d+)/.exec(output)[1];
  if (actual !== port) throw new Error('Le serveur a changé de port ; aucune requête mutante envoyée');
  base = `http://127.0.0.1:${port}`; await requireSandbox(base, SCR);
  const first = await wait(async () => {const s = await status(); if (s.code?.status === 'error') throw new Error(s.code.error); return s.code?.status === 'ready' && s.timeline?.status === 'ready' ? s : null;});
  const version1 = first.code.version, firstPage = await page(version1), js1 = await get(firstPage.js), css1 = firstPage.css ? await get(firstPage.css) : null;
  check(firstPage.status === 200 && firstPage.release?.version === version1, 'HTML annonce la version réellement servie');
  check(js1.status === 200 && js1.body.includes('VERSION_UNE'), 'Le premier bundle correspond à la première composition');
  check(css1?.status === 200 && /text\/css/.test(css1.type) && /255|red|#f00/.test(css1.body.toString()), 'La feuille CSS de cette génération est servie');
  check(first.reviewSound?.state === 'none' && first.reviewSound.why === 'no-master', 'Une frise descriptive ne devient pas un master audio implicite', first.reviewSound);
  const lease = await post({hash: firstPage.release?.hash ?? 'inconnu', owner: 'http-regression'});
  check(lease.status === 200 && lease.data?.ok === true, 'Le serveur retient la génération déclarée par l’iframe');
  const change = async (file, body) => {
    await guard(); const previous = (await status()).code.version; write(file, body);
    try {return await wait(async () => {const s = await status(); if (s.code?.status === 'error') throw new Error(s.code.error); return s.code?.status === 'ready' && s.code.version > previous ? s : null;}, baseline ? 2500 : 45000);}
    catch (e) {if (baseline) return status(); throw e;} // L'ancien observateur ignore le CSS/SVG : le constater puis poursuivre les autres assertions.
  };
  const second = await change(path.join(PROJECT, 'src', 'style.css'), '.capture{color:rgb(0,0,255)}');
  const secondPage = await page(second.code.version), css2 = secondPage.css ? await get(secondPage.css) : null;
  check(secondPage.release?.hash !== firstPage.release?.hash && css2?.status === 200 && !css2.body.equals(css1?.body ?? Buffer.alloc(0)), 'Une modification CSS publie une nouvelle ressource cohérente');
  check((await get(firstPage.js)).body.equals(js1.body) && (!css1 || (await get(firstPage.css)).body.equals(css1.body)), 'La première version JS/CSS reste identique après publication');
  const third = await change(path.join(PROJECT, 'src', 'coulisses.tsx'), component('VERSION_DEUX'));
  const thirdPage = await page(third.code.version), js3 = await get(thirdPage.js);
  check(js3.body.includes('VERSION_DEUX') && (await get(firstPage.js)).body.equals(js1.body), 'Les variantes JSX coexistent sans changer le JS de la première');
  await change(path.join(PROJECT, 'src', 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="green" d="M0 0h2v2H0z"/></svg>');
  check((await get(`/player.html?v=${version1}`)).status === 200 && (await get(firstPage.js)).body.equals(js1.body), 'Le bail conserve une version plus ancienne que les trois dernières');
  check((await get('/player.html?v=999999')).status === 410 && (await get('/player.js?v=999999')).status >= 400, 'Une version inconnue est refusée au lieu de servir silencieusement la dernière');
  const invalid = await post({hash: firstPage.release?.hash, owner: '../invalide'});
  check(invalid.status === 400, 'Un identifiant de bail invalide est refusé');
  await post({owner: 'http-regression', release: true});
  await post({owner: `bootstrap-${firstPage.release?.hash ?? 'inconnu'}`, release: true});
  check((await get(`/player.html?v=${version1}`)).status === 410, 'Une ancienne version libérée est collectée');
  await guard(); write(path.join(PROJECT, 'src', 'timeline.ts'), timeline(true));
  const master = await wait(async () => {const s = await status(); return s.reviewSound?.state === 'ready' ? s.reviewSound : null;});
  const audio = await get(`/api/review-sound/${master.sig}.m4a`);
  check(audio.status === 200 && audio.body.length > 50, 'Un master explicitement déclaré devient disponible sans navigateur');
  await guard(); write(path.join(PROJECT, 'src', 'timeline.ts'), timeline(false));
  const native = await wait(async () => {const s = await status(); return s.reviewSound?.state === 'none' && s.reviewSound.why === 'no-master' ? s.reviewSound : null;}, baseline ? 1500 : 45000).catch(() => null);
  check(native?.why === 'no-master', 'Retirer la déclaration du master restitue le son natif');
} catch (e) {
  ko++; results.push({nom: 'Exécution HTTP', reussi: false, preuve: e.stack}); console.error(`  ✗ ERREUR ${e.stack}`);
} finally {
  if (server && server.exitCode === null) {
    // Uniquement le processus enfant créé par cette suite ; aucun studio existant n'est piloté.
    server.kill(); await Promise.race([new Promise((r) => server.once('exit', r)), sleep(3000)]);
  }
  fs.mkdirSync(SCR, {recursive: true}); write(path.join(SCR, 'serveur.log'), output);
  write(path.join(SCR, 'resultats.json'), JSON.stringify({baseline, base, guards, results, ok, ko}, null, 2));
}
console.log(`${ok} ok, ${ko} ko`); process.exitCode = ko ? 1 : 0;
