// « Étalonnage » end to end (SANDBOX; user request, 09/10/2026: « un système d'étalonnage, plusieurs filtres rangés par
// émotion, les roues colorimétriques standard », « une page à part, un peu comme DaVinci Resolve », par scène, avec avant /
// après, forme d'onde et parade RVB): G opens the page, its maths, a look on a scene, the wipe, B, a wheel, a slider,
// the scopes, « Ajouter à la file », the batch with the exact SVG filter.
// usage: start a studio server on a sandbox (STUDIO_PORT / STUDIO_SANDBOX as tests/e2e.mjs), then node tests/grade.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launch, requireFrench } from './cdp.mjs';
import { CACHE } from '../lib/place.mjs';
import { removeTestNotes, closeTestLots } from './sandbox-clean.mjs';
process.env.COULISSES_LANG = 'fr';
const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX = process.env.STUDIO_SANDBOX ?? path.join(STUDIO, 'sandbox', '07_Episodes');
const PORT = +(process.env.STUDIO_PORT ?? 4174);
const REVUE = path.join(SANDBOX, 'E03 - The Secret Garden', 'revue');
const shots = path.join(CACHE, 'shots'); fs.mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0; const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
await requireFrench(`http://localhost:${PORT}/`);
const cli = (...a) => execFileSync('node', [path.join(STUDIO, 'studio-cli.mjs'), ...a.slice(0, 1), 'E03', ...a.slice(1), '--episodes', SANDBOX], { encoding: 'utf8' }).trim();
const TEST_TEXTS = [/^Étalonnage de la scène « Root Library » :/];
closeTestLots(REVUE, cli, TEST_TEXTS); await removeTestNotes(PORT, TEST_TEXTS);
const p = await launch({ port: 9371 });
let lot = null;
try {
  await p.goto(`http://localhost:${PORT}/#f=9050`);
  await p.until(`window.__grade && document.querySelector('#v').readyState >= 2`, 90000); await sleep(1500);
  // ---- the maths, the same as the filter (11-grade.js) ----
  const m = await p.eval(`
    const N = __grade.neutral(), E0 = __grade.effective(N), d = new Uint8ClampedArray([12, 80, 200, 255, 128, 128, 128, 255, 240, 230, 20, 255]);
    const id = __grade.pixels(d, 3, 1, E0), same = [...id].every((x, i) => Math.abs(x * 255 - d[[0, 1, 2, 4, 5, 6, 8, 9, 10][i]]) < 0.6);
    const svg = __grade.filter('t', E0, 1920), tab = /feFuncR type="table" tableValues="([^"]+)"/.exec(svg)[1].split(' ').map(Number), ident = tab.every((x, i) => Math.abs(x - i / 48) < 1e-4);
    const grey = new Uint8ClampedArray([40, 40, 40, 255]);
    const blueLift = __grade.pixels(grey, 1, 1, __grade.effective({ ...N, lift: { h: 240, s: 1, m: 0 } }));
    const bright = __grade.pixels(new Uint8ClampedArray([200, 200, 200, 255]), 1, 1, __grade.effective({ ...N, gain: { h: 0, s: 0, m: 0.5 } }));
    const bw = __grade.pixels(d, 3, 1, __grade.effective({ ...N, look: 'bw', amount: 1 }));
    return { same, ident, blueLift: [...blueLift], bright: [...bright], bwGrey: [0, 1, 2].every((k) => Math.abs(bw[k * 3] - bw[k * 3 + 1]) < 0.02 && Math.abs(bw[k * 3 + 1] - bw[k * 3 + 2]) < 0.02), looks: __grade.lookIds().length }`);
  check(m.same && m.ident, 'a neutral grade changes nothing: identity tables, the same pixels');
  check(m.blueLift[2] > m.blueLift[0] + 0.05, `Lift towards blue: the shadows go blue (R ${m.blueLift[0].toFixed(3)} · B ${m.blueLift[2].toFixed(3)})`);
  check(m.bright[0] > 200 / 255 + 0.05, `Gain master +0.5: the highlights brighter (${(m.bright[0] * 255).toFixed(0)} > 200)`);
  check(m.bwGrey && m.looks === 31, `the « Noir et blanc » look gives greys; ${m.looks} looks`);
  // ---- G: the page ----
  await p.key('g', 'KeyG', 'g');
  await p.until(`__grade.state().on && document.querySelectorAll('#cgLookList .cgcard').length`, 10000); await sleep(2500);
  const pg = await p.eval(`const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; };
    return { body: document.body.classList.contains('cg'), looks: vis('#cgLooks'), scenes: vis('#cgScenes'), panel: vis('#cgPanel'), scopes: vis('#cgScopes'), lside: vis('#lside'), side: vis('#side'), tl: vis('#tlpanel'),
      groups: document.querySelectorAll('#cgLookList h3').length, cards: document.querySelectorAll('#cgLookList .cgcard').length, sc: document.querySelectorAll('#cgSceneList .cgsc').length,
      cur: document.querySelector('#cgSceneList .cgsc.on b')?.textContent, name: document.querySelector('#cgSceneName').textContent, seg: document.querySelector('#pageSeg .on')?.dataset.page }`);
  check(pg.body && pg.looks && pg.scenes && pg.panel && pg.scopes && !pg.lside && !pg.side && !pg.tl && pg.seg === 'grade', 'G: the « Étalonnage » page instead of the review panels');
  check(pg.groups === 8 && pg.cards === 31, `31 looks in 8 emotions (${pg.cards} / ${pg.groups})`);
  check(pg.sc === 7 && pg.cur === 'Root Library' && pg.name === 'Root Library', `the episode's 7 scenes, the one under the playhead chosen (${pg.cur})`);
  const lit = await p.eval(`const c = document.querySelector('.cgcard[data-look="golden"] canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3`);
  check(lit > 20, `the cards show the frame, graded (mean ${lit.toFixed(0)})`);
  // ---- a look on the scene: the preview graded through the filter ----
  await p.eval(`document.querySelector('.cgcard[data-look="tealorange"]').click(); return 1`); await sleep(800);
  const lk = await p.eval(`const fx = document.querySelector('#cgFx'), st = __grade.state();
    return { g: Object.keys(st.grades), look: Object.values(st.grades)[0]?.look, fx: getComputedStyle(fx).display, bf: fx.style.backdropFilter, f: !!document.querySelector('#cgDefs filter#cg-live feFuncR'),
      on: document.querySelector('.cgcard.on')?.dataset.look, chip: document.querySelector('#cgSceneList .cgsc.on .chip')?.textContent, sub: document.querySelector('#cgSceneSub').textContent }`);
  check(lk.look === 'tealorange' && lk.g[0] === '8679-10751' && lk.on === 'tealorange', `a click on « Teal & orange »: the scene's grade (${lk.g[0]})`);
  check(lk.fx === 'block' && /url\(.*cg-live/.test(lk.bf) && lk.f, 'the preview goes through the SVG filter (backdrop-filter: url(#cg-live))');
  check(/Teal & orange · en cours/.test(lk.chip ?? '') && /en cours/.test(lk.sub), `the scene says it is being graded (${lk.chip})`);
  // ---- the wipe: before | after ----
  const r = await p.eval(`const m = document.querySelector('#media').getBoundingClientRect(), h = document.querySelector('#cgWipe').getBoundingClientRect(); return { mx: m.left, mw: m.width, my: m.top + m.height / 2, hx: h.left + h.width / 2 }`);
  await p.mouse('mousePressed', r.hx, r.my); for (let i = 1; i <= 8; i++) await p.mouse('mouseMoved', r.hx + (r.mw / 2) * i / 8, r.my); await p.mouse('mouseReleased', r.mx + r.mw / 2, r.my);
  await sleep(500);
  const wp = await p.eval(`const fx = document.querySelector('#cgFx').getBoundingClientRect(), m = document.querySelector('#media').getBoundingClientRect(); return { w: __grade.state().wipe, l: (fx.left - m.left) / m.width, split: document.querySelector('#cgWipe').classList.contains('split') }`);
  check(Math.abs(wp.w - 0.5) < 0.04 && Math.abs(wp.l - 0.5) < 0.04 && wp.split, `the white line dragged half way: before on the left, after on the right (${wp.w.toFixed(2)})`);
  await p.shot(path.join(shots, 'grade-1-wipe.png'));
  // ---- B: the original ----
  await p.key('b', 'KeyB', 'b'); await sleep(300);
  const by = await p.eval(`return { b: __grade.state().bypass, fx: getComputedStyle(document.querySelector('#cgFx')).display, btn: document.querySelector('#cgBypass').classList.contains('on') }`);
  await p.key('b', 'KeyB', 'b'); await sleep(300);
  const by2 = await p.eval(`return getComputedStyle(document.querySelector('#cgFx')).display`);
  check(by.b && by.fx === 'none' && by.btn && by2 === 'block', 'B: the original, B again: the grade');
  // ---- a wheel: Gain dragged to the right of its centre; the master bar ----
  const wh = await p.eval(`const c = document.querySelector('.cgw[data-w="gain"] canvas').getBoundingClientRect(); return [c.left + c.width / 2, c.top + c.height / 2, c.width]`);
  await p.mouse('mousePressed', wh[0], wh[1]); for (let i = 1; i <= 5; i++) await p.mouse('mouseMoved', wh[0] + wh[2] * 0.2 * i / 5, wh[1]); await p.mouse('mouseReleased', wh[0] + wh[2] * 0.2, wh[1]);
  await sleep(300);
  const gain = await p.eval(`return Object.values(__grade.state().grades)[0].gain`);
  check(gain.s > 0.3 && gain.s < 0.6 && Math.abs(gain.h - 257) < 3, `the Gain wheel dragged right: hue ${gain.h.toFixed(0)}° (blue-violet), strength ${gain.s.toFixed(2)}`);
  // ---- a slider, and its double-click back to neutral ----
  await p.eval(`const i = document.querySelector('#cgBasic input[data-k="exposure"]'); i.value = '0.5'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1`); await sleep(200);
  const ex = await p.eval(`return [Object.values(__grade.state().grades)[0].exposure, document.querySelector('[data-n="exposure"]').textContent]`);
  await p.eval(`document.querySelector('#cgBasic input[data-k="exposure"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1`); await sleep(200);
  const ex2 = await p.eval(`return Object.values(__grade.state().grades)[0].exposure`);
  check(ex[0] === 0.5 && ex[1] === '+0,50' && ex2 === 0, `Exposition +0,50, double-click: 0 (${ex[1]})`);
  // ---- the scopes: the parade, three lanes ----
  await p.eval(`document.querySelector('#cgScopeSeg button[data-s="parade"]').click(); return 1`); await sleep(1500);
  const sc = await p.eval(`const c = document.querySelector('#cgScope'), g = c.getContext('2d'), w = c.width, h = c.height, lane = (x0) => { const d = g.getImageData(Math.round(x0 * w), 0, Math.round(w / 3) - 8, h).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } return [r, gg, b]; };
    const L = [lane(0), lane(1 / 3), lane(2 / 3)]; const top = (l, c) => l[c] > 1.15 * Math.max(...l.filter((_, i) => i !== c)); return { red: top(L[0], 0), green: top(L[1], 1), blue: top(L[2], 2), L: L.map((l) => l.map((x) => Math.round(x / 1000))), src: document.querySelector('#cgScopeSrc').textContent }`);
  check(sc.red && sc.green && sc.blue && /image 9050/.test(sc.src), `the RGB parade: red, green, blue lanes, from the frame shown (${sc.src}; ${JSON.stringify(sc.L)})`);
  await p.shot(path.join(shots, 'grade-2-parade.png'));
  // ---- « Ajouter à la file »: one edit for the scene, the filter, the before / after images ----
  await p.eval(`document.querySelector('#cgAdd').click(); return 1`);
  let n = null;   // its images come a moment later (two frames, graded by the same maths)
  for (let i = 0; i < 240 && !(n?.images?.length >= 2); i++) { await sleep(500); n = await p.eval(`const r = await (await fetch('/api/notes')).json(); return r.notes.find((x) => x.draft && x.grade) ?? null`); }
  check(n.frame === 8679 && n.end === 10751 && n.grade.look === 'tealorange' && /<filter id="cg-8679-10751"/.test(n.grade.svg), `the queue holds the scene's grade, frames ${n.frame} → ${n.end}, with its filter`);
  check(/^Étalonnage de la scène « Root Library » : look « Teal & orange » \(Tension · danger\) à 100 % ; Gain/.test(n.text), `in words: ${n.text.slice(0, 110)}…`);
  check(n.images.map((i) => i.label).join(',') === 'étalonnage (avant),étalonnage (après)', 'with the frame before / after');
  const after = await p.eval(`const st = __grade.state(); return { g: Object.keys(st.grades).length, fx: getComputedStyle(document.querySelector('#cgFx')).display, chip: document.querySelector('#cgSceneList .cgsc.on .chip')?.textContent }`);
  check(after.g === 0 && after.fx === 'block' && /dans la file/.test(after.chip ?? ''), `queued: the preview keeps showing it (${after.chip})`);
  // ---- back to the review, then send ----
  await p.key('g', 'KeyG', 'g'); await sleep(800);
  check(!(await p.eval(`return document.body.classList.contains('cg')`)) && (await p.eval(`return getComputedStyle(document.querySelector('#lside')).display !== 'none'`)), 'G again: the review');
  await p.eval(`document.querySelector('button[data-tab=queue]').click(); return 1`);
  await p.until(`!document.querySelector('#qsend').disabled`, 10000);
  await p.eval(`document.querySelector('#qsend').click(); return 1`);
  await p.until(`document.querySelector('#modal').style.display === 'flex'`, 180000);
  lot = +/lot (\d+)/.exec(await p.eval(`return document.querySelector('#mLine').textContent`))[1];
  const md = fs.readFileSync(path.join(REVUE, 'lots', String(lot).padStart(3, '0') + '.md'), 'utf8');
  const svgFile = /halo\) : ([A-Z]:\\.*?-etalonnage\.svg), filtre `#cg-8679-10751`/.exec(md)?.[1];   // a path with spaces
  check(/\*\*Étalonnage\*\* de la scène "Root Library" \(images 8679 → 10751\)/.test(md) && !!svgFile, 'the batch: an « Étalonnage » block, the scene, its frames');
  check(!!svgFile && fs.existsSync(svgFile) && /<feComponentTransfer/.test(fs.readFileSync(svgFile, 'utf8')), `the exact filter as a file of the batch (${svgFile && path.basename(svgFile)})`);
  check(/Les valeurs \(pour un autre moteur que CSS\) : `\{"exposure":0,/.test(md) && /flag/.test(md), 'the values for another engine, the theatre told to make it an episode setting');
  console.log(md.split('\n').filter((l) => /Étalonnage|filtre exact|valeurs/.test(l)).map((l) => '     ' + l.slice(0, 180)).join('\n'));
  await sleep(800);
  check(await p.eval(`return getComputedStyle(document.querySelector('#cgFx')).display === 'none'`), 'sent: the preview no longer adds it (the agent writes it in the code)');
  // ---- the queue has no limit any more (user request, 09/10/2026: « autant de notes que je veux », no longer 10 at most) ----
  await p.eval(`document.querySelector('#modal').style.display = 'none'; for (let i = 0; i < 11; i++) document.querySelector('#bNote').click(); return 1`); await sleep(800);
  const q = await p.eval(`return { n: document.querySelector('#qcnt').textContent, full: document.querySelector('#qcnt').classList.contains('full'), save: document.querySelector('#save').textContent }`);
  check(q.n === '11' && !q.full && !/pleine/.test(q.save), `11 pending edits, no « File pleine » (${q.n})`);
  await removeTestNotes(PORT, []);   // the empty notes it made
} catch (e) { ko++; console.log('  ✗ ERREUR', e.message); } finally {
  const errs = p.logs.filter((l) => /exception|\[error\]/.test(l) && !/WebGL|X4000/.test(l));
  if (errs.length) { ko++; console.log('  ✗ page errors:\n' + errs.slice(0, 5).join('\n')); }
  await p.close();
  if (lot) { try { cli('take', String(lot)); cli('done', String(lot), 'test de la page Étalonnage'); } catch { /* */ } }
  console.log(`\n${ok} ok, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
}
