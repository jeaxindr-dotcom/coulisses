// HyperFrames (heygen-com/hyperframes: a video is an HTML composition — a root element with data-composition-id,
// data-width / data-height / data-duration, clips with data-start / data-duration, one paused GSAP timeline per
// composition in window.__timelines) as a second engine of Coulisses, next to Remotion (user request, 09/10/2026).
// Coulisses ships none of it (user rule: « comprendre, ne pas redistribuer leurs binaires »): it uses the CLI the user's
// npx already keeps in its cache (%LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\hyperframes), the version a project
// pins in its package.json first (« npx --yes hyperframes@0.8.143 render »), else the newest one there.
//   - the preview: the project's own index.html, served with the HyperFrames runtime of that install injected at the
//     head (as « hyperframes play » does) and Coulisses' adapter (player/hf-player.js: the StudioPlayer of the studio);
//   - the timeline: « hyperframes timeline --json » (every clip, its absolute start and end), in the Coulisses format;
//   - a new project: « hyperframes init <name> --non-interactive --example=blank », the agent's skills left as they are;
//   - the export: « hyperframes render » (lib/hf-render-run.mjs speaks the export protocol of lib/export.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';

const LOCAL = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
const NPX = path.join(LOCAL, 'npm-cache', '_npx');
const GLOBAL = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', 'hyperframes');
// the CLI quiet: no update check of its own, no skills touched (Coulisses' « Mises à jour » asks the user first), no colours
export const hfEnv = () => ({ ...process.env, HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_SKIP_SKILLS: '1', NO_COLOR: '1', FORCE_COLOR: '0' });

const num = (v) => String(v ?? '').split('.').map((x) => parseInt(x, 10) || 0);
export const cmpVersion = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; } return 0; };
const installOf = (dir) => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const cli = path.join(dir, 'bin', 'hyperframes.mjs'), runtime = path.join(dir, 'dist', 'hyperframe.runtime.iife.js');
    return pkg.name === 'hyperframes' && fs.existsSync(cli) ? { version: pkg.version, dir, cli, runtime: fs.existsSync(runtime) ? runtime : null } : null;
  } catch { return null; }
};
// every HyperFrames CLI on this PC (npx's cache, a global install), newest first; read again every 10 s at most
let memo = null;
export function hfInstalls() {
  if (memo && Date.now() - memo.at < 10000) return memo.list;
  const out = [];
  try { for (const h of fs.readdirSync(NPX)) { const i = installOf(path.join(NPX, h, 'node_modules', 'hyperframes')); if (i) out.push(i); } } catch { /* no npx cache */ }
  const g = installOf(GLOBAL); if (g) out.push({ ...g, global: true });
  const seen = new Set(), list = out.sort((a, b) => cmpVersion(b.version, a.version)).filter((i) => (seen.has(i.version) ? false : seen.add(i.version)));
  memo = { at: Date.now(), list };
  return list;
}
// the version a project pins (its package.json scripts: « npx --yes hyperframes@0.8.143 … »), or null
export function hfPinned(dir) {
  try { const s = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts ?? {}); return /hyperframes@(\d+\.\d+\.\d+)/.exec(s)?.[1] ?? null; } catch { return null; }
}
// the CLI for a project: the one it pins if it is here, else the newest; { version, dir, cli, runtime, pinned, exact } or null
export function hfFor(dir) {
  const all = hfInstalls(), pinned = dir ? hfPinned(dir) : null;
  const i = (pinned && all.find((x) => x.version === pinned)) || all[0];
  return i ? { ...i, pinned, exact: !pinned || i.version === pinned } : null;
}

