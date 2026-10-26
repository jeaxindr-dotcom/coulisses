// Petits fichiers réels uniquement ; aucun navigateur, rendu ou média de projet.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const atelier = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.indexOf('--module');
const { codePlaybackSources } = await import(pathToFileURL(arg >= 0 ? path.resolve(process.argv[arg + 1]) : path.join(atelier, 'lib/code-playback-sources.mjs')).href);
const cache = path.join(atelier, '.cache'); await fs.mkdir(cache, { recursive: true });
const root = await fs.mkdtemp(path.join(cache, 'code-sources-test-'));
const fixedDate = new Date('2026-01-01T00:00:00.000Z');
const write = async (file, content) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content); await fs.utimes(file, fixedDate, fixedDate); };
const project = { remotionDir: path.join(root, 'moteur'), EP: path.join(root, 'episode'), remotion: { composition: 'A', props: { titre: 'a' } } };
const src = path.join(project.remotionDir, 'src'), pub = path.join(project.remotionDir, 'public');
await fs.mkdir(pub, { recursive: true });
await write(path.join(src, 'Video.tsx'), 'export const couleur="rouge";');
await write(path.join(pub, 'scene.json'), '{"n":1}');
await write(path.join(pub, 'clip.mp4'), Buffer.alloc(80, 1));
await write(path.join(project.EP, 'episode.json'), '{"n":1}');
await write(path.join(project.EP, 'voix.wav'), Buffer.alloc(80, 2));
await write(path.join(project.remotionDir, 'package.json'), '{"name":"essai"}');
let ok = 0, ko = 0;
const test = async (name, run) => { try { await run(); ok++; console.log(`  ✓ ${name}`); } catch (e) { ko++; console.log(`  ✗ ${name} : ${e.message}`); } };
try {
  await test('l’empreinte est stable sans modification', async () => {
    assert.equal(await codePlaybackSources(project), await codePlaybackSources(project));
  });
  await test('modifier le code à taille et date constantes invalide la plage', async () => {
    const file = path.join(src, 'Video.tsx'), before = await codePlaybackSources(project);
    await write(file, 'export const couleur="verte";'); assert.notEqual(await codePlaybackSources(project), before);
  });
  await test('modifier un JSON public à taille et date constantes invalide la plage', async () => {
    const before = await codePlaybackSources(project); await write(path.join(pub, 'scene.json'), '{"n":2}');
    assert.notEqual(await codePlaybackSources(project), before);
  });
  await test('modifier un JSON épisode à taille et date constantes invalide la plage', async () => {
    const before = await codePlaybackSources(project); await write(path.join(project.EP, 'episode.json'), '{"n":2}');
    assert.notEqual(await codePlaybackSources(project), before);
  });
  await test('la taille et la date d’un média invalident chacune la plage', async () => {
    const file = path.join(pub, 'clip.mp4'), before = await codePlaybackSources(project);
    await write(file, Buffer.alloc(81, 1)); const size = await codePlaybackSources(project); assert.notEqual(size, before);
    await fs.utimes(file, fixedDate, new Date(+fixedDate + 1000)); assert.notEqual(await codePlaybackSources(project), size);
  });
  await test('les binaires de public et de l’épisode ne sont jamais lus intégralement', async () => {
    const original = fs.readFile, reads = [];
    fs.readFile = async (file, ...args) => { reads.push(String(file)); return original(file, ...args); };
    try { await codePlaybackSources(project); } finally { fs.readFile = original; }
    assert.equal(reads.some(file => /\.(mp4|wav)$/i.test(file)), false);
    assert.equal(reads.some(file => file.endsWith('Video.tsx')), true);
  });
  await test('limite déclarée : remplacer un binaire à taille et date identiques est indétectable', async () => {
    const file = path.join(project.EP, 'voix.wav'), before = await codePlaybackSources(project);
    await write(file, Buffer.alloc(80, 3)); assert.equal(await codePlaybackSources(project), before);
  });
  await test('composition et propriétés font partie de l’identité', async () => {
    const before = await codePlaybackSources(project);
    assert.notEqual(await codePlaybackSources({ ...project, remotion: { ...project.remotion, composition: 'B' } }), before);
    assert.notEqual(await codePlaybackSources({ ...project, remotion: { ...project.remotion, props: { titre: 'b' } } }), before);
  });
  await test('dépasser le budget des fichiers échoue explicitement', async () => {
    await assert.rejects(codePlaybackSources(project, { limit: 1 }), /Trop de fichiers/);
  });
  await test('un gros texte ne devient jamais une simple empreinte de métadonnées', async () => {
    await assert.rejects(codePlaybackSources(project, { maxFileBytes: 10 }), /trop volumineuses/);
    await assert.rejects(codePlaybackSources(project, { maxContentBytes: 15 }), /trop volumineuses/);
  });
  await test('les caches et dépendances exclus n’invalident pas la plage', async () => {
    const before = await codePlaybackSources(project);
    await write(path.join(src, 'node_modules', 'inutile.js'), 'très grand dans la réalité');
    await write(path.join(project.EP, '.cache', 'sortie.txt'), 'cache');
    assert.equal(await codePlaybackSources(project), before);
  });
  await test('doublons et cycle de jonctions sont bornés et lus une seule fois', async () => {
    const target = path.join(src, 'cible'); await write(path.join(target, 'Scene.tsx'), 'export const f=1;');
    await fs.symlink(target, path.join(src, 'alias-a'), process.platform === 'win32' ? 'junction' : 'dir');
    await fs.symlink(target, path.join(src, 'alias-b'), process.platform === 'win32' ? 'junction' : 'dir');
    await fs.symlink(src, path.join(target, 'cycle'), process.platform === 'win32' ? 'junction' : 'dir');
    const original = fs.readFile, reads = [];
    fs.readFile = async (file, ...args) => { reads.push(String(file)); return original(file, ...args); };
    try { const first = await codePlaybackSources(project, { limit: 50 }); assert.equal(first.length, 64); }
    finally { fs.readFile = original; }
    assert.equal(reads.filter(file => file.endsWith('Scene.tsx')).length, 1);
  });
  await test('renommer un alias change le chemin servi donc l’empreinte', async () => {
    const before = await codePlaybackSources(project);
    await fs.rename(path.join(src, 'alias-a'), path.join(src, 'alias-aa'));
    assert.notEqual(await codePlaybackSources(project), before);
  });
  await test('une jonction imbriquée hors des racines déclarées est refusée', async () => {
    const outside = path.join(root, 'hors-projet'); await write(path.join(outside, 'inconnu.json'), '{}');
    const alias = path.join(src, 'hors-projet'); await fs.symlink(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
    try { await assert.rejects(codePlaybackSources(project), /Jonction hors des sources/); }
    finally { await fs.rm(alias); }
  });
} finally {
  // Vérification explicite avant suppression récursive ; Node ne suit pas les jonctions.
  const absolute = path.resolve(root);
  if (path.dirname(absolute) !== path.resolve(cache) || !path.basename(absolute).startsWith('code-sources-test-')) throw new Error('Nettoyage hors du bac à sable refusé');
  await fs.rm(absolute, { recursive: true, force: true });
}
console.log(`\n${ok} ok, ${ko} ko`); process.exitCode = ko ? 1 : 0;
