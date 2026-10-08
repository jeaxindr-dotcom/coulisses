// Studio de revue Remotion — Brambleshire Theatre (évolution de 06_Remotion/review/review-server.mjs, dans l'esprit de
// HyperFrames Studio : annoter sur l'image, file de modifications envoyées à Claude, « yeux », annulation par lot).
// Everything the review tool did is kept, with the same files (revue/notes.json written by the page only,
// revue/replies.json written by Claude only). New:
//   - live preview of the CURRENT code (Remotion Player, rebuilt by esbuild on every save) next to the MP4
//   - /api/frame : an image at a frame, from the MP4 or from the code (renderStill)
//   - /api/send  : the pending edits become a batch revue/lots/NNN.{json,md} (+ images); the page shows the line to paste
//                  in the Claude session (or the session watching with `studio-cli.mjs wait` picks it up by itself)
//   - /api/undo  : « Annuler / Rétablir cette correction » from the snapshots Claude took (revue/runs/NNN/)
//   - /api/render: « Lancer le rendu » = a render request for the Claude session (lot of kind 'render'); its progress is
//                  revue/render.json, written by `studio-cli.mjs render`; /api/hold and /api/unhold let go of the video
//                  while finish-render.sh replaces it; /api/compare = the before / after of each corrected note
//   - /api/export : « Exporter » a run of a Remotion pipeline (.coulisses) with the project's own export script, on the
//                  user's order (lib/export.mjs); /api/export/stop, /api/export/log
// usage: node studio-server.mjs E03 [--port N] [--no-open] [--theatre <dir>] [--episodes <dir>] [--remotion <dir>]
//        node studio-server.mjs --project "<project folder or its revue folder>" [--port N] [--no-open]
//        (an imported project, lib/projects.mjs: an AItelier run or any video; no live preview, staging nor render)
// Port: 4173 for the copy installed in the pipeline (06_Remotion\review\studio), 4174 in the Dev workshop.
// Local only (127.0.0.1). Close the window (or Ctrl+C) to stop it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { optionsFrom, episode, pickVideo, stamp, proxyFresh, stillSource, readJson, writeJson, nowIso } from './lib/episode.mjs';
import { videoFrame, codeFrame } from './lib/frames.mjs';
import { createLot, lotsSummary, connectLine, MAX_EDITS, createRenderLot, withdrawRenderLot, compareItems } from './lib/lots.mjs';
import { renderState, renderFiles } from './lib/render.mjs';
import { exportAvailable, exportState, startExport, stopExport, exportLog, exportOptions, exportOptionsReady } from './lib/export.mjs';
import { listRuns, step } from './lib/runs.mjs';
import { playerBuilder } from './lib/player-build.mjs';
import { timelineBuilder } from './lib/timeline-live.mjs';
import { peaksOf } from './lib/peaks.mjs';
import { CACHE, DEFAULT_PORT, INSTALLED } from './lib/place.mjs';
import { project, tracksOf, shotsUsedIn } from './lib/projects.mjs';
import { genericTimelineBuilder } from './lib/remotion-module.mjs';
import { checkUpdates, updatesLine, updatesOk, updatesMarkdown } from './lib/updates.mjs';
import { docText, about, reveal, openOnline, logRing, coulissesOf } from './lib/menu.mjs';
import { CLI as CLI_FILE } from './lib/lots.mjs';
import { agentById, detectAgent } from './lib/agent.mjs';
import { t, lang, langSource, setLang, LANGS, renderPage } from './lib/i18n.mjs';
import { fromApp, refuse } from './lib/guard.mjs';
import { getShortcuts, setShortcuts } from './lib/shortcuts.mjs';
import { execFile } from 'node:child_process';
import { library, librarySummary, listMedias, findMedia, peekMedia, mediaFile, miniature, importBytes, updateMedia, removeMedia, recordUse, slug } from './lib/medias.mjs';
import { stageShot, b64url } from './lib/stage-shot.mjs';
import { chatAvailable, imageModel, readChat, sendChat, stopJob, sortInbox, autoSort, jobOf, busy, newChat } from './lib/image-chat.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const epArg = args.find((a) => /^E\d+$/i.test(a)), projArg = args.includes('--project') ? args[args.indexOf('--project') + 1] : null;
if (!epArg && !projArg) { console.error(t('srv.usage')); process.exit(1); }
const P = projArg ? project(projArg) : episode(epArg, optionsFrom(args));
const B = P.kind === 'brambleshire';   // an episode: live preview of the code, staging, render; a project: the video only
const G = P.kind === 'remotion';       // a run of a Remotion pipeline (.coulisses): its code played live, before any export
const CODE = B || G;
const { ep, folder, EP, REVUE, NOTES, REPLIES, SNAP, IMAGES, PROXY, PROXY_INFO } = P;
fs.mkdirSync(IMAGES, { recursive: true });
fs.mkdirSync(path.dirname(PROXY), { recursive: true });
const IMG_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' };
const MIME = { ...Object.fromEntries(Object.entries(IMG_TYPES).map(([m, e]) => [e, m])), mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  json: 'application/json', js: 'text/javascript', mp4: 'video/mp4', webm: 'video/webm', svg: 'image/svg+xml', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', glb: 'model/gltf-binary' };
const time = () => new Date().toLocaleTimeString();
const ring = logRing();   // Tools › Log in the menu bar
const log = (m) => { ring.push(`${time()}  ${m}`); console.log(`  ${time()}  ${m}`); };

// ---- review copy of the video (unchanged from the review tool: a keyframe every 6 images, smooth stepping back) ----
let proxyState = 'missing', proxyFailed = null, proxyChild = null;
function buildProxy() {
  const src = pickVideo(P); if (!src || held) return;
  if (proxyFresh(P)) { proxyState = 'ready'; return; }
  proxyState = 'building';
  const tmp = PROXY.replace(/\.mp4$/, '.tmp.mp4'), t0 = Date.now();
  log(t('srv.proxyStart'));
  const run = (vcodec, next) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-y', '-i', src, '-map', '0:v:0', '-map', '0:a?', ...vcodec, '-g', '6', '-bf', '0',
      '-c:a', 'copy', '-fps_mode', 'passthrough', '-movflags', '+faststart', tmp], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    proxyChild = p;
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => next(e.message));
    p.on('close', (code) => next(code === 0 ? null : (err.trim().split('\n').pop() || `ffmpeg ${code}`)));
  };
  const done = (err) => {
    proxyChild = null;
    if (held) { proxyState = 'missing'; fs.rmSync(tmp, { force: true }); return; }   // stopped by a hold: built again after it
    if (err) { proxyState = 'error'; proxyFailed = stamp(src); log(t('srv.proxyFail', { err })); return; }
    fs.renameSync(tmp, PROXY);
    fs.writeFileSync(PROXY_INFO, JSON.stringify({ source: stamp(src), gop: 6, built: new Date().toISOString() }, null, 1));
    proxyState = 'ready'; log(t('srv.proxyReady', { s: Math.round((Date.now() - t0) / 1000) }));
  };
  run(['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '20', '-b:v', '0'], (err) => (err ? run(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20'], done) : done(null)));
}
function refreshProxy() {
  if (held || proxyState === 'building' || proxyFresh(P)) return;
  const src = pickVideo(P); if (!src) return;
  const st = stamp(src);
  if (Date.now() - Date.parse(st.mtime) < 15000) return;
  if (proxyFailed && proxyFailed.size === st.size && proxyFailed.mtime === st.mtime) return;
  buildProxy();
}

