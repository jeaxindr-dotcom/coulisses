// Builds the live preview (player/entry.tsx) of one episode with the esbuild of the Remotion project, and rebuilds it
// whenever a file of 06_Remotion/src changes (fs.watch, recursive on Windows). Nothing is written into the Remotion
// project: the bundle goes to remotion-studio/.cache/. `version` changes on every successful build: the page reloads the
// preview iframe at the same frame when it sees a new one.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CACHE } from './place.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.resolve(HERE, '..');

// generic = { module, composition, props, tag } (a .coulisses file): player/remotion.tsx plays that project's composition
export function playerBuilder({ remotionDir, episode, log = console.log, onBuilt = () => {}, generic = null, watchAlso = null }) {
  const out = path.join(CACHE, `player-${generic ? generic.tag : episode}.js`);
  const src = path.join(remotionDir, 'src');
  const state = { status: 'idle', version: 0, error: null, builtAt: null, ms: 0, file: out };
  let ctx = null, queued = false, building = false, timer = null;

  async function context() {
    if (ctx) return ctx;
    const req = createRequire(path.join(remotionDir, 'package.json'));
    const esbuild = await import(pathToFileURL(req.resolve('esbuild')).href);
    ctx = await esbuild.context({
      entryPoints: [path.join(STUDIO, 'player', generic ? 'remotion.tsx' : 'entry.tsx')],
      bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: out,
      sourcemap: 'inline', logLevel: 'silent', jsx: 'automatic',
      nodePaths: [path.join(remotionDir, 'node_modules')],   // react, remotion, three… from the Remotion project
      alias: generic ? { '@coulisses-module': generic.module } : { '@episode-src': src },
      // a pipeline's run: React in production mode (Vidéo du monde, 07/10/2026: 17 → 27 frames/s in 4K live playback)
      define: generic ? { __COMPOSITION__: JSON.stringify(generic.composition), __PROPS__: JSON.stringify(generic.props ?? {}), 'process.env.NODE_ENV': '"production"' }
        : { __EPISODE__: JSON.stringify(episode), 'process.env.NODE_ENV': '"development"' },
      loader: { '.png': 'file', '.jpg': 'file', '.jpeg': 'file', '.webp': 'file', '.svg': 'file', '.glsl': 'text', '.css': 'css' },
    });
    return ctx;
  }
  async function build() {
    if (building) { queued = true; return; }
    building = true; state.status = 'building';
    const t0 = Date.now();
    try {
      const c = await context();
      await c.rebuild();
      state.status = 'ready'; state.error = null; state.version++; state.builtAt = new Date().toISOString(); state.ms = Date.now() - t0;
      log(`aperçu vivant ${generic ? generic.composition : episode} compilé (${state.ms} ms, version ${state.version})`);
      onBuilt(state);
    } catch (e) {
      state.status = 'error';
      state.error = (e.errors ?? []).slice(0, 3).map((x) => `${x.location ? path.basename(x.location.file) + ':' + x.location.line + ' ' : ''}${x.text}`).join('\n') || String(e.message || e);
      log(`aperçu vivant : erreur de compilation\n${state.error}`);
    }
    building = false;
    if (queued) { queued = false; build(); }
  }
  function watch() {
    try {
      fs.watch(src, { recursive: true }, (_ev, file) => {
        if (!file || !/\.(tsx?|json|glsl)$/i.test(file)) return;
        clearTimeout(timer); timer = setTimeout(build, 250);   // a save often touches the file several times
      });
    } catch (e) { log(`surveillance du code impossible (${e.message}) : l'aperçu ne se mettra pas à jour seul`); }
    if (watchAlso) try {
      fs.watch(watchAlso, { recursive: true }, (_ev, file) => {
        if (!file || /(^|[\\/])(revue|node_modules|\.git)([\\/]|$)/i.test(file) || !/\.(json|tsx?)$/i.test(file)) return;
        clearTimeout(timer); timer = setTimeout(build, 250);
      });
    } catch { /* optional */ }
    try { fs.watch(path.join(STUDIO, 'player'), (_ev, file) => { if (file && /.(tsx?|html)$/.test(file)) { clearTimeout(timer); timer = setTimeout(build, 250); } }); } catch { /* the studio's own entry: optional */ }
  }
  return { state, build, watch, dispose: () => ctx?.dispose() };
}
