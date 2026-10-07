#!/usr/bin/env node
// What the Claude session uses to work the studio's batches (protocol: AGENT.md). Writes only revue/replies.json
// (Claude's file) and revue/runs/ (snapshots); never revue/notes.json (the page's file).
//   wait     <ep>                      wait for a batch sent from the tool, print it, exit (run in the background:
//                                      its exit wakes the session); while waiting, the tool shows « Claude surveille »
//   take     <ep> <lot>                the tool shows « l'agent corrige » on the batch and its notes
//   snapshot <ep> <lot> <file…>        copy the files BEFORE changing them (« Annuler cette correction »)
//   frame    <ep> <frame> [--source code|video] [--out f.jpg] [--width w]   one image (the eyes)
//   sheet    <ep> <note id> [--before video|code] [--after code|video]      strips before / after
//                                      -> revue/images/claude-<id>-avant.jpg / -apres.jpg (attached by reply)
//   reply    <ep> <note id> "<text>" [--status done|open|working] [--image f]… [--no-images]
//   done     <ep> <lot> "<summary>" [--declined]      (on a render request: I have watched the new video)
//   render   <ep> [<lot>] [--only checks,render,finish] [--frames a-b] [--out f.mp4]
//                                      the full re-render asked from the tool (run in the background): the five checks,
//                                      npx remotion render, finish-render.sh; progress in revue/render.json (lib/render.mjs)
//   undo     <ep> <lot> [--redo]
//   updates  <ep> [--agent claude|codex]   what may need updating on the agent's side (Remotion, skills): checked
//                                      at every batch sent from the tool; this re-checks now (lib/updates.mjs)
//   status   <ep>
// Common flags: --theatre / --episodes / --remotion (the sandbox), as for studio-server.mjs.
// <ep> = a Brambleshire episode (E03), or the folder of an imported project (or its revue folder, lib/projects.mjs):
// there, no live preview (frame / sheet use the video), no staging, and no render from the studio.
import fs from 'node:fs';
import path from 'node:path';
import { optionsFrom, episode, readJson, writeJson, nowIso, stillSource, pad3, flagsOf } from './lib/episode.mjs';
import { videoFrame, codeFrame, codeFrames, tile, closeCode, probeVideo } from './lib/frames.mjs';
import { lotNumbers, readLot, lotFile } from './lib/lots.mjs';
import { resolveTarget } from './lib/projects.mjs';
import { snapshot, finish, step, listRuns } from './lib/runs.mjs';
import { runRender, markReviewed, PHASES } from './lib/render.mjs';
import { checkUpdates, updatesLine, updatesMarkdown } from './lib/updates.mjs';
import { detectAgent, agentById } from './lib/agent.mjs';

const argv = process.argv.slice(2);
const FLAGS_WITH_VALUE = new Set(['--theatre', '--episodes', '--remotion', '--source', '--out', '--width', '--status', '--image', '--before', '--after', '--timeout', '--only', '--frames', '--agent', '--depuis', '--dossier', '--titre', '--chaine', '--format', '--projet', '--entree', '--module', '--timeline', '--composition', '--props', '--export', '--motif', '--nom']);
const pos = []; const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { if (FLAGS_WITH_VALUE.has(a)) { (flags[a] ??= []).push(argv[++i]); } else flags[a] = [true]; }
  else pos.push(a);
}
const flag = (k, d) => flags[k]?.[0] ?? d;
const [cmd, epArg, ...rest] = pos;
const die = (m) => { console.error(m); process.exit(1); };

