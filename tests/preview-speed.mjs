// The live preview plays an episode at its pace (user report 18/10/2026: « la lecture remotion sur cet épisode long est
// lente et laggy » — E11, 22 min: 18,6 images/s, the page's thread busy all the time), on the sandbox's E03 in « Code
// actuel » (nothing real is touched):
//   - React in production mode in the episode's preview (lib/player-build.mjs);
//   - its sound sequences far from the frame shown not mounted (player/sequence-window.tsx): a few of them in React's tree
//     at a time, not every line and every sound of the episode;
//   - playing 6 s: 30 images/s, a steady pace, the page's thread not saturated; the timeline drawn once per frame shown.
// usage: node tests/preview-speed.mjs
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, requireSandbox } from './cdp.mjs';

process.env.COULISSES_LANG = 'fr';
const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
let st = null, p = null;
try {
  st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), 'E03', '--episodes', path.join(STUDIO, 'sandbox', '07_Episodes'), '--no-open', '--port', '4186'], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; st.stdout.on('data', (d) => { out += d; });
  for (let i = 0; i < 200 && !/Ouvre : http/.test(out); i++) await sleep(250);
  const U = /Ouvre : (http:\/\/127\.0\.0\.1:[0-9]+)/.exec(out)?.[1];
  if (!U || new URL(U).port !== '4186') throw new Error('Le port demandé pour le test n’est pas disponible.');
  await requireSandbox(U, path.join(STUDIO, 'sandbox'));
  p = await launch({ port: 9384 });
  await p.size(1600, 1000);
  await p.goto(U + '/#f=6000');
  await p.until(`window.__studio && document.querySelector('#v').readyState >= 2`, 90000);
  await p.eval(`document.querySelector('#srcCode').click(); return 1`);
  await p.until(`window.__studio.state().mode === 'code' && window.__preview`, 120000);
  await p.eval(`await window.__preview.whenReady(); return 1`); await sleep(2500);
  // the preview's React tree: its sequences mounted, against the episode's sounds
  // (asked again until the preview's React tree is there: the frame may still be mounting it)
  let tree = null;
  for (let i = 0; i < 30 && !tree; i++) { if (i) await sleep(500); tree = await p.frameEval('player.html', `const el = document.getElementById('root'), k = el && Object.keys(el).find((x) => x.startsWith('__reactContainer'));
    if (!k) return null;
    let seq = 0, win = 0; const st = [el[k].current ?? el[k]]; while (st.length) { const f = st.pop(); const t = f.type, n = typeof t === 'function' ? t.displayName || t.name : t?.render?.displayName || t?.render?.name || '';
      if (n === 'RegularSequenceRefForwardingFunction') seq++; if (n === 'WindowedSequence') win++; if (f.child) st.push(f.child); if (f.sibling) st.push(f.sibling); }
    const meta = await (await fetch('/api/meta')).json(), S = meta.snapshot ?? {};
    return { seq, win, sounds: (S.says?.length ?? 0) + (S.sfx?.length ?? 0) + (S.music?.length ?? 0) }`).catch(() => null); }
  tree ??= { seq: 0, win: 0, sounds: 0 };
  check(tree.win >= 100 && tree.seq < 80 && tree.seq < tree.win / 4, `the sound sequences far from the frame not mounted: ${tree.seq} mounted, ${tree.win} windowed (${tree.sounds} sounds in the episode)`);
  const src = await (await fetch(U + '/player.js')).text().catch(() => '');
  check(/react-dom-client.production.js/.test(src) && !/react-dom-client.development.js/.test(src), 'the preview built with React in production mode');
  // playing 6 s
  await p.send('Profiler.enable'); await p.send('Profiler.setSamplingInterval', { interval: 500 });
  const own = !!(await p.frameSend('player.html', 'Profiler.enable'));   // the preview in a process of its own (page/studio/00-remote.js)
  if (own) await p.frameSend('player.html', 'Profiler.setSamplingInterval', { interval: 500 });
  await p.eval(`window.__fr = []; window.__draws = 0; const sp = window.__preview;
    sp.on((e) => { if (e.type === 'frameupdate') window.__fr.push([performance.now(), e.frame]); });
    const cv = document.querySelector('#tl'), g = cv.getContext('2d'), clr = g.clearRect.bind(g); g.clearRect = (...a) => { window.__draws++; return clr(...a); };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); return 1`);
  await p.send('Profiler.start'); if (own) await p.frameSend('player.html', 'Profiler.start'); await sleep(6000);
  const { profile } = await p.send('Profiler.stop'), framePro = own ? (await p.frameSend('player.html', 'Profiler.stop'))?.profile : null;
  const r = await p.eval(`const sp = window.__preview; sp.pause(); const f = window.__fr;
    const span = (f.at(-1)[0] - f[0][0]) / 1000, frames = f.at(-1)[1] - f[0][1], gaps = f.slice(1).map((x, i) => x[0] - f[i][0]).sort((a, b) => a - b);
    return { fps: +(frames / span).toFixed(1), p95: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1), shown: f.length, draws: window.__draws }`);
  const busyOf = (pr) => { const nodes = new Map(pr.nodes.map((n) => [n.id, n])); let busy = 0, idle = 0;
    pr.samples.forEach((id, i) => { const t = pr.timeDeltas[i] ?? 0; if (nodes.get(id).callFrame.functionName === '(idle)') idle += t; else busy += t; });
    return Math.round((100 * busy) / (busy + idle)); };
  const busyPct = busyOf(profile), frameBusy = framePro ? busyOf(framePro) : null;
  check(r.fps >= 28 && r.p95 < 60, `playing: ${r.fps} images/s, 95 % of them within ${r.p95} ms of the one before`);
  check(own, 'the preview runs in a process of its own (another site: localhost)');
  check(busyPct < 35, `the page's thread free while the preview plays (${busyPct} % busy; the preview's own thread ${frameBusy} %)`);
  check(frameBusy !== null && frameBusy < 85, `the preview's thread not saturated (${frameBusy} % busy while playing)`);
  check(r.draws <= r.shown * 1.3 + 10, `the timeline drawn once per frame shown (${r.draws} draws for ${r.shown} frames)`);
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally {
  try { await p?.close(); } catch { /* */ }
  if (st) try { execFileSync('taskkill', ['/PID', String(st.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ }
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
