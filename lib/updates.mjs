// What may need updating on the agent's side, checked every time a batch (or a render request) is sent from the studio
// (user request: « une vérif des mises à jour de Remotion et des skills chez l'agent quand j'envoie le message »):
//   - Remotion: the version installed in the Remotion project against the latest on npm (an episode only);
//   - the agent's skills installed by the `skills` tool (~/.agents/.skill-lock.json: GitHub source + hash of each
//     skill's folder) against the same folder on GitHub;
//   - the project's skill (brambleshire-theatre) in the agent's own skills folder: present, and the same as Claude's;
//   - Remotion's official skills (remotion-dev/skills, with remotion-upgrade): installed or not.
// Nothing is updated here: the result goes into the batch, and the agent proposes the updates to the user, who decides.
// Network answers are kept 6 h (CACHE/updates.json); offline, the local part is still given.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson, writeJson, nowIso } from './episode.mjs';
import { CACHE } from './place.mjs';
import { AGENTS, skillDirsOf } from './agent.mjs';
import { t, lang, tr } from './i18n.mjs';
import { spawn } from 'node:child_process';
import { hfInstalls, hfLatest, cmpVersion } from './hyperframes.mjs';

const LOCK = path.join(os.homedir(), '.agents', '.skill-lock.json');
// where the `skills` tool keeps its own copy of every global skill (then copied into each agent's folder)
const SHARED = path.join(os.homedir(), '.agents', 'skills');
const MEMO = path.join(CACHE, 'updates.json'), TTL = 6 * 3600e3;
const UA = { 'User-Agent': 'brambleshire-studio' };