// ---- live preview of the code ----
// the multi-track timeline (camera, music, sound effects, voices…) as the current code builds it: rebuilt with the preview
// a project: the tracks of its montage plan (AItelier), read again when the plan changes; no code to preview
const planTimeline = () => { const d = tracksOf(P); const v = d ? Date.parse(d.mtime) : 0; return { build: () => {}, state: { version: v, status: 'ready', error: null, data: d ? { tracks: d.tracks, fps: d.fps, frames: d.frames, plan: d.file } : null } }; };
const timeline = B ? timelineBuilder({ remotionDir: P.remotionDir, episode: ep, log }) : G ? genericTimelineBuilder(P.remotion, { log })
  : { get state() { return planTimeline().state; }, build: () => {} };
const player = CODE ? playerBuilder({ remotionDir: P.remotionDir, episode: ep, log, onBuilt: () => timeline.build(), watchAlso: G ? P.EP : null,
  generic: G ? { module: P.remotion.module, composition: P.remotion.composition, props: P.remotion.props, tag: P.id } : null })
  : { state: { status: 'none', version: 0, error: null, builtAt: null }, build: async () => {}, watch: () => {} };
// size and frame rate of a project's video (a Short is 1080×1920), measured once per file — by ffprobe in the background
// (code review, 08/10/2026: never a synchronous ffprobe inside a request: it froze every request until it answered).
// The first one is measured before the server listens; a new export is measured on the next request, the previous size
// answering meanwhile.
const probed = new Map(), probing = new Map();
let lastProbe = null;
function probeNow(video, key) {
  if (!probing.has(key)) probing.set(key, new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', video], { encoding: 'utf8', windowsHide: true, timeout: 30000 }, (err, out) => {
      let w = 1920, h = 1080, fps = 30;
      try { const v = JSON.parse(out).streams[0]; w = v.width; h = v.height; const [a, b2] = v.r_frame_rate.split('/').map(Number); fps = b2 ? Math.round((a / b2) * 1000) / 1000 : a; } catch { /* defaults */ }
      probed.set(key, lastProbe = { size: [w, h], fps }); probing.delete(key); resolve();
    });
  }));
  return probing.get(key);
}
const probeKey = (video) => { const st = stamp(video); return `${video}|${st.size}:${st.mtime}`; };
function probe(video) {
  if (B || !video) return { size: [1920, 1080], fps: null };
  const key = probeKey(video);
  if (probed.has(key)) return probed.get(key);
  probeNow(video, key);
  return lastProbe ?? { size: [1920, 1080], fps: 30 };
}

