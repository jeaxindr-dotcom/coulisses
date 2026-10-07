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
const getJson = (url) => fetch(url, { headers: UA, signal: AbortSignal.timeout(7000) }).then((r) => { if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`); return r.json(); });
// the hash of every folder of a GitHub repository (one request per repository)
const repoTrees = (repo, fresh) => cached(`gh:${repo}`, fresh, async () => {
  const j = await getJson(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`);
  return Object.fromEntries((j.tree ?? []).filter((x) => x.type === 'tree' || /SKILL\.md$/.test(x.path)).map((x) => [x.path, x.sha]));
});
const has = (dir, name) => !!dir && fs.existsSync(path.join(dir, name, 'SKILL.md'));
// a folder's content, to compare two copies of a skill
function folderHash(dir) {
  const h = crypto.createHash('sha1');
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.isFile()) { h.update(path.relative(dir, f)); h.update(fs.readFileSync(f)); } } };
  try { walk(dir); return h.digest('hex'); } catch { return null; }
}

export async function checkUpdates(p, { agent, fresh = false } = {}) {
  const A = agent?.skills ? agent : AGENTS.claude, out = { at: nowIso(), agent: { id: A.id, name: A.name, skills: A.skills ?? null }, errors: [] };
  const episode = p.kind === 'brambleshire';
  // Remotion
  if (episode && p.remotionDir) {
    const installed = readJson(path.join(p.remotionDir, 'node_modules', 'remotion', 'package.json'), null)?.version ?? null;
    let latest = null;
    try { latest = await cached('npm:remotion', fresh, async () => (await getJson('https://registry.npmjs.org/remotion/latest')).version); } catch (e) { out.errors.push(`npm : ${e.message}`); }
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
    try { trees = await repoTrees(repo, fresh); } catch (e) { out.errors.push(`GitHub ${repo} : ${e.message}`); }
    for (const [name, s] of list) {
      if (!trees) { out.skills.unknown.push(name); continue; }
      const dir = (s.skillPath ?? '').replace(/\/?SKILL\.md$/, ''), sha = trees[dir];
      out.skills.checked++;
      if (!sha) out.skills.updates.push({ name, repo, why: 'retiré de sa source' });
      else if (sha !== s.skillFolderHash) out.skills.updates.push({ name, repo, why: 'nouvelle version' });
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
      try { const t = await repoTrees('remotion-dev/skills', fresh); out.remotionSkills.available = Object.keys(t).filter((k) => /^skills\/[^/]+\/SKILL\.md$/.test(k)).map((k) => k.split('/')[1]); } catch (e) { out.errors.push(`GitHub remotion-dev/skills : ${e.message}`); }
    }
  }
  out.todo = !!(out.remotion?.outdated || out.skills.updates.length || out.skills.stale.length || (out.projectSkill && (!out.projectSkill.present || out.projectSkill.sameAsReference === false)));
  return out;
}

