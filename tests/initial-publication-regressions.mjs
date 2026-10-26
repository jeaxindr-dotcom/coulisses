// Démarrage avant la première compilation : exécute les fonctions réellement
// livrées, avec des réponses différées du Player, sans navigateur ni serveur.
// --source-root <copie> vérifie un correctif avant son application.
// --source-ref <révision> démontre la régression sur le code antérieur.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (name) => {const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1];};
const sourceRoot = option('--source-root') ?? root, sourceRef = option('--source-ref');
const read = (file) => sourceRef
  ? execFileSync('git', ['show', `${sourceRef}:${file}`], {cwd: root, encoding: 'utf8'})
  : fs.readFileSync(path.join(sourceRoot, file), 'utf8');
const preview = read('page/studio/01-preview.js'), notes = read('page/studio/02-notes.js');
const functions = preview.slice(preview.indexOf('  function loadCode('), preview.indexOf("  // the preview's events")) +
  notes.slice(notes.indexOf('  function onStatus()'), notes.indexOf('  // ---------- notes that follow')) +
  preview.slice(preview.indexOf('  async function setMode('), preview.indexOf("  // a 3D shot of the theatre"));
const defer = () => {let resolve; const promise = new Promise((r) => {resolve = r;}); return {promise, resolve};};
const settle = () => new Promise((r) => setImmediate(r));
function fixture(version = 0) {
  const remotes = [], timers = [], requests = [], messages = [], pauses = [], seeks = [];
  const el = {contentWindow: {}, title: '', hasAttribute: () => false,
    classList: {toggle() {}, remove() {}}, querySelector: () => ({textContent: ''}),
    set src(value) {requests.push(value);}};
  const c = {Promise, Set, String, JSON, Error,
    SP: null, codeVer: -1, codeLoad: null, codeLoading: null, codeFailedVer: null, preparedCode: null,
    STATUS: {code: {version, status: version ? 'ready' : 'building'}}, META: {render: null},
    codeEl: el, window: {}, staging: false, stSel: null, stUnsub: null, mode: 'code', modeWant: null, modeRequest: 0, modeWasPlaying: null,
    vol: 1, rate: 1, RS: {}, crash: null, codeErrEl: el, FRAMES: 300,
    hashFrame: () => 45, curFrame: () => 0, previewUrl: (q) => `http://localhost:4240/player.html?${q}`,
    remotePlayer(win, ver) {
      const ready = defer();
      const player = {version: +ver, durationInFrames: 300, at: 0, disposed: false,
        frame() {return this.at;}, isBuffering: () => false, frameReady: () => true,
        async prepare(f) {this.at = f; return {frame: f, ready: true};},
        dispose() {this.disposed = true; ready.resolve(null);}, setVolume() {}, setRate() {}};
      const remote = {hello: ready.promise, api: player, resolve: () => ready.resolve(player)};
      remotes.push(remote); return remote;
    },
    plain: (x) => x, drafts: () => [], adoptCode() {}, watchPlayer() {}, rsStatus() {}, codeWait() {}, showCodeStatus() {},
    showCodeNote() {}, setSave: (text) => messages.push(text), T: (text) => text, TN: (text) => text, $: () => el,
    followPlans() {}, hhmm: () => '', liveVer: 0, loadLive() {}, renderPill() {}, onHeld() {}, markGo() {},
    M: {paused: false, pause() {pauses.push(1); this.paused = true;}, play() {this.paused = false;}},
    viewPlan: () => null, frameOn: async (f) => f, seekFrame: (f) => seeks.push(f),
    codeWaitEl: el, media: el, pendF: null, cwSeq: 0,
    clearInterval() {}, clearTimeout() {}, setTimeout(fn, ms) {timers.push({fn, ms}); return timers.length;},
  };
  vm.createContext(c); vm.runInContext(functions, c);
  return {c, remotes, timers, requests, messages, pauses, seeks};
}
const cases = [
  ['Avant la première publication, aucune iframe v0 ni attente de 60 secondes', () => {
    const f = fixture(); f.c.loadCode();
    assert.equal(f.remotes.length, 0, 'Une candidate v0 sans bundle est créée');
    assert.equal(f.requests.length, 0); assert.equal(f.c.codeLoading, null); assert.equal(f.c.codeLoad, null);
  }],
  ['La première publication démarre immédiatement, sans nouvel événement de statut', async () => {
    const f = fixture(); f.c.loadCode();
    f.c.STATUS.code = {version: 1, status: 'ready'}; f.c.onStatus();
    assert.equal(f.c.codeLoad?.ver, 1, 'La publication v1 est bloquée derrière la candidate v0');
    const done = f.c.codeLoading; f.remotes.at(-1).resolve(); await done;
    assert.equal(f.c.SP?.version, 1); assert.equal(f.c.SP.frame(), 45); assert.equal(f.c.codeVer, 1);
    assert.equal(f.requests.length, 1); assert.match(f.requests[0], /&v=1$/);
  }],
  ['Une publication plus récente remplace aussi la candidate initiale encore sans réponse', async () => {
    const f = fixture(1), before = f.c.loadCode();
    f.c.STATUS.code = {version: 2, status: 'ready'}; f.c.onStatus();
    assert.equal(f.remotes.length, 2, 'La candidate initiale périmée empêche de préparer v2');
    assert.equal(f.remotes[0].api.disposed, true);
    const current = f.c.codeLoading; f.remotes[1].resolve(); await current;
    f.remotes[0].resolve(); await before;
    assert.equal(f.c.SP?.version, 2); assert.equal(f.c.SP.disposed, false); assert.equal(f.c.codeVer, 2);
    assert.equal(f.requests.filter((url) => url === 'about:blank').length, 0, 'Le retour tardif efface la nouvelle iframe');
  }],
  ['Une erreur de la version courante attend toujours une demande explicite de réessai', () => {
    const f = fixture(1); f.c.codeFailedVer = 1; f.c.onStatus();
    assert.equal(f.remotes.length, 0);
  }],
  ['Un clic Code pendant la compilation conserve le MP4 en lecture, puis bascule à la publication', async () => {
    const f = fixture(); f.c.mode = 'video'; f.c.META.render = {size: 123};
    f.c.setMode('code'); await settle();
    assert.equal(f.c.modeWant, 'code'); assert.equal(f.c.mode, 'video');
    assert.equal(f.pauses.length, 0, 'La compilation interrompt le MP4 avant qu’un aperçu existe');
    assert.equal(f.c.codeLoading, null); assert.equal(f.remotes.length, 0);
    f.c.curFrame = () => 83;
    f.c.STATUS.code = {version: 1, status: 'ready'}; f.c.onStatus();
    assert.equal(f.remotes.length, 1, 'Le clic Code en attente ne reprend pas');
    f.remotes[0].resolve(); await f.c.codeLoading; await settle();
    assert.equal(f.c.mode, 'code'); assert.equal(f.c.modeWant, null); assert.equal(f.c.SP.frame(), 83);
    assert.deepEqual(f.seeks, [83]); assert.equal(f.c.M.paused, false, 'La lecture doit reprendre après la bascule');
  }],
  ['Rechoisir le MP4 annule le clic Code en attente, sans pause ni saut', async () => {
    const f = fixture(); f.c.mode = 'video'; f.c.META.render = {size: 123};
    f.c.setMode('code'); await settle(); await f.c.setMode('video');
    assert.equal(f.c.modeWant, null); assert.equal(f.c.mode, 'video');
    assert.equal(f.pauses.length, 0); assert.equal(f.seeks.length, 0); assert.equal(f.c.M.paused, false);
    f.c.STATUS.code = {version: 1, status: 'ready'}; f.c.onStatus();
    assert.equal(f.remotes.length, 0, 'Une intention annulée démarre un aperçu tardif');
  }],
  ['Une candidate initiale annulée ne retire pas le clic Code destiné à la publication suivante', async () => {
    const f = fixture(1); f.c.mode = 'video'; f.c.META.render = {size: 123};
    const first = f.c.setMode('code');
    f.c.STATUS.code = {version: 2, status: 'ready'}; f.c.onStatus(); await settle();
    assert.equal(f.remotes.length, 2, 'Le passage en mode Code reste attaché à v1');
    assert.equal(f.c.modeWant, 'code', 'La candidate v1 annulée a effacé l’intention plus récente');
    f.remotes[1].resolve(); await f.c.codeLoading; await first; await settle();
    assert.equal(f.c.mode, 'code'); assert.equal(f.c.SP?.version, 2); assert.equal(f.c.modeWant, null);
    assert.equal(f.c.M.paused, false, 'La pause technique de v1 ne doit pas devenir une pause utilisateur dans v2');
  }],
];
let ok = 0, ko = 0;
for (const [name, test] of cases) {try {await test(); ok++; console.log(`✓ ${name}`);} catch (e) {ko++; console.error(`✗ ${name}\n  ${e.message}`);}}
console.log(`${ok} ok, ${ko} ko`); process.exitCode = ko ? 1 : 0;