// the root composition of a page: its size, its length, its frame rate (data-fps, else 30)
export function hfComposition(dir, index = 'index.html') {
  let html = ''; try { html = fs.readFileSync(path.join(dir, index), 'utf8'); } catch { return null; }
  const tag = /<[a-z][\w-]*\b[^>]*\bdata-composition-id\s*=\s*["']([^"']+)["'][^>]*>/i.exec(html); if (!tag) return null;
  const at = (k) => { const m = new RegExp(`\\bdata-${k}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag[0]); return m ? m[1] : null; };
  const n = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
  return { id: tag[1], width: Math.round(n(at('width'), 1920)), height: Math.round(n(at('height'), 1080)), duration: n(at('duration'), 0), fps: n(at('fps'), 30) };
}

// the HyperFrames runtime at the head of a page, as « hyperframes play » does (and Coulisses' adapter after it)
export function injectHead(html, tags) {
  const m = /<head\b[^>]*>/i.exec(html);
  if (m) return html.slice(0, m.index + m[0].length) + tags + html.slice(m.index + m[0].length);
  const h = /<html\b[^>]*>/i.exec(html);
  return h ? html.slice(0, h.index + h[0].length) + tags + html.slice(h.index + h[0].length) : tags + html;
}

const run = (cli, args, cwd, timeout = 60000) => new Promise((resolve, reject) => {
  execFile(process.execPath, [cli, ...args], { cwd, env: hfEnv(), encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 64 << 20 }, (err, out, errOut) => {
    if (err && !out) reject(new Error(String(errOut || err.message).trim().split('\n').slice(-3).join(' ')));
    else resolve(String(out));
  });
});
// the timeline of a project, from « hyperframes timeline --json »: one track per kind of clip (graphics, video, audio…)
// and the root composition as a band, in the Coulisses format ({ fps, durationInFrames, pistes } in frames)
export async function hfTimeline(dir, { index = 'index.html' } = {}) {
  const hf = hfFor(dir); if (!hf) throw new Error('HyperFrames');
  const comp = hfComposition(dir, index) ?? { fps: 30, duration: 0, id: 'main' };
  const out = await run(hf.cli, ['timeline', '--json', '.'], dir);
  const j = JSON.parse(out.slice(out.indexOf('{')));
  const T = j.timeline ?? j, fps = comp.fps || 30, F = (s) => Math.round((+s || 0) * fps);
  const dur = +T.duration || comp.duration || 0;
  const pistes = [{ id: 'composition', nom: comp.id, type: 'band', clips: dur ? [{ de: 0, a: Math.max(1, F(dur)), label: comp.id }] : [] }];
  // one lane per track of the composition (data-track-index, as HyperFrames' own timeline), per kind of clip
  const flat = (rows, depth = 0) => rows.flatMap((r) => [{ ...r, depth }, ...(Array.isArray(r.children) ? flat(r.children, depth + 1) : [])]);
  const lanes = new Map();
  for (const tr of T.tracks ?? []) {
    for (const r of flat(tr.rows ?? [])) {
      if (!(Number.isFinite(+r.absStart) && Number.isFinite(+r.absEnd) && +r.absEnd > +r.absStart)) continue;
      const kind = String(r.trackKind ?? tr.kind ?? 'graphics'), key = `${kind}|${r.trackIndex ?? 0}`;
      if (!lanes.has(key)) lanes.set(key, { kind, index: r.trackIndex ?? 0, rows: [] });
      lanes.get(key).rows.push(r);
    }
  }
  for (const L of [...lanes.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.index - b.index)) {
    pistes.push({ id: `${L.kind}-${L.index}`, nom: `${L.kind} ${L.index}`, type: /audio|music|voice|sfx/i.test(L.kind) ? 'audio' : 'video',
      clips: L.rows.map((r) => ({ de: F(r.absStart), a: Math.max(F(r.absStart) + 1, F(r.absEnd)), label: r.label || r.elementId || r.id || r.kind || L.kind, fichier: r.src || r.file || null, ref: r.ref ?? null })) });
  }
  return { fps, durationInFrames: Math.max(1, F(dur)), pistes };
}

// a new project: « hyperframes init » in <parent>\<slug> (a blank composition at the format's resolution); the skills of
// the agent are not updated here (HYPERFRAMES_SKIP_SKILLS): « Mises à jour » on the home screen does it, when asked
export const RESOLUTION = { '16:9': 'landscape', '9:16': 'portrait', '1:1': 'square' };
export function hfInit(parent, slug, { format = '16:9' } = {}) {
  const hf = hfFor(null); if (!hf) throw new Error('HyperFrames');
  fs.mkdirSync(parent, { recursive: true });
  const r = spawnSync(process.execPath, [hf.cli, 'init', slug, '--non-interactive', '--example=blank', `--resolution=${RESOLUTION[format] ?? 'landscape'}`], { cwd: parent, env: hfEnv(), encoding: 'utf8', windowsHide: true, timeout: 120000 });
  const dir = path.join(parent, slug);
  if (r.status !== 0 || !fs.existsSync(path.join(dir, 'index.html'))) throw new Error(String(r.stderr || r.stdout || r.error?.message || '').trim().split('\n').slice(-3).join(' ') || 'hyperframes init');
  return { dir, version: hf.version };
}

// the latest version on npm (the home screen's « Mises à jour »), or null offline
export async function hfLatest() {
  try { const r = await fetch('https://registry.npmjs.org/hyperframes/latest', { signal: AbortSignal.timeout(8000) }); return r.ok ? (await r.json()).version ?? null : null; } catch { return null; }
}

// ---------- the studio of a HyperFrames project: its « player » (the page served with the runtime) and its timeline ----------
// the same shape as lib/player-build.mjs: { state: { status, version, error, builtAt }, build(), watch() } — a new version
// on every save in the project (the studio reloads its preview, at the same frame), its timeline read again with it
export function hfPlayerBuilder(P, { log = () => {}, onBuilt = () => {} } = {}) {
  const state = { status: 'idle', version: 0, error: null, builtAt: null };
  async function build() {
    const hf = hfFor(P.hf.projet), comp = hfComposition(P.hf.projet, P.hf.index);
    if (!hf) { state.status = 'error'; state.error = 'HyperFrames'; return; }
    if (!comp) { state.status = 'error'; state.error = `data-composition-id: ${path.join(P.hf.projet, P.hf.index)}`; return; }
    state.status = 'ready'; state.error = null; state.version++; state.builtAt = new Date().toISOString(); state.comp = comp; state.hf = hf.version;
    log(`HyperFrames ${hf.version} · ${comp.id} ${comp.width}×${comp.height} · ${comp.duration} s (v${state.version})`);
    onBuilt();
  }
  let t = null, watcher = null;
  const SKIP = /(^|[\\/])(revue|renders|node_modules|\.git|\.hyperframes|\.cache|out)([\\/]|$)/i;
  function watch() {
    try {
      watcher = fs.watch(P.hf.projet, { recursive: true }, (_e, f) => {
        if (!f || SKIP.test(String(f)) || /\.(tmp|log|mp4|mov|webm)$/i.test(String(f))) return;
        clearTimeout(t); t = setTimeout(build, 250);
      });
    } catch (e) { log(`watch: ${e.message}`); }
  }
  return { state, build, watch, close: () => watcher?.close() };
}
export function hfTimelineBuilder(P, { log = () => {}, normalize }) {
  const state = { status: 'idle', version: 0, error: null, data: null };
  let building = false, queued = false;
  async function build() {
    if (building) { queued = true; return; }
    building = true; state.status = 'building';
    try {
      const tk = normalize(await hfTimeline(P.hf.projet, { index: P.hf.index }));
      state.data = { tracks: tk.tracks, fps: tk.fps, frames: tk.frames, problems: tk.problems };
      state.status = 'ready'; state.error = null; state.version++;
    } catch (e) { state.status = 'error'; state.error = e.message; log(`timeline HyperFrames : ${e.message}`); }
    building = false;
    if (queued) { queued = false; build(); }
  }
  return { state, build };
}
