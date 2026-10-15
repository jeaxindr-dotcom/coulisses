// A video at another speed, picture and sound together (user request, 14/10/2026: « exporter à une autre vitesse, vidéo et
// audio synchro avec la vitesse » · « une molette allant de 0,5 à 2,0, chaque cran de 0,1 » · « dans l'onglet d'envoi, peu
// importe le projet »). Used by the end of an export (lib/export-run.mjs), the end of a Theatre render (lib/render.mjs)
// and « Créer la copie » on the current video of any project (lib/speed-run.mjs).
//   - the copy is written next to the video, « <nom>-x1.3.mp4 » (.tmp.mp4 first, then renamed); the video itself is kept:
//     it is the one the studio reviews (lib/projects.mjs, lib/episode.mjs leave the « -x… » files aside);
//   - the picture: every frame at its new time (setpts), then the fps FILTER (the -r option added two frames at the start,
//     the picture 67 ms late on its sound). Faster, EVERY frame is kept: the frame rate goes up with the speed (×1,2 of
//     30 fps = 36 fps, ×2 = 60), at most 60 — 15/10/2026, at 30 fps one frame in six was dropped at ×1,2 and the motion
//     jumped (« ça saccade »); slower, the frames are repeated (none is invented, the motion is less smooth);
//   - the sound: atempo, the same pitch; measured on a flash + beep test video, the sound stays within 20 ms of the
//     picture from ×0,5 to ×2 (tests/export-speed.mjs);
//   - the GPU encoder when there is one (lib/gpu.mjs), else x264; the copy's length and its sync are checked.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { gpuEncoder, gpuBitrate } from './gpu.mjs';

export const SPED = /-x\d+(?:[.,]\d+)?\.mp4$/i;   // a copy at another speed (never the reviewed video)
// a notch of the dial: 0,5 to 2,0 by 0,1 (null otherwise)
export function speedOf(v) {
  const x = +v;
  if (!Number.isFinite(x) || Math.abs(x * 10 - Math.round(x * 10)) > 1e-6) return null;
  const n = Math.round(x * 10) / 10;
  return n >= 0.5 && n <= 2 ? n : null;
}
export const spedName = (file, s) => file.replace(/\.mp4$/i, `-x${s}.mp4`);
// the frame rate of the copy: the video's (« 30/1 », « 30000/1001 ») × the speed when faster, at most 60; the same when slower
export function spedRate(rate, S) {
  const [a, b = 1] = String(rate || '30').split('/').map(Number), fps = a / (b || 1);
  if (!(S > 1) || !(fps > 0)) return `${a}/${b || 1}`;
  if (fps * S > 60) return '60/1';
  const num = Math.round(a * S * 10), den = (b || 1) * 10, g = (x, y) => (y ? g(y, x % y) : x), k = g(num, den);
  return `${num / k}/${den / k}`;
}
export const speedWords = (s) => `×${String(s).replace('.', ',')}`;

