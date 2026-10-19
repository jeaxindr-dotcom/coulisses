// « Exporter » a run of a Remotion pipeline (.coulisses), on the user's order only: Coulisses runs the project's own export
// script, scripts\coulisses-rendu.mjs (contract: docs\FICHE-COULISSES-REMOTION.md, « Le script d'export »). The channel
// keeps its finishing (loudness, 4K, file names) in that script; Coulisses only starts it, shows its progress and stops it.
//   - the script runs DETACHED from the studio: closing Coulisses does not stop an export of one or two hours;
//   - its output goes to revue\export.log, read back for the progress (COULISSES PROGRES <pct> <étape>) and the end
//     (COULISSES FIN "<file>"); revue\export.json keeps the pid, the times and the state;
//   - « Arrêter » ends the process and its children (taskkill /T): only its .tmp.mp4 is left, never a false final file;
//   - the new file lands in the .coulisses export folder: the studio picks it up by itself (lib/projects.mjs);
//   - replacing the very file under review (same name as the last export): the script says COULISSES REMPLACE "<file>"
//     just before renaming onto it, the studio lets go of it (as for a Brambleshire render), and takes it back after.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFile } from 'node:child_process';
import { readJson, writeJson, nowIso } from './episode.mjs';
import { t } from './i18n.mjs';
import { hfFor, hfComposition } from './hyperframes.mjs';
import { gpuEncoder } from './gpu.mjs';
import { fileURLToPath } from 'node:url';
// a HyperFrames project (user request, 09/10/2026): « hyperframes render » of the user's CLI, through lib/hf-render-run.mjs
// (the same protocol: COULISSES PROGRES / FIN), its three qualities as the export's variants
const HF_RUN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hf-render-run.mjs');
// the export at a speed from ×0,5 to ×2,0 (user request 14/10/2026): lib/export-run.mjs runs it, then makes its copy at that speed
const EXPORT_RUN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'export-run.mjs');
// a notch of the dial: 0,5 to 2,0 by 0,1 (lib/speed.mjs)
import { speedOf } from './speed.mjs';
export { speedOf };
const isHf = (p) => p.kind === 'hyperframes';
// the two qualities of every project (user request, 19/10/2026: « la même interface pour tous les projets, option 1080p,
// option 4K »): 1080p = « hyperframes render » as it is (its standard quality), 4K = its 4K output, at its best quality
const hfOptions = () => [{ id: '1080p', label: '1080p' }, { id: '4k', label: '4K' }];

export const SCRIPT = path.join('scripts', 'coulisses-rendu.mjs');
export const exportFiles = (p) => ({ STATE: path.join(p.REVUE, 'export.json'), LOG: path.join(p.REVUE, 'export.log'), PROPS: path.join(p.REVUE, 'export-props.json') });
const scriptOf = (p) => (p.remotion?.projet ? path.join(p.remotion.projet, SCRIPT) : null);

// the export variants the script offers (« --options »: a JSON array [{ id, label }], the first is the main button),
// asked once per version of the script, in the background (never a synchronous run of the script inside a request: the
// studio waited up to 20 s); a script that does not answer gets one « Exporter la vidéo » button
const optionsMemo = new Map(), optionsAsking = new Map();
const optionsKey = (p) => { const s = scriptOf(p); try { return `${s}|${fs.statSync(s).mtimeMs}`; } catch { return null; } };
export function exportOptionsReady(p) {
  if (isHf(p)) return Promise.resolve();
  const key = optionsKey(p); if (!key) return Promise.resolve();
  if (optionsMemo.has(key)) return Promise.resolve();
  if (!optionsAsking.has(key)) optionsAsking.set(key, new Promise((resolve) => {
    execFile(process.execPath, [scriptOf(p), '--options'], { cwd: p.remotion.projet, encoding: 'utf8', windowsHide: true, timeout: 20000 }, (err, out) => {
      let opts = null;
      try {
        const j = JSON.parse(String(out ?? '').trim().split(/\r?\n/).filter((l) => l.trim().startsWith('[')).pop() ?? 'null');
        if (Array.isArray(j)) opts = j.filter((o) => o && typeof o.id === 'string' && o.id.trim()).map((o) => ({ id: o.id.trim(), label: String(o.label ?? o.id) }));
      } catch { /* no --options: the default button */ }
      optionsMemo.set(key, opts?.length ? opts : null); optionsAsking.delete(key); resolve();
    });
  }));
  return optionsAsking.get(key);
}
export function exportOptions(p) {
  if (isHf(p)) return hfOptions();
  const key = optionsKey(p); if (!key) return [];
  if (!optionsMemo.has(key)) exportOptionsReady(p);   // a changed script: asked now, its options on the next request
  // the script's own labels are its words; the default button speaks the user's language
  return optionsMemo.get(key) ?? [{ id: null, label: t('common.exportVideo') }];
}

