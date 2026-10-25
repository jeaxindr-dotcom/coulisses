// Builds the live preview (player/entry.tsx) of one episode with the esbuild of the Remotion project, and rebuilds it
// whenever a file of 06_Remotion/src changes (fs.watch, recursive on Windows). Nothing is written into the Remotion
// project: the bundle goes to remotion-studio/.cache/. `version` changes on every successful build: the page reloads the
// preview iframe at the same frame when it sees a new one.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CACHE } from './place.mjs';
import { t } from './i18n.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.resolve(HERE, '..');

// generic = { module, composition, props, tag } (a .coulisses file): player/remotion.tsx plays that project's composition
// the 3D staging of a run (player/three-stage.ts) only when its project has React Three Fiber; else a stand-in (player/no3d.ts)
export const stage3dModule = (projet) => path.join(STUDIO, 'player', fs.existsSync(path.join(projet, 'node_modules', '@react-three', 'fiber')) ? 'three-stage.ts' : 'no3d.ts');
const PREMOUNT = String(Number.isFinite(+process.env.COULISSES_PREMOUNT) && process.env.COULISSES_PREMOUNT !== '' ? +process.env.COULISSES_PREMOUNT : 3);
export function playerBuilder({ remotionDir, episode, log = console.log, onBuilt = () => {}, generic = null, watchAlso = null }) {
  const out = path.join(CACHE, `player-${generic ? generic.tag : episode}.js`);
  const src = path.join(remotionDir, 'src');
  const state = { status: 'idle', version: 0, error: null, builtAt: null, ms: 0, file: out };
  let ctx = null, queued = false, building = false, timer = null;

  async function context() {
    if (ctx) return ctx;
    const req = createRequire(path.join(remotionDir, 'package.json'));
    const esbuild = await import(pathToFileURL(req.resolve('esbuild')).href);
    // « remotion » in the preview: player/sequence-window.tsx, the real package behind it (its sound sequences far from the
    // frame shown not mounted: E11, 1601 of them walked at every frame); « remotion/no-react » and the others as they are
    const REAL = path.join(path.dirname(req.resolve('remotion/package.json')), 'dist', 'esm', 'index.mjs'), SHIM = path.join(STUDIO, 'player', 'sequence-window.tsx');
    const windowed = fs.existsSync(REAL) && !process.env.COULISSES_PREVIEW_ALL_SEQUENCES ? [   // (the variable: every sequence mounted, to compare)
      { name: 'coulisses-sequence-window', setup(b) {
      b.onResolve({ filter: /^remotion$/ }, () => ({ path: SHIM }));
      b.onResolve({ filter: /^@coulisses-remotion$/ }, () => ({ path: REAL }));
    } }] : [];
    ctx = await esbuild.context({
      entryPoints: [path.join(STUDIO, 'player', generic ? 'remotion.tsx' : 'entry.tsx')],
      bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: out,
      sourcemap: 'linked', logLevel: 'silent', jsx: 'automatic',
      nodePaths: [path.join(remotionDir, 'node_modules')],   // react, remotion, three… from the Remotion project
      // a run with 3D scenes (React Three Fiber in the project): the Theatre's 3D staging too (player/three-stage.ts)
      alias: generic ? { '@coulisses-module': generic.module, '@coulisses-3d': stage3dModule(remotionDir) } : { '@episode-src': src },
      // a pipeline's run: React in production mode (Vidéo du monde, 07/10/2026: 17 → 27 frames/s in 4K live playback)
      // (__COULISSES_PREMOUNT__: the seconds a visual sequence is premounted ahead, player/sequence-window.tsx — 0: none)
      define: generic ? { __COMPOSITION__: JSON.stringify(generic.composition), __PROPS__: JSON.stringify(generic.props ?? {}), __COULISSES_PREMOUNT__: PREMOUNT, 'process.env.NODE_ENV': '"production"' }
        // an episode of the Theatre too (user report 18/10/2026: « la lecture remotion sur cet épisode long est lente et laggy » —
        // in development mode React spent half of each frame logging its own renders: E11's preview alone, 18,6 → 30 i/s)
        : { __EPISODE__: JSON.stringify(episode), __COULISSES_PREMOUNT__: PREMOUNT, 'process.env.NODE_ENV': '"production"' },
      loader: { '.png': 'file', '.jpg': 'file', '.jpeg': 'file', '.webp': 'file', '.svg': 'file', '.glsl': 'text', '.css': 'css' },
      plugins: windowed,
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
      log(t('pb.built', { name: generic ? generic.composition : episode, ms: state.ms, v: state.version }));
      onBuilt(state);
    } catch (e) {
      state.status = 'error';
      state.error = (e.errors ?? []).slice(0, 3).map((x) => `${x.location ? path.basename(x.location.file) + ':' + x.location.line + ' ' : ''}${x.text}`).join('\n') || String(e.message || e);
      log(t('pb.error', { err: state.error }));
    }
    building = false;
    if (queued) { queued = false; build(); }
  }
  function watch() {
    try {
      fs.watch(src, { recursive: true }, (_ev, file) => {
        if (!file || !/\.(m?[jt]sx?|json|glsl|css)$/i.test(file)) return;
        clearTimeout(timer); timer = setTimeout(build, 250);   // a save often touches the file several times
      });
    } catch (e) { log(t('pb.noWatch', { msg: e.message })); }
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
