// « Exporter » a HyperFrames project from the studio (lib/export.mjs starts this detached, as it starts a Remotion run's
// export script): « hyperframes render » of the user's own CLI, its progress (« @hf-progress {"code","pct"} ») told in the
// export protocol of Coulisses (COULISSES PROGRES <pct> <step>, COULISSES FIN "<file>"), a .tmp.mp4 first, renamed once
// whole — so the studio never takes a half-written file for the new export.
// usage: node lib/hf-render-run.mjs <cli> <project folder> <export folder> <name> [draft|looks|delivery]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { hfEnv } from './hyperframes.mjs';

const [cli, dir, outDir, name = 'video', quality = 'looks'] = process.argv.slice(2);
if (!cli || !dir || !outDir) { console.error('usage: hf-render-run.mjs <cli> <project> <export folder> <name> [draft|looks|delivery]'); process.exit(2); }
const d = new Date(), z = (n) => String(n).padStart(2, '0');
const fin = path.join(outDir, `${name}${quality === 'draft' ? '-brouillon' : ''}-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.mp4`);
const tmp = fin.replace(/\.mp4$/, '.tmp.mp4');
fs.mkdirSync(outDir, { recursive: true });
let last = -1;
const say = (pct, step) => { const p = Math.floor(pct); if (p !== last) { last = p; console.log(`COULISSES PROGRES ${p} ${step}`); } };
say(0, 'HyperFrames');
// the GPU encoder when Coulisses found one (lib/gpu.mjs: COULISSES_GPU); a render that fails with it is made again on the CPU
const GPU = !!process.env.COULISSES_GPU && process.env.COULISSES_GPU !== 'cpu';
const render = (gpu) => spawn(process.execPath, [cli, 'render', '.', '-o', tmp, '--quality', quality, ...(gpu ? ['--gpu'] : [])], { cwd: dir, env: hfEnv(), windowsHide: true });
let c = render(GPU), onGpu = GPU;
console.log(GPU ? 'encodage : GPU (hyperframes render --gpu)' : 'encodage : processeur');
let buf = '';
const take = (chunk) => {
  buf += String(chunk);
  const lines = buf.split(/\r?\n|\r/); buf = lines.pop();
  for (const l of lines) {
    const m = /@hf-progress\s+(\{.*\})/.exec(l);
    if (m) { try { const j = JSON.parse(m[1]); if (Number.isFinite(+j.pct)) say(Math.min(99, +j.pct), j.code ?? 'rendu'); } catch { /* not ours */ } continue; }
    const s = l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim();
    if (s && !/^\[INFO\]|^\[initSession|█|░/.test(s)) console.log(s.slice(0, 300));   // the CLI's own words, for the log
  }
};
const wire = () => { c.stdout.on('data', take); c.stderr.on('data', take); c.on('error', (e) => { console.error(e.message); process.exit(1); }); c.on('close', done); };
wire();
async function done(code) {
  if ((code !== 0 || !fs.existsSync(tmp)) && onGpu) {   // the GPU failed: the same render on the CPU
    console.log(`hyperframes render --gpu : code ${code}, de nouveau sur le processeur`);
    try { fs.rmSync(tmp, { force: true }); } catch { /* */ }
    onGpu = false; c = render(false); wire(); return;
  }
  if (code !== 0 || !fs.existsSync(tmp)) { console.error(`hyperframes render: code ${code}`); try { fs.rmSync(tmp, { force: true }); } catch { /* */ } process.exit(code || 1); }
  if (fs.existsSync(fin)) { console.log(`COULISSES REMPLACE "${fin}"`); await new Promise((r) => setTimeout(r, 2500)); }
  for (let i = 0; ; i++) { try { fs.renameSync(tmp, fin); break; } catch (e) { if (i >= 60) throw e; await new Promise((r) => setTimeout(r, 1000)); } }
  say(100, 'fini');
  console.log(`COULISSES FIN "${fin}"`);
}
