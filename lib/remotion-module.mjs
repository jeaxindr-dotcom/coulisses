// The timeline of a generic Remotion project (a .coulisses file, lib/coulisses-file.mjs), as its CURRENT code says:
// esbuild (the project's own) bundles a tiny entry that imports the project's timeline module for Node, into the
// cache, then runs it in a child process (a fresh import each time the code changes). Same idea as timeline-live.mjs
// for Brambleshire. The module's timeline is in FRAMES: { pistes: [{ id, nom, type, clips: [{ de, a, label, … }] }] };
// the studio draws it in seconds: { tracks: [{ id, name, type, clips: [{ t0, t1, label, file, src, from, ref, off }] }] }.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { CACHE } from './place.mjs';

const TYPES = new Set(['video', 'audio', 'band']);
const ENTRY = (mod, id, props) => `
import * as M from ${JSON.stringify(mod.split(path.sep).join('/'))};
const tl = M.timeline ?? M.default?.timeline ?? M.coulisses?.timeline;
if (typeof tl !== 'function') { console.log(JSON.stringify({ error: 'le module n\\'exporte pas de fonction timeline(id, props)' })); process.exit(0); }
Promise.resolve(tl(${JSON.stringify(id)}, ${JSON.stringify(props ?? {})})).then((r) => console.log(JSON.stringify({ ok: true, r })), (e) => console.log(JSON.stringify({ error: String(e && e.stack || e) })));
`;

export async function esbuildOf(projet) {
  const req = createRequire(path.join(projet, 'package.json'));
  return import(pathToFileURL(req.resolve('esbuild')).href);
}

// raw = what timeline() returned; checks it and turns frames into seconds. Returns { fps, frames, tracks, problems }
export function normalizeTimeline(raw, fps = 30) {
  const problems = [], tracks = [];
  if (!raw || !Array.isArray(raw.pistes)) return { fps, frames: 0, tracks, problems: ['timeline() doit rendre { pistes: [...] }'] };
  const f = raw.fps ?? fps, T = (x) => +(x / f).toFixed(4);
  let end = raw.durationInFrames ?? 0;
  raw.pistes.forEach((p, i) => {
    const where = `piste ${i + 1}${p?.id ? ` (${p.id})` : ''}`;
    if (!p || !p.id || !p.nom) { problems.push(`${where} : il faut un id et un nom`); return; }
    const type = TYPES.has(p.type) ? p.type : 'video';
    if (p.type && !TYPES.has(p.type)) problems.push(`${where} : type « ${p.type} » inconnu (video, audio ou band)`);
    const clips = [];
    for (const [k, c] of (p.clips ?? []).entries()) {
      if (!Number.isFinite(c?.de) || !Number.isFinite(c?.a) || c.a <= c.de) { problems.push(`${where}, clip ${k + 1} : de / a en images, avec a > de`); continue; }
      if (!c.label) problems.push(`${where}, clip ${k + 1} : un label lisible est attendu`);
      end = Math.max(end, c.a);
      clips.push({ t0: T(c.de), t1: T(c.a), label: c.label ?? `clip ${k + 1}`, file: c.fichier ?? null, src: c.son ?? null, from: c.debut ?? 0, ref: c.ref ?? null, off: !!c.off });
    }
    tracks.push({ id: String(p.id), name: String(p.nom), type, clips });
  });
  return { fps: f, frames: end, tracks, problems };
}

