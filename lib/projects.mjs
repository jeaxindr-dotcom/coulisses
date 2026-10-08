// Imported projects (« Importer un projet… » on the home screen, like DaVinci Resolve's Project Manager): besides the
// Brambleshire episodes, any video project can be reviewed. A project is
//   - an AItelier run (Desktop\Youtube\AItelier\long|short\<date>_<slug>\: run.json, 08-montage\plan-montage.json):
//     the video is the newest export in 07-renders\ (or the delivered one), the timeline shows the Resolve tracks of
//     the montage plan (chapters, V1 plans, V2 presenter, V3 overlays, A1 voice, A2 music, A3 sfx);
//   - any folder holding videos: its newest video;
//   - a single video file;
//   - a .coulisses file (lib/coulisses-file.mjs): a run of a Remotion pipeline, played live from its code before any
//     export (kind 'remotion'); its revue\ folder is the one the file names;
//   - a « vidéo » .coulisses file (moteur: video): a run not yet in Remotion, reviewed on its export once there is one,
//     with its montage plan as timeline (kind 'run'). The file is read again each time: when the pipeline moves to
//     Remotion, the same project becomes a 'remotion' one, with the same notes.
// Its review files live IN the project, under revue\ (user choice), with revue\projet.json describing it: the server
// and studio-cli.mjs reach a project from that path alone. The list of imported projects (projets.json, PROJECTS_FILE)
// is only the home screen's index: removing a project from it deletes nothing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson, writeJson, nowIso, stamp, episode } from './episode.mjs';
import { CACHE, PROJECTS_FILE } from './place.mjs';
import { readCoulisses, isCoulissesFile, EXT } from './coulisses-file.mjs';
import { normalizeTimeline } from './remotion-module.mjs';
import { t } from './i18n.mjs';

export const VIDEO = /\.(mp4|mov|m4v|mkv|webm)$/i;
const SKIP_VIDEO = /sans-audio|\.tmp\.|video-revue/i;   // silent copies, files being written, the studio's own copies
export const projectId = (revue) => 'P' + crypto.createHash('sha1').update(path.resolve(revue).toLowerCase()).digest('hex').slice(0, 8);
export const isProjectArg = (a) => !!a && !/^E\d+$/i.test(a) && (/[\\/:]/.test(a) || fs.existsSync(a));

// the title of an AItelier run: the first heading of its script (« # 02-script — Sonnet 5.5 contre Opus 5.5 : … »)
function aitelierTitle(root, run) {
  try {
    const h = /^#\s+(.+)$/m.exec(fs.readFileSync(path.join(root, '02-script.md'), 'utf8'))?.[1] ?? '';
    const t = h.replace(/^(script( fr)?|02-script)\s*[—–-]\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (t) return t;
  } catch { /* no script */ }
  const slug = run?.slug ?? path.basename(root).replace(/^\d{4}-\d{2}-\d{2}_/, '');
  return slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
const videosIn = (dir, depth = 0) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isFile() && VIDEO.test(e.name) && !SKIP_VIDEO.test(e.name)) out.push(f);
    else if (e.isDirectory() && depth > 0 && !/^(revue|node_modules|\.)/i.test(e.name)) out.push(...videosIn(f, depth - 1));
  }
  return out;
};

// what a path the user picked is: { kind, root, title, video, plan?, format? } (throws with a sentence for the user)
export function detect(input, { episodesDir } = {}) {
  const raw = String(input ?? '').trim().replace(/^"(.*)"$/, '$1');
  if (!raw) throw new Error(t('prj.give'));
  const abs = path.resolve(raw);
  if (!fs.existsSync(abs)) throw new Error(t('prj.notFound', { path: abs }));
  const st = fs.statSync(abs);
  if (st.isFile() && isCoulissesFile(abs)) {
    const c = readCoulisses(abs);
    if (c.errors.length) throw new Error(t('prj.incomplete', { ext: EXT, errors: c.errors.join(' ; ') }));
    if (c.moteur === 'brambleshire') return { kind: 'episode', episode: c.episode, title: c.title };   // opened as the episode it is
    if (c.moteur === 'video') return { kind: 'run', root: c.dir, title: c.title, format: c.format, coulisses: abs, revue: c.revue };
    return { kind: 'remotion', root: c.dir, title: c.title, format: c.format, coulisses: abs, revue: c.revue };
  }
  if (st.isDirectory()) {   // a run folder with its .coulisses file: that file
    const own = fs.readdirSync(abs).filter((f) => isCoulissesFile(f));
    if (own.length === 1) return detect(path.join(abs, own[0]), { episodesDir });
  }
  if (st.isFile()) {
    if (!VIDEO.test(abs)) throw new Error(t('prj.pick'));
    return { kind: 'video', root: path.dirname(abs), title: path.basename(abs).replace(/\.[^.]+$/, ''), video: { file: path.basename(abs) } };
  }
  if (fs.existsSync(path.join(abs, 'projet.json'))) return { existing: abs };   // the revue folder of a project
  if (fs.existsSync(path.join(abs, 'revue', 'projet.json'))) return { existing: path.join(abs, 'revue') };
  if (/^E\d+ - /i.test(path.basename(abs)) && (episodesDir ? path.resolve(path.dirname(abs)).toLowerCase() === path.resolve(episodesDir).toLowerCase() : fs.existsSync(path.join(abs, 'revue', 'notes.json')))) {
    throw new Error(t('prj.episode'));
  }
  const run = readJson(path.join(abs, 'run.json'), null);
  if (run?.slug || fs.existsSync(path.join(abs, '08-montage', 'plan-montage.json'))) {
    return { kind: 'aitelier', root: abs, title: aitelierTitle(abs, run), format: run?.format ?? null, video: { auto: 'aitelier' }, plan: '08-montage/plan-montage.json' };
  }
  if (!videosIn(abs, 1).length) throw new Error(t('prj.noVideo'));
  return { kind: 'folder', root: abs, title: path.basename(abs), video: { auto: 'folder' } };
}

