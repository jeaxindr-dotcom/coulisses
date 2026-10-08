// Coulisses (formerly « Brambleshire Studio ») — the home screen of the app (« Coulisses.exe »): lists the episodes, opens the review
// studio of one of them (a studio-server.mjs child process per episode), pauses / resumes a studio around a render.
// Started by the launcher (hidden, no console); also usable by hand: node hub-server.mjs [--episode E03] [--port N]
//   GET  /                 the home screen (hub.html)
//   GET  /go/E03           starts (or reuses) the studio of E03, then redirects the window to it
//   GET  /api/episodes     the episodes (title, render, thumbnail, notes, batches) and the imported projects
//   POST /api/import {path} imports a project (lib/projects.mjs: an AItelier run, a folder of videos, a video file)
//   POST /api/import/pick {what: 'folder'|'video'}  the Windows file dialog (« Coulisses.exe --pick »)
//   POST /api/remove?ep=P…  removes an imported project from the list (nothing is deleted)
//   GET  /import?path=…    import then open (a folder or a video dropped on the app's icon)
//   GET  /api/ping         { hub: true, studios }
//   POST /api/open?ep=E03  { url }      POST /api/pause?ep=E03 (stops its server: the video can be replaced by a render)
//   POST /api/resume?ep=E03             POST /api/quit (stops everything)
// Port: 4170 (installed in the pipeline) or 4171 (Dev workshop), the next one if taken. --lock <file> = where the launcher
// waits for { pid, port } (written once listening). The Dev workshop lists its sandbox episodes, not the real ones.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { optionsFrom, readJson, stamp } from './lib/episode.mjs';
import { STUDIO, INSTALLED, CACHE } from './lib/place.mjs';
import { ffmpeg } from './lib/frames.mjs';
import { renderState } from './lib/render.mjs';
import { registry, importProject, removeProject, project, revueOf, folderOf, setFolder, renameFolder } from './lib/projects.mjs';
import { drives, startScan, scanState, stopScan } from './lib/scan.mjs';
import { workspace, startInstall, installState, createProject, projectsRoot, FORMATS } from './lib/new-project.mjs';
import { DATA } from './lib/place.mjs';
import { t, lang, langSource, setLang, LANGS, renderPage } from './lib/i18n.mjs';
import { docText, about, openOnline, logRing } from './lib/menu.mjs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

let args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const SANDBOX = path.join(STUDIO, 'sandbox', '07_Episodes');
if (!INSTALLED && !args.includes('--episodes') && fs.existsSync(SANDBOX)) args = [...args, '--episodes', SANDBOX];
const O = optionsFrom(args);
const PASS = ['--theatre', '--episodes', '--remotion'].flatMap((k) => (opt(k) ? [k, opt(k)] : []));   // given to every studio
const LOGS = path.join(CACHE, 'logs'); fs.mkdirSync(LOGS, { recursive: true });
const logFile = fs.createWriteStream(path.join(LOGS, 'hub.log'), { flags: 'a' });
const ring = logRing();   // Tools › Log in the menu bar
const log = (m) => { const line = `${new Date().toLocaleString()}  ${m}`; logFile.write(line + '\n'); ring.push(line); console.log(line); };
process.on('uncaughtException', (e) => log(t('hubsrv.ignored', { msg: e.stack || e.message })));