async function cached(key, fresh, get, ttl = TTL) {
  const m = readJson(MEMO, {});
  if (!fresh && m[key] && Date.now() - Date.parse(m[key].at) < ttl) return m[key].v;
  const v = await get();
  const m2 = readJson(MEMO, {}); m2[key] = { at: nowIso(), v }; writeJson(MEMO, m2);
  return v;
}
const getJson = (url) => fetch(url, { headers: UA, signal: AbortSignal.timeout(7000) }).then((r) => { if (!r.ok) throw new Error(t('upd.http', { url, status: r.status })); return r.json(); });
// the hash of every folder of a GitHub repository (one request per repository)
const repoTrees = (repo, fresh) => cached(`gh:${repo}`, fresh, async () => {
  const j = await getJson(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`);
  return Object.fromEntries((j.tree ?? []).filter((x) => x.type === 'tree' || /SKILL\.md$/.test(x.path)).map((x) => [x.path, x.sha]));
});
const has = (dir, name) => !!dir && fs.existsSync(path.join(dir, name, 'SKILL.md'));
// a signature of a skill's folder, to compare two copies of it: every file's path and size, plus the full SKILL.md.
// Not the content of every file: reading the ~1 200 files of the skills twice took 11 s on each send (07/10/2026,
// the files being scanned on open); the sizes take 0.5 s and catch an older copy (a changed file rarely keeps its size).
function folderHash(dir) {
  const h = crypto.createHash('sha1');
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.isFile()) h.update(`${path.relative(dir, f)}:${fs.statSync(f).size};`); } };
  try { walk(dir); h.update(fs.readFileSync(path.join(dir, 'SKILL.md'))); return h.digest('hex'); } catch { return null; }
}

export async function checkUpdates(p, { agent, fresh = false } = {}) {
  const A = agent?.skills ? agent : AGENTS.claude, out = { at: nowIso(), agent: { id: A.id, name: A.name, skills: A.skills ?? null }, errors: [] };
  const episode = p.kind === 'brambleshire';
  // Remotion
  if (episode && p.remotionDir) {
    const installed = readJson(path.join(p.remotionDir, 'node_modules', 'remotion', 'package.json'), null)?.version ?? null;
    let latest = null;
    try { latest = await cached('npm:remotion', fresh, async () => (await getJson('https://registry.npmjs.org/remotion/latest')).version); } catch (e) { out.errors.push(t('upd.err.npm', { msg: e.message })); }
    const v3 = (v) => String(v ?? '0').split('.').map((x) => +x || 0);
    const newer = (a, b) => { const x = v3(a), y = v3(b); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); return false; };
    out.remotion = { installed, latest, outdated: !!(latest && installed && newer(latest, installed)) };
  }
  // the agent's skills installed by the `skills` tool
  const lock = readJson(LOCK, null)?.skills ?? {};
  const dirs = skillDirsOf(A), hasAny = (name) => dirs.some((d) => has(d, name));
  const mine = Object.entries(lock).filter(([name]) => hasAny(name));
  const byRepo = new Map(); for (const [name, s] of mine) if (s.sourceType === 'github' && s.source) (byRepo.get(s.source) ?? byRepo.set(s.source, []).get(s.source)).push([name, s]);
  out.skills = { checked: 0, updates: [], unknown: [], stale: [] };
  // the agent's own copy of a skill that differs from the one the `skills` tool just installed: an update that did not
  // reach this agent's folder (seen on 2026-10-07: Codex kept the 29/09 hyperframes-animation in ~/.codex/skills)
  if (A.skills && path.resolve(A.skills) !== path.resolve(SHARED)) for (const [name] of mine) {
    if (has(A.skills, name) && has(SHARED, name) && folderHash(path.join(A.skills, name)) !== folderHash(path.join(SHARED, name))) out.skills.stale.push(name);
  }
  for (const [repo, list] of byRepo) {
    let trees = null;
    try { trees = await repoTrees(repo, fresh); } catch (e) { out.errors.push(t('upd.err.github', { repo, msg: e.message })); }
    for (const [name, s] of list) {
      if (!trees) { out.skills.unknown.push(name); continue; }
      const dir = (s.skillPath ?? '').replace(/\/?SKILL\.md$/, ''), sha = trees[dir];
      out.skills.checked++;
      if (!sha) out.skills.updates.push({ name, repo, why: 'removed' });
      else if (sha !== s.skillFolderHash) out.skills.updates.push({ name, repo, why: 'new' });
    }
  }
  // the project's own skill, in this agent's skills folder
  if (episode) {
    const name = 'brambleshire-theatre', ref = path.join(AGENTS.claude.skills, name);
    const at = dirs.find((d) => has(d, name)), here = at ? path.join(at, name) : null;
    out.projectSkill = { name, present: !!at, reference: ref };
    if (out.projectSkill.present && A.id !== 'claude' && fs.existsSync(ref)) out.projectSkill.sameAsReference = folderHash(here) === folderHash(ref);
    // Remotion's official skills
    out.remotionSkills = { installed: Object.values(lock).some((s) => s.source === 'remotion-dev/skills') || hasAny('remotion-best-practices') };
    if (!out.remotionSkills.installed) {
      try { const tree = await repoTrees('remotion-dev/skills', fresh); out.remotionSkills.available = Object.keys(tree).filter((k) => /^skills\/[^/]+\/SKILL\.md$/.test(k)).map((k) => k.split('/')[1]); } catch (e) { out.errors.push(t('upd.err.github', { repo: 'remotion-dev/skills', msg: e.message })); }
    }
  }
  out.todo = !!(out.remotion?.outdated || out.skills.updates.length || out.skills.stale.length || (out.projectSkill && (!out.projectSkill.present || out.projectSkill.sameAsReference === false)));
  return out;
}

// one line for the studio (the send window), and the section of the batch's request
export function updatesLine(u, l = lang()) {
  if (!u) return '';
  const T = tr(l), parts = [];
  if (u.remotion?.outdated) parts.push(T('upd.line.remotion', { latest: u.remotion.latest, installed: u.remotion.installed }));
  if (u.skills.updates.length) parts.push(T('upd.line.skills', { n: u.skills.updates.length, agent: u.agent.name, names: u.skills.updates.map((s) => s.name).join(', ') }));
  if (u.skills.stale?.length) parts.push(T('upd.line.stale', { n: u.skills.stale.length, agent: u.agent.name, names: u.skills.stale.join(', ') }));
  if (u.projectSkill && !u.projectSkill.present) parts.push(T('upd.line.missing', { name: u.projectSkill.name, agent: u.agent.name }));
  if (u.projectSkill?.sameAsReference === false) parts.push(T('upd.line.differs', { name: u.projectSkill.name, agent: u.agent.name }));
  if (!parts.length) {
    const ok = [u.remotion?.latest ? T('upd.line.remotionOk', { v: u.remotion.installed }) : null, u.skills.checked ? T('upd.line.skillsOk', { n: u.skills.checked }) : null].filter(Boolean);
    return u.errors.length && !ok.length ? T('upd.line.offline') : T('upd.line.allOk', { ok: ok.length ? ` (${ok.join(', ')})` : '' });
  }
  return T('upd.line.todo', { parts: parts.join(' · ') });
}
// the line of the send window is calm (not amber) only when everything was checked and is up to date
export function updatesOk(u) {
  if (!u) return false;
  const todo = u.remotion?.outdated || u.skills.updates.length || u.skills.stale?.length || (u.projectSkill && (!u.projectSkill.present || u.projectSkill.sameAsReference === false));
  return !todo && !(u.errors.length && !(u.remotion?.latest || u.skills.checked));
}
export function updatesMarkdown(u, { cli, target, l = lang() }) {
  if (!u) return [];
  const T = tr(l), why = (s) => (s.why === 'retiré de sa source' || s.why === 'removed' ? T('upd.why.removed') : s.why === 'nouvelle version' || s.why === 'new' ? T('upd.why.new') : s.why);
  const o = [T('upd.md.h2')];
  if (u.remotion) o.push(T('upd.md.remotion', { installed: u.remotion.installed ?? '?', latest: u.remotion.latest ?? T('upd.md.npmDown'), state: T(u.remotion.outdated ? 'upd.md.available' : 'upd.md.upToDate') }));
  o.push(T('upd.md.skills', { agent: u.agent.name, checked: u.skills.checked,
    updates: u.skills.updates.length ? T('upd.md.skillsTodo', { n: u.skills.updates.length, list: u.skills.updates.map((s) => `\`${s.name}\` (${s.repo}, ${why(s)})`).join(', ') }) : T('upd.md.skillsOk'),
    unknown: u.skills.unknown.length ? T('upd.md.skillsUnknown', { list: u.skills.unknown.join(', ') }) : '' }));
  if (u.skills.stale?.length) o.push(T('upd.md.stale', { agent: u.agent.name, shared: SHARED, list: u.skills.stale.map((n) => `\`${n}\``).join(', ') }));
  if (u.projectSkill) o.push(T('upd.md.project', { name: u.projectSkill.name, agent: u.agent.name,
    state: !u.projectSkill.present ? T('upd.md.projectMissing', { ref: u.projectSkill.reference }) : u.projectSkill.sameAsReference === false ? T('upd.md.projectDiffers', { ref: u.projectSkill.reference }) : T('upd.md.projectOk') }));
  if (u.remotionSkills && !u.remotionSkills.installed) o.push(T('upd.md.official', { avail: u.remotionSkills.available?.length ? T('upd.md.officialList', { list: u.remotionSkills.available.join(', ') }) : '' }));
  if (u.errors.length) o.push(T('upd.md.incomplete', { errors: u.errors.join(l === 'fr' ? ' ; ' : '; ') }));
  if (u.todo) {
    o.push('');
    o.push(T('upd.md.before'));
    if (u.remotion?.outdated) o.push(T('upd.md.howRemotion'));
    if (u.skills.updates.length) o.push(T('upd.md.howSkills', { names: u.skills.updates.map((s) => s.name).join(' ') }));
    if (u.skills.stale?.length) o.push(T('upd.md.howStale', { shared: SHARED, agent: u.agent.name, src: `${SHARED}\\${u.skills.stale[0]}`, dst: `${u.agent.skills}\\${u.skills.stale[0]}` }));
    if (u.projectSkill && (!u.projectSkill.present || u.projectSkill.sameAsReference === false)) o.push(T('upd.md.howProject', { ref: u.projectSkill.reference, agent: u.agent.name }));
  }
  o.push(T('upd.md.recheck', { cli, target }));
  return o;
}

