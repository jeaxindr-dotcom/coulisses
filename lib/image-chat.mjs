// The image chat of the « Médias » tab, and the agent that sorts the library. Each message goes to Codex CLI
// (`codex exec`, its built-in image_gen tool: no API key, the user's ChatGPT account), whoever the review's agent is
// (user's choice, 08/10/2026: « claude ou codex, peu importe, les deux passeront par codex CLI avec imagegen »).
//
//   codex exec --json --ignore-user-config --skip-git-repo-check -s read-only -C <library> -m <model>
//              --output-schema <schema> -o <answer.json> [-i <attached image>]…   (the request on stdin)
//
// Codex writes nothing: read-only sandbox, and the prompt says no command. It saves what image_gen makes in
// $CODEX_HOME\generated_images\<thread id>\ (the id is the first JSON event); Coulisses copies those images into the
// library, with the name, category, tags and description of Codex's answer (--output-schema). A follow-up (« plus
// grand », « la même de dos ») goes with the images of the previous answer, unless the user picked others.
// The user config is not loaded (--ignore-user-config): no plugin, MCP server nor notify hook for a simple image job,
// and the model is chosen here (imageModel: the account's models, Codex's own cache). One job at a time per library.
// The conversation: _coulisses\chat.json; each job's events and answer: _coulisses\travaux\.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { listMedias, addMedia, updateMedia, mediaFile, CATEGORIES, INBOX } from './medias.mjs';
import { t, tr, lang, readSettings } from './i18n.mjs';

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
export const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const q = (s) => JSON.stringify(String(s ?? ''));   // the user's words: data, never instructions

// ---------- Codex CLI ----------
let found = { at: 0, v: null };
// { cmd, pre }: the native codex.exe, or node + codex.js of an npm install; COULISSES_CODEX = another program (tests)
export function resolveCodex() {
  const env = process.env.COULISSES_CODEX;
  if (env) return /\.(m?js|cjs)$/i.test(env) ? { cmd: process.execPath, pre: [env] } : { cmd: env, pre: [] };
  if (Date.now() - found.at < 60000) return found.v;
  let v = null;
  try {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['codex'], { encoding: 'utf8', windowsHide: true, timeout: 4000 });
    const all = (r.stdout ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const exe = all.find((f) => /\.exe$/i.test(f)) ?? (process.platform !== 'win32' ? all[0] : null);
    if (exe) v = { cmd: exe, pre: [] };
    else for (const shim of all.filter((f) => /\.cmd$/i.test(f))) {
      const js = path.join(path.dirname(shim), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (fs.existsSync(js)) { v = { cmd: process.execPath, pre: [js] }; break; }
    }
  } catch { /* below */ }
  const app = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
  if (!v && process.env.LOCALAPPDATA && fs.existsSync(app)) v = { cmd: app, pre: [] };
  found = { at: Date.now(), v };
  return v;
}
// can the chat run? { ok, why }
export function chatAvailable() {
  if (!resolveCodex()) return { ok: false, why: t('md.why.noCodex') };
  if (!process.env.COULISSES_CODEX && !process.env.OPENAI_API_KEY && !fs.existsSync(path.join(codexHome(), 'auth.json'))) return { ok: false, why: t('md.why.noLogin') };
  return { ok: true, why: null };
}
// the model: settings.json imageModel (or COULISSES_IMAGE_MODEL), else Codex's own model if the account has it, else
// one the account has. Codex's list may name a model its command line refuses (gpt-6.1-sol, 08/10/2026: listed by the
// Codex app, « not supported when using Codex with a ChatGPT account » in codex exec): such a model is put aside for the
// life of this server, and the run starts again at once with the next one (run(), below).
const refused = new Set();
const chosenModel = () => process.env.COULISSES_IMAGE_MODEL || readSettings().imageModel || null;
export function imageModel() {
  const s = chosenModel();
  if (s) return s;
  return modelCandidates().find((m) => !refused.has(m)) ?? null;   // none left: Codex's own default
}
function modelCandidates() {
  let known = [];
  try { const j = JSON.parse(fs.readFileSync(path.join(codexHome(), 'models_cache.json'), 'utf8')); known = (j.models ?? j.data ?? []).map((m) => m.slug ?? m.id).filter(Boolean); } catch { /* none */ }
  let conf = null;
  try { conf = /^\s*model\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(codexHome(), 'config.toml'), 'utf8'))?.[1] ?? null; } catch { /* none */ }
  const usable = known.filter((m) => !/review/.test(m));
  return [...new Set([...(conf && known.includes(conf) ? [conf] : []), ...['gpt-6-sol', 'gpt-5.6-sol', 'gpt-5.5'].filter((m) => known.includes(m)), ...usable, ...(conf ? [conf] : [])])];
}
const MODEL_REFUSED = /not supported when using Codex with a ChatGPT account|model .* (?:not found|does not exist)|Model metadata .* not found|unknown model/i;

