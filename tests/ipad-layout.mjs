// The studio as an iPad shows it (user request 18/10/2026: Coulisses in the iPad's browser through Tailscale, lib/remote.mjs) (Chrome emulating an iPad Air: 1180×820, touch, Safari's user agent), on the sandbox's
// E03: the layout (landscape and portrait, screenshots in .cache\shots), a stroke drawn with a finger on the picture, its note.
// usage: node tests/ipad-layout.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const STUDIO = 'C:/Users/owner/Documents/ChatGPT/Dev/remotion-studio';
process.env.COULISSES_LANG = 'fr';
const { launch } = await import(`file:///${STUDIO}/tests/cdp.mjs`);
const { freePort } = await import(`file:///${STUDIO}/tests/where.mjs`);
const { removeTestNotes } = await import(`file:///${STUDIO}/tests/sandbox-clean.mjs`);
const SHOTS = path.join(STUDIO, '.cache', 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const port = await freePort(4194);
const st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), 'E03', '--episodes', path.join(STUDIO, 'sandbox', '07_Episodes'), '--no-open', '--port', String(port)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
for (let i = 0; i < 200 && !/Ouvre : http/.test(out); i++) await sleep(150);
const TEXT = 'Essai iPad : ce trait au doigt';
const p = await launch({ port: 9390 });
try {
  await p.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPad' });
  await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const size = (w, h) => p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await size(1180, 820);
  await p.goto(`http://127.0.0.1:${port}/#f=3000`);
  await p.until(`window.__studio && document.querySelector('#v').readyState >= 2`, 90000); await sleep(1500);
  await p.shot(path.join(SHOTS, 'ipad-paysage.png'));
  const lay = await p.eval(`const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    return { media: r('#media'), tl: r('#tl'), rail: r('#rail') ?? r('.rail'), menubar: r('#menubar'), scrollW: document.documentElement.scrollWidth, w: innerWidth }`);
  check(lay.media && lay.media[2] > 500 && lay.tl && lay.tl[2] > 400 && lay.scrollW <= lay.w + 1, `landscape 1180×820: the picture ${lay.media?.join('×')}, the timeline ${lay.tl?.join('×')}, no sideways scroll`);
  // the drawing tool by a tap, then a stroke with a finger on the picture
  const tap = async (x, y) => { await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const b = await p.eval(`const e = document.querySelector('[data-tool="draw"]'); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`);
  await tap(b[0], b[1]); await sleep(300);
  check(await p.eval(`return document.querySelector('[data-tool="draw"]').classList.contains('on')`), 'a tap on the pen: the drawing tool');
  const m = lay.media, cx = m[0] + m[2] * 0.45, cy = m[1] + m[3] * 0.45;
  await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
  for (let i = 1; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + Math.cos(a) * 60, y: cy + Math.sin(a) * 40 }] }); await sleep(16); }
  await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.until(`document.querySelector('#pop').style.display === 'block'`, 5000).catch(() => {});
  check(await p.eval(`return document.querySelector('#pop').style.display === 'block'`), 'a stroke with a finger: the box « qu\'est-ce qui doit changer ? »');
  await p.type(TEXT); await p.key('Enter', 'Enter'); await sleep(1500);
  const notes = (await (await fetch(`http://127.0.0.1:${port}/api/notes`)).json()).notes;
  const n = notes.find((x) => x.text === TEXT);
  check(n?.mark?.kind === 'circle' && n.mark.strokes?.[0]?.length >= 4, `its note, with the stroke drawn (${n?.mark?.strokes?.[0]?.length ?? 0} points)`);
  await p.shot(path.join(SHOTS, 'ipad-trait.png'));
  await size(820, 1180); await sleep(1200);
  await p.shot(path.join(SHOTS, 'ipad-portrait.png'));
  const lay2 = await p.eval(`const b = document.querySelector('#media').getBoundingClientRect(); return { media: [Math.round(b.width), Math.round(b.height)], scrollW: document.documentElement.scrollWidth, w: innerWidth }`);
  check(lay2.media[0] > 600 && lay2.scrollW <= lay2.w + 1, `portrait 820×1180: the picture ${lay2.media.join('×')}, no sideways scroll`);
  console.log('  erreurs de la page :', JSON.stringify(p.logs.filter((l) => /error|exception/i.test(l) && !/X4000|WebGL/.test(l)).slice(0, 5)));
} catch (e) { ko++; console.log('  ✗ ERREUR', e.message); } finally {
  await removeTestNotes(port, [TEXT]).catch(() => {});
  await p.close();
  try { execFileSync('taskkill', ['/PID', String(st.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ }
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
