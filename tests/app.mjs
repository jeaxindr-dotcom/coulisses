// Test of the Windows app (« Brambleshire Studio.exe » of the Dev workshop: its sandbox episodes): the window opens on
// the home screen, lists the episodes, opens the studio of E03, the logo goes back to the episodes; when the window
// is closed, the launcher stops the home screen and the studio. The window is the real one, made invisible
// (BRAMBLESHIRE_STUDIO_TEST_PORT = headless + DevTools port).   usage: node tests/app.mjs
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CACHE } from '../lib/place.mjs';

process.env.COULISSES_LANG = 'fr';   // the window, the home screen and the studio in French (lib/i18n.mjs)
const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXE = path.join(STUDIO, 'Coulisses.exe');
const DT = 9361;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));   // COULISSES_TEST_SLOW=2: a slower PC
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const procs = (needle) => execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${needle}*' -and $_.Name -ne 'powershell.exe' -and $_.Name -ne 'cmd.exe' } | Select-Object -ExpandProperty ProcessId"`, { encoding: 'utf8' }).split(/\s+/).filter(Boolean);
// only THIS workshop's home screen and studios: never those of the installed app, which may be open meanwhile
// (the launcher quotes the script: « …\hub-server.mjs" --lock … »; the home screen starts « …\studio-server.mjs E03 --no-open --hub … »)
const HUB_PROC = `${STUDIO}\\hub-server.mjs*--lock`, STUDIO_PROC = `${STUDIO}\\studio-server.mjs*--hub http://127.0.0.1:41`;
const settle = async (ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms && (procs(HUB_PROC).length || procs(STUDIO_PROC).length)) await sleep(500); };

const launcher = spawn(EXE, [], { env: { ...process.env, BRAMBLESHIRE_STUDIO_TEST_PORT: String(DT) }, detached: false, stdio: 'ignore' });
const launcherExit = new Promise((r) => launcher.on('exit', r));
let ws, id = 0; const wait = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
try {
  // the window's DevTools
  let targets = [];
  for (let i = 0; i < 80 && !targets.some((t) => t.type === 'page' && /127\.0\.0\.1:41\d\d/.test(t.url)); i++) { await sleep(250); try { targets = await (await fetch(`http://127.0.0.1:${DT}/json/list`)).json(); } catch { /* not yet */ } }
  const page = targets.find((t) => t.type === 'page' && /127\.0\.0\.1:41\d\d/.test(t.url));
  check(!!page, `the app window opens on the home screen (${page?.url})`);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { const { res, rej } = wait.get(d.id); wait.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } });
  await send('Runtime.enable'); await send('Page.enable');
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true })).result.value;
  const until = async (expr, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(`return !!(${expr})`)) return true; } catch { /* navigating */ } await sleep(300); } return false; };
  await until(`document.querySelectorAll('.card').length > 0`);
  const cards = await ev(`return [...document.querySelectorAll('.card .title')].map((e) => e.textContent)`);
  check(cards.includes('The Secret Garden'), `episodes listed: ${cards.join(', ')}`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  const shot = async (f) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.join(CACHE, 'shots'), { recursive: true }); fs.writeFileSync(path.join(CACHE, 'shots', f), Buffer.from(data, 'base64')); };
  await sleep(1500); await shot('app-1-home.png');
  // open E03
  await ev(`[...document.querySelectorAll('.card')].find((c) => c.querySelector('.title').textContent === 'The Secret Garden').click(); return 1`);
  const inStudio = await until(`location.port !== '' && document.querySelector('#v') && document.querySelector('#v').readyState >= 2`, 90000);
  check(inStudio, `the studio of E03 opens in the same window (${await ev('return location.href')})`);
  await sleep(2000); await shot('app-2-studio.png');
  check((await ev(`return document.querySelector('#logo').getAttribute('href') || ''`)).startsWith('http://127.0.0.1:41'), 'the logo leads back to the episodes');
  check(procs(`${STUDIO}\\studio-server.mjs E03 --no-open --hub`).length >= 1, 'a studio server runs for E03, started by the home screen');
  // close the window (as the user would): the launcher stops everything
  const bws = new WebSocket((await (await fetch(`http://127.0.0.1:${DT}/json/version`)).json()).webSocketDebuggerUrl);
  await new Promise((r) => bws.addEventListener('open', r, { once: true }));
  bws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  const code = await Promise.race([launcherExit, sleep(20000).then(() => 'timeout')]);
  check(code !== 'timeout', `the launcher ends when the window is closed (${code})`);
  await settle();
  check(procs(HUB_PROC).length === 0 && procs(STUDIO_PROC).length === 0, 'home screen and studio stopped with it');
} finally {
  try { ws?.close(); } catch { /* */ }
  for (const pid of [...procs(HUB_PROC), ...procs(STUDIO_PROC)]) try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ }
  console.log(`\n${ok} ok, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
}
