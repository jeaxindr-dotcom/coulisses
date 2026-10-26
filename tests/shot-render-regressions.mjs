// La panne constatée en intégration : Remotion ouvre la page du bundle mais ne
// reçoit pas de réponse de navigation. Exécute la fonction réelle avec le SDK
// simulé ; aucun navigateur, projet réel ou encodage.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseAt = process.argv.indexOf('--baseline');
const source = baseAt < 0 ? fs.readFileSync(path.join(root, 'lib/frames.mjs'), 'utf8')
  : execFileSync('git', ['show', `${process.argv[baseAt + 1]}:lib/frames.mjs`], {cwd: root, encoding: 'utf8'});
const runner = baseAt < 0 ? fs.readFileSync(path.join(root, 'lib/shot-render-run.mjs'), 'utf8')
  : execFileSync('git', ['show', `${process.argv[baseAt + 1]}:lib/shot-render-run.mjs`], {cwd: root, encoding: 'utf8'});
const code = source.slice(source.indexOf('async function renderVideoNow('), source.indexOf('// the size of a composition'));
const navigationError = () => new Error('Visited "http://localhost:3001/index.html" but got no response.');
function fixture(errors = [], gpu = null, closeError = null) {
  const calls = [], events = [], logs = [], initial = {name: 'initial', close: async () => {events.push('fermer initial'); if (closeError) throw closeError;}};
  const st = {serveUrl: 'bundle-immuable', browser: initial}, comp = {width: 1920, height: 1080, fps: 30, durationInFrames: 300};
  const r = {
    openBrowser: async (...args) => {events.push('ouvrir'); return {name: 'nouveau', args, close: async () => events.push('fermer nouveau')};},
    renderMedia: async (opts) => {calls.push(opts); events.push(`rendre ${opts.puppeteerInstance?.name}`); const e = errors[calls.length - 1]; if (e) throw e;},
  };
  const c = {fs: {mkdirSync() {}, rmSync: (out) => events.push(`nettoyer ${out}`)}, path, CHROME: 'chrome-possede', remotionGpu: () => gpu,
    prepare: async (_p, _log, opts) => {events.push(`préparer ${opts?.cacheKey ?? 'défaut'}`); return {r, st, comp, chromiumOptions: {gl: 'angle'}};},
    t: (key) => key};
  vm.runInNewContext(`${code}\nglobalThis.run = renderVideoNow;`, c);
  return {run: () => c.run({remotion: {props: {texte: 'preuve'}}}, 'clip-temporaire.mp4', {scale: 0.5, muted: true, frameRange: [0, 59], cacheKey: 'version-exacte', log: (s) => logs.push(s)}), calls, events, logs, st, comp};
}
let ok = 0, ko = 0;
async function test(name, fn) {try {await fn(); ok++; console.log(`✓ ${name}`);} catch (e) {ko++; console.log(`✗ ${name} : ${e.message}`);}}
await test('Une navigation locale sans réponse redémarre le navigateur possédé et reprend une seule fois', async () => {
  const f = fixture([navigationError()]); await f.run();
  assert.equal(f.calls.length, 2); assert.equal(f.events.filter((s) => s === 'fermer initial').length, 1);
  assert.ok(f.events.indexOf('fermer initial') < f.events.indexOf('ouvrir'));
  assert.ok(f.events.indexOf('nettoyer clip-temporaire.mp4') > f.events.indexOf('fermer initial'));
  assert.ok(f.events.indexOf('nettoyer clip-temporaire.mp4') < f.events.indexOf('ouvrir'));
  assert.equal(f.calls[1].puppeteerInstance.name, 'nouveau'); assert.ok(f.logs.length);
  assert.equal(f.calls[0].concurrency, null); assert.equal(f.calls[1].concurrency, 1);
});
await test('La reprise garde le même bundle, la composition, les propriétés, le format et la plage', async () => {
  const f = fixture([navigationError()]); const result = await f.run();
  const [a, b] = f.calls;
  for (const key of ['serveUrl', 'composition', 'inputProps', 'scale', 'muted', 'frameRange', 'outputLocation']) assert.equal(a[key], b[key], key);
  assert.equal(f.events.filter((s) => s.startsWith('préparer')).length, 1);
  assert.equal(result.width, 960); assert.equal(result.height, 540);
});
await test('Une deuxième navigation impossible est rendue au demandeur sans boucle infinie', async () => {
  const f = fixture([navigationError(), navigationError()]); await assert.rejects(f.run(), /got no response/);
  assert.equal(f.calls.length, 2); assert.equal(f.events.filter((s) => s === 'ouvrir').length, 1);
});
await test('Une fermeture refusée conserve la référence du navigateur pour le nettoyage final et ne reprend pas', async () => {
  const failure = new Error('Fermeture impossible'), f = fixture([navigationError()], null, failure);
  await assert.rejects(f.run(), (e) => e === failure);
  assert.equal(f.st.browser?.name, 'initial'); assert.equal(f.calls.length, 1); assert.ok(!f.events.includes('ouvrir'));
});
await test('Une erreur du code du projet n’est pas masquée ni rejouée', async () => {
  const f = fixture([new Error('ReferenceError: scene is not defined')]); await assert.rejects(f.run(), /scene is not defined/);
  assert.equal(f.calls.length, 1); assert.ok(!f.events.includes('ouvrir'));
});
await test('Une annulation n’est jamais transformée en reprise', async () => {
  const f = fixture([new Error('Render cancelled')]); await assert.rejects(f.run(), /cancelled/);
  assert.equal(f.calls.length, 1); assert.ok(!f.events.includes('ouvrir'));
});
await test('Une URL distante ou un délai générique ne déclenche pas la reprise locale', async () => {
  for (const error of [new Error('Visited "https://exemple.invalid/index.html" but got no response.'), new Error('Navigation timeout of 600000 ms exceeded')]) {
    const f = fixture([error]); await assert.rejects(f.run(), (e) => e === error); assert.equal(f.calls.length, 1);
  }
});
await test('Un rendu réussi ne crée aucune tentative ou fermeture supplémentaire', async () => {
  const f = fixture(); await f.run(); assert.equal(f.calls.length, 1); assert.ok(!f.events.includes('ouvrir')); assert.equal(f.logs.length, 0);
});
await test('Le mode GPU ne transforme pas une panne de navigation en repli d’encodeur', async () => {
  const f = fixture([navigationError()], {hardwareAcceleration: 'required'}); await f.run();
  assert.equal(f.calls.length, 2); assert.ok(f.calls.every((x) => x.hardwareAcceleration === 'required' && x.crf === undefined));
  assert.equal(f.logs.length, 1); assert.equal(f.events.filter((s) => s === 'ouvrir').length, 1);
});
await test('Le mode GPU ne rejoue pas une erreur du projet comme une erreur d’encodage', async () => {
  const f = fixture([new Error('ReferenceError: scene is not defined')], {hardwareAcceleration: 'required'});
  await assert.rejects(f.run(), /scene is not defined/); assert.equal(f.calls.length, 1);
});
await test('Le repli CPU existant reste réservé à une erreur d’encodeur', async () => {
  const f = fixture([new Error('NVENC encoder unavailable')], {hardwareAcceleration: 'required'}); await f.run();
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].crf, 16); assert.ok(!f.events.includes('ouvrir'));
});
for (const phase of ['composition', 'rendu', 'nettoyage initial']) await test(`Le processus de plan ferme son navigateur après échec ${phase} et nettoie après fermeture`, async () => {
  const start = runner.includes('let comp;') ? runner.indexOf('let comp;') : runner.indexOf('const comp = await compositionOf(');
  const body = runner.slice(start, runner.indexOf('const made = probe(tmp);'));
  const events = [], failure = new Error(`échec ${phase}`); let cleanups = 0;
  const c = {P: {}, target: 'cible.mp4', range: null, console: {log() {}}, say() {},
    fs: {existsSync: () => false, rmSync: () => {events.push('nettoyer'); if (phase === 'nettoyage initial' && cleanups++ === 0) throw failure;}},
    compositionOf: async () => {if (phase === 'composition') throw failure; return {width: 1920, height: 1080, fps: 30, durationInFrames: 300};},
    renderVideo: async () => {events.push('rendre'); throw failure;}, closeCode: async () => events.push('fermer')};
  const work = vm.runInNewContext(`(async () => {${body}})()`, c);
  await assert.rejects(work, (e) => e === failure);
  assert.equal(events.filter((s) => s === 'fermer').length, 1);
  if (phase !== 'composition') assert.ok(events.lastIndexOf('nettoyer') > events.indexOf('fermer'));
});
console.log(`${ok} ok, ${ko} ko`); process.exitCode = ko ? 1 : 0;
