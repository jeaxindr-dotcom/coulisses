// The review tools of the studio (user request, 16/10/2026, from HyperFrames Studio: « mets tout, check comment bien le
// marier à l'interface »), on test projects only (nothing real is touched):
//   - a vertical video with a voice (Windows' own speech, 1080×1920): « Affichage » and its tools, the safe zones of a
//     Short (S), the board of stills (T), the sound measured (lane, meter, Inspector, a range), the words heard
//     (transcribed with the user's HyperFrames when Parakeet is there: the lane, Ctrl+F, Entrée, the Inspector, a note's
//     context for the agent);
//   - the Remotion project of tests/coulisses-fixture.mjs: « Historique » — a change made in an editor, one made while the
//     agent works on a batch, the lines of a change, « Revenir ici » (and back again), « Annuler ce changement »;
//   - a HyperFrames project (lib/new-project.mjs): « Vérifier la composition » (hyperframes check: a text out of the
//     frame, unreadable), its findings at their moment, into the queue as notes; « Exporter » checked first and asked
//     about its errors; a long export's segments kept for the next one.
// usage: node tests/review-tools.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

process.env.COULISSES_LANG = 'fr';   // the suite checks the French texts
const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'review-tools-test'), shots = path.join(STUDIO, '.cache', 'shots');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(path.join(SCR, 'Parle'), { recursive: true }); fs.mkdirSync(shots, { recursive: true });
const env = { ...process.env, STUDIO_PROJECTS: path.join(SCR, 'projets.json'), COULISSES_SETTINGS: path.join(SCR, 'settings.json'), COULISSES_MEDIAS: path.join(SCR, 'medias'), COULISSES_HISTORY_DIR: path.join(SCR, 'historique') };
Object.assign(process.env, env);
const { importProject } = await import('../lib/projects.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const kill = (c) => { if (c?.pid) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
async function studio(args, port) {
  const c = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), ...args, '--no-open', '--port', String(port)], { cwd: STUDIO, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 240 && !/Ouvre : http/.test(out); i++) await sleep(250);
  c.out = () => out;
  return c;
}

