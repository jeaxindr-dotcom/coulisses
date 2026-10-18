// The user's notes, settings and the agent's answers never lost (code review 18/10/2026), on a test project only:
//   1. notes.json unreadable (cut short by another tool, edited by hand): the studio says so (503) and never gives « no
//      notes »; a save that comes anyway keeps the unreadable file first (notes.illisible-<date>.json); a BOM is read;
//   2. each save carries the file's revision: one made on an older one (a second tab) is refused (409) with the notes as
//      they are now; a save that drops 3 notes or more keeps the notes before it (revue/sauvegardes/); notes.bak.json
//      is not made again at every save (it is the state of at least 10 minutes ago);
//   3. settings.json unreadable at the moment of a change: nothing written over it (it lost every setting but the one
//      written); read again as soon as it is readable;
//   4. two `studio-cli reply` at once (the agent runs several shells): both answers kept (replies.json under a lock).
// usage: node tests/notes-safety.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freePort } from './where.mjs';

process.env.COULISSES_LANG = 'fr';
const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'notes-safety-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(path.join(SCR, 'Clip'), { recursive: true });
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json');
process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json');
process.env.COULISSES_MEDIAS = path.join(SCR, 'medias');
const { importProject } = await import('../lib/projects.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const kill = (c) => { if (c) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
const note = (id, text) => ({ id, frame: 10, end: null, text, images: [], thread: [], status: 'open', created: new Date().toISOString(), updated: new Date().toISOString(), draft: true });

let st = null;
try {
  const VID = path.join(SCR, 'Clip', 'Clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x406080:s=640x360:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', VID]);
  const imp = importProject(VID), NOTES = path.join(imp.revue, 'notes.json');
  const port = await freePort(4191);
  st = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', imp.revue, '--no-open', '--port', String(port)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; st.stdout.on('data', (d) => { out += d; }); st.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 200 && !/Ouvre : http/.test(out); i++) await sleep(150);
  const U = `http://127.0.0.1:${port}`;
  const get = async () => { const r = await fetch(`${U}/api/notes`); return { code: r.status, body: await r.json().catch(() => null) }; };
  const put = async (data) => { const r = await fetch(`${U}/api/notes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return { code: r.status, body: await r.json().catch(() => null) }; };

  // ---------- 2. revisions, backups ----------
  console.log('les révisions et les sauvegardes');
  const five = ['a', 'b', 'c', 'd', 'e'].map((x) => note(x, `note ${x}`));
  const p1 = await put({ notes: five });
  const g1 = await get();
  check(p1.code === 200 && p1.body?.rev && g1.body?.rev === p1.body.rev && g1.body.notes.length === 5, `a save answers the file's revision, the read gives it too (${p1.body?.rev})`);
  const p2 = await put({ notes: [...five, note('f', 'note f')], rev: g1.body.rev });
  const stale = await put({ notes: five.slice(0, 1), rev: g1.body.rev });   // a second tab, still on the first revision
  check(p2.code === 200 && stale.code === 409 && stale.body?.conflict && stale.body.current?.notes?.length === 6 && JSON.parse(fs.readFileSync(NOTES, 'utf8')).notes.length === 6,
    `a save on an older revision (another tab): refused (409) with the notes as they are now, the file untouched (${stale.code})`);
  const bak = NOTES.replace(/\.json$/, '.bak.json'), bak1 = fs.existsSync(bak) ? fs.statSync(bak).mtimeMs : 0;
  const p3 = await put({ notes: five.slice(0, 2), rev: p2.body.rev });   // 6 → 2: four at once
  const saved = fs.existsSync(path.join(imp.revue, 'sauvegardes')) ? fs.readdirSync(path.join(imp.revue, 'sauvegardes')) : [];
  const kept = saved.length ? JSON.parse(fs.readFileSync(path.join(imp.revue, 'sauvegardes', saved[0]), 'utf8')).notes.length : 0;
  check(p3.code === 200 && saved.length === 1 && /avant-4-en-moins/.test(saved[0]) && kept === 6, `four notes gone at once: the notes before kept (sauvegardes\\${saved[0] ?? '—'}, ${kept} notes)`);
  check(fs.existsSync(bak) && fs.statSync(bak).mtimeMs === bak1, 'notes.bak.json not made again at every save (the state of before, not of 0.4 s ago)');

  // ---------- 1. unreadable ----------
  console.log('un notes.json illisible');
  fs.writeFileSync(NOTES, '{"episode":"x","notes":[{"id":"a","text":"coup');   // cut short
  const g2 = await get();
  check(g2.code === 503 && g2.body?.error === 'unreadable', `read: an error (${g2.code}), never « no notes »`);
  const p4 = await put({ notes: [note('z', 'saved anyway')] });
  const ill = fs.readdirSync(imp.revue).filter((f) => /^notes\.illisible-.*\.json$/.test(f));
  check(p4.code === 200 && ill.length === 1 && fs.readFileSync(path.join(imp.revue, ill[0]), 'utf8').includes('"coup'), `a save over it keeps it first (${ill[0] ?? '—'})`);
  fs.writeFileSync(NOTES, '\uFEFF' + JSON.stringify({ notes: five }));   // a BOM, as Windows PowerShell 5 writes
  const g3 = await get();
  check(g3.code === 200 && g3.body?.notes?.length === 5, 'a notes.json with a BOM: read');

  // ---------- 4. two answers at once ----------
  console.log('deux réponses en même temps');
  const cli = (...a) => new Promise((r) => { const c = spawn(process.execPath, [path.join(STUDIO, 'studio-cli.mjs'), ...a], { cwd: STUDIO, env: process.env, stdio: 'ignore' }); c.on('exit', r); });
  const codes = await Promise.all([1, 2, 3, 4].map((k) => cli('reply', imp.revue, 'a', `réponse ${k}`, '--no-images')));
  const msgs = JSON.parse(fs.readFileSync(path.join(imp.revue, 'replies.json'), 'utf8')).notes?.a?.messages ?? [];
  check(codes.every((c) => c === 0) && msgs.length === 4 && !fs.existsSync(path.join(imp.revue, 'replies.json.lock')), `four replies at once: all four kept (${msgs.map((m) => m.text).join(' · ')})`);
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally { kill(st); }

// ---------- 3. settings ----------
console.log('les réglages');
{
  const F = process.env.COULISSES_SETTINGS;
  fs.writeFileSync(F, JSON.stringify({ lang: 'fr', shortcuts: { modeRotate: ['T'] }, mediasAutoSort: false }));
  const I = await import('../lib/i18n.mjs');
  const full = I.readSettings();
  fs.writeFileSync(F, '{"lang":"fr","shortcuts":');   // cut short (another process writing it)
  await sleep(450);
  const during = I.readSettings();
  let threw = false; try { I.writeSettings({ projectsRoot: 'C:\\x' }); } catch { threw = true; }
  const after = fs.readFileSync(F, 'utf8');
  check(full.shortcuts?.modeRotate?.[0] === 'T' && threw && after === '{"lang":"fr","shortcuts":', 'a change while settings.json cannot be read: nothing written over it');
  check(during.shortcuts?.modeRotate?.[0] === 'T', 'a failed read keeps the settings it had (not « none »)');
  fs.writeFileSync(F, JSON.stringify({ lang: 'fr', shortcuts: { modeRotate: ['T'] }, mediasAutoSort: false }));
  I.writeSettings({ projectsRoot: 'C:\\y' });
  const back = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(back.projectsRoot === 'C:\\y' && back.shortcuts?.modeRotate?.[0] === 'T' && back.mediasAutoSort === false, 'readable again: the change written, every other setting kept');
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
