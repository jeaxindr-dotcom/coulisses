// Undo per correction (user choice: « instantanés par lot »; 06_Remotion is not under git).
// Before touching files for batch N, Claude runs `studio-cli.mjs snapshot <ep> N <files…>`: each file is copied to
// revue/runs/NNN/before/ with its sha256 (or noted as "did not exist"). `done` copies what the files became to after/.
// The page's « Annuler cette correction » puts the before copies back — refused, file by file, if a file changed since
// the correction (someone edited it after): nothing is overwritten that the batch did not write. « Rétablir » does the
// opposite. manifest.json is written by the CLI (Claude), state.json by whoever undoes / redoes (page or CLI).
import fs from 'node:fs';
import path from 'node:path';
import { pad3, readJson, writeJson, sha, nowIso } from './episode.mjs';

const runDir = (p, lot) => path.join(p.RUNS, pad3(lot));
export const manifestOf = (p, lot) => readJson(path.join(runDir(p, lot), 'manifest.json'), null);
export const stateOf = (p, lot) => readJson(path.join(runDir(p, lot), 'state.json'), { state: 'applied', history: [] });

export function snapshot(p, lot, files) {
  const dir = runDir(p, lot), mf = manifestOf(p, lot) ?? { lot: +lot, episode: p.ep, created: nowIso(), files: [] };
  const added = [];
  for (const f of files) {
    const abs = path.resolve(p.remotionDir ?? p.EP, f);   // an imported project: relative to its folder
    const inside = (root) => !!root && abs.toLowerCase().startsWith((root + path.sep).toLowerCase());   // Windows: case-insensitive
    if (!inside(p.remotionDir) && !inside(p.EP)) throw new Error(p.remotionDir ? `hors du projet Remotion et de l'épisode : ${abs}` : `hors du dossier du projet : ${abs}`);
    if (mf.files.some((x) => x.abs === abs)) continue;   // first snapshot wins: it is the state before the batch
    const i = mf.files.length, existed = fs.existsSync(abs);
    if (existed) { fs.mkdirSync(path.join(dir, 'before'), { recursive: true }); fs.copyFileSync(abs, path.join(dir, 'before', `${i}.bak`)); }
    const rel = inside(p.remotionDir) ? path.relative(p.remotionDir, abs) : p.remotionDir ? path.join(`[${p.ep}]`, path.relative(p.EP, abs)) : path.relative(p.EP, abs);
    mf.files.push({ i, abs, rel, existed, before: existed ? sha(abs) : null, after: null });
    added.push(abs);
  }
  writeJson(path.join(dir, 'manifest.json'), mf);
  return { manifest: mf, added };
}
export function finish(p, lot) {
  const dir = runDir(p, lot), mf = manifestOf(p, lot);
  if (!mf) return null;
  for (const x of mf.files) {
    const exists = fs.existsSync(x.abs);
    x.after = exists ? sha(x.abs) : null;
    x.changed = x.after !== x.before;
    if (exists) { fs.mkdirSync(path.join(dir, 'after'), { recursive: true }); fs.copyFileSync(x.abs, path.join(dir, 'after', `${x.i}.bak`)); }
  }
  mf.finished = nowIso();
  writeJson(path.join(dir, 'manifest.json'), mf);
  return mf;
}
// verb = 'undo' (back to before the batch) | 'redo'
export function step(p, lot, verb, who = 'toi') {
  const dir = runDir(p, lot), mf = manifestOf(p, lot);
  if (!mf) return { ok: false, why: `aucun instantané pour le lot ${lot} : Claude n'a pas enregistré les fichiers avant de corriger` };
  if (!mf.finished) return { ok: false, why: `le lot ${lot} est encore en cours de correction` };
  const st = stateOf(p, lot);
  if (verb === 'undo' && st.state === 'undone') return { ok: false, why: 'déjà annulé' };
  if (verb === 'redo' && st.state !== 'undone') return { ok: false, why: 'rien à rétablir' };
  const files = mf.files.filter((x) => x.changed);
  // every file must be exactly what the batch left (undo) / what was there before it (redo)
  const expect = (x) => (verb === 'undo' ? x.after : x.before), restore = (x) => (verb === 'undo' ? x.before : x.after);
  const moved = files.filter((x) => sha(x.abs) !== expect(x));
  if (moved.length) return { ok: false, why: `modifié depuis la correction : ${moved.map((x) => x.rel).join(', ')} — rien n'a été touché`, files: moved.map((x) => x.rel) };
  for (const x of files) {
    if (restore(x) === null) fs.rmSync(x.abs, { force: true });
    else fs.copyFileSync(path.join(dir, verb === 'undo' ? 'before' : 'after', `${x.i}.bak`), x.abs);
  }
  st.state = verb === 'undo' ? 'undone' : 'applied';
  st.history.push({ verb, at: nowIso(), who, files: files.map((x) => x.rel) });
  writeJson(path.join(dir, 'state.json'), st);
  return { ok: true, state: st.state, files: files.map((x) => x.rel) };
}
export function listRuns(p) {
  if (!fs.existsSync(p.RUNS)) return {};
  const out = {};
  for (const d of fs.readdirSync(p.RUNS)) {
    if (!/^\d{3}$/.test(d)) continue;
    const mf = manifestOf(p, +d); if (!mf) continue;
    out[+d] = { finished: mf.finished ?? null, files: mf.files.filter((x) => x.changed !== false).map((x) => x.rel), ...stateOf(p, +d) };
  }
  return out;
}