// ---------- episodes and imported projects ----------
// ids: E03 (an episode), P1a2b3c4d (an imported project, lib/projects.mjs)
const normId = (x) => { const v = String(x ?? '').trim(); return /^E\d+$/i.test(v) ? v.toUpperCase() : /^P[0-9a-f]{8}$/i.test(v) ? 'P' + v.slice(1).toLowerCase() : null; };
function reviewStats(revue) {
  const notes = readJson(path.join(revue, 'notes.json'), { notes: [] }).notes ?? [];
  const replies = readJson(path.join(revue, 'replies.json'), { notes: {} }).notes ?? {};
  const done = (n) => { const r = replies[n.id], ut = Date.parse(n.statusAt || 0) || 0, ct = Date.parse(r?.statusAt || 0) || 0; return (r?.status && ct > ut ? r.status : n.status) === 'done'; };
  const lots = fs.existsSync(path.join(revue, 'lots')) ? fs.readdirSync(path.join(revue, 'lots')).filter((f) => /^\d{3}\.json$/.test(f)).length : 0;
  return { notes: notes.length, open: notes.filter((n) => !done(n)).length, drafts: notes.filter((n) => n.draft).length, lots,
    reviewed: notes.length ? notes.map((n) => n.updated || n.created).filter(Boolean).sort().at(-1) : null };
}
const durations = new Map();
function durationOf(file, st) {
  const key = `${file}|${st.size}|${st.mtime}`;
  if (!durations.has(key)) {
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', windowsHide: true });
    durations.set(key, +r.stdout.trim() || null);
  }
  return durations.get(key);
}
function projects() {
  return registry().projects.map(({ id, revue }) => {
    const st = studios.get(id), live = st ? { url: st.url, paused: !!st.paused } : null;
    try {
      const p = project(revue), v = p.summary.video;
      return { id, project: true, kind: p.kind, channel: p.summary.channel ?? null, folder: folderOf(id, p.summary.channel ?? null), coulisses: p.coulisses ?? null, format: p.summary.format, title: p.title, root: p.EP, revue, video: v, thumb: !!v,
        duration: v ? durationOf(p.summary.videoPath, v) : null, ...reviewStats(revue), studio: live };
    } catch (e) { return { id, project: true, missing: true, revue, folder: folderOf(id, null), title: path.basename(path.dirname(revue)), why: e.message, studio: live }; }
  });
}
// the Theatre section of the home screen: its name is the channel its episodes' .coulisses give (the user's own), else
// « Théâtre »; it exists only when the episodes' folder is on this PC
function theatreInfo() {
  const exists = fs.existsSync(O.episodesDir);
  let name = null;
  if (exists) for (const d of fs.readdirSync(O.episodesDir).filter((x) => /^E\d+ - /i.test(x))) {
    const f = fs.readdirSync(path.join(O.episodesDir, d)).find((x) => x.toLowerCase().endsWith('.coulisses'));
    const c = f ? readJson(path.join(O.episodesDir, d, f), null) : null;
    if (c?.chaine) { name = c.chaine; break; }
  }
  return { exists, name };
}
// the channel of the theatre's episodes (their .coulisses), else « Theatre » (a folder name: the same in both languages)
let theatreMemo = { at: 0, v: null };
function theatreChannel() { if (Date.now() - theatreMemo.at > 5000) theatreMemo = { at: Date.now(), v: theatreInfo().name ?? 'Theatre' }; return theatreMemo.v; }
function episodes() {
  if (!fs.existsSync(O.episodesDir)) return [];
  return fs.readdirSync(O.episodesDir).filter((d) => /^E\d+ - /i.test(d)).sort().map((folder) => {
    const id = folder.split(' - ')[0].toUpperCase(), dir = path.join(O.episodesDir, folder), revue = path.join(dir, 'revue');
    const mp4 = path.join(dir, `${folder}.mp4`), video = fs.existsSync(mp4) ? stamp(mp4) : null;
    const notes = readJson(path.join(revue, 'notes.json'), { notes: [] }).notes ?? [];
    const replies = readJson(path.join(revue, 'replies.json'), { notes: {} }).notes ?? {};
    const done = (n) => { const r = replies[n.id], ut = Date.parse(n.statusAt || 0) || 0, ct = Date.parse(r?.statusAt || 0) || 0; return (r?.status && ct > ut ? r.status : n.status) === 'done'; };
    const snap = readJson(path.join(revue, 'timeline.json'), null);
    const lots = fs.existsSync(path.join(revue, 'lots')) ? fs.readdirSync(path.join(revue, 'lots')).filter((f) => /^\d{3}\.json$/.test(f)).length : 0;
    const st = studios.get(id), R = renderState({ REVUE: revue });   // a re-render asked from the studio (lib/render.mjs)
    const render = R && (R.state === 'running' || ((R.state === 'rendered' || R.state === 'blocked' || R.state === 'failed') && Date.now() - Date.parse(R.updatedAt) < 3 * 86400e3))
      ? { state: R.state, phase: R.phase, pct: R.render?.stage === 'frames' ? Math.floor(R.render.pct) : null } : null;
    return {
      render, channel: theatreChannel(), folder: folderOf(id, theatreChannel()), dir: folder,
      id, title: folder.replace(/^E\d+ - /i, ''), video, duration: snap ? snap.frames / (snap.fps || 30) : null,
      notes: notes.length, open: notes.filter((n) => !done(n)).length, drafts: notes.filter((n) => n.draft).length, lots,
      thumb: fs.existsSync(path.join(dir, 'thumbnail.jpg')) || !!video, reviewed: notes.length ? notes.map((n) => n.updated || n.created).filter(Boolean).sort().at(-1) : null,
      studio: st ? { url: st.url, paused: !!st.paused } : null,
    };
  });
}
// a small thumbnail (the 4K thumbnail.jpg scaled, else a frame of the video), cached
async function thumb(id) {
  let src = null, at = 20;
  if (id.startsWith('P')) {   // an imported project: a frame of its video, 10 % in
    const pr = projects().find((x) => x.id === id); if (!pr?.video) return null;
    src = project(pr.revue).summary.videoPath; at = Math.max(0.5, Math.min(20, (pr.duration ?? 20) * 0.1));
  } else {
    const e = episodes().find((x) => x.id === id); if (!e) return null;
    const dir = path.join(O.episodesDir, e.dir);
    src = fs.existsSync(path.join(dir, 'thumbnail.jpg')) ? path.join(dir, 'thumbnail.jpg') : (e.video ? path.join(dir, `${e.dir}.mp4`) : null);
  }
  if (!src) return null;
  const out = path.join(CACHE, 'hub', `thumb-${id}-${Math.round(fs.statSync(src).mtimeMs)}.jpg`);
  if (!fs.existsSync(out)) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await ffmpeg([...(/\.jpe?g$/i.test(src) ? [] : ['-ss', String(at)]), '-i', src, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', out]);
  }
  return out;
}

// ---------- studios (one child process per episode) ----------
const studios = new Map();   // id -> { proc, url, ready, paused }
let hubUrl = '';
function open(id) {
  const cur = studios.get(id);
  if (cur && !cur.paused && cur.proc.exitCode === null) return cur.ready;
  if (id.startsWith('P') && !revueOf(id)) return Promise.reject(new Error(t('hubsrv.gone')));
  // after a pause (render), the studio comes back on ITS port: the window, still open on it, finds it again
  const again = cur?.url ? ['--port', new URL(cur.url).port] : [];
  const st = { proc: null, url: null, paused: false };
  const out = fs.createWriteStream(path.join(LOGS, `${id}.log`), { flags: 'a' });
  const proj = id.startsWith('P'), target = proj ? ['--project', revueOf(id) ?? ''] : [id];
  st.proc = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), ...target, '--no-open', '--hub', hubUrl, ...again, ...(proj ? [] : PASS)], { cwd: STUDIO, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  st.ready = new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(t('hubsrv.noAnswer', { log: path.join(LOGS, `${id}.log`) }))), 60000);
    st.proc.stdout.on('data', (d) => {
      out.write(d); buf += d;
      const m = /(?:Ouvre :|Open:) (http:\/\/localhost:\d+\/)/.exec(buf);   // the studio's language (studio-server.mjs)
      if (m && !st.url) { st.url = m[1]; clearTimeout(timer); resolve(st.url); }
    });
    st.proc.stderr.on('data', (d) => { out.write(d); buf += d; });
    st.proc.on('exit', (c) => { clearTimeout(timer); if (!st.url) reject(new Error(buf.trim().split('\n').slice(-3).join(' ') || t('hubsrv.exit', { code: c }))); });
  });
  studios.set(id, st);
  log(t('hubsrv.starting', { id }));
  st.ready.then((u) => log(t('hubsrv.studio', { id, msg: u })), (e) => log(t('hubsrv.studio', { id, msg: e.message })));
  return st.ready;
}
// the whole process tree (the studio's ffmpeg, its headless Chrome for the eyes…)
const killTree = (pid) => new Promise((r) => execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => r()));
async function pause(id) {
  const st = studios.get(id); if (!st) return false;
  st.paused = true; await killTree(st.proc.pid); log(t('hubsrv.paused', { id })); return true;
}
async function quit() { for (const st of studios.values()) if (st.proc.exitCode === null) await killTree(st.proc.pid); log(t('hubsrv.quit')); process.exit(0); }
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, quit);

