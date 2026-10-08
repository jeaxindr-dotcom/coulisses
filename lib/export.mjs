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
import { spawn, spawnSync, execFile } from 'node:child_process';
import { readJson, writeJson, nowIso } from './episode.mjs';
import { t } from './i18n.mjs';

export const SCRIPT = path.join('scripts', 'coulisses-rendu.mjs');
export const exportFiles = (p) => ({ STATE: path.join(p.REVUE, 'export.json'), LOG: path.join(p.REVUE, 'export.log'), PROPS: path.join(p.REVUE, 'export-props.json') });
const scriptOf = (p) => (p.remotion?.projet ? path.join(p.remotion.projet, SCRIPT) : null);

// the export variants the script offers (« --options »: a JSON array [{ id, label }], the first is the main button),
// asked once per version of the script, in the background (never a synchronous run of the script inside a request: the
// studio waited up to 20 s); a script that does not answer gets one « Exporter la vidéo » button
const optionsMemo = new Map(), optionsAsking = new Map();
const optionsKey = (p) => { const s = scriptOf(p); try { return `${s}|${fs.statSync(s).mtimeMs}`; } catch { return null; } };
export function exportOptionsReady(p) {
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
  const key = optionsKey(p); if (!key) return [];
  if (!optionsMemo.has(key)) exportOptionsReady(p);   // a changed script: asked now, its options on the next request
  // the script's own labels are its words; the default button speaks the user's language
  return optionsMemo.get(key) ?? [{ id: null, label: t('common.exportVideo') }];
}

// can this project be exported from the studio? { ok, why }
export function exportAvailable(p) {
  if (p.kind !== 'remotion') return { ok: false, why: t('exp.notRemotion') };
  if (!p.exportRule?.dossier) return { ok: false, why: t('exp.noFolder') };
  if (!fs.existsSync(scriptOf(p))) return { ok: false, why: t('exp.noScript', { file: path.join(p.remotion.projet, SCRIPT) }) };
  return { ok: true, why: null };
}

// node -e LAUNCHER <log> <cwd> <node> <script> <args…>: starts the export detached, its output into the log, prints its pid
const LAUNCHER = "const { spawn } = require('child_process'); const fs = require('fs'); const [log, cwd, exe, ...argv] = process.argv.slice(1);"
  + " const fd = fs.openSync(log, 'w'); const c = spawn(exe, argv, { cwd, detached: true, windowsHide: true, stdio: ['ignore', fd, fd] });"
  + " c.unref(); process.stdout.write(String(c.pid)); fs.closeSync(fd);";
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const NOISE = /X4000|^Copying public dir|^Bundling \d|^Rendered \d|^Encoded \d|^COULISSES PROGRES/;
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
  let pct = null, etape = null, fin = null, remplace = null;
  for (const l of clean(txt)) {
    let m = /^COULISSES PROGRES\s+(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(l.trim());
    if (m) { pct = Math.max(0, Math.min(100, +m[1].replace(',', '.'))); if (m[2]) etape = m[2]; continue; }
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
  return { ...s, pct: s.state === 'done' ? 100 : pct, etape, file: s.file ?? fin ?? null, remplace };
}

export function startExport(p, { qualite = null, log = () => {} } = {}) {
  const a = exportAvailable(p);
  if (!a.ok) throw new Error(a.why);
  if (exportState(p)?.state === 'running') throw new Error(t('exp.running'));
  const F = exportFiles(p);
  fs.mkdirSync(p.REVUE, { recursive: true });
  fs.mkdirSync(p.exportRule.dossier, { recursive: true });
  writeJson(F.PROPS, p.remotion.props ?? {});
  const opts = exportOptions(p), opt = qualite ? opts.find((o) => o.id === qualite) : opts[0];
  if (qualite && !opt) throw new Error(t('exp.unknown', { q: qualite, list: opts.map((o) => o.id).join(', ') }));
  const argv = [scriptOf(p), '--composition', p.remotion.composition, '--props', F.PROPS, '--dossier', p.exportRule.dossier, '--titre', p.title ?? p.remotion.composition,
    ...(opt?.id ? ['--qualite', opt.id] : [])];
  // through a launcher that exits at once: the script is then nobody's child, so closing the studio (whose whole process
  // tree is ended by the hub or Ctrl+C) does not end an export of one or two hours
  const r = spawnSync(process.execPath, ['-e', LAUNCHER, F.LOG, p.remotion.projet, process.execPath, ...argv], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  const pid = parseInt(r.stdout, 10);
  if (!pid) throw new Error(t('exp.noStart', { msg: (r.stderr || r.error?.message || '').trim().split('\n')[0] }));
  const s = { state: 'running', pid, started: nowIso(), composition: p.remotion.composition, dossier: p.exportRule.dossier, script: scriptOf(p), qualite: opt?.id ?? null, label: opt?.label ?? null };
  writeJson(F.STATE, s);
  log(t('exp.log.started', { pid, script: scriptOf(p), dir: p.exportRule.dossier }));
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