// ---------- the answers Codex must give (--output-schema: every field required, nothing else) ----------
const STR = { type: 'string' }, TAGS = { type: 'array', items: STR };
const CAT = { type: 'string', enum: CATEGORIES };
export const CHAT_SCHEMA = { type: 'object', additionalProperties: false, required: ['message', 'images'], properties: {
  message: STR,
  images: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['fichier', 'nom', 'categorie', 'tags', 'description', 'transparent', 'retouche_de'],
    properties: { fichier: STR, nom: STR, categorie: CAT, tags: TAGS, description: STR, transparent: { type: 'boolean' }, retouche_de: { type: 'integer' } } } } } };
export const SORT_SCHEMA = { type: 'object', additionalProperties: false, required: ['images'], properties: {
  images: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index', 'nom', 'categorie', 'tags', 'description', 'transparent'],
    properties: { index: { type: 'integer' }, nom: STR, categorie: CAT, tags: TAGS, description: STR, transparent: { type: 'boolean' } } } } } };

// ---------- the conversation ----------
export function readChat(L) {
  try { const j = JSON.parse(fs.readFileSync(L.chat, 'utf8')); if (Array.isArray(j.messages)) return j; } catch { /* none yet */ }
  return { messages: [] };
}
function writeChat(L, j) {
  fs.mkdirSync(path.dirname(L.chat), { recursive: true });
  j.messages = j.messages.slice(-300);
  const tmp = `${L.chat}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(j, null, 1));
  fs.renameSync(tmp, L.chat);
}
const say = (L, m) => { const j = readChat(L); j.messages.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: nowIso(), ...m }); writeChat(L, j); };
// « Nouvelle conversation »: the old one is kept next to it (chat-<date>.json)
export function newChat(L) {
  if (fs.existsSync(L.chat)) fs.renameSync(L.chat, L.chat.replace(/\.json$/, `-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`));
  return readChat(L);
}

// ---------- the prompts (in the user's language) ----------
const catLine = () => CATEGORIES.join(' | ');
function chatPrompt(L, { text, refs, auto, transparent, project, items, history }, l = lang()) {
  const T = tr(l), o = [];
  o.push(T('md.p.role', { channel: L.channel, project: project?.title ? T('md.p.project', { title: project.title }) : '' }));
  o.push(T('md.p.rules'));
  o.push(transparent ? T('md.p.transparent') : T('md.p.background'));
  if (project?.format) o.push(T('md.p.format', { format: project.format }));
  if (refs.length) {
    o.push(''); o.push(T(auto ? 'md.p.refsAuto' : 'md.p.refsPicked'));
    refs.forEach((it, i) => o.push(T('md.p.ref', { k: i + 1, name: q(it.nom), cat: it.categorie, desc: it.description ? ` — ${it.description}` : '' })));
  }
  const names = items.filter((it) => it.categorie !== INBOX).slice(0, 60).map((it) => `${q(it.nom)} (${it.categorie})`);
  if (names.length) { o.push(''); o.push(T('md.p.library')); o.push(names.join(' · ')); }
  if (history.length) {
    o.push(''); o.push(T('md.p.history'));
    for (const m of history) o.push(`${m.role === 'user' ? T('md.p.you') : T('md.p.me')} ${q(m.text)}${m.images?.length ? T('md.p.made', { n: m.images.length }) : ''}`);
  }
  o.push(''); o.push(T('md.p.ask', { text: q(text) }));
  o.push(''); o.push(T('md.p.answer', { cats: catLine(T) }));
  return o.join('\n');
}
function sortPrompt(L, items, l = lang()) {
  const T = tr(l), o = [T('md.p.sortRole', { channel: L.channel, n: items.length, cats: catLine(T) })];
  items.forEach((it, i) => o.push(T('md.p.sortItem', { k: i + 1, file: q(path.basename(it.fichier)), name: q(it.nom) })));
  return o.join('\n');
}

// ---------- the jobs ----------
const JOBS = new Map();   // library folder -> { job, child, next }
const slot = (L) => { const k = L.dir.toLowerCase(); if (!JOBS.has(k)) JOBS.set(k, { job: null, child: null, sortAfter: false }); return JOBS.get(k); };
const pub = (j) => (j ? { id: j.id, kind: j.kind, state: j.state, started: j.started, ended: j.ended ?? null, step: j.step ?? null, error: j.error ?? null, model: j.model ?? null } : null);
export const jobOf = (L) => pub(slot(L).job);
export const busy = (L) => slot(L).job?.state === 'running';

// the readable reason of a failed run: the API's own message inside Codex's error event, else the last line it printed
function reason(job, stderr) {
  let m = job.failure ?? '';
  try { const x = JSON.parse(m); m = x?.error?.message ?? x?.message ?? m; } catch { /* plain text */ }
  if (MODEL_REFUSED.test(m)) return t('md.err.model', { model: job.model ?? '?', msg: m });
  if (/usage limit|rate limit|quota/i.test(m)) return t('md.err.quota', { msg: m });
  if (/401|unauthori[sz]ed|log ?in|not logged/i.test(m)) return t('md.err.login', { msg: m });
  if (m) return m;
  const last = stderr.split(/\r?\n/).filter((s) => s.trim() && !/\bWARN\b/.test(s) && !/Reading (additional input|prompt) from stdin/.test(s)).pop();
  return last ? last.slice(0, 400) : t('md.err.exit', { code: job.code ?? '?' });
}

function run(L, opts) {
  const { kind, prompt, images = [], schema, timeoutMs, onDone, log = () => {} } = opts;
  const s = slot(L), codex = resolveCodex();
  if (!codex) throw new Error(t('md.why.noCodex'));
  fs.mkdirSync(L.jobs, { recursive: true });
  const id = `${kind}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
  const schemaFile = path.join(L.jobs, `${kind}-schema.json`), answer = path.join(L.jobs, `${id}.json`), events = path.join(L.jobs, `${id}.jsonl`);
  fs.writeFileSync(schemaFile, JSON.stringify(schema));
  fs.writeFileSync(path.join(L.jobs, `${id}.prompt.txt`), prompt);
  const model = imageModel();
  const args = ['exec', '--json', '--ignore-user-config', '--skip-git-repo-check', '-s', 'read-only', '-C', L.dir,
    ...(model ? ['-m', model] : []), '-c', 'model_reasoning_effort="low"', '--output-schema', schemaFile, '-o', answer, ...images.flatMap((f) => ['-i', f])];
  const job = { id, kind, state: 'running', started: nowIso(), t0: Date.now(), step: null, thread: null, model, answer };
  s.job = job;
  const child = spawn(codex.cmd, [...codex.pre, ...args], { cwd: L.dir, env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  s.child = child;
  log(t('md.log.start', { kind, channel: L.channel, model: model ?? '?', n: images.length }));
  const ev = fs.createWriteStream(events);
  let buf = '', stderr = '';
  child.stdout.on('data', (d) => {
    ev.write(d); buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.type === 'thread.started') job.thread = e.thread_id;
      else if (e.type === 'item.completed' && e.item?.type === 'agent_message' && e.item.text && !/^\s*\{/.test(e.item.text)) job.step = e.item.text.slice(0, 300);
      else if (e.type === 'turn.failed') job.failure = e.error?.message ?? 'turn.failed';
      else if (e.type === 'error') job.failure ??= e.message;
    }
  });
  child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-8000); });
  child.stdin.on('error', () => { /* it died before reading */ });
  child.stdin.end(prompt, 'utf8');
  const timer = setTimeout(() => { job.failure = t('md.err.timeout', { min: Math.round(timeoutMs / 60000) }); kill(child); }, timeoutMs);
  let finished = false;
  child.on('error', (e) => { job.failure = e.message; if (!child.pid) finish(-1); });   // it could not even start
  child.on('close', (code) => finish(code));
  async function finish(code) {
    if (finished) return; finished = true;
    clearTimeout(timer); ev.end(); s.child = null; job.code = code; job.ended = nowIso();
    if (job.stopped) { job.state = 'stopped'; }
    else {
      let res = null;
      try { res = JSON.parse(fs.readFileSync(answer, 'utf8')); } catch { /* no answer */ }
      if (code === 0 && res) {
        try { await onDone(res, job); job.state = 'done'; } catch (e) { job.state = 'failed'; job.error = e.message; }
      } else if (!chosenModel() && model && MODEL_REFUSED.test(job.failure ?? '') && (opts.tries ?? 0) < 3) {
        refused.add(model);   // Codex refuses this model: the same run again with the next one, nothing said in the chat
        const next = imageModel();
        if (next && next !== model) {
          log(t('md.log.retry', { model, next }));
          try { run(L, { ...opts, tries: (opts.tries ?? 0) + 1 }); return; } catch (e) { job.failure = e.message; }
        }
        job.state = 'failed'; job.error = reason(job, stderr);
      } else { job.state = 'failed'; job.error = reason(job, stderr); }
    }
    log(t('md.log.end', { kind, state: job.state, s: Math.round((Date.now() - job.t0) / 1000), err: job.error ? ` : ${job.error}` : '' }));
    if (job.state === 'failed' && kind === 'chat') say(L, { role: 'error', text: job.error });
    if (job.state === 'stopped' && kind === 'chat') say(L, { role: 'info', text: t('md.chat.stopped') });
    if (s.sortAfter) { s.sortAfter = false; setTimeout(() => { try { sortInbox(L, { log }); } catch { /* nothing to sort */ } }, 200); }
  }
  return pub(job);
}
function kill(child) {
  if (!child?.pid) return;
  try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* gone */ }
  try { child.kill(); } catch { /* gone */ }
}
export function stopJob(L) {
  const s = slot(L);
  if (!s.job || s.job.state !== 'running') return { ok: false, why: t('md.err.noJob') };
  s.job.stopped = true; kill(s.child);
  return { ok: true };
}

