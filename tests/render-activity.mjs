// Garde des rendus : réponses injectées et serveur HTTP appartenant au test sur 4190.
// Aucun studio utilisateur interrogé, aucun navigateur ni travail lourd.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const check = (value, label) => { value ? ok++ : ko++; console.log(`  ${value ? '✓' : '✗'} ${label}`); };
const reference = process.argv.indexOf('--source');
const revision = process.argv.indexOf('--revision');
let moduleUrl = pathToFileURL(path.join(ROOT, 'lib/render-activity.mjs')).href;
if (reference >= 0) moduleUrl = `data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.resolve(process.argv[reference + 1]), 'utf8')).toString('base64')}`;
else if (revision >= 0) {
  try {
    const source = execFileSync('git', ['show', `${process.argv[revision + 1]}:lib/render-activity.mjs`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  } catch {
    check(false, 'la référence doit fournir la garde des rendus');
    console.log(`\n${ok} ok, ${ko} ko`); process.exit(1);
  }
}
const { renderActivity, waitForRenderIdle } = await import(moduleUrl);
const ports = [4173];
const reply = (value, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const thrower = (error) => async () => { throw error; };
for (const kind of ['render', 'export', 'shot']) {
  const result = await renderActivity({ ports, fetcher: reply({ [kind]: { state: 'running' } }) });
  check(result.length === 1 && result[0].running.includes(kind), `${kind}.state=running interdit une préparation`);
}
{
  const result = await renderActivity({ ports, fetcher: reply({ render: { state: 'running' }, export: { state: 'running' }, shot: { state: 'running' } }) });
  check(result[0].running.length === 3, 'les trois activités sont conservées dans le diagnostic');
}
for (const status of [500, 503, 404]) {
  const result = await renderActivity({ ports, fetcher: reply(null, status) });
  check(result.length === 1 && /indisponible/.test(result[0].running[0]), `HTTP ${status} reste bloquant`);
}
{
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push([url, options]);
    return url.endsWith('/api/status') ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => ({ hub: true, installed: true }) };
  };
  const result = await renderActivity({ ports: [4170], fetcher });
  check(!result.length && requests.length === 2 && requests[1][0].endsWith('/api/ping'), 'un 404 du hub confirmé par GET /api/ping 200 est ignoré');
  check(requests.every(([, options]) => !options.method && options.signal instanceof AbortSignal), 'l’identification du hub reste passive et bornée');
}
for (const ping of [{ ok: false, status: 500, json: async () => ({ hub: true }) }, { ok: true, status: 200, json: async () => ({ hub: false }) }]) {
  const fetcher = async (url) => url.endsWith('/api/status') ? { ok: false, status: 404 } : ping;
  check((await renderActivity({ ports: [4170], fetcher })).length === 1, `un 404 sans preuve de hub reste bloquant (ping ${ping.status})`);
}
{
  let requests = 0;
  const fetcher = async () => { requests++; return { ok: false, status: 500, json: async () => ({ hub: true }) }; };
  check((await renderActivity({ ports: [4170], fetcher })).length === 1 && requests === 1, 'un statut 500 n’est jamais ignoré même si son corps prétend être un hub');
}
for (const name of ['TimeoutError', 'AbortError']) {
  const error = new Error('Délai dépassé.'); error.name = name;
  check((await renderActivity({ ports, fetcher: thrower(error) })).length === 1, `${name} reste bloquant`);
}
{
  const fetcher = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('JSON invalide.'); } });
  check((await renderActivity({ ports, fetcher })).length === 1, 'une réponse 200 dont le JSON est invalide reste bloquante');
}
for (const code of ['ECONNRESET', 'ETIMEDOUT']) {
  const error = new Error('Connexion interrompue.', { cause: { code } });
  check((await renderActivity({ ports, fetcher: thrower(error) })).length === 1, `${code} ne prouve pas que le port est fermé`);
}
for (const error of [Object.assign(new Error('Connexion refusée.'), { code: 'ECONNREFUSED' }), new Error('Connexion refusée.', { cause: { code: 'ECONNREFUSED' } })]) {
  check((await renderActivity({ ports, fetcher: thrower(error) })).length === 0, 'un refus explicite de connexion indique un port fermé');
}
{
  const result = await renderActivity({ ports, fetcher: reply({ render: { state: 'done' }, export: { state: 'idle' }, shot: { state: 'error' } }) });
  check(!result.length, 'des états terminés ou inactifs n’interdisent pas une préparation');
}
{
  const requests = [];
  await renderActivity({ fetcher: async (...args) => { requests.push(args); return { ok: true, json: async () => ({}) }; } });
  check(requests.length === 30 && requests[0][0] === 'http://127.0.0.1:4170/api/status' && requests.at(-1)[0] === 'http://127.0.0.1:4199/api/status', 'la garde couvre tous les ports 4170 à 4199');
  check(requests.every(([, options]) => !options.method && options.signal instanceof AbortSignal), 'la garde utilise seulement GET avec un délai borné');
}
{
  const controller = new AbortController();
  let notified = false, failed = false;
  try {
    await waitForRenderIdle({ ports, signal: controller.signal, interval: 1,
      fetcher: async () => { controller.abort(new Error('Arrêt demandé.')); return { ok: true, json: async () => ({ render: { state: 'running' } }) }; },
      onWait: () => { notified = true; } });
  } catch { failed = true; }
  check(failed && !notified, 'un arrêt reçu pendant la requête est pris en compte avant toute nouvelle attente');
}
{
  let mode = 'idle', requests = 0;
  const methods = [];
  const server = http.createServer((req, res) => {
    requests++; methods.push(req.method);
    if (mode === 'timeout') return;
    if (mode === 'large') { res.writeHead(200); res.end(JSON.stringify({ data: 'x'.repeat(1024 * 1024 + 10) })); return; }
    res.writeHead(mode === 'failed' ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ render: { state: mode === 'render' ? 'running' : 'idle' }, export: { state: mode === 'export' ? 'running' : 'idle' } }));
  });
  let bound = false;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(4190, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
    bound = true;
    let blocked = false;
    try { await fetch('http://127.0.0.1:4190/api/status'); } catch (error) { blocked = error?.cause?.message === 'bad port'; }
    check(blocked && requests === 0, 'preuve initiale : fetch refuse 4190 avant d’atteindre notre serveur');
    let result = await renderActivity({ ports: [4190] });
    check(!result.length && requests === 1, 'le GET HTTP natif atteint 4190 et reconnaît le studio inactif');
    for (const kind of ['render', 'export']) {
      mode = kind; result = await renderActivity({ ports: [4190] });
      check(result.length === 1 && result[0].running.includes(kind), `le vrai GET sur 4190 détecte ${kind}.state=running`);
    }
    mode = 'failed'; result = await renderActivity({ ports: [4190] });
    check(result.length === 1 && /HTTP 503/.test(result[0].running[0]), 'le transport natif conserve les erreurs HTTP comme blocage');
    mode = 'large'; result = await renderActivity({ ports: [4190] });
    check(result.length === 1 && /indisponible/.test(result[0].running[0]), 'une réponse réelle dépassant un Mio est interrompue et bloquante');
    mode = 'timeout'; result = await renderActivity({ ports: [4190], timeout: 25 });
    check(result.length === 1, 'un vrai GET sans réponse est interrompu par AbortSignal.timeout');
    check(requests === 6 && methods.every((method) => method === 'GET'), 'les six échanges du test utilisent uniquement GET');
  } catch (error) {
    check(false, `serveur de test 4190 indisponible : ${error.message}`);
  } finally {
    if (bound) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exitCode = ko ? 1 : 0;