// where its review files go: <root>\revue\ (a second video of the same folder: revue-<name>\)
function revueFor(d) {
  const base = path.join(d.root, 'revue');
  const own = readJson(path.join(base, 'projet.json'), null);
  if (!fs.existsSync(base) || (own && JSON.stringify(own.video) === JSON.stringify(d.video))) return base;
  if (!own && !fs.readdirSync(base).length) return base;
  const name = (d.video.file ?? 'studio').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 40);
  return path.join(d.root, `revue-${name}`);
}

export function importProject(input, opts = {}) {
  const d = detect(input, opts);
  if (d.kind === 'episode') return { id: d.episode, kind: 'episode', title: d.title, episode: true };   // nothing to import: it is listed
  let revue = d.existing;
  if (!revue && (d.kind === 'remotion' || d.kind === 'run')) {   // the .coulisses file says where its review files go
    revue = d.revue; fs.mkdirSync(revue, { recursive: true });
    writeJson(path.join(revue, 'projet.json'), { studio: 'Coulisses', kind: d.kind, title: d.title, root: path.relative(revue, d.root) || '.', coulisses: path.relative(revue, d.coulisses), format: d.format ?? null, imported: readJson(path.join(revue, 'projet.json'), null)?.imported ?? nowIso() });
  }
  if (!revue) {
    revue = revueFor(d);
    fs.mkdirSync(revue, { recursive: true });
    const desc = { studio: 'Coulisses', kind: d.kind, title: d.title, root: path.relative(revue, d.root) || '.', video: d.video, plan: d.plan ?? null, format: d.format ?? null, imported: nowIso() };
    if (!fs.existsSync(path.join(revue, 'projet.json'))) writeJson(path.join(revue, 'projet.json'), desc);
  }
  const reg = registry();
  const id = projectId(revue);
  if (!reg.projects.some((x) => x.id === id)) { reg.projects.push({ id, revue, added: nowIso() }); writeJson(PROJECTS_FILE, reg); }
  return { id, revue, ...project(revue).summary };
}
export const registry = () => { const r = readJson(PROJECTS_FILE, null) ?? {}; r.projects ??= []; return r; };
export function removeProject(id) {
  const reg = registry(), n = reg.projects.length;
  reg.projects = reg.projects.filter((x) => x.id !== id);
  writeJson(PROJECTS_FILE, reg);
  return n !== reg.projects.length;
}
export function revueOf(id) { return registry().projects.find((x) => x.id === id)?.revue ?? null; }

// the paths of a project, the same shape as episode() for a Brambleshire episode (lib/episode.mjs)
export function project(arg) {
  let revue = path.resolve(String(arg).replace(/^"(.*)"$/, '$1'));
  if (!fs.existsSync(path.join(revue, 'projet.json')) && fs.existsSync(path.join(revue, 'revue', 'projet.json'))) revue = path.join(revue, 'revue');
  const d = readJson(path.join(revue, 'projet.json'), null);
  if (!d) throw new Error(t('prj.none', { revue }));
  const root = path.resolve(revue, d.root ?? '..'), id = projectId(revue);
  const p = {
    ep: id, id, kind: d.kind, project: d, folder: path.basename(root), title: d.title, EP: root, REVUE: revue,
    NOTES: path.join(revue, 'notes.json'), REPLIES: path.join(revue, 'replies.json'), SNAP: path.join(revue, 'timeline.json'),
    IMAGES: path.join(revue, 'images'), LOTS: path.join(revue, 'lots'), RUNS: path.join(revue, 'runs'), AGENT: path.join(revue, 'studio-agent.json'),
    // the fast-scrub copy is a cache: outside the project
    PROXY: path.join(CACHE, 'proxies', `${id}.mp4`), PROXY_INFO: path.join(CACHE, 'proxies', `${id}.json`),
    theatre: null, episodesDir: null, remotionDir: null,
  };
  if (d.coulisses) {   // a run with its .coulisses file, read again each time: it may have moved to Remotion since
    const c = readCoulisses(path.resolve(revue, d.coulisses));
    if (c.errors.length) throw new Error(`${c.file} : ${c.errors.join(' ; ')}`);
    p.coulisses = c.file; p.title = c.title; p.exportRule = c.export; p.channel = c.channel; p.formatName = c.format;
    if (c.moteur === 'video') { p.kind = 'run'; p.plan = c.plan; }   // its export is the video, its plan (if any) the timeline
    else { p.kind = 'remotion'; p.remotion = c.remotion; p.remotionDir = c.remotion.projet; }   // its code is the preview
  }
  p.target = `"${revue}"`;   // how studio-cli.mjs is told which project (the lots' commands)
  p.pickVideo = () => pickProjectVideo(p);
  const v = p.pickVideo();
  p.summary = { kind: p.kind, channel: p.channel ?? null, title: p.title ?? d.title, root, format: p.formatName ?? d.format ?? null, video: v ? stamp(v) : null, videoPath: v };
  return p;
}

