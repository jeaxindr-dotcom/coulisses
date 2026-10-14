// An export at another speed (user request, 14/10/2026: « exporter à une autre vitesse, vidéo et audio synchro avec la
// vitesse » — « une molette allant de 0,5 à 2,0, chaque cran de 0,1 »). lib/export.mjs starts THIS, detached, instead of
// the export itself: it runs the export (the project's script, or lib/hf-render-run.mjs) and passes its words on to the
// log (COULISSES PROGRES / REMPLACE / FIN, the contract of docs\FICHE-COULISSES-REMOTION.md); at ×1 that is all.
// At any other speed (×0,5 to ×2,0), once the export is done, every video it wrote (the main file — « COULISSES FIN » — and the others it
// made in the same folder meanwhile, as the 1080p drawn from a 4K) gets its sped-up copy next to it, « <nom>-x1.25.mp4 »:
//   - the picture: every frame at its new time (setpts), then the same frame rate as the export (the fps filter: faster,
//     some frames are dropped; slower, frames are repeated — none is invented, the motion is less smooth below ×1);
//   - the sound: atempo, the same speed WITHOUT the voices going up or down in pitch; picture and sound the same length;
//   - the GPU encoder when there is one (lib/gpu.mjs), else x264; written as .tmp.mp4, then renamed.
// The export itself stays as it is (×1): it is the video the studio reviews, frame for frame with the code and the notes;
// a sped-up copy is a file to deliver, never the one under review (lib/projects.mjs leaves the « -x… » files aside).
// The progress of the export is told as 0–90 %, the copies 90–100 %; « COULISSES FIN » names the sped-up main file.
// usage: node lib/export-run.mjs <vitesse 0.5…2> <cwd> <node> <script> <args…>
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { gpuEncoder, gpuBitrate } from './gpu.mjs';

const [speedArg, cwd, exe, ...argv] = process.argv.slice(2);
const SPEED = +speedArg;
if (!(SPEED >= 0.5 && SPEED <= 2) || !exe || !argv.length) { console.error('usage: export-run.mjs <vitesse> <cwd> <node> <script> <args…>'); process.exit(2); }
const FAST = SPEED !== 1, started = Date.now();
const spedName = (f, s = SPEED) => f.replace(/\.mp4$/i, `-x${s}.mp4`);
if (FAST) console.log(`vitesse : ×${String(SPEED).replace('.', ',')} — l'export à ×1, puis sa copie à cette vitesse (image et son ensemble)${SPEED < 1 ? ', les images répétées' : ''}`);

let fin = null, child = null;
const take = (out) => {
  let buf = '';
  return (chunk) => {
    buf += String(chunk);
    const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const l of lines) {
      const t = l.trim();
      let m = /^COULISSES PROGRES\s+(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(t);
      if (m && FAST) { out.write(`COULISSES PROGRES ${Math.floor(+m[1].replace(',', '.') * 0.9)} ${m[2]}\n`); continue; }
      m = /^COULISSES FIN\s+"?(.+?)"?\s*$/.exec(t);
      if (m) { fin = m[1]; if (FAST) continue; }   // at another speed: said once the copies are made
      out.write(l + '\n');
    }
  };
};
child = spawn(exe, argv, { cwd, windowsHide: true, env: process.env });
child.stdout.on('data', take(process.stdout));
child.stderr.on('data', (d) => process.stderr.write(d));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => { try { child?.kill(); } catch { /* gone */ } process.exit(130); });
child.on('error', (e) => { console.error(e.message); process.exit(1); });
child.on('close', async (code) => {
  child = null;
  if (code !== 0) process.exit(code ?? 1);
  if (!FAST) process.exit(0);
  if (!fin || !fs.existsSync(fin)) { console.error('vitesse : l\'export n\'a pas dit son fichier final (COULISSES FIN) : pas de copie accélérée'); process.exit(1); }
  // the videos of this export: its main file, and the others it wrote in the same folder since it started
  const dir = path.dirname(fin), files = [fin];
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (f === fin || !/\.mp4$/i.test(n) || /\.tmp\.mp4$|-x\d+(?:[.,]\d+)?\.mp4$/i.test(n)) continue;
    try { if (fs.statSync(f).mtimeMs >= started - 2000) files.push(f); } catch { /* gone */ }
  }
  try {
    for (const [k, f] of files.entries()) {
      await speedUp(f, (x) => console.log(`COULISSES PROGRES ${Math.floor(90 + 10 * (k + x) / files.length)} vitesse ×${String(SPEED).replace('.', ',')}`));
      console.log(`→ ${spedName(f)}`);
    }
  } catch (e) { console.error(`vitesse ×${SPEED} : ${e.message} (l'export à ×1 est là : ${fin})`); process.exit(1); }
  console.log('COULISSES PROGRES 100 fin');
  console.log(`COULISSES FIN "${spedName(fin)}"`);
  process.exit(0);
});