// ---- the video with a voice: Windows' speech (an English voice), on a test pattern ----
const WAV = path.join(SCR, 'voix.wav'), VID = path.join(SCR, 'Parle', 'Parle.mp4');
const SAY = 'Welcome to the secret garden. The garden is quiet in the morning. Look at the roses near the garden gate.';
let voice = false;
try {
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.Rate = -1; $s.SetOutputToWaveFile('${WAV}'); $s.Speak('${SAY}'); $s.Dispose()`], { stdio: 'ignore', timeout: 60000 });
  voice = fs.existsSync(WAV) && fs.statSync(WAV).size > 50000;
} catch { /* no speech on this PC */ }
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=14', ...(voice ? ['-i', WAV] : ['-f', 'lavfi', '-i', "aevalsrc='0.4*sin(2*PI*220*t)':s=48000:d=14"]),
  '-filter_complex', '[1:a]apad,atrim=0:14,aresample=48000[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '14', VID]);
{ const t = new Date(Date.now() - 120000); fs.utimesSync(VID, t, t); }
check(fs.existsSync(VID), `a vertical test video, ${voice ? 'with a voice (Windows\' speech)' : 'with a tone (no speech voice on this PC)'}`);

const p = await launch({ port: 9356 });
await p.size(1600, 1000);
const ev = (e) => p.eval(e).catch(() => null);
const click = async (sel) => { await p.eval(`document.querySelector(${JSON.stringify(sel)}).click(); return 1`); await sleep(250); };
let s1 = null, s2 = null, s3 = null;
try {
  // ======================= the vertical video =======================
  const imp = importProject(VID);
  s1 = await studio(['--project', imp.revue], 4193);
  check(/Ouvre : http/.test(s1.out()), 'the studio of the vertical video starts');
  await p.goto('http://127.0.0.1:4193/#f=150');
  await p.until(`window.__studio && document.querySelector('#v').readyState >= 2 && document.querySelector('#menubar > button')`, 90000); await sleep(1200);
  // « Affichage »: the tools to look at the video
  const bar = await ev(`return [...document.querySelectorAll('#menubar > button')].map((b) => b.textContent).join(' · ')`);
  check(bar === 'Fichier · Édition · Affichage · Outils · Aide', `the menu bar: « ${bar} »`);
  const mb = await ev(`const r = document.querySelector('#menubar > button[data-menu=view]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`);
  await p.mouse('mousePressed', mb[0], mb[1]); await p.mouse('mouseReleased', mb[0], mb[1]); await sleep(300);
  const items = await ev(`return [...document.querySelectorAll('.mb-menu .mb-item')].map((r) => r.dataset.id + '=' + r.querySelector('.l').textContent + '|' + (r.querySelector('.k')?.textContent ?? ''))`);
  check(items?.some((x) => x.startsWith('safeZones=Afficher les zones de sécurité') && x.endsWith('|S')) && items?.some((x) => x.startsWith('sheet=') && x.endsWith('|T')) && items?.some((x) => x.startsWith('words=Paroles') && /Ctrl\+F$/.test(x)), `Affichage: ${items?.join(' · ')}`);
  await p.key('Escape', 'Escape'); await p.key('Escape', 'Escape'); await sleep(200);

  // ---- the safe zones (S) ----
  await p.key('s', 'KeyS', 's'); await sleep(400);
  const sz = await ev(`const o = document.querySelector('#safeOv'); return { on: o.classList.contains('on'), bands: o.querySelectorAll('.bands rect').length, safe: !!o.querySelector('rect.safe'), labs: o.querySelector('.labs')?.textContent ?? '', btn: document.querySelector('#bSafe').classList.contains('on') }`);
  check(sz?.on && sz.btn && sz.bands === 4 && sz.safe && /YouTube|recherche|titre/i.test(sz.labs), `S: the zones of a Short over the image (${sz?.bands} bands, « ${sz?.labs.slice(0, 60)} »), the button lit`);
  await p.shot(path.join(shots, 'review-tools-safe.png'));
  await p.key('s', 'KeyS', 's'); await sleep(300);
  check(await ev(`return !document.querySelector('#safeOv').classList.contains('on') && !document.querySelector('#bSafe').classList.contains('on')`), 'S again: gone');

  // ---- the board of stills (T) ----
  await p.key('t', 'KeyT', 't'); await sleep(2500);
  const sh = await ev(`return { on: document.querySelector('#sheet').classList.contains('on'), tiles: document.querySelectorAll('#sheet .tile').length, tall: !!document.querySelector('#sheet .grid.tall'), loaded: [...document.querySelectorAll('#sheet .tile img')].filter((i) => i.complete && i.naturalWidth).length, here: !!document.querySelector('#sheet .tile.here') }`);
  check(sh?.on && sh.tiles >= 3 && sh.tall && sh.loaded >= 1 && sh.here, `T: the board (${sh?.tiles} stills, ${sh?.loaded} loaded, the playhead's ringed)`);
  await p.shot(path.join(shots, 'review-tools-sheet.png'));
  const f2 = await ev(`const t = document.querySelectorAll('#sheet .tile')[2]; t.click(); return +t.dataset.f`); await sleep(500);
  check(!(await ev(`return document.querySelector('#sheet').classList.contains('on')`)) && Math.abs((await ev(`return __studio.state().frame`)) - f2) <= 1, `a still clicked: the playhead there (image ${f2}), the board closed`);
  await p.key('t', 'KeyT', 't'); await sleep(600); await p.key('Escape', 'Escape'); await sleep(300);
  check(!(await ev(`return document.querySelector('#sheet').classList.contains('on')`)), 'Échap closes the board');

  // ---- the sound measured ----
  await p.until(`document.querySelector('#loudM').classList.contains('on')`, 60000).catch(() => {});
  const lm = await ev(`return { on: document.querySelector('#loudM').classList.contains('on'), v: document.querySelector('#loudM .lv').textContent, lanes: __studio.state().lanes, loud: window.__loud() }`);
  check(lm?.on && /−\d+,\d/.test(lm.v) && lm.lanes.includes('Son mesuré') && lm.loud.n > 100, `the sound measured: the meter (${lm?.v} LUFS), the lane « Son mesuré », ${lm?.loud.n} measures`);
  const api = await (await fetch('http://127.0.0.1:4193/api/loudness')).json();
  check(api.state === 'ready' && api.data.I < -5 && api.data.I > -60 && api.data.TP < 0.5 && api.data.S.length >= 130, `/api/loudness: integrated ${api.data?.I} LUFS, peak ${api.data?.TP} dBTP`);
  await click('button[data-tab=insp]'); await sleep(400);
  const f0 = await ev(`return __studio.state().frame`);
  await p.key('r', 'KeyR', 'r'); for (let i = 0; i < 45; i++) await p.key('ArrowRight', 'ArrowRight');
  await p.until(`__studio.state().frame === ${f0 + 45}`, 15000).catch(() => {});   // (the video catches up with the keys)
  await p.until(`document.querySelector('#loudRange')`, 10000).catch(() => {}); await sleep(1200);
  await click('#loudRange');
  await p.until(`window.__loud().ranges.some(([, r]) => r.ok)`, 20000).catch(() => {});
  const ins = await ev(`const t = document.querySelector('#insp').innerText; const i = t.search(/SON MESURÉ/i); return t.slice(i, i + 400)`);
  check(/À cette image/.test(ins ?? '') && /Toute la vidéo/.test(ins ?? '') && /La plage \d:\d\d\.\d{3} – \d:\d\d\.\d{3}\s+−?\d+,\d LUFS/.test(ins ?? ''), `the Inspector: the sound here, of the whole video, of the range being marked (measured exactly): ${(ins ?? '').replace(/\n/g, ' / ').slice(0, 260)}`);
  await p.key('Escape', 'Escape'); await sleep(200);

  // ---- the words heard ----
  await p.until(`window.__words && window.__words().engines`, 40000).catch(() => {});
  const eng = await ev(`return window.__words().engines`);
  if (!eng?.cli) console.log('  (sauté : les paroles — pas de HyperFrames sur ce PC)');
  else if (!eng.parakeet) {
    await click('#wBtn'); await sleep(500);
    check(await ev(`return /Installer Parakeet/.test(document.querySelector('#wPop').innerText) && document.querySelector('#wGo').disabled`), 'Paroles: Parakeet not installed — the panel offers to install it, nothing transcribed without it');
    await p.key('Escape', 'Escape');
  } else {
    await click('#wBtn'); await sleep(600);
    const pop = await ev(`return document.querySelector('#wPop').innerText`);
    check(/Parakeet, sur ce PC/.test(pop ?? '') && /Détection auto/.test(pop ?? ''), 'Paroles: the panel (the engine, the language)');
    await p.shot(path.join(shots, 'review-tools-words-pop.png'));
    await click('#wGo');
    await p.until(`window.__words().state === 'ready'`, 180000).catch(() => {}); await sleep(600);
    const w = await ev(`return { ...window.__words(), engines: null, lanes: __studio.state().lanes, bar: document.querySelector('#words').className }`);
    if (!voice) check(w?.state === 'ready' && w.n === 0, `a tone only: transcribed, no words (${w?.n})`);
    else {
      check(w?.state === 'ready' && w.n >= 8 && w.lanes.includes('Paroles') && /ready/.test(w.bar), `transcribed: ${w?.n} words, the lane « Paroles », the search field`);
      await p.eval(`document.activeElement?.blur(); return 1`); await p.key('Home', 'Home'); await sleep(300);
      await p.key('f', 'KeyF', '', 2); await sleep(200);
      check((await ev(`return document.activeElement?.id`)) === 'wq', 'Ctrl+F: the search field');
      await p.type('garden'); await sleep(400); await p.key('Enter', 'Enter'); await sleep(900);
      const g = await ev(`return { ...window.__words(), engines: null, frame: __studio.state().frame, wn: document.querySelector('#wn').textContent }`);
      check(g?.hits >= 2 && g.hit === 0 && /^1 \/ \d+$/.test(g.wn), `« garden »: ${g?.hits} found (${g?.wn}), the first one`);
      await p.key('Enter', 'Enter'); await sleep(700);
      const g2 = await ev(`return { hit: window.__words().hit, frame: __studio.state().frame }`);
      check(g2?.hit === 1 && g2.frame > g.frame, `Entrée: the next one (image ${g?.frame} → ${g2?.frame})`);
      await p.key('Enter', 'Enter', '', 8); await sleep(700);
      check((await ev(`return window.__words().hit`)) === 0, 'Maj+Entrée: the one before');
      const said = await ev(`const t = document.querySelector('#insp').innerText; const i = t.search(/PAROLES/i); return t.slice(i, i + 160)`);
      check(/Dit ici\n« [^»]*garden/i.test(said ?? ''), `the Inspector: « Dit ici » (${(said ?? '').split('\n').slice(1, 3).join(' ')})`);
      await p.shot(path.join(shots, 'review-tools-words.png'));
      // a note there: the words heard go with it, for the agent
      await p.eval(`document.activeElement?.blur(); return 1`); await p.key('n', 'KeyN', 'n'); await sleep(500);
      await p.type('Plus lent ici'); await p.key('Enter', 'Enter'); await sleep(1500);
      const notes = await (await fetch('http://127.0.0.1:4193/api/notes')).json();
      const heard = notes.notes?.at(-1)?.context?.heard ?? '';
      check(/garden/i.test(heard), `a note at that moment keeps the words heard: « ${heard} »`);
    }
  }
  await p.close(); kill(s1); s1 = null;

  // ======================= the Remotion project: « Historique » =======================
  const { makeFixture, PROJET, RUN } = await import('./coulisses-fixture.mjs');
  let fixture = null; try { fixture = makeFixture(); } catch (e) { console.log(`  (sauté : l'historique — ${e.message})`); }
  if (fixture) {
    const imp2 = importProject(RUN);
    s2 = await studio(['--project', imp2.revue], 4194);
    const q = await launch({ port: 9357 }); await q.size(1600, 1000);
    const qe = (e) => q.eval(e).catch(() => null), qc = async (sel) => { await q.eval(`document.querySelector(${JSON.stringify(sel)}).click(); return 1`); await sleep(300); };
    try {
      await q.goto('http://127.0.0.1:4194/');
      await q.until(`window.__studio && window.__hist && !document.querySelector('#ltabs button[data-tab=hist]').classList.contains('none')`, 120000);
      await qc('#ltabs button[data-tab=hist]');
      await q.until(`window.__hist().on === true`, 20000).catch(() => {});
      const h0 = await qe(`return { ...window.__hist(), txt: document.querySelector('#histList').innerText, sub: document.querySelector('#histSub').textContent, tight: document.querySelector('#ltabs').classList.contains('tight') }`);
      check(h0?.on && h0.n === 0 && /Aucun changement/.test(h0.txt) && /\d+ fichiers suivis/.test(h0.sub), `the tab « Historique »: nothing yet (${h0?.sub}), ${h0?.tight ? 'the other tabs as icons' : 'all tabs written'}`);
      const ESSAI = path.join(PROJET, 'src', 'runs', 'essai.ts'), first = fs.readFileSync(ESSAI, 'utf8');
      // 1) a change in an editor (no batch going on)
      fs.writeFileSync(ESSAI, first.replace(/\n$/, '') + '\n// a line written in an editor\n');
      await q.until(`window.__hist().n === 1`, 20000).catch(() => {}); await sleep(300);
      const h1 = await qe(`return document.querySelector('#histList').innerText`);
      check(/Hors d'un lot/.test(h1 ?? '') && /runs\/essai\.ts/.test(h1 ?? '') && /\+1/.test(h1 ?? ''), 'a change made in an editor: « Hors d\'un lot », the file, +1');
      // 2) the agent on batch 1 (replies.json: taken): a change of its own, a new file
      const REPLIES = path.join(imp2.revue, 'replies.json'), r0 = fs.existsSync(REPLIES) ? JSON.parse(fs.readFileSync(REPLIES, 'utf8')) : { notes: {} };
      fs.writeFileSync(REPLIES, JSON.stringify({ ...r0, lots: { ...(r0.lots ?? {}), 1: { status: 'taken', at: new Date().toISOString() } } }));
      await sleep(300);
      const second = fs.readFileSync(ESSAI, 'utf8').replace('// a line written in an editor', '// the agent changed this line');
      fs.writeFileSync(ESSAI, second); fs.writeFileSync(path.join(PROJET, 'src', 'NOTES.md'), '# notes\n\nby the agent\n');
      await q.until(`window.__hist().n === 3`, 20000).catch(() => {}); await sleep(400);
      const h2 = await qe(`return [...document.querySelectorAll('#histList .hstep')].map((s) => s.querySelector('.who').textContent + ' : ' + [...s.querySelectorAll('.hf .fn')].map((f) => f.textContent).join(', '))`);
      check(h2?.length === 2 && /^Lot 1 : /.test(h2[0]) && /essai\.ts/.test(h2[0]) && /NOTES\.md/.test(h2[0]) && /^Hors d'un lot : /.test(h2[1]), `two steps: ${h2?.join(' | ')}`);
      // 3) the lines of a change, over the image
      await q.eval(`[...document.querySelectorAll('#histList .hf')].find((b) => /essai/.test(b.textContent)).click(); return 1`);
      await q.until(`document.querySelector('#histDiff').classList.contains('on')`, 10000).catch(() => {}); await sleep(300);
      const dv = await qe(`return { del: [...document.querySelectorAll('#histDiff .dl.del code')].map((c) => c.textContent), add: [...document.querySelectorAll('#histDiff .dl.add code')].map((c) => c.textContent), head: document.querySelector('#histDiff .sbar').innerText }`);
      check(dv?.del.includes('// a line written in an editor') && dv.add.includes('// the agent changed this line') && /Lot 1/.test(dv.head), 'a click on the file: its lines over the image (the one gone, the one come), by Lot 1');
      await q.shot(path.join(shots, 'review-tools-history.png'));
      await q.key('Escape', 'Escape'); await sleep(200);
      check(!(await qe(`return document.querySelector('#histDiff').classList.contains('on')`)), 'Échap closes it');
      // 4) « Revenir ici » on the editor's step while the agent still works: asked, then said it is busy
      await q.eval(`document.querySelectorAll('#histList .hstep')[1].querySelector('[data-back]').click(); return 1`); await sleep(200);
      check(/Remettre le projet à ce point/.test(await qe(`return document.querySelector('#histList .ask')?.textContent`) ?? ''), '« Revenir ici »: asked first');
      await q.eval(`document.querySelector('#histList [data-yes]').click(); return 1`); await sleep(700);
      check(/L'agent travaille sur le lot 1/.test(await qe(`return document.querySelector('#histList .ask')?.textContent`) ?? '') && fs.readFileSync(ESSAI, 'utf8') === second, 'the agent on batch 1: asked again, nothing touched yet');
      await q.eval(`document.querySelector('#histList [data-yes]').click(); return 1`);
      await q.until(`window.__hist().n === 5`, 20000).catch(() => {}); await sleep(400);
      const after = fs.readFileSync(ESSAI, 'utf8');
      check(/a line written in an editor/.test(after) && !/the agent changed/.test(after) && !fs.existsSync(path.join(PROJET, 'src', 'NOTES.md')), 'back to that point: the agent\'s line undone, its new file gone');
      const h3 = await qe(`return [...document.querySelectorAll('#histList .hstep')].map((s) => s.querySelector('.who').textContent)`);
      check(h3?.[0] === 'Retour en arrière' && h3.length === 3, `the restore is a step of its own: ${h3?.join(' | ')}`);
      // 5) and back again: « Revenir ici » on the agent's step
      fs.writeFileSync(REPLIES, JSON.stringify({ ...r0, lots: { 1: { status: 'done', at: new Date().toISOString() } } })); await sleep(300);
      await q.eval(`document.querySelectorAll('#histList .hstep')[1].querySelector('[data-back]').click(); return 1`); await sleep(200);
      await q.eval(`document.querySelector('#histList [data-yes]').click(); return 1`);
      await q.until(`window.__hist().n === 7`, 20000).catch(() => {}); await sleep(300);
      check(fs.readFileSync(ESSAI, 'utf8') === second && fs.readFileSync(path.join(PROJET, 'src', 'NOTES.md'), 'utf8').includes('by the agent'), 'back to the agent\'s step: its line and its file again');
      // 6) one file's change undone from its view
      await q.eval(`[...document.querySelectorAll('#histList .hf')].find((b) => /NOTES/.test(b.textContent)).click(); return 1`);
      await q.until(`document.querySelector('#histDiff').classList.contains('on')`, 10000).catch(() => {}); await sleep(200);
      await qc('#histUndo'); await qc('#histUndo');
      await q.until(`window.__hist().n === 8`, 20000).catch(() => {}); await sleep(200);
      check(!fs.existsSync(path.join(PROJET, 'src', 'NOTES.md')) && fs.readFileSync(ESSAI, 'utf8') === second && !(await qe(`return document.querySelector('#histDiff').classList.contains('on')`)), '« Annuler ce changement » (twice): that file only goes back (here: the new file goes)');
      const lg = s2.out();
      check(/historique : \d+ fichiers suivis/.test(lg) && /historique : \d+ fichier\(s\) remis comme avant/.test(lg), 'the studio\'s log says it');
    } finally { await q.close(); }
  }
  kill(s2); s2 = null;

  // ======================= a HyperFrames project: « Vérifier la composition », the long export =======================
  const { hfFor } = await import('../lib/hyperframes.mjs');
  if (!hfFor(null)) console.log('  (sauté : la vérification HyperFrames — pas de HyperFrames sur ce PC)');
  else {
    const { createProject } = await import('../lib/new-project.mjs');
    const made = createProject({ nom: 'Essai verif', format: '16:9', duree: 4, engine: 'hyperframes' }, path.join(SCR, 'hf'));
    const imp3 = importProject(made.file);
    s3 = await studio(['--project', imp3.revue], 4192);
    check(/Ouvre : http/.test(s3.out()), 'the studio of the HyperFrames project starts' + (/Ouvre : http/.test(s3.out()) ? '' : ': ' + s3.out().slice(-600)));
    const h = await launch({ port: 9358 }); await h.size(1600, 1000);
    const he = (e) => h.eval(e).catch(() => null), card = () => he(`return document.querySelector('#renderCard').innerText`);
    try {
      await h.goto('http://127.0.0.1:4192/');
      await h.until(`window.__studio && document.querySelector('#ltabs button[data-tab=lots]')`, 120000); await sleep(1500);
      await h.eval(`document.querySelector('#ltabs button[data-tab=lots]').click(); return 1`);
      await h.until(`window.__studio && document.querySelector('#renderCard .rc')`, 120000).catch(async (e) => { console.log('    (page)', JSON.stringify(await he(`return { st: !!window.__studio, card: document.querySelector('#renderCard')?.innerHTML.slice(0, 300), url: location.href }`)), h.logs.filter((l) => /error|exception/i.test(l)).slice(0, 5).join(' | '), s3.out().slice(-800)); throw e; });
      check(/Vérifier la composition/.test(await card() ?? ''), 'Envois: « Vérifier la composition » before the export');
      await h.until(`!document.querySelector('#ltabs button[data-tab=hist]').classList.contains('none')`, 20000).catch(() => {}); await sleep(300);
      check(await he(`const b = document.querySelector('#ltabs'); return b.scrollWidth <= b.clientWidth + 1 && b.classList.contains('tight')`), 'the left tabs with « Historique »: the inactive ones as icons, none cut');
      await h.eval(`document.querySelector('#hfcGo').click(); return 1`);
      await h.until(`/rien à signaler|erreur\\(s\\)/.test(document.querySelector('#renderCard').innerText)`, 120000).catch(() => {});
      const c1 = await card();
      check(/Composition vérifiée à \d\d:\d\d : rien à signaler|0 erreur\(s\)/.test(c1 ?? ''), `the blank composition checked: ${(c1 ?? '').split('\n').find((l) => /vérifiée/.test(l))}`);
      // a text out of the frame, nearly black on black: the check finds it (layout, contrast)
      const IDX = path.join(made.dir, 'index.html');
      fs.writeFileSync(IDX, fs.readFileSync(IDX, 'utf8').replace('<h1 id="title"', '<div id="trop" class="clip" data-start="1" data-duration="3" data-track-index="1" style="position:absolute;left:1500px;top:200px;width:900px;font-size:90px;color:#141414">Un texte qui déborde du cadre</div>\n      <h1 id="title"'));
      await h.until(`/Le code a changé depuis cette vérification/.test(document.querySelector('#renderCard').innerText)`, 30000).catch(() => {});
      check(/Le code a changé depuis cette vérification/.test(await card() ?? ''), 'the code changed: the check said stale');
      await h.eval(`document.querySelector('#hfcGo').click(); return 1`);
      await h.until(`document.querySelectorAll('#renderCard .hff').length >= 2`, 120000).catch(() => {});
      const c2 = await he(`return { head: document.querySelector('#renderCard .err')?.textContent ?? '', items: [...document.querySelectorAll('#renderCard .hff')].map((b) => b.innerText.replace(/\\n/g, ' | ')) }`);
      check(/[1-9]\d* erreur\(s\)/.test(c2?.head ?? '') && c2.items.some((x) => /^erreur/i.test(x) && /Text extends outside|Contrast/i.test(x)), `the findings: ${c2?.head} — ${c2?.items.slice(0, 3).join(' · ')}`);
      await h.shot(path.join(shots, 'review-tools-hfcheck.png'));
      await h.eval(`document.querySelector('#renderCard .hff').click(); return 1`); await sleep(800);
      const fr = await he(`return __studio.state().frame`);
      check(fr >= 25 && fr <= 40, `a finding clicked: the playhead at its moment (image ${fr})`);
      const d0 = await he(`return __studio.state().drafts`);
      await h.eval(`document.querySelector('#hfcNotes').click(); return 1`); await sleep(800);
      const d1 = await he(`return { n: __studio.state().drafts, txt: [...document.querySelectorAll('#draftList textarea.main')].map((t) => t.value).join(' / ') }`);
      check(d1?.n >= d0 + 2 && /hyperframes check \((layout|contrast)\)/.test(d1.txt), `« Mettre dans les modifs »: ${d1?.n - d0} notes for the agent (${(d1?.txt ?? '').slice(0, 120)}…)`);
      // the export: the code changed again → checked first; errors → asked (here: « no », nothing exported)
      fs.writeFileSync(IDX, fs.readFileSync(IDX, 'utf8').replace('Un texte qui déborde du cadre', 'Un texte qui déborde encore'));
      await h.until(`/Le code a changé depuis/.test(document.querySelector('#renderCard').innerText)`, 30000).catch(() => {});
      await h.eval(`window.__asked = []; window.confirm = (m) => { window.__asked.push(m); return false; }; document.querySelector('#ltabs button[data-tab=lots]').click(); return 1`); await sleep(300);
      await h.eval(`document.querySelector('#renderCard #rcGo').click(); return 1`);
      await h.until(`window.__asked.length >= 1`, 120000).catch(() => {}); await sleep(600);
      const asked = await he(`return window.__asked`), st = await (await fetch('http://127.0.0.1:4192/api/status')).json();
      check(asked?.length === 1 && /La vérification trouve \d+ erreur\(s\)/.test(asked[0]) && !st.export, `Exporter: checked first, its errors asked about (« ${(asked?.[0] ?? '').slice(0, 70)}… »), « non »: nothing exported`);
      // the long export: the segments already made, said by the status (renders/.hf-segments)
      const seg = path.join(made.dir, 'renders', '.hf-segments', 'abcdef0123456789');
      fs.mkdirSync(seg, { recursive: true });
      fs.writeFileSync(path.join(seg, 'segments.json'), JSON.stringify({ version: 1, planHash: 'abcdef0123456789', totalFrames: 3600, segmentFrames: 900, completed: [0, 1].map((i) => ({ index: i, startFrame: i * 900, endFrame: (i + 1) * 900, path: `seg-${i}.mp4`, bytes: 1000, completedAt: new Date().toISOString() })) }));
      const st2 = await (await fetch('http://127.0.0.1:4192/api/status')).json();
      check(st2.hfSegments?.done === 2 && st2.hfSegments.all === 4, `a long export stopped halfway: ${st2.hfSegments?.done} of ${st2.hfSegments?.all} segments kept for the next one`);
      const run = fs.readFileSync(path.join(STUDIO, 'lib', 'hf-render-run.mjs'), 'utf8');
      check(/'--resume'/.test(run) && /HF_SEGMENTED_MIN_SECONDS/.test(run), 'the export of HyperFrames: in segments from a minute, « --resume » from the ones made');
    } finally { await h.close(); }
  }
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally {
  try { await p.close(); } catch { /* closed */ }
  kill(s1); kill(s2); kill(s3);
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