// ---------- « Importer un projet… » ----------
const APP_EXE = path.join(STUDIO, 'Coulisses.exe');
const startDir = () => [path.join(os.homedir(), 'Desktop', 'Youtube', 'AItelier', 'long'), path.join(os.homedir(), 'Desktop', 'Youtube'), path.join(os.homedir(), 'Desktop')].find((d) => fs.existsSync(d)) ?? os.homedir();
let picking = null;
function pick(what) {
  if (picking) return picking;
  if (!fs.existsSync(APP_EXE)) return Promise.reject(new Error(t('hubsrv.noExe')));
  const out = path.join(CACHE, 'hub', `pick-${Date.now()}.txt`); fs.mkdirSync(path.dirname(out), { recursive: true });
  picking = new Promise((resolve) => {
    // folder | video | project (a .coulisses file, or a video: File › Open a project… in the menu bar)
    execFile(APP_EXE, ['--pick', ['video', 'project'].includes(what) ? what : 'folder', out, startDir()], { windowsHide: false }, () => {
      let p = ''; try { p = fs.readFileSync(out, 'utf8').trim(); fs.rmSync(out, { force: true }); } catch { /* cancelled */ }
      picking = null; resolve(p || null);
    });
  });
  return picking;
}
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
function doImport(p) {
  const r = importProject(p, { episodesDir: O.episodesDir });
  log(r.episode ? t('hubsrv.episodeOpened', { id: r.id }) : t('hubsrv.imported', { title: r.title, kind: r.kind, revue: r.revue }));
  return r;
}

