// The review sound of a Remotion project (user reports 24/10/2026: « le son fait que de se couper », « c'est impossible
// de review la vidéo », « je ne veux plus avoir ce genre de problème »).
// The live preview (Remotion's Player in a frame of its own) played the film's sound itself: every hiccup of the picture
// — videos loading, the GPU busy with something else, a frame taking long — stopped it (its Player waits for its media,
// its one AudioContext is suspended meanwhile), and a broken context or Chrome's rule on sound cut it for good. An editor
// does the opposite: the sound is the clock, the picture follows it. So the project's sound is made here once, from the
// AUDIO tracks of its timeline module (src/coulisses-timeline.ts, the Coulisses contract: each clip its file « son »,
// its frames « de » / « a », its offset « debut » in frames, an optional « volume »): one AAC file, mixed by ffmpeg in a
// few seconds, at a low priority, kept in the cache by the signature of its clips (their files' sizes and dates too) —
// an edit of the picture does not make it again. The page plays it as a plain <audio> and the preview, muted, follows it
// (page/studio/01-preview.js, « RS »).
// state: { state: 'none' | 'building' | 'ready' | 'failed', sig, why, clips, ms }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const KEEP = 6;   // the mixes kept in the cache (the last ones made)

export function reviewSound({ cacheDir, publicDir, ffmpeg = 'ffmpeg', log = () => {} }) {
  const state = { state: 'none', sig: null, why: 'no-audio', clips: 0, ms: null };
  let job = null, seen = null, file = null;
  const PUB = path.resolve(publicDir);
  // the audio clips of the timeline, as files of the project's public folder (never anywhere else)
  function clipsOf(data) {
    if (!data?.tracks) return { why: 'no-timeline' };
    const fps = data.fps || 30, clips = [];
    for (const t of data.tracks) {
      if (t.type !== 'audio') continue;
      for (const c of t.clips ?? []) {
        if (c.off || !c.src) continue;
        const f = path.resolve(PUB, String(c.src).replace(/^\/+/, ''));
        if (!f.toLowerCase().startsWith(PUB.toLowerCase() + path.sep)) continue;
        let st; try { st = fs.statSync(f); } catch { return { why: 'missing', missing: c.src }; }
        const dur = c.t1 - c.t0;
        if (!(dur > 0)) continue;
        clips.push({ f, t0: +c.t0.toFixed(4), dur: +dur.toFixed(4), from: +((c.from || 0) / fps).toFixed(4), volume: Number.isFinite(c.volume) ? c.volume : 1, size: st.size, mtime: Math.round(st.mtimeMs) });
      }
    }
    if (!clips.length) return { why: 'no-audio' };
    return { clips, total: Math.max((data.frames || 0) / fps, ...clips.map((c) => c.t0 + c.dur)) };
  }
  function filterOf(c) {
    const files = [...new Set(c.clips.map((x) => x.f))];
    const lines = [], label = new Map();
    files.forEach((f, i) => {
      const n = c.clips.filter((x) => x.f === f).length;
      if (n === 1) label.set(f, [`[${i}:a]`]);
      else { const outs = Array.from({ length: n }, (_, k) => `[s${i}_${k}]`); lines.push(`[${i}:a]asplit=${n}${outs.join('')}`); label.set(f, outs); }
    });
    const used = new Map(), parts = [];
    c.clips.forEach((x, j) => {
      const k = used.get(x.f) ?? 0; used.set(x.f, k + 1);
      const src = label.get(x.f)[k], ms = Math.max(0, Math.round(x.t0 * 1000));
      lines.push(`${src}atrim=start=${x.from}:end=${+(x.from + x.dur).toFixed(4)},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${x.volume},adelay=${ms}:all=1[c${j}]`);
      parts.push(`[c${j}]`);
    });
    lines.push(`${parts.join('')}amix=inputs=${parts.length}:normalize=0:duration=longest:dropout_transition=0,apad=whole_dur=${c.total.toFixed(3)},atrim=end=${c.total.toFixed(3)}[out]`);
    return { files, graph: lines.join(';\n') };
  }
  function prune() {
    try {
      const all = fs.readdirSync(cacheDir).filter((n) => /^revue-son-[0-9a-f]+\.m4a$/.test(n)).map((n) => ({ n, t: fs.statSync(path.join(cacheDir, n)).mtimeMs })).sort((a, b) => b.t - a.t);
      for (const x of all.slice(KEEP)) fs.rmSync(path.join(cacheDir, x.n), { force: true });
    } catch { /* the cache: next time */ }
  }
  function build(sig, c, out) {
    if (job) { try { job.kill(); } catch { /* gone */ } job = null; }
    fs.mkdirSync(cacheDir, { recursive: true });
    const { files, graph } = filterOf(c);
    const script = path.join(cacheDir, `revue-son-${sig}.filtre.txt`), tmp = out.replace(/\.m4a$/, '.tmp.m4a');
    fs.writeFileSync(script, graph);
    const args = ['-hide_banner', '-v', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-/filter_complex', script, '-map', '[out]',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-threads', '2', tmp];
    Object.assign(state, { state: 'building', sig, why: null, clips: c.clips.length, ms: null });
    const t0 = Date.now();
    let err = '';
    const p = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    job = p;
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* as it is */ }
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('error', (e) => { err = e.message; });
    p.on('close', (code) => {
      if (job !== p) return;   // (a newer mix asked meanwhile)
      job = null;
      fs.rmSync(script, { force: true });
      if (code === 0 && fs.existsSync(tmp)) {
        fs.renameSync(tmp, out); file = out;
        Object.assign(state, { state: 'ready', ms: Date.now() - t0 });
        log(`son de relecture prêt : ${c.clips.length} morceau(x) son mixé(s) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        prune();
      } else {
        fs.rmSync(tmp, { force: true });
        Object.assign(state, { state: 'failed', why: err.trim().split('\n').slice(-2).join(' | ').slice(0, 300) || `ffmpeg ${code}` });
        log(`son de relecture impossible (${state.why}) : l'aperçu garde son propre son`);
      }
    });
  }
  // the timeline of the current code (lib/remotion-module.mjs, its version): the mix made again only if its sound changed
  function update(data, version) {
    if (version === seen && state.state !== 'none') return state;
    seen = version;
    const c = clipsOf(data);
    if (!c.clips) {
      if (job) { try { job.kill(); } catch { /* gone */ } job = null; }
      Object.assign(state, { state: 'none', sig: null, why: c.why, clips: 0, ms: null }); file = null;
      return state;
    }
    const sig = crypto.createHash('sha1').update(JSON.stringify(c)).digest('hex').slice(0, 16);
    if (sig === state.sig && (state.state === 'ready' || state.state === 'building')) return state;
    const out = path.join(cacheDir, `revue-son-${sig}.m4a`);
    if (fs.existsSync(out)) {
      file = out; try { const now = new Date(); fs.utimesSync(out, now, now); } catch { /* */ }
      Object.assign(state, { state: 'ready', sig, why: null, clips: c.clips.length, ms: 0 });
      return state;
    }
    build(sig, c, out);
    return state;
  }
  return { state, update, file: (sig) => (sig === state.sig && state.state === 'ready' ? file : null), stop: () => { if (job) try { job.kill(); } catch { /* gone */ } } };
}
