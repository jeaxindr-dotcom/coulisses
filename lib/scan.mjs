// « Chercher les .coulisses » of the home screen (user request, 08/10/2026: « scanner tous les .coulisses du PC, soit le PC
// entier, soit un dossier choisi, pour les importer »): every .coulisses file under the roots given (every drive of the PC,
// or one folder), read as Coulisses reads it (title, channel, engine, problems). One search at a time, in the background,
// stopped on demand; the home screen shows its progress and what it found, then imports what the user ticks.
// It never goes into the system's folders, the apps' data, the tools' folders (node_modules, .git…), hidden folders, nor
// through a junction or a link (a junction may loop, or lead to gigabytes of art: never followed). It only reads.
import fs from 'node:fs';
import path from 'node:path';
import { readCoulisses, isCoulissesFile } from './coulisses-file.mjs';

const SKIP = /^(node_modules|bower_components|\.git|\.svn|\.hg|\.cache|\.venv|venv|__pycache__|\$recycle\.bin|system volume information|recovery|perflogs|msocache|config\.msi|windows|windows\.old|program files|program files \(x86\)|programdata|appdata|\$windows\.~bt|\$windows\.~ws|\$winreagent|onedrivetemp|revue)$/i;
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// the drives of the PC (C:\, D:\…), the floppy letters left out
export function drives() {
  const out = [];
  for (let c = 67; c <= 90; c++) { const d = `${String.fromCharCode(c)}:\\`; try { fs.accessSync(d); out.push(d); } catch { /* no such drive */ } }
  return out;
}

let job = null;
export const scanState = () => (job ? { state: job.state, roots: job.roots, dirs: job.dirs, current: job.current, found: job.found, started: job.started, ended: job.ended ?? null, error: job.error ?? null } : null);
export function stopScan() { if (job?.state === 'running') { job.stop = true; return true; } return false; }

// roots: folders to search; skip: folders never entered (Coulisses' own copies, their caches); describe(file) -> extra fields
export function startScan(roots, { skip = [], describe = () => ({}) } = {}) {
  if (job?.state === 'running') throw new Error('busy');
  // a folder chosen by the user is searched even inside one of these (only what is BELOW the roots is avoided)
  const inside = (r, a) => r === a || r.startsWith(a + path.sep);
  const avoid = skip.map((s) => path.resolve(s).toLowerCase()).filter((a) => !roots.some((r) => inside(path.resolve(r).toLowerCase(), a)));
  const j = job = { state: 'running', roots, dirs: 0, current: '', found: [], started: nowIso(), stop: false };
  const queue = roots.map((r) => path.resolve(r));
  const seen = new Set();
  const take = (file) => {
    const k = file.toLowerCase(); if (seen.has(k)) return; seen.add(k);
    let c = null; try { c = readCoulisses(file); } catch (e) { c = { errors: [e.message] }; }
    j.found.push({ file, title: c.title ?? path.basename(file, '.coulisses'), channel: c.channel ?? null, moteur: c.moteur ?? 'remotion',
      problems: c.errors?.length ?? 0, why: c.errors?.[0] ?? null, ...describe(file, c) });
  };
  let active = 0;   // a worker with nothing to do waits while another may still find folders
  async function worker() {
    for (;;) {
      if (j.stop) return;
      const dir = queue.shift();
      if (!dir) { if (!active) return; await new Promise((r) => setTimeout(r, 15)); continue; }
      if (avoid.some((a) => dir.toLowerCase() === a || dir.toLowerCase().startsWith(a + path.sep))) continue;
      j.current = dir; j.dirs++;
      active++;
      let d; try { d = await fs.promises.opendir(dir); } catch { active--; continue; }   // no access: skipped
      try {
        for await (const e of d) {
          if (j.stop) break;
          if (e.isSymbolicLink()) continue;   // a junction or a link: never followed
          if (e.isDirectory()) { if (!SKIP.test(e.name) && !e.name.startsWith('.') && !e.name.startsWith('$')) queue.push(path.join(dir, e.name)); }
          else if (e.isFile() && isCoulissesFile(e.name)) take(path.join(dir, e.name));
        }
      } catch { /* the folder went away */ }
      active--;
    }
  }
  Promise.all(Array.from({ length: 6 }, worker)).then(() => {
    j.state = j.stop ? 'stopped' : 'done'; j.ended = nowIso(); j.current = '';
    j.found.sort((a, b) => (a.channel ?? '~').localeCompare(b.channel ?? '~') || a.file.localeCompare(b.file));
  }, (e) => { j.state = 'failed'; j.error = e.message; j.ended = nowIso(); });
  return scanState();
}