// one line for the studio (the send window), and the section of the batch's request
export function updatesLine(u) {
  if (!u) return '';
  const parts = [];
  if (u.remotion?.outdated) parts.push(`Remotion ${u.remotion.latest} disponible (installé ${u.remotion.installed})`);
  if (u.skills.updates.length) parts.push(`${u.skills.updates.length} skill${u.skills.updates.length > 1 ? 's' : ''} à mettre à jour chez ${u.agent.name} (${u.skills.updates.map((s) => s.name).join(', ')})`);
  if (u.skills.stale?.length) parts.push(`${u.skills.stale.length} skill${u.skills.stale.length > 1 ? 's' : ''} dont la copie diffère chez ${u.agent.name} (${u.skills.stale.join(', ')})`);
  if (u.projectSkill && !u.projectSkill.present) parts.push(`le skill ${u.projectSkill.name} manque chez ${u.agent.name}`);
  if (u.projectSkill?.sameAsReference === false) parts.push(`le skill ${u.projectSkill.name} de ${u.agent.name} diffère de celui de Claude Code`);
  if (!parts.length) {
    const ok = [u.remotion?.latest ? `Remotion ${u.remotion.installed} à jour` : null, u.skills.checked ? `${u.skills.checked} skills à jour` : null].filter(Boolean);
    return u.errors.length && !ok.length ? 'Mises à jour : vérification impossible (hors ligne ?)' : `Mises à jour : tout est à jour${ok.length ? ` (${ok.join(', ')})` : ''}.`;
  }
  return `Mises à jour : ${parts.join(' · ')}. L'agent te les proposera avant de corriger.`;
}
export function updatesMarkdown(u, { cli, target }) {
  if (!u) return [];
  const o = ['## Mises à jour (vérifiées à l\'envoi)'];
  if (u.remotion) o.push(`- Remotion : installé ${u.remotion.installed ?? '?'}, dernier ${u.remotion.latest ?? '? (npm injoignable)'}${u.remotion.outdated ? ' → **mise à jour disponible**' : ' → à jour'}.`);
  o.push(`- Skills de l'agent (${u.agent.name}, installés par l'outil skills) : ${u.skills.checked} vérifiés${u.skills.updates.length ? `, **${u.skills.updates.length} à mettre à jour** : ${u.skills.updates.map((s) => `\`${s.name}\` (${s.repo}, ${s.why})`).join(', ')}` : ', tous à jour'}${u.skills.unknown.length ? ` ; non vérifiés (hors ligne) : ${u.skills.unknown.join(', ')}` : ''}.`);
  if (u.skills.stale?.length) o.push(`- Copies différentes dans le dossier de ${u.agent.name} (différentes de celles que l'outil skills a installées dans "${SHARED}") : ${u.skills.stale.map((n) => `\`${n}\``).join(', ')}.`);
  if (u.projectSkill) o.push(`- Skill du projet \`${u.projectSkill.name}\` chez ${u.agent.name} : ${!u.projectSkill.present ? `**absent** (la référence est "${u.projectSkill.reference}")` : u.projectSkill.sameAsReference === false ? `**différent** de celui de Claude Code ("${u.projectSkill.reference}")` : 'présent'}.`);
  if (u.remotionSkills && !u.remotionSkills.installed) o.push(`- Skills officiels de Remotion (remotion-dev/skills${u.remotionSkills.available?.length ? ` : ${u.remotionSkills.available.join(', ')}` : ''}) : non installés (suggestion à faire une fois à l'utilisateur : \`npx skills add remotion-dev/skills -g\`, dont remotion-upgrade pour les montées de version).`);
  if (u.errors.length) o.push(`- Vérification incomplète : ${u.errors.join(' ; ')}.`);
  if (u.todo) {
    o.push('');
    o.push('**Avant de corriger** : signaler ces mises à jour à l\'utilisateur et les lui proposer en QCM, avec une option recommandée (maintenant / après ce lot / plus tard). **Ne rien mettre à jour sans son accord.**');
    if (u.remotion?.outdated) o.push('- Remotion : toutes les dépendances `remotion` et `@remotion/*` passent ensemble à la même version exacte (`npx remotion upgrade` dans le projet Remotion). Jamais pendant un rendu. Ensuite, lancer les trois tests de non-régression : un épisode déjà livré doit rester identique.');
    if (u.skills.updates.length) o.push(`- Skills : \`npx skills update -g ${u.skills.updates.map((s) => s.name).join(' ')}\` (l'outil skills), puis relire ce qui a changé s'il s'agit d'un skill utilisé ici.`);
    if (u.skills.stale?.length) o.push(`- Copies différentes (une mise à jour qui n'a pas atteint ce dossier, ou une retouche locale : regarder avant) : recopier chaque skill depuis "${SHARED}" vers le dossier de ${u.agent.name}, par exemple \`robocopy "${SHARED}\\${u.skills.stale[0]}" "${u.agent.skills}\\${u.skills.stale[0]}" /MIR\`.`);
    if (u.projectSkill && (!u.projectSkill.present || u.projectSkill.sameAsReference === false)) o.push(`- Skill du projet : copier le dossier de référence "${u.projectSkill.reference}" dans les skills de ${u.agent.name}, si l'utilisateur le veut.`);
  }
  o.push(`- Pour revérifier : \`${cli} updates ${target}\`.`);
  return o;
}
