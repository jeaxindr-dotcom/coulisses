// The type check of the live preview (player/*.ts, *.tsx) — code review, 08/10/2026: « the TypeScript is never checked ».
// The preview is bundled at runtime with the esbuild of the user's own Remotion project, and its types (React, three,
// React Three Fiber, Remotion) are that project's: this check borrows a Remotion project's TypeScript and node_modules
// (nothing is installed), writes a tsconfig for it in .cache, and runs tsc --noEmit. The project's own sources behind
// the build aliases (@episode-src, @coulisses-module) are left untyped (any).
// usage: node tests/typecheck.mjs [--project <a Remotion project folder>]   (default: the first one found below)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.indexOf('--project');
const CANDIDATES = [arg > 0 ? process.argv[arg + 1] : null, process.env.COULISSES_TS_PROJECT,
  'C:\\Users\\owner\\Desktop\\Youtube\\music\\Brambleshire\\Théatre\\06_Remotion', 'C:\\Users\\owner\\Desktop\\Youtube\\宇宙\\relance\\theatre\\06_Remotion'].filter(Boolean);
const NEEDED = ['typescript', '@types/react', '@types/three', 'three', '@react-three/fiber', '@remotion/player', 'react'];
const proj = CANDIDATES.find((d) => NEEDED.every((p) => fs.existsSync(path.join(d, 'node_modules', p, 'package.json'))));
if (!proj) { console.log(`  (sauté : aucun projet Remotion avec TypeScript et ${NEEDED.join(', ')} — --project <dossier>)\n\n0 ok, 0 ko`); process.exit(0); }
const NM = path.join(proj, 'node_modules');
const out = path.join(STUDIO, '.cache', 'typecheck'); fs.mkdirSync(out, { recursive: true });
// the build's aliases: the user's project, seen as untyped modules
fs.writeFileSync(path.join(out, 'aliases.d.ts'), `declare module '@episode-src/*' { const x: any; export = x; }
declare module '@coulisses-module' { const x: any; export = x; }
declare module '@coulisses-3d' { export function create3d(o: { W: number; H: number; frame: () => number }): any; }
`);
const fwd = (p) => p.split(path.sep).join('/');
fs.writeFileSync(path.join(out, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    strict: true, noImplicitAny: false, noEmit: true, skipLibCheck: true, esModuleInterop: true, allowSyntheticDefaultImports: true, isolatedModules: true,
    baseUrl: fwd(STUDIO), typeRoots: [fwd(path.join(NM, '@types'))], types: ['react', 'three'],
    paths: { '*': [fwd(path.join(NM, '*')), fwd(path.join(NM, '@types', '*'))] },
  },
  files: [...fs.readdirSync(path.join(STUDIO, 'player')).filter((f) => /\.tsx?$/.test(f)).map((f) => fwd(path.join(STUDIO, 'player', f))), fwd(path.join(out, 'aliases.d.ts'))],
}, null, 1));
console.log(`TypeScript de ${path.basename(path.dirname(proj))}\\${path.basename(proj)} (${JSON.parse(fs.readFileSync(path.join(NM, 'typescript', 'package.json'), 'utf8')).version}) sur player\\`);
const r = spawnSync(process.execPath, [path.join(NM, 'typescript', 'bin', 'tsc'), '-p', path.join(out, 'tsconfig.json'), '--pretty', 'false'], { encoding: 'utf8', windowsHide: true });
const errors = (r.stdout + r.stderr).split(/\r?\n/).filter((l) => /error TS\d+/.test(l)).map((l) => l.replace(fwd(STUDIO) + '/', '').replace(STUDIO + path.sep, ''));
for (const e of errors) console.log('  ✗ ' + e);
if (!errors.length) console.log('  ✓ player/*.ts, *.tsx : aucune erreur de type');
// the studio page's script, as studio-server.mjs joins it (page/studio/*.js in one function): valid JavaScript
{
  const dir = path.join(STUDIO, 'page', 'studio'), parts = fs.readdirSync(dir).filter((f) => /^\d\d-[\w-]+\.js$/.test(f)).sort();
  const joined = path.join(out, 'studio.js');
  fs.writeFileSync(joined, '(() => {\n' + parts.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + '})();\n');
  const c = spawnSync(process.execPath, ['--check', joined], { encoding: 'utf8', windowsHide: true });
  if (c.status) errors.push('page/studio : ' + (c.stderr.split(/\r?\n/).find((l) => /Error/.test(l)) ?? 'syntaxe'));
  console.log(c.status ? `  ✗ page/studio/*.js joints : ${c.stderr.trim().split(/\r?\n/).slice(0, 4).join(' ')}` : `  ✓ page/studio/*.js joints (${parts.length} parties) : JavaScript valide`);
}
console.log(`\n${errors.length ? 0 : 1} ok, ${errors.length ? 1 : 0} ko${errors.length ? ` (${errors.length} erreur(s))` : ''}`);
process.exit(errors.length ? 1 : 0);
