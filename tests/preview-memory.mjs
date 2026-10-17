// The live preview's versions do not pile up in memory (user bug 17/10/2026, E11: the window at 7,8 Go after an evening of
// edits by the agent — every version of the preview kept alive through the page's own references to it; the studio slower
// and slower, « Accueil » long to come), on the sample project of tests/coulisses-fixture.mjs (nothing real is touched):
// five edits of its code, the preview swapped each time; after each, the page holds two documents (itself and the preview
// shown), its DOM and its JS heap stay as they were.
// usage: node tests/preview-memory.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'preview-memory-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
Object.assign(process.env, { COULISSES_LANG: 'fr', STUDIO_PROJECTS: path.join(SCR, 'projets.json'), COULISSES_SETTINGS: path.join(SCR, 'settings.json'), COULISSES_MEDIAS: path.join(SCR, 'medias'), COULISSES_HISTORY_DIR: path.join(SCR, 'historique') });
const { makeFixture, PROJET, RUN } = await import('./coulisses-fixture.mjs');
const { importProject } = await import('../lib/projects.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
let st = null, p = null;
try {
  makeFixture(); const imp = importProject(RUN);
  st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', imp.revue, '--no-open', '--port', '4191'], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; st.stdout.on('data', (d) => { out += d; });
  for (let i = 0; i < 200 && !/Ouvre : http/.test(out); i++) await sleep(250);
  p = await launch({ port: 9373 });
  const counters = async () => {
    await p.send('HeapProfiler.collectGarbage'); await sleep(300);
    const d = await p.send('Memory.getDOMCounters'), m = (await p.send('Performance.getMetrics')).metrics;
    return { docs: d.documents, nodes: d.nodes, heapMB: Math.round((m.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0) / 1e6) };
  };
  await p.goto('http://127.0.0.1:4191/');
  await p.until(`document.querySelector('#code')?.contentWindow?.StudioPlayer?.durationInFrames`, 60000); await sleep(1500);
  await p.send('Performance.enable'); await p.send('HeapProfiler.enable');
  const c0 = await counters(), seen = [];
  const F = path.join(PROJET, 'src', 'runs', 'essai.ts'), orig = fs.readFileSync(F, 'utf8');
  for (let k = 1; k <= 5; k++) {
    const v0 = await p.eval(`return document.querySelector('#codeStatus').textContent`);
    fs.writeFileSync(F, orig + `\n// version ${k}\n`);
    await p.until(`/^Code v[0-9]+/.test(document.querySelector('#codeStatus').textContent) && document.querySelector('#codeStatus').textContent !== ${JSON.stringify(v0)}`, 60000).catch(() => {});
    await p.until(`!document.querySelector('iframe.code-next')`, 30000).catch(() => {}); await sleep(1200);   // (no version being prepared at the time)
    seen.push({ v: await p.eval(`return document.querySelector('#codeStatus').textContent.split(' · ')[0]`), ...(await counters()) });
  }
  const last = seen.at(-1);
  check(new Set(seen.map((s) => s.v)).size === 5, `five versions of the preview, swapped one after the other (${seen.map((s) => s.v).join(', ')})`);
  check(seen.every((s) => s.docs === c0.docs), `the documents of the page: ${c0.docs} at the start, ${seen.map((s) => s.docs).join(' · ')} after each version`);
  check(last.nodes < c0.nodes * 1.2 && last.heapMB < c0.heapMB * 1.5 + 4, `its DOM (${c0.nodes} → ${last.nodes} nodes) and its JS heap (${c0.heapMB} → ${last.heapMB} Mo) do not grow`);
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally {
  try { await p?.close(); } catch { /* */ }
  if (st) try { execFileSync('taskkill', ['/PID', String(st.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ }
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
