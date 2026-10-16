// The history of a project's files (user request, 16/10/2026, from HyperFrames Studio's edit history: « mets tout,
// check comment bien le marier à l'interface »). Every change of the project's text sources is kept as it happens, by
// whoever made it — the agent working on a batch, the user in an editor, a restore of the history itself — with what
// the file was before and after; each can be looked at (its lines changed) and the project brought back to any point.
// Nothing depends on the agent (the batches' own undo, lib/runs.mjs, needs its « snapshot » before it edits).
//   - the files: the project's code (a Remotion project's src/, a HyperFrames project, a run's folder), text only
//     (.tsx .ts .js .json .html .css .md …, 2 Mo at most), never node_modules, .git, renders, revue, caches;
//   - the store: <DATA>/historique/<the project's folders>/ (outside the project: nothing is written into it but what the
//     user restores): journal.jsonl (one change a line), state.json (each file's content as last seen), blobs/ (the
//     contents, compressed, each kept once). Two studios on the same code (two episodes of Brambleshire) share it;
//   - when the studio opens, what changed while it was closed is recorded too (« hors du studio »).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { t } from './i18n.mjs';

export const TEXT = /\.(tsx?|jsx?|mjs|cjs|json|jsonc|html?|css|scss|less|md|mdx|txt|glsl|frag|vert|wgsl|ya?ml|toml|srt|vtt|csv|svg|xml|py|sh|ps1|env)$/i;
export const SKIP = /(^|[\\/])(node_modules|\.git|\.cache|\.next|\.turbo|\.vite|revue|renders?|out|dist|build|coverage|tmp|temp|__pycache__)([\\/]|$)/i;
const MAX = 2 << 20, MAX_FILES = 8000, MAX_ENTRIES = 30000;
const hash = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const nowIso = () => new Date().toISOString();

// the folders of a project to keep the history of ({ id, dir }), the ones inside another left out
export function historyRoots(P) {
  const out = [];
  const add = (id, dir) => { if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) out.push({ id, dir: path.resolve(dir) }); };
  if (P.kind === 'brambleshire') add('src', P.remotionDir && path.join(P.remotionDir, 'src'));
  else if (P.kind === 'remotion') { add('src', P.remotionDir && path.join(P.remotionDir, 'src')); add('projet', P.EP); }
  else if (P.kind === 'hyperframes') add('projet', P.hf?.projet);
  else if (P.kind === 'run' || P.kind === 'aitelier') add('projet', P.EP);
  const low = (d) => d.toLowerCase() + path.sep;
  return out.filter((r, i) => !out.some((o, j) => j !== i && low(r.dir).startsWith(low(o.dir)) && (low(r.dir) !== low(o.dir) || j < i)));
}
export const historyKey = (roots) => hash(roots.map((r) => r.dir.toLowerCase()).sort().join('|')).slice(0, 12);

// Myers' diff of two lists of lines: [[' '|'-'|'+', line]], or null when they differ too much to align (3000 steps)
function myers(X, Y) {
  const N = X.length, M = Y.length, max = N + M, off = max + 1;
  const v = new Int32Array(2 * max + 3), trace = [];
  let D = -1;
  outer: for (let d = 0; d <= max; d++) {
    if (d > 3000) return null;
    trace.push(v.slice(off - d - 1, off + d + 2));   // v before step d, for k in [−d−1, d+1]
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1, y = x - k;
      while (x < N && y < M && X[x] === Y[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= N && y >= M) { D = d; break outer; }
    }
  }
  const ops = []; let x = N, y = M;
  for (let d = D; d >= 0; d--) {
    const t = trace[d], at = (k) => t[k + d + 1], k = x - y;
    const pk = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1, px = at(pk), py = px - pk;
    while (x > px && y > py) { ops.push([' ', X[--x]]); y--; }
    if (d > 0) { if (x === px) ops.push(['+', Y[--y]]); else ops.push(['-', X[--x]]); }
  }
  return ops.reverse();
}
// the lines of two texts (null: no file): the changed ones with ctx lines around, in hunks
// ({ a, b: the first line's number in each, lines: [[' '|'-'|'+', text]] }), and how many lines came and went
export function diffLines(A, B, ctx = 3) {
  const a = A === null || A === undefined ? [] : String(A).split(/\r?\n/), b = B === null || B === undefined ? [] : String(B).split(/\r?\n/);
  // the common start and end first (most changes are small), Myers on what is left
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const x = a.slice(s, a.length - e), y = b.slice(s, b.length - e);
  const mid = myers(x, y) ?? [...x.map((l) => ['-', l]), ...y.map((l) => ['+', l])];
  const all = [...a.slice(0, s).map((l) => [' ', l]), ...mid, ...a.slice(a.length - e).map((l) => [' ', l])];
  const pa = [], pb = []; let ai = 1, bi = 1, add = 0, del = 0;
  for (const [op] of all) { pa.push(ai); pb.push(bi); if (op !== '+') ai++; if (op !== '-') bi++; if (op === '+') add++; if (op === '-') del++; }
  const ch = []; all.forEach((o, n) => { if (o[0] !== ' ') ch.push(n); });
  const hunks = [];
  for (let k = 0; k < ch.length; k++) {
    const s0 = Math.max(0, ch[k] - ctx); let e0 = Math.min(all.length - 1, ch[k] + ctx);
    while (k + 1 < ch.length && ch[k + 1] - ctx <= e0 + 1) { k++; e0 = Math.min(all.length - 1, ch[k] + ctx); }
    hunks.push({ a: pa[s0], b: pb[s0], lines: all.slice(s0, e0 + 1) });
  }
  return { hunks, add, del };
}

