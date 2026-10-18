// Coulisses from the iPad through Tailscale (lib/remote.mjs, lib/guard.mjs; user request 18/10/2026), on a test project
// and a simulated tailnet (COULISSES_TEST_TAILNET: no Tailscale needed, COULISSES_TEST_NO_SERVE: its serve config never
// touched):
//   1. a request that came through Tailscale's serve (the PC's tailnet name, its user's login) passes; another user, no
//      login, another name, another site's page: refused; the setting off: refused;
//   2. the addresses given out from there are the tailnet's (https://<name>:<port>): a studio opened, /go/, the hub's
//      address in a studio's meta; on the PC they stay 127.0.0.1;
//   3. what would open a window on the PC (a file picker) is not done from there; the access is opened and closed from
//      the PC only.
// usage: node tests/browser-access.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freePort } from './where.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'browser-access-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(path.join(SCR, 'Clip'), { recursive: true });
const NAME = 'test-pc.tail0000.ts.net', LOGIN = 'me@example.com';
Object.assign(process.env, {
  COULISSES_LANG: 'fr', STUDIO_PROJECTS: path.join(SCR, 'projets.json'), COULISSES_SETTINGS: path.join(SCR, 'settings.json'),
  COULISSES_MEDIAS: path.join(SCR, 'medias'), COULISSES_TEST_TAILNET: `${NAME},${LOGIN}`, COULISSES_TEST_NO_SERVE: '1',
});
fs.writeFileSync(process.env.COULISSES_SETTINGS, JSON.stringify({ browserAccess: true, mediasAutoSort: false }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const kill = (c) => { if (c) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
// a raw request: any Host and headers, as tailscaled sends them (from the loopback)
const ask = (port, p, headers = {}, method = 'GET', body = null) => new Promise((resolve) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host: `127.0.0.1:${port}`, connection: 'close', ...(body ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
    let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { /* not JSON */ } resolve({ code: res.statusCode, body: j, text: b, location: res.headers.location }); });
  });
  r.on('error', (e) => resolve({ code: 0, text: e.message })); r.end(body ? JSON.stringify(body) : undefined);
});

let hub = null;
try {
  const VID = path.join(SCR, 'Clip', 'Clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x305070:s=640x360:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', VID]);
  const hp = await freePort(4192);
  hub = spawn(process.execPath, [path.join(STUDIO, 'hub-server.mjs'), '--port', String(hp)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; hub.stdout.on('data', (d) => { out += d; }); hub.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 150 && !out.includes('HUB_READY'); i++) await sleep(100);
  const T = (port, more = {}) => ({ host: `${NAME}:${port}`, 'tailscale-user-login': LOGIN, 'x-forwarded-proto': 'https', ...more });

  // ---------- 1. who passes ----------
  console.log('qui passe');
  const a = await ask(hp, '/api/episodes', T(hp));
  check(a.code === 200 && a.body?.remote === true, `through Tailscale, this PC's user: in (${a.code})`);
  const refused = await Promise.all([
    ask(hp, '/api/episodes', T(hp, { 'tailscale-user-login': 'someone@else.com' })),
    ask(hp, '/api/episodes', { host: `${NAME}:${hp}` }),
    ask(hp, '/api/episodes', T(hp, { host: `other-pc.tail0000.ts.net:${hp}` })),
    ask(hp, '/api/episodes', T(hp, { origin: 'https://evil.example' })),
    ask(hp, '/api/episodes', T(hp, { 'sec-fetch-site': 'cross-site', referer: 'https://evil.example/' })),
  ]);
  check(refused.every((r) => r.code === 403), `another user, no login, another name, another site's page: refused (${refused.map((r) => r.code).join(' ')})`);
  const sib = await ask(hp, '/api/episodes', T(hp, { origin: `https://${NAME}:4173` }));
  check(sib.code === 200, 'a page of a studio (another port of the same name): in');

  // ---------- 2. the addresses ----------
  console.log('les adresses');
  const imp = await ask(hp, '/api/import', {}, 'POST', { path: VID });
  const id = imp.body?.project?.id;
  const op = await ask(hp, `/api/open?ep=${id}`, T(hp), 'POST', {});
  const sport = op.body?.url ? +new URL(op.body.url).port : 0;
  check(!!id && op.body?.ok && new RegExp(`^https://${NAME.replace(/\./g, '\\.')}:\\d+/$`).test(op.body.url ?? ''), `a studio opened from there: its address on the tailnet (${op.body?.url})`);
  const opPc = await ask(hp, `/api/open?ep=${id}`, {}, 'POST', {});
  check(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(opPc.body?.url ?? ''), `… and on the PC, as before (${opPc.body?.url})`);
  const go = await ask(hp, `/go/${id}`, T(hp));
  check(go.code === 302 && go.location === `https://${NAME}:${sport}/`, `/go/: to the studio by the tailnet (${go.location})`);
  const list = await ask(hp, '/api/episodes', T(hp));
  const card = list.body?.projects?.find((x) => x.id === id);
  check(card?.studio?.url === `https://${NAME}:${sport}/`, `the list: the open studio's address on the tailnet (${card?.studio?.url})`);
  const mt = await ask(sport, '/api/meta', T(sport)), mtPc = await ask(sport, '/api/meta');
  check(mt.code === 200 && mt.body?.hub === `https://${NAME}:${hp}/` && mt.body?.remote === true && mtPc.body?.hub === `http://127.0.0.1:${hp}/` && !mtPc.body?.remote,
    `a studio's way back to the home screen: by the tailnet from there (${mt.body?.hub}), 127.0.0.1 on the PC`);
  const pg = await ask(sport, '/', T(sport));
  check(pg.code === 200 && /studio\.js/.test(pg.text), 'the studio page itself, from there');

  // ---------- 3. from the PC only ----------
  console.log('depuis le PC seulement');
  const pick = await ask(hp, '/api/import/pick', T(hp), 'POST', { what: 'video' });
  check(pick.body?.ok === false && pick.body?.remote && /Coller un chemin/.test(pick.body?.why ?? ''), 'a file picker (it opens on the PC): not from there, said why');
  const fromIpad = await ask(hp, '/api/browser-access', T(hp), 'POST', { on: false });
  check(fromIpad.code === 403, 'the access cannot be closed (nor opened) from the iPad');
  const st = await ask(hp, '/api/browser-access');
  check(st.body?.on === true && st.body?.tailscale?.ok && st.body?.url === `https://${NAME}:${hp}/` && st.body?.here === false, `on the PC: its state and the address to open (${st.body?.url})`);
  const off = await ask(hp, '/api/browser-access', {}, 'POST', { on: false });
  await sleep(500);
  const after = await ask(hp, '/api/episodes', T(hp)), afterStudio = await ask(sport, '/api/meta', T(sport));
  const set = JSON.parse(fs.readFileSync(process.env.COULISSES_SETTINGS, 'utf8'));
  check(off.body?.ok && off.body?.on === false && after.code === 403 && afterStudio.code === 403 && set.browserAccess === false && set.mediasAutoSort === false,
    `closed from the PC: refused from there again, hub and studio (${after.code} ${afterStudio.code}), the other settings kept`);
  const pc = await ask(hp, '/api/episodes');
  check(pc.code === 200 && !pc.body?.remote, 'on the PC itself: always in');
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally { kill(hub); }
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