// can this project be exported from the studio? { ok, why }
export function exportAvailable(p) {
  if (isHf(p)) {
    if (!p.exportRule?.dossier) return { ok: false, why: t('exp.noFolder') };
    return hfFor(p.hf.projet) ? { ok: true, why: null } : { ok: false, why: t('hf.none') };
  }
  if (p.kind !== 'remotion') return { ok: false, why: t('exp.notRemotion') };
  if (!p.exportRule?.dossier) return { ok: false, why: t('exp.noFolder') };
  if (!fs.existsSync(scriptOf(p))) return { ok: false, why: t('exp.noScript', { file: path.join(p.remotion.projet, SCRIPT) }) };
  return { ok: true, why: null };
}

// node -e LAUNCHER <log> <cwd> <node> <script> <args…>: starts the export detached, its output into the log, prints its pid
const LAUNCHER = "const { spawn } = require('child_process'); const fs = require('fs'); const [log, cwd, exe, ...argv] = process.argv.slice(1);"
  + " const fd = fs.openSync(log, 'w'); const c = spawn(exe, argv, { cwd, detached: true, windowsHide: true, stdio: ['ignore', fd, fd] });"
  + " c.unref(); process.stdout.write(String(c.pid)); fs.closeSync(fd);";
// a program started detached (nobody's child: closing the studio does not end it), its output into `log`: its pid
// its environment says which encoder to use: COULISSES_GPU=nvenc | videotoolbox | cpu (lib/gpu.mjs)
export function launchDetached(log, cwd, argv) {
  const r = spawnSync(process.execPath, ['-e', LAUNCHER, log, cwd, ...argv], { encoding: 'utf8', windowsHide: true, timeout: 20000, env: { ...process.env, COULISSES_GPU: gpuEncoder().mode } });
  const pid = parseInt(r.stdout, 10);
  if (!pid) throw new Error(t('exp.noStart', { msg: (r.stderr || r.error?.message || '').trim().split('\n')[0] }));
  return pid;
}
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const NOISE = /X4000|^Copying public dir|^Bundling \d|^Rendered \d|^Encoded \d|^COULISSES PROGRES|^COULISSES IMAGES/;
const clean = (t) => t.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n|\r/).map((l) => l.trimEnd()).filter((l) => l.trim());
export function exportLog(p, n = 160) {
  let t = ''; try { t = fs.readFileSync(exportFiles(p).LOG, 'utf8'); } catch { /* no export yet */ }
  return clean(t).filter((l) => !NOISE.test(l)).slice(-n).join('\n');
}