// the timeline of the run's composition, from the project's timeline module (or the main module when there is none)
export async function loadTimeline(R, { log = () => {} } = {}) {
  const mod = R.timeline ?? R.module;
  fs.mkdirSync(CACHE, { recursive: true });
  const tag = crypto.createHash('sha1').update(mod.toLowerCase()).digest('hex').slice(0, 8);
  const out = path.join(CACHE, `coulisses-timeline-${tag}-${process.pid}-${Date.now()}.cjs`);
  try {
    const esbuild = await esbuildOf(R.projet);
    await esbuild.build({
      stdin: { contents: ENTRY(mod, R.composition, R.props), resolveDir: path.dirname(mod), loader: 'ts', sourcefile: 'coulisses-timeline-entry.ts' },
      bundle: true, platform: 'node', format: 'cjs', target: 'node20', outfile: out, logLevel: 'silent', jsx: 'automatic',
      nodePaths: [path.join(R.projet, 'node_modules')],
      loader: { '.png': 'empty', '.jpg': 'empty', '.jpeg': 'empty', '.webp': 'empty', '.svg': 'empty', '.css': 'empty', '.mp4': 'empty', '.mp3': 'empty', '.wav': 'empty', '.glsl': 'text' },
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const txt = await new Promise((resolve, reject) => execFile(process.execPath, [out], { maxBuffer: 64e6, windowsHide: true, cwd: R.projet, timeout: 60000 },
      (e, so, se) => (e ? reject(new Error((se || e.message).split('\n').slice(0, 6).join('\n'))) : resolve(so))));
    const res = JSON.parse(txt.trim().split('\n').pop());
    if (res.error) throw new Error(res.error);
    return normalizeTimeline(res.r);
  } catch (e) {
    const msg = (e.errors ?? []).slice(0, 3).map((x) => `${x.location ? path.basename(x.location.file) + ':' + x.location.line + ' ' : ''}${x.text}`).join('\n') || String(e.message || e);
    log(`timeline du projet : ${msg}`);
    throw new Error(msg);
  } finally { fs.rmSync(out, { force: true }); }
}

// the module's compositions as Node sees them (the checker): [{ id, fps, width, height, durationInFrames, component }]
const COMPS = (mod, props) => `
import * as M from ${JSON.stringify(mod.split(path.sep).join('/'))};
const mod = M.compositions ? M : (M.coulisses ?? M.default ?? {});
const props = ${JSON.stringify(props ?? {})};
const out = (mod.compositions ?? []).map((c) => ({ id: c.id, fps: c.fps, width: c.width, height: c.height, component: !!c.component,
  durationInFrames: typeof c.durationInFrames === 'function' ? c.durationInFrames({ ...(c.defaultProps ?? {}), ...props }) : c.durationInFrames }));
console.log(JSON.stringify({ ok: true, r: out }));
`;
export async function loadCompositions(R) {
  const out = path.join(CACHE, `coulisses-comps-${process.pid}-${Date.now()}.cjs`);
  try {
    const esbuild = await esbuildOf(R.projet);
    await esbuild.build({
      stdin: { contents: COMPS(R.module, R.props), resolveDir: path.dirname(R.module), loader: 'ts', sourcefile: 'coulisses-comps-entry.ts' },
      bundle: true, platform: 'node', format: 'cjs', target: 'node20', outfile: out, logLevel: 'silent', jsx: 'automatic', nodePaths: [path.join(R.projet, 'node_modules')],
      loader: { '.png': 'empty', '.jpg': 'empty', '.jpeg': 'empty', '.webp': 'empty', '.svg': 'empty', '.css': 'empty', '.mp4': 'empty', '.mp3': 'empty', '.wav': 'empty', '.glsl': 'text' },
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const txt = await new Promise((resolve, reject) => execFile(process.execPath, [out], { maxBuffer: 16e6, windowsHide: true, cwd: R.projet, timeout: 60000 },
      (e, so, se) => (e ? reject(new Error((se || e.message).split('\n').slice(0, 4).join('\n'))) : resolve(so))));
    return JSON.parse(txt.trim().split('\n').pop()).r;
  } finally { fs.rmSync(out, { force: true }); }
}

// rebuilt with the live preview (the studio server): { state: { status, version, error, data: { tracks, fps, frames } }, build }
export function genericTimelineBuilder(R, { log = console.log } = {}) {
  const state = { status: 'idle', version: 0, error: null, data: null };
  let building = false, queued = false;
  async function build() {
    if (building) { queued = true; return; }
    building = true; state.status = 'building';
    try {
      const t = await loadTimeline(R, { log });
      state.data = { tracks: t.tracks, fps: t.fps, frames: t.frames, problems: t.problems };
      state.status = 'ready'; state.error = t.problems.length ? t.problems.slice(0, 3).join(' · ') : null; state.version++;
    } catch (e) { state.status = 'error'; state.error = e.message; }
    building = false;
    if (queued) { queued = false; build(); }
  }
  return { state, build };
}