function probe(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate,duration,color_space,color_primaries,color_transfer,color_range:format=duration', '-of', 'json', f], { encoding: 'utf8', windowsHide: true });
  const j = JSON.parse(r.stdout || '{}'), streams = j.streams ?? [], v = streams.find((s) => s.codec_type === 'video'), a = streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new Error(`pas d'image dans ${path.basename(f)}`);
  return { w: v.width, h: v.height, rate: v.r_frame_rate ?? '30', audio: !!a, dur: +(j.format?.duration ?? 0), vdur: +(v.duration ?? j.format?.duration ?? 0), adur: a ? +(a.duration ?? 0) : null, color: v };
}
function ffmpeg(args, onTime, onChild) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-v', 'error', '-nostats', '-progress', 'pipe:1', '-y', ...args], { windowsHide: true });
    onChild?.(p);
    let err = '', buf = '';
    p.stdout.on('data', (d) => { buf += d; const l = buf.split(/\r?\n/); buf = l.pop(); for (const x of l) { const m = /^out_time_us=(\d+)/.exec(x); if (m) onTime(+m[1] / 1e6); } });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (c) => { onChild?.(null); c === 0 ? resolve() : reject(new Error(err.trim().split('\n').slice(-2).join(' | ') || `ffmpeg ${c}`)); });
  });
}
// the copy of `file` at speed S; resolves to its path. onProgress(0…1), log(line), onChild(process|null) (to stop it)
export async function speedUp(file, S, { onProgress = () => {}, log = () => {}, onChild } = {}) {
  if (speedOf(S) === null || S === 1) throw new Error(`vitesse ${S} : de 0,5 à 2,0 par crans de 0,1, autre que 1`);
  const P = probe(file), out = spedName(file, S), tmp = out.replace(/\.mp4$/i, '.tmp.mp4'), outDur = P.dur / S, rate = spedRate(P.rate, S);
  const tags = [];
  for (const [k, o] of [['color_space', '-colorspace'], ['color_primaries', '-color_primaries'], ['color_transfer', '-color_trc'], ['color_range', '-color_range']]) if (P.color[k] && P.color[k] !== 'unknown') tags.push(o, P.color[k]);
  const g = gpuEncoder(), br0 = parseInt(gpuBitrate(P.w, P.h), 10), ratio = Math.min(2, Math.max(1, ((([x, y = 1]) => x / y)(rate.split('/').map(Number))) / ((([x, y = 1]) => x / y)(String(P.rate).split('/').map(Number)) || 30)));
  const br = `${Math.round(br0 * ratio)}M`;
  const enc = (gpu) => (gpu && g.mode === 'nvenc' ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-b:v', br, '-maxrate', `${parseInt(br, 10) * 1.5}M`, '-bufsize', `${parseInt(br, 10) * 2}M`]
    : gpu && g.mode === 'videotoolbox' ? ['-c:v', 'h264_videotoolbox', '-b:v', br] : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17']);
  const run = (gpu) => ffmpeg(['-i', file, '-map', '0:v:0', ...(P.audio ? ['-map', '0:a:0'] : []),
    '-vf', `setpts=PTS/${S},fps=${rate}`, ...enc(gpu), '-pix_fmt', 'yuv420p', ...tags,
    ...(P.audio ? ['-af', `atempo=${S}`, '-c:a', 'aac', '-b:a', '320k', '-ar', '48000'] : []), '-movflags', '+faststart', tmp],
  (s) => onProgress(Math.min(1, s / Math.max(0.1, outDur))), onChild);
  const fpsOut = (([x, y = 1]) => x / y)(rate.split('/').map(Number));
  log(`vitesse ${speedWords(S)} : ${path.basename(file)} (${P.w}×${P.h}, ${Math.round(fpsOut * 100) / 100} images/s, ${g.mode === 'cpu' ? 'processeur' : 'GPU'})`);
  try {
    if (g.mode === 'cpu') await run(false);
    else await run(true).catch((e) => { log(`le GPU a échoué (${e.message.slice(0, 200)}) : de nouveau sur le processeur`); return run(false); });
    // its length, and the picture and the sound the same length (synchronised)
    const Q = probe(tmp);
    if (Math.abs(Q.dur - outDur) > 0.25) throw new Error(`la copie dure ${Q.dur.toFixed(2)} s au lieu de ${outDur.toFixed(2)} s`);
    if (P.audio && Math.abs(Q.vdur - (Q.adur ?? 0)) > 0.1) throw new Error(`image ${Q.vdur.toFixed(2)} s et son ${(Q.adur ?? 0).toFixed(2)} s ne durent pas autant`);
  } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { /* */ } throw e; }
  for (let i = 0; ; i++) { try { fs.renameSync(tmp, out); break; } catch (e) { if (i >= 60) throw e; await new Promise((r) => setTimeout(r, 1000)); } }
  onProgress(1);
  return out;
}