// the video under review: fixed (a single file), else the newest of the candidates — skipping a file written in the
// last 20 s (an export in progress) as long as an older one exists
function pickProjectVideo(p) {
  if (p.kind === 'remotion' || p.kind === 'run') {   // the export, once there is one (before: the code, or nothing yet)
    const R = p.exportRule ?? (p.kind === 'run' ? { dossiers: [p.EP], motif: VIDEO, profondeur: 0 } : null);
    if (!R) return null;
    const c = (R.dossiers ?? [R.dossier]).flatMap((d) => videosIn(d, R.profondeur ?? 0)).filter((f) => R.motif.test(path.basename(f)));
    const withTime = c.map((f) => ({ f, t: fs.statSync(f).mtimeMs })).sort((a, b) => b.t - a.t);
    return withTime.filter((x) => Date.now() - x.t > 20000)[0]?.f ?? null;   // never a file still being written
  }
  const v = p.project.video ?? {};
  if (v.file) { const f = path.join(p.EP, v.file); return fs.existsSync(f) ? f : null; }
  let c = [];
  if (v.auto === 'aitelier') {
    c = videosIn(path.join(p.EP, '07-renders'));
    const m = /^(\d{2})(\d{2})-(\d{2})-(\d{2})_(.+)$/.exec(p.folder);   // the delivery folder: ..\<yymmdd>_<slug>\
    if (m) c.push(...videosIn(path.join(path.dirname(p.EP), `${m[2]}${m[3]}${m[4]}_${m[5]}`)));
  } else c = videosIn(p.EP, 1);
  const withTime = c.map((f) => ({ f, t: fs.statSync(f).mtimeMs })).sort((a, b) => b.t - a.t);
  const settled = withTime.filter((x) => Date.now() - x.t > 20000);
  return (settled[0] ?? withTime[0])?.f ?? null;
}

// the timeline of an AItelier run: the Resolve tracks of its montage plan (08-montage\plan-montage.json)
const NAME = (k) => t(`prj.${k}`);   // V1 plans, V2 présentateur, V3 calques, A1 voix, A2 musique, A3 bruitages (lib/i18n-*.mjs)
// (a « vidéo » run: the plan its .coulisses names — the same AItelier format, or the Coulisses timeline format in frames)
export function tracksOf(p) {
  const file = p.kind === 'aitelier' ? path.join(p.EP, p.project.plan ?? '08-montage/plan-montage.json') : p.kind === 'run' ? p.plan : null;
  if (!file) return null;
  const plan = readJson(file, null);
  if (!plan) return null;
  if (Array.isArray(plan.pistes)) {   // { fps, durationInFrames, pistes: [{ id, nom, type, clips: [{ de, a, label, … }] }] }
    const tk = normalizeTimeline(plan, plan.fps ?? 30);
    return { fps: tk.fps, frames: tk.frames, file, mtime: fs.statSync(file).mtime.toISOString(), tracks: tk.tracks };
  }
  const fps = plan.fps ?? 30, T = (f) => +(f / fps).toFixed(4), end = plan.total_images ?? 0;
  const tracks = [];
  if (plan.chapitres?.length) {
    tracks.push({ id: 'chap', name: t('prj.chapters'), type: 'band', clips: plan.chapitres.map((c, i, a) => ({ t0: T(c.record_debut ?? 0), t1: T(a[i + 1]?.record_debut ?? end), label: c.chapitre })) });
  }
  for (const k of ['V1', 'V2', 'V3', 'A1', 'A2', 'A3']) {
    const arr = plan[k]; if (!Array.isArray(arr) || !arr.length) continue;
    tracks.push({ id: k, name: NAME(k), type: k[0] === 'A' ? 'audio' : 'video', clips: arr.map((c) => ({
      t0: T(c.record ?? 0), t1: T((c.record ?? 0) + (c.images ?? 0)), from: c.debut_media ?? 0, file: c.fichier ?? null,
      label: c.role ?? (c.fichier ? path.basename(c.fichier) : k), off: c.desactiver === true,
    })) });
  }
  return { fps, frames: end, file, mtime: fs.statSync(file).mtime.toISOString(), tracks };
}

// studio-cli.mjs / studio-server.mjs: E03 = a Brambleshire episode; a path = an imported project
export const resolveTarget = (arg, o) => (isProjectArg(arg) ? project(arg) : episode(arg, o));
