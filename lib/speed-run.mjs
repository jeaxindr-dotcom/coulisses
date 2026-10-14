// « Créer la copie ×1,3 » in « Envois », for any project (user request 14/10/2026: « dans l'onglet d'envoi, peu importe le
// projet »): the current video at another speed, picture and sound together (lib/speed.mjs), next to it. Started detached
// by the studio (lib/speed-copy.mjs): closing the studio does not stop it. Its output, in the export protocol of Coulisses
// (COULISSES PROGRES <pct> <étape>, COULISSES FIN "<file>"), goes to revue\speed.log.
// usage: node lib/speed-run.mjs <vitesse 0.5…2> <vidéo>
import fs from 'node:fs';
import { speedUp, speedOf, speedWords } from './speed.mjs';

const [s, file] = process.argv.slice(2);
const S = speedOf(s);
if (S === null || S === 1 || !file || !fs.existsSync(file)) { console.error('usage: speed-run.mjs <vitesse 0.5…2, pas 1> <vidéo>'); process.exit(2); }
let child = null;
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => { try { child?.kill(); } catch { /* gone */ } process.exit(130); });
let last = -1;
console.log('COULISSES PROGRES 0 copie');
try {
  const out = await speedUp(file, S, { log: (l) => console.log(l), onChild: (c) => { child = c; },
    onProgress: (x) => { const p = Math.floor(99 * x); if (p !== last) { last = p; console.log(`COULISSES PROGRES ${p} copie ${speedWords(S)}`); } } });
  console.log('COULISSES PROGRES 100 fin');
  console.log(`COULISSES FIN "${out}"`);
} catch (e) { console.error(`vitesse ${speedWords(S)} : ${e.message}`); process.exit(1); }
