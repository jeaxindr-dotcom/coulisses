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
import { listRuns, step } from './lib/runs.mjs';
import { playerBuilder } from './lib/player-build.mjs';
import { timelineBuilder } from './lib/timeline-live.mjs';
import { peaksOf } from './lib/peaks.mjs';
import { CACHE, DEFAULT_PORT, INSTALLED } from './lib/place.mjs';
import { project, tracksOf } from './lib/projects.mjs';
import { genericTimelineBuilder } from './lib/remotion-module.mjs';
import { checkUpdates, updatesLine } from './lib/updates.mjs';
import { agentById, detectAgent } from './lib/agent.mjs';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const epArg = args.find((a) => /^E\d+$/i.test(a)), projArg = args.includes('--project') ? args[args.indexOf('--project') + 1] : null;
if (!epArg && !projArg) { console.error('usage: node studio-server.mjs E03 [--port 4174] [--no-open] [--episodes <dir>]  |  --project "<dossier>"'); process.exit(1); }
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
const log = (m) => console.log(`  ${time()}  ${m}`);

// ---- review copy of the video (unchanged from the review tool: a keyframe every 6 images, smooth stepping back) ----
let proxyState = 'missing', proxyFailed = null, proxyChild = null;
function buildProxy() {
  const src = pickVideo(P); if (!src || held) return;
  if (proxyFresh(P)) { proxyState = 'ready'; return; }
  proxyState = 'building';
  const tmp = PROXY.replace(/\.mp4$/, '.tmp.mp4'), t0 = Date.now();
  log('préparation du défilement rapide (copie de revue de la vidéo, ~1 min)…');
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
    if (err) { proxyState = 'error'; proxyFailed = stamp(src); log(`défilement rapide indisponible (${err}) : la vidéo d'origine reste utilisée`); return; }
    fs.renameSync(tmp, PROXY);
    fs.writeFileSync(PROXY_INFO, JSON.stringify({ source: stamp(src), gop: 6, built: new Date().toISOString() }, null, 1));
    proxyState = 'ready'; log(`défilement rapide prêt (${Math.round((Date.now() - t0) / 1000)} s)`);
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
// size and frame rate of a project's video (a Short is 1080×1920), measured once per file
const probed = new Map();
function probe(video) {
  if (B || !video) return { size: [1920, 1080], fps: null };
  const st = stamp(video), key = `${st.size}:${st.mtime}`;
  if (!probed.has(key)) {
    const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', video], { encoding: 'utf8', windowsHide: true });
    let w = 1920, h = 1080, fps = 30;
    try { const v = JSON.parse(r.stdout).streams[0]; w = v.width; h = v.height; const [a, b2] = v.r_frame_rate.split('/').map(Number); fps = b2 ? Math.round((a / b2) * 1000) / 1000 : a; } catch { /* defaults */ }
    probed.set(key, { size: [w, h], fps });
  }
  return probed.get(key);
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
    kind: P.kind, format: P.project?.format ?? null, features: { code: CODE, staging: B, render: B, plan: !!timeline.state.data, video: !!video },
    composition: G ? P.remotion.composition : null, channel: P.channel ?? null, coulisses: P.coulisses ?? null, exportDir: P.exportRule?.dossier ?? null,
    size: pr.size, root: P.EP, videoPath: video ?? null,
    episode: ep, title: B ? folder.replace(/^E\d+ - /, '') : P.title, folder, fps: B ? snapshot?.fps ?? 30 : pr.fps ?? timeline.state.data?.fps ?? 30, render, snapshot,
    snapshotMatches: !!(snapshot?.video && render && snapshot.video.size === render.size),
    proxy: proxyState === 'ready' && !proxyFresh(P) ? 'stale' : proxyState,
    notesFile: NOTES, maxEdits: MAX_EDITS,
    code: { status: player.state.status, version: player.state.version, error: player.state.error, builtAt: player.state.builtAt },
    agent: agentState(), connectLine: connectLine(P),
    hub: args.includes('--hub') ? args[args.indexOf('--hub') + 1] : null, held,
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
  log('vidéo libérée : un nouveau rendu la remplace');
}
function unhold() { held = false; log('vidéo reprise'); refreshProxy(); }
function status() {   // what changes often: polled by the page every 3 s with the replies
  const replies = readJson(REPLIES, { notes: {} }), video = pickVideo(P);
  return { code: meta().code, agent: agentState(), lots: lotsSummary(P, replies, listRuns(P)), timeline: { version: timeline.state.version, status: timeline.state.status, error: timeline.state.error },
    render: B ? renderState(P) : null, held, video: video ? stamp(video) : null, compare: compareItems(P).map((x) => x.id), proxy: proxyState };
}
const readNotes = () => readJson(NOTES, { episode: ep, notes: [] });
function writeNotes(data) {
  const tmp = NOTES + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  if (fs.existsSync(NOTES)) fs.copyFileSync(NOTES, NOTES.replace(/\.json$/, '.bak.json'));
  fs.renameSync(tmp, NOTES);
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
  if (!videoSeen) { videoSeen = true; log(`le navigateur lit la vidéo (${path.basename(video ?? '?')})`); }
  if (!video) { res.writeHead(404); return res.end('no video'); }
  if (held) { res.writeHead(503, { 'Retry-After': '5' }); return res.end('video being replaced'); }
  sendFile(req, res, video, 'video/mp4', true);
}
const json = (res, data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(JSON.stringify(data)); };
const body = (req, max = 60e6) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > max) { reject(new Error('trop lourd')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
// inside(root, rel) -> absolute path under root, or null (no ../ escape)
const inside = (root, rel) => { const f = path.resolve(root, '.' + path.sep + rel); return f.toLowerCase().startsWith(root.toLowerCase() + path.sep) ? f : null; };

process.on('uncaughtException', (e) => console.error(`  ${time()}  erreur ignorée : ${e.message}`));
// the agent the batch goes to: the one watching the tool (studio-cli wait says who it is), else the one chosen in the
// page (« Connecter à l'agent »); then what may need updating on its side (lib/updates.mjs), in at most 9 s
async function updatesFor(chosen, fresh = false) {
  const a = agentState(), ag = (a.watching && a.agent?.id ? agentById(a.agent.id) : null) ?? agentById(chosen) ?? detectAgent() ?? agentById('claude');
  let updates = null;
  try { updates = await Promise.race([checkUpdates(P, { agent: ag, fresh }), new Promise((r) => setTimeout(() => r(null), 9000))]); } catch (e) { log(`vérification des mises à jour impossible : ${e.message}`); }
  if (updates) log(updatesLine(updates));
  return { agent: { id: ag.id, name: ag.name }, updates, line: updates ? updatesLine(updates) : 'Mises à jour : vérification impossible pour l\'instant.' };
}
process.on('unhandledRejection', (e) => console.error(`  ${time()}  erreur ignorée : ${e?.message ?? e}`));

const FRAME_CACHE = path.join(CACHE, 'frames', ep);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pn = decodeURIComponent(url.pathname);
  try {
    if (pn === '/' || pn === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(HERE, 'studio.html')));
    }
    if (pn === '/favicon.png') return sendFile(req, res, path.join(HERE, 'favicon.png'), 'image/png');
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
      if (!ext) { res.writeHead(415); return res.end('image attendue (png, jpg, webp, gif)'); }
      let buf; try { buf = await body(req, 40e6); } catch { res.writeHead(413); return res.end('image trop lourde (40 Mo max)'); }
      const id = String(req.headers['x-note'] || 'note').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'note';
      const name = `${id}-${Date.now().toString(36)}.${ext}`;
      fs.writeFileSync(path.join(IMAGES, name), buf);
      log(`image ajoutée : images/${name}`);
      return json(res, { file: `images/${name}` });
    }
    if (pn.startsWith('/images/')) return sendFile(req, res, path.join(IMAGES, path.basename(pn.slice(8))));
    if (pn.startsWith('/lots/')) return sendFile(req, res, inside(P.LOTS, pn.slice(6)));   // captures of a sent batch
    if (pn === '/api/notes' && req.method === 'PUT') {
      const data = JSON.parse((await body(req)).toString('utf8'));
      if (!Array.isArray(data.notes)) throw new Error('notes must be an array');
      writeNotes(data);
      if (data.notes.length !== lastCount) { lastCount = data.notes.length; log(`${lastCount} note(s)`); }
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
      if (source === 'code' && !CODE) { res.writeHead(404); return res.end('pas d\'aperçu du code pour ce projet'); }
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
      return json(res, { ok: true, ...r, agent: agentState(), updates: u.line });
    }
    if (pn === '/api/updates') { const u = await updatesFor(url.searchParams.get('agent'), url.searchParams.has('fresh')); return json(res, { line: u.line, ...u.updates }); }
    // ---- the full re-render (asked here, run by Claude: studio-cli.mjs render) ----
    if (pn.startsWith('/api/render') && pn !== '/api/render/log' && !B) return json(res, { ok: false, why: 'ce projet ne se rend pas depuis le studio : exporte-le toi-même, le studio charge seul la nouvelle version' });
    if (pn === '/api/render' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString('utf8') || '{}');
      if (renderState(P)?.state === 'running') return json(res, { ok: false, why: 'un rendu tourne déjà' });
      const u = await updatesFor(b.agent);
      let r; try { r = createRenderLot(P, b, { updates: u.updates, agent: u.agent }); } catch (e) { return json(res, { ok: false, why: e.message }); }
      log(`demande de rendu envoyée (lot ${r.lot}) -> ${r.md}`);
      return json(res, { ok: true, ...r, agent: agentState(), updates: u.line });
    }
    if (pn === '/api/render/withdraw' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString('utf8'));
      try { withdrawRenderLot(P, +b.lot); log(`demande de rendu retirée (lot ${b.lot})`); return json(res, { ok: true }); } catch (e) { return json(res, { ok: false, why: e.message }); }
    }
    if (pn === '/api/render/stop' && req.method === 'POST') {
      if (renderState(P)?.state !== 'running') return json(res, { ok: false, why: 'aucun rendu en cours' });
      fs.writeFileSync(renderFiles(P).STOP, nowIso());
      log('arrêt du rendu demandé');
      return json(res, { ok: true });
    }
    if (pn === '/api/render/log') {
      let t = ''; try { t = fs.readFileSync(renderFiles(P).LOG, 'utf8'); } catch { /* no render yet */ }
      const NOISE = /X4000|^Copying public dir|^Bundling \d|^Rendered \d|^Encoded \d/;
      const lines = t.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n|\r/).filter((l) => l.trim() && !NOISE.test(l));
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(lines.slice(-160).join('\n'));
    }
    if (pn === '/api/compare') { const v = pickVideo(P); return json(res, { video: v ? stamp(v) : null, items: compareItems(P) }); }
    if (pn === '/api/hold' && req.method === 'POST') { await hold(); return json(res, { ok: true }); }
    if (pn === '/api/unhold' && req.method === 'POST') { unhold(); return json(res, { ok: true }); }
    if (pn === '/api/undo' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString('utf8'));
      const r = step(P, +b.lot, b.verb === 'redo' ? 'redo' : 'undo', 'toi (outil)');
      log(`lot ${b.lot} : ${b.verb === 'redo' ? 'rétabli' : 'annulé'} ${r.ok ? '✓ ' + r.files.join(', ') : '✗ ' + r.why}`);
      return json(res, r);
    }
    res.writeHead(404); res.end('not found');
  } catch (e) { if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); } res.end(String(e.message || e)); }
});

let port = +(args[args.indexOf('--port') + 1] || 0) || DEFAULT_PORT;
server.on('error', (e) => { if (e.code === 'EADDRINUSE') { port++; server.listen(port, '127.0.0.1'); } else throw e; });
server.on('listening', async () => {
  const url = `http://localhost:${port}/`;
  console.log(B ? `\n  Brambleshire Theatre - studio de revue de ${ep} (${folder})${INSTALLED ? '' : ' · atelier Dev'}` : `\n  Studio de revue - ${P.title} (${P.EP})${INSTALLED ? '' : ' · atelier Dev'}`);
  console.log(`  Ouvre : ${url}`);
  console.log(`  Notes enregistrées dans : ${NOTES}`);
  console.log(`  Ferme cette fenêtre pour arrêter l'outil.\n`);
  if (!args.includes('--no-open')) exec(process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`);
  buildProxy();
  await player.build(); player.watch();
});
server.listen(port, '127.0.0.1');
