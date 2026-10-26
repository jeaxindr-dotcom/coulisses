// Cache du son explicitement déclaré par le projet : reviewAudio={src,offsetFrames,volume}.
// La source maître est adaptée en AAC avec le décalage et le volume déclarés, sans normalisation ajoutée.
// Les pistes descriptives de la frise ne reconstruisent pas nécessairement le son du film : leur mixage
// reste une compatibilité volontaire (masterOnly:false), jamais un repli d'une déclaration invalide.
// Signature des paramètres, tailles et dates des sources ; seule la tâche courante peut publier son résultat.
// État : { state: 'none' | 'building' | 'ready' | 'failed', sig, why, clips, ms }.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const KEEP = 6;   // conserver les six fichiers les plus récents

export function reviewSound({ cacheDir, publicDir, ffmpeg = 'ffmpeg', log = () => {}, masterOnly = true }) {
  const state = { state: 'none', sig: null, why: 'no-audio', clips: 0, ms: null };
  let job = null, seen = null, file = null;
  const PUB = path.resolve(publicDir);
  // Sources uniquement dans le dossier public du projet.
  function clipsOf(data) {
    if (!data || (!data.tracks && !data.reviewAudio)) return { why: 'no-timeline' };
    const fps = data.fps || 30, clips = [];
    const master = data.reviewAudio;
    if (masterOnly && master == null) return { why: 'no-master' };
    // Une frise décrit des sons ; elle n'est pas forcément le mix effectivement rendu.
    // Une déclaration invalide ne retombe jamais sur une reconstruction descriptive.
    if (master != null && (typeof master.src !== 'string' || !master.src ||
        !Number.isFinite(master.offsetFrames ?? 0) || (master.offsetFrames ?? 0) < 0 ||
        !Number.isFinite(master.volume ?? 1) || (master.volume ?? 1) < 0)) return { why: 'invalid-master' };
    const tracks = master == null ? data.tracks ?? [] : [{ type: 'audio', clips: [{
      src: master.src, t0: 0, t1: (data.frames || 0) / fps, from: master.offsetFrames ?? 0, volume: master.volume ?? 1,
    }] }];
    for (const t of tracks) {
      if (t.type !== 'audio') continue;
      for (const c of t.clips ?? []) {
        if (c.off || !c.src) continue;
        const f = path.resolve(PUB, String(c.src).replace(/^\/+/, ''));
        if (!f.toLowerCase().startsWith(PUB.toLowerCase() + path.sep)) continue;
        let st; try { st = fs.statSync(f); } catch { return { why: 'missing', missing: c.src }; }
        const dur = c.t1 - c.t0;
        if (!(dur > 0)) continue;
        clips.push({ f, t0: +c.t0.toFixed(4), dur: +dur.toFixed(4), from: +((c.from || 0) / fps).toFixed(4), volume: Number.isFinite(c.volume) ? c.volume : 1, size: st.size, mtime: st.mtimeMs });
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
    } catch { /* nettoyage du cache à la prochaine publication */ }
  }
  function build(sig, c, out) {
    cancel();
    fs.mkdirSync(cacheDir, { recursive: true });
    const { files, graph } = filterOf(c);
    // Deux travaux de même signature peuvent se chevaucher après annulation : leurs temporaires restent distincts.
    const work = `revue-son-${sig}-${crypto.randomUUID()}`;
    const script = path.join(cacheDir, `${work}.filtre.txt`), tmp = path.join(cacheDir, `${work}.tmp.m4a`);
    fs.writeFileSync(script, graph);
    const args = ['-hide_banner', '-v', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-/filter_complex', script, '-map', '[out]',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-threads', '2', tmp];
    Object.assign(state, { state: 'building', sig, why: null, clips: c.clips.length, ms: null });
    const t0 = Date.now();
    let err = '';
    const p = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    job = p;
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* priorité inchangée */ }
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('error', (e) => { err = e.message; });
    p.on('close', (code) => {
      if (job !== p) { fs.rmSync(script, { force: true }); fs.rmSync(tmp, { force: true }); return; }
      job = null;
      fs.rmSync(script, { force: true });
      if (code === 0 && fs.existsSync(tmp)) {
        try { fs.renameSync(tmp, out); } catch (e) {
          fs.rmSync(tmp, { force: true });
          Object.assign(state, { state: 'failed', why: String(e.message ?? e) });
          return;
        }
        file = out;
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
  function cancel() {
    if (!job) return;
    const old = job; job = null;
    try { old.kill(); } catch { /* déjà terminée */ }
  }
  // La version sert à autoriser une nouvelle tentative ; le contenu et les médias déterminent le cache.
  function update(data, version) {
    // Un média peut être remplacé sans modification du code : sa taille et sa date
    // font partie de la signature. Un échec inchangé attend une nouvelle version.
    const sameVersion = version === seen; seen = version;
    const c = clipsOf(data);
    if (!c.clips) {
      cancel();
      Object.assign(state, { state: 'none', sig: null, why: c.why, clips: 0, ms: null }); file = null;
      return state;
    }
    const sig = crypto.createHash('sha1').update(JSON.stringify(c)).digest('hex').slice(0, 16);
    if (sig === state.sig && (state.state === 'ready' || state.state === 'building' || (state.state === 'failed' && sameVersion))) return state;
    const out = path.join(cacheDir, `revue-son-${sig}.m4a`);
    if (fs.existsSync(out)) {
      // Le résultat d'une ancienne tâche ne doit pas écraser ce retour au cache.
      cancel();
      file = out; try { const now = new Date(); fs.utimesSync(out, now, now); } catch { /* */ }
      Object.assign(state, { state: 'ready', sig, why: null, clips: c.clips.length, ms: 0 });
      return state;
    }
    build(sig, c, out);
    return state;
  }
  return { state, update, file: (sig) => (sig === state.sig && state.state === 'ready' ? file : null), stop: () => {
    cancel(); file = null;
    Object.assign(state, { state: 'none', sig: null, why: 'stopped', clips: 0, ms: null });
  } };
}