// the images Codex made in this run: its thread's folder in $CODEX_HOME\generated_images (newest last)
function madeBy(job) {
  if (!job.thread) return [];
  const dir = path.join(codexHome(), 'generated_images', job.thread);
  let names = []; try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => path.join(dir, f))
    .map((f) => ({ f, m: fs.statSync(f).mtimeMs })).filter((x) => x.m >= job.t0 - 5000).sort((a, b) => a.m - b.m).map((x) => x.f);
}

// a message of the chat: the user's words, the images that go with them, then Codex at work
export function sendChat(L, { text, refs = [], transparent = false, project = null }, { log } = {}) {
  text = String(text ?? '').trim();
  if (!text) throw new Error(t('md.err.empty'));
  if (busy(L)) throw new Error(t('md.err.busy'));
  const av = chatAvailable(); if (!av.ok) throw new Error(av.why);
  const items = listMedias(L), byId = (id) => items.find((it) => it.id === id);
  const chat = readChat(L);
  let picked = [...new Set(refs)].map(byId).filter(Boolean).slice(0, 8), auto = false;
  if (!picked.length) {   // a follow-up: the images of the last answer
    const last = [...chat.messages].reverse().find((m) => m.role === 'agent' && m.images?.length);
    if (last) { picked = last.images.map(byId).filter(Boolean).slice(0, 4); auto = picked.length > 0; }
  }
  const history = chat.messages.filter((m) => m.role === 'user' || m.role === 'agent').slice(-10);
  say(L, { role: 'user', text, refs: auto ? [] : picked.map((it) => it.id), transparent: !!transparent });
  const prompt = chatPrompt(L, { text, refs: picked, auto, transparent, project, items, history });
  return run(L, { kind: 'chat', prompt, images: picked.map((it) => mediaFile(L, it)), schema: CHAT_SCHEMA, timeoutMs: 15 * 60000, log,
    onDone: async (res, job) => {
      const files = madeBy(job), used = new Set(), out = [];
      const entries = Array.isArray(res.images) ? res.images : [];
      const take = (e) => {   // by its file name, else the next image not taken yet
        const name = path.basename(String(e?.fichier ?? '')).toLowerCase();
        let f = files.find((x) => !used.has(x) && path.basename(x).toLowerCase() === name);
        f ??= files.find((x) => !used.has(x));
        if (f) used.add(f);
        return f;
      };
      for (const e of entries) {
        const f = take(e); if (!f) continue;
        const parent = Number.isInteger(e.retouche_de) && e.retouche_de > 0 ? picked[e.retouche_de - 1]?.id ?? null : null;
        out.push(addMedia(L, f, { nom: e.nom, categorie: CATEGORIES.includes(e.categorie) ? e.categorie : 'divers', tags: e.tags, description: e.description,
          transparent: e.transparent, prompt: text, source: 'chat', parent, session: job.thread }));
      }
      if (!entries.length) for (const f of files) out.push(addMedia(L, f, { nom: t('md.chat.untitled'), categorie: 'divers', prompt: text, source: 'chat', session: job.thread }));
      say(L, { role: 'agent', text: String(res.message ?? '').trim() || t(out.length ? 'md.chat.made' : 'md.chat.nothing', { n: out.length }), images: out.map((it) => it.id) });
      if (entries.length && !out.length) throw new Error(t('md.err.noImage'));
    } });
}

