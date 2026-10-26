// Préchargé uniquement par le lanceur de tests. Les studios ouverts indirectement
// par un accueil ou par Coulisses.exe restent dans la plage des ports de test.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
import crypto from 'node:crypto';
import {freePort} from './where.mjs';

export const TEST_PORT_MIN = 4240;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
export const WEBPACK_CACHE_ROOT = path.join(ROOT, '.cache', 'run-all', 'webpack');
export const webpackTestCacheDir = (remotionRoot, cacheRoot = WEBPACK_CACHE_ROOT) => path.join(cacheRoot, crypto.createHash('sha256').update(path.resolve(remotionRoot).toLowerCase()).digest('hex'));

// Les node_modules des fixtures peuvent être des jonctions vers un moteur réel.
// Changer TEMP ne suffit pas : Remotion écrit et efface son cache dans ces
// node_modules. Les deux chemins du SDK sont donc redirigés ensemble, en mémoire.
const CACHE_MODULE = /\/node_modules\/@remotion\/bundler\/dist\/(webpack-cache|shared-bundler-config)\.js$/i;
export function redirectWebpackCache(url, source, cacheRoot = WEBPACK_CACHE_ROOT) {
  const match = CACHE_MODULE.exec(url.replace(/\\/g, '/'));
  if (!match) return null;
  const text = Buffer.isBuffer(source) || ArrayBuffer.isView(source) ? Buffer.from(source).toString('utf8') : String(source);
  const expression = (root) => `require("node:path").join(${JSON.stringify(cacheRoot)}, require("node:crypto").createHash("sha256").update(require("node:path").resolve(${root}).toLowerCase()).digest("hex"))`;
  const replaceOnce = (needle, replacement) => {
    if (text.split(needle).length !== 2) throw new Error(`Isolation du cache Webpack impossible : forme du SDK inconnue (${url}).`);
    return text.replace(needle, replacement);
  };
  if (match[1] === 'webpack-cache') {
    const needle = 'const getWebpackCacheDir = (remotionRoot) => {';
    return replaceOnce(needle, `${needle}\n    return ${expression('remotionRoot')}; // Cache de cette exécution de test uniquement.`);
  }
  if (!text.includes('const computeHashAndFinalConfig = (conf, options) => {') || !text.includes('context: options.remotionRoot') || /cacheDirectory\s*:/.test(text)) throw new Error(`Isolation du cache Webpack impossible : configuration du SDK inconnue (${url}).`);
  return replaceOnce("type: 'filesystem',", `type: 'filesystem',\n                    cacheDirectory: ${expression('options.remotionRoot')},`);
}

if (!fs.existsSync(path.join(ROOT, 'installed.json'))) registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!CACHE_MODULE.test(url)) return loaded;
    return {...loaded, source: redirectWebpackCache(url, loaded.source)};
  },
});

export async function isolateServerPort(argv, {root = ROOT, installed = fs.existsSync(path.join(root, 'installed.json')), choosePort = () => freePort(TEST_PORT_MIN)} = {}) {
  if (installed || !argv[1] || !['studio-server.mjs', 'hub-server.mjs'].some((file) => same(argv[1], path.join(root, file)))) return false;
  if (argv.slice(2).some((value) => /^--port(?:=|$)/.test(value))) return false;
  const port = await choosePort();
  if (!Number.isInteger(port) || port < TEST_PORT_MIN || port > 65535) throw new Error('Port de test invalide.');
  argv.push('--port', String(port));
  return true;
}

await isolateServerPort(process.argv);
