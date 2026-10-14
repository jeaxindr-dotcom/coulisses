// « Créer la copie ×1,3 » in « Envois » (any project): the current video at the speed of the dial, next to it, by
// lib/speed-run.mjs started detached (closing the studio does not stop it). Its state: revue\speed.json (pid, times),
// its output: revue\speed.log (COULISSES PROGRES / FIN, as an export).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, nowIso } from './episode.mjs';
import { launchDetached } from './export.mjs';
import { speedOf, spedName, SPED } from './speed.mjs';
import { t } from './i18n.mjs';

const RUN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'speed-run.mjs');
export const speedFiles = (p) => ({ STATE: path.join(p.REVUE, 'speed.json'), LOG: path.join(p.REVUE, 'speed.log') });
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const lines = (txt) => txt.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n|\r/).map((l) => l.trim()).filter(Boolean);

// { state: running | done | failed | stopped, pct, file, vitesse, video, started, ended, error } or null
export function speedState(p) {
  const F = speedFiles(p), s = readJson(F.STATE, null);
  if (!s) return null;
  let txt = ''; try { txt = fs.readFileSync(F.LOG, 'utf8'); } catch { /* not started yet */ }
  let pct = null, fin = null;
  for (const l of lines(txt)) {
    let m = /^COULISSES PROGRES\s+(\d+)/.exec(l); if (m) { pct = +m[1]; continue; }
    m = /^COULISSES FIN\s+"?(.+?)"?\s*$/.exec(l); if (m) fin = m[1];
  }
  if (s.state === 'running') {
    if (fin && fs.existsSync(fin)) Object.assign(s, { state: 'done', ended: nowIso(), file: fin });
    else if (!alive(s.pid)) Object.assign(s, { state: 'failed', ended: nowIso(), error: lines(txt).filter((l) => !/^COULISSES/.test(l)).slice(-2).join(' · ') || t('spd.stopped') });
    if (s.state !== 'running') writeJson(F.STATE, s);
  }
  return { ...s, pct: s.state === 'done' ? 100 : pct };
}
export function speedLog(p) { try { return lines(fs.readFileSync(speedFiles(p).LOG, 'utf8')).filter((l) => !/^COULISSES PROGRES/.test(l)).slice(-80).join('\n'); } catch { return ''; } }

export function startSpeedCopy(p, video, vitesse, { log = () => {} } = {}) {
  const S = speedOf(vitesse);
  if (S === null || S === 1) throw new Error(t('spd.which', { v: vitesse }));
  if (!video || !fs.existsSync(video)) throw new Error(t('spd.noVideo'));
  if (SPED.test(path.basename(video))) throw new Error(t('spd.isCopy'));
  if (speedState(p)?.state === 'running') throw new Error(t('spd.running'));
  const F = speedFiles(p);
  fs.mkdirSync(p.REVUE, { recursive: true });
  const pid = launchDetached(F.LOG, path.dirname(video), [process.execPath, RUN, String(S), video]);
  const s = { state: 'running', pid, started: nowIso(), vitesse: S, video: path.basename(video), target: spedName(video, S) };
  writeJson(F.STATE, s);
  log(t('spd.log.started', { s: String(S).replace('.', ','), name: path.basename(video) }));
  return s;
}
export function stopSpeedCopy(p, { log = () => {} } = {}) {
  const F = speedFiles(p), s = readJson(F.STATE, null);
  if (!s || s.state !== 'running') throw new Error(t('spd.none'));
  spawnSync('taskkill', ['/PID', String(s.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  Object.assign(s, { state: 'stopped', ended: nowIso() });
  writeJson(F.STATE, s);
  try { fs.rmSync(s.target.replace(/\.mp4$/i, '.tmp.mp4'), { force: true }); } catch { /* */ }
  log(t('spd.log.stopped'));
  return s;
}
