// Prépare une copie jetable pour tests/render.mjs. Les MP4 sources sont uniquement
// liés ; fake-steps les remplace par renommage et n'écrit jamais dans leurs octets.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = 'E03 - The Secret Garden';
const flag = process.argv.indexOf('--source');
const source = path.resolve(flag >= 0 ? process.argv[flag + 1] : path.join(root, 'sandbox', '07_Episodes', folder));
const target = path.join(root, '.cache', 'sandbox-test', '07_Episodes', folder);
const inside = (file, parent) => file.toLowerCase().startsWith(parent.toLowerCase() + path.sep);
if (!inside(target, path.join(root, '.cache')) || source === target) throw new Error('Bac de rendu invalide.');
const files = [`${folder}.mp4`, 'revue/video-revue.mp4', 'revue/video-revue.json', 'revue/timeline.json'];
for (const rel of files) if (!fs.statSync(path.join(source, rel)).isFile()) throw new Error(`Source absente : ${rel}`);
fs.mkdirSync(path.join(target, 'revue'), {recursive: true});
for (const rel of [...files, ...fs.readdirSync(path.join(source, 'revue')).filter((f) => /^timeline-v\d+\.json$/.test(f)).map((f) => `revue/${f}`)]) {
  const from = path.join(source, rel), to = path.join(target, rel);
  // Une copie déjà préparée peut contenir un essai en cours : ne jamais l'écraser.
  if (fs.existsSync(to)) continue;
  if (rel.endsWith('.mp4')) fs.linkSync(from, to); else fs.copyFileSync(from, to);
}
for (const [name, value] of [['notes.json', {episode: 'E03', notes: []}], ['replies.json', {notes: {}, lots: {}}]]) {
  const file = path.join(target, 'revue', name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
console.log(`Bac de rendu préparé : ${target}\nSource lue : ${source}`);