// ---------- the home screen's « Mises à jour » (user request, 09/10/2026: « un bouton pour check automatiquement les mises
// à jour de Remotion (tous les skills et tout ce qui tourne autour), et pareil pour HyperFrames ») ----------
// Checked by itself once a day when the home screen opens (the answers kept 24 h), or now with the button. Updated only on
// the user's click: the skills of a family (`npx skills update -g -y <names>`), HyperFrames' CLI (the latest version
// fetched into npx's cache: the next new projects use it; a project keeps the version it pins). Remotion's packages are
// shown and never changed here: an episode or a run is updated with its channel's agent, who runs its tests after.
const DAY = 24 * 3600e3;
export const FAMILIES = { remotion: 'remotion-dev/skills', hyperframes: 'heygen-com/hyperframes' };
async function familySkills(repo, lock, fresh, errors) {
  const list = Object.entries(lock).filter(([, s]) => s.source === repo && s.sourceType === 'github');
  if (!list.length) return { repo, installed: 0, checked: 0, updates: [], all: [] };
  let trees = null;
  try { trees = await cached(`gh:${repo}`, fresh, async () => {
    const j = await getJson(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`);
    return Object.fromEntries((j.tree ?? []).filter((x) => x.type === 'tree' || /SKILL\.md$/.test(x.path)).map((x) => [x.path, x.sha]));
  }, DAY); } catch (e) { errors.push(t('upd.err.github', { repo, msg: e.message })); }
  const updates = [];
  if (trees) for (const [name, s] of list) {
    const dir = (s.skillPath ?? '').replace(/\/?SKILL\.md$/, ''), sha = trees[dir];
    if (!sha) updates.push({ name, why: 'removed' }); else if (sha !== s.skillFolderHash) updates.push({ name, why: 'new' });
  }
  return { repo, installed: list.length, checked: trees ? list.length : 0, updates, all: list.map(([n]) => n).sort() };
}
// remotionDirs: [{ label, dir }] — the Remotion projects the home screen knows (the Theatre, the runs, « Nouveau projet »)
export async function homeUpdates({ fresh = false, remotionDirs = [] } = {}) {
  const out = { at: nowIso(), errors: [] }, lock = readJson(LOCK, null)?.skills ?? {};
  let latest = null;
  try { latest = await cached('npm:remotion', fresh, async () => (await getJson('https://registry.npmjs.org/remotion/latest')).version, DAY); } catch (e) { out.errors.push(t('upd.err.npm', { msg: e.message })); }
  const seen = new Set(), projects = [];
  for (const { label, dir } of remotionDirs) {
    const key = String(dir ?? '').toLowerCase(); if (!dir || seen.has(key)) continue; seen.add(key);
    const installed = readJson(path.join(dir, 'node_modules', 'remotion', 'package.json'), null)?.version ?? null;
    if (installed) projects.push({ label, dir, installed, outdated: !!(latest && cmpVersion(latest, installed) > 0) });
  }
  out.remotion = { latest, projects, skills: await familySkills(FAMILIES.remotion, lock, fresh, out.errors) };
  const cli = hfInstalls()[0] ?? null;
  let hlatest = null;
  try { hlatest = await cached('npm:hyperframes', fresh, () => hfLatest(), DAY); } catch { /* offline */ }
  out.hyperframes = { installed: cli?.version ?? null, latest: hlatest, outdated: !!(cli && hlatest && cmpVersion(hlatest, cli.version) > 0), skills: await familySkills(FAMILIES.hyperframes, lock, fresh, out.errors) };
  out.count = out.remotion.projects.filter((p) => p.outdated).length + out.remotion.skills.updates.length + (out.hyperframes.outdated ? 1 : 0) + out.hyperframes.skills.updates.length;
  return out;
}
// one update at a time, on the user's click: { what: 'skills-remotion' | 'skills-hyperframes' | 'hf-cli', names? }
let upJob = null;
export const homeUpdateState = () => (upJob ? { what: upJob.what, state: upJob.state, log: upJob.log.slice(-14), started: upJob.started, ended: upJob.ended ?? null } : null);
export function runHomeUpdate(what, names = [], { log = () => {} } = {}) {
  if (upJob?.state === 'running') return homeUpdateState();
  const safe = names.filter((n) => /^[\w.-]+$/.test(n));
  // COULISSES_UPDATE_CMD: a stand-in program for the tests (it is given the command it would run)
  const alt = process.env.COULISSES_UPDATE_CMD;
  const line = what === 'hf-cli' ? 'npx --yes hyperframes@latest --version' : `npx --yes skills update -g -y ${safe.join(' ')}`;
  if (what !== 'hf-cli' && !safe.length) throw new Error(t('upd.home.nothing'));
  const [cmd, args] = alt ? [process.execPath, [alt, line]] : process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', line]] : ['sh', ['-c', line]];
  const j = upJob = { what, state: 'running', started: nowIso(), log: [`> ${line}`] };
  const c = spawn(cmd, args, { windowsHide: true, env: { ...process.env, HYPERFRAMES_NO_UPDATE_CHECK: '1' } });
  const take = (d) => { for (const l of String(d).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split(/\r?\n|\r/)) if (l.trim()) { j.log.push(l.trim().slice(0, 200)); if (j.log.length > 200) j.log.shift(); } };
  c.stdout.on('data', take); c.stderr.on('data', take);
  c.on('error', (e) => { j.state = 'failed'; j.log.push(e.message); j.ended = nowIso(); });
  c.on('close', (code) => { if (j.state !== 'running') return; j.state = code === 0 ? 'done' : 'failed'; j.ended = nowIso(); log(t('upd.home.log', { line, state: j.state })); });
  log(t('upd.home.log', { line, state: 'running' }));
  return homeUpdateState();
}
