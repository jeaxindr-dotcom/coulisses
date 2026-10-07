// The « .coulisses » project file (user decision: « un fichier style DRP, créé à chaque début de run ») — what a
// pipeline writes at the start of a run so that Coulisses can open the run BEFORE any export: it points to the run's
// Remotion composition, which Coulisses plays live (no MP4), and to the module that describes its timeline.
// Format (JSON, UTF-8), paths absolute or relative to the .coulisses file:
//   {
//     "coulisses": 1,
//     "titre": "Récap IA de la semaine", "chaine": "L'AItelier",
//     "remotion": {
//       "projet": "<folder of the Remotion project: package.json + node_modules>",
//       "entree": "src/index.ts",                 (registerRoot: renders and stills, relative to projet)
//       "module": "src/coulisses.ts",             (export const compositions = [...], relative to projet)
//       "timeline": "src/coulisses-timeline.ts",  (export function timeline(id, props), relative to projet)
//       "composition": "<id>", "props": { … }     (the run's composition and its input props)
//     },
//     "revue": "revue",                           (notes, batches, images: relative to the .coulisses file)
//     "export": { "dossier": "07-renders", "motif": "\\.mp4$" }   (where the final export lands, optional)
//   }
// The full contract (what the Remotion project must provide) is in docs\FICHE-COULISSES-REMOTION.md.
// A Brambleshire Theatre episode has its own: { "coulisses": 1, "moteur": "brambleshire", "episode": "E03", … } — it opens
// the episode with Coulisses' built-in engine (3D picking, staging, render), the remotion block being informative only.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, nowIso } from './episode.mjs';

export const EXT = '.coulisses';
export const isCoulissesFile = (f) => typeof f === 'string' && f.toLowerCase().endsWith(EXT);
const abs = (base, p) => (p ? path.resolve(base, p) : null);

// { file, dir, data, title, channel, revue, remotion: { projet, entree, module, timeline, composition, props, public }, export, errors }
export function readCoulisses(file) {
  const f = path.resolve(String(file).replace(/^"(.*)"$/, '$1'));
  const data = readJson(f, null), errors = [];
  if (!data) return { file: f, errors: [`illisible (JSON attendu) : ${f}`] };
  const dir = path.dirname(f), R = data.remotion ?? {};
  if (data.coulisses !== 1) errors.push('« coulisses » doit valoir 1 (version du format)');
  if (data.moteur === 'brambleshire') {   // an episode of Brambleshire Theatre: the built-in engine
    if (!/^E\d+$/i.test(data.episode ?? '')) errors.push('« episode » attendu (ex. E03) pour le moteur brambleshire');
    return { file: f, dir, data, moteur: 'brambleshire', episode: String(data.episode ?? '').toUpperCase(), title: data.titre ?? data.episode, channel: data.chaine ?? 'Brambleshire Theatre', revue: abs(dir, data.revue ?? 'revue'), remotion: null, export: null, errors };
  }
  if (!data.titre) errors.push('« titre » manque');
  const projet = abs(dir, R.projet);
  if (!projet) errors.push('« remotion.projet » manque (le dossier du projet Remotion)');
  else if (!fs.existsSync(path.join(projet, 'package.json'))) errors.push(`pas de package.json dans le projet Remotion : ${projet}`);
  else if (!fs.existsSync(path.join(projet, 'node_modules', 'remotion'))) errors.push(`remotion n'est pas installé dans ${projet} (npm install)`);
  const at = (k, d) => (projet ? abs(projet, R[k] ?? d) : null);
  const remotion = { projet, entree: at('entree', 'src/index.ts'), module: at('module', 'src/coulisses.ts'), timeline: at('timeline', 'src/coulisses-timeline.ts'),
    composition: R.composition ?? null, props: R.props ?? {}, public: projet ? path.join(projet, 'public') : null };
  if (projet) for (const k of ['entree', 'module']) if (!fs.existsSync(remotion[k])) errors.push(`fichier introuvable (remotion.${k}) : ${remotion[k]}`);
  if (projet && !fs.existsSync(remotion.timeline)) remotion.timeline = null;   // optional: then the module's own timeline()
  if (!remotion.composition) errors.push('« remotion.composition » manque (l\'id de la composition du run)');
  const exp = data.export ? { dossier: abs(dir, data.export.dossier ?? '.'), motif: new RegExp(data.export.motif ?? '\\.(mp4|mov|mkv|webm)$', 'i') } : null;
  return { file: f, dir, data, title: data.titre, channel: data.chaine ?? null, format: data.format ?? null, revue: abs(dir, data.revue ?? 'revue'), remotion, export: exp, errors };
}

// what a pipeline calls at the start of a run (studio-cli.mjs projet creer …): writes <dossier>\<titre>.coulisses
export function createCoulisses({ dossier, titre, chaine = null, format = null, projet, entree, module, timeline, composition, props, exportDossier, exportMotif, nom }) {
  if (!dossier || !titre || !projet || !composition) throw new Error('il faut --dossier, --titre, --projet et --composition');
  fs.mkdirSync(dossier, { recursive: true });
  const safe = (nom ?? titre).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'projet';
  const file = path.join(dossier, safe + EXT);
  const rel = (p) => { const r = path.relative(dossier, path.resolve(p)); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : path.resolve(p); };
  const data = {
    coulisses: 1, titre, chaine, format, cree: nowIso(),
    remotion: { projet: rel(projet), entree: entree ?? 'src/index.ts', module: module ?? 'src/coulisses.ts', timeline: timeline ?? 'src/coulisses-timeline.ts', composition, props: props ?? {} },
    revue: 'revue',
    ...(exportDossier ? { export: { dossier: rel(path.resolve(dossier, exportDossier)), motif: exportMotif ?? '\\.mp4$' } } : {}),
  };
  writeJson(file, data);
  return file;
}
