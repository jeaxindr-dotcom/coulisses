// The export at another speed, ×0,5 to ×2,0 by notches of 0,1 (lib/export-run.mjs, user request 14/10/2026: « vidéo et
// audio synchro avec la vitesse », « une molette allant de 0,5 à 2,0 »).
// A test video where a white flash and a 440 Hz beep start together every 2 s (from 1 s); an « export script » that
// writes it and says COULISSES FIN; then the runner at each speed:
//   - the ×1 file kept as it is, the copy « -x1.25.mp4 » next to it; the progress lines rescaled, FIN = the copy;
//   - its length is the length ÷ the speed, picture and sound alike; faster, EVERY frame kept, the frame rate × the speed
//     (×1,2 = 36 fps, ×2 = 60); slower, 30 fps (frames repeated);
//   - every flash and its beep still start together (within a frame), at their time ÷ the speed;
//   - the beep is still 440 Hz (atempo: faster or slower, never higher or lower); a second file of the export (a 1080p drawn from the
//     4K…) gets its copy too; the reviewed video is never a copy (lib/projects.mjs).
// usage: node tests/export-speed.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'export-speed-test'), OUT = path.join(SCR, 'export');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
// the source: 12 s, 30 fps, a 3-frame white flash and a 100 ms beep at 1, 3, 5, 7, 9, 11 s
const SRC = path.join(SCR, 'source.mp4'), SRC2 = path.join(SCR, 'source-1080p.mp4');
const on = 'gte(t,1)*lt(mod(t-1,2),0.1)';
// (the flash by frame number: by time, a rounding made some flashes 4 frames long)
ff('-f', 'lavfi', '-i', `color=black:s=1280x720:r=30:d=12,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(n,30)*lt(mod(n-30,60),3)'`,
  '-f', 'lavfi', '-i', `aevalsrc='if(${on},0.8*sin(2*PI*440*t),0)':s=48000:d=12`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', SRC);
ff('-i', SRC, '-vf', 'scale=640:360', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy', SRC2);
// the « export script »: the two files of an export (the main one, then a second one), its progress, FIN
const SCRIPT = path.join(SCR, 'fake-export.mjs');
fs.writeFileSync(SCRIPT, `import fs from 'node:fs';
const [src, src2, dir] = process.argv.slice(2);
console.log('COULISSES PROGRES 50 rendu');
// files written now, as an export writes them (a copy would keep the source's date on Windows)
fs.writeFileSync(dir + '/film-1080p.mp4', fs.readFileSync(src2));
fs.writeFileSync(dir + '/film-2160p.mp4', fs.readFileSync(src));
console.log('COULISSES PROGRES 100 fini');
console.log('COULISSES FIN "' + dir.replace(/\\\\/g, '/') + '/film-2160p.mp4"');
`);
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration,r_frame_rate:format=duration', '-of', 'json', f], { encoding: 'utf8' }));
// the starts of the flashes (frame times) and of the beeps (sample times)
function flashes(f, fps = 30) {   // every frame as 16×9 grey pixels (a constant frame rate: frame i is at i / fps s)
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-an', '-vf', 'scale=16:9,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 256e6 });
  const out = [];   // the start of each flash; out.centres: the middle of each (its frames, each 1/30 s long)
  out.centres = [];
  const N = raw.length / 144;
  let prev = 0, i0 = 0;
  for (let i = 0; i <= N; i++) {
    let y = 0; if (i < N) { for (let k = 0; k < 144; k++) y += raw[i * 144 + k]; y /= 144; }
    if (y > 128 && prev <= 128) { out.push(i / fps); i0 = i; }
    if (y <= 128 && prev > 128) out.centres.push((i0 + i) / 2 / fps);
    prev = y;
  }
  return out;
}
function beeps(f, S = 1) {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 256e6 });
  const n = pcm.length / 2, out = [], freqs = [];
  let lastLoud = -1e9;   // a beep starts at the first peak above 0.5 after 100 ms without one (the AAC pre-echo stays below)
  for (let i = 0; i < n; i++) {
    const x = Math.abs(pcm.readInt16LE(i * 2)) / 32768;
    if (x <= 0.5) continue;
    if (i - lastLoud > 4800) {   // its frequency from the zero crossings of the next 40 ms
      out.push(i / 48000);
      let z = 0; for (let k = i + 1; k < Math.min(n, i + 1920); k++) if ((pcm.readInt16LE(k * 2) >= 0) !== (pcm.readInt16LE((k - 1) * 2) >= 0)) z++;
      freqs.push(z / 2 / 0.04);
    }
    lastLoud = i;
  }
  // the centre of each beep's energy (a time-stretch spreads the start of a sound: its centre is where it is heard)
  const centres = out.map((t0) => {
    let e = 0, et = 0;
    for (let i = Math.max(0, Math.round((t0 - 0.06) * 48000)); i < Math.min(n, Math.round((t0 + 0.1 / S + 0.12) * 48000)); i++) { const x = pcm.readInt16LE(i * 2) / 32768; e += x * x; et += (x * x * i) / 48000; }
    return et / e;
  });
  return { at: out, freqs, centres };
}
const f0 = flashes(SRC), b0 = beeps(SRC);
check(f0.length === 6 && b0.at.length === 6 && f0.every((t, i) => Math.abs(t - b0.at[i]) < 0.04), `the test video: 6 flashes, 6 beeps, together (${f0.map((t) => t.toFixed(2)).join(' ')})`);

