// « Les yeux » : an image of the episode at a frame, either
//   - from the rendered video (ffmpeg, the review copy when fresh: fast), or
//   - from the CURRENT code (Remotion renderStill: bundle of 06_Remotion/src, reused while the code is unchanged,
//     Chrome with --gl=angle as every Brambleshire render), so a correction can be checked without re-rendering.
// Used by the studio server (/api/frame, captures of a sent batch) and by studio-cli.mjs (control images).
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromePath } from './tools.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compositionId } from './episode.mjs';
import { CACHE, cacheReadme } from './place.mjs';
import { t } from './i18n.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CHROME = chromePath();   // lib/tools.mjs: settings.json, else where Chrome usually is

export function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ffmpeg ${c}`))));
  });
}
// crop = { x, y, width, height } in frame pixels; width = output width (keeps the ratio)
export async function videoFrame(src, frame, fps, out, { crop, width, overlay } = {}) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const t = Math.max(0, (frame - 0.5) / fps);   // the first image whose time is >= t is `frame`
  const chain = [];
  if (crop) chain.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  if (width) chain.push(`scale=${width}:-2`);
  const q = /\.jpe?g$/i.test(out) ? ['-q:v', '2'] : [];
  if (overlay) {   // a transparent PNG of the marks (same size as the frame) drawn over the image
    const fc = `[0:v][1:v]overlay=0:0${chain.length ? ',' + chain.join(',') : ''}`;
    return ffmpeg(['-ss', t.toFixed(4), '-i', src, '-i', overlay, '-filter_complex', fc, '-frames:v', '1', ...q, out]);
  }
  return ffmpeg(['-ss', t.toFixed(4), '-i', src, '-frames:v', '1', ...(chain.length ? ['-vf', chain.join(',')] : []), ...q, out]);
}
// several images side by side (a strip: before / after of a range)
// labels[i] (optional) is written on image i (its frame number)
export async function tile(files, out, { cols = 4, width = 480, labels = [] } = {}) {
  const h = Math.round(width * 9 / 16 / 2) * 2, FONT = 'C\\:/Windows/Fonts/arial.ttf';
  const cell = (i) => `[${i}:v]scale=${width}:${h}${labels[i] !== undefined ? `,drawtext=fontfile='${FONT}':text='${labels[i]}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6` : ''}[s${i}]`;
  if (files.length === 1) return ffmpeg(['-i', files[0], '-filter_complex', cell(0).replace('[s0]', ''), '-frames:v', '1', '-q:v', '3', out]);
  const fc = files.map((_, i) => cell(i)).join(';') + ';' + files.map((_, i) => `[s${i}]`).join('') +
    `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * width}_${Math.floor(i / cols) * h}`).join('|')}:fill=black`;
  return ffmpeg([...files.flatMap((f) => ['-i', f]), '-filter_complex', fc, '-frames:v', '1', '-q:v', '3', out]);
}

