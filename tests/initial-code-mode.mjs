// Exécute le véritable branchement initial : aucun navigateur ni serveur.
// --baseline rejoue 10633a9 pour montrer la sélection MP4 erronée.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root = new URL('../', import.meta.url), file = 'page/studio/10-start.js';
const source = process.argv.includes('--baseline')
  ? execFileSync('git', ['show', `10633a9:${file}`], {cwd: root, encoding: 'utf8'})
  : fs.readFileSync(new URL(file, root), 'utf8');
const start = source.indexOf('      if (!META.render && META.features?.code)'), fallback = source.indexOf('      v.src = META.proxy', start);
assert.ok(start >= 0 && fallback > start, 'Branchement initial introuvable');
const code = source.slice(start, source.indexOf('\n', fallback));
const element = (...initial) => {
  const names = new Set(initial);
  return {classList: {add: (...xs) => xs.forEach((x) => names.add(x)), remove: (...xs) => xs.forEach((x) => names.delete(x)), contains: (x) => names.has(x)}};
};
function run(meta) {
  let loads = 0;
  const buttons = {'#srcVideo': element('on'), '#srcCode': element(), '#bSrc': element()};
  const c = {META: meta, mode: 'video', media: element(), proxyTxt: {textContent: 'Préparation de la copie'}, v: {src: ''},
    $: (id) => buttons[id], loadCode: () => loads++};
  vm.runInNewContext(`(function () {${code}\n})();`, c);
  return {...c, buttons, loads};
}
const cases = [
  ['Sans export, le mode Code est sélectionné dans tous les contrôles', () => {
    const f = run({render: null, features: {code: true}, proxy: 'missing'});
    assert.equal(f.mode, 'code'); assert.equal(f.media.classList.contains('code'), true);
    assert.equal(f.buttons['#srcVideo'].classList.contains('on'), false, 'MP4 rendu reste sélectionné');
    assert.equal(f.buttons['#srcCode'].classList.contains('on'), true, 'Code actuel doit être sélectionné');
    assert.equal(f.buttons['#bSrc'].classList.contains('on'), true, 'Le bouton de source doit indiquer Code');
    assert.equal(f.loads, 1); assert.equal(f.v.src, ''); assert.equal(f.proxyTxt.textContent, '');
  }],
  ['Avec un export, la sélection MP4 et sa source sont conservées', () => {
    const f = run({render: {size: 123}, features: {code: true}, proxy: 'ready'});
    assert.equal(f.mode, 'video'); assert.equal(f.buttons['#srcVideo'].classList.contains('on'), true);
    assert.equal(f.buttons['#srcCode'].classList.contains('on'), false); assert.equal(f.loads, 0);
    assert.equal(f.v.src, '/video/revue');
  }],
  ['Sans moteur de code, le branchement ne crée pas de Player', () => {
    const f = run({render: null, features: {code: false}, proxy: 'missing'});
    assert.equal(f.mode, 'video'); assert.equal(f.media.classList.contains('code'), false); assert.equal(f.loads, 0);
  }],
];
let ok = 0, ko = 0;
for (const [name, fn] of cases) {try {fn(); console.log(`✓ ${name}`); ok++;} catch (e) {console.error(`✗ ${name}\n  ${e.message}`); ko++;}}
console.log(`${ok} ok, ${ko} ko`); process.exitCode = ko ? 1 : 0;
