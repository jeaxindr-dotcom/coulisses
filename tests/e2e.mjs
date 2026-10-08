// End-to-end test of the studio on the SANDBOX (never the real episode): gestures on the image, queue, send, the
// Claude side (take / snapshot / reply / done), « Envois », undo / redo, the live preview of the code.
// usage: start `node studio-server.mjs E03 --no-open --episodes <sandbox>\07_Episodes --port 4174`, then
//        node tests/e2e.mjs   (screenshots in .cache/shots/)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, requireFrench } from './cdp.mjs';
import { CACHE } from '../lib/place.mjs';
import { removeTestNotes, closeTestLots } from './sandbox-clean.mjs';

process.env.COULISSES_LANG = 'fr';   // the suite checks the French texts (lib/i18n.mjs): the CLI below, and the studio started by hand
const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX = process.env.STUDIO_SANDBOX ?? path.join(STUDIO, 'sandbox', '07_Episodes');   // tests can run on their own copy
const PORT = +(process.env.STUDIO_PORT ?? 4174);
const EP = path.join(SANDBOX, 'E03 - The Secret Garden'), REVUE = path.join(EP, 'revue');
const URL = `http://localhost:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));   // COULISSES_TEST_SLOW=2: a slower PC
const cli = (...a) => execFileSync('node', [path.join(STUDIO, 'studio-cli.mjs'), ...a.slice(0, 1), 'E03', ...a.slice(1), '--episodes', SANDBOX], { encoding: 'utf8' }).trim();
const shots = path.join(CACHE, 'shots'); fs.mkdirSync(shots, { recursive: true });
let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) { ok++; console.log(`  ✓ ${what}`); } else { ko++; console.log(`  ✗ ${what}`); } };

// what earlier runs of the sandbox tests left behind (their own notes and open batches only: tests/sandbox-clean.mjs)
const TEST_TEXTS = ['Hazel devrait cligner des yeux ici', 'Le portail : plus de lumière', 'La glycine de droite bouge trop', 'Test connexion : la lanterne clignote', /^Mise en scène : ladder \(décor\)/];
await requireFrench(URL);
closeTestLots(REVUE, cli, TEST_TEXTS); await removeTestNotes(PORT, TEST_TEXTS);
const p = await launch();
try {
  await p.goto(URL);
  await p.until(`document.querySelector('#v').readyState >= 2`);
  await p.eval(`document.querySelector('#v').currentTime = 1200.5/30; return 1`); await sleep(1500);
  const before = await p.eval('return __studio.state().drafts');
  console.log('gestures');
  // C on Hazel's face
  await p.key('c', 'KeyC', 'c');
  const hz = await p.eval(`const r = document.querySelector('#ov').getBoundingClientRect(); return [r.left + 560 / 1920 * r.width, r.top + 620 / 1080 * r.height]`);   // Hazel's face in the frame
  await p.mouse('mousePressed', hz[0], hz[1]); await p.mouse('mouseReleased', hz[0], hz[1]);
  await p.until(`document.querySelector('#pop').style.display === 'block'`);
  await p.type('Hazel devrait cligner des yeux ici');
  await p.until(`document.querySelector('#popTg').dataset.state === 'done'`, 90000).catch(() => {});
  const tgC = await p.eval(`return document.querySelector('#popTg').textContent`);
  check(/hazel/i.test(tgC), `comment: 3D pick finds Hazel (${tgC})`);
  await p.shot(path.join(shots, 'e2e-1-comment.png'));
  await p.key('Enter', 'Enter', '\r'); await sleep(300);
  // D: two strokes = one drawing (around the gate)
  await p.key('d', 'KeyD', 'd');
  const circle = async (cx, cy, r) => { await p.mouse('mousePressed', cx + r, cy); for (let a = 0; a <= 6.3; a += 0.3) await p.mouse('mouseMoved', cx + r * Math.cos(a), cy + r * Math.sin(a)); await p.mouse('mouseReleased', cx + r, cy); };
  await circle(690, 330, 90); await circle(560, 470, 45);
  await p.until(`document.querySelector('#pop').style.display === 'block'`);
  check((await p.eval('return __studio.state().drawing?.strokes.length')) === 2, 'draw: two strokes in one drawing');
  await p.type('Le portail : plus de lumière');
  await p.until(`document.querySelector('#popTg').dataset.state === 'done'`, 60000).catch(() => {});
  const tgD = await p.eval(`return document.querySelector('#popTg').textContent`);
  check(/flower arch|décor/i.test(tgD), `draw: 3D pick inside the drawing (${tgD})`);
  await p.shot(path.join(shots, 'e2e-2-draw.png'));
  await p.key('Enter', 'Enter', '\r'); await sleep(300);
  // V then A
  await p.key('v', 'KeyV', 'v');
  await p.mouse('mousePressed', 1000, 300); await p.mouse('mouseReleased', 1000, 300);
  check(await p.eval(`return document.querySelector('#pickBtn').style.display !== 'none'`), 'select: « Demander une modif » appears at the pick');
  await p.key('a', 'KeyA', 'a');
  await p.until(`document.querySelector('#pop').style.display === 'block'`);
  await p.type('La glycine de droite bouge trop'); await sleep(2500);
  await p.key('Enter', 'Enter', '\r'); await sleep(800);
  const q = await p.eval(`return { n: __studio.state().drafts, rows: [...document.querySelectorAll('#draftList .card textarea.main')].map(e=>e.value) }`);
  check(q.n === before + 3, `queue: ${q.n} pending edits (${q.rows.join(' | ')})`);
  await p.shot(path.join(shots, 'e2e-3-queue.png'));

  console.log('send');
  await p.eval(`document.querySelector('#qwords').value = 'Test du studio'; return 1`);
  await p.eval(`document.querySelector('#qsend').click(); return 1`);
  await p.until(`document.querySelector('#modal').style.display === 'flex'`, 120000);
  const line = await p.eval(`return document.querySelector('#mLine').textContent`);
  const lot = +/lot (\d+)/.exec(line)[1];
  check(/Coulisses · E03 · lot \d+ \(\d+ modifs?\) → lis ".*\.md" et corrige/.test(line), `paste line: ${line}`);
  await p.shot(path.join(shots, 'e2e-4-sent.png'));
  const md = fs.readFileSync(path.join(REVUE, 'lots', String(lot).padStart(3, '0') + '.md'), 'utf8');
  check(/a entouré \(dessin en 2 traits\)/.test(md) && /a pointé \(/.test(md), 'lot .md: gestures in words');
  check(/Actor\[key="hazel"/.test(md), 'lot .md: Hazel named');
  const dir = path.join(REVUE, 'lots', String(lot).padStart(3, '0'));
  check(fs.existsSync(path.join(dir, '1-marque.jpg')) && fs.existsSync(path.join(dir, '1-zoom.jpg')), 'lot images: frame + marks + zoom');
  await p.eval(`document.querySelector('#mClose').click(); return 1`);
  check((await p.eval('return __studio.state().drafts')) === 0, 'queue emptied after send');

  console.log('Claude side');
  const L = JSON.parse(fs.readFileSync(path.join(REVUE, 'lots', String(lot).padStart(3, '0') + '.json'), 'utf8'));
  console.log('   ' + cli('take', String(lot)));
  await sleep(3500);
  check(await p.eval(`return document.body.innerText.includes("L'agent corrige")`), 'page shows « L\'agent corrige »');
  const dummy = path.join(EP, 'studio-test-file.txt');
  fs.writeFileSync(dummy, 'avant\n');
  console.log('   ' + cli('snapshot', String(lot), dummy));
  fs.writeFileSync(dummy, 'après la correction\n');
  console.log('   ' + cli('frame', '1200', '--source', 'video', '--out', path.join(STUDIO, '.cache', 'shots', 'e2e-eyes-video.jpg')));
  for (const e of L.edits) console.log('   ' + cli('reply', e.id, `Test : modif ${e.k} traitée`, '--status', 'done'));
  console.log('   ' + cli('done', String(lot), 'Lot de test traité'));
  await sleep(3500);
  await p.eval(`document.querySelector('#tabs button[data-tab=lots]').click(); return 1`); await sleep(300);
  const lotsTxt = await p.eval(`return document.querySelector('#lots').innerText`);
  check(/corrigé par l'agent/i.test(lotsTxt) && /Annuler cette correction/.test(lotsTxt), '« Envois »: lot done, undo offered');
  check(await p.eval(`return /Afficher dans l'Explorateur/.test(document.querySelector('#renderCard')?.innerText ?? '') && !!document.querySelector('#rcReveal')`), '« Envois » › Rendu: « Afficher dans l\'Explorateur » (the video, selected in its folder)');
  await p.shot(path.join(shots, 'e2e-5-lots.png'));
  // undo from the page (confirm() auto-accepted)
  await p.eval(`window.confirm = () => true; [...document.querySelectorAll('#lots .un')][0].click(); return 1`); await sleep(1200);
  check(fs.readFileSync(dummy, 'utf8') === 'avant\n', 'undo: the file is back to its state before the batch');
  await sleep(3500);
  await p.eval(`[...document.querySelectorAll('#lots .re')][0]?.click(); return 1`); await sleep(1200);
  check(fs.readFileSync(dummy, 'utf8') === 'après la correction\n', 'redo: the correction is back');
  fs.writeFileSync(dummy, 'modifié à la main\n'); await sleep(3500);
  await p.eval(`[...document.querySelectorAll('#lots .un')][0]?.click(); return 1`); await sleep(1200);
  check(fs.readFileSync(dummy, 'utf8') === 'modifié à la main\n' && /modifié depuis la correction/.test(await p.eval(`return document.querySelector('#lots').innerText`)), 'undo refused when the file changed since');
  fs.rmSync(dummy, { force: true });

  console.log('studio layout');
  const st = await p.eval('return __studio.state()');
  check(['Caméra', 'Lumière', 'Narrateur', 'Hazel', 'Musique', 'Ambiance', 'Bruitages', 'Mix'].every((x) => st.lanes.includes(x)), `timeline tracks: ${st.lanes.join(', ')}`);
  const pk = await (await fetch(`http://localhost:${PORT}/api/peaks?src=%40mix`)).json();
  check(pk.peaks.length > 40000, `waveform of the MP4 mix (${pk.peaks.length} peaks)`);
  await p.eval(`document.querySelector('#tabs button[data-tab=insp]').click(); return 1`); await sleep(400);
  check(/Caméra/.test(await p.eval(`return document.querySelector('#insp').innerText`)) && /Musique/.test(await p.eval(`return document.querySelector('#insp').innerText`)), 'inspector: camera, music… at this frame');
  console.log('timeline wheel (DaVinci Resolve style)');
  const r = await p.eval(`const r = document.querySelector('#tl').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]`);
  const wx = r[0] + 300, wy = r[1] + r[3] - 40, s0 = await p.eval('return __studio.state()');
  await p.wheel(wx, wy, 300); await sleep(150);
  const s1 = await p.eval('return __studio.state()');
  check(s1.vscroll > s0.vscroll && s1.view.a === s0.view.a && s1.vzoom === s0.vzoom, `wheel = tracks down (scroll ${s0.vscroll} → ${s1.vscroll})`);
  await p.wheel(wx, wy, -400, 1); await sleep(150);   // Alt
  const s2 = await p.eval('return __studio.state()');
  check(s2.view.b - s2.view.a < s1.view.b - s1.view.a, `Alt+wheel = horizontal zoom (${(s1.view.b - s1.view.a).toFixed(1)} s → ${(s2.view.b - s2.view.a).toFixed(1)} s)`);
  await p.wheel(wx, wy, 300, 2); await sleep(150);    // Ctrl
  const s3 = await p.eval('return __studio.state()');
  check(s3.view.a > s2.view.a && Math.abs((s3.view.b - s3.view.a) - (s2.view.b - s2.view.a)) < 1e-6, `Ctrl+wheel = move in time (${s2.view.a.toFixed(1)} → ${s3.view.a.toFixed(1)} s)`);
  await p.wheel(wx, wy, -300, 8); await sleep(150);   // Shift
  const s4 = await p.eval('return __studio.state()');
  check(s4.vzoom > s3.vzoom, `Shift+wheel = track height (×${s3.vzoom.toFixed(2)} → ×${s4.vzoom.toFixed(2)})`);
  await p.wheel(wx, wy, 300, 8); await sleep(100);
  console.log('pixel-exact targeting (the ladder behind Penelope, image 9050)');
  await p.eval(`document.querySelector('#v').currentTime = 9050.5/30; return 1`); await sleep(1500);
  await p.key('c', 'KeyC', 'c');
  const at = async (x, y, txt) => {
    const q = await p.eval(`const r = document.querySelector('#ov').getBoundingClientRect(); return [r.left + (${x} + 0.5) / 1920 * r.width, r.top + (${y} + 0.5) / 1080 * r.height]`);
    await p.mouse('mousePressed', q[0], q[1]); await p.mouse('mouseReleased', q[0], q[1]);
    await p.until(`document.querySelector('#popTg').dataset.state === 'done'`, 60000).catch(() => {});
    const got = await p.eval(`return document.querySelector('#popTg').textContent`);
    await p.key('Escape', 'Escape'); await sleep(200);
    return got;
  };
  const rung = await at(483, 503); check(/ladder/i.test(rung), `a rung of the ladder → ${rung}`);
  const gap = await at(483, 482); check(!/ladder|penelope/i.test(gap), `between two rungs (transparent) → ${gap}`);
  const hat = await at(470, 600); check(/penelope/i.test(hat), `Penelope's hat → ${hat}`);
  const above = await at(520, 548); check(!/penelope/i.test(above), `just above the hat (transparent around Penelope) → ${above}`);
  await p.shot(path.join(shots, 'e2e-7-library.png'));
  await p.eval(`document.querySelector('#v').currentTime = 1200.5/30; return 1`); await sleep(1200);
  console.log('live preview of the code');
  await p.eval(`document.querySelector('#srcCode').click(); return 1`);
  await p.until(`__studio.state().mode === 'code'`, 60000);
  await sleep(6000);
  await p.shot(path.join(shots, 'e2e-6-code.png'));
  check((await p.eval('return __studio.state().frame')) === 1200, 'code view opens on the same frame');
  await p.key('ArrowRight', 'ArrowRight'); await sleep(600);
  check((await p.eval('return __studio.state().frame')) === 1201, 'stepping works on the code view');
  await p.eval(`document.querySelector('#srcVideo').click(); return 1`); await sleep(500);
  check((await p.eval('return __studio.state().mode')) === 'video', 'back to the MP4');
} finally {
  const errs = p.logs.filter((l) => /exception|\[error\]/.test(l) && !/WebGL|X4000/.test(l));
  if (errs.length) console.log('page errors:\n' + errs.slice(0, 5).join('\n'));
  await p.close();
  console.log(`\n${ok} ok, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
}
