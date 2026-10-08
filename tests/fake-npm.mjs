// A stand-in for `npm install` (COULISSES_NPM, tests/new-project.mjs): instead of downloading, node_modules becomes a junction
// to the Brambleshire Remotion project's modules (the same Remotion, three and React Three Fiber), and it prints a few lines
// as npm would. Nothing is installed anywhere.
import fs from 'node:fs';
import path from 'node:path';
const MODULES = 'C:\\Users\\owner\\Desktop\\Youtube\\music\\Brambleshire\\Théatre\\06_Remotion\\node_modules';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log('npm http fetch GET 200 https://registry.npmjs.org/remotion');
await sleep(400);
console.log('npm http fetch GET 200 https://registry.npmjs.org/three');
await sleep(400);
const nm = path.join(process.cwd(), 'node_modules');
if (!fs.existsSync(nm)) fs.symlinkSync(MODULES, nm, 'junction');
console.log('added 512 packages in 1s');