function probe(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate,color_space,color_primaries,color_transfer,color_range:format=duration', '-of', 'json', f], { encoding: 'utf8', windowsHide: true });
  const j = JSON.parse(r.stdout || '{}'), v = (j.streams ?? []).find((s) => s.codec_type === 'video');
  if (!v) throw new Error(`pas d'image dans ${path.basename(f)}`);
  const [a, b] = String(v.r_frame_rate ?? '30/1').split('/').map(Number);
  return { w: v.width, h: v.height, fps: b ? a / b : a || 30, rate: v.r_frame_rate ?? '30', audio: (j.streams ?? []).some((s) => s.codec_type === 'audio'), dur: +(j.format?.duration ?? 0), color: v };
}
function ffmpeg(args, onTime) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-v', 'error', '-nostats', '-progress', 'pipe:1', '-y', ...args], { windowsHide: true });
    child = p;
    let err = '', buf = '';
    p.stdout.on('data', (d) => { buf += d; const l = buf.split(/\r?\n/); buf = l.pop(); for (const x of l) { const m = /^out_time_us=(\d+)/.exec(x); if (m) onTime(+m[1] / 1e6); } });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (c) => { child = null; c === 0 ? resolve() : reject(new Error(err.trim().split('\n').slice(-2).join(' | ') || `ffmpeg ${c}`)); });
  });
}
async function speedUp(file, progress) {
  const P = probe(file), out = spedName(file), tmp = out.replace(/\.mp4$/i, '.tmp.mp4'), outDur = P.dur / SPEED;
  const tags = [];
  for (const [k, o] of [['color_space', '-colorspace'], ['color_primaries', '-color_primaries'], ['color_transfer', '-color_trc'], ['color_range', '-color_range']]) if (P.color[k] && P.color[k] !== 'unknown') tags.push(o, P.color[k]);
  const g = gpuEncoder(), br = gpuBitrate(P.w, P.h);
  const enc = (gpu) => (gpu && g.mode === 'nvenc' ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-b:v', br, '-maxrate', `${parseInt(br, 10) * 1.5}M`, '-bufsize', `${parseInt(br, 10) * 2}M`]
    : gpu && g.mode === 'videotoolbox' ? ['-c:v', 'h264_videotoolbox', '-b:v', br] : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17']);
  const run = (gpu) => ffmpeg(['-i', file, '-map', '0:v:0', ...(P.audio ? ['-map', '0:a:0'] : []),
    // the fps FILTER (not the -r output option: it added two frames at the start, the picture 67 ms late on its sound)
    '-vf', `setpts=PTS/${SPEED},fps=${P.rate}`, ...enc(gpu), '-pix_fmt', 'yuv420p', ...tags,
    ...(P.audio ? ['-af', `atempo=${SPEED}`, '-c:a', 'aac', '-b:a', '320k', '-ar', '48000'] : []), '-movflags', '+faststart', tmp],
  (s) => progress(Math.min(1, s / Math.max(0.1, outDur))));
  console.log(`vitesse ×${String(SPEED).replace('.', ',')} : ${path.basename(file)} (${P.w}×${P.h}, ${g.mode === 'cpu' ? 'processeur' : 'GPU'})`);
  if (g.mode === 'cpu') await run(false);
  else await run(true).catch((e) => { console.log(`le GPU a échoué (${e.message.slice(0, 200)}) : de nouveau sur le processeur`); return run(false); });
  // the same length for the picture and the sound (synchronised), the expected length
  const Q = probe(tmp);
  if (Math.abs(Q.dur - outDur) > 0.25) throw new Error(`la copie dure ${Q.dur.toFixed(2)} s au lieu de ${outDur.toFixed(2)} s`);
  if (P.audio) {
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', tmp], { encoding: 'utf8', windowsHide: true });
    const d = Object.fromEntries((JSON.parse(r.stdout || '{}').streams ?? []).map((s) => [s.codec_type, +s.duration]));
    if (Math.abs((d.video ?? 0) - (d.audio ?? 0)) > 0.1) throw new Error(`image ${d.video?.toFixed(2)} s et son ${d.audio?.toFixed(2)} s ne durent pas autant`);
  }
  for (let i = 0; ; i++) { try { fs.renameSync(tmp, out); break; } catch (e) { if (i >= 60) throw e; await new Promise((r) => setTimeout(r, 1000)); } }
}
