// Minimal Chrome DevTools Protocol driver (no dependency: Node's built-in WebSocket) for the studio's end-to-end test.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The suites check Coulisses' French texts (lib/i18n.mjs): a studio started by hand for them must speak French
// (COULISSES_LANG=fr). Exits with a clear message otherwise.
export async function requireFrench(base) {
  let m = null; try { m = await (await fetch(new URL('api/meta', base))).json(); } catch { return; }   // not started: the test says so
  if (m?.lang && m.lang !== 'fr') { console.error(`Le studio ${base} parle « ${m.lang} » : le relancer avec COULISSES_LANG=fr (les tests vérifient les textes français).`); process.exit(2); }
}

export async function launch({ port = 9333, headless = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-cdp-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, ...(headless ? ['--headless=new'] : []),
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--window-size=1600,1000', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let ver;
  for (let i = 0; i < 50 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await new Promise((r) => setTimeout(r, 200)); } }
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const wait = new Map(), handlers = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { const { res, rej } = wait.get(d.id); wait.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else for (const h of handlers) h(d);
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  const logs = [];
  handlers.push((d) => {
    if (d.sessionId !== sessionId) return;
    if (d.method === 'Runtime.consoleAPICalled') logs.push(`[${d.params.type}] ${d.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    if (d.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text}`);
  });
  await s('Runtime.enable'); await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  const page = {
    logs,
    goto: async (url) => { await s('Page.navigate', { url }); await new Promise((r) => setTimeout(r, 1500)); },
    eval: async (expr) => {
      const r = await s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    until: async (expr, ms = 30000) => { const t0 = Date.now(); for (;;) { if (await page.eval(`return !!(${expr})`)) return true; if (Date.now() - t0 > ms) throw new Error(`timeout: ${expr}`); await new Promise((r) => setTimeout(r, 250)); } },
    shot: async (file) => { const { data } = await s('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(data, 'base64')); return file; },
    mouse: (type, x, y) => s('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }),
    // modifiers: Alt 1, Ctrl 2, Meta 4, Shift 8 (a real key press, as the user's: it goes to the focused field first)
    key: (key, code, text, modifiers = 0) => s('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, modifiers, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : ({ Enter: 13, Escape: 27 }[key] ?? 0) }).then(() => s('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers })),
    type: (text) => s('Input.insertText', { text }),
    wheel: (x, y, deltaY, modifiers = 0) => s('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers }),
    close: async () => { try { ws.close(); } catch { /* */ } chrome.kill(); },
  };
  return page;
}
