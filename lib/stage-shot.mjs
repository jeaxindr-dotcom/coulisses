// The « after » image of a 2D staging (player/stage2d.ts): the live preview of the run, at one frame, with the offsets
// the user proposed, as a JPEG at the composition's size — what the agent must obtain. The 3D staging of the Theatre
// takes it from its WebGL canvas; an HTML composition cannot be drawn into an image from the page, so the server opens
// its own preview (player.html?f=…&stage=…) in a headless Chrome (the system's, as every render here) and photographs it.
// A small Chrome DevTools Protocol client, no dependency (Node's built-in WebSocket).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { t } from './i18n.mjs';
import { browsers } from './tools.mjs';

const CHROMES = browsers();   // lib/tools.mjs: settings.json « chrome », then Chrome, then Edge
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const b64url = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// url: the server's own player.html (…?f=<frame>&stage=<b64url>), w × h: the composition -> JPEG bytes
export async function stageShot(url, w, h, { timeoutMs = 45000 } = {}) {
  const exe = CHROMES.find((c) => fs.existsSync(c));
  if (!exe) throw new Error(t('srv.shot.noChrome'));
  const port = await freePort(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coulisses-shot-'));
  const chrome = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars', `--window-size=${w},${h}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let ws = null;
  try {
    let ver = null;
    for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(150); } }
    if (!ver) throw new Error(t('srv.shot.noAnswer'));
    ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
    let id = 0; const wait = new Map();
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { const { res, rej } = wait.get(d.id); wait.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } });
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s('Page.enable'); await s('Runtime.enable');
    await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await s('Page.navigate', { url });
    const ready = `!!window.__stageShotReady && [...document.images].every((i) => i.complete) && document.fonts.status === 'loaded'`;
    const t0 = Date.now();
    for (;;) {
      const r = await s('Runtime.evaluate', { expression: ready, returnByValue: true }).catch(() => null);
      if (r?.result?.value) break;
      if (Date.now() - t0 > timeoutMs) throw new Error(t('srv.shot.notReady'));
      await sleep(200);
    }
    await sleep(400);   // a video frame, a last layout
    const { data } = await s('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    return Buffer.from(data, 'base64');
  } finally {
    try { ws?.close(); } catch { /* closed */ }
    try { spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* gone */ }
    setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Chrome still holds a file */ } }, 1500);
  }
}
