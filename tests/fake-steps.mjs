// The commands of tests/fake-render.mjs (see there). Only ever run on a sandbox copy.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [what, ...a] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = (f) => { const st = fs.statSync(f); return { name: path.basename(f), size: st.size, mtime: st.mtime.toISOString() }; };
const writeJson = (f, d) => { const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(d, null, 1)); fs.renameSync(t, f); };

if (what === 'check') {
  const [key, res] = a;
  await sleep(150);
  console.log(`${key}: looking…`);
  if (key === 'motion' && res !== 'fail') console.log('\nE03: 0 jump(s) (actors / props / camera / bubbles), 3 appear / vanish in view to judge');
  console.log(res === 'fail' ? '\n2 conflict(s), min gap 0.3' : 'PASS');
  process.exit(res === 'fail' ? 1 : 0);
}
if (what === 'render') {
  const N = +a[0], ms = +a[1];
  for (const pct of [6, 33, 74, 100]) { console.log(`Bundling ${pct}%`); await sleep(60); }
  for (const s of ['17 MB', '1.2 GB', '3 GB']) { console.log(`Copying public dir ${s}`); await sleep(60); }
  console.log('Getting composition');
  console.log('\x1b[90mComposition          E03-SecretGarden\x1b[39m');
  for (let i = 0; i <= N; i++) { process.stdout.write(`Rendered ${i}/${N}${i ? `, time remaining: ${Math.round(((N - i) * ms) / 1000)}s` : ''}\n`); await sleep(ms); }
  for (const e of [Math.round(N / 3), N]) { console.log(`Encoded ${e}/${N}`); await sleep(80); }
  console.log(`\x1b[34m+                    C:/fake/out/e03-raw.mp4\x1b[39m \x1b[90m5.2 MB\x1b[39m`);
}
if (what === 'finish') {
  const [REVUE, folder] = a, mp4 = path.join(path.dirname(REVUE), `${folder}.mp4`);
  if (!/sandbox/i.test(REVUE)) { console.error('fake-steps: refuses to run outside a sandbox'); process.exit(2); }
  console.log(`== 1. final mix -> ${mp4}`);
  await sleep(+(process.env.FAKE_HOLD_MS ?? 4500));   // as long as a real mix: the page has time to see the hold
  const tmp = mp4.replace(/\.mp4$/, '.new.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-map', '0', '-c', 'copy', '-metadata', `comment=fake render ${Date.now()} ${'x'.repeat(10 + (Date.now() % 97))}`, tmp], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
  fs.renameSync(tmp, mp4);   // a new file in place of the old link
  console.log('   duration 476.4 s, 14291 images');
  console.log('    I:         -16.0 LUFS');
  console.log('    Peak:       -1.6 dBFS');
  console.log('== 2. review tool: plan of this render, notes moved onto it');
  const T = path.join(REVUE, 'timeline.json'), video = stamp(mp4);
  let k = 1; while (fs.existsSync(path.join(REVUE, `timeline-v${k}.json`))) k++;
  fs.copyFileSync(T, path.join(REVUE, `timeline-v${k}.json`));
  const plan = JSON.parse(fs.readFileSync(T, 'utf8')); plan.video = video; writeJson(T, plan);
  const notes = JSON.parse(fs.readFileSync(path.join(REVUE, 'notes.json'), 'utf8')).notes ?? [];
  const RP = path.join(REVUE, 'replies.json'), rep = fs.existsSync(RP) ? JSON.parse(fs.readFileSync(RP, 'utf8')) : { notes: {} };
  rep.notes ??= {}; let moved = 0;
  for (const n of notes) {
    if (n.render?.size === video.size) continue;
    (rep.notes[n.id] ??= {}).remap = { frame: n.frame, end: n.end ?? null, render: video, from: { frame: n.frame, end: n.end ?? null, render: n.render ?? null } };
    moved++;
  }
  writeJson(RP, rep);
  console.log(`${moved} note(s) recalée(s) -> ${RP} (12 repères)`);
  console.log('== 3. YouTube chapters');
  console.log('   (no Excel yet: nothing to update)');
}
