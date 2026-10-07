// « studio-cli.mjs projet verifier <fichier.coulisses> »: what a pipeline's agent runs to check that its run can be
// opened in Coulisses (the contract: docs\FICHE-COULISSES-REMOTION.md). In order:
//   1. the file itself (paths, composition id);
//   2. the timeline module, run under Node: its tracks and clips (frames);
//   3. the compositions module, under Node: the run's composition, its fps, size and duration;
//   4. the live preview, compiled like Coulisses does (the browser bundle of the module);
//   5. unless --rapide: a real still of the code by Remotion (the project's entry, registerRoot) — the same composition
//      as the export, and the proof image to look at.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCoulisses } from './coulisses-file.mjs';
import { loadTimeline, loadCompositions, esbuildOf } from './remotion-module.mjs';
import { codeFrame, closeCode } from './frames.mjs';
import { CACHE } from './place.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mmss = (f, fps) => { const s = f / fps; return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`; };

export async function checkProject(file, { quick = false, log = () => {} } = {}) {
  const ok = [], errors = [], warnings = [];
  const c = readCoulisses(file);
  if (c.errors.length) return { ok, errors: c.errors, warnings, file: c.file };
  if (c.moteur === 'video') {   // a run not (yet) in Remotion: the file, where its export will land, its plan
    ok.push(`fichier : « ${c.title} »${c.channel ? ` (${c.channel})` : ''} · run vidéo (pas encore en Remotion : relu sur son export)`);
    const dirs = c.export.dossiers.map((d) => `"${d}"${fs.existsSync(d) ? '' : ' (pas encore créé)'}`).join(', ');
    ok.push(`export attendu dans ${dirs}, fichiers « ${c.export.motif.source} »${c.export.profondeur ? `, jusqu'à ${c.export.profondeur} sous-dossier(s)` : ''}`);
    const found = c.export.dossiers.flatMap((d) => { try { return fs.readdirSync(d).filter((f) => c.export.motif.test(f)); } catch { return []; } });
    if (found.length) ok.push(`export déjà là : ${found.slice(0, 3).join(', ')}${found.length > 3 ? '…' : ''}`);
    if (c.plan && !fs.existsSync(c.plan)) warnings.push(`plan de montage pas encore créé : ${c.plan} (la timeline apparaîtra quand le pipeline l'écrira)`);
    else if (c.plan) {
      try {
        const { tracksOf } = await import('./projects.mjs');
        const t = tracksOf({ kind: 'run', plan: c.plan });
        if (!t || !t.tracks.length) errors.push(`plan de montage illisible ou sans piste : ${c.plan}`);
        else ok.push(`timeline : ${t.tracks.length} piste(s) depuis ${path.basename(c.plan)} (${t.tracks.map((x) => `${x.name} ${x.clips.length}`).join(', ')})`);
      } catch (e) { errors.push(`plan de montage : ${e.message}`); }
    } else warnings.push('pas de plan de montage (« plan ») : la timeline montrera seulement la vidéo');
    return { ok, errors, warnings, file: c.file, video: true };
  }
  if (c.moteur === 'brambleshire') { ok.push(`épisode ${c.episode} de Brambleshire Theatre : Coulisses l'ouvre avec son moteur intégré (3D, mise en scène, rendu)`); return { ok, errors, warnings, file: c.file }; }
  const R = c.remotion;
  ok.push(`fichier : « ${c.title} »${c.channel ? ` (${c.channel})` : ''} · projet Remotion ${R.projet} · composition ${R.composition}`);
  // 2. the timeline
  let tl = null;
  try {
    tl = await loadTimeline(R);
    const n = tl.tracks.reduce((a, t) => a + t.clips.length, 0);
    if (!tl.tracks.length) errors.push('timeline() ne rend aucune piste');
    else ok.push(`timeline : ${tl.tracks.length} piste(s), ${n} clip(s) (${tl.tracks.map((t) => `${t.name} ${t.clips.length}`).join(', ')})`);
    for (const p of tl.problems) errors.push(`timeline : ${p}`);
  } catch (e) { errors.push(`timeline : ${e.message}`); }
  // 3. the compositions module under Node
  let meta = null;
  try {
    const list = await loadCompositions(R);
    meta = list.find((x) => x.id === R.composition) ?? null;
    if (!meta) errors.push(`compositions (src/coulisses.ts) : pas de composition « ${R.composition} » (il y a : ${list.map((x) => x.id).join(', ') || 'aucune'})`);
    else {
      for (const k of ['fps', 'width', 'height', 'durationInFrames']) if (!Number.isFinite(meta[k]) || meta[k] <= 0) errors.push(`composition ${R.composition} : ${k} doit être un nombre positif (lu : ${meta[k]})`);
      if (!meta.component) errors.push(`composition ${R.composition} : component manque`);
      if (!errors.length) ok.push(`composition : ${meta.width}×${meta.height}, ${meta.fps} i/s, ${meta.durationInFrames} images (${mmss(meta.durationInFrames, meta.fps)})`);
      if (tl && tl.frames > meta.durationInFrames) warnings.push(`la timeline va jusqu'à l'image ${tl.frames}, au-delà de la composition (${meta.durationInFrames})`);
    }
  } catch (e) { warnings.push(`le module des compositions ne se charge pas sous Node (accès à window ou document au chargement d'un fichier ?) : ${e.message.split('\n')[0]}. L'aperçu, lui, tourne dans le navigateur : vérifié à l'étape suivante.`); }
  // 4. the live preview bundle
  const out = path.join(CACHE, `coulisses-check-player-${process.pid}.js`);
  try {
    fs.mkdirSync(CACHE, { recursive: true });
    const esbuild = await esbuildOf(R.projet);
    await esbuild.build({
      entryPoints: [path.join(STUDIO, 'player', 'remotion.tsx')], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: out,
      logLevel: 'silent', jsx: 'automatic', nodePaths: [path.join(R.projet, 'node_modules')], alias: { '@coulisses-module': R.module },
      define: { __COMPOSITION__: JSON.stringify(R.composition), __PROPS__: JSON.stringify(R.props ?? {}), 'process.env.NODE_ENV': '"development"' },
      loader: { '.png': 'file', '.jpg': 'file', '.jpeg': 'file', '.webp': 'file', '.svg': 'file', '.glsl': 'text', '.css': 'css' },
    });
    ok.push('aperçu en direct : compilé (le Remotion Player trouve la composition et ses dépendances)');
  } catch (e) {
    const m = (e.errors ?? []).slice(0, 3).map((x) => `${x.location ? path.basename(x.location.file) + ':' + x.location.line + ' ' : ''}${x.text}`).join(' ; ') || e.message;
    errors.push(`aperçu en direct : ne compile pas — ${m}${/@remotion\/player/.test(m) ? ' (installer @remotion/player à la même version que remotion)' : ''}`);
  } finally { fs.rmSync(out, { force: true }); for (const f of fs.readdirSync(CACHE).filter((x) => x.startsWith(`coulisses-check-player-${process.pid}`))) fs.rmSync(path.join(CACHE, f), { force: true }); }
  // 5. a real still by Remotion (the project's entry): the same composition as the export
  let image = null;
  if (!quick && !errors.length) {
    try {
      image = path.join(c.revue, 'images', 'coulisses-verification.jpg');
      const r = await codeFrame({ remotionDir: R.projet, remotion: R }, Math.floor((meta?.durationInFrames ?? 2) / 2), image, { log });
      ok.push(`rendu Remotion : une image du milieu rendue par le projet (${r.width}×${r.height}, ${r.fps} i/s, ${r.durationInFrames} images) → "${image}"`);
      if (meta && (r.width !== meta.width || r.height !== meta.height || r.fps !== meta.fps || r.durationInFrames !== meta.durationInFrames)) {
        errors.push(`la composition du Root (rendu) et celle de src/coulisses.ts diffèrent : rendu ${r.width}×${r.height} ${r.fps} i/s ${r.durationInFrames} images, module ${meta.width}×${meta.height} ${meta.fps} i/s ${meta.durationInFrames} images. Le Root doit construire ses <Composition> à partir de src/coulisses.ts.`);
      }
    } catch (e) { errors.push(`rendu Remotion (entrée ${path.relative(R.projet, R.entree)}, composition ${R.composition}) : ${e.message.split('\n')[0]}`); image = null; }
    finally { await closeCode(); }
  }
  return { ok, errors, warnings, image, file: c.file };
}