for (const S of [0.5, 1.2, 1.3, 2]) {   // the two ends of the dial, and notches between
  console.log(`×${S}`);
  for (const n of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, n), { force: true });
  const r = spawnSync(process.execPath, [path.join(STUDIO, 'lib', 'export-run.mjs'), String(S), SCR, process.execPath, SCRIPT, SRC, SRC2, OUT], { encoding: 'utf8', timeout: 300000 });
  const main = path.join(OUT, 'film-2160p.mp4'), copy = path.join(OUT, `film-2160p-x${S}.mp4`), copy2 = path.join(OUT, `film-1080p-x${S}.mp4`);
  const progress = [...r.stdout.matchAll(/^COULISSES PROGRES (\d+)/gm)].map((m) => +m[1]);
  const fin = /COULISSES FIN "(.+?)"/.exec(r.stdout)?.[1];
  check(r.status === 0 && fs.existsSync(main) && fs.existsSync(copy) && fs.existsSync(copy2) && path.resolve(fin ?? '') === path.resolve(copy), `the ×1 files kept, their copies written, FIN = the copy (${r.status === 0 ? path.basename(fin ?? '') : r.stderr.trim().split('\n').pop()})`);
  check(progress.length && progress.every((p, i) => i === 0 || p >= progress[i - 1]) && Math.max(...progress.slice(0, 2)) <= 90 && progress.at(-1) === 100, `the progress: the export within 0-90 %, the copies to 100 % (${progress.join(' ')})`);
  if (!fs.existsSync(copy)) continue;
  const P = probe(copy), v = P.streams.find((s) => s.codec_type === 'video'), a = P.streams.find((s) => s.codec_type === 'audio');
  // faster: every frame kept, the frame rate × the speed (36 fps at ×1,2…; 15/10/2026: one frame in six dropped jumped)
  const fps = S > 1 ? 30 * S : 30, nFrames = +execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', copy], { encoding: 'utf8' }).trim();
  const [rn, rd = 1] = v.r_frame_rate.split('/').map(Number);
  check(Math.abs(+P.format.duration - 12 / S) < 0.1 && Math.abs(+v.duration - +a.duration) < 0.06 && Math.abs(rn / rd - fps) < 0.01 && (S < 1 || nFrames === 360), `its length ${(+P.format.duration).toFixed(2)} s (= 12 ÷ ${S}), picture ${(+v.duration).toFixed(2)} s, sound ${(+a.duration).toFixed(2)} s, ${v.r_frame_rate} fps, ${nFrames} frames${S > 1 ? ' (all 360 kept)' : ''}`);
  const f = flashes(copy, fps), b = beeps(copy, S);
  // in sync: the middle of each flash and the middle of its beep within one frame (33 ms; a lip sync is seen from ~45 ms)
  const pairs = f.centres.map((t, i) => (b.centres[i] ?? 99) - t);
  check(f.length === 6 && b.at.length === 6 && pairs.every((d) => Math.abs(d) < 1 / 30), `every flash with its beep: the sound ${pairs.map((d) => (d * 1000).toFixed(0)).join(' ')} ms from the picture (within a frame, 33 ms)`);
  check(f.every((t, i) => Math.abs(t - (1 + 2 * i) / S) < 1 / fps + 0.01), `at their time ÷ ${S} (${[0, 1, 2, 3, 4, 5].map((i) => ((1 + 2 * i) / S).toFixed(2)).join(' ')})`);
  check(b.freqs.every((x) => Math.abs(x - 440) < 30), `the beep is still 440 Hz, not higher (${b.freqs.map((x) => Math.round(x)).join(' ')} Hz)`);
}
// the notches of the dial (lib/export.mjs speedOf): 0,5 to 2,0 by 0,1, nothing else
const { speedOf } = await import('../lib/export.mjs');
check(speedOf(0.5) === 0.5 && speedOf('1.3') === 1.3 && speedOf(2) === 2 && speedOf(1) === 1 && speedOf(0.4) === null && speedOf(2.1) === null && speedOf(1.25) === null && speedOf('x') === null,
  'the dial: 0,5 · 1,3 · 2,0 accepted; 0,4 · 2,1 · 1,25 (between two notches) refused');
// the reviewed video is never a sped-up copy
const { SPED } = await import('../lib/speed.mjs');   // used by lib/projects.mjs and lib/episode.mjs
check(SPED.test('Die-Glocke-2160p-x1.25.mp4') && SPED.test('short13_4k_final-x1.5.mp4') && SPED.test('film-x0.5.mp4') && SPED.test('film-x2.mp4') && !SPED.test('Die-Glocke-2160p.mp4') && !SPED.test('long04_final.mp4'), 'a « -x1.25 » copy is never the video under review (lib/projects.mjs)');
console.log(`\n${ok} ok, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
