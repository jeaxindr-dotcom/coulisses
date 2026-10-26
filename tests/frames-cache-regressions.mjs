// Signature du bundle de rendu : la préparation réelle, compilateur et navigateur simulés.
// --baseline emploie prepare() de 10633a9 ; aucun projet réel, navigateur ou rendu.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), baseline = process.argv.includes('--baseline');
const source = baseline ? execFileSync('git', ['show', '10633a9:lib/frames.mjs'], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'lib', 'frames.mjs'), 'utf8');
const code = source.slice(source.indexOf('async function prepare('), source.indexOf('export async function closeCode()'));
const cache = fs.mkdtempSync(path.join(root, '.cache', 'frames-signature-'));
const builds = [], states = new Map();
let ok = 0, ko = 0;
const check = (v, nom) => { v ? ok++ : ko++; console.log(`  ${v ? '✓' : '✗'} ${nom}`); };
const context = {
  fs, path, crypto, CACHE: cache, codeState: states, CHROME: 'aucun-navigateur', process,
  srcSignature: () => 'date-identique-compte-identique', touch() {}, sweepBundles() {}, cacheReadme() {}, t: (x) => x,
  remotionApis: async () => ({
    bundle: async (opts) => { builds.push(opts); fs.mkdirSync(path.join(opts.outDir, 'public'), { recursive: true }); },
    r: { openBrowser: async () => ({}), selectComposition: async () => ({ id: 'TEST' }) },
  }),
};
vm.runInNewContext(code + '\nglobalThis.prepareTest = prepare;', context);
const project = { remotionDir: path.join(cache, 'projet'), remotion: { entree: path.join(cache, 'src', 'index.ts'), composition: 'TEST' } };
try {
  await context.prepareTest(project, () => {}, { cacheKey: 'hash-a:media-a' });
  const initial = states.get(project.remotionDir).serveUrl;
  await context.prepareTest(project, () => {}, { cacheKey: 'hash-a:media-a' });
  check(builds.length === 1, 'La même signature réutilise son bundle');
  await context.prepareTest(project, () => {}, { cacheKey: 'hash-b:media-a' });
  check(builds.length === 2 && states.get(project.remotionDir).serveUrl !== initial, 'Un nouveau hash recompile malgré des dates et comptes de fichiers identiques');
  await context.prepareTest(project, () => {}, { cacheKey: 'hash-b:media-b' });
  check(builds.length === 3, 'Une modification des médias invalide aussi le bundle');
  check(builds.every((x) => x.enableCaching === false), 'Aucun cache de compilation n’est écrit dans le projet pour les plages');
  check(states.get(project.remotionDir).sig === 'code-playback:hash-b:media-b', 'La signature complète est conservée avec le bundle');
} finally {
  const resolved = path.resolve(cache), parent = path.resolve(root, '.cache');
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('frames-signature-')) throw new Error('Nettoyage hors du bac à sable refusé');
  fs.rmSync(resolved, { recursive: true, force: true });
}
console.log(`${ok} ok, ${ko} ko`); process.exitCode = ko ? 1 : 0;
