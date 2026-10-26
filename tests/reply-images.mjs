// Régression : les images jointes aux réponses doivent accompagner leur texte dans un lot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lotMarkdown} from '../lib/lots.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, '.cache', 'reply-images-test');
fs.mkdirSync(dir, {recursive: true});
const p = {kind: 'video', EP: dir, REVUE: dir, target: dir, title: 'Réponses en images', videos: []};
const edit = {id: 'note27', k: 27, frame: 30, end: null, time: 1, text: 'Corriger cette lettre', captures: {}, images: [],
  thread: [{text: 'Toujours visible', at: '2026-10-26T02:44:07Z', images: [{file: 'images/lettre.png'}]},
    {text: '', images: ['images/sans-texte.png']}]};
const lot = {lot: 4, sentAt: '2026-10-26T02:45:03Z', fps: 30, edits: [edit]};
let ok = 0, ko = 0;
for (const [name, fn] of [
  ['Le lot conserve le texte et le chemin absolu de chaque image de réponse', () => {
    const md = lotMarkdown(p, lot, 'fr');
    assert.ok(md.includes('Toujours visible'));
    assert.ok(md.includes(path.join(dir, 'images', 'lettre.png')), 'Image de la réponse absente du lot');
  }],
  ['Une réponse uniquement en image reste livrée', () => {
    assert.ok(lotMarkdown(p, lot, 'fr').includes(path.join(dir, 'images', 'sans-texte.png')), 'Image sans texte absente');
  }],
  ['Les lots historiques sans fil restent lisibles', () => {
    assert.ok(lotMarkdown(p, {...lot, edits: [{...edit, thread: undefined}]}, 'fr').includes('Corriger cette lettre'));
  }],
]) {try {fn(); ok++; console.log(`✓ ${name}`);} catch (e) {ko++; console.log(`✗ ${name} : ${e.message}`);}}
console.log(`${ok} ok, ${ko} ko`); process.exitCode = ko ? 1 : 0;
