// The episode's full timeline as the CURRENT code builds it (camera, light, music, sound effects, voices with their
// audio files, emotes, walks, sets, curtain, 3D shots) — what the studio's multi-track timeline shows. Same idea as
// 06_Remotion/scripts/export-timeline.ts (which writes the smaller revue/timeline.json), done here without touching the
// Remotion project: esbuild bundles a tiny entry that imports src/episodes/registry.ts for Node, into .cache/, then
// runs it in a child process (a fresh import each time the code changes). Rebuilt with the live preview.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CACHE } from './place.mjs';
import { t } from './i18n.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r3 = (n) => (typeof n === 'number' && Number.isFinite(n) ? +n.toFixed(3) : n);

// runs inside the bundle (Node): builds the timeline and prints the parts the studio draws
const ENTRY = (ep) => `
import { EPISODES } from './episodes/registry';
const e = EPISODES.find((x) => x.id === ${JSON.stringify(ep)});
if (!e) { console.log(JSON.stringify({ error: ${JSON.stringify(t('tl.noEpisode'))} })); process.exit(0); }
const tl = e.build(), A = e.assets ?? {}, snd = A.sound ?? {};
const r3 = ${r3.toString()};
const out = {
  episode: ${JSON.stringify(ep)}, duration: r3(tl.duration), fps: 30,
  says: tl.says.map((s) => ({ t: r3(s.t), dur: r3(s.dur), id: s.id, actor: s.actor.replace(/^cc-/, ''), text: s.text, audio: s.audio, gain: s.gain ?? 1 })),
  sfx: tl.sfx.map((s) => ({ t: r3(s.t), name: s.name, volume: s.volume, src: snd[s.name] ?? null })),
  music: tl.music.map((m) => ({ t: r3(m.t), until: r3(Math.min(m.until, tl.duration)), name: m.name, volume: m.volume, channel: m.channel, src: snd[m.name] ?? null })),
  camera: tl.camera.map((c) => ({ t: r3(c.t), dur: r3(c.dur), v: Object.fromEntries(Object.entries(c.value).map(([k, v]) => [k, r3(v)])) })),
  light: tl.light.map((c) => ({ t: r3(c.t), dur: r3(c.dur), v: c.value })),
  curtain: tl.curtain.map((c) => ({ t: r3(c.t), dur: r3(c.dur), open: c.value > 0.5 })),
  sets: tl.sets.map((w) => ({ id: w.id, name: A.sets?.[w.id]?.location ?? w.id, inT: r3(w.inT), inDur: r3(w.inDur), outT: w.outT < 1e8 ? r3(w.outT) : null, outDur: r3(w.outDur) })),
  cutaways: tl.cutaways.map((c) => ({ id: c.id, t: r3(c.t), dur: r3(c.dur) })),
  emotes: tl.emotes.map((m) => ({ t: r3(m.t), actor: m.actor.replace(/^cc-/, ''), name: m.name })),
  moves: Object.fromEntries(Object.entries(tl.actors).map(([a, evs]) => [a.replace(/^cc-/, ''), evs
    .filter((x) => x.kind === 'walk' || x.kind === 'show' || x.kind === 'hide' || x.kind === 'popin' || x.kind === 'popout' || x.kind === 'pose')
    .map((x) => ({ t: r3(x.t), kind: x.kind, dur: r3(x.dur ?? 0), pose: x.pose }))])),
  propVariants: (tl.propVariants ?? []).map((v) => ({ t: r3(v.t), id: v.id, variant: v.variant })),
};
console.log(JSON.stringify(out));
`;

export function timelineBuilder({ remotionDir, episode, log = console.log }) {
  const state = { status: 'idle', version: 0, error: null, data: null };
  let building = false, queued = false;
  async function build() {
    if (building) { queued = true; return; }
    building = true; state.status = 'building';
    // one file per build: a build never reads the bundle another one is writing
    fs.mkdirSync(CACHE, { recursive: true });
    const out = path.join(CACHE, `timeline-${episode}-${process.pid}-${Date.now()}.cjs`);
    try {
      const req = createRequire(path.join(remotionDir, 'package.json'));
      const esbuild = await import(pathToFileURL(req.resolve('esbuild')).href);
      await esbuild.build({
        stdin: { contents: ENTRY(episode), resolveDir: path.join(remotionDir, 'src'), loader: 'ts', sourcefile: 'studio-timeline-entry.ts' },
        bundle: true, platform: 'node', format: 'cjs', target: 'node20', outfile: out, logLevel: 'silent', jsx: 'automatic',
        loader: { '.png': 'empty', '.jpg': 'empty', '.glsl': 'text' }, define: { 'process.env.NODE_ENV': '"production"' },
      });
      const json = await new Promise((resolve, reject) => execFile('node', [out], { maxBuffer: 64e6, windowsHide: true, cwd: remotionDir }, (e, so, se) => (e ? reject(new Error((se || e.message).split('\n').slice(0, 3).join(' '))) : resolve(so))));
      const data = JSON.parse(json.trim().split('\n').pop());
      if (data.error) throw new Error(data.error);
      fs.rmSync(out, { force: true });
      state.data = data; state.status = 'ready'; state.error = null; state.version++;
    } catch (e) {
      state.status = 'error';
      state.error = (e.errors ?? []).slice(0, 2).map((x) => `${x.location ? path.basename(x.location.file) + ':' + x.location.line + ' ' : ''}${x.text}`).join('\n') || String(e.message || e);
      log(t('tl.log', { err: state.error }));
    }
    building = false;
    if (queued) { queued = false; build(); }
  }
  return { state, build };
}