// a Claude session watching the tool (studio-cli.mjs wait) beats every few seconds in revue/studio-agent.json
function agentState() {
  const a = readJson(P.AGENT, null);
  if (!a) return { watching: false };
  const age = Date.now() - Date.parse(a.beat);
  return { watching: a.waiting && age < 20000, since: a.since, beat: a.beat, lastLot: a.lastLot ?? null, agent: a.agent ?? null };
}

function meta() {
  refreshProxy();
  const video = pickVideo(P);
  const snapshot = B ? readJson(SNAP, null) : null;
  const render = video ? stamp(video) : null, pr = probe(video);
  return {
    kind: P.kind, format: P.project?.format ?? null, features: { code: CODE, staging: CODE, render: B, plan: !!timeline.state.data, video: !!video, export: G && exportAvailable(P).ok }, exportWhy: G ? exportAvailable(P).why : null, exportOptions: G && exportAvailable(P).ok ? exportOptions(P) : [],
    composition: G ? P.remotion.composition : null, channel: P.channel ?? null, coulisses: P.coulisses ?? null, exportDir: P.exportRule?.dossier ?? null,
    size: pr.size, root: P.EP, videoPath: video ?? null,
    episode: ep, title: B ? folder.replace(/^E\d+ - /, '') : P.title, folder, fps: B ? snapshot?.fps ?? 30 : pr.fps ?? timeline.state.data?.fps ?? 30, render, snapshot,
    snapshotMatches: !!(snapshot?.video && render && snapshot.video.size === render.size),
    proxy: proxyState === 'ready' && !proxyFresh(P) ? 'stale' : proxyState,
    notesFile: NOTES, maxEdits: MAX_EDITS,
    code: { status: player.state.status, version: player.state.version, error: player.state.error, builtAt: player.state.builtAt },
    agent: agentState(), connectLine: connectLine(P),
    hub: args.includes('--hub') ? args[args.indexOf('--hub') + 1] : null, held,
    lang: lang(), langSource: langSource(), coulissesFile: coulissesOf(P),
    // the 3D shots this run shows as media (« Ouvrir la scène 3D » on their clip), and where this run's render is used
    shots3d: G && P.coulisses ? shotsUsedIn(P.coulisses) : [], usedIn: G ? (P.uses ?? []) : [],
    newProject: G && P.coulisses ? readJson(P.coulisses, null)?.origine === 'coulisses' : false,   // « Nouveau projet »: opens on the Agent tab
  };
}
// ---- hold: a new render is replacing the video (studio-cli.mjs render, around finish-render.sh) ----
// Windows cannot replace a file that is open: every stream of the video is closed, the review copy stops being built,
// and nothing reads the video until /api/unhold. The page shows « Remplacement de la vidéo… » and reloads afterwards.
let held = false;
const videoStreams = new Set();
async function hold() {
  held = true;
  for (const st of videoStreams) { try { st.destroy(); } catch { /* closed */ } }
  videoStreams.clear();
  if (proxyChild) { try { proxyChild.kill(); } catch { /* gone */ } }
  await new Promise((r) => setTimeout(r, 1200));   // the stills being cut (ffmpeg) finish
  log(t('srv.held'));
}
function unhold() { held = false; log(t('srv.unheld')); refreshProxy(); }
// an export about to replace the very video under review (COULISSES REMPLACE, lib/export.mjs): let go of it, take it back after
// (every second while an export runs, every 4 s otherwise: an export can also be started without this studio)
let exportHolds = false;
function watchExport() {
  let x = null; try { x = exportState(P); } catch { /* none */ }
  if (x?.state === 'running' && x.remplace && !exportHolds) {
    const v = pickVideo(P);
    if (!v || path.resolve(v).toLowerCase() === path.resolve(x.remplace).toLowerCase()) { exportHolds = true; hold().then(() => log(t('srv.exportHolds', { name: path.basename(x.remplace) }))); }
  }
  if (x && x.state !== 'running' && exportHolds) { exportHolds = false; unhold(); }
  setTimeout(watchExport, x?.state === 'running' ? 1000 : 4000).unref();
}
if (G) watchExport();
function status() {   // what changes often: polled by the page every 3 s with the replies
  const replies = readJson(REPLIES, { notes: {} }), video = pickVideo(P);
  return { code: meta().code, agent: agentState(), lots: lotsSummary(P, replies, listRuns(P)), timeline: { version: timeline.state.version, status: timeline.state.status, error: timeline.state.error },
    render: B ? renderState(P) : null, export: G ? exportState(P) : null, held, video: video ? stamp(video) : null, compare: compareItems(P).map((x) => x.id), proxy: proxyState };
}
const readNotes = () => readJson(NOTES, { episode: ep, notes: [] });
function writeNotes(data) {
  const tmp = `${NOTES}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  if (fs.existsSync(NOTES)) fs.copyFileSync(NOTES, NOTES.replace(/\.json$/, '.bak.json'));
  fs.renameSync(tmp, NOTES);
}

// the studio page's script: the parts of page/studio/ (00-base.js … 10-start.js), in their order, inside one function as
// the inline script was (they share its names); a banner names each part, for the browser's tools
function studioScript() {
  const dir = path.join(HERE, 'page', 'studio');
  const parts = fs.readdirSync(dir).filter((f) => /^\d\d-[\w-]+\.js$/.test(f)).sort();
  return '(() => {\n' + parts.map((f) => `// ===== page/studio/${f} =====\n${fs.readFileSync(path.join(dir, f), 'utf8')}`).join('\n') + '})();\n//# sourceURL=studio.js\n';
}
function sendFile(req, res, file, type, track) {
  const st = file && fs.existsSync(file) ? fs.statSync(file) : null;
  if (!st || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
  const size = st.size, range = req.headers.range;
  type ??= MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? +m[1] : 0, end = m && m[2] ? +m[2] : size - 1;
    if (m && !m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': type, 'Cache-Control': 'no-cache' });
    pipeOut(fs.createReadStream(file, { start, end }), res, track);
  } else {
    res.writeHead(200, { 'Content-Length': size, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    pipeOut(fs.createReadStream(file), res, track);
  }
}
function pipeOut(stream, res, track) {
  if (track) { videoStreams.add(stream); stream.on('close', () => videoStreams.delete(stream)); res.on('close', () => stream.destroy()); }
  stream.on('error', () => res.destroy()).pipe(res);
}
let videoSeen = false, lastCount = -1;
function sendVideo(req, res, which) {
  const video = which === 'revue' && proxyState === 'ready' && proxyFresh(P) ? PROXY : pickVideo(P);
  if (!videoSeen) { videoSeen = true; log(t('srv.reading', { name: path.basename(video ?? '?') })); }
  if (!video) { res.writeHead(404); return res.end('no video'); }
  if (held) { res.writeHead(503, { 'Retry-After': '5' }); return res.end('video being replaced'); }
  sendFile(req, res, video, 'video/mp4', true);
}
const json = (res, data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(JSON.stringify(data)); };
const body = (req, max = 60e6) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > max) { reject(new Error(t('srv.tooBig'))); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
// inside(root, rel) -> absolute path under root, or null (no ../ escape)
const inside = (root, rel) => { const f = path.resolve(root, '.' + path.sep + rel); return f.toLowerCase().startsWith(root.toLowerCase() + path.sep) ? f : null; };

process.on('uncaughtException', (e) => console.error(`  ${time()}  ${t('srv.ignored', { msg: e.message })}`));
// the agent the batch goes to: the one watching the tool (studio-cli wait says who it is), else the one chosen in the
// page (« Connecter à l'agent »); then what may need updating on its side (lib/updates.mjs), in at most 9 s
async function updatesFor(chosen, fresh = false) {
  const a = agentState(), ag = (a.watching && a.agent?.id ? agentById(a.agent.id) : null) ?? agentById(chosen) ?? detectAgent() ?? agentById('claude');
  let updates = null;
  try { updates = await Promise.race([checkUpdates(P, { agent: ag, fresh }), new Promise((r) => setTimeout(() => r(null), 9000))]); } catch (e) { log(t('srv.updFail', { msg: e.message })); }
  if (updates) log(updatesLine(updates));
  return { agent: { id: ag.id, name: ag.name }, updates, line: updates ? updatesLine(updates) : t('upd.line.unavailable'), ok: updatesOk(updates) };
}
process.on('unhandledRejection', (e) => console.error(`  ${time()}  ${t('srv.ignored', { msg: e?.message ?? e })}`));

const FRAME_CACHE = path.join(CACHE, 'frames', ep);
// the « Médias » tab: the library of the project's channel (lib/medias.mjs), made on first use
// a Theatre episode: the channel its own .coulisses names (the user's), else « Theatre »
const episodeChannel = () => { try { const f = fs.readdirSync(P.EP).find((x) => x.toLowerCase().endsWith('.coulisses')); return (f && readJson(path.join(P.EP, f), null)?.chaine) || 'Theatre'; } catch { return 'Theatre'; } };   // a folder name: the same in both languages
const CHANNEL = P.channel ?? (B ? episodeChannel() : P.kind === 'aitelier' ? "L'AItelier" : null);
let LIB = null;
const lib = () => (LIB ??= library(CHANNEL));
const projTitle = () => (B ? folder.replace(/^E\d+ - /, '') : P.title);
const server = http.createServer(async (req, res) => {
  if (!fromApp(req)) return refuse(res);   // only Coulisses itself (lib/guard.mjs)
  const url = new URL(req.url, 'http://x');
  const pn = decodeURIComponent(url.pathname);
  try {
    if (pn === '/api/ping') return json(res, { studio: true, pid: process.pid, notesFile: NOTES });
    if (pn === '/' || pn === '/index.html') {   // in the user's language (lib/i18n.mjs: {{key}} and window.T)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(renderPage(fs.readFileSync(path.join(HERE, 'studio.html'), 'utf8'), { prefixes: ['st.', 'common.', 'menu.'] }));
    }
    // « Langue · Language »: the choice is the user's, for the whole app (%LOCALAPPDATA%\Coulisses\settings.json)
    if (pn === '/api/lang' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString('utf8') || '{}');
      if (!LANGS.includes(b.lang)) return json(res, { ok: false, why: t('srv.langBad') }, 400);
      const now = setLang(b.lang);
      return json(res, { ok: true, lang: now, forced: langSource() === 'env' });
    }
    if (pn === '/api/lang') return json(res, { lang: lang(), source: langSource(), langs: LANGS });
    // ---- the menu bar (menubar.js): documents, About, the Explorer on a path this server knows, its log, `projet verifier` ----
    if (pn === '/menubar.js') return sendFile(req, res, path.join(HERE, 'menubar.js'), 'text/javascript; charset=utf-8');
    // the page's styles and script (code review, 08/10/2026: one file of 3 000 lines): page/studio.css, and the parts of
    // page/studio/ joined in their order inside one function — the browser gets the one script it always had
    if (pn === '/studio.css') return sendFile(req, res, path.join(HERE, 'page', 'studio.css'), 'text/css; charset=utf-8');
    if (pn === '/studio.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(studioScript()); }
    // « Raccourcis clavier » (shortcuts.js): the user's keys, the same for the home screen and every studio (settings.json)
    if (pn === '/shortcuts.js') return sendFile(req, res, path.join(HERE, 'shortcuts.js'), 'text/javascript; charset=utf-8');
    if (pn === '/api/shortcuts' && req.method === 'PUT') {
      let b = {}; try { b = JSON.parse((await body(req, 1e6)).toString('utf8') || '{}'); } catch { return json(res, { ok: false, why: 'json' }, 400); }
      return json(res, { ok: true, shortcuts: setShortcuts(b.shortcuts) });
    }
    if (pn === '/api/shortcuts') return json(res, { shortcuts: getShortcuts() });
    if (pn === '/api/doc') { const d = docText(url.searchParams.get('name')); if (!d) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(d.text); }
    if (pn === '/api/about') return json(res, about());
    if (pn === '/api/log') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(ring.text()); }
    if (pn === '/api/reveal' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString('utf8') || '{}');
      try {
        if (b.what === 'folder') reveal(P.EP);
        else if (b.what === 'coulisses') reveal(coulissesOf(P), { select: true });
        else if (b.what === 'online') openOnline();
        else return json(res, { ok: false, why: String(b.what) }, 400);
        return json(res, { ok: true });
      } catch (e) { return json(res, { ok: false, why: e.message }); }
    }
    if (pn === '/api/verify' && req.method === 'POST') {   // Tools › Check the project: `projet verifier --rapide` on its .coulisses
      const file = coulissesOf(P);
      if (!file) return json(res, { ok: false, why: 'no .coulisses' });
      const r = await new Promise((resolve) => {
        const c = spawn(process.execPath, [CLI_FILE, 'projet', 'verifier', file, '--rapide'], { cwd: HERE, windowsHide: true, env: process.env });
        let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
        const timer = setTimeout(() => { try { c.kill(); } catch { /* gone */ } }, 180000);
        c.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
        c.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out: e.message }); });
      });
      return json(res, { ok: r.code === 0, code: r.code, out: r.out.trim(), file });
    }
    if (pn === '/favicon.png') return sendFile(req, res, path.join(HERE, 'favicon.png'), 'image/png');
    // ---- the « after » image of a 2D staging (a run): its own preview with the offsets, photographed (lib/stage-shot.mjs) ----
    if (pn === '/api/stage-shot' && req.method === 'POST') {
      if (!G) return json(res, { ok: false, why: t('srv.noCode') }, 400);
      const b = JSON.parse((await body(req)).toString('utf8') || '{}');
      const w = Math.round(+b.w || 0), h = Math.round(+b.h || 0), f = Math.max(0, Math.round(+b.frame || 0));
      if (!(w > 0 && h > 0 && w <= 8192 && h <= 8192) || !Array.isArray(b.edits)) return json(res, { ok: false, why: 'w, h, edits' }, 400);
      try {
        const jpg = await stageShot(`http://127.0.0.1:${port}/player.html?f=${f}&stage=${b64url(b.edits)}`, w, h);
        log(t('srv.stageShot', { frame: f, n: b.edits.length }));
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' }); return res.end(jpg);
      } catch (e) { log(t('srv.stageShotFail', { msg: e.message })); return json(res, { ok: false, why: e.message }, 500); }
    }
    // ---- « Médias »: the channel's library and its image chat (lib/medias.mjs, lib/image-chat.mjs) ----
    if (pn === '/medias.js') return sendFile(req, res, path.join(HERE, 'medias.js'), 'text/javascript; charset=utf-8');
    if (pn === '/api/medias') {
      const L = lib();
      return json(res, { ...librarySummary(L), chat: readChat(L).messages.slice(-80), job: jobOf(L), available: chatAvailable(), model: imageModel() });
    }
    if (pn.startsWith('/medias/file/') || pn.startsWith('/medias/mini/')) {
      const L = lib(), it = peekMedia(L, pn.split('/')[3] ?? '');
      if (!it) { res.writeHead(404); return res.end('not found'); }
      return sendFile(req, res, pn.startsWith('/medias/mini/') ? await miniature(L, it) : mediaFile(L, it));
    }
    if (pn === '/api/medias/import' && req.method === 'POST') {   // an image dropped or pasted in the tab: « à ranger », then sorted
      const L = lib();
      let buf; try { buf = await body(req, 60e6); } catch (e) { return json(res, { ok: false, why: e.message }, 413); }
      let name = 'image'; try { name = decodeURIComponent(String(req.headers['x-name'] ?? 'image')); } catch { /* raw */ }
      try {
        const item = importBytes(L, buf, { type: (req.headers['content-type'] || '').split(';')[0].trim(), name });
        log(t('srv.mdImported', { name: item.fichier, channel: L.channel }));
        let sorting = false;
        if (autoSort()) { try { sorting = sortInbox(L, { log }).ok; } catch { /* sorted later (the ✓ button) */ } }
        return json(res, { ok: true, item, sorting });
      } catch (e) { return json(res, { ok: false, why: e.message }); }
    }
    if (pn.startsWith('/api/medias/') && req.method === 'POST') {
      const L = lib(), what = pn.slice('/api/medias/'.length);
      let b = {}; try { b = JSON.parse((await body(req)).toString('utf8') || '{}'); } catch { /* empty */ }
      try {
        if (what === 'update') return json(res, { ok: true, item: updateMedia(L, b.id, { nom: b.nom, categorie: b.categorie, tags: b.tags, description: b.description }) });
        if (what === 'delete') { const r = removeMedia(L, b.id); log(t('srv.mdDeleted', { file: r.trash })); return json(res, { ok: true, ...r }); }
        if (what === 'reveal') {
          const it = b.id ? findMedia(L, b.id) : null;
          if (!it) listMedias(L);   // the folders exist before the Explorer opens them
          reveal(it ? mediaFile(L, it) : L.dir, { select: !!it });
          return json(res, { ok: true });
        }
        if (what === 'chat') {
          const m = meta();
          const job = sendChat(L, { text: b.text, refs: Array.isArray(b.refs) ? b.refs : [], transparent: !!b.transparent,
            project: { title: projTitle(), format: P.formatName ?? (m.size ? `${m.size[0]}×${m.size[1]}` : null) } }, { log });
          return json(res, { ok: true, job });
        }
        if (what === 'stop') return json(res, stopJob(L));
        if (what === 'sort') return json(res, sortInbox(L, { log, ids: Array.isArray(b.ids) ? b.ids : null }));
        if (what === 'new-chat') { if (busy(L)) throw new Error(t('md.err.busy')); newChat(L); return json(res, { ok: true }); }
        if (what === 'place') {   // « Placer » / dropped on the picture: a copy goes with the edit (revue/images), the library notes where
          const it = findMedia(L, b.id);
          if (!it) throw new Error(t('md.err.gone'));
          const src = mediaFile(L, it), name = `media-${slug(it.nom) || 'image'}-${Date.now().toString(36)}${path.extname(src).toLowerCase()}`;
          fs.copyFileSync(src, path.join(IMAGES, name));
          recordUse(L, it.id, { titre: projTitle(), projet: coulissesOf(P) ?? P.EP, image: Number.isFinite(+b.frame) ? Math.round(+b.frame) : null });
          log(t('srv.mdPlaced', { name: it.nom, frame: b.frame ?? '?' }));
          return json(res, { ok: true, file: `images/${name}`, media: { id: it.id, nom: it.nom, categorie: it.categorie, transparent: !!it.transparent, largeur: it.largeur ?? null,
            hauteur: it.hauteur ?? null, description: it.description ?? '', bibliotheque: src, chaine: L.channel, file: `images/${name}` } });
        }
        return json(res, { ok: false, why: what }, 404);
      } catch (e) { return json(res, { ok: false, why: e.message }); }
    }
    if (pn === '/video' || pn === '/video/original') return sendVideo(req, res, 'original');
    if (pn === '/video/revue') return sendVideo(req, res, 'revue');
    if (pn === '/api/meta') return json(res, meta());
    if (pn === '/api/status') return json(res, status());
    if (pn === '/api/notes' && req.method === 'GET') return json(res, readNotes());
    if (pn === '/api/replies') {
      let txt = '{"notes":{}}';
      try { txt = JSON.stringify(JSON.parse(fs.readFileSync(REPLIES, 'utf8'))); } catch { /* none yet (or being written) */ }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(txt);
    }
    if (pn === '/api/image' && req.method === 'POST') {
      const ext = IMG_TYPES[(req.headers['content-type'] || '').split(';')[0].trim()];
      if (!ext) { res.writeHead(415, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(t('srv.imgType')); }
      let buf; try { buf = await body(req, 40e6); } catch { res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(t('srv.imgBig')); }
      const id = String(req.headers['x-note'] || 'note').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'note';
      const name = `${id}-${Date.now().toString(36)}.${ext}`;
      fs.writeFileSync(path.join(IMAGES, name), buf);
      log(t('srv.imgAdded', { name }));
      return json(res, { file: `images/${name}` });
    }
    if (pn.startsWith('/images/')) return sendFile(req, res, path.join(IMAGES, path.basename(pn.slice(8))));
    if (pn.startsWith('/lots/')) return sendFile(req, res, inside(P.LOTS, pn.slice(6)));   // captures of a sent batch
    if (pn === '/api/notes' && req.method === 'PUT') {
      const data = JSON.parse((await body(req)).toString('utf8'));
      if (!Array.isArray(data.notes)) throw new Error('notes must be an array');
      writeNotes(data);
      if (data.notes.length !== lastCount) { lastCount = data.notes.length; log(t('srv.notes', { n: lastCount })); }
      return json(res, { ok: true });
    }
    // ---- live preview ----
    if (pn === '/player.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(HERE, 'player', 'player.html'), 'utf8').replace('__V__', String(player.state.version)));
    }
    if (pn === '/player.js') return sendFile(req, res, player.state.file, 'text/javascript; charset=utf-8');
    if (pn.startsWith('/public/')) return sendFile(req, res, inside(path.join(P.remotionDir, 'public'), pn.slice(8)));
    // ---- multi-track timeline + waveforms ----
    if (pn === '/api/timeline') return json(res, { version: timeline.state.version, status: timeline.state.status, error: timeline.state.error, data: timeline.state.data });
    if (pn === '/api/peaks') {   // ?src=<path in 06_Remotion/public> | @mix (the rendered MP4's sound)
      const src = url.searchParams.get('src') ?? '';
      if (src === '@mix' && held) { res.writeHead(503); return res.end('video being replaced'); }
      const file = src === '@mix' ? pickVideo(P) : inside(CODE ? path.join(P.remotionDir, 'public') : P.EP, src);   // a project: its own files
      if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end('no audio'); }
      const pk = await peaksOf(file);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' });
      return res.end(JSON.stringify(pk));
    }
    // ---- « les yeux » : GET /api/frame?f=123&source=video|code[&w=960] -> JPEG ----
    if (pn === '/api/frame') {
      const f = Math.max(0, Math.round(+(url.searchParams.get('f') ?? 0))), source = url.searchParams.get('source') === 'code' ? 'code' : 'video';
      const w = Math.min(1920, +(url.searchParams.get('w') ?? 0) || 0);
      const out = path.join(FRAME_CACHE, `${source}-${f}-${w || 'full'}-${Date.now().toString(36)}.jpg`);
      if (source === 'code' && !CODE) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(t('srv.noCode')); }
      if (source === 'code') {
        await codeFrame(P, f, out, { log });
        if (w) { const s = out.replace(/\.jpg$/, '-s.jpg'); await videoFrame(out, 0, 30, s, { width: w }).catch(() => {}); if (fs.existsSync(s)) fs.renameSync(s, out); }
      } else {
        if (held) { res.writeHead(503); return res.end('video being replaced'); }
        await videoFrame(stillSource(P), f, meta().fps, out, { width: w || undefined });
      }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache', 'X-Frame': String(f), 'X-Source': source });
      return fs.createReadStream(out).on('close', () => fs.rm(out, { force: true }, () => {})).pipe(res);
    }
    // ---- the pending edits -> a batch for Claude ----
    if (pn === '/api/send' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString('utf8'));
      const m = meta(), u = await updatesFor(b.agent);
      const r = await createLot(P, b, { fps: b.fps || m.fps, size: Array.isArray(b.size) ? b.size : m.size, log, updates: u.updates, agent: u.agent });
      return json(res, { ok: true, ...r, agent: agentState(), updates: u.line, updatesOk: u.ok });
    }
    if (pn === '/api/updates') { const u = await updatesFor(url.searchParams.get('agent'), url.searchParams.has('fresh')); return json(res, { line: u.line, ok: u.ok, md: u.updates ? updatesMarkdown(u.updates, { cli: `node "${CLI_FILE}"`, target: P.target }).join('\n') : '', ...u.updates }); }
    // ---- « Exporter » a run of a Remotion pipeline: the project's script, started here, on the user's order ----
    if (pn === '/api/export' && req.method === 'POST') {
      if (!G) return json(res, { ok: false, why: t('srv.exportOnly') });
      const b = JSON.parse((await body(req)).toString('utf8') || '{}');
      try { return json(res, { ok: true, ...startExport(P, { qualite: b.qualite ?? null, log }) }); } catch (e) { return json(res, { ok: false, why: e.message }); }
    }
    if (pn === '/api/export/stop' && req.method === 'POST') {
      try { return json(res, { ok: true, ...stopExport(P, { log }) }); } catch (e) { return json(res, { ok: false, why: e.message }); }
    }
    if (pn === '/api/export/log') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(G ? exportLog(P) : ''); }
    // ---- the full re-render (asked here, run by Claude: studio-cli.mjs render) ----
    if (pn.startsWith('/api/render') && pn !== '/api/render/log' && !B) return json(res, { ok: false, why: t('lot.err.noRender') });
    if (pn === '/api/render' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString('utf8') || '{}');
      if (renderState(P)?.state === 'running') return json(res, { ok: false, why: t('lot.err.renderRunning') });
      const u = await updatesFor(b.agent);
      let r; try { r = createRenderLot(P, b, { updates: u.updates, agent: u.agent }); } catch (e) { return json(res, { ok: false, why: e.message }); }
      log(t('srv.renderSent', { lot: r.lot, md: r.md }));
      return json(res, { ok: true, ...r, agent: agentState(), updates: u.line, updatesOk: u.ok });
    }
    if (pn === '/api/render/withdraw' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString('utf8'));
      try { withdrawRenderLot(P, +b.lot); log(t('srv.renderWithdrawn', { lot: b.lot })); return json(res, { ok: true }); } catch (e) { return json(res, { ok: false, why: e.message }); }
    }
    if (pn === '/api/render/stop' && req.method === 'POST') {
      if (renderState(P)?.state !== 'running') return json(res, { ok: false, why: t('srv.noRender') });
      fs.writeFileSync(renderFiles(P).STOP, nowIso());
      log(t('srv.stopAsked'));
      return json(res, { ok: true });
    }
    if (pn === '/api/render/log') {
      let txt = ''; try { txt = fs.readFileSync(renderFiles(P).LOG, 'utf8'); } catch { /* no render yet */ }
      const NOISE = /X4000|^Copying public dir|^Bundling \d|^Rendered \d|^Encoded \d/;
      const lines = txt.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n|\r/).filter((l) => l.trim() && !NOISE.test(l));
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(lines.slice(-160).join('\n'));
    }
    if (pn === '/api/compare') { const v = pickVideo(P); return json(res, { video: v ? stamp(v) : null, items: compareItems(P) }); }
    if (pn === '/api/hold' && req.method === 'POST') { await hold(); return json(res, { ok: true }); }
    if (pn === '/api/unhold' && req.method === 'POST') { unhold(); return json(res, { ok: true }); }
    if (pn === '/api/undo' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString('utf8'));
      const r = step(P, +b.lot, b.verb === 'redo' ? 'redo' : 'undo', t('srv.youTool'));
      log(t('srv.undoLog', { lot: b.lot, verb: t(b.verb === 'redo' ? 'srv.redone' : 'srv.undone'), res: r.ok ? '✓ ' + r.files.join(', ') : '✗ ' + r.why }));
      return json(res, r);
    }
    res.writeHead(404); res.end('not found');
  } catch (e) { if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); } res.end(String(e.message || e)); }
});