// ---------- http ----------
const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };
const json = (res, data, code = 200) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(data));
const page = (title, msg) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="background:#090b12;color:#f4f5fa;font:15px 'Segoe UI';display:grid;place-items:center;height:100vh;margin:0"><div style="max-width:640px;text-align:center"><h2 style="font-weight:600">${title}</h2><p style="color:#aeb2c4;white-space:pre-wrap">${msg}</p><p><a style="color:#c9f26b" href="/">${t('hubsrv.back')}</a></p></div>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), pn = decodeURIComponent(url.pathname), ep = normId(url.searchParams.get('ep')) ?? '';
  try {
    // the home screen, in the user's language (lib/i18n.mjs: {{key}} and window.T)
    if (pn === '/' || pn === '/index.html') return send(res, 200, 'text/html; charset=utf-8', renderPage(fs.readFileSync(path.join(STUDIO, 'hub.html'), 'utf8'), { prefixes: ['hub.', 'common.', 'menu.'] }));
    // « Langue · Language »: the user's choice for the whole app (%LOCALAPPDATA%\Coulisses\settings.json)
    if (pn === '/api/lang' && req.method === 'POST') {
      const b = await readBody(req);
      if (!LANGS.includes(b.lang)) return json(res, { ok: false, why: t('srv.langBad') }, 400);
      const now = setLang(b.lang); log(`lang: ${now} (${langSource()})`);
      return json(res, { ok: true, lang: now, forced: langSource() === 'env' });
    }
    if (pn === '/api/lang') return json(res, { lang: lang(), source: langSource(), langs: LANGS });
    // the menu bar (menubar.js): documents, About, the online documentation, the home screen's log
    if (pn === '/menubar.js') return send(res, 200, 'text/javascript; charset=utf-8', fs.readFileSync(path.join(STUDIO, 'menubar.js')));
    if (pn === '/api/doc') { const d = docText(url.searchParams.get('name')); return d ? send(res, 200, 'text/plain; charset=utf-8', d.text) : send(res, 404, 'text/plain', 'not found'); }
    if (pn === '/api/about') return json(res, about());
    if (pn === '/api/log') return send(res, 200, 'text/plain; charset=utf-8', ring.text());
    if (req.method === 'POST' && pn === '/api/reveal') { const b = await readBody(req); if (b.what !== 'online') return json(res, { ok: false, why: String(b.what) }, 400); openOnline(); return json(res, { ok: true }); }
    if (pn === '/favicon.png') return send(res, 200, 'image/png', fs.readFileSync(path.join(STUDIO, 'favicon.png')));
    if (pn === '/api/ping') return json(res, { hub: true, installed: INSTALLED, episodesDir: O.episodesDir, studios: Object.fromEntries([...studios].map(([k, s]) => [k, { url: s.url, paused: s.paused }])) });
    // ---- « Nouveau projet »: an empty 3D scene, built live with the agent (lib/new-project.mjs) ----
    if (req.method !== 'POST' && pn === '/api/new') return json(res, { workspace: workspace(), formats: Object.keys(FORMATS), channels: [...new Set([...projects().map((x) => x.channel), theatreInfo().name].filter(Boolean))].sort() });
    if (req.method === 'POST' && pn === '/api/new/install') return json(res, { ok: true, ...startInstall(projectsRoot(), { log }) });
    if (pn === '/api/new/install') return json(res, installState() ?? { state: 'idle' });
    if (req.method === 'POST' && pn === '/api/new') {
      const b = await readBody(req), ws = workspace();
      if (!ws.ready) return json(res, { ok: false, needInstall: true, root: ws.root, missing: ws.missing });
      try {
        const { file } = createProject({ nom: b.nom, chaine: b.chaine || null, format: b.format, duree: b.duree, fps: b.fps });
        const p = importProject(file);
        log(t('hubsrv.newProject', { title: p.title, file }));
        return json(res, { ok: true, id: p.id, file });
      } catch (e) { return json(res, { ok: false, why: e.message }); }
    }
    // ---- the folders of the home screen ----
    if (req.method === 'POST' && pn === '/api/folder') {   // { ids, folder }: a name, '' = none, null = its channel's
      const b = await readBody(req);
      if (!Array.isArray(b.ids) || !b.ids.every((x) => normId(x))) return json(res, { ok: false, why: 'ids' }, 400);
      setFolder(b.ids.map(normId), b.folder === undefined ? null : b.folder); log(t('hubsrv.folder', { n: b.ids.length, folder: b.folder ?? '—' }));
      return json(res, { ok: true });
    }
    if (req.method === 'POST' && pn === '/api/folder/rename') {   // { from (null = none), to }
      const b = await readBody(req);
      const members = [...episodes(), ...projects()].filter((x) => (x.folder ?? null) === (b.from ?? null)).map((x) => ({ id: x.id, channel: x.folder === null ? null : x.channel ?? null }));
      renameFolder(b.from ?? null, b.to, members); log(t('hubsrv.folderRenamed', { from: b.from ?? '—', to: b.to }));
      return json(res, { ok: true, n: members.length });
    }
    // ---- « Chercher les .coulisses »: the whole PC, or one folder; then import what the user ticks ----
    if (req.method === 'POST' && pn === '/api/scan') {
      const b = await readBody(req);
      const roots = b.where === 'pc' ? drives() : b.path ? [path.resolve(String(b.path))] : [];
      if (!roots.length || !roots.every((r) => fs.existsSync(r))) return json(res, { ok: false, why: t('hubsrv.scanWhere') }, 400);
      // what the home screen lists already: its projects' .coulisses, and the theatre's own episodes
      const known = new Set(projects().map((x) => x.coulisses).filter(Boolean).map((f) => f.toLowerCase()));
      const epDir = O.episodesDir.toLowerCase();
      try {
        const st = startScan(roots, { skip: [STUDIO, CACHE, DATA], describe: (file, c) => {
          const f = file.toLowerCase(), inTheatre = f.startsWith(epDir + path.sep);
          if (c.moteur === 'brambleshire') return inTheatre ? { imported: true, episode: true } : { importable: false, episode: true };
          return { imported: known.has(f), importable: !c.errors?.length };
        } });
        log(t('hubsrv.scanStart', { roots: roots.join(', ') }));
        return json(res, { ok: true, ...st });
      } catch { return json(res, { ok: false, why: t('hubsrv.scanBusy') }); }
    }
    if (pn === '/api/scan') return json(res, scanState() ?? { state: 'idle' });
    if (req.method === 'POST' && pn === '/api/scan/stop') return json(res, { ok: stopScan() });
    if (req.method === 'POST' && pn === '/api/import/many') {   // { files: [.coulisses…], folder? }
      const b = await readBody(req), out = [];
      for (const f of Array.isArray(b.files) ? b.files.slice(0, 500) : []) {
        try { const p = importProject(String(f)); out.push({ file: f, ok: true, id: p.id }); } catch (e) { out.push({ file: f, ok: false, why: e.message }); }
      }
      if (b.folder) setFolder(out.filter((x) => x.ok && x.id?.startsWith('P')).map((x) => x.id), b.folder);
      log(t('hubsrv.importMany', { ok: out.filter((x) => x.ok).length, n: out.length }));
      return json(res, { ok: true, results: out });
    }
    if (pn === '/api/episodes') return json(res, { installed: INSTALLED, episodesDir: O.episodesDir, theatre: theatreInfo(), episodes: episodes(), projects: projects() });
    if (pn.startsWith('/thumb/')) { const f = await thumb(normId(pn.slice(7)) ?? ''); if (!f) return send(res, 404, 'text/plain', 'no thumbnail'); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' }); return fs.createReadStream(f).pipe(res); }
    const go = /^\/go\/(E\d+|P[0-9a-f]{8})$/i.exec(pn);
    if (go) {
      const id = normId(go[1]);
      try { const u = await open(id); res.writeHead(302, { Location: u }); return res.end(); }
      catch (e) { return send(res, 500, 'text/html; charset=utf-8', page(t('hubsrv.noStart', { id }), e.message)); }
    }
    if (pn === '/import') {   // a folder or a video dropped on the app's icon: import, then open it
      try { const r = doImport(url.searchParams.get('path') ?? ''); res.writeHead(302, { Location: r.video || r.episode || r.kind === 'remotion' ? `/go/${r.id}` : '/' }); return res.end(); }
      catch (e) { return send(res, 400, 'text/html; charset=utf-8', page(t('hubsrv.importFail'), e.message)); }
    }
    if (req.method === 'POST' && pn === '/api/import/pick') { const b = await readBody(req); const p = await pick(b.what); return json(res, p ? { ok: true, path: p } : { ok: false, cancelled: true }); }
    if (req.method === 'POST' && pn === '/api/import') {
      const b = await readBody(req);
      try { return json(res, { ok: true, project: doImport(b.path) }); } catch (e) { return json(res, { ok: false, why: e.message }); }
    }
    if (req.method === 'POST' && pn === '/api/remove') {
      if (!ep.startsWith('P')) return json(res, { ok: false, why: t('hubsrv.onlyProjects') }, 400);
      const st = studios.get(ep); if (st && st.proc.exitCode === null) await killTree(st.proc.pid);
      studios.delete(ep);
      const ok = removeProject(ep); log(t('hubsrv.removed', { ep }));
      return json(res, { ok });
    }
    if (req.method === 'POST' && pn === '/api/open') { if (!ep) return json(res, { ok: false, why: t('hubsrv.which') }, 400); return json(res, { ok: true, url: await open(ep) }); }
    if (req.method === 'POST' && pn === '/api/pause') return json(res, { ok: await pause(ep) });
    if (req.method === 'POST' && pn === '/api/resume') { const st = studios.get(ep); if (!st) return json(res, { ok: false, why: t('hubsrv.noStudio', { ep }) }); return json(res, { ok: true, url: await open(ep) }); }
    if (req.method === 'POST' && pn === '/api/quit') { json(res, { ok: true }); return setTimeout(quit, 100); }
    send(res, 404, 'text/plain', 'not found');
  } catch (e) { json(res, { ok: false, why: e.message }, 500); }
});
let port = +(opt('--port') ?? 0) || (INSTALLED ? 4170 : 4171);
server.on('error', (e) => { if (e.code === 'EADDRINUSE' && port < 4199) { port++; server.listen(port, '127.0.0.1'); } else { log(t('hubsrv.listen', { msg: e.message })); process.exit(1); } });
server.on('listening', () => {
  hubUrl = `http://127.0.0.1:${port}/`;
  log(t('hubsrv.ready', { url: hubUrl, dir: O.episodesDir }));
  if (opt('--lock')) fs.writeFileSync(opt('--lock'), JSON.stringify({ pid: process.pid, port, url: hubUrl, studio: STUDIO }));
  console.log(`HUB_READY ${hubUrl}`);
  if (opt('--episode')) open(opt('--episode').toUpperCase()).catch(() => {});
  if (opt('--import')) { try { const r = doImport(opt('--import')); if (r.video || r.episode || r.kind === 'remotion') open(r.id).catch(() => {}); } catch (e) { log(t('hubsrv.importLog', { msg: e.message })); } }
});
server.listen(port, '127.0.0.1');