// « projet creer » / « projet verifier »: the .coulisses file of a run (docs\FICHE-COULISSES-REMOTION.md), before any episode
if (cmd === 'projet') {
  const { createCoulisses } = await import('./lib/coulisses-file.mjs');
  const { checkProject } = await import('./lib/coulisses-check.mjs');
  if (epArg === 'creer') {
    // the values, from a JSON file (--depuis, recommended: no French text through the shell) and / or flags
    const spec = flag('--depuis') ? readJson(path.resolve(flag('--depuis')), null) : {};
    if (flag('--depuis') && !spec) die(`--depuis : JSON illisible (${flag('--depuis')})`);
    const v = (k) => flag(`--${k}`) ?? spec?.[k];
    let props = spec?.props ?? {};
    if (flag('--props')) { props = readJson(path.resolve(flag('--props')), null); if (!props) die('--props : fichier JSON illisible'); }
    try {
      const file = createCoulisses({ dossier: v('dossier') && path.resolve(v('dossier')), titre: v('titre'), chaine: v('chaine'), format: v('format'), projet: v('projet') && path.resolve(v('projet')),
        entree: v('entree'), module: v('module'), timeline: v('timeline'), composition: v('composition'), props, exportDossier: v('export'), exportMotif: v('motif'), nom: v('nom') });
      console.log(file);
    } catch (e) { die(e.message); }
    process.exit(0);
  }
  if (epArg === 'verifier') {
    const file = rest[0]; if (!file) die('usage: node studio-cli.mjs projet verifier "<fichier.coulisses>" [--rapide]');
    const r = await checkProject(file, { quick: !!flags['--rapide'], log: (m) => console.error(`… ${m}`) });
    for (const x of r.ok) console.log(`  ok   ${x}`);
    for (const x of r.warnings) console.log(`  !    ${x}`);
    for (const x of r.errors) console.log(`  ÉCHEC ${x}`);
    console.log(r.errors.length ? `\nPROJET NON CONFORME : ${r.errors.length} problème(s) à corriger, puis relancer cette commande.` : `\nPROJET CONFORME : Coulisses peut l'ouvrir et le rejouer avant tout export.${r.image ? ` Regarder l'image de vérification : "${r.image}".` : ''}`);
    process.exit(r.errors.length ? 1 : 0);
  }
  die('usage: node studio-cli.mjs projet creer --depuis <spec.json> | --dossier … --titre … --projet … --composition …   ·   projet verifier "<fichier.coulisses>"');
}
if (!cmd || !epArg) die('usage: node studio-cli.mjs <wait|take|snapshot|frame|sheet|reply|done|render|undo|status> <ep> …  (voir AGENT.md)');
const P = resolveTarget(epArg, optionsFrom(argv));
const B = P.kind === 'brambleshire', CODE = B || P.kind === 'remotion';   // CODE: a live preview of the code exists
const FPS = B ? readJson(P.SNAP, {})?.fps ?? 30 : (stillSource(P) ? probeVideo(stillSource(P)).fps : 30);   // a Remotion run with no export yet: frames are the code's
const replies = () => { const r = readJson(P.REPLIES, { notes: {} }); r.notes ??= {}; r.lots ??= {}; return r; };
const notesById = () => Object.fromEntries((readJson(P.NOTES, { notes: [] }).notes ?? []).map((n) => [n.id, n]));
const rel = (f) => path.relative(P.REVUE, f).split(path.sep).join('/');
const log = (m) => console.error(`… ${m}`);
const AG = agentById(flag('--agent')) ?? detectAgent();   // who runs these commands: shown in the tool

async function main() {
  switch (cmd) {
    case 'wait': {
      const beat = (waiting, lastLot) => writeJson(P.AGENT, { pid: process.pid, since, beat: nowIso(), waiting, lastLot: lastLot ?? null, agent: AG ? { id: AG.id, name: AG.name } : null });
      const since = nowIso(), limit = +(flag('--timeout', 0)) * 1000, t0 = Date.now();
      const pendingLot = () => { const r = replies(); return lotNumbers(P).find((n) => !r.lots[n]); };
      let last = 0;
      const stop = () => { try { beat(false); } catch { /* ignore */ } process.exit(0); };
      process.on('SIGINT', stop); process.on('SIGTERM', stop);
      for (;;) {
        const n = pendingLot();
        if (n) {
          beat(false, n);
          console.log(`${readLot(P, n)?.kind === 'render' ? `DEMANDE DE RENDU (lot ${n}) REÇUE` : `LOT ${n} REÇU`} de l'outil (${P.ep}). Demande complète ci-dessous (aussi dans "${lotFile(P, n, 'md')}").\n`);
          console.log(fs.readFileSync(lotFile(P, n, 'md'), 'utf8'));
          console.log(`\nQuand ce lot est traité : relance « node "${process.argv[1]}" wait ${argv.slice(1).filter((a) => a !== 'wait').join(' ')} » en tâche de fond pour continuer à surveiller.`);
          return;
        }
        if (limit && Date.now() - t0 > limit) { beat(false); console.log('aucun lot (délai écoulé)'); return; }
        if (Date.now() - last > 5000) { beat(true); last = Date.now(); }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    case 'take': {
      const n = +rest[0], L = readLot(P, n); if (!L) die(`pas de lot ${n}`);
      const r = replies();
      if (r.lots[n] && r.lots[n].status !== 'open') die(`lot ${n} déjà ${r.lots[n].status} (${r.lots[n].at})`);
      const at = nowIso();
      r.lots[n] = { status: 'taken', at };
      for (const e of L.edits) { const x = (r.notes[e.id] ??= {}); x.status = 'working'; x.statusAt = at; }
      writeJson(P.REPLIES, r);
      console.log(L.kind === 'render' ? `demande de rendu ${n} prise : l'outil affiche « l'agent prépare le rendu »` : `lot ${n} pris : ${L.edits.length} note(s) « l'agent corrige » dans l'outil`);
      return;
    }
    case 'snapshot': {
      const n = +rest[0], files = rest.slice(1); if (!n || !files.length) die('usage: snapshot <ep> <lot> <fichier…>');
      const { added, manifest } = snapshot(P, n, files);
      console.log(`lot ${n} : ${added.length} fichier(s) ajouté(s) à l'instantané (${manifest.files.length} en tout)`);
      return;
    }
    case 'frame': {
      const f = +rest[0], source = flag('--source', CODE ? 'code' : 'video');
      if (source === 'code' && !CODE) die('ce projet n\'a pas d\'aperçu du code : --source video (la vidéo revue)');
      const out = path.resolve(flag('--out', path.join(P.IMAGES, `claude-${source}-${f}.jpg`)));
      if (source === 'code') await codeFrame(P, f, out, { log }); else await videoFrame(stillSource(P), f, FPS, out);
      const w = +flag('--width', 0);
      if (w) { const s = out.replace(/(\.\w+)$/, '-w$1'); await videoFrame(out, 0, FPS, s, { width: w }); fs.renameSync(s, out); }
      console.log(out);
      return;
    }
    case 'sheet': {
      const id = rest[0], n = notesById()[id]; if (!n) die(`pas de note ${id}`);
      const b = flag('--before', CODE && !stillSource(P) ? 'code' : 'video'), a = flag('--after', CODE ? 'code' : 'none');
      if (!CODE && (a === 'code' || b === 'code')) die('ce projet n\'a pas d\'aperçu du code : la bande « après » se fait sur ta capture de la correction (reply --image)');
      // frames shown: a point note = 8 images around it (every 2nd), a range = up to ~16 across it (as note-sheets.py)
      let first, step, count;
      if (n.end == null || n.end <= n.frame) { first = Math.max(0, n.frame - 6); step = 2; count = 8; }
      else { step = Math.max(1, Math.ceil((n.end - n.frame + 1) / 12)); first = Math.max(0, n.frame - 2 * step); count = Math.floor((n.end + 2 * step - first) / step) + 1; }
      const frames = Array.from({ length: count }, (_, i) => first + i * step);
      const tmp = path.join(P.REVUE, 'lots', '.sheet-tmp');
      const side = async (source, tag) => {
        const dir = path.join(tmp, tag); let files;
        if (source === 'code') files = await codeFrames(P, frames[0], frames.at(-1), step, dir, { log });
        else { fs.rmSync(dir, { recursive: true, force: true }); files = []; for (const f of frames) { const o = path.join(dir, `${pad3(files.length)}.jpg`); await videoFrame(stillSource(P), f, FPS, o, { width: 480 }); files.push(o); } }
        const out = path.join(P.IMAGES, `claude-${id}-${tag}.jpg`);
        await tile(files, out, { cols: 4, width: 480, labels: frames.map((f) => `${f}${source === 'code' ? ' code' : ''}`) });
        return out;
      };
      const before = await side(b, 'avant'), after = a === 'none' ? null : await side(a, 'apres');
      fs.rmSync(tmp, { recursive: true, force: true });
      console.log(`avant (${b}) : ${before}${after ? `\naprès (${a}) : ${after}` : '\naprès : pas d\'aperçu du code pour ce projet ; joins ta capture de la correction (reply --image)'}`);
      return;
    }
    case 'reply': {
      const [id, text] = rest; if (!id || text === undefined) die('usage: reply <ep> <note id> "<texte>" [--status done|open|working] [--image f]…');
      if (!notesById()[id]) die(`pas de note ${id} dans notes.json`);
      const status = flag('--status', 'done'); if (!['done', 'open', 'working'].includes(status)) die('--status done|open|working');
      const imgs = [];
      for (const f of flags['--image'] ?? []) {
        let abs = path.resolve(P.REVUE, f);
        if (!fs.existsSync(abs)) die(`image absente : ${abs}`);
        if (!abs.toLowerCase().startsWith(P.REVUE.toLowerCase() + path.sep)) { const c = path.join(P.IMAGES, `claude-${id}-${Date.now().toString(36)}${path.extname(abs)}`); fs.copyFileSync(abs, c); abs = c; }
        imgs.push(rel(abs));
      }
      if (!flags['--no-images']) for (const tag of ['avant', 'apres']) { const f = path.join(P.IMAGES, `claude-${id}-${tag}.jpg`); if (fs.existsSync(f) && !imgs.includes(rel(f))) imgs.push(rel(f)); }
      const r = replies(), at = nowIso(), e = (r.notes[id] ??= {});
      let t = text; const m = e.remap; if (m) t += `\nDans la nouvelle vidéo : image ${m.frame}${m.end != null ? ` → ${m.end}` : ''} (la note y est recalée).`;
      e.messages = [...(e.messages ?? []), { text: t, images: imgs.map((file) => ({ file, at })), at, ...(AG ? { by: AG.name } : {}) }];
      e.status = status; e.statusAt = at;
      writeJson(P.REPLIES, r);
      console.log(`${id} : ${status}, ${imgs.length} image(s), ${e.messages.length} message(s)`);
      return;
    }
    case 'done': {
      const n = +rest[0], L = readLot(P, n); if (!L) die(`pas de lot ${n}`);
      const mf = finish(P, n), r = replies(), at = nowIso();
      r.lots[n] = { status: flags['--declined'] ? 'declined' : 'done', at, message: rest[1] ?? '', files: mf ? mf.files.filter((x) => x.changed).map((x) => x.rel) : [] };
      for (const e of L.edits) { const x = r.notes[e.id]; if (x?.status === 'working') { x.status = 'open'; x.statusAt = at; } }   // never left « en cours »
      writeJson(P.REPLIES, r);
      if (L.kind === 'render') { markReviewed(P, rest[1] ?? ''); console.log(`demande de rendu ${n} close : l'outil affiche « Rendu vérifié par l'agent »`); return; }
      console.log(`lot ${n} clos (${r.lots[n].status})${mf ? ` · ${r.lots[n].files.length} fichier(s) modifié(s), annulable depuis l'outil` : ' · aucun instantané : pas d\'annulation possible'}`);
      return;
    }
    case 'render': {
      if (!B) die('ce projet ne se rend pas depuis le studio : l\'utilisateur l\'exporte lui-même, et le studio charge seul la nouvelle version');
      const n = rest[0] ? +rest[0] : null, L = n ? readLot(P, n) : null;
      if (n && !L) die(`pas de lot ${n}`);
      const only = String(flag('--only', PHASES.join(','))).split(',').map((x) => x.trim()).filter((x) => PHASES.includes(x));
      if (!only.length) die(`--only : ${PHASES.join(', ')}`);
      if (n) { const r = replies(); if (!r.lots[n]) { r.lots[n] = { status: 'taken', at: nowIso() }; writeJson(P.REPLIES, r); } }
      const again = `node "${process.argv[1]}" ${argv.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`;
      const S = await runRender(P, { lot: n, only, frames: flag('--frames'), out: flag('--out'), log });
      const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('fr-FR').slice(0, 5) : '?');
      for (const c of S.checks) console.log(`  ${c.status === 'ok' ? 'ok   ' : c.status === 'fail' ? 'ÉCHEC' : '…    '} ${c.label} : ${c.detail}${c.toJudge ? ` (${c.toJudge} apparitions / disparitions en vue à juger)` : ''}`);
      if (S.render?.stage === 'done') console.log(`  rendu : ${S.render.total} images, ${hm(S.render.startedAt)} → ${hm(S.render.endedAt)}${S.render.output ? ` → "${S.render.output}"` : ''}`);
      for (const x of S.finish?.steps ?? []) console.log(`  ${x.label}`);
      if (S.state === 'rendered') {
        const lu = S.finish?.loudness ?? {};
        console.log(`\nRENDU TERMINÉ${S.video ? ` : "${S.video.name}"` : ''}${S.finish?.duration ? ` · ${S.finish.duration.toFixed(1)} s` : ''}${lu.I != null ? ` · Integrated ${lu.I} LUFS` : ''}${lu.peak != null ? ` · True peak ${lu.peak} dBTP` : ''}${S.finish?.remapped != null ? ` · ${S.finish.remapped} note(s) recalée(s)` : ''}.`);
        console.log(`À faire : vérifier Integrated ≈ −16 LUFS et True peak ≤ −1,0 dBTP, regarder la vidéo entière (étape 6 du skill), puis ${n ? `node "${process.argv[1]}" done ${P.ep}${flagsOf(P) ? ' ' + flagsOf(P) : ''} ${n} "<ce que j'ai vu>"` : 'le dire à l\'utilisateur'}.`);
        return;
      }
      if (S.state === 'checked' || S.state === 'rendered-raw') { console.log(`\n${S.state === 'checked' ? 'CONTRÔLES PASSÉS' : 'RENDU FAIT (sans finition)'}.`); return; }
      console.log(`\n${S.state === 'blocked' ? 'RENDU NON LANCÉ' : S.state === 'cancelled' ? 'RENDU ARRÊTÉ' : 'RENDU EN ÉCHEC'} : ${S.error}`);
      if (S.tail.length) console.log('Dernières lignes :\n' + S.tail.slice(-8).map((l) => '    ' + l).join('\n'));
      console.log(`Journal complet : "${path.join(P.REVUE, 'render.log')}".${S.state === 'cancelled' ? ' Arrêté par l\'utilisateur : ne pas relancer sans qu\'il le demande.' : ` Après correction, relancer : ${again}`}`);
      await closeCode(); process.exit(1);
    }
    case 'undo': {
      const res = step(P, +rest[0], flags['--redo'] ? 'redo' : 'undo', AG?.name ?? 'l\'agent');
      if (!res.ok) die(res.why);
      console.log(`lot ${rest[0]} ${flags['--redo'] ? 'rétabli' : 'annulé'} : ${res.files.join(', ')}`);
      return;
    }
    case 'updates': {
      const u = await checkUpdates(P, { agent: AG ?? agentById('claude'), fresh: true });
      console.log(updatesLine(u)); console.log(''); console.log(updatesMarkdown(u, { cli: `node "${process.argv[1]}"`, target: P.target }).join('\n'));
      return;
    }
    case 'status': {
      const r = replies(), runs = listRuns(P), a = readJson(P.AGENT, null);
      console.log(`${P.ep} · ${P.EP}`);
      console.log(`session qui surveille : ${a?.waiting && Date.now() - Date.parse(a.beat) < 20000 ? 'oui' : 'non'}`);
      for (const n of lotNumbers(P)) {
        const L = readLot(P, n);
        console.log(`lot ${n} · ${L.edits.length} modif(s) · ${L.sentAt} · agent : ${r.lots[n]?.status ?? 'pas encore pris'}${runs[n] ? ` · instantané : ${runs[n].state}` : ''}`);
      }
      const drafts = Object.values(notesById()).filter((x) => x.draft).length;
      console.log(`${drafts} modif(s) en attente d'envoi dans l'outil`);
      return;
    }
    default: die(`commande inconnue : ${cmd}`);
  }
}
main().then(() => closeCode()).then(() => process.exit(0)).catch(async (e) => { await closeCode(); die(`erreur : ${e.message}`); });