// the agent sorts « à ranger »: up to 8 images per run, looked at by Codex, named, given a category, tags, a description
export function sortInbox(L, { log, ids = null } = {}) {
  if (busy(L)) { slot(L).sortAfter = true; return { ok: true, queued: true }; }
  const av = chatAvailable(); if (!av.ok) throw new Error(av.why);
  const all = listMedias(L);
  const items = (ids ? all.filter((it) => ids.includes(it.id)) : all.filter((it) => it.categorie === INBOX)).slice(0, 8);
  if (!items.length) return { ok: false, why: t('md.err.nothingToSort') };
  const job = run(L, { kind: 'sort', prompt: sortPrompt(L, items), images: items.map((it) => mediaFile(L, it)), schema: SORT_SCHEMA, timeoutMs: 6 * 60000, log,
    onDone: async (res) => {
      for (const e of Array.isArray(res.images) ? res.images : []) {
        const it = items[(e.index ?? 0) - 1]; if (!it) continue;
        updateMedia(L, it.id, { nom: e.nom, categorie: CATEGORIES.includes(e.categorie) ? e.categorie : 'divers', tags: e.tags, description: e.description, transparent: e.transparent, trie: 'agent' });
      }
      if (all.filter((it) => it.categorie === INBOX).length > items.length) slot(L).sortAfter = true;   // the next 8
    } });
  return { ok: true, job };
}
// a new image dropped in « à ranger » is sorted by the agent, unless the user turned it off (settings.json mediasAutoSort: false)
export const autoSort = () => readSettings().mediasAutoSort !== false && chatAvailable().ok;
