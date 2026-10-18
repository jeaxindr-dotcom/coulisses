// The GPU of the exports (user request, 14/10/2026: « quand Coulisses exporte, il passe par le GPU de base »). Measured
// on a 4K Video du monde film, the same frames: PNG frames + x264 (the CPU) 6.5 frames/s with 4 Chromes; JPEG frames +
// NVENC (the GPU) 11.4 with 4 Chromes, 14.8 with 6 — and a better picture than x264 crf 17 at 50 Mbit/s (SSIM 0.993
// against 0.992, measured against Chrome's lossless frames).
// What it does: one short test encode (0.2 s of black) tells whether the PC's GPU encoder really works — an encoder
// listed by ffmpeg can still fail (no NVIDIA card, an old driver) —, once per process. The answer goes to every export:
//   - an export script of a Remotion project (lib/export.mjs) gets COULISSES_GPU=<mode> in its environment: « nvenc »
//     (Windows, Linux: Remotion's h264_nvenc), « videotoolbox » (macOS), or « cpu » (no GPU encoder, or turned off). An
//     older script that does not know it simply ignores it (docs/FICHE-COULISSES-REMOTION.md, « Le script d'export »);
//   - a HyperFrames export: « hyperframes render --gpu »; « Rendre ce plan » and a Theatre episode's render: Remotion's
//     hardware encoder, with a bitrate (a hardware encoder has no crf).
// Turned off by settings.json « exportGpu »: false (or COULISSES_GPU=cpu in the environment).
import { spawnSync } from 'node:child_process';
import { readSettings } from './i18n.mjs';

const CANDIDATES = process.platform === 'darwin' ? [['videotoolbox', 'h264_videotoolbox', 'Apple VideoToolbox']] : [['nvenc', 'h264_nvenc', 'NVIDIA NVENC']];
let memo = null;
export function gpuOff() {
  if (String(process.env.COULISSES_GPU ?? '').toLowerCase() === 'cpu') return true;
  try { return readSettings().exportGpu === false; } catch { return false; }
}
// { mode: 'nvenc' | 'videotoolbox' | 'cpu', encoder, name, why }
export function gpuEncoder({ ffmpeg = 'ffmpeg', fresh = false } = {}) {
  if (gpuOff()) return { mode: 'cpu', encoder: null, name: null, why: 'off' };
  if (memo && !fresh) return memo;
  for (const [mode, encoder, name] of CANDIDATES) {
    const r = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=256x256:r=30:d=0.2', '-c:v', encoder, '-f', 'null', '-'], { windowsHide: true, timeout: 20000 });
    if (r.status === 0) return (memo = { mode, encoder, name, why: null });
  }
  return (memo = { mode: 'cpu', encoder: null, name: null, why: 'none' });
}
// the environment of an export: COULISSES_GPU=<mode>
// a hardware encoder takes a bitrate, not a crf: 50 Mbit/s for 4K (measured above, better than x264 crf 17), 20 for 1080p
export const gpuBitrate = (width, height) => (Math.max(width, height) >= 2500 ? '50M' : Math.max(width, height) >= 1700 ? '20M' : '12M');
// Remotion's renderMedia options for the GPU (or {} for the CPU: the caller's own crf)
export function remotionGpu(width, height) {
  const g = gpuEncoder();
  return g.mode === 'cpu' ? null : { hardwareAcceleration: 'required', videoBitrate: gpuBitrate(width, height) };
}
