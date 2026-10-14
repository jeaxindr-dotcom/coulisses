// An export at another speed (user request, 14/10/2026: « exporter à une autre vitesse, vidéo et audio synchro avec la
// vitesse » — « une molette allant de 0,5 à 2,0, chaque cran de 0,1 »). lib/export.mjs starts THIS, detached, instead of
// the export itself: it runs the export (the project's script, or lib/hf-render-run.mjs) and passes its words on to the
// log (COULISSES PROGRES / REMPLACE / FIN, the contract of docs\FICHE-COULISSES-REMOTION.md); at ×1 that is all.
// At any other speed (×0,5 to ×2,0), once the export is done, every video it wrote (the main file — « COULISSES FIN » —
// and the others it made in the same folder meanwhile, as the 1080p drawn from a 4K) gets its copy next to it,
// « <nom>-x1.3.mp4 », picture and sound together (lib/speed.mjs). The export itself stays as it is (×1): it is the video
// the studio reviews, frame for frame with the code and the notes.
// The progress of the export is told as 0–90 %, the copies 90–100 %; « COULISSES FIN » names the copy of the main file.
// usage: node lib/export-run.mjs <vitesse 0.5…2> <cwd> <node> <script> <args…>
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { speedUp, speedOf, spedName, speedWords, SPED } from './speed.mjs';

const [speedArg, cwd, exe, ...argv] = process.argv.slice(2);
const SPEED = speedOf(speedArg);
if (SPEED === null || !exe || !argv.length) { console.error('usage: export-run.mjs <vitesse 0.5…2> <cwd> <node> <script> <args…>'); process.exit(2); }
const FAST = SPEED !== 1, started = Date.now();
if (FAST) console.log(`vitesse : ${speedWords(SPEED)} — l'export à ×1, puis sa copie à cette vitesse (image et son ensemble)${SPEED < 1 ? ', les images répétées' : ''}`);

let fin = null, child = null;
const take = (out) => {
  let buf = '';
  return (chunk) => {
    buf += String(chunk);
    const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const l of lines) {
      const t = l.trim();
      let m = /^COULISSES PROGRES\s+(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(t);
      if (m && FAST) { out.write(`COULISSES PROGRES ${Math.floor(+m[1].replace(',', '.') * 0.9)} ${m[2]}\n`); continue; }
      m = /^COULISSES FIN\s+"?(.+?)"?\s*$/.exec(t);
      if (m) { fin = m[1]; if (FAST) continue; }   // at another speed: said once the copies are made
      out.write(l + '\n');
    }
  };
};
child = spawn(exe, argv, { cwd, windowsHide: true, env: process.env });
child.stdout.on('data', take(process.stdout));
child.stderr.on('data', (d) => process.stderr.write(d));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => { try { child?.kill(); } catch { /* gone */ } process.exit(130); });
child.on('error', (e) => { console.error(e.message); process.exit(1); });
child.on('close', async (code) => {
  child = null;
  if (code !== 0) process.exit(code ?? 1);
  if (!FAST) process.exit(0);
  if (!fin || !fs.existsSync(fin)) { console.error('vitesse : l\'export n\'a pas dit son fichier final (COULISSES FIN) : pas de copie à une autre vitesse'); process.exit(1); }
  // the videos of this export: its main file, and the others it wrote in the same folder since it started
  const dir = path.dirname(fin), files = [fin];
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (f === fin || !/\.mp4$/i.test(n) || /\.tmp\.mp4$/i.test(n) || SPED.test(n)) continue;
    try { if (fs.statSync(f).mtimeMs >= started - 2000) files.push(f); } catch { /* gone */ }
  }
  try {
    for (const [k, f] of files.entries()) {
      const out = await speedUp(f, SPEED, { log: (l) => console.log(l), onChild: (c) => { child = c; },
        onProgress: (x) => console.log(`COULISSES PROGRES ${Math.floor(90 + 10 * (k + x) / files.length)} vitesse ${speedWords(SPEED)}`) });
      console.log(`→ ${out}`);
    }
  } catch (e) { console.error(`vitesse ${speedWords(SPEED)} : ${e.message} (l'export à ×1 est là : ${fin})`); process.exit(1); }
  console.log('COULISSES PROGRES 100 fin');
  console.log(`COULISSES FIN "${spedName(fin, SPEED)}"`);
  process.exit(0);
});
