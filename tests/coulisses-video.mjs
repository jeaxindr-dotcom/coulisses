// The « vidéo » .coulisses (moteur: video), on FAKE runs generated in .cache\coulisses-video-test\ (nothing real is touched):
// a run that is not (yet) in Remotion creates its file at its start (`projet creer --moteur video`), `projet verifier`
// passes before anything is exported, the file is re-created with the title known later (same name, same date of
// creation), Coulisses lists the run with no video, then picks its export once it has settled (not a draft, not a file
// still being written), shows the tracks of its plan (the Coulisses timeline format, or an AItelier montage plan), opens
// the studio on it (kind « run »), and the same file turns into a Remotion run with the same notes.
// usage: node tests/coulisses-video.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(STUDIO, '.cache', 'coulisses-video-test'), REG = path.join(FIX, 'projets.json');
process.env.STUDIO_PROJECTS = REG;   // before lib/place.mjs is loaded: the test's own list of projects
process.env.COULISSES_LANG = 'fr';   // the suite checks the French texts (lib/i18n.mjs)
const { importProject, project, tracksOf } = await import('../lib/projects.mjs');
const RUN = path.join(FIX, 'projects', 'test-slug'), AIT = path.join(FIX, 'AItelier', 'long', '2026-10-07_test-ait');
const CLI = path.join(STUDIO, 'studio-cli.mjs'), PORT = 4188;
const SAMPLE = path.join(STUDIO, '.cache', 'coulisses-test', 'remotion-essai');   // tests/coulisses-fixture.mjs
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const cli = (...a) => { const r = spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout + r.stderr).trim() }; };
const old = (f, s = 90) => { const t = (Date.now() - s * 1000) / 1000; fs.utimesSync(f, t, t); };
const ff = (out, size = '1280x720') => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=4`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]); if (r.status) throw new Error('ffmpeg ' + out); };
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

fs.rmSync(FIX, { recursive: true, force: true });
fs.mkdirSync(RUN, { recursive: true });
let studio = null;
try {
  // 1) the start of the run: the file, before anything exists
  const made = cli('projet', 'creer', '--moteur', 'video', '--dossier', RUN, '--nom', 'test-slug', '--titre', 'test-slug', '--chaine', 'Vidéo du monde', '--format', '16:9',
    '--export', '07-publish|06-video/renders', '--motif', '-(1080p|2160p)\\.mp4$', '--plan', '06-video/coulisses-timeline.json');
  const FILE = path.join(RUN, 'test-slug.coulisses');
  const j = fs.existsSync(FILE) ? read(FILE) : {};
  check(made.code === 0 && made.out === FILE, `projet creer --moteur video writes <run>\\test-slug.coulisses (${made.out})`);
  check(j.moteur === 'video' && j.chaine === 'Vidéo du monde' && JSON.stringify(j.export?.dossier) === JSON.stringify(['07-publish', '06-video\\renders']) && j.export.motif === '-(1080p|2160p)\\.mp4$' && j.plan === '06-video\\coulisses-timeline.json' && j.revue === 'revue' && !j.remotion,
    'its content: moteur video, the export folders (relative), the pattern, the plan, revue');
  const v1 = cli('projet', 'verifier', FILE);
  check(v1.code === 0 && /PROJET CONFORME : Coulisses l'ouvrira sur la vidéo du run dès le premier export/.test(v1.out) && /plan de montage pas encore créé/.test(v1.out) && /pas encore créé\)/.test(v1.out),
    'projet verifier: conforming before any export (the plan and the folders « pas encore créés »)');

  // 2) the title, known later: the same file, its date of creation kept
  await sleep(20);
  const again = cli('projet', 'creer', '--moteur', 'video', '--dossier', RUN, '--nom', 'test-slug', '--titre', 'After the Last Star');
  const j2 = read(FILE);
  check(again.code === 0 && j2.titre === 'After the Last Star' && j2.cree === j.cree && j2.modifie && JSON.stringify(j2.export) === JSON.stringify(j.export) && j2.plan === j.plan && j2.chaine === j.chaine,
    'creer again with --nom: the title changes, the date of creation, export, plan and channel are kept');
  check(fs.readdirSync(RUN).filter((f) => f.endsWith('.coulisses')).length === 1, 'still one .coulisses in the run');

  // 3) imported (a double-click on the file ends here): listed, no video yet
  const imp = importProject(FILE);
  const REVUE = path.join(RUN, 'revue');
  check(imp.kind === 'run' && imp.revue === REVUE && read(path.join(REVUE, 'projet.json')).coulisses === '..\\test-slug.coulisses', `imported as a run (kind ${imp.kind}), its notes in <run>\\revue\\`);
  check(imp.title === 'After the Last Star' && imp.channel === 'Vidéo du monde' && imp.video === null, 'title and channel from the file, no video yet');

  // 4) the export: a draft does not count, a file still being written neither, the settled one does
  fs.mkdirSync(path.join(RUN, '06-video', 'renders'), { recursive: true }); fs.mkdirSync(path.join(RUN, '07-publish'), { recursive: true });
  const draft = path.join(RUN, '06-video', 'renders', 'ch0-draft.mp4'); ff(draft); old(draft);
  check(project(REVUE).summary.video === null, 'a chapter draft (ch0-draft.mp4) is not the export');
  const exp = path.join(RUN, '06-video', 'renders', 'After-the-Last-Star-1080p.mp4'); ff(exp);
  check(project(REVUE).summary.video === null, 'an export written less than 20 s ago is not taken (still being written)');
  old(exp, 120);
  check(project(REVUE).summary.videoPath === exp, 'once settled, it is the video under review');
  const pub = path.join(RUN, '07-publish', 'After-the-Last-Star-2160p.mp4'); ff(pub, '1920x1080'); old(pub, 60);
  check(project(REVUE).summary.videoPath === pub, 'a newer export in another folder of the rule (07-publish) wins');

  // 5) the plan: the Coulisses timeline format, written later by the pipeline
  check(tracksOf(project(REVUE)) === null, 'no plan yet: no tracks (and no error)');
  fs.writeFileSync(path.join(RUN, '06-video', 'coulisses-timeline.json'), JSON.stringify({ fps: 30, durationInFrames: 120, pistes: [
    { id: 'chap', nom: 'Chapitres', type: 'band', clips: [{ de: 0, a: 60, label: 'ch0 · Hook' }, { de: 60, a: 120, label: 'ch1 · The last star' }] },
    { id: 'b3d', nom: '3D', type: 'video', clips: [{ de: 10, a: 50, label: 'S0', fichier: '06-video/assets/3d/S0.mp4' }] },
  ] }));
  const t = tracksOf(project(REVUE));
  check(t?.tracks.map((x) => x.name).join('|') === 'Chapitres|3D' && t.frames === 120 && t.tracks[1].clips[0].file === '06-video/assets/3d/S0.mp4', `the plan's tracks (${t?.tracks.map((x) => `${x.name} ${x.clips.length}`).join(', ')})`);
  const v2 = cli('projet', 'verifier', FILE);
  check(v2.code === 0 && /timeline : 2 piste\(s\)/.test(v2.out) && /export déjà là : After-the-Last-Star-2160p\.mp4/.test(v2.out), 'projet verifier now sees the timeline and the export');

  // 6) the studio opens on it
  studio = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', REVUE, '--no-open', '--port', String(PORT)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; studio.stdout.on('data', (d) => { out += d; }); studio.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 120 && !/Ouvre : http/.test(out); i++) await sleep(250);
  const url = /Ouvre : (http:\/\/(?:localhost|127\.0\.0\.1):\d+\/)/.exec(out)?.[1];
  const meta = url ? await (await fetch(url + 'api/meta')).json() : {};
  check(meta.kind === 'run' && meta.features?.code === false && meta.features?.plan === true && meta.features?.video === true && meta.channel === 'Vidéo du monde' && /07-publish$/.test(meta.exportDir ?? ''),
    `the studio: kind run, no code preview, the plan, the video, the channel (${url ?? out.split('\n').slice(-2).join(' ')})`);

  // 7) the same file becomes a Remotion run (the pipeline moved to Remotion): the same notes
  if (fs.existsSync(path.join(SAMPLE, 'node_modules', 'remotion'))) {
    const up = cli('projet', 'creer', '--dossier', RUN, '--nom', 'test-slug', '--titre', 'After the Last Star', '--projet', SAMPLE, '--composition', 'ESSAI-2026-10-07');
    const j3 = read(FILE);
    check(up.code === 0 && !j3.moteur && j3.remotion?.composition === 'ESSAI-2026-10-07' && j3.cree === j.cree && JSON.stringify(j3.export) === JSON.stringify(j.export), 'creer with --projet / --composition: the same file, now a Remotion run (date and export kept)');
    check(project(REVUE).kind === 'remotion' && project(REVUE).REVUE === REVUE, 'the imported project follows: kind remotion, the same revue folder');
    const down = cli('projet', 'creer', '--moteur', 'video', '--dossier', RUN, '--nom', 'test-slug', '--titre', 'x');
    check(down.code === 1 && /déjà un run Remotion/.test(down.out), 'and it is never turned back into a « vidéo » run');
  } else console.log('  (projet d\'essai Remotion absent : node tests\\coulisses-fixture.mjs, puis relancer pour l\'étape 7)');

  // 8) an AItelier run: its montage plan as the timeline, its export rule
  fs.mkdirSync(path.join(AIT, '08-montage'), { recursive: true });
  const ait = cli('projet', 'creer', '--moteur', 'video', '--dossier', AIT, '--nom', 'test-ait', '--titre', 'test-ait', '--chaine', 'L\'AItelier', '--format', 'long',
    '--export', '07-renders|07-export|..\\071007_test-ait', '--motif', '^(master|final|test-ait)[^\\\\/]*\\.mp4$', '--plan', '08-montage/plan-montage.json');
  fs.writeFileSync(path.join(AIT, '08-montage', 'plan-montage.json'), JSON.stringify({ fps: 30, total_images: 300, chapitres: [{ chapitre: 'acte0', record_debut: 0 }], V1: [{ fichier: '07-rendus/s00.mp4', debut_media: 0, images: 300, record: 0, role: 'plan s00' }] }));
  const ia = importProject(ait.out);
  const ta = tracksOf(project(ia.revue));
  check(ait.code === 0 && ia.kind === 'run' && ta?.tracks.map((x) => x.name).join('|') === 'Chapitres|V1 plans', `an AItelier run: its montage plan's tracks (${ta?.tracks.map((x) => x.name).join(', ')})`);
  const deliv = path.join(AIT, '..', '071007_test-ait'); fs.mkdirSync(deliv, { recursive: true });
  for (const n of ['video-sans-audio.mp4', 'test-ait.mp4']) { ff(path.join(deliv, n)); old(path.join(deliv, n)); }
  check(path.basename(project(ia.revue).summary.videoPath ?? '') === 'test-ait.mp4', 'its delivered video (not the silent copy)');

  // 9) refused: no title, a Brambleshire episode's file, an unknown engine
  const noTitle = cli('projet', 'creer', '--moteur', 'video', '--dossier', RUN);
  const bramble = path.join(FIX, 'bramble'); fs.mkdirSync(bramble, { recursive: true });
  fs.writeFileSync(path.join(bramble, 'E09.coulisses'), JSON.stringify({ coulisses: 1, moteur: 'brambleshire', episode: 'E09', titre: 'E09' }));
  const br = cli('projet', 'creer', '--moteur', 'video', '--dossier', bramble, '--nom', 'E09', '--titre', 'E09');
  const unk = cli('projet', 'creer', '--moteur', 'hyperframes', '--dossier', RUN, '--titre', 'x');
  check(noTitle.code === 1 && br.code === 1 && /épisode du Théâtre/.test(br.out) && unk.code === 1 && /inconnu/.test(unk.out), 'refused: no title, a Brambleshire episode, an unknown engine');
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally {
  if (studio) { try { execFileSync('taskkill', ['/PID', String(studio.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  console.log(`\n${ok} ok, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
}
