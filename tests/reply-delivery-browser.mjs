// Parcours réel d'une réponse : carte sans agent, reconnexion, accusé, nouvelle attente.
// Tout est créé sous .cache ; ni Chrome utilisateur, ni studio réel, ni moteur réel.
import fs from 'node:fs';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {freePort} from './where.mjs';
import {launch, requireSandbox} from './cdp.mjs';
import {waitForRenderIdle} from '../lib/render-activity.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCR = path.join(ROOT, '.cache', 'reply-delivery-browser');
fs.mkdirSync(SCR, {recursive: true});
const RUN = fs.mkdtempSync(path.join(SCR, 'essai-'));
Object.assign(process.env, {COULISSES_LANG: 'fr', COULISSES_SETTINGS: path.join(RUN, 'settings.json'),
  COULISSES_MEDIAS: path.join(RUN, 'medias'), STUDIO_PROJECTS: path.join(RUN, 'projets.json'),
  COULISSES_HISTORY_DIR: path.join(RUN, 'historique'), STUDIO_AGENT: 'codex'});
fs.writeFileSync(process.env.COULISSES_SETTINGS, JSON.stringify({mediasAutoSort: false}));
const {importProject} = await import('../lib/projects.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0, server = null, page = null, serverOutput = '';
const waits = new Set(), results = [];
const check = (condition, message) => {results.push({ok: !!condition, message}); condition ? ok++ : ko++; console.log(`${condition ? '✓' : '✗'} ${message}`);};
const stop = (child) => {if (child?.pid && child.exitCode === null) try {execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {stdio: 'ignore', windowsHide: true});} catch {}};
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const selector = '.card[data-id="note27"]';
let REVUE, NOTES, BASE;
function waitCLI(timeout = 15) {
  const child = spawn(process.execPath, [path.join(ROOT, 'studio-cli.mjs'), 'wait', REVUE, '--agent', 'codex', '--timeout', String(timeout)],
    {cwd: ROOT, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  waits.add(child); let out = '', err = '';
  child.stdout.on('data', (d) => {out += d;}); child.stderr.on('data', (d) => {err += d;});
  const done = new Promise((resolve) => child.on('close', (code) => {waits.delete(child); resolve({code, out, err});}));
  return {child, done};
}
function acknowledge(output) {
  const id = /LIVRAISON RÉPONSES ([a-f0-9-]+)/.exec(output)?.[1];
  if (!id) throw new Error('La livraison ne contient pas son identifiant d’accusé');
  const manifest = path.join(REVUE, 'user-reply-deliveries', id + '.md');
  const content = fs.readFileSync(manifest, 'utf8'); // Simule la lecture explicite par l’agent, avant son accusé.
  const result = execFileSync(process.execPath, [path.join(ROOT, 'studio-cli.mjs'), 'ack-replies', REVUE, id, '--agent', 'codex'],
    {cwd: ROOT, env: process.env, encoding: 'utf8', windowsHide: true});
  return {id, manifest, content, result};
}
async function api(endpoint, options) {
  const response = await fetch(BASE + endpoint, options);
  return {code: response.status, body: await response.json().catch(() => null)};
}
const put = (body) => api('/api/notes', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
async function openPage() {
  await page.goto(BASE + '/');
  await page.until(`document.querySelector('${selector} textarea.rep')`);
  await page.eval(`document.querySelector('[data-tab="notes"]').click(); return true;`);
}
async function sendReply(text, image = false) {
  await page.eval(`const field = document.querySelector('${selector} textarea.rep'); field.focus(); field.value = ${JSON.stringify(text)}; field.dispatchEvent(new Event('input', {bubbles:true})); return true;`);
  if (image) {
    await page.eval(`const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='), c => c.charCodeAt(0)); const data = new DataTransfer(); data.items.add(new File([bytes], 'preuve.png', {type:'image/png'})); document.querySelector('${selector} textarea.rep').dispatchEvent(new ClipboardEvent('paste', {bubbles:true, clipboardData:data})); return true;`);
    await page.until(`document.querySelectorAll('${selector} .repimgs img').length === 1`);
  }
  await page.eval(`document.querySelector('${selector} .repbox .send').click(); return true;`);
  await page.until(`document.querySelector('${selector} .msg.user:last-child')?.textContent.includes(${JSON.stringify(text)})`);
}
try {
  await waitForRenderIdle();
  const clip = path.join(RUN, 'Clip'); fs.mkdirSync(clip);
  const video = path.join(clip, 'Clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x406080:s=320x180:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], {windowsHide: true});
  REVUE = importProject(video).revue; NOTES = path.join(REVUE, 'notes.json');
  const old = '2026-10-25T13:32:48Z';
  const note = {id: 'note27', frame: 30, end: null, text: 'La lettre reste visible', thread: [], images: [], status: 'open',
    created: old, updated: old, draft: false, lot: 4, sentAt: old, source: 'video'};
  write(NOTES, {notes: [note]});
  write(path.join(REVUE, 'replies.json'), {notes: {note27: {status: 'done', statusAt: old, messages: [{text: 'Première correction faite', at: old, images: [], by: 'Codex'}]}}, lots: {4: {status: 'done', at: old}}});
  fs.mkdirSync(path.join(REVUE, 'lots'), {recursive: true});
  write(path.join(REVUE, 'lots', '004.json'), {lot: 4, sentAt: old, fps: 30, edits: [{...note, k: 27, captures: {}, time: 1}]});
  write(path.join(REVUE, 'studio-agent.json'), {waiting: false, since: old, beat: old, lastLot: 4, agent: {id: 'codex', name: 'Codex'}});
  const port = await freePort(4208); BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(ROOT, 'studio-server.mjs'), '--project', REVUE, '--no-open', '--port', String(port)],
    {cwd: ROOT, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  server.stdout.on('data', (d) => {serverOutput += d;}); server.stderr.on('data', (d) => {serverOutput += d;});
  for (let i = 0; i < 200 && !/Ouvre : http/.test(serverOutput); i++) await sleep(150);
  if (!serverOutput.includes(BASE)) throw new Error(`Le serveur de test n'est pas sur le port réservé : ${serverOutput}`);
  await requireSandbox(BASE, RUN);
  page = await launch({port: await freePort(9339), autoplay: 'tab'});
  await openPage();
  await sendReply('Toujours visible, voici la preuve', true);
  await page.until(`document.querySelector('#modal').style.display === 'flex'`);
  const modal = await page.eval(`return {text: document.querySelector('#mP1').textContent, line: document.querySelector('#mLine').textContent, copy: !document.querySelector('#mCopy').disabled};`);
  check(/Aucun agent ne surveille Coulisses/.test(modal.text) && /reconnexion/.test(modal.text), 'Sans agent, le message explique que la réponse attend sa reconnexion');
  check(modal.line.includes('connexion') && modal.line.includes(REVUE) && modal.copy, 'La fenêtre fournit la bonne ligne de connexion et son bouton Copier');
  const saved = (await api('/api/notes')).body.notes[0].thread[0];
  check(!!saved.id && saved.images.length === 1 && fs.existsSync(path.join(REVUE, saved.images[0].file)), 'La réponse et son image sont enregistrées avec un identifiant stable');
  check(fs.existsSync(path.join(REVUE, 'user-replies.json')) && json(path.join(REVUE, 'user-replies.json')).entries.some((e) => e.key === saved.id && !e.seenAt), 'La file durable contient la réponse non vue avant toute reconnexion');
  check(await page.eval(`return document.querySelector('${selector} .reply-delivery.unseen')?.textContent === 'Non vue par l’agent';`), 'La carte montre Non vue par l’agent');
  await openPage();
  check(await page.eval(`return !!document.querySelector('${selector} .reply-delivery.unseen');`), 'Le rechargement de la page conserve l’état non vu');
  // Un battement récent n'est pas un accusé de réception.
  write(path.join(REVUE, 'studio-agent.json'), {waiting: true, since: old, beat: new Date().toISOString(), agent: {id: 'codex', name: 'Codex'}});
  const beatReceipt = (await api('/api/replies')).body.userReplies?.note27?.[saved.id];
  check(!beatReceipt?.seenAt, 'Un battement récent ne transforme pas une réponse en réponse vue');
  const first = await waitCLI().done;
  check(first.code === 0 && first.out.includes('RÉPONSES UTILISATEUR REÇUES') && first.out.includes(saved.text), 'La reconnexion reçoit la réponse de l’ancien lot terminé');
  check(first.out.includes(path.join(REVUE, saved.images[0].file)), 'La sortie de wait donne le chemin absolu de l’image jointe');
  const notAcknowledged = (await api('/api/replies')).body.userReplies?.note27?.[saved.id];
  check(!notAcknowledged?.seenAt && await page.eval(`return !!document.querySelector('${selector} .reply-delivery.unseen');`), 'Une sortie de wait sans accusé explicite laisse la réponse Non vue');
  const retry = await waitCLI().done;
  check(retry.code === 0 && retry.out.includes(saved.text), 'Une reconnexion sans accusé relivre la réponse au lieu de la perdre');
  const firstAcknowledgement = acknowledge(retry.out);
  check(firstAcknowledgement.content.includes(saved.text) && firstAcknowledgement.content.includes(path.join(REVUE, saved.images[0].file)), 'Le manifeste durable permet de lire le texte et l’image avant d’accuser réception');
  const receipt = (await api('/api/replies')).body.userReplies?.note27?.[saved.id];
  check(!!receipt?.seenAt && receipt.agent?.id === 'codex', 'L’accusé explicite persistant nomme l’agent ayant confirmé la réception');
  await page.until(`!!document.querySelector('${selector} .reply-delivery.seen')`, 12000);
  check(await page.eval(`return document.querySelector('${selector} .reply-delivery.seen').title.includes('confirmé avoir reçu');`), 'La carte actualise Vue par l’agent et précise la portée de cet accusé');
  // Après la livraison, aucune autre session n'est créée : seulement notre nouveau wait.
  const secondWait = waitCLI();
  for (let i = 0; i < 50 && !(await api('/api/status')).body.agent?.watching; i++) await sleep(100);
  const start = Date.now();
  await sendReply('Deuxième précision pendant la surveillance');
  const second = await secondWait.done;
  check(second.code === 0 && second.out.includes('Deuxième précision pendant la surveillance') && Date.now() - start < 7000, 'Une réponse pendant wait le réveille sans envoyer de nouveau lot');
  check(!second.out.includes('Toujours visible, voici la preuve'), 'La réponse déjà acquittée n’est pas livrée à nouveau');
  const secondMessage = (await api('/api/notes')).body.notes[0].thread.at(-1);
  check(!(await api('/api/replies')).body.userReplies?.note27?.[secondMessage.id]?.seenAt, 'La seconde livraison attend également son accusé explicite');
  acknowledge(second.out);
  check(!!(await api('/api/replies')).body.userReplies?.note27?.[secondMessage.id]?.seenAt, 'L’accusé de la seconde livraison valide uniquement cette réponse');
  // Le stockage durable précède toute réponse HTTP positive ; une file corrompue refuse l’écriture.
  const ledger = path.join(REVUE, 'user-replies.json'), ledgerGood = fs.readFileSync(ledger), notesGood = fs.readFileSync(NOTES);
  fs.writeFileSync(ledger, '{"version":1,"entries":[');
  const current = (await api('/api/notes')).body;
  const refused = await put({...current, notes: current.notes.map((n) => ({...n, thread: [...n.thread, {id: 'refusee', text: 'Ne pas perdre', at: new Date().toISOString(), images: []}]}))});
  const brokenGet = await api('/api/replies');
  check(refused.code >= 400 && Buffer.compare(notesGood, fs.readFileSync(NOTES)) === 0, 'Une file illisible refuse la sauvegarde sans écraser les notes');
  check(brokenGet.code === 503, 'Une file illisible est signalée en HTTP 503, sans faux accusés');
  fs.writeFileSync(ledger, ledgerGood);
  // Réponse durable puis retrait de sa note : sa prochaine remise demeure possible.
  const before = (await api('/api/notes')).body;
  const queued = {id: 'archivee', text: 'Précision préservée après retrait de la carte', at: new Date().toISOString(), images: []};
  const archived = await put({...before, notes: before.notes.map((n) => ({...n, thread: [...n.thread, queued]}))});
  const after = (await api('/api/notes')).body;
  const removed = await put({...after, notes: []});
  const third = await waitCLI().done;
  check(archived.code === 200 && removed.code === 200 && third.code === 0 && third.out.includes(queued.text), 'Le retrait de la note ne détruit pas une réponse en attente');
  check(third.out.includes('ne pas la recréer'), 'La remise avertit de ne pas recréer aveuglément une note retirée');
  await page.shot(path.join(RUN, 'reponses.png'));
} catch (e) {ko++; results.push({ok: false, message: e.stack}); console.log(`✗ ERREUR ${e.stack}`);}
finally {
  for (const child of waits) stop(child);
  await page?.close(); stop(server);
  fs.writeFileSync(path.join(RUN, 'server.log'), serverOutput);
  write(path.join(RUN, 'resultat.json'), {ok, ko, results});
  fs.writeFileSync(path.join(SCR, 'dernier.txt'), RUN);
  console.log(`Preuves : ${RUN}`); console.log(`${ok} ok, ${ko} ko`);
  process.exitCode = ko ? 1 : 0;
}
