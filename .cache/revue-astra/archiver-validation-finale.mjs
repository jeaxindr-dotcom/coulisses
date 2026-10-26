// Archive uniquement un passage complet terminé, sans échec ni suite sautée.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
const logs = path.join(root, '.cache', 'run-all');
const out = path.join(root, '.cache', 'revue-astra', 'validation-fusion-2026-10-26');
const report = fs.readFileSync(path.join(logs, 'validation-complete-2026-10-26.log'), 'utf8');
const lines = report.trim().split(/\r?\n/), last = lines.at(-1);
const summary = /^(\d+) suite\(s\), (\d+) ok, 0 ko, (\d+) min$/.exec(last);
assert.ok(summary, 'La série doit être terminée sans échec ni suite sautée.');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const suites = lines.flatMap((line) => {
  const m = /^(\S+)\s+✓ (\d+) ok, 0 ko\s+\((\d+) s\)$/.exec(line);
  if (!m) return [];
  const file = path.join(logs, m[1] + '.log');
  return [{nom: m[1], ok: +m[2], ko: 0, secondes: +m[3], journal: file, sha256: sha(file)}];
});
assert.equal(suites.length, +summary[1]);
assert.equal(suites.reduce((n, s) => n + s.ok, 0), +summary[2]);
fs.mkdirSync(out, {recursive: true});
// Conserver les octets des journaux, y compris leurs fins de ligne, dans Git.
fs.writeFileSync(path.join(out, '.gitattributes'), '* -text\n*.log -whitespace\n');
const copies = [
  ['validation-complete-2026-10-26.log', 'complete.log'],
  ...['staging2d', 'staging3d-run', 'shot-render', 'render', 'coulisses', 'coulisses-export', 'isolation-runtime-test', 'initial-publication-regressions',
    'initial-publication-avant', 'initial-publication-recalage-avant', 'initial-publication-recalage-apres',
    'shot-render-regressions-avant', 'shot-render-regressions-main', 'shot-render-regressions-apres',
    'shot-render-injection-navigateur-seul-rendu', 'shot-render-injection-concurrence1', 'isolation-runtime-cache-avant'].map((n) => [n + '.log', n + '.log']),
];
for (const [from, to] of copies) fs.copyFileSync(path.join(logs, from), path.join(out, to));
fs.copyFileSync(path.join(root, '.cache', 'shot-render-test', 'shot-render-success.log'), path.join(out, 'shot-render-success.log'));
const earlier = path.join(root, '.cache', 'revue-astra', 'verification-complete-premier-passage');
fs.copyFileSync(path.join(earlier, 'validation-complete-2026-10-26.log'), path.join(out, 'premier-passage.log'));
fs.copyFileSync(path.join(earlier, 'coulisses.log'), path.join(out, 'coulisses-premier-passage.log'));
for (const name of ['validation.json', 'validation-e15.json']) {
  fs.copyFileSync(path.join(root, '.cache', 'revue-astra', 'patchs-projets', name), path.join(out, 'patchs-projets-' + name));
}
const inventory = {
  date: new Date().toISOString(), racine: root, branche: 'revue-astra',
  revisionCode: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
  commande: 'node tests/run-all.mjs', resume: last, suites, aucuneSuiteSautee: true,
  binaireFourni: {fichier: path.join(root, 'Coulisses.exe'), sha256: sha(path.join(root, 'Coulisses.exe'))},
  tracesArchivees: fs.readdirSync(out).map((nom) => ({nom, sha256: sha(path.join(out, nom))})),
};
fs.writeFileSync(path.join(root, '.cache', 'revue-astra', 'validation-fusion.json'), JSON.stringify(inventory, null, 2) + '\n');
console.log(last);
console.log(`Preuves archivées : ${out}`);