// { state: running | done | failed | stopped, pct, etape, file, started, ended, error } or null (never exported here)
export function exportState(p) {
  const F = exportFiles(p), s = readJson(F.STATE, null);
  if (!s) return null;
  let txt = ''; try { txt = fs.readFileSync(F.LOG, 'utf8'); } catch { /* not started yet */ }
  let pct = null, etape = null, fin = null, remplace = null, frames = null;
  for (const l of clean(txt)) {
    let m = /^COULISSES PROGRES\s+(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(l.trim());
    if (m) { pct = Math.max(0, Math.min(100, +m[1].replace(',', '.'))); if (m[2]) etape = m[2]; continue; }
    // the frames rendered so far (the contract, docs\FICHE-COULISSES-REMOTION.md: optional)
    m = /^COULISSES IMAGES\s+(\d+)\s+(\d+)/.exec(l.trim());
    if (m) { frames = { done: +m[1], total: +m[2] }; continue; }
    m = /^COULISSES FIN\s+"?(.+?)"?\s*$/.exec(l.trim());
    if (m) { fin = m[1]; continue; }
    m = /^COULISSES REMPLACE\s+"?(.+?)"?\s*$/.exec(l.trim());
    if (m) remplace = m[1];
  }
  if (s.state === 'running') {   // the script ended since the last look (the studio may have been closed meanwhile)
    if (fin && fs.existsSync(fin)) Object.assign(s, { state: 'done', ended: nowIso(), file: fin });
    else if (!alive(s.pid)) Object.assign(s, { state: 'failed', ended: nowIso(), error: exportLog(p, 6).split('\n').slice(-3).join(' · ') || t('exp.stopped') });
    if (s.state !== 'running') writeJson(F.STATE, s);
  }
  // (a script that does not say its frames — HyperFrames: its percentage of the frames it knows)
  if (!frames && s.total && pct != null && etape !== 'fin') frames = { done: Math.round(s.total * Math.min(100, pct) / 100), total: s.total };
  if (s.state === 'done' && frames) frames = { done: frames.total, total: frames.total };
  return { ...s, pct: s.state === 'done' ? 100 : pct, etape, frames, file: s.file ?? fin ?? null, remplace };
}

export function startExport(p, { qualite = null, vitesse = 1, log = () => {} } = {}) {
  const v = speedOf(vitesse ?? 1);
  if (v === null) throw new Error(t('exp.speed', { v: vitesse }));
  vitesse = v;
  const a = exportAvailable(p);
  if (!a.ok) throw new Error(a.why);
  if (exportState(p)?.state === 'running') throw new Error(t('exp.running'));
  const F = exportFiles(p);
  fs.mkdirSync(p.REVUE, { recursive: true });
  fs.mkdirSync(p.exportRule.dossier, { recursive: true });
  const opts = exportOptions(p), opt = qualite ? opts.find((o) => o.id === qualite) : opts[0];
  if (qualite && !opt) throw new Error(t('exp.unknown', { q: qualite, list: opts.map((o) => o.id).join(', ') }));
  const hf = isHf(p) ? hfFor(p.hf.projet) : null;
  const name = String(p.title ?? 'video').normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50) || 'video';
  if (!hf) writeJson(F.PROPS, p.remotion.props ?? {});
  const hc = hf ? hfComposition(p.hf.projet, p.hf.index) : null;   // (4K: landscape or portrait, as the composition is)
  const argv = hf ? [HF_RUN, hf.cli, p.hf.projet, p.exportRule.dossier, name, opt?.id === '4k' ? 'delivery' : 'looks', opt?.id === '4k' ? ((hc?.height ?? 0) > (hc?.width ?? 1) ? 'portrait-4k' : 'landscape-4k') : '']
    : [scriptOf(p), '--composition', p.remotion.composition, '--props', F.PROPS, '--dossier', p.exportRule.dossier, '--titre', p.title ?? p.remotion.composition,
      ...(opt?.id ? ['--qualite', opt.id] : [])];
  // through a launcher that exits at once: the script is then nobody's child, so closing the studio (whose whole process
  // tree is ended by the hub or Ctrl+C) does not end an export of one or two hours. Its environment says the encoder:
  // COULISSES_GPU=nvenc | videotoolbox | cpu (lib/gpu.mjs: the GPU by default, user request 14/10/2026)
  const g = gpuEncoder();
  const cwd = hf ? p.hf.projet : p.remotion.projet;
  const r = spawnSync(process.execPath, ['-e', LAUNCHER, F.LOG, cwd, process.execPath, EXPORT_RUN, String(vitesse), cwd, process.execPath, ...argv], { encoding: 'utf8', windowsHide: true, timeout: 20000, env: { ...process.env, COULISSES_GPU: g.mode } });
  const pid = parseInt(r.stdout, 10);
  if (!pid) throw new Error(t('exp.noStart', { msg: (r.stderr || r.error?.message || '').trim().split('\n')[0] }));
  const s = { state: 'running', pid, started: nowIso(), composition: hf ? 'hyperframes' : p.remotion.composition, dossier: p.exportRule.dossier, script: hf ? `hyperframes ${hf.version} render` : scriptOf(p), qualite: opt?.id ?? null, label: opt?.label ?? null, gpu: g.mode, vitesse,
    ...(hc?.duration && hc?.fps ? { total: Math.round(hc.duration * hc.fps) } : {}) };   // (its frames, for the count: HyperFrames says a percentage)
  writeJson(F.STATE, s);
  log(t('exp.log.started', { pid, script: s.script, dir: p.exportRule.dossier }));
  log(g.mode === 'cpu' ? t('exp.log.cpu') : t('exp.log.gpu', { name: g.name }));
  return s;
}

export function stopExport(p, { log = () => {} } = {}) {
  const F = exportFiles(p), s = readJson(F.STATE, null);
  if (!s || s.state !== 'running') throw new Error(t('exp.none'));
  spawnSync('taskkill', ['/PID', String(s.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  Object.assign(s, { state: 'stopped', ended: nowIso() });
  writeJson(F.STATE, s);
  log(t('exp.log.stopped', { pid: s.pid }));
  return s;
}
