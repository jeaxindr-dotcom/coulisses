// The « connexion » mode and the eyes, on the SANDBOX: `studio-cli wait` running (the page shows « Claude surveille »),
// a batch sent from the page wakes it (prints the request), `frame --source code`, `sheet` (before = MP4, after =
// code), and the live preview reloading by itself when the code changes. Same server as tests/e2e.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { CACHE } from '../lib/place.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX = process.env.STUDIO_SANDBOX ?? path.join(STUDIO, 'sandbox', '07_Episodes');   // tests can run on their own copy
const PORT = +(process.env.STUDIO_PORT ?? 4174);
const REVUE = path.join(SANDBOX, 'E03 - The Secret Garden', 'revue');
const CLI = path.join(STUDIO, 'studio-cli.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cli = (...a) => execFileSync('node', [CLI, a[0], 'E03', ...a.slice(1), '--episodes', SANDBOX], { encoding: 'utf8' }).trim();
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };

// 1) the session starts watching
const w = spawn('node', [CLI, 'wait', 'E03', '--episodes', SANDBOX], { stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; w.stdout.on('data', (d) => { out += d; });
const exited = new Promise((r) => w.on('close', r));
const p = await launch();
try {
  await p.goto(`http://localhost:${PORT}/`);
  await p.until(`document.querySelector('#v').readyState >= 2`);
  await p.until(`document.querySelector('#agent').textContent.includes('Agent connecté')`, 15000).catch(() => {});
  const btn = await p.eval(`return document.querySelector('#agent').textContent`);
  check(/^Agent connecté · Claude Code$/.test(btn.trim()), `the button names the agent that connected itself (« ${btn.trim()} »)`);
  // 2) one note with N, text, send
  await p.eval(`document.querySelector('#v').currentTime = 3000.5/30; return 1`); await sleep(800);
  await p.key('n', 'KeyN', 'n'); await sleep(300);
  await p.type('Test connexion : la lanterne clignote'); await sleep(600);
  await p.eval(`document.activeElement.blur(); document.querySelector('#qsend').click(); return 1`);
  await p.until(`document.querySelector('#modal').style.display === 'flex'`, 60000);
  check(/Claude Code surveille l'outil : il a déjà reçu ce lot/.test(await p.eval(`return document.querySelector('#mP1').textContent`)), 'modal says the watching agent already has it');
  const upd = await p.eval(`return document.querySelector('#mUpd').textContent`);
  check(/^Mises à jour : /.test(upd) && await p.eval(`return document.querySelector('#mUpd').classList.contains('on')`), `the update check, in the send window (« ${upd.slice(0, 90)}… »)`);
  await Promise.race([exited, sleep(15000)]);
  check(/LOT \d+ REÇU/.test(out) && /Test connexion : la lanterne clignote/.test(out), 'wait woke up and printed the request');
  const lot = +(/LOT (\d+) REÇU/.exec(out)?.[1] ?? 0);
  // 3) the eyes on the code, and a before / after strip
  const t0 = Date.now();
  const f = cli('frame', '3000', '--source', 'code', '--out', path.join(STUDIO, '.cache', 'shots', 'agent-eyes-code-3000.jpg'));
  check(fs.existsSync(f), `frame --source code (${Math.round((Date.now() - t0) / 1000)} s)`);
  const L = JSON.parse(fs.readFileSync(path.join(REVUE, 'lots', String(lot).padStart(3, '0') + '.json'), 'utf8')), id = L.edits[0].id;
  const lmd = fs.readFileSync(path.join(REVUE, 'lots', String(lot).padStart(3, '0') + '.md'), 'utf8');
  check(L.agent?.name === 'Claude Code' && /## Mises à jour \(vérifiées à l'envoi\)/.test(lmd) && /Remotion : installé \d/.test(lmd) && lmd.indexOf('Mises à jour') < lmd.indexOf('## À faire'), 'the batch: its agent, and « Mises à jour » before « À faire »');
  const t1 = Date.now();
  console.log('   ' + cli('sheet', id).split('\n').join('\n   '));
  check(fs.existsSync(path.join(REVUE, 'images', `claude-${id}-apres.jpg`)), `sheet: before (MP4) / after (code) strips (${Math.round((Date.now() - t1) / 1000)} s)`);
  console.log('   ' + cli('take', String(lot)));
  console.log('   ' + cli('reply', id, 'Test : bandes avant / après jointes', '--status', 'done'));
  console.log('   ' + cli('done', String(lot), 'test connexion'));
  const rmsg = JSON.parse(fs.readFileSync(path.join(REVUE, 'replies.json'), 'utf8')).notes[id].messages.at(-1);
  check(rmsg.by === 'Claude Code', `the reply is signed by the agent (${rmsg.by})`);
  const cx = cli('updates', '--agent', 'codex');
  check(/^Mises à jour : /.test(cx) && /brambleshire-theatre/.test(cx) && /Codex/.test(cx), 'updates --agent codex: the check for another agent (its own skills, the project\'s skill)');
  await p.eval(`document.querySelector('#mClose').click(); return 1`);
  // 4) live preview: the code changes -> the preview reloads by itself at the same frame
  await p.eval(`document.querySelector('#srcCode').click(); return 1`);
  await p.until(`__studio.state().mode === 'code'`, 60000); await sleep(1500);
  const v0 = await p.eval(`return document.querySelector('#codeStatus').textContent`);
  const entry = path.join(STUDIO, 'player', 'entry.tsx');
  fs.appendFileSync(entry, '\n');   // a save in the code
  await p.until(`document.querySelector('#codeStatus').textContent !== ${JSON.stringify(v0)} && /code v/i.test(document.querySelector('#codeStatus').textContent)`, 20000).catch(() => {});
  const v1 = await p.eval(`return document.querySelector('#codeStatus').textContent`);
  fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8').replace(/\n$/, ''));
  check(v1 !== v0, `preview rebuilt and reloaded (${v0} → ${v1})`);
  check((await p.eval('return __studio.state().frame')) === 3000, 'still on the same frame after the reload');
} finally {
  w.kill(); await p.close();
  console.log(`\n${ok} ok, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
}
