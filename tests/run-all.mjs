// Every test of Coulisses, in one command (code review, 08/10/2026: some suites needed a studio started by hand, and
// nothing ran them all). It starts what they need itself — a studio on the sandbox E03 (port 4174) for e2e, staging and
// grade, e2e-agent; a studio on the render test's own copy (.cache\sandbox-test, port 4180) for render, then puts that copy
// back — with the tests' own settings and media library (never the user's), runs the suites one after another, and
// prints a summary. A suite whose resource is not on this PC skips itself (tests/where.mjs).
// usage: node tests/run-all.mjs [--only a,b] [--skip a,b] [--quick]   (--quick: without the slowest: app, render, staging3d-run)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? String(process.argv[i + 1] ?? '').split(',').filter(Boolean) : null; };
const only = arg('--only'), skip = new Set(arg('--skip') ?? []), quick = process.argv.includes('--quick');
const SCR = path.join(STUDIO, '.cache', 'run-all'); fs.mkdirSync(SCR, { recursive: true });
// the servers this runner starts: the tests' own settings and media, the French texts the suites check
const ENV = { ...process.env, COULISSES_LANG: 'fr', COULISSES_SETTINGS: path.join(SCR, 'settings.json'), COULISSES_MEDIAS: path.join(SCR, 'medias') };
fs.writeFileSync(ENV.COULISSES_SETTINGS, JSON.stringify({ mediasAutoSort: false }));
// the sandbox studio's port: 4174, or COULISSES_TEST_SANDBOX_PORT when the workshop's own studio is open on 4174
const BOX_PORT = +(process.env.COULISSES_TEST_SANDBOX_PORT ?? 4174) || 4174;
const SANDBOX = path.join(STUDIO, 'sandbox', '07_Episodes'), RENDER_BOX = path.join(STUDIO, '.cache', 'sandbox-test', '07_Episodes');
// [suite, what it needs]: self = starts its own servers; sandbox = a studio on 4174; render = a studio on 4180 on its copy
const SUITES = [
  ['typecheck', 'self'], ['guard', 'self'], ['coulisses', 'self'], ['coulisses-video', 'self'], ['coulisses-export', 'self'], ['projects', 'self'],
  ['hub-folders', 'self'], ['new-project', 'self'], ['medias', 'self'], ['shortcuts', 'self'], ['staging2d', 'self'], ['menu', 'self'], ['i18n', 'self'],
  ['hyperframes', 'self'], ['e2e', 'sandbox'], ['staging', 'sandbox'], ['grade', 'sandbox'], ['e2e-agent', 'sandbox'], ['staging3d-run', 'self'], ['shot-render', 'self'], ['app', 'self'], ['render', 'render'],
].filter(([n]) => (only ? only.includes(n) : !skip.has(n) && !(quick && ['app', 'render', 'staging3d-run'].includes(n))));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));   // COULISSES_TEST_SLOW=2: a slower PC
const kill = (c) => { if (c?.pid) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
async function studioOn(episodes, port, log) {
  const c = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), 'E03', '--no-open', '--episodes', episodes, '--port', String(port)], { cwd: STUDIO, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 240 && !/Ouvre : http/.test(out); i++) await sleep(250);
  fs.writeFileSync(path.join(SCR, log), out);
  if (!/Ouvre : http/.test(out)) { kill(c); throw new Error(`le studio du bac à sable ne démarre pas (${path.join(SCR, log)})`); }
  return c;
}
function run(name, env) {
  return new Promise((resolve) => {
    const t0 = Date.now(), c = spawn(process.execPath, [path.join(STUDIO, 'tests', `${name}.mjs`)], { cwd: STUDIO, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { out += '\n(arrêté : plus de 15 min)'; kill(c); }, 15 * 60000);
    c.on('exit', (code) => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(SCR, `${name}.log`), out);
      const m = /(\d+) ok, (\d+) (?:ko|échec)/.exec(out.split(/\r?\n/).reverse().find((l) => /\d+ ok, \d+ (ko|échec)/.test(l)) ?? '');
      const okN = m ? +m[1] : 0, ko = m ? +m[2] : 1, skipped = /\(sauté/.test(out) && okN === 0 && ko === 0;
      resolve({ name, ok: okN, ko: code && !ko ? 1 : ko, skipped, s: Math.round((Date.now() - t0) / 1000), failed: out.split(/\r?\n/).filter((l) => /✗|ERREUR|erreur :/.test(l)).slice(0, 6) });
    });
  });
}

const results = [];
let box = null, rbox = null;
try {
  for (const [name, need] of SUITES) {
    let env = {};
    // the sandbox studio stops once its suites are done: one studio per project — the app's own studio of E03 (tests/app.mjs)
    // would otherwise hand over to it (studio-server.mjs, revue/studio.lock.json)
    if (need !== 'sandbox' && box) { kill(box); box = null; await sleep(1000); }
    if (need === 'sandbox') {
      if (!fs.existsSync(path.join(SANDBOX, 'E03 - The Secret Garden'))) { results.push({ name, ok: 0, ko: 0, skipped: true, s: 0, failed: [] }); continue; }
      box ??= await studioOn(SANDBOX, BOX_PORT, 'sandbox-server.log');
      env = { STUDIO_PORT: String(BOX_PORT) };
    }
    if (need === 'render') {
      if (!fs.existsSync(path.join(RENDER_BOX, 'E03 - The Secret Garden'))) { results.push({ name, ok: 0, ko: 0, skipped: true, s: 0, failed: [] }); continue; }
      rbox = await studioOn(RENDER_BOX, 4180, 'render-server.log');
      env = { STUDIO_PORT: '4180', STUDIO_SANDBOX: RENDER_BOX };
    }
    process.stdout.write(`${name.padEnd(16)} `);
    const r = await run(name, env);
    if (need === 'render') {   // the render test's copy put back once its studio is stopped (nothing may hold its files)
      kill(rbox); rbox = null; await sleep(1500);
      try { execFileSync(process.execPath, [path.join(STUDIO, 'tests', 'render.mjs'), '--restore'], { cwd: STUDIO, env: { ...process.env, STUDIO_SANDBOX: RENDER_BOX }, stdio: 'ignore' }); } catch { r.failed.push('render --restore a échoué'); }
    }
    results.push(r);
    console.log(r.skipped ? 'sauté' : `${r.ko ? '✗' : '✓'} ${r.ok} ok, ${r.ko} ko  (${r.s} s)`);
    for (const f of r.failed) console.log(`                   ${f.trim().slice(0, 150)}`);
  }
} catch (e) {
  console.log(`\n✗ ${e.message}`);
  results.push({ name: 'run-all', ok: 0, ko: 1, skipped: false, s: 0, failed: [e.message] });
} finally {
  kill(box); kill(rbox);
}
const tot = results.reduce((a, r) => ({ ok: a.ok + r.ok, ko: a.ko + r.ko, s: a.s + r.s }), { ok: 0, ko: 0, s: 0 });
const bad = results.filter((r) => r.ko), skipped = results.filter((r) => r.skipped);
console.log(`\n${results.length - skipped.length} suite(s), ${tot.ok} ok, ${tot.ko} ko, ${Math.round(tot.s / 60)} min${skipped.length ? ` · sautée(s) : ${skipped.map((r) => r.name).join(', ')}` : ''}${bad.length ? ` · en échec : ${bad.map((r) => r.name).join(', ')} (journaux : ${SCR})` : ''}`);
process.exit(bad.length ? 1 : 0);
