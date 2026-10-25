// The top of the timeline never disappears (user report 25/10/2026: « le haut de la timeline disparaît parfois »): a
// block narrower than a pixel gave a negative corner radius, Chrome threw, the drawing stopped half way and its clip
// stayed on the canvas — the ruler and the notes band blank until the next resize (page/studio/08-timeline.js: rr,
// draw). On the sample project of tests/coulisses-fixture.mjs, a silent Chrome:
//   1. the ruler drawn (its pixels);
//   2. a drawing that fails half way (roundRect throwing once): the next one draws the ruler again;
//   3. from the widest view to the narrowest, the playhead at the clips' edges: never a negative radius asked.
// usage: node tests/timeline-draw.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { makeFixture, RUN } from './coulisses-fixture.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'timeline-draw');
const PORT = 4189, URL = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };

fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
fs.writeFileSync(path.join(SCR, 'settings.json'), JSON.stringify({ lang: 'fr' }));
makeFixture();
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json'); process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json'); process.env.COULISSES_LANG = 'fr';
const { importProject } = await import('../lib/projects.mjs');
const IMP = importProject(RUN);
const st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', IMP.revue, '--no-open', '--port', String(PORT)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
for (let i = 0; i < 160 && !/http:\/\/127/.test(out); i++) await sleep(250);
const p = await launch({ port: 9379 });
const ev = (e) => p.eval(e).catch((x) => ({ err: String(x.message ?? x) }));
const until = async (expr, ms = 60000) => { const t0 = Date.now(); for (;;) { if ((await ev(`return !!(${expr})`)) === true) return true; if (Date.now() - t0 > ms) return false; await sleep(250); } };
// the ink of the ruler: its pixels not blank (its ticks, its times), over the timeline's first 20 rows
const rulerInk = () => ev(`const c = document.querySelector('#tl'), d = window.devicePixelRatio || 1, g = c.getContext('2d');
  const im = g.getImageData(Math.round(160 * d), 0, c.width - Math.round(160 * d), Math.round(20 * d)).data; let n = 0;
  for (let i = 3; i < im.length; i += 4) if (im[i] > 40) n++; return n`);
const redraw = async () => { await ev(`document.querySelector('#bZoomIn').click(); return 1`); await sleep(250); await ev(`document.querySelector('#bZoomOut').click(); return 1`); await sleep(300); };
try {
  await p.goto(URL);
  check(await until(`window.__studio && __studio.state().mode === 'code' && __studio.state().lanes?.length >= 3`, 120000), 'the studio, its timeline drawn');
  await sleep(1500); await redraw();
  const ink0 = await rulerInk();
  check(ink0 > 200, `1. the ruler drawn (${ink0} pixels of ink)`);
  // ---------- 2. a drawing failing half way ----------
  await ev(`const P = CanvasRenderingContext2D.prototype, real = P.roundRect; window.__rrReal = real; let once = true;
    P.roundRect = function (...a) { if (once) { once = false; throw new RangeError('a negative radius (test)'); } return real.apply(this, a); }; return 1`);
  await redraw();
  await ev(`CanvasRenderingContext2D.prototype.roundRect = window.__rrReal; return 1`);
  await redraw();
  const ink1 = await rulerInk();
  check(ink1 > ink0 * 0.6, `2. a drawing that failed half way: the next one draws the ruler again (${ink1} pixels of ink)`);
  // ---------- 3. never a negative radius ----------
  await ev(`const P = CanvasRenderingContext2D.prototype, real = window.__rrReal; window.__neg = [];
    P.roundRect = function (x, y, w, h, r) { const rs = [].concat(r ?? 0); if (w < 0 || h < 0 || rs.some((v) => v < 0)) window.__neg.push([w, h, rs]); return real.call(this, x, y, w, h, r); }; return 1`);
  await ev(`document.querySelector('#bFit').click(); return 1`); await sleep(300);
  for (let i = 0; i < 14; i++) { await ev(`document.querySelector('#bZoomIn').click(); return 1`); await sleep(60); }
  for (const f of [0, 89, 90, 91, 209, 210, 299]) { await ev(`window.__preview.seek(${f}); return 1`); await sleep(250); }
  for (let i = 0; i < 20; i++) { await ev(`document.querySelector('#bZoomOut').click(); return 1`); await sleep(60); }
  const neg = await ev('return window.__neg');
  check(Array.isArray(neg) && neg.length === 0, `3. from the narrowest view to the widest: never a negative size or radius asked (${Array.isArray(neg) ? neg.length : JSON.stringify(neg)})`);
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally { await p.close(); st.kill(); }
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
