// Les versions de l'aperçu ne s'accumulent pas après cinq changements VISUELS du projet d'essai.
// Un commentaire seul doit conserver la version et le document de l'iframe (déduplication du bundle).
// Les compteurs CDP du parent et ceux du processus de l'iframe sont relevés séparément :
// le tas JS/DOM du parent ne mesure ni la mémoire totale de Chrome ni la VRAM du Player.
// Utilisation : node tests/preview-memory.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, requireSandbox } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'preview-memory-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
Object.assign(process.env, { COULISSES_LANG: 'fr', STUDIO_PROJECTS: path.join(SCR, 'projets.json'), COULISSES_SETTINGS: path.join(SCR, 'settings.json'), COULISSES_MEDIAS: path.join(SCR, 'medias'), COULISSES_HISTORY_DIR: path.join(SCR, 'historique') });
const { makeFixture, PROJET, RUN } = await import('./coulisses-fixture.mjs');
const { importProject } = await import('../lib/projects.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
const until = async (test, label, ms = 30000) => {
  const start = Date.now();
  while (!(await test())) { if (Date.now() - start > ms) throw new Error(`Délai dépassé : ${label}`); await sleep(200); }
};
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
let st = null, p = null;
try {
  makeFixture(); const imp = importProject(RUN);
  st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', imp.revue, '--no-open', '--port', '4191'], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; st.stdout.on('data', (d) => { out += d; });
  for (let i = 0; i < 200 && !/Ouvre : http/.test(out); i++) await sleep(250);
  if (!/Ouvre : http/.test(out)) throw new Error('Le studio du test mémoire ne démarre pas');
  const base = /Ouvre : (http:\/\/127\.0\.0\.1:\d+)/.exec(out)?.[1];
  if (base !== 'http://127.0.0.1:4191') throw new Error(`Le port 4191 était occupé ; studio de test annoncé sur ${base ?? '?'}`);
  await requireSandbox(base, RUN);
  p = await launch({ port: 9373 });
  const compact = (d, m) => ({ docs: d.documents, nodes: d.nodes, heapMB: Math.round((m.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0) / 1e6) });
  const counters = async () => {
    await p.send('HeapProfiler.collectGarbage');
    await p.frameSend('player.html', 'HeapProfiler.enable');
    await p.frameSend('player.html', 'Performance.enable');
    await p.frameSend('player.html', 'HeapProfiler.collectGarbage'); await sleep(300);
    const d = await p.send('Memory.getDOMCounters'), m = (await p.send('Performance.getMetrics')).metrics;
    const fd = await p.frameSend('player.html', 'Memory.getDOMCounters'), fm = await p.frameSend('player.html', 'Performance.getMetrics');
    if (!fd || !fm) throw new Error('Le processus de l’iframe du Player est absent des compteurs CDP');
    const iframes = await p.eval(`return document.querySelectorAll('iframe#code, iframe.code-next').length`);
    return { parent: compact(d, m), iframe: compact(fd, fm.metrics), iframes };
  };
  await p.goto(base + '/');
  await p.until(`window.__preview?.durationInFrames`, 60000); await sleep(1500);
  await p.send('Performance.enable'); await p.send('HeapProfiler.enable');
  const c0 = await counters(), seen = [];
  const F = path.join(PROJET, 'src', 'runs', 'essai.ts'), orig = fs.readFileSync(F, 'utf8');
  const built = () => (out.match(/aperçu vivant .* compilé \(/g) ?? []).length;
  const codeStatus = async () => {
    const response = await fetch(base + '/api/status', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`État du studio indisponible : HTTP ${response.status}`);
    return (await response.json()).code;
  };
  let codeBeforeComment, codeAfterComment;
  await until(async () => { codeBeforeComment = await codeStatus(); return codeBeforeComment?.status === 'ready' && codeBeforeComment.version > 0; }, 'version initiale prête');
  const initialVersion = codeBeforeComment.version;
  await p.eval(`document.querySelector('#code').dataset.memoryToken = 'origine';`);
  await p.frameEval('player.html', `window.__memoryToken = 'origine';`);
  const countBeforeComment = built();
  fs.writeFileSync(F, orig + '\n// Commentaire sans changement visuel.\n');
  await until(() => built() > countBeforeComment, 'recompilation du commentaire');
  await until(async () => { codeAfterComment = await codeStatus(); return codeAfterComment?.status === 'ready'; }, 'fin de recompilation du commentaire');
  await sleep(1000);
  check(codeAfterComment.version === initialVersion, `un commentaire seul conserve la version du code (${initialVersion} → ${codeAfterComment.version})`);
  check(await p.eval(`return document.querySelector('#code').dataset.memoryToken === 'origine' && !document.querySelector('iframe.code-next')`) && await p.frameEval('player.html', `return window.__memoryToken === 'origine';`), 'un commentaire seul conserve l’iframe et son document');
  if (!orig.includes("titre: 'Le sujet'")) throw new Error('Le titre visuel de la première scène manque dans le projet d’essai');
  for (let k = 1; k <= 5; k++) {
    const v0 = await p.eval(`return document.querySelector('#codeStatus').textContent`);
    const title = `Le sujet — version ${k}`;
    fs.writeFileSync(F, orig.replace("titre: 'Le sujet'", `titre: '${title}'`));
    await p.until(`/^Code v[0-9]+/.test(document.querySelector('#codeStatus').textContent) && document.querySelector('#codeStatus').textContent !== ${JSON.stringify(v0)}`, 60000);
    await p.until(`!document.querySelector('iframe.code-next')`, 30000);
    await until(() => p.frameEval('player.html', `return document.body.textContent.includes(${JSON.stringify(title)});`), `titre visuel de la version ${k}`);
    await sleep(1200);
    seen.push({ v: await p.eval(`return document.querySelector('#codeStatus').textContent.split(' · ')[0]`), ...(await counters()) });
  }
  const last = seen.at(-1);
  check(new Set(seen.map((s) => s.v)).size === 5 && seen.every((s) => s.v !== `Code v${initialVersion}`), `cinq versions visuelles distinctes adoptées (${seen.map((s) => s.v).join(', ')})`);
  check(c0.iframes === 1 && seen.every((s) => s.iframes === 1), 'une seule iframe conservée après chaque échange');
  check(seen.every((s) => s.parent.docs === c0.parent.docs), `documents du processus parent : ${c0.parent.docs} au départ, ${seen.map((s) => s.parent.docs).join(' · ')} ensuite`);
  check(last.parent.nodes < c0.parent.nodes * 1.2 && last.parent.heapMB < c0.parent.heapMB * 1.5 + 4, `parent : DOM ${c0.parent.nodes} → ${last.parent.nodes} nœuds ; tas JS ${c0.parent.heapMB} → ${last.parent.heapMB} Mo`);
  check(seen.every((s) => s.iframe.docs === c0.iframe.docs), `documents du processus de l’iframe : ${c0.iframe.docs} au départ, ${seen.map((s) => s.iframe.docs).join(' · ')} ensuite`);
  check(last.iframe.nodes < c0.iframe.nodes * 1.2 && last.iframe.heapMB < c0.iframe.heapMB * 1.5 + 4, `iframe : DOM ${c0.iframe.nodes} → ${last.iframe.nodes} nœuds ; tas JS ${c0.iframe.heapMB} → ${last.iframe.heapMB} Mo (hors VRAM)`);
  fs.writeFileSync(path.join(SCR, 'mesures.json'), JSON.stringify({ portee: 'Compteurs CDP séparés du parent et du processus courant de l’iframe ; aucune mesure de VRAM ou de mémoire totale du navigateur', commentaire: { versionAvant: initialVersion, versionApres: codeAfterComment.version }, initial: c0, versions: seen }, null, 2));
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally {
  try { await p?.close(); } catch { /* */ }
  if (st) try { execFileSync('taskkill', ['/PID', String(st.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ }
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