// ---------- current code: Remotion renderStill ----------
const codeState = new Map();   // remotionDir -> { sig, serveUrl, browser, comps: Map }
function srcSignature(dir) {   // newest file time + file count of src/: changes on every save
  let newest = 0, count = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { count++; newest = Math.max(newest, fs.statSync(f).mtimeMs); } } };
  walk(path.join(dir, 'src'));
  return `${Math.round(newest)}-${count}`;
}
async function remotionApis(dir) {
  const req = createRequire(path.join(dir, 'package.json'));
  const imp = (m) => import(pathToFileURL(req.resolve(m)).href);
  const [bundler, renderer] = await Promise.all([imp('@remotion/bundler'), imp('@remotion/renderer')]);
  return { bundle: bundler.bundle ?? bundler.default?.bundle, r: renderer.default ?? renderer };
}
let chain = Promise.resolve();   // one code render at a time (one bundle, one browser)
export function codeFrame(p, frame, out, opts = {}) {
  const job = chain.then(() => codeFrameNow(p, frame, out, opts));
  chain = job.catch(() => {});
  return job;
}
async function codeFrameNow(p, frame, out, { log = () => {}, scale = 1 } = {}) {
  const { r, st, comp, chromiumOptions } = await prepare(p, log);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  frame = Math.max(0, Math.min(comp.durationInFrames - 1, Math.round(frame)));
  await r.renderStill({ composition: comp, serveUrl: st.serveUrl, output: out, frame, inputProps: p.remotion?.props ?? {}, imageFormat: /\.png$/i.test(out) ? 'png' : 'jpeg', jpegQuality: 90,
    browserExecutable: CHROME, chromiumOptions, puppeteerInstance: st.browser, overwrite: true, scale, timeoutInMilliseconds: 600000, logLevel: 'error', onBrowserLog: () => {} });
  return { out, frame, durationInFrames: comp.durationInFrames, fps: comp.fps, width: comp.width, height: comp.height };
}
// several frames of the code in ONE page load (the episode's textures load once): frames first, first+step, … ≤ last
export function codeFrames(p, first, last, step, outDir, opts = {}) {
  const job = chain.then(() => codeFramesNow(p, first, last, step, outDir, opts));
  chain = job.catch(() => {});
  return job;
}
async function codeFramesNow(p, first, last, step, outDir, { log = () => {} } = {}) {
  const { r, st, comp, chromiumOptions } = await prepare(p, log);
  const a = Math.max(0, Math.round(first)), b = Math.min(comp.durationInFrames - 1, Math.round(last));
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  // everyNthFrame counts from frame 0 of the range: the range starts at `a`, so the frames are a, a+step, …
  await r.renderFrames({ composition: comp, serveUrl: st.serveUrl, outputDir: outDir, inputProps: p.remotion?.props ?? {}, imageFormat: 'jpeg', jpegQuality: 85,
    frameRange: [a, b], everyNthFrame: Math.max(1, step), concurrency: 1, onStart: () => {}, onFrameUpdate: () => {},
    browserExecutable: CHROME, chromiumOptions, puppeteerInstance: st.browser, timeoutInMilliseconds: 600000, logLevel: 'error', onBrowserLog: () => {} });
  return fs.readdirSync(outDir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().map((f) => path.join(outDir, f));
}
// the whole video of a composition (« Rendre ce plan », lib/shot-render-run.mjs): the same bundle and browser as the
// stills, H.264; scale (2 for a 4K clip of a 1080 composition), muted when the clip it replaces has no sound
export function renderVideo(p, out, opts = {}) {
  const job = chain.then(() => renderVideoNow(p, out, opts));
  chain = job.catch(() => {});
  return job;
}
async function renderVideoNow(p, out, { scale = 1, muted = true, frameRange = null, onProgress = () => {}, log = () => {}, concurrency = null } = {}) {
  const { r, st, comp, chromiumOptions } = await prepare(p, log);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await r.renderMedia({ composition: comp, serveUrl: st.serveUrl, codec: 'h264', outputLocation: out, inputProps: p.remotion?.props ?? {}, scale, muted, frameRange,
    crf: 16, pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: 92, overwrite: true, concurrency,
    browserExecutable: CHROME, chromiumOptions, puppeteerInstance: st.browser, timeoutInMilliseconds: 600000, logLevel: 'error', onBrowserLog: () => {},
    onProgress: (x) => onProgress(x.progress ?? 0, x.renderedFrames ?? 0, x.encodedFrames ?? 0, x.stitchStage ?? null) });
  return { out, durationInFrames: comp.durationInFrames, fps: comp.fps, width: Math.round(comp.width * scale), height: Math.round(comp.height * scale) };
}
// the size of a composition (« Rendre ce plan »: the scale of the clip it becomes)
export async function compositionOf(p, log = () => {}) {
  const job = chain.then(async () => { const { comp } = await prepare(p, log); return { width: comp.width, height: comp.height, fps: comp.fps, durationInFrames: comp.durationInFrames }; });
  chain = job.catch(() => {});
  return job;
}
async function prepare(p, log) {
  const dir = p.remotionDir, G = p.remotion ?? null;   // G: a generic Remotion project (.coulisses), else a Brambleshire episode
  const { bundle, r } = await remotionApis(dir);
  let st = codeState.get(dir);
  if (!st) { st = { sig: null, serveUrl: null, browser: null, comps: new Map() }; codeState.set(dir, st); }
  const sig = srcSignature(dir);
  const bundleDir = G ? path.join(CACHE, `bundle-${crypto.createHash('sha1').update(dir.toLowerCase()).digest('hex').slice(0, 8)}`) : path.join(CACHE, 'bundle');
  const sigFile = path.join(bundleDir, 'studio-signature.txt');
  if (st.sig !== sig) {
    if (fs.existsSync(sigFile) && fs.readFileSync(sigFile, 'utf8') === sig) st.serveUrl = bundleDir;   // left by another process
    else {
      log(t('frm.bundling'));
      const t0 = Date.now();
      const tmp = `${bundleDir}-${process.pid}-${Date.now()}`;
      // public/ (≈ 3 GB of art) is NOT copied into the bundle: Remotion's own symlink needs Windows developer mode and
      // falls back to a full copy. The bundle is made with an empty public dir, then public/ is a JUNCTION to the real
      // folder (no admin right needed). Deleting a bundle removes the junction only, never the art it points to.
      const empty = path.join(CACHE, 'empty-public'); fs.mkdirSync(empty, { recursive: true });
      await bundle({ entryPoint: G?.entree ?? path.join(dir, 'src', 'index.ts'), outDir: tmp, enableCaching: true, symlinkPublicDir: false, publicDir: empty, onProgress: () => {} });
      const pub = path.join(tmp, 'public');
      fs.rmSync(pub, { recursive: true, force: true });   // the empty copy
      if (fs.existsSync(path.join(dir, 'public'))) fs.symlinkSync(path.join(dir, 'public'), pub, 'junction'); else fs.mkdirSync(pub);
      cacheReadme();
      fs.rmSync(bundleDir, { recursive: true, force: true });
      fs.renameSync(tmp, bundleDir);
      fs.writeFileSync(sigFile, sig);
      st.serveUrl = bundleDir;
      log(t('frm.bundled', { s: Math.round((Date.now() - t0) / 1000) }));
    }
    st.sig = sig; st.comps.clear();
  }
  const chromiumOptions = { gl: 'angle' };
  if (!st.browser) st.browser = await r.openBrowser('chrome', { browserExecutable: CHROME, chromiumOptions, logLevel: 'error' });
  const id = G?.composition ?? compositionId(p), inputProps = G?.props ?? {};
  let comp = st.comps.get(id);
  if (!comp) {
    comp = await r.selectComposition({ serveUrl: st.serveUrl, id, inputProps, browserExecutable: CHROME, chromiumOptions, puppeteerInstance: st.browser, timeoutInMilliseconds: 600000, logLevel: 'error', onBrowserLog: () => {} });
    st.comps.set(id, comp);
  }
  return { r, st, comp, chromiumOptions };
}
export async function closeCode() {
  for (const st of codeState.values()) { try { await st.browser?.close({ silent: true }); } catch { /* already closed */ } st.browser = null; }
}
// crop box around a mark (frame pixels): padded by 24 px, at least 320×180, kept inside the frame (as HyperFrames)
export function cropAround(points, W = 1920, H = 1080) {
  if (!points?.length) return null;
  const xs = points.map((q) => q[0]), ys = points.map((q) => q[1]);
  const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  const width = Math.min(W, Math.max(480, box.width + 48)), height = Math.min(H, Math.max(270, box.height + 48));
  const even = (n) => Math.max(0, Math.round(n / 2) * 2);
  const x = Math.min(Math.max(0, box.x + box.width / 2 - width / 2), W - width);
  const y = Math.min(Math.max(0, box.y + box.height / 2 - height / 2), H - height);
  return { x: even(x), y: even(y), width: even(width), height: even(height) };
}

// width, height and frame rate of a video (an imported project's video can be 9:16, 25 or 60 fps)
export function probeVideo(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', file], { encoding: 'utf8', windowsHide: true });
  try { const v = JSON.parse(r.stdout).streams[0]; const [a, b] = v.r_frame_rate.split('/').map(Number); return { size: [v.width, v.height], fps: b ? Math.round((a / b) * 1000) / 1000 : a }; }
  catch { return { size: [1920, 1080], fps: 30 }; }
}
