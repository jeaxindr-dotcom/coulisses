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

const LOCK = path.join(os.homedir(), '.agents', '.skill-lock.json');
// where the `skills` tool keeps its own copy of every global skill (then copied into each agent's folder)
const SHARED = path.join(os.homedir(), '.agents', 'skills');
const MEMO = path.join(CACHE, 'updates.json'), TTL = 6 * 3600e3;
const UA = { 'User-Agent': 'brambleshire-studio' };

async function cached(key, fresh, get) {
  const m = readJson(MEMO, {});
  if (!fresh && m[key] && Date.now() - Date.parse(m[key].at) < TTL) return m[key].v;
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