let port = +(args[args.indexOf('--port') + 1] || 0) || DEFAULT_PORT;
// a taken port: the next one, up to 4199 (where lib/render.mjs looks for the studios of an episode)
server.on('error', (e) => { if (e.code === 'EADDRINUSE' && port < 4199) { port++; server.listen(port, '127.0.0.1'); } else throw e; });
server.on('listening', async () => {
  const url = `http://127.0.0.1:${port}/`;   // the home screen's address too: one site for the browser (lib/guard.mjs)
  const dev = INSTALLED ? '' : t('srv.dev');
  console.log(B ? t('srv.titleEp', { ep, folder, dev }) : t('srv.titleProj', { title: P.title, dir: P.EP, dev }));
  console.log(t('srv.open', { url }));   // « Ouvre : <url> » / « Open: <url> »: the home screen reads it (hub-server.mjs)
  console.log(t('srv.notesIn', { file: NOTES }));
  console.log(t('srv.close'));
  if (!args.includes('--no-open')) exec(process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`);
  buildProxy();
  await player.build(); player.watch();
});
// One studio per project (code review, 08/10/2026): the page of a studio is the only writer of revue/notes.json, so two
// studios on one project (a home screen restarted while its studio still runs, a studio started by hand) would
// overwrite each other's notes. revue/studio.lock.json says which one is open; a second one hands over to it: it says
// where it is (« Ouvre : <its address> », which the home screen reads), opens it, and stops. A lock whose studio is gone
// (closed by force, the PC restarted) is taken over.
const LOCK = path.join(REVUE, 'studio.lock.json');
async function openElsewhere() {
  const l = readJson(LOCK, null);
  if (!l?.pid || !l.url || l.pid === process.pid) return null;
  try { process.kill(l.pid, 0); } catch { return null; }   // that process is gone
  try { const j = await (await fetch(new URL('api/ping', l.url), { signal: AbortSignal.timeout(2000) })).json(); return j?.studio && path.resolve(j.notesFile ?? '') === path.resolve(NOTES) ? l.url : null; }
  catch { return null; }
}
const other = await openElsewhere();
if (other) {
  console.log(t('srv.already', { url: other }));
  console.log(t('srv.open', { url: other }));
  if (!args.includes('--no-open')) exec(process.platform === 'win32' ? `start "" "${other}"` : `open "${other}"`);
  process.exit(0);
}
server.on('listening', () => {
  try { writeJson(LOCK, { pid: process.pid, port, url: `http://127.0.0.1:${port}/`, since: nowIso() }); } catch { /* a read-only revue: no lock */ }
});
process.on('exit', () => { try { if (readJson(LOCK, null)?.pid === process.pid) fs.rmSync(LOCK, { force: true }); } catch { /* */ } });
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => process.exit(0));
const first = [];
if (!B) { const v = pickVideo(P); if (v) first.push(probeNow(v, probeKey(v))); }
if (G && exportAvailable(P).ok) first.push(exportOptionsReady(P));
Promise.all(first).catch(() => {}).finally(() => server.listen(port, '127.0.0.1'));