export function historyStore({ roots, dir, attribute = () => null, log = () => {} }) {
  const BLOBS = path.join(dir, 'blobs'), JOURNAL = path.join(dir, 'journal.jsonl'), STATE = path.join(dir, 'state.json'), LOCK = path.join(dir, 'lock');
  fs.mkdirSync(BLOBS, { recursive: true });
  const rootOf = (id) => roots.find((r) => r.id === id);
  const absOf = (key) => { const [id, ...rest] = key.split('/'); const r = rootOf(id); return r ? path.join(r.dir, ...rest) : null; };
  const keyOf = (r, abs) => `${r.id}/${path.relative(r.dir, abs).split(path.sep).join('/')}`;
  const blob = (h) => path.join(BLOBS, h.slice(0, 2), `${h}.gz`);
  const put = (buf) => { const h = hash(buf), f = blob(h); if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(buf)); } return h; };
  const get = (h) => (h ? zlib.gunzipSync(fs.readFileSync(blob(h))).toString('utf8') : null);
  const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return null; } };
  const writeState = (s) => { const tmp = `${STATE}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(s)); fs.renameSync(tmp, STATE); };
  // one writer at a time (two studios on the same code): a lock file, taken again if it is older than 10 s
  const locked = (fn) => {
    for (let i = 0; i < 50; i++) {
      try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); break; } catch {
        try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 10000) fs.rmSync(LOCK, { force: true }); } catch { /* */ }
        const until = Date.now() + 40; while (Date.now() < until) { /* a few ms */ }
      }
    }
    try { return fn(); } finally { try { fs.rmSync(LOCK, { force: true }); } catch { /* */ } }
  };
  let seq = 0;
  const newId = () => `${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, '0')}${process.pid.toString(36).slice(-2)}`;
  // a file as it is now: { h, buf } | null (gone) | undefined (not one we keep: too big, not text)
  const readNow = (abs) => {
    let st; try { st = fs.statSync(abs); } catch { return null; }
    if (!st.isFile() || st.size > MAX) return undefined;
    try { const buf = fs.readFileSync(abs); if (buf.includes(0)) return undefined; return { h: hash(buf), buf }; } catch { return undefined; }
  };
  // record what a file became, if it changed since it was last seen
  function record(key, { by = undefined, now = undefined } = {}) {
    const abs = absOf(key); if (!abs) return null;
    const cur = now === undefined ? readNow(abs) : now;
    if (cur === undefined) return null;
    return locked(() => {
      const state = readState() ?? { files: {} };
      const before = state.files[key] ?? null, after = cur?.h ?? null;
      if (before === after) return null;
      if (cur) put(cur.buf);
      const tb = before ? get(before) : null, ta = cur ? cur.buf.toString('utf8') : null;
      const { add, del } = diffLines(tb, ta, 0);
      const e = { id: newId(), at: nowIso(), file: key, kind: !before ? 'add' : !after ? 'delete' : 'edit', before, after, add, del, by: by === undefined ? attribute() : by };
      fs.appendFileSync(JOURNAL, JSON.stringify(e) + '\n');
      if (after) state.files[key] = after; else delete state.files[key];
      writeState(state);
      return e;
    });
  }
  // every file of the roots (text, not skipped), at most MAX_FILES
  function walk() {
    const out = [];
    for (const r of roots) {
      const stack = [r.dir];
      while (stack.length && out.length < MAX_FILES) {
        const d = stack.pop(); let ents = [];
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const en of ents) {
          const abs = path.join(d, en.name);
          if (SKIP.test(path.relative(r.dir, abs))) continue;
          if (en.isDirectory()) stack.push(abs);
          else if (en.isFile() && TEXT.test(en.name)) out.push(keyOf(r, abs));
        }
      }
    }
    return out;
  }
  // at the start: the first time, each file as it is (no change recorded); then what changed while the studio was closed
  function scan() {
    const t0 = Date.now(), keys = walk();
    const state = readState();
    if (!state) {
      locked(() => {
        const files = {};
        for (const k of keys) { const c = readNow(absOf(k)); if (c) { put(c.buf); files[k] = c.h; } }
        writeState({ files, since: nowIso() });
      });
      log(t('hist.followed', { n: keys.length, ms: Date.now() - t0 }));
      return 0;
    }
    // (the state read once: only the files that differ from it are recorded)
    let n = 0;
    const known = new Set(Object.keys(state.files)), by = { kind: 'outside' };
    for (const k of keys) {
      known.delete(k);
      const c = readNow(absOf(k));
      if (c && c.h !== state.files[k] && record(k, { by, now: c })) n++;
    }
    for (const k of known) if (rootOf(k.split('/')[0]) && !fs.existsSync(absOf(k)) && record(k, { by, now: null })) n++;   // gone while closed
    if (n) log(t('hist.outside', { n }));
    prune();
    return n;
  }
  // the journal kept to MAX_ENTRIES (the oldest go, then the contents nothing refers to)
  function prune() {
    let st; try { st = fs.statSync(JOURNAL); } catch { return; }
    if (st.size < 4e6) return;
    locked(() => {
      const all = fs.readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean);
      if (all.length <= MAX_ENTRIES) return;
      const keep = all.slice(all.length - Math.floor(MAX_ENTRIES * 0.8));
      fs.writeFileSync(JOURNAL, keep.join('\n') + '\n');
      const used = new Set(Object.values(readState()?.files ?? {}));
      for (const l of keep) { try { const e = JSON.parse(l); if (e.before) used.add(e.before); if (e.after) used.add(e.after); } catch { /* */ } }
      for (const d of fs.readdirSync(BLOBS)) for (const f of fs.readdirSync(path.join(BLOBS, d))) if (!used.has(f.replace(/\.gz$/, ''))) fs.rmSync(path.join(BLOBS, d, f), { force: true });
    });
  }
  // the changes as they come: one watch per root; a file saved several times in a row is read once it is quiet
  const timers = new Map(), watchers = [];
  function watch(onChange = () => {}) {
    for (const r of roots) {
      try {
        watchers.push(fs.watch(r.dir, { recursive: true }, (_ev, f) => {
          if (!f || SKIP.test(f) || !TEXT.test(f)) return;
          const key = `${r.id}/${f.split(path.sep).join('/')}`;
          clearTimeout(timers.get(key));
          timers.set(key, setTimeout(() => { timers.delete(key); try { const e = record(key); if (e) onChange(e); } catch (err) { log(t('srv.histFail', { msg: err.message })); } }, 400));
        }));
      } catch (e) { log(t('srv.histFail', { msg: `${r.dir} — ${e.message}` })); }
    }
  }
  const stop = () => { for (const w of watchers) try { w.close(); } catch { /* */ } watchers.length = 0; };
  function entries() {
    try { return fs.readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
  }
  // the newest first, at most limit (before: the ones older than that id)
  function list({ limit = 400, before = null } = {}) {
    let all = entries();
    if (before) { const i = all.findIndex((e) => e.id === before); if (i >= 0) all = all.slice(0, i); }
    const state = readState();
    return { entries: all.slice(-limit).reverse(), total: all.length, since: state?.since ?? null, roots: roots.map((r) => ({ id: r.id, dir: r.dir })), files: Object.keys(state?.files ?? {}).length };
  }
  function diff(id) {
    const e = entries().find((x) => x.id === id); if (!e) return null;
    const a = get(e.before), b = get(e.after), cur = readNow(absOf(e.file));
    return { ...e, abs: absOf(e.file), ...diffLines(a, b), now: cur === null ? 'gone' : cur?.h === e.after ? 'same' : 'changed' };
  }
  // bring files back: to how they were right after the change id (to: 'after'), or just before it (to: 'before');
  // scope 'file': that file only; 'all': every file changed since, as it was at that moment. Each restore is a change
  // of its own (by: restore), so it can be undone the same way.
  function restore(id, { to = 'after', scope = 'all' } = {}) {
    const all = entries(), i = all.findIndex((x) => x.id === id); if (i < 0) throw new Error(t('hist.noChange'));
    const e = all[i], cut = to === 'after' ? i + 1 : i;   // the moment: after the change (or before it)
    const files = scope === 'file' ? [e.file] : [...new Set(all.slice(cut).map((x) => x.file))];
    const by = { kind: 'restore', of: id, to, scope }, done = [];
    for (const f of files) {
      // the file at that moment: the last change of it before the cut, else what its first change after found
      let at; for (let k = cut - 1; k >= 0; k--) if (all[k].file === f) { at = all[k].after; break; }
      if (at === undefined) at = all.slice(cut).find((x) => x.file === f)?.before ?? null;
      const abs = absOf(f); if (!abs) continue;
      const cur = readNow(abs);
      if ((cur?.h ?? null) === at) continue;
      if (at) { fs.mkdirSync(path.dirname(abs), { recursive: true }); const buf = zlib.gunzipSync(fs.readFileSync(blob(at))); fs.writeFileSync(abs, buf); record(f, { by, now: { h: at, buf } }); }
      else { fs.rmSync(abs, { force: true }); record(f, { by, now: null }); }
      done.push(f);
    }
    return { files: done };
  }
  return { roots, dir, scan, watch, stop, list, diff, restore, record, get };
}
